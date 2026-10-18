#!/usr/bin/env python3
"""Private fixed-size diagnosis of Playwright routing overhead; no media acceptance.

Baseline, exact-origin bypass, baseline; 128 MiB input plus 128 MiB output
per trial. Reuses the long producer's TRANSFER and MediaReceiver verbatim.
HTTP/1.0, one awaited 1 MiB POST and the long producer's guard stay unchanged.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time
import traceback
import urllib.request
import uuid

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('loopback_long_probe', ROOT/'development/vr180/p5-long-prototype/probe-long.py')
probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)
c, streaming, persistent = probe.cloud, probe.streaming, probe.persistent
CHUNK_BYTES = 1024**2
CHUNKS = 128
FILE_BYTES = CHUNK_BYTES * CHUNKS
DEADLINE_SECONDS = 300
MODES = ('baseline', 'filtered', 'baseline')
SCRIPT_PATH = 'tools/vr180/probe-loopback-transfer.py'
SOURCES = sorted(set([SCRIPT_PATH, 'docs/shared/vr180/sha256.mjs'] + [
    Path(module.__file__).resolve().relative_to(ROOT).as_posix() for module in
    [probe, probe.calibration, probe.base, c, probe.indexed, persistent, streaming, probe.long_oracle, probe.evidence_bundle]]))
HTML = b'<!doctype html><meta charset="utf-8"><title>Private bounded loopback transfer diagnosis</title>'
WORKER = r"""import {Sha256} from '/docs/shared/vr180/sha256.mjs';
const CHUNK=1048576,CHUNKS=128,TOTAL=CHUNK*CHUNKS;
const need=(v,m)=>{if(!v)throw Error(m);};
const describe=e=>({name:e.name,message:e.message});
async function absent(root,name){try{await root.getDirectoryHandle(name);return false;}catch(e){if(e.name==='NotFoundError')return true;throw e;}}
self.onmessage=async({data})=>{
 const result={status:'FAIL',namespace:data.namespace,namespaceOwned:false,files:[],ownerRecordsRemoved:true,
  indexDirectoriesRemoved:true,heldLocks:0,indexReservedAfterCleanup:0,syntheticNonMedia:true};let writer;
 try{
  need(/^v-[a-f0-9-]{36}$/.test(data.namespace),'NAMESPACE_INVALID');
  need(isSecureContext&&navigator.storage?.getDirectory,'NATIVE_CAPABILITY_UNAVAILABLE');
  const origin=await navigator.storage.getDirectory();need(await absent(origin,data.namespace),'NAMESPACE_EXISTS');
  const root=await origin.getDirectoryHandle(data.namespace,{create:true});result.namespaceOwned=true;self.postMessage({namespaceOwned:true});
  const bytes=new Uint8Array(CHUNK),started=performance.now();
  for(const [side,id]of ['input','output'].entries()){
   const name=id+'.mp4',handle=await root.getFileHandle(name,{create:true});self.postMessage({ownedMediaFile:name});
   need((await handle.getFile()).size===0,'WITNESS_NOT_EMPTY');writer=await handle.createWritable();const hash=new Sha256();
   for(let chunk=0;chunk<CHUNKS;chunk++){
    for(let i=0;i<CHUNK;i++)bytes[i]=(i*17+(i>>>8)*29+chunk*43+side*19+101)&255;
    hash.update(bytes);await writer.write(bytes);
   }
   await writer.close();writer=null;const file=await handle.getFile();need(file.size===TOTAL,'WITNESS_SIZE');
   result.files.push({id,name,bytes:file.size,sha256:hash.digestHex(),file});
  }
  result.preparationMs=performance.now()-started;result.status='READY_FOR_RUNNER_TRANSFER';
 }catch(e){result.error=describe(e);}
 finally{if(writer)try{await writer.abort();}catch(e){result.cleanupFailureObserved=true;result.cleanupError=describe(e);}}
 self.postMessage({result});
};"""


def external_guard(origin):
    c.require(isinstance(origin,str) and re.fullmatch(r'http://127\.0\.0\.1:[1-9][0-9]{0,4}',origin), 'GUARD_ORIGIN')
    c.require(1 <= int(origin.rsplit(':',1)[1]) <= 65535, 'GUARD_PORT')
    # The old predicate continues exactly origin + '/'. Its complement aborts
    # every other URL without intercepting the approved origin's POST bodies.
    return re.compile(r'^(?!' + re.escape(origin) + r'/)')


def install_guard(context, origin, mode, observation):
    pattern = external_guard(origin)
    c.require(mode in MODES,'GUARD_MODE')
    def intercepted(route):
        observation['intercepted'] += 1
        if mode == 'baseline' and route.request.url.startswith(origin+'/'):
            observation['continued'] += 1; route.continue_()
        else:
            observation['aborted'] += 1; route.abort()
    context.route('**/*' if mode == 'baseline' else pattern,intercepted)


def expected_files(deadline):
    """Independent Python hashes; no whole-file buffer or retained chunk list."""
    base=bytes((i*17+(i>>8)*29+101)&255 for i in range(CHUNK_BYTES)); rows=[]
    for side,ident in enumerate(['input','output']):
        h=hashlib.sha256()
        for chunk in range(CHUNKS):
            probe.remaining(deadline)
            h.update(base.translate(bytes((i+chunk*43+side*19)&255 for i in range(256))))
        rows.append({'id':ident,'name':ident+'.mp4','bytes':FILE_BYTES,'sha256':h.hexdigest()})
    return rows


def capture_transfer(page, receiver, row):
    row['serverTransfer']=receiver.observation()
    if page:
        try:
            row['browserTransfer']=page.evaluate('({result:globalThis.__long?.transfer??null,progress:globalThis.__long?.transferProgress??null})')
        except (Exception,probe.ProducerInterrupted) as error:
            row['browserTransferSnapshotError']=str(error)[:1000]
            if isinstance(error,probe.ProducerInterrupted):raise


def run_trial(playwright, out, number, mode, expected, deadline):
    row={'number':number,'mode':mode,'status':'STARTED','route':{'intercepted':0,'continued':0,'aborted':0},
         'pageErrors':[],'workers':[],'httpProtocol':'HTTP/1.0','native':True}
    trial=out/('trial-'+str(number)); trial.mkdir(); media=trial/'media'; media.mkdir()
    receiver=streaming.MediaReceiver(media,{'input':FILE_BYTES,'output':FILE_BYTES},deadline)
    token=uuid.uuid4().hex
    content={'/':(HTML,'text/html'),probe.WORKER_ROUTE:(WORKER.encode(),'text/javascript'),
             '/docs/shared/vr180/sha256.mjs':((ROOT/'docs/shared/vr180/sha256.mjs').read_bytes(),'text/javascript')}
    server=None; owned=None; context=None; browser=None; page=None; failure=None; started=time.monotonic()
    def cleanup(label, fn):
        nonlocal failure
        try:row[label]=fn()
        except (Exception,probe.ProducerInterrupted) as error:
            row[label]={'status':'HOLD','error':str(error)[:1000]}
            if failure is None:failure=error
    try:
        probe.remaining(deadline); server=streaming.start_server(content,receiver,token)
        c.require(server.RequestHandlerClass.protocol_version=='HTTP/1.0','HTTP_VERSION_CHANGED')
        origin='http://127.0.0.1:'+str(server.server_port); row['origin']=origin
        inventory=[]
        for route,(body,_) in content.items():
            with urllib.request.urlopen(origin+route,timeout=min(5,probe.remaining(deadline))) as response:
                served=response.read(len(body)+1)
            c.require(served==body,'DIAGNOSTIC_SOURCE_DIFFERS')
            inventory.append({'route':route,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
        row['servedSources']=inventory
        owned=persistent.create_owned_profile(trial); row['ownedProfile']=dict(owned['owner']); owned['browserClosed']=False
        context=playwright.chromium.launch_persistent_context(user_data_dir=str(owned['path']),
            executable_path=str(c.CHROME),headless=True,chromium_sandbox=True,timeout=min(30000,probe.remaining(deadline)*1000))
        browser=context.browser; c.require(browser is not None,'BROWSER_HANDLE_MISSING'); row['browserVersion']=browser.version
        install_guard(context,origin,mode,row['route'])
        page=context.new_page(); page.set_default_timeout(30000)
        page.on('pageerror',lambda error:row['pageErrors'].append(str(error)) if len(row['pageErrors'])<8 else None)
        page.on('worker',lambda worker:row['workers'].append(worker.url) if len(row['workers'])<8 else None)
        page.goto(origin+'/',wait_until='networkidle',timeout=min(30000,probe.remaining(deadline)*1000))
        row['externalRequestRejected']=page.evaluate("async()=>{try{await fetch('https://example.invalid/vr180-loopback-guard');return false;}catch{return true;}}")
        c.require(row['externalRequestRejected'] and row['route']['aborted']==1,'EXTERNAL_GUARD_NOT_OBSERVED')
        page.evaluate(probe.PAGE,'loopback-transfer-diagnostic')
        page.wait_for_function('globalThis.__long.result!==null',timeout=probe.remaining(deadline)*1000)
        row['preparation']=page.evaluate('globalThis.__long.result')
        c.require(row['preparation']['status']=='READY_FOR_RUNNER_TRANSFER','WITNESS_PREPARATION_FAILED')
        c.require(row['preparation']['files']==expected,'INDEPENDENT_WITNESS_HASH_DIFFERS')
        c.require(row['workers']==[origin+probe.WORKER_ROUTE] and not row['pageErrors'],'DIAGNOSTIC_WORKER_OR_PAGE_ERROR')
        receiver.prepare(expected); transfer_started=time.monotonic(); page.evaluate(probe.TRANSFER,token)
        page.wait_for_function('globalThis.__long.transfer!==null',timeout=probe.remaining(deadline)*1000)
        capture_transfer(page,receiver,row); row['transferElapsedSeconds']=time.monotonic()-transfer_started
        c.require(row['browserTransfer']['result']['status']=='PASS','DIAGNOSTIC_TRANSFER_FAILED')
        row['receipts']=receiver.receipts()
        for receipt,entry in zip(row['receipts'],expected):
            c.require(all(receipt.get(key)==value for key,value in entry.items()) and receipt['rereadBytes']==FILE_BYTES
                      and receipt['rereadSHA256']==entry['sha256'] and receipt['fsynced'] and receipt['closed'], 'DIAGNOSTIC_FULL_REREAD_DIFFERS')
        c.require(row['route']['aborted']==1 and (row['route']['continued']>0 if mode=='baseline' else row['route']['continued']==0),'DIAGNOSTIC_GUARD_COUNTS')
        row['status']='PASS'
    except (Exception,probe.ProducerInterrupted) as error:
        failure=error; row['status']='FAIL'; row['error']=f'{type(error).__name__}: {error}'
    finally:
        cleanup('transferSnapshot',lambda:capture_transfer(page,receiver,row))
        if page:
            cleanup('namespaceCleanup',lambda:page.evaluate(probe.CLEANUP))
            if row['namespaceCleanup'].get('status') not in {'REMOVED','NOT_CREATED'}:owned['unknownContent']=True
        if context:
            def close_browser():
                context.close(); c.require(browser is not None and not browser.is_connected(),'BROWSER_STILL_CONNECTED'); owned['browserClosed']=True
                return {'status':'CLOSED'}
            cleanup('browserClose',close_browser)
        if server:
            def close_server():
                receiver.deadline=0; server.shutdown(); server.server_close(); return {'status':'CLOSED'}
            cleanup('serverClose',close_server)
        # Completed and partial owned files are equally deleted only after all
        # requests finish. Record the full receipts before deleting anything.
        row['serverTransferAfterClose']=receiver.observation()
        if server is None or row.get('serverClose',{}).get('status')=='CLOSED':cleanup('runnerMediaCleanup',receiver.abort)
        else:row['runnerMediaCleanup']={'status':'HOLD','reason':'Server request completion unverified; files retained.'}
        if owned:cleanup('profileCleanup',lambda:persistent.cleanup_owned_profile(owned))
        row['elapsedSeconds']=time.monotonic()-started
        if failure is not None:row['status']='FAIL'
        c.write(out/'evidence'/('trial-'+str(number)+'.json'),row)
    if failure is not None:raise failure
    return row


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--output',type=Path,required=True); args=parser.parse_args(argv)
    out=args.output.resolve(); c.require(not out.exists() and not out.is_relative_to(ROOT),'Use new output outside checkout')
    out.mkdir(parents=True); meta=out/'evidence'; meta.mkdir()
    started=time.monotonic(); deadline=started+DEADLINE_SECONDS
    report={'schema':'vr180-loopback-transfer-diagnostic-v1','runId':os.environ.get('GITHUB_RUN_ID','local')+'-loopback-transfer-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'),
      'status':'FAIL','mediaArtifactReady':False,'prototypeOnly':True,'publicFilesWritten':False,'httpProtocol':'HTTP/1.0',
      'chunkBytes':CHUNK_BYTES,'bytesPerFile':FILE_BYTES,'bytesPerTrial':FILE_BYTES*2,'maxCompletedBytes':FILE_BYTES*2*len(MODES),
      'modes':list(MODES),'deadlineSeconds':DEADLINE_SECONDS,'cleanupGraceSeconds':30,'trials':[],
      'comparison':'Only Playwright route pattern changes. Each trial uses a new owned normal sandboxed Chrome profile; same deterministic bytes and sequential POST protocol.',
      'notVerified':['5/10 GB transfer','media decode/encode/quality','public product performance','HTTP/1.1 effect','performance distribution or cold-cache behavior','true peak memory']}
    signals=probe.ProducerSignals(report); signals.install(DEADLINE_SECONDS); transported=False
    try:
        c.require(os.environ.get('GITHUB_REPOSITORY')=='Kushyameln01/kushyameln-works','REPOSITORY_DIFFERS')
        temporary=Path(os.environ['RUNNER_TEMP']).resolve(strict=True); c.require(out.is_relative_to(temporary),'OUTPUT_REQUIRES_RUNNER_TEMP')
        c.require(shutil.disk_usage(out).free>=1024**3,'DIAGNOSTIC_RUNNER_DISK_LOW')
        source=c.source_check(meta,candidate=True); report['checkoutCommit']=source['checkoutCommit']; c.preflight(meta,defer_verification=True)
        c.command(['git','ls-files','--error-unmatch',*SOURCES]); before={name:c.digest(ROOT/name) for name in SOURCES}
        for name in SOURCES:c.require(not (ROOT/name).is_symlink(),'DIAGNOSTIC_SOURCE_SYMLINK')
        report['sourceSHA256Before']=before; expected=expected_files(deadline); c.write(meta/'independent-python-oracle.json',expected)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            for number,mode in enumerate(MODES,1):
                probe.remaining(deadline); row=run_trial(playwright,out,number,mode,expected,deadline); report['trials'].append(row)
        after={name:c.digest(ROOT/name) for name in SOURCES}; report['sourceSHA256After']=after
        c.require(after==before,'DIAGNOSTIC_SOURCES_CHANGED'); probe.remaining(deadline); report['status']='PASS'
    except (Exception,probe.ProducerInterrupted) as error:
        report['status']='FAIL'; report['error']=f'{type(error).__name__}: {error}'; (meta/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signals.begin_cleanup()
        try:
            report['elapsedSeconds']=time.monotonic()-started
            report['trialRecords']=[path.name for path in sorted(meta.glob('trial-*.json'))]
            c.write(meta/'run.json',report); transported=c.emit_evidence(meta,report)
            if signals.interruption:
                report['status']='FAIL'; c.write(meta/'run.json',report)
                print('VR180_LOOPBACK_INTERRUPTED '+json.dumps({'runId':report['runId'],'status':'FAIL','completeEvidence':False}),flush=True)
                transported=False
        finally:signals.restore()
    return 0 if transported and report['status']=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
