#!/usr/bin/env python3
"""Private long synthetic P5 producer. No upload, public integration or capacity guarantee."""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import signal
import sys
import time
import traceback
import urllib.request
import uuid
sys.dont_write_bytecode = True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
calibration=load('long_calibration_helpers',ROOT/'development/vr180/p5-calibration-prototype/probe-calibration.py')
base=calibration.base;cloud=base.cloud;indexed=calibration.indexed
persistent=load('long_profile_helpers',ROOT/'tools/vr180/probe-persistent-storage.py')
streaming=load('long_streaming',HERE/'streaming.py')
long_oracle=load('long_oracle',HERE/'oracle.py')
evidence_bundle=load('long_evidence_bundle',HERE/'evidence-bundle.py')
PROFILES={
 'p5-5gb':{'targetPayloadBytes':5_000_000_000,'inputFileBytes':5_100_000_000,'outputFileBytes':5_200_000_000,
  'runnerFreeBytes':33_416_582_400,'generationSeconds':900,'conversionSeconds':900,'transferSeconds':600,'verificationSeconds':900,'producerSeconds':3600},
 'p5-10gb':{'targetPayloadBytes':10_000_000_000,'inputFileBytes':10_100_000_000,'outputFileBytes':10_200_000_000,
  'runnerFreeBytes':63_416_582_400,'generationSeconds':1500,'conversionSeconds':1500,'transferSeconds':900,'verificationSeconds':1500,'producerSeconds':5100}}
SCRIPT_PATH='development/vr180/p5-long-prototype/probe-long.py'
BUNDLE_SOURCE_PATH='development/vr180/p5-long-prototype/evidence-bundle.py'
WORKER_ROUTE='/development/vr180/p5-long-prototype/worker.mjs'
SOURCE_FILES=sorted(set(indexed.SOURCES+['development/vr180/p5-long-prototype/'+name for name in ['frame.mjs','profile.mjs','worker.mjs']]))


class ProducerInterrupted(BaseException):
    """Deliberately bypass the fixed oracle's ordinary-error collection."""


class ProducerSignals:
    CLEANUP_GRACE_SECONDS=30

    def __init__(self,report,*,clock=None,hard_exit=None,grace_seconds=None):
        self.report=report;self.clock=clock or time.monotonic;self.hard_exit=hard_exit or os._exit
        self.grace=self.CLEANUP_GRACE_SECONDS if grace_seconds is None else grace_seconds
        self.interruption=None;self.cleanup_phase=False;self.previous={};self.grace_deadline=None

    def install(self,seconds):
        for number in (signal.SIGALRM,signal.SIGTERM):
            self.previous[number]=signal.getsignal(number);signal.signal(number,self.handle)
        signal.alarm(seconds)

    def handle(self,number,_frame=None):
        now=self.clock()
        if self.interruption is not None:
            self.interruption['repeatedSignals']+=1
            if now>=self.grace_deadline:
                # No successful cleanup or complete evidence is claimed on this path.
                self.hard_exit(124)
            return
        name=signal.Signals(number).name
        self.grace_deadline=now+self.grace
        self.interruption={'signal':name,'repeatedSignals':0,'cleanupGraceSeconds':self.grace,
          'forcedExitCode':124,'forcedExitMayLeaveResourcesAndIncompleteEvidence':True}
        self.report['interruption']=self.interruption
        self.report.update(status='FAIL',mediaArtifactReady=False)
        self.report.setdefault('error','PRODUCER_INTERRUPTED:'+name)
        signal.alarm(self.grace)
        if not self.cleanup_phase:raise ProducerInterrupted('PRODUCER_INTERRUPTED:'+name)

    def begin_cleanup(self):
        # Keep the initial producer alarm, or the already armed grace alarm.
        # A first signal here latches FAIL but cannot skip the current owner cleanup.
        self.cleanup_phase=True

    @contextlib.contextmanager
    def bounded_stage(self, deadline, name):
        """Bound sync APIs without timeout arguments; never extend parent/grace."""
        if self.interruption is not None:raise ProducerInterrupted('PRODUCER_ALREADY_INTERRUPTED')
        cloud.require(signal.getsignal(signal.SIGALRM)==self.handle, 'STAGE_SIGNAL_OWNER_DIFFERS')
        now=time.monotonic();seconds,interval=signal.getitimer(signal.ITIMER_REAL)
        cloud.require(seconds>0 and interval==0 and deadline>now,'STAGE_DEADLINE_NOT_ARMED')
        parent_deadline=now+seconds
        self.report['boundedStage']={'name':name,'deadlineMonotonic':min(deadline,parent_deadline),
          'parentDeadlineNotExtended':True,'blockingApiTimeout':'SIGALRM then existing 30-second cleanup grace'}
        signal.setitimer(signal.ITIMER_REAL,min(deadline,parent_deadline)-now)
        try:yield
        finally:
            # SIGTERM and SIGALRM both set interruption and arm the same grace.
            # Restoring the old parent timer in that case would extend it.
            if self.interruption is None:
                left=parent_deadline-time.monotonic()
                if left<=0:self.handle(signal.SIGALRM)
                else:signal.setitimer(signal.ITIMER_REAL,left)

    def restore(self):
        signal.alarm(0)
        for number,handler in self.previous.items():signal.signal(number,handler)

PAGE=r"""profileId=>{
 const s=globalThis.__long={namespace:'v-'+crypto.randomUUID(),namespaceOwned:false,workerStarted:true,worker:null,
  phase:'starting',result:null,files:[],ownedMediaFiles:[],unhandledErrors:[],transfer:null};
 const w=s.worker=new Worker('/development/vr180/p5-long-prototype/worker.mjs',{type:'module'});
 w.onmessage=({data})=>{
  if(data.namespaceOwned)s.namespaceOwned=true;
  if(data.ownedMediaFile){if(s.ownedMediaFiles.length<2)s.ownedMediaFiles.push(data.ownedMediaFile);else s.protocolError=true;}
  if(data.phase)s.phase=data.phase;
  if(data.unhandledError&&s.unhandledErrors.length<8)s.unhandledErrors.push(data.unhandledError);
  if(data.result){s.files=data.result.files??[];s.result={...data.result,files:s.files.map(({file,...row})=>row),unhandledErrors:s.unhandledErrors};
   if(s.protocolError||s.unhandledErrors.length)s.result.status='FAIL';}
 };
 w.onerror=e=>{s.result={status:'FAIL',files:[],error:{message:e.message},workerError:true};};
 w.postMessage({namespace:s.namespace,profileId});
}"""
TRANSFER=r"""token=>{
 const s=globalThis.__long;s.transfer=null;s.transferAbort=new AbortController();
 const progress=s.transferProgress={status:'STARTED',startedMs:performance.now(),elapsedMs:0,files:[],
  phases:Object.fromEntries(['slice','fetch','ack','completeFetch','completeAck'].map(name=>[name,{count:0,failed:0,totalMs:0,maxMs:0}])),
  clock:'Browser performance.now; distinct from Python monotonic',wholeFileArrayBuffer:false,maxChunkBytes:1048576};
 const timed=async(phase,fn)=>{const start=performance.now();let ok=false;try{const value=await fn();ok=true;return value;}
  finally{const elapsed=performance.now()-start,row=progress.phases[phase];row.count++;row.failed+=Number(!ok);row.totalMs+=elapsed;row.maxMs=Math.max(row.maxMs,elapsed);progress.elapsedMs=performance.now()-progress.startedMs;}};
 (async()=>{const started=progress.startedMs,rows=progress.files;
  if(s.result?.status!=='READY_FOR_RUNNER_TRANSFER'||s.files.length!==2)throw Error('TRANSFER_NOT_READY');
  for(const item of s.files){const start=performance.now(),row={id:item.id,chunks:0,readBytes:0,acknowledgedBytes:0,complete:false,elapsedMs:0};rows.push(row);
   for(let offset=0;offset<item.bytes;offset+=1048576){
    const end=Math.min(item.bytes,offset+1048576),buffer=await timed('slice',()=>item.file.slice(offset,end).arrayBuffer());
    if(buffer.byteLength!==end-offset)throw Error('BROWSER_TRANSFER_SHORT_READ');
    row.readBytes=end;
    const response=await timed('fetch',()=>fetch('/transfer/'+token+'/'+item.id+'/chunk',{method:'POST',body:buffer,
     headers:{'X-Byte-Offset':String(offset),'Content-Type':'application/octet-stream'},signal:s.transferAbort.signal}));
    if(!response.ok)throw Error('RUNNER_CHUNK_REJECTED');const ack=await timed('ack',()=>response.json());
    if(ack.id!==item.id||ack.acceptedBytes!==end)throw Error('RUNNER_CHUNK_ACK_DIFFERS');row.chunks++;row.acknowledgedBytes=end;row.elapsedMs=performance.now()-start;
   }
   const response=await timed('completeFetch',()=>fetch('/transfer/'+token+'/'+item.id+'/complete',{method:'POST',body:new Uint8Array(),signal:s.transferAbort.signal}));
   if(!response.ok)throw Error('RUNNER_COMPLETE_REJECTED');const receipt=await timed('completeAck',()=>response.json());
   if(receipt.bytes!==item.bytes||receipt.sha256!==item.sha256||receipt.rereadSHA256!==item.sha256||!receipt.closed||!receipt.fsynced)
    throw Error('RUNNER_COMPLETE_ACK_DIFFERS');
   row.complete=true;row.elapsedMs=performance.now()-start;
  }
  progress.status='PASS';progress.elapsedMs=performance.now()-started;s.transfer={...progress};
 })().catch(e=>{progress.status='FAIL';progress.error=String(e);progress.elapsedMs=performance.now()-progress.startedMs;s.transfer={...progress};});
}"""
DOWNLOAD_URL=r"""entry=>{
 const s=globalThis.__long;if(s.downloadUrl)throw Error('DOWNLOAD_URL_ALREADY_ACTIVE');
 const item=s.files.find(value=>value.id===entry.id);
 if(s.result?.status!=='READY_FOR_RUNNER_TRANSFER'||!item||item.name!==entry.name||item.bytes!==entry.bytes||item.sha256!==entry.sha256||item.file.size!==entry.bytes)
  throw Error('DOWNLOAD_SOURCE_DIFFERS');
 s.downloadUrl=URL.createObjectURL(item.file);return {id:item.id,bytes:item.file.size};
}"""
DOWNLOAD_CLICK=r"""name=>{const s=globalThis.__long;if(!s.downloadUrl)throw Error('DOWNLOAD_URL_MISSING');
 const a=document.createElement('a');a.href=s.downloadUrl;a.download=name;a.click();}"""
DOWNLOAD_REVOKE=r"""()=>{const s=globalThis.__long;if(s?.downloadUrl){URL.revokeObjectURL(s.downloadUrl);s.downloadUrl=null;return {status:'REVOKED'};}return {status:'NOT_CREATED'};}"""


def download_to_receiver(page, receiver, owned, entries, deadline, signals, observation):
    """Private serial Blob downloads with the same receiver and absolute deadline."""
    observation.update(status='STARTED',files=[],singleNativeDownloadAtATime=True,
      maxPythonBufferBytes=streaming.CHUNK_BYTES,nativePeakMemoryMeasured=False,
      allStoppedBeforeBrowserClose=False,deadlineResetBetweenFiles=False)
    cloud.require(len(entries)==2 and [entry['id'] for entry in entries]==['input','output'],'DOWNLOAD_EXPECTED_PAIR')
    started=time.monotonic()
    with signals.bounded_stage(deadline,'browser-download'):
        for entry in entries:
            row_started=time.monotonic()
            remaining(deadline);row={'id':entry['id'],'status':'STARTED','stoppedBeforeBrowserClose':False,'downloadRequestTriggered':False,'cleanup':{}}
            observation['files'].append(row);download=None;path=None;identity=None;failure=None;events=[]
            def on_download(value):
                if len(events)<2:events.append(value)
                else:row['extraDownloadEvents']=True
            page.on('download',on_download)
            def cleanup(label,action):
                nonlocal failure
                cleanup_started=time.monotonic()
                try:row['cleanup'][label]=action()
                except (Exception,ProducerInterrupted) as error:
                    row['cleanup'][label]={'status':'HOLD','error':str(error)[:1000]}
                    if failure is None:failure=error
                finally:row['cleanup'][label]['elapsedSeconds']=time.monotonic()-cleanup_started
            try:
                row['diskPreflight']=owned.preflight(receiver.directory,entry['bytes'],deadline)
                page.evaluate(DOWNLOAD_URL,entry);remaining(deadline)
                event_started=time.monotonic()
                with page.expect_download(timeout=remaining(deadline)*1000) as event:
                    row['downloadRequestTriggered']=True
                    page.evaluate(DOWNLOAD_CLICK,entry['name'])
                download=event.value
                row['startEventWaitSeconds']=time.monotonic()-event_started
                cloud.require(len(events)==1 and events[0] is download and not row.get('extraDownloadEvents'),'DOWNLOAD_EVENT_COUNT')
                cloud.require(download.suggested_filename==entry['name'],'DOWNLOAD_SUGGESTED_NAME_DIFFERS')
                wait_started=time.monotonic();path=Path(download.path());remaining(deadline)
                terminal=download.failure();remaining(deadline)
                row['terminalFailure']=terminal;row['stoppedBeforeBrowserClose']=True
                cloud.require(terminal is None,'DOWNLOAD_NATIVE_FAILED')
                row['completionWaitSeconds']=time.monotonic()-wait_started
                identity=owned.admit(path,entry['bytes']);row['sourceIdentity']=dict(identity)
                row['copy']=owned.copy_to_receiver(path,identity,receiver,entry['id'],deadline)
                row['status']='PASS'
            except (Exception,ProducerInterrupted) as error:
                failure=error;row['status']='FAIL';row['error']=f'{type(error).__name__}: {error}'
            finally:
                if download is None and len(events)==1:download=events[0]
                if download is not None and not row['stoppedBeforeBrowserClose']:
                    cleanup('cancel',lambda:(download.cancel(),{'status':'REQUESTED'})[1])
                    def stop():
                        nonlocal path,identity
                        terminal=download.failure();row['terminalFailure']=terminal;row['stoppedBeforeBrowserClose']=True
                        if terminal is None:
                            path=Path(download.path());identity=owned.admit(path,entry['bytes']);row['sourceIdentity']=dict(identity)
                        return {'status':'STOPPED','failure':terminal}
                    cleanup('stop',stop)
                if download is not None and row['stoppedBeforeBrowserClose'] and identity is not None:
                    def delete():
                        owned.check_file(path,identity);download.delete();owned.require_absent(path)
                        return {'status':'DELETED','absent':True}
                    cleanup('delete',delete)
                elif download is None:
                    if not row['downloadRequestTriggered'] and not events:
                        row['stoppedBeforeBrowserClose']=True;row['cleanup']['stop']={'status':'NOT_STARTED'}
                    else:
                        row['cleanup']['stop']={'status':'HOLD','reason':'Download event/completion unverified'}
                        if failure is None:failure=RuntimeError('DOWNLOAD_STOP_UNVERIFIED')
                # A canceled artifact without a successful path is not adopted.
                # Only an empty owned directory can establish its removal.
                cleanup('url',lambda:page.evaluate(DOWNLOAD_REVOKE))
                cleanup('directoryEmpty',lambda:(owned.require_empty(),{'status':'EMPTY'})[1])
                cleanup('listener',lambda:(page.remove_listener('download',on_download),{'status':'REMOVED'})[1])
                row['downloadEventCount']=len(events)
                if len(events)>1 or row.get('extraDownloadEvents'):row['stoppedBeforeBrowserClose']=False
                if not row['stoppedBeforeBrowserClose'] and failure is None:failure=RuntimeError('DOWNLOAD_STOP_UNVERIFIED')
                if time.monotonic()>=deadline and failure is None:failure=TimeoutError('DOWNLOAD_STAGE_DEADLINE')
                row['elapsedSeconds']=time.monotonic()-row_started
                if failure is not None:row['status']='FAIL';observation['status']='FAIL'
                observation['elapsedSeconds']=time.monotonic()-started
                observation['allStoppedBeforeBrowserClose']=all(item['stoppedBeforeBrowserClose'] for item in observation['files'])
            if failure is not None:raise failure
        remaining(deadline);observation['allStoppedBeforeBrowserClose']=all(row['stoppedBeforeBrowserClose'] for row in observation['files'])
        observation['status']='PASS'
CLEANUP=r"""async()=>{
 const s=globalThis.__long;if(!s)return {status:'NOT_CREATED'};
 s.transferAbort?.abort();s.worker?.terminate();
 const need=(v,m)=>{if(!v)throw Error(m);};
 need(s.result&&!s.result.workerError,'WORKER_COMPLETION_UNVERIFIED');
 if(!s.namespaceOwned){need(!s.result.namespaceOwned&&s.result.error?.message!=='NAMESPACE_EXISTS'&&s.result.error?.name!=='TypeMismatchError','NAMESPACE_OWNERSHIP_UNKNOWN');return {status:'NOT_CREATED'};}
 need(s.result.ownerRecordsRemoved&&s.result.indexDirectoriesRemoved&&s.result.heldLocks===0&&s.result.indexReservedAfterCleanup===0
  &&!s.result.cleanupError&&!s.result.cleanupFailureObserved,'INDEX_CLEANUP_UNVERIFIED');
 const jobs=[s.namespace+'-gen',s.namespace+'-convert-in',s.namespace+'-convert-out'];
 const origin=await navigator.storage.getDirectory();
 async function leased(index){if(index<jobs.length)return navigator.locks.request('vr180:index-job:'+jobs[index],{mode:'exclusive',ifAvailable:true},async lock=>{
   need(lock,'JOB_STILL_ACTIVE');return leased(index+1);});
  const directory=await origin.getDirectoryHandle(s.namespace),seen=[];
  for await(const [name,entry]of directory.entries()){
   need(seen.length<2&&s.ownedMediaFiles.includes(name)&&['input.mp4','output.mp4'].includes(name)&&entry.kind==='file','UNKNOWN_NAMESPACE_ENTRY');seen.push(name);
  }
  need(seen.length===s.ownedMediaFiles.length&&new Set(seen).size===seen.length,'OWNED_MEDIA_ENTRY_DIFFERS');
  for(const name of seen)await directory.removeEntry(name);await origin.removeEntry(s.namespace);
 }
 await leased(0);s.files=[];
 try{await origin.getDirectoryHandle(s.namespace);throw Error('NAMESPACE_REMAINS');}catch(e){if(e.name!=='NotFoundError')throw e;}
 const held=(await navigator.locks.query()).held.filter(l=>l.name.includes(s.namespace));need(held.length===0,'CLEANUP_LEASE_REMAINS');
 return {status:'REMOVED',heldLocks:0,recursiveDeletion:false,knownMediaFiles:s.ownedMediaFiles};
}"""


def source_identity():
    value={'repository':os.environ.get('GITHUB_REPOSITORY',''),'commit':os.environ.get('GITHUB_SHA',''),
     'ref':os.environ.get('GITHUB_REF',''),'runId':os.environ.get('GITHUB_RUN_ID',''),
     'runAttempt':int(os.environ.get('GITHUB_RUN_ATTEMPT','0')),'job':os.environ.get('GITHUB_JOB','')}
    cloud.require(value['repository']=='Kushyameln01/kushyameln-works','LONG_REPOSITORY')
    for text,pattern in [(value['commit'],r'[0-9a-f]{40}'),(value['ref'],r'refs/heads/codex/vr180-plan-[A-Za-z0-9._/-]+'),
      (value['runId'],r'[1-9][0-9]{0,19}'),(value['job'],r'[A-Za-z0-9_-]{1,40}')]:cloud.require(re.fullmatch(pattern,text),'LONG_IDENTITY')
    cloud.require(1<=value['runAttempt']<=50,'LONG_ATTEMPT')
    return value


def remaining(deadline):
    value=deadline-time.monotonic()
    if value<=0:raise TimeoutError('LONG_STAGE_DEADLINE')
    return value


def packet_statistics(oracle,path,log_dir,deadline,frames,cap,input_side):
    runtime=oracle.Runtime(log_dir,remaining(deadline));scans={}
    try:
        label='stream-profile';proc=runtime.start(label,['ffprobe','-v','error','-show_streams','-show_entries',
         'stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,time_base','-of','json',str(path)])
        raw=oracle.read_chunk(proc.stdout,4097,runtime);cloud.require(len(raw)<=4096,'LONG_STREAM_METADATA_BOUND')
        runtime.finish(proc,label);streams=json.loads(raw)['streams']
        cloud.require(len(streams)==1 and streams[0]['codec_type']=='video' and streams[0]['codec_name']=='h264','LONG_EXPECTED_SILENT_AVC')
        stream=streams[0];cloud.require(stream.get('width')==1024 and stream.get('height')==512,'LONG_STREAM_DIMENSIONS')
        cloud.require(isinstance(stream.get('profile'),str) and len(stream['profile'])<=128 and type(stream.get('level')) is int,'LONG_ACTUAL_PROFILE_MISSING')
        summary=long_oracle.aggregate_packets(oracle.probe_records(path,'video-packets','packet',runtime,scans,'v:0'),stream['time_base'],
         max_payload_bytes=cap,expected_frames=frames,input_side=input_side)
        cloud.require(scans['video-packets']['endReached'],'LONG_PACKET_SCAN_INCOMPLETE')
        return {**summary,'actualStream':stream,'completeScan':True,'scans':scans,'stderrLogs':runtime.logs}
    finally:runtime.close()


def wait_native(page,profile,producer_deadline):
    phase='starting';deadline=min(producer_deadline,time.monotonic()+30)
    while True:
        try:page.wait_for_function('p=>globalThis.__long.result!==null||globalThis.__long.phase!==p',arg=phase,timeout=remaining(deadline)*1000)
        except Exception:
            page.evaluate('globalThis.__long.worker?.postMessage({action:"cancel"})')
            try:page.wait_for_function('globalThis.__long.result!==null',timeout=60000)
            except Exception:pass
            raise
        value=page.evaluate('({phase:globalThis.__long.phase,result:globalThis.__long.result})')
        if value['result'] is not None:return value['result']
        next_phase=value['phase'];cloud.require((phase,next_phase) in [('starting','generation'),('generation','conversion')],'LONG_PHASE_ORDER')
        phase=next_phase;deadline=min(producer_deadline,time.monotonic()+profile[phase+'Seconds']+30)


def browser_trial(playwright,owned,origin,profile_id,receiver,token,out,report,producer_deadline=None,signals=None):
    profile=PROFILES[profile_id];context=None;browser=None;sampler=calibration.ChromeRssSampler();page=None;deadline_error=None;downloads=None;download_cleanup_error=None
    if producer_deadline is None:producer_deadline=time.monotonic()+profile['producerSeconds']
    remaining(producer_deadline)
    report['runnerTransferMethod']='browser-download'
    report['browserDownload']={'status':'NOT_STARTED','files':[],'allStoppedBeforeBrowserClose':True}
    report['profileBeforeLaunch']=persistent.profile_snapshot(owned['path']);owned['browserClosed']=False
    try:
        downloads=streaming.OwnedDownloads(owned['container'].parent)
        report['ownedDownloads']={'path':str(downloads.path),'identity':list(downloads.identity)}
        started=time.monotonic();context=playwright.chromium.launch_persistent_context(user_data_dir=str(owned['path']),
          executable_path=str(cloud.CHROME),headless=True,chromium_sandbox=True,timeout=30000,
          accept_downloads=True,downloads_path=str(downloads.path))
        report['launchMs']=(time.monotonic()-started)*1000;browser=context.browser;cloud.require(browser is not None,'LONG_BROWSER_HANDLE_MISSING');report['browserVersion']=browser.version;sampler.start()
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
        page=context.new_page();page.set_default_timeout(30000)
        page.on('pageerror',lambda e:report['pageErrors'].append(str(e)) if len(report['pageErrors'])<8 else None)
        page.on('worker',lambda w:report['workers'].append(w.url) if len(report['workers'])<8 else None)
        page.goto(origin+'/',wait_until='networkidle');report['nativeStarted']=True;native_started=time.monotonic();page.evaluate(PAGE,profile_id)
        observed=wait_native(page,profile,producer_deadline);report['nativeElapsedSeconds']=time.monotonic()-native_started;report['observation']=observed;cloud.write(out/'browser-observations.json',observed)
        cloud.require(report['workers']==[origin+WORKER_ROUTE] and not report['pageErrors'],'LONG_WORKER_OR_PAGE_ERROR')
        if observed.get('status')=='BLOCKED':raise cloud.Blocked('LONG_NATIVE_BLOCKED:'+str(observed.get('error')))
        cloud.require(observed.get('status')=='READY_FOR_RUNNER_TRANSFER','LONG_NATIVE_NOT_READY:'+str(observed.get('error')))
        receiver.deadline=min(producer_deadline,time.monotonic()+profile['transferSeconds']);receiver.prepare(observed['files'])
        cloud.require(signals is not None,'LONG_DOWNLOAD_SIGNAL_OWNER_REQUIRED')
        download_to_receiver(page,receiver,downloads,observed['files'],receiver.deadline,signals,report['browserDownload'])
        transfer=report['browserDownload']
        cloud.require(transfer['status']=='PASS' and transfer['allStoppedBeforeBrowserClose'],'LONG_BROWSER_TRANSFER_FAILED')
        report['runnerTransfer']={'method':'browser-download','browser':transfer,'files':receiver.receipts()};cloud.write(out/'runner-transfer.json',report['runnerTransfer'])
        report['completeCloudMedia']=True
        return observed
    finally:
        active_error=sys.exc_info()[1]
        if isinstance(active_error,(ProducerInterrupted,cloud.Deadline)):deadline_error=active_error
        report['runnerTransferObservation']={'method':'browser-download','download':report['browserDownload'],'browser':None,'server':None}
        try:
            report['runnerTransferObservation']['server']=receiver.observation() if hasattr(receiver,'observation') else None
        except (Exception,ProducerInterrupted) as e:
            report['runnerTransferServerObservationError']=str(e)[:1000]
            if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
        report['downloadsStoppedBeforeBrowserClose']=report['browserDownload']['allStoppedBeforeBrowserClose']
        if page:
            try:
                report['runnerTransferObservation']['browser']=page.evaluate('({result:globalThis.__long?.transfer??null,progress:globalThis.__long?.transferProgress??null})')
            except (Exception,ProducerInterrupted) as e:
                report['runnerTransferObservationError']=str(e)[:1000]
                if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
            if not report['downloadsStoppedBeforeBrowserClose']:
                report['namespaceCleanup']={'status':'HOLD','reason':'Native download completion/stop before browser close not fully verified.'}
                owned['unknownContent']=True
            else:
                try:report['namespaceCleanup']=page.evaluate(CLEANUP)
                except (Exception,ProducerInterrupted) as e:
                    report['namespaceCleanup']={'status':'HOLD','error':str(e)[:1000]};owned['unknownContent']=True
                    if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
        else:report['namespaceCleanup']={'status':'NOT_CREATED'}
        if context:
            try:report['profileBeforeClose']=persistent.profile_snapshot(owned['path'])
            except (Exception,ProducerInterrupted) as e:
                report['profileSnapshotError']=str(e)[:1000]
                if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
            try:
                context.close();cloud.require(browser is not None and not browser.is_connected(),'LONG_BROWSER_STILL_CONNECTED');owned['browserClosed']=True
            except (Exception,ProducerInterrupted) as e:
                report['browserCloseError']=str(e)[:1000]
                if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
        try:report['browserRss']=sampler.stop()
        except (Exception,ProducerInterrupted) as e:
            report['browserRss']={'status':'HOLD','error':str(e)[:1000]}
            if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
        if not owned['browserClosed']:
            report['profileCleanup']={'status':'HOLD','reason':'Browser closure unverified; owned profile retained.'}
        report['browserClosed']=owned['browserClosed']
        download_started=any(row.get('downloadRequestTriggered',False) for row in report['browserDownload']['files'])
        report['downloadLifecycleAfterBrowserClose']={'browserClosed':owned['browserClosed'],'noDownloadStarted':not download_started,
          'apiStopConfirmedBeforeClose':download_started and report['downloadsStoppedBeforeBrowserClose'],
          'scope':'Browser closure is recorded separately; it does not retroactively establish a download terminal API result.'}
        if downloads:
            try:report['downloadDirectoryAfterClose']={'status':'OBSERVED','remainingNames':downloads.names()}
            except (Exception,ProducerInterrupted) as e:
                report['downloadDirectoryAfterClose']={'status':'HOLD','error':str(e)[:1000]};download_cleanup_error=e
                if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
            if context is None or owned['browserClosed']:
                try:report['downloadDirectoryCleanup']=downloads.cleanup()
                except (Exception,ProducerInterrupted) as e:
                    report['downloadDirectoryCleanup']={'status':'HOLD','error':str(e)[:1000]}
                    if download_cleanup_error is None:download_cleanup_error=e
                    if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
            else:
                report['downloadDirectoryCleanup']={'status':'HOLD','reason':'Browser closure unverified; owned download directory retained.'}
                if download_cleanup_error is None:download_cleanup_error=RuntimeError('LONG_DOWNLOAD_DIRECTORY_CLEANUP_UNVERIFIED')
        if owned['browserClosed']:
            try:report['profileAfterClose']=persistent.profile_snapshot(owned['path'])
            except (Exception,ProducerInterrupted) as e:
                report['profileAfterCloseError']=str(e)[:1000]
                if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
            try:report['profileCleanup']=persistent.cleanup_owned_profile(owned)
            except (Exception,ProducerInterrupted) as e:
                report['profileCleanup']={'status':'HOLD','error':str(e)[:1000]}
                if isinstance(e,(ProducerInterrupted,cloud.Deadline)) and deadline_error is None:deadline_error=e
        try:cloud.write(out/'browser-lifecycle.json',{key:report.get(key) for key in ['launchMs','browserVersion','profileBeforeLaunch',
          'profileBeforeClose','profileAfterClose','namespaceCleanup','browserClosed','profileCleanup','browserRss',
          'runnerTransferMethod','ownedDownloads','browserDownload','downloadsStoppedBeforeBrowserClose',
          'downloadLifecycleAfterBrowserClose','downloadDirectoryAfterClose','downloadDirectoryCleanup',
          'runnerTransferObservation','runnerTransferObservationError','runnerTransferServerObservationError']})
        except (Exception,ProducerInterrupted) as e:
            if deadline_error is None:raise
            report['browserLifecycleWriteError']=str(e)[:1000]
        if deadline_error:raise deadline_error
        if download_cleanup_error is not None and active_error is None:raise download_cleanup_error
        remaining(producer_deadline)


def write_owned_publication(path,data,publications,deadline):
    remaining(deadline)
    with path.open('xb') as output:
        info=os.fstat(output.fileno());publications.append({'path':path,'identity':(info.st_dev,info.st_ino),'removed':False})
        cloud.require(output.write(data)==len(data),'LONG_MANIFEST_SHORT_WRITE');output.flush();os.fsync(output.fileno())
    remaining(deadline)


def cleanup_publications(publications):
    errors=[];removed=[]
    for row in publications:
        if row['removed']:continue
        try:
            info=row['path'].lstat()
            cloud.require(stat.S_ISREG(info.st_mode) and (info.st_dev,info.st_ino)==row['identity'],'PUBLICATION_OWNERSHIP_CHANGED')
            row['path'].unlink();row['removed']=True;removed.append(row['path'].name)
        except FileNotFoundError:
            row['removed']=True;removed.append(row['path'].name)
        except Exception as error:errors.append({'name':row['path'].name,'error':str(error)[:256]})
    return {'status':'HOLD' if errors else 'REMOVED','removed':removed,'errors':errors}


def write_transport_manifests(meta,media,identity,profile_id,files,frames,verdict,source_sha,*,deadline=float('inf'),publications=None,run_id=None):
    publications=[] if publications is None else publications
    try:
        return _write_transport_manifests(meta,media,identity,profile_id,files,frames,verdict,source_sha,
          deadline=deadline,publications=publications,run_id=run_id)
    except BaseException as error:
        # A failed owner must not prevent cleanup of the other publications or
        # replace the primary error. main may independently retry held owners.
        error.publicationCleanup=cleanup_publications(publications)
        if error.publicationCleanup['status']=='HOLD':error.add_note('Evidence publication cleanup HOLD; primary error preserved')
        raise


def _write_transport_manifests(meta,media,identity,profile_id,files,frames,verdict,source_sha,*,deadline,publications,run_id):
    remaining(deadline)
    cloud.require(verdict['completeScan'] and verdict['mediaVerdict'] in ['PASS','FAIL'],'LONG_COMPLETE_QUALITY_REQUIRED')
    profile=PROFILES[profile_id]
    expected_run=f"{identity['runId']}-{profile_id}-{identity['runAttempt']}"
    run_id=expected_run if run_id is None else run_id
    cloud.require(run_id==expected_run,'LONG_PRODUCER_RECORD_RUN_ID')
    cloud.require(type(frames) is int and 1<=frames<=100000,'LONG_PRODUCER_RECORD_FRAMES')
    references=evidence_bundle.collect_references(meta,deadline)
    provenance=next(row for row in references if row['path']=='source-provenance.json')
    producer={'schema':'vr180-p5-long-producer-record-v1','status':'FULL_MEDIA_AND_SCAN_COMPLETED',
      'identity':identity,'runId':run_id,'profile':profile_id,'frames':frames,'files':files,
      'completeScan':True,'mediaVerdict':verdict['mediaVerdict'],'sourceSHA256':source_sha,
      'sourceProvenance':provenance}
    producer_raw=(json.dumps(producer,indent=2,sort_keys=True)+'\n').encode()
    cloud.require(len(producer_raw)<=65536,'LONG_PRODUCER_RECORD_BOUND')
    write_owned_publication(meta/'producer-record.json',producer_raw,publications,deadline)
    references.append(evidence_bundle.descriptor('producer-record.json',producer_raw))
    references.sort(key=lambda row:row['path'])
    cloud.require(len(references)<=255,'QUALITY_REFERENCE_SET')
    quality={'schema':'vr180-p5-long-quality-evidence-v1','identity':identity,'profile':profile_id,'files':files,
      'sourceSHA256':source_sha,'mediaVerdict':verdict['mediaVerdict'],'completeScan':True,'evidence':references,
      'acceptance':verdict,'hostRecovery':'PENDING','independentHostValidation':'PENDING'}
    raw=(json.dumps(quality,indent=2,sort_keys=True)+'\n').encode();cloud.require(len(raw)<=65536,'QUALITY_MANIFEST_BOUND')
    for directory in [meta,media]:
        write_owned_publication(directory/'quality-evidence.json',raw,publications,deadline)
        cloud.require(evidence_bundle.read_raw(directory/'quality-evidence.json',deadline,65536)==raw,'LONG_QUALITY_REREAD_DIFFERS')
    bundle=evidence_bundle.create_bundle(meta,media/'producer-evidence.tar.gz',references,raw,publications,deadline)
    manifest={'schema':'vr180-segmented-source-v1','status':'GENERATED_AND_REREAD','identity':identity,'profile':profile_id,
      'partBytes':134217728,'totalBytes':sum(item['bytes'] for item in files),'files':files,'sourceSHA256':source_sha,
      'generator':{'algorithm':'vr180-long-xorshift32-sbs180-webcodecs-v1','seed':0x1802026,'width':1024,'height':512,
       'fps':30,'silent':True,'inputRequestedBitrate':32000000,'outputRequestedBitrate':32000000,
       'eventPeriodFrames':300,'eventFrameOffsets':[29,30,31],'maxFrames':100000,
       'targetPayloadBytes':profile['targetPayloadBytes'],'frames':frames},
      'qualityEvidence':{'name':'quality-evidence.json','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
       'status':verdict['mediaVerdict'],'completeScan':True},'evidenceBundle':bundle}
    manifest_raw=(json.dumps(manifest,indent=2,sort_keys=True)+'\n').encode()
    write_owned_publication(media/'source-manifest.json',manifest_raw,publications,deadline)
    cloud.require(evidence_bundle.read_raw(media/'source-manifest.json',deadline,65536)==manifest_raw,'LONG_SOURCE_MANIFEST_REREAD_DIFFERS')
    remaining(deadline);return manifest


def finish_run(out,meta,report,signals,*,owned,receiver,server,publications,started,producer_deadline):
    signals.begin_cleanup();revoked_after_interruption=False
    def invalidate_outputs():
        nonlocal revoked_after_interruption
        if publications:report['publicationCleanup']=cleanup_publications(publications)
        if receiver:
            try:report['incompleteMediaCleanup']=receiver.abort()
            except Exception as e:report['incompleteMediaCleanup']={'status':'HOLD','error':str(e)}
        revoked_after_interruption=signals.interruption is not None
    if owned and 'profileCleanup' not in report:
        try:report['profileCleanup']=persistent.cleanup_owned_profile(owned)
        except Exception as e:report['profileCleanup']={'status':'HOLD','error':str(e)[:1000]}
    if receiver:receiver.deadline=0
    if server:server.shutdown();server.server_close()
    if report['mediaArtifactReady'] and time.monotonic()>=producer_deadline:
        report.update(status='FAIL',mediaArtifactReady=False,error='LONG_PRODUCER_DEADLINE_DURING_FINAL_CLEANUP')
    if not report['mediaArtifactReady']:invalidate_outputs()
    report['elapsedSeconds']=time.monotonic()-started;report['diskAfter']={'freeBytes':shutil.disk_usage(out).free}
    cloud.write(meta/'run.json',report)
    if signals.interruption is not None and not revoked_after_interruption:
        invalidate_outputs();cloud.write(meta/'run.json',report)
    transported=cloud.emit_evidence(meta,report)
    if signals.interruption is not None and not revoked_after_interruption:
        # The first interruption may arrive while emission is already in progress.
        # Invalidate owned readiness files and identify that archive as nonfinal.
        invalidate_outputs();report['interruption']['evidenceEmissionInvalidated']=True
        cloud.write(meta/'run.json',report)
        print('VR180_LONG_INTERRUPTED '+json.dumps({'runId':report['runId'],'status':'FAIL',
          'mediaArtifactReady':False,'completeEvidence':False,'reason':'INTERRUPTED_DURING_EVIDENCE_EMISSION'}),flush=True)
        transported=False
    return transported


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bundle',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True);parser.add_argument('--profile',choices=PROFILES,required=True)
    parser.add_argument('--oracle-toolchain',type=Path,required=True);args=parser.parse_args(argv)
    out=args.output.resolve();cloud.require(not out.exists() and not out.is_relative_to(ROOT),'Use new output directory outside checkout')
    out.mkdir(parents=True);meta=out/'evidence';media=out/'media';meta.mkdir();media.mkdir();profile=PROFILES[args.profile]
    started=time.monotonic();producer_deadline=started+profile['producerSeconds'];server=None;receiver=None;owned=None;publications=[]
    report={'schema':'vr180-p5-long-trial-v1','runId':os.environ.get('GITHUB_RUN_ID','local')+'-'+args.profile+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'),
      'status':'BLOCKED','profile':args.profile,'contract':profile,'deadlineScope':'Media work and normal cleanup; failure cleanup/evidence may finish later but never becomes READY','prototypeOnly':True,'publicProfileChanged':False,
      'completeCloudMedia':False,'completeScan':False,'mediaArtifactReady':False,'hostArtifactRecovery':'PENDING',
      'independentHostValidation':'PENDING','pageErrors':[],'workers':[],
      'notVerified':['host full-media recovery/independent verification','real-camera media','60 fps','long AAC',
       'OS save dialog','VR playback','public integration','crash recovery','capacity reservation','storage survival after execution environment ends']}
    signals=ProducerSignals(report);signals.install(profile['producerSeconds'])
    try:
        report['oracleToolchain']=calibration.require_toolchain(args.oracle_toolchain,meta/'oracle-toolchain.json')
        oracle,report['oracleDependencies']=calibration.require_oracle_dependencies()
        identity=source_identity();report['identity']=identity
        temporary=Path(os.environ['RUNNER_TEMP']).resolve(strict=True);cloud.require(out.is_relative_to(temporary),'LONG_OUTPUT_REQUIRES_RUNNER_TEMP')
        report['diskPreflight']={'freeBytes':shutil.disk_usage(out).free,'requiredAdditionalBytes':profile['runnerFreeBytes'],'reservationGuaranteed':False}
        cloud.require(report['diskPreflight']['freeBytes']>=profile['runnerFreeBytes'],'LONG_RUNNER_DISK_LOW')
        source=cloud.source_check(meta,candidate=True);cloud.require(source['checkoutCommit']==identity['commit'],'LONG_CHECKOUT_IDENTITY')
        cloud.preflight(meta,defer_verification=True);bundle=args.bundle.resolve()
        cloud.require(bundle.is_file() and not args.bundle.is_symlink() and not bundle.is_relative_to(ROOT),'Use fixed combined fork outside checkout')
        build=json.loads((bundle.parent/'fork-build-result.json').read_text())
        cloud.require(build['status']=='PASS' and build['baseline']['status']=='PASS' and build['baseline']['comparison']['identical'],'LONG_REBUILD_GATE')
        cloud.require(build['variant']=='combined-input-output' and build['bundleSha256']==cloud.digest(bundle),'LONG_COMBINED_FORK_DIFFERS')
        cloud.require(any('src/media-source.ts' in patch['files'] for patch in build['patches']),'LONG_AWAITED_CLOSE_REQUIRED')
        for name,expected in build['runtimeFiles'].items():cloud.require(cloud.digest(ROOT/'development/vr180'/name)==expected,'LONG_RUNTIME_DIFFERS:'+name)
        cloud.require(build['controllerSha256']==cloud.digest(ROOT/'development/vr180/input-index-prototype/input-index.mjs')
          and build['presentationSha256']==cloud.digest(ROOT/'development/vr180/input-index-prototype/presentation-index.mjs')
          and build['publicInputParserSha256']==cloud.digest(ROOT/'docs/shared/vr180/mp4.mjs'),'LONG_CONTROLLER_SOURCE_DIFFERS')
        cloud.write(meta/'fork-build-result.json',build)
        evidence_sources=sorted(set(SOURCE_FILES+[SCRIPT_PATH,BUNDLE_SOURCE_PATH,'development/vr180/p5-long-prototype/streaming.py',
          'development/vr180/p5-long-prototype/oracle.py','development/vr180/p5-long-prototype/frame-provenance.json',
          'development/vr180/p5-calibration-prototype/probe-calibration.py','tools/vr180/probe-persistent-storage.py',
          'tools/vr180/probe-indexed-conversion.py','tools/vr180/probe-output-index.py','tools/vr180/cloud-validate.py',
          'tools/vr180/verify-conversion-large.py','tools/vr180/verify-metadata.py']))
        cloud.command(['git','ls-files','--error-unmatch',*evidence_sources]);hashes={name:cloud.digest(ROOT/name) for name in evidence_sources}
        for name in evidence_sources:cloud.require(not (ROOT/name).is_symlink(),'LONG_SOURCE_SYMLINK')
        content={'/':(base.HTML,'text/html'),'/fork.mjs':(bundle.read_bytes(),'text/javascript')}
        for name in SOURCE_FILES:content['/'+name]=((ROOT/name).read_bytes(),'text/javascript')
        receiver=streaming.MediaReceiver(media,{'input':profile['inputFileBytes'],'output':profile['outputFileBytes']},time.monotonic()+86400)
        token=uuid.uuid4().hex;server=streaming.start_server(content,receiver,token);origin='http://127.0.0.1:'+str(server.server_port)
        inventory=[]
        for route,(body,_) in content.items():
            with urllib.request.urlopen(origin+route,timeout=5) as response:served=response.read(len(body)+1)
            cloud.require(served==body,'LONG_LOOPBACK_SOURCE_DIFFERS');inventory.append({'route':route,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
        cloud.write(meta/'private-source-inventory.json',{'checkoutCommit':identity['commit'],'files':inventory})
        owned=persistent.create_owned_profile(out)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:observed=browser_trial(playwright,owned,origin,args.profile,receiver,token,meta,report,producer_deadline,signals=signals)
        cloud.require(report.get('profileCleanup',{}).get('status')=='REMOVED','LONG_PROFILE_CLEANUP_UNVERIFIED')
        cloud.require(report.get('downloadDirectoryCleanup',{}).get('status')=='REMOVED','LONG_DOWNLOAD_DIRECTORY_CLEANUP_UNVERIFIED')
        remaining(producer_deadline);verify_started=time.monotonic();verify_deadline=min(producer_deadline,verify_started+profile['verificationSeconds']);frames=observed['generation']['frames']
        verified=oracle.verify_files(media/'input.mp4',media/'output.mp4',layout='sbs',fov=180,eye_size=512,mode='convert',
          timeout=remaining(verify_deadline),log_dir=meta/'oracle-logs');cloud.write(meta/'independent-verification.json',verified)
        cloud.require(verified['completeScan'],'LONG_INDEPENDENT_SCAN_INCOMPLETE')
        packets={side:packet_statistics(oracle,media/(side+'.mp4'),meta/(side+'-packet-stats'),verify_deadline,frames,
          profile[side+'FileBytes'],side=='input') for side in ['input','output']}
        cloud.write(meta/'packet-statistics.json',packets)
        cloud.require(packets['input']['payloadBytes']==observed['generation']['payloadBytes'],'LONG_GENERATOR_PACKET_PAYLOAD_DIFFERS')
        verdict=long_oracle.long_verdict(verified,packets,frames,profile['targetPayloadBytes'])
        files=[]
        for side in ['input','output']:
            size,digest=streaming.hash_file(media/(side+'.mp4'),verify_deadline);expected=next(r for r in observed['files'] if r['id']==side)
            cloud.require(size==expected['bytes'] and digest==expected['sha256'],'LONG_POST_SCAN_FILE_DIFFERS')
            files.append({'id':side,'name':side+'.mp4','bytes':size,'sha256':digest})
        after={name:cloud.digest(ROOT/name) for name in evidence_sources};cloud.require(after==hashes and cloud.digest(bundle)==build['bundleSha256'],'LONG_SOURCES_CHANGED')
        cloud.write(meta/'source-provenance.json',{'before':hashes,'after':after,'bundleSHA256':build['bundleSha256'],'identity':identity})
        acceptance={'mediaVerdict':verdict['status'],'completeScan':True,'expectedEvents':verdict['expectedEvents'],
          'actualInputPayloadBytes':packets['input']['payloadBytes'],'targetPayloadBytes':profile['targetPayloadBytes'],
          'actualOutputBytes':files[1]['bytes'],'outputExceeds4GiB':files[1]['bytes']>2**32,
          'verificationSeconds':time.monotonic()-verify_started,'hostRecovery':'PENDING','scope':verdict['scope']}
        remaining(producer_deadline)
        manifest=write_transport_manifests(meta,media,identity,args.profile,files,frames,acceptance,hashes[SCRIPT_PATH],
          deadline=producer_deadline,publications=publications,run_id=report['runId'])
        remaining(producer_deadline)
        cloud.require({name:cloud.digest(ROOT/name) for name in evidence_sources}==hashes
          and cloud.digest(bundle)==build['bundleSha256'],'LONG_SOURCES_CHANGED_DURING_BUNDLE')
        report.update(status='READY_FOR_SEGMENTED_RECOVERY',completeScan=True,mediaArtifactReady=True,mediaVerdict=verdict['status'],
          acceptance=acceptance,sourceManifest=manifest)
    except (Exception,ProducerInterrupted) as e:
        report.update(status='BLOCKED' if isinstance(e,cloud.Blocked) and not isinstance(e,cloud.Deadline) else 'FAIL',error=f'{type(e).__name__}: {e}')
        if hasattr(e,'publicationCleanup'):report['publicationCleanupBeforeFinal']=e.publicationCleanup
        (meta/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        try:transported=finish_run(out,meta,report,signals,owned=owned,receiver=receiver,server=server,
          publications=publications,started=started,producer_deadline=producer_deadline)
        finally:signals.restore()
    return 0 if transported and report['status']=='READY_FOR_SEGMENTED_RECOVERY' else 1

if __name__=='__main__':raise SystemExit(main())
