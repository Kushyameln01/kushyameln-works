#!/usr/bin/env python3
"""Private bounded-index WebCodecs conversion in sandboxed cloud Chrome."""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import math
import re
import os
from pathlib import Path
import signal
import time
import traceback
import urllib.request

spec=importlib.util.spec_from_file_location('output_probe',Path(__file__).with_name('probe-output-index.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
cloud=base.cloud
SOURCES=[
 'development/vr180/indexed-transform-prototype/transform.mjs',
 'development/vr180/input-index-prototype/input-index.mjs',
 'development/vr180/input-index-prototype/presentation-index.mjs',
 'development/vr180/output-index-prototype/output-index.mjs',
 'development/vr180/output-index-prototype/mp4-output-inspect.mjs',
 'development/vr180/index-prototype/index-store.mjs',
 'development/vr180/index-prototype/job-owner.mjs',
 'docs/shared/vr180/geometry.mjs','docs/shared/vr180/file-output.mjs',
 'docs/shared/vr180/sha256.mjs','docs/shared/vr180/mp4.mjs',
]
PUBLIC='docs/vr180-studio/fixtures/'
SILENT='development/vr180/indexed-conversion-fixtures/'

def cases_for(suite):
    def case(name,source,layout='sbs',fov=180,**extra):
        return {'name':name,'source':source,'settings':{'mode':'convert','confirmed':True,'layout':layout,
                'fov':fov,'eyeSize':256,'bitrate':2000000},**extra}
    if suite=='small':
        return [case('sbs-aac',PUBLIC+'stereo180-sbs.mp4'),
                case('tb-aac',PUBLIC+'stereo180-tb.mp4','tb'),
                case('sbs-silent',SILENT+'stereo180-sbs-silent.mp4'),
                case('tb-silent',SILENT+'stereo180-tb-silent.mp4','tb'),
                case('tb360-aac',PUBLIC+'stereo360-tb.mp4','tb',360),
                case('cancel',PUBLIC+'stereo180-sbs.mp4',expectCancel=True,handleKey='retry'),
                case('retry',PUBLIC+'stereo180-sbs.mp4',handleKey='retry')]
    if suite=='scale':
        def scale(name,source,**extra):
            item=case(name,PUBLIC+source,**extra)
            item['settings'].update(eyeSize=2048,bitrate=25165824)
            return item
        return [scale('4k-2s','stereo180-4k-2s-sbs.mp4'),
                scale('4k-12s-cancel','stereo180-4k-12s-sbs.mp4',expectCancel=True,
                      cancelAfterBytes=1048576,handleKey='retry-scale'),
                scale('4k-12s-retry','stereo180-4k-12s-sbs.mp4',handleKey='retry-scale')]
    raise ValueError('Unknown suite')

REGISTRY=r"""const registryMaxBytes=1024;
const recordHash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const sameBytes=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
async function createOwnershipRegistry(root,jobId,row){
 const name='registry-'+jobId;require(await missing(root,name),'REGISTRY_ALREADY_EXISTS');
 const directory=await root.getDirectoryHandle(name,{create:true});
 const records=row.indexOwnership=[];row.registry={name,status:'OPEN',removed:false,maxTickets:2,maxRecordBytes:registryMaxBytes};
 async function persist(ticket){
  require(records.length<2&&!records.some(record=>record.ticket.kind===ticket.kind),'REGISTRY_TICKET_LIMIT');
  require(ticket.format==='vr180-private-index-owner'&&ticket.schema===1&&['input','output'].includes(ticket.kind)
   &&ticket.jobId===jobId+(ticket.kind==='input'?'-in':'-out')&&/^[0-9a-f]{32}$/.test(ticket.ownerToken),'REGISTRY_TICKET_INVALID');
  const stored=Object.freeze({format:ticket.format,schema:ticket.schema,jobId:ticket.jobId,ownerToken:ticket.ownerToken,kind:ticket.kind});
  const text=JSON.stringify(stored),expected=new TextEncoder().encode(text);require(expected.length<=registryMaxBytes,'REGISTRY_RECORD_TOO_LARGE');
  const record={ticket:stored,name:ticket.kind+'.json',status:'WRITING',startedMs:performance.now(),endedMs:null,durationMs:null,
   bytes:expected.length,writeCalls:0,readCalls:0,flushed:false,closed:false,readbackMatched:false,removed:false};
  records.push(record);let access;
  try{
   const file=await directory.getFileHandle(record.name,{create:true});access=await file.createSyncAccessHandle();
   require(access.getSize()===0,'REGISTRY_RECORD_NOT_EMPTY');
   for(let at=0;at<expected.length;){const n=access.write(expected.subarray(at),{at});record.writeCalls++;
    require(Number.isSafeInteger(n)&&n>0&&n<=expected.length-at,'REGISTRY_WRITE_PROGRESS');at+=n;}
   access.flush();record.flushed=true;require(access.getSize()===expected.length,'REGISTRY_SIZE_MISMATCH');
   const observed=new Uint8Array(expected.length);
   for(let at=0;at<observed.length;){const n=access.read(observed.subarray(at),{at});record.readCalls++;
    require(Number.isSafeInteger(n)&&n>0&&n<=observed.length-at,'REGISTRY_READ_PROGRESS');at+=n;}
   require(sameBytes(expected,observed),'REGISTRY_HANDLE_READBACK_MISMATCH');
   access.close();access=null;record.closed=true;
   const snapshot=await file.getFile();require(snapshot.size===expected.length,'REGISTRY_CLOSED_FILE_SIZE_MISMATCH');
   const saved=new Uint8Array(await snapshot.arrayBuffer());require(sameBytes(expected,saved),'REGISTRY_CLOSED_FILE_READBACK_MISMATCH');
   record.readbackMatched=true;record.persistedJSON=new TextDecoder('utf-8',{fatal:true}).decode(saved);
   record.sha256=await recordHash(saved);record.status='PERSISTED';
  }catch(error){record.status='FAILED';record.error=describe(error);row.registry.status='RETAINED';throw error;}
  finally{
   if(access){try{access.close();access=null;record.closed=true;}catch(error){record.closeError=describe(error);row.registry.status='RETAINED';}}
   record.endedMs=performance.now();record.durationMs=record.endedMs-record.startedMs;
   row.registry.persistenceMs=records.reduce((sum,item)=>sum+(item.durationMs??0),0);
  }
 }
 async function removeAfterVerifiedCleanup(){
  const names=[jobId+'-in',jobId+'-out'];
  row.indexDirectoriesRemoved=await missing(root,names[0])&&await missing(root,names[1]);
  const related=lock=>names.some(name=>lock.name==='vr180:index-job:'+name||lock.name.startsWith('vr180:index-store:job:'+name+'-'));
  row.heldJobLocks=(await navigator.locks.query()).held.filter(related).length;
  row.indexReservedAfterCleanup=row.metrics?.indexReservedAfterCleanup??null;
  const proven=['PASS','EXPECTED_CANCELLATION'].includes(row.status)&&!row.cleanupError&&!row.cleanupFailureObserved
   &&row.indexDirectoriesRemoved&&row.heldJobLocks===0&&row.indexReservedAfterCleanup===0
   &&records.length===2&&records.every(record=>record.status==='PERSISTED'&&record.flushed&&record.closed&&record.readbackMatched);
  if(!proven){row.registry.status='RETAINED';row.registry.reason='INDEX_OR_REGISTRY_CLEANUP_NOT_PROVEN';return false;}
  // Acquire both existing job leases, then recheck absence. A query snapshot
  // alone never authorizes removing a ticket while a new same-ID owner starts.
  try{
   await navigator.locks.request('vr180:index-job:'+names[0],{mode:'exclusive',ifAvailable:true},async first=>{
    require(first,'REGISTRY_INPUT_LEASE_BUSY');
    await navigator.locks.request('vr180:index-job:'+names[1],{mode:'exclusive',ifAvailable:true},async second=>{
     require(second,'REGISTRY_OUTPUT_LEASE_BUSY');require(await missing(root,names[0])&&await missing(root,names[1]),'REGISTRY_INDEX_REAPPEARED');
     // Validate every closed file before removing the first one.
     const known=new Set(records.map(record=>record.name));
     for await(const [name,entry]of directory.entries())require(entry.kind==='file'&&known.has(name),'REGISTRY_UNKNOWN_ENTRY');
     for(const record of records){const file=await(await directory.getFileHandle(record.name)).getFile();
      require(file.size===record.bytes&&file.size<=registryMaxBytes,'REGISTRY_REMOVAL_SIZE_MISMATCH');
      const bytes=new Uint8Array(await file.arrayBuffer());require(await recordHash(bytes)===record.sha256
       &&new TextDecoder('utf-8',{fatal:true}).decode(bytes)===record.persistedJSON,'REGISTRY_REMOVAL_CONTENT_MISMATCH');}
     for(const record of records){await directory.removeEntry(record.name);record.removed=true;}
     await root.removeEntry(name);require(await missing(root,name),'REGISTRY_DIRECTORY_REMAINS');
    });
   });
   row.heldJobLocks=(await navigator.locks.query()).held.filter(related).length;require(row.heldJobLocks===0,'REGISTRY_LEASE_RETAINED');
   row.registry.status='REMOVED';row.registry.removed=true;return true;
  }catch(error){row.registry.status='RETAINED';row.registry.error=describe(error);return false;}
 }
 return {persist,removeAfterVerifiedCleanup};
}
"""

WORKER=r"""import * as fork from '/fork.mjs';
import {convertStereo} from '/development/vr180/indexed-transform-prototype/transform.mjs';
import {sha256Blob} from '/docs/shared/vr180/sha256.mjs';
const require=(ok,message)=>{if(!ok)throw Error(message);};
const describe=e=>({name:e.name,message:e.message,status:e.status??null});
let unhandledCount=0;
self.addEventListener('unhandledrejection',event=>{
 unhandledCount++;if(unhandledCount<=8)self.postMessage({unhandledError:describe(event.reason??Error('Unknown rejection'))});
});
async function missing(root,name){try{await root.getDirectoryHandle(name);return false;}catch(e){if(e.name==='NotFoundError')return true;throw e;}}
"""+REGISTRY+r"""async function run({namespace,cases}){
 const result={status:'READY_FOR_DOWNLOAD',cases:[],files:[],nativeOPFS:true,nativeWebLocks:true,registryPersistence:'native SyncAccessHandle write/flush/readback/close plus closed-file readback; two bounded tickets per trial',
   decoded:true,pixelConversion:true,publicProduct:false};
 try{
  require(isSecureContext&&navigator.storage?.getDirectory&&navigator.locks?.request&&navigator.locks?.query,'NATIVE_CAPABILITY_UNAVAILABLE');
  const origin=await navigator.storage.getDirectory();require(await missing(origin,namespace),'NAMESPACE_EXISTS');
  const root=await origin.getDirectoryHandle(namespace,{create:true});
  for(let index=0;index<cases.length;index++){
   const trial=cases[index],jobId=namespace+'-'+index,operationId=jobId,inputRevision=index+1;
   const aborter=new AbortController(),handle=await root.getFileHandle((trial.handleKey??trial.name)+'.mp4',{create:true});
   require((await handle.getFile()).size===0,'TARGET_NOT_EMPTY');
   const response=await fetch('/'+trial.source);require(response.ok,'INPUT_FETCH');
   const file=await response.blob(),inputSHA256=await sha256Blob(file),started=performance.now();
   const row={...trial,operationId,inputRevision,inputBytes:file.size,inputSHA256,status:'STARTED',
     targetInitiallyEmpty:true,saveWriteCommitted:false,progressEvents:0,cancelRequested:false};
   result.cases.push(row);let ownerCleanup,tx,latestMetrics,outcome;
   let registry;
   try{
    registry=await createOwnershipRegistry(root,jobId,row);
    outcome=await convertStereo(file,trial.settings,{fork,indexRoot:root,outputHandle:handle,jobId,signal:aborter.signal,
      onCleanup:cleanup=>{ownerCleanup=cleanup;},onOutputCreated:output=>{tx=output;},
      onIndexOwnership:async ticket=>{await registry.persist(ticket);self.postMessage({ownershipRecord:{operationId,inputRevision,registryName:row.registry.name,record:row.indexOwnership.at(-1)}});},
      onMetrics:metrics=>{latestMetrics=metrics;},onProgress:progress=>{
       row.progressEvents++;row.lastProgress=progress;
       const cancelReady=trial.cancelAfterBytes
        ? progress.phase==='convert'&&progress.outputBytes>=trial.cancelAfterBytes
        : progress.videoFrames>=10;
       if(trial.expectCancel&&!row.cancelRequested&&cancelReady){
        row.cancelRequested=true;row.cancelAt=progress;aborter.abort();
       }
      }});
    require(!trial.expectCancel,'CANCEL_UNEXPECTED_SUCCESS');
    row.saveWriteCommitted=outcome.saved.committed;row.verification=outcome.verification;
    row.metrics=outcome.metrics;row.savedInfo=outcome.savedInfo;row.bytes=outcome.saved.bytes;row.sha256=outcome.saved.sha256;
    require(outcome.saved.committed&&outcome.verification.metadataHashMatched,'SAVED_NOT_VERIFIED');
    const reread=await handle.getFile();require(reread.size===row.bytes&&await sha256Blob(reread)===row.sha256,'SAVED_REREAD_DIFFERS');
    result.files.push({caseIndex:index,name:trial.name+'.mp4',file:reread});
    row.status='PASS';
   }catch(error){
    row.error=describe(error);row.metrics=latestMetrics;
    if(error.cleanupError||error.requiresWorkerTermination){row.cleanupFailureObserved=true;row.conversionCleanupError=error.cleanupError??'Worker termination required';}
    row.saveOutputState=error.saveOutputState??tx?.status??null;
    row.saveWriteCommitted=row.saveOutputState?.committed===true;
    if(trial.expectCancel&&row.cancelRequested&&error.name==='AbortError'&&!row.saveWriteCommitted){
     row.status='EXPECTED_CANCELLATION';
    }else{row.status='FAIL';result.status='FAIL';}
   }finally{
    try{await ownerCleanup?.();}catch(error){row.cleanupError=describe(error);row.status='FAIL';result.status='FAIL';}
   }
   row.finalFileState=tx?.status??null;
   if(trial.expectCancel){row.savedBytes=(await handle.getFile()).size;
    if(row.savedBytes!==0||row.finalFileState?.state!=='aborted'){row.status='FAIL';result.status='FAIL';}}
   if(!registry||!await registry.removeAfterVerifiedCleanup()){row.status='FAIL';result.status='FAIL';}
   row.elapsedMs=performance.now()-started;
   if(result.status==='FAIL')break;
  }
 }catch(error){result.status=/UNAVAILABLE|not supported|not allowed/i.test(error.message)?'BLOCKED':'FAIL';result.error=describe(error);}
 result.unhandledRejectionCount=unhandledCount;if(unhandledCount)result.status='FAIL';return result;
}
self.onmessage=({data})=>run(data).then(result=>self.postMessage({result}),error=>self.postMessage({result:{status:'FAIL',error:describe(error),cases:[],files:[]}}));
"""
PAGE=r"""async(cases)=>{
 const state=globalThis.__indexedProbe={namespace:'v-'+crypto.randomUUID(),worker:null,urls:[],record:null,unhandledErrors:[],ownershipRecords:[],expectedCases:cases.length};
 try{
  const worker=state.worker=new Worker('/probe-worker.mjs',{type:'module'});
  const result=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{
   if(data.ownershipRecord){if(state.ownershipRecords.length>=2*cases.length){reject(Error('PAGE_OWNERSHIP_RECORD_LIMIT'));}else state.ownershipRecords.push(data.ownershipRecord);}
   else if(data.unhandledError){if(state.unhandledErrors.length<8)state.unhandledErrors.push(data.unhandledError);}
   else if(data.result)resolve(data.result);
  };worker.onerror=e=>reject(Error(e.message));worker.postMessage({namespace:state.namespace,cases});});
  await new Promise(resolve=>setTimeout(resolve,0));result.unhandledErrors=state.unhandledErrors;
  if(result.unhandledErrors.length)result.status='FAIL';
  result.persistedOwnershipAnnouncements=state.ownershipRecords;
  const files=result.files;result.files=files.map(({caseIndex,name})=>({caseIndex,name}));
  state.urls=files.map(({file})=>URL.createObjectURL(file));state.record=result;
  state.urls.push(URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})));
 }catch(error){state.record={status:'FAIL',error:{name:error.name,message:error.message},cases:[],files:[]};}
 return state.record;
}"""
CLEANUP=r"""async()=>{
 const state=globalThis.__indexedProbe;if(!state)return {status:'NOT_CREATED'};
 state.worker?.terminate();for(const url of state.urls)URL.revokeObjectURL(url);
 const record=state.record;
 const retained=reason=>({status:'RETAINED',reason,namespace:state.namespace,
  ownershipRecords:state.ownershipRecords??[],scope:'No namespace deletion; registry remains in the temporary browser context until that context is closed. Tickets are also retained in this evidence.'});
 if(!record||record.status!=='READY_FOR_DOWNLOAD'||record.cases.length!==state.expectedCases
  ||record.cases.some(row=>!row.registry?.removed||!row.indexDirectoriesRemoved||row.heldJobLocks!==0||row.indexReservedAfterCleanup!==0))return retained('TRIAL_CLEANUP_NOT_PROVEN');
 if(typeof navigator.locks?.query!=='function')return retained('LOCK_QUERY_UNAVAILABLE');
 if((await navigator.locks.query()).held.some(lock=>lock.name.includes(state.namespace)))return retained('OWNER_LEASE_REMAINS');
 const origin=await navigator.storage.getDirectory();let root;
 try{root=await origin.getDirectoryHandle(state.namespace);}catch(error){if(error.name==='NotFoundError')return {status:'NOT_CREATED'};throw error;}
 const known=new Set(record.cases.map(row=>(row.handleKey??row.name)+'.mp4'));
 for await(const [name,entry]of root.entries())if(entry.kind!=='file'||!known.has(name))return retained('UNKNOWN_NAMESPACE_ENTRY');
 for(const name of known){try{await root.removeEntry(name);}catch(error){if(error.name!=='NotFoundError')throw error;}}
 await origin.removeEntry(state.namespace);
 return {status:'REMOVED',scope:'Only verified-clean trial registry and known output files; empty namespace removed nonrecursively'};
}"""

def verify_registry(observed):
    """Independently check all recovered physical registry-file bytes and identity."""
    verified=[];announcements=[]
    for row in observed['cases']:
        registry=row['registry'];records=row['indexOwnership']
        cloud.require(registry['removed'] and registry['status']=='REMOVED' and len(records)==2,'Registry not removed after verified cleanup')
        cloud.require(row['indexDirectoriesRemoved'] and row['heldJobLocks']==0 and row['indexReservedAfterCleanup']==0,'Index cleanup not proved')
        cloud.require({record['ticket']['kind'] for record in records}=={'input','output'},'Missing ownership role')
        total=0.0
        for record in records:
            ticket=record['ticket'];raw=record['persistedJSON'].encode('utf-8')
            cloud.require(set(ticket)=={'format','schema','jobId','ownerToken','kind'} and ticket['format']=='vr180-private-index-owner' and ticket['schema']==1,'Ticket schema differs')
            cloud.require(ticket['jobId']==row['operationId']+('-in' if ticket['kind']=='input' else '-out') and re.fullmatch('[0-9a-f]{32}',ticket['ownerToken']) is not None,'Ticket identity differs')
            cloud.require(json.loads(raw)==ticket and len(raw)==record['bytes'] and len(raw)<=1024,'Recovered registry bytes differ')
            cloud.require(hashlib.sha256(raw).hexdigest()==record['sha256'],'Recovered registry hash differs')
            cloud.require(record['status']=='PERSISTED' and record['flushed'] and record['closed'] and record['readbackMatched'] and record['removed'],'Registry lifecycle not completed')
            cloud.require(record['writeCalls']>=1 and record['readCalls']>=1,'Registry native I/O not observed')
            start,end,duration=(record[key] for key in ['startedMs','endedMs','durationMs'])
            cloud.require(all(isinstance(value,(int,float)) and math.isfinite(value) for value in [start,end,duration]) and end>=start and math.isclose(end-start,duration,abs_tol=1e-7),'Registry phase interval invalid')
            total+=duration
            verified.append({'operationId':row['operationId'],'kind':ticket['kind'],'bytes':len(raw),'sha256':record['sha256'],'durationMs':duration})
            announcements.append((row['operationId'],row['inputRevision'],registry['name'],ticket,record['persistedJSON'],record['sha256']))
        cloud.require(math.isclose(total,registry['persistenceMs'],abs_tol=1e-7),'Registry total duration differs')
    received=observed.get('persistedOwnershipAnnouncements',[])
    cloud.require(len(received)==len(announcements),'Ownership acknowledgment announcements missing')
    for item,expected in zip(received,announcements):
        record=item['record']
        cloud.require((item['operationId'],item['inputRevision'],item['registryName'],record['ticket'],record['persistedJSON'],record['sha256'])==expected,'Ownership acknowledgment identity differs')
    return {'status':'PASS','records':verified,'scope':'All recovered registry JSON bytes/identity/hash plus reported native I/O, duration and verified cleanup; no power-loss or cross-context durability claim'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--suite',choices=['small','scale'],default='small');args=parser.parse_args()
    out,bundle=args.output.resolve(),args.bundle.resolve()
    cloud.require(not out.exists() and not out.is_relative_to(cloud.ROOT),'Use new output directory outside checkout')
    cloud.require(bundle.is_file() and not bundle.is_symlink() and not bundle.is_relative_to(cloud.ROOT),'Use built fork outside checkout')
    out.mkdir(parents=True);started=time.monotonic();server=None
    report={'schema':'vr180-indexed-conversion-probe-v1',
      'runId':os.environ.get('GITHUB_RUN_ID','local')+'-indexed-conversion-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'),
      'status':'BLOCKED','suite':args.suite,'prototypeOnly':True,'pageErrors':[],'workers':[],
      'fullOutputsRecovered':0,'cleanup':{'status':'NOT_RUN'},'independentMediaAcceptance':'PENDING',
      'notVerified':['OS picker','whole-browser native/GPU memory','large media','target VR player','public deployment',
       'registry retention after this temporary browser context closes','power-loss persistence','product recovery UI','UI crash recovery']}
    def deadline(*args):raise cloud.Deadline('Indexed conversion probe deadline')
    signal.signal(signal.SIGALRM,deadline);signal.signal(signal.SIGTERM,deadline);signal.alarm(540)
    try:
        cloud.require(os.environ.get('GITHUB_REPOSITORY')=='Kushyameln01/kushyameln-works','Repository differs')
        source=cloud.source_check(out,candidate=True);report['checkoutCommit']=source['checkoutCommit'];cloud.preflight(out,defer_verification=True)
        build=json.loads((bundle.parent/'fork-build-result.json').read_text())
        cloud.require(build['status']=='PASS' and build['baseline']['status']=='PASS' and build['baseline']['comparison']['identical'],'Rebuild gate failed')
        cloud.require(build['variant']=='combined-input-output' and build['bundleBytes']==bundle.stat().st_size and build['bundleSha256']==cloud.digest(bundle),'Combined bundle differs')
        cloud.require(build['controllerSha256']==cloud.digest(cloud.ROOT/'development/vr180/input-index-prototype/input-index.mjs'),'Input controller differs')
        cloud.require(build['presentationSha256']==cloud.digest(cloud.ROOT/'development/vr180/input-index-prototype/presentation-index.mjs'),'Presentation controller differs')
        required_runtime={'index-prototype/index-store.mjs','index-prototype/job-owner.mjs','output-index-prototype/output-index.mjs','output-index-prototype/mp4-output-inspect.mjs'}
        cloud.require(required_runtime<=set(build.get('runtimeFiles',{})),'Required runtime provenance missing')
        for file,digest in build['runtimeFiles'].items():cloud.require(cloud.digest(cloud.ROOT/'development/vr180'/file)==digest,'Runtime differs: '+file)
        cloud.write(out/'fork-build-result.json',build)
        cases=cases_for(args.suite);paths=sorted(set(SOURCES+[case['source'] for case in cases]))
        cloud.command(['git','ls-files','--error-unmatch',*paths,str(Path(__file__).resolve().relative_to(cloud.ROOT))])
        report['harnessSHA256']=cloud.digest(Path(__file__));report['sharedHarnessSHA256']=cloud.digest(Path(cloud.__file__))
        report['baseHarnessSHA256']=cloud.digest(Path(base.__file__));report['forkSHA256']=cloud.digest(bundle)
        content={'/':(base.HTML,'text/html'),'/probe-worker.mjs':(WORKER.encode(),'text/javascript'),'/fork.mjs':(bundle.read_bytes(),'text/javascript')}
        for file in paths:
            path=cloud.ROOT/file;cloud.require(not path.is_symlink(),'Source symlink refused')
            content['/'+file]=(path.read_bytes(),'video/mp4' if file.endswith('.mp4') else 'text/javascript')
        server=base.start_server(content);origin=f'http://127.0.0.1:{server.server_port}';inventory=[]
        for route,(body,mime) in content.items():
            with urllib.request.urlopen(origin+route,timeout=5) as response:served=response.read(len(body)+1)
            cloud.require(served==body,'Served source mismatch');inventory.append({'route':route,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
        cloud.write(out/'private-source-inventory.json',{'checkoutCommit':source['checkoutCommit'],'files':inventory,'exactRoutesOnly':True})
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=str(cloud.CHROME),headless=True,chromium_sandbox=True,timeout=30000)
            report['browserVersion']=browser.version
            try:
                context=browser.new_context(accept_downloads=True);context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
                page=context.new_page();page.on('pageerror',lambda error:report['pageErrors'].append(str(error)));page.on('worker',lambda worker:report['workers'].append(worker.url))
                try:
                    page.goto(origin+'/',wait_until='networkidle');page.evaluate('cases=>{globalThis.__probeResult=null;('+PAGE+')(cases).then(r=>globalThis.__probeResult=r,e=>globalThis.__probeResult={status:"FAIL",error:String(e),files:[],cases:[]});}',cases)
                    page.wait_for_function('globalThis.__probeResult!==null',timeout=450000);observed=page.evaluate('globalThis.__probeResult');cloud.write(out/'browser-observations.json',observed)
                    cloud.require(len(report['workers'])==1 and report['workers'][0]==origin+'/probe-worker.mjs','Dedicated Worker mismatch')
                    for index,entry in enumerate(observed['files']):
                        row=observed['cases'][entry['caseIndex']];trial=out/row['name'];trial.mkdir()
                        input_bytes=(cloud.ROOT/row['source']).read_bytes();cloud.require(hashlib.sha256(input_bytes).hexdigest()==row['inputSHA256'],'Input differs')
                        (trial/'input.mp4').write_bytes(input_bytes);cloud.check_recovery_budget(out,trial,row['bytes'])
                        with page.expect_download(timeout=15000) as download:page.evaluate('([index,name])=>{const a=document.createElement("a");a.href=globalThis.__indexedProbe.urls[index];a.download=name;a.click();}',[index,entry['name']])
                        saved=trial/'output.mp4';download.value.save_as(str(saved))
                        cloud.require(saved.stat().st_size==row['bytes'] and cloud.digest(saved)==row['sha256'],'Full saved output differs')
                        cloud.write(trial/'trial.json',row);report['fullOutputsRecovered']+=1
                    report['browserStatus']=observed['status']
                    if observed['status']=='BLOCKED':raise cloud.Blocked(str(observed.get('error')))
                    cloud.require(observed['status']=='READY_FOR_DOWNLOAD' and len(observed['cases'])==len(cases),'Indexed conversion failed')
                    cloud.require(report['fullOutputsRecovered']==sum(not case.get('expectCancel',False) for case in cases),'Missing complete output')
                    report['registryVerification']=verify_registry(observed)
                    cloud.require(not report['pageErrors'],'Unexpected browser page error');report['status']='PASS'
                finally:
                    try:
                        report['cleanup']=page.evaluate(CLEANUP)
                        if report['cleanup']['status'] not in ('REMOVED','NOT_CREATED'):report['status']='BLOCKED'
                    except Exception as error:report['cleanup']={'status':'NOT VERIFIED','error':str(error)};report['status']='BLOCKED'
                    context.close()
            finally:browser.close()
    except Exception as error:
        report.update(status='BLOCKED' if isinstance(error,(cloud.Blocked,cloud.Deadline)) else 'FAIL',error=f'{type(error).__name__}: {error}')
        (out/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if server:server.shutdown();server.server_close()
        report['elapsedSeconds']=time.monotonic()-started;cloud.write(out/'run.json',report);transported=cloud.emit_evidence(out,report)
    return 0 if transported and report['status']=='PASS' else 1
if __name__=='__main__':raise SystemExit(main())
