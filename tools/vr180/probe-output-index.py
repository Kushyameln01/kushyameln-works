#!/usr/bin/env python3
"""Private native OPFS output-index remux probe; never a pixel conversion test."""
from __future__ import annotations
import argparse
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import signal
import threading
import time
import traceback
import urllib.request

spec = importlib.util.spec_from_file_location('cloud', Path(__file__).with_name('cloud-validate.py'))
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)
FILES = [
    'development/vr180/output-index-prototype/output-index.mjs',
    'development/vr180/output-index-prototype/mp4-output-inspect.mjs',
    'development/vr180/index-prototype/index-store.mjs',
    'docs/shared/vr180/file-output.mjs', 'docs/shared/vr180/sha256.mjs', 'docs/shared/vr180/mp4.mjs',
    'docs/vr180-studio/fixtures/stereo180-sbs.mp4',
]
HTML = b'<!doctype html><meta charset="utf-8"><title>Private output-index native remux probe</title>'
WORKER = r"""import * as M from '/fork.mjs';
import {createOutputIndex} from '/development/vr180/output-index-prototype/output-index.mjs';
import {inspectMp4} from '/development/vr180/output-index-prototype/mp4-output-inspect.mjs';
import {createFileOutput} from '/docs/shared/vr180/file-output.mjs';
import {sha256Blob} from '/docs/shared/vr180/sha256.mjs';
const require = (ok, message) => { if (!ok) throw Error(message); };
const describe = error => ({name:error.name, message:error.message, status:error.status ?? null});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function absent(root, name) { try { await root.getDirectoryHandle(name); return false; } catch(e) { if(e.name==='NotFoundError') return true; throw e; } }
async function run(namespace) {
  require(isSecureContext && typeof navigator.storage?.getDirectory==='function' && typeof navigator.locks?.request==='function', 'NATIVE_CAPABILITY_UNAVAILABLE');
  const originRoot = await navigator.storage.getDirectory(); require(await absent(originRoot,namespace), 'NAMESPACE_EXISTS');
  const root = await originRoot.getDirectoryHandle(namespace,{create:true});
  const response = await fetch('/docs/vr180-studio/fixtures/stereo180-sbs.mp4'); require(response.ok,'FIXTURE_FETCH');
  const blob = await response.blob(), cases = []; let savedFile;
  for (const mode of ['success','cancel-finalize','target-finalize-failure']) {
    let controller, tx, output, input, finalized=false, saved=null, error=null, phase='input', expectedCount=0;
    const cleanupErrors=[]; const aborter=new AbortController(), jobId=namespace+'-'+mode;
    const fileHandle=await root.getFileHandle(mode+'.mp4',{create:true}); const start=performance.now();
    try {
      controller=await createOutputIndex({root,jobId,layout:'sbs',signal:aborter.signal,yieldTask:async()=>{
        await tick(); if(mode==='cancel-finalize' && phase==='finalize' && controller.metrics.metadataWriteBytes>0) aborter.abort();
      }});
      tx=await createFileOutput(fileHandle,{signal:aborter.signal});
      // A fixed one-MiB StreamTarget and HWM=1 wrapper are part of this private entry contract.
      // createFileOutput.stream has HWM=1. Never substitute arbitrary caller targets here.
      const stream = mode==='target-finalize-failure' ? new WritableStream({write(){throw Error('INJECTED_FINALIZE_TARGET_FAILURE');},close(){},abort(){}},{highWaterMark:1}) : tx.stream;
      const format=new M.Mp4OutputFormat({fastStart:false}); format._options.vr180Index=controller;
      output=new M.Output({format,target:new M.StreamTarget(stream,{chunked:true,chunkSize:1024*1024})});
      input=new M.Input({source:new M.BlobSource(blob,{maxCacheSize:1024*1024,useStreamReader:false}),formats:[M.MP4]});
      const states=[];
      for(const track of await input.getTracks()) {
        require(track.type==='video'||track.type==='audio','TRACK_TYPE');
        const source=track.type==='video'?new M.EncodedVideoPacketSource('avc'):new M.EncodedAudioPacketSource('aac');
        if(track.type==='video') output.addVideoTrack(source); else output.addAudioTrack(source);
        const sink=new M.EncodedPacketSink(track); states.push({source,sink,next:await sink.getFirstPacket(),config:await track.getDecoderConfig(),first:true});
      }
      require(states.length===2,'EXPECTED_H264_AAC'); await output.start(); phase='packets';
      for(;;) {
        let state=null; for(const current of states) if(current.next&&(!state||current.next.timestamp<state.next.timestamp))state=current;
        if(!state)break;const packet=state.next;
        await state.source.add(packet,state.first?{decoderConfig:state.config}:undefined);state.first=false;expectedCount++;
        state.next=await state.sink.getNextPacket(packet);
      }
      for(const state of states)await state.source.close(); phase='finalize'; await output.finalize(); finalized=true;
      require(controller.metrics.metadataClosed&&controller.metrics.verification.sampleCounts.total===expectedCount,'METADATA_NOT_VERIFIED');
      if(mode!=='success')throw Error('NEGATIVE_UNEXPECTED_FINALIZE_SUCCESS');
      const extent=tx.status.extent, offset=controller.metrics.moovPosition;
      const expectedMetadataHash=await sha256Blob(controller.metadataSource.slice(offset,extent));
      phase='commit';saved=await tx.commit({expectedBytes:extent});
      require(saved.committed&&!saved.hashMatched,'COMMIT_CONTRACT');
      require(await sha256Blob(saved.file.slice(offset))===expectedMetadataHash,'SAVED_METADATA_HASH');
      const info=await inspectMp4(saved.file);require(info.stereoMode===2&&info.projection==='equi'&&info.audioCodecs.length===1&&info.sampleCounts.total===expectedCount,'SAVED_FULL_INSPECT');
      savedFile=saved.file;cases.push({mode,status:'PASS',elapsedMs:performance.now()-start,expectedCount,bytes:saved.bytes,sha256:saved.sha256,
        wholeFileHashCompared:false,metadataHashMatched:true,expectedMetadataHash,info,metrics:controller.metrics,fileTimings:tx.timings,finalized,committed:true});
    } catch(e) { error=describe(e);if(mode==='success')throw e;
      require(mode==='cancel-finalize'?e.name==='AbortError':e.message==='INJECTED_FINALIZE_TARGET_FAILURE','WRONG_NEGATIVE_ERROR');
      require(phase==='finalize'&&!tx?.status.committed,'NEGATIVE_COMMITTED_OR_WRONG_PHASE');
      cases.push({mode,status:'EXPECTED_FAILURE',error,phase,expectedCount,finalized,committed:false,metrics:controller?.metrics});
    } finally {
      // Each owner is cleaned independently; upstream errored-stream cancel may throw.
      try {if(output&&!['finalized','canceled'].includes(output.state))await output.cancel();}catch(e){cleanupErrors.push({owner:'output.cancel',...describe(e)});}
      try {if(tx&&!tx.status.committed)await tx.abort();}catch(e){cleanupErrors.push({owner:'transaction.abort',...describe(e)});}
      try {input?.dispose();}finally {await controller?.dispose();}
    }
    const row=cases.at(-1);row.cleanupErrors=cleanupErrors;row.controllerDisposed=controller.metrics.disposed;
    require(row.controllerDisposed&&controller.metrics.explicitReservedBytes===0&&await absent(root,jobId),'CONTROLLER_CLEANUP');
    const locks=(await navigator.locks.query()).held.filter(lock=>lock.name.includes(jobId));require(locks.length===0,'LEASE_RETAINED');
    row.leaseReleased=true;row.fileState=tx.status;
    if(mode!=='success') {row.savedBytes=(await fileHandle.getFile()).size;require(row.savedBytes===0&&tx.status.state==='aborted','NEGATIVE_FILE_VISIBLE');}
  }
  return {cases,file:savedFile,inputBytes:blob.size,inputSha256:await sha256Blob(blob),target:{chunkBytes:1048576,highWaterMark:1},decoded:false,
    path:'fixed fork Input/EncodedPacketSink -> encoded packet remux -> private output index -> native OPFS transaction -> saved File',
    inputForkImplemented:false,nativeOPFS:true,nativeWebLocks:true};
}
self.onmessage=({data})=>run(data.namespace).then(result=>self.postMessage({type:'done',result}),error=>self.postMessage({type:'error',error:describe(error)}));
"""
PAGE_PROBE = r"""async () => {
const state=globalThis.__outputProbe={namespace:'v-'+crypto.randomUUID(),worker:null,urls:[],record:null};
try {
 const worker=state.worker=new Worker('/probe-worker.mjs',{type:'module'});
 const result=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.type==='done'?resolve(data.result):reject(Object.assign(Error(data.error.message),data.error));worker.onerror=e=>reject(Error(e.message));worker.postMessage({namespace:state.namespace});});
 const file=result.file;delete result.file;state.urls.push(URL.createObjectURL(file));
 state.record={status:'READY_FOR_DOWNLOAD',...result};state.urls.push(URL.createObjectURL(new Blob([JSON.stringify(state.record,null,2)],{type:'application/json'})));
} catch(error) {state.record={status:error.status==='BLOCKED'||/UNAVAILABLE|not supported|not allowed/i.test(error.message)?'BLOCKED':'FAIL',error:{name:error.name,message:error.message}};}
return state.record;
}"""
PAGE_CLEANUP = r"""async()=>{
const state=globalThis.__outputProbe;if(!state)return {status:'NOT_CREATED'};
state.worker?.terminate();for(const url of state.urls)URL.revokeObjectURL(url);
if(typeof navigator.locks?.query!=='function')return {status:'NOT VERIFIED'};
const held=(await navigator.locks.query()).held.filter(lock=>lock.name.includes(state.namespace));
if(held.length)return {status:'NOT VERIFIED',reason:'Owner lease still held; no deletion'};
// A fresh UUID namespace is exclusively created by this one harness Worker.
// It is never exposed as a reusable job/root to another owner; termination precedes cleanup.
const root=await navigator.storage.getDirectory();try {await root.removeEntry(state.namespace,{recursive:true});}catch(error){if(error.name!=='NotFoundError')throw error;}
try{await root.getDirectoryHandle(state.namespace);throw Error('NAMESPACE_REMAINS');}catch(error){if(error.name!=='NotFoundError')throw error;}
return {status:'REMOVED',scope:'fresh UUID harness namespace, never shared or adopted by another owner; sole Worker terminated'};
}"""

def start_server(content):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            item=content.get(self.path)
            if item is None:
                self.send_error(404);return
            body,mime=item;self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start();return server

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bundle',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();out=args.output.resolve();bundle=args.bundle.resolve()
    cloud.require(not out.exists() and not out.is_relative_to(cloud.ROOT),'Use new output directory outside checkout')
    cloud.require(bundle.is_file() and not bundle.is_symlink() and not bundle.is_relative_to(cloud.ROOT),'Use separately built fork outside checkout')
    out.mkdir(parents=True);started=time.monotonic();server=None
    report={'schema':'vr180-output-index-native-probe-v1','status':'BLOCKED','prototypeOnly':True,'decoded':False,'inputForkImplemented':False,
            'pageErrors':[],'workers':[],'cleanup':{'status':'NOT_RUN'},'fullOutputRecovered':False,
            'notVerified':['pixel conversion','WebCodecs pipeline','OS picker','large media','whole-browser memory','public deployment']}
    def deadline(*args):raise cloud.Deadline('Output-index probe deadline')
    signal.signal(signal.SIGALRM,deadline);signal.signal(signal.SIGTERM,deadline);signal.alarm(300)
    try:
        cloud.require(os.environ.get('GITHUB_REPOSITORY')=='Kushyameln01/kushyameln-works','Repository differs')
        source=cloud.source_check(out,candidate=True);report['checkoutCommit']=source['checkoutCommit'];cloud.preflight(out,defer_verification=True)
        build_report=json.loads((bundle.parent/'fork-build-result.json').read_text())
        cloud.require(build_report['status']=='PASS' and build_report['baseline']['status']=='PASS' and build_report['baseline']['comparison']['identical'],'Fork rebuild gate failed')
        cloud.require(build_report['bundleBytes']==bundle.stat().st_size and build_report['bundleSha256']==cloud.digest(bundle),'Fork bundle differs from build proof')
        cloud.require(build_report['controllerSha256']==cloud.digest(cloud.ROOT/'development/vr180/output-index-prototype/output-index.mjs'),'Controller differs from build proof')
        cloud.write(out/'fork-build-result.json',build_report)
        cloud.command(['git','ls-files','--error-unmatch',*FILES,str(Path(__file__).resolve().relative_to(cloud.ROOT))])
        report['harnessSHA256']=cloud.digest(Path(__file__));report['sharedHarnessSHA256']=cloud.digest(Path(cloud.__file__))
        content={'/':(HTML,'text/html'),'/probe-worker.mjs':(WORKER.encode(),'text/javascript'),'/fork.mjs':(bundle.read_bytes(),'text/javascript')}
        for file in FILES:
            path=cloud.ROOT/file;cloud.require(not path.is_symlink(),'Source symlink refused')
            content['/'+file]=(path.read_bytes(),'video/mp4' if file.endswith('.mp4') else 'text/javascript')
        server=start_server(content);origin=f'http://127.0.0.1:{server.server_port}';inventory=[]
        for route,(body,mime) in content.items():
            with urllib.request.urlopen(origin+route,timeout=5) as response:served=response.read(len(body)+1)
            cloud.require(served==body,'Loopback source mismatch');inventory.append({'route':route,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
        cloud.write(out/'private-source-inventory.json',{'checkoutCommit':source['checkoutCommit'],'files':inventory,'exactRoutesOnly':True})
        report['forkSHA256']=cloud.digest(bundle)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=str(cloud.CHROME),headless=True,chromium_sandbox=True,timeout=30000)
            report['browserVersion']=browser.version
            try:
                context=browser.new_context(accept_downloads=True);context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
                page=context.new_page();page.on('pageerror',lambda error:report['pageErrors'].append(str(error)));page.on('worker',lambda worker:report['workers'].append(worker.url))
                try:
                    page.goto(origin+'/',wait_until='networkidle');page.evaluate('()=>{globalThis.__probeResult=null;('+PAGE_PROBE+')().then(r=>globalThis.__probeResult=r,e=>globalThis.__probeResult={status:"FAIL",error:String(e)});}')
                    page.wait_for_function('globalThis.__probeResult!==null',timeout=240000);observed=page.evaluate('globalThis.__probeResult');cloud.write(out/'browser-observations.json',observed)
                    if observed['status']=='BLOCKED':raise cloud.Blocked(str(observed.get('error')))
                    cloud.require(observed['status']=='READY_FOR_DOWNLOAD','Native output-index failed: '+str(observed.get('error')))
                    cloud.require(len(report['workers'])==1 and report['workers'][0]==origin+'/probe-worker.mjs','Dedicated Worker mismatch')
                    success=observed['cases'][0];cloud.check_recovery_budget(out,out,success['bytes'])
                    for index,name in enumerate(['output-index-sbs.mp4','output-index-browser.json']):
                        with page.expect_download(timeout=15000) as download:page.evaluate('([index,name])=>{const a=document.createElement("a");a.href=globalThis.__outputProbe.urls[index];a.download=name;a.click();}',[index,name])
                        download.value.save_as(str(out/name))
                    saved=out/'output-index-sbs.mp4';cloud.require(saved.stat().st_size==success['bytes'] and cloud.digest(saved)==success['sha256'],'Downloaded full output differs')
                    cloud.require(json.loads((out/'output-index-browser.json').read_text())==observed,'Downloaded JSON differs')
                    report['fullOutputRecovered']=True;report['savedFile']={'bytes':saved.stat().st_size,'sha256':cloud.digest(saved),'metadataHashMatched':success['metadataHashMatched']}
                    report['independentMediaAcceptance']='PENDING: root must inspect complete frames/audio/timestamps with independent tooling'
                    cloud.require(not report['pageErrors'],'Unexpected browser page error');report['status']='PASS'
                finally:
                    try:
                        report['cleanup']=page.evaluate(PAGE_CLEANUP)
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
