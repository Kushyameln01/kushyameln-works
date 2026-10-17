#!/usr/bin/env python3
"""Private bounded-index WebCodecs conversion in sandboxed cloud Chrome."""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
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
async function run({namespace,cases}){
 const result={status:'READY_FOR_DOWNLOAD',cases:[],files:[],nativeOPFS:true,nativeWebLocks:true,
   decoded:true,pixelConversion:true,publicProduct:false};
 try{
  require(isSecureContext&&navigator.storage?.getDirectory&&navigator.locks?.request,'NATIVE_CAPABILITY_UNAVAILABLE');
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
   try{
    outcome=await convertStereo(file,trial.settings,{fork,indexRoot:root,outputHandle:handle,jobId,signal:aborter.signal,
      onCleanup:cleanup=>{ownerCleanup=cleanup;},onOutputCreated:output=>{tx=output;},
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
    row.error=describe(error);row.metrics=latestMetrics;row.saveOutputState=error.saveOutputState??tx?.status??null;
    row.saveWriteCommitted=row.saveOutputState?.committed===true;
    if(trial.expectCancel&&row.cancelRequested&&error.name==='AbortError'&&!row.saveWriteCommitted){
     row.status='EXPECTED_CANCELLATION';
    }else{row.status='FAIL';result.status='FAIL';}
   }finally{
    try{await ownerCleanup?.();}catch(error){row.cleanupError=describe(error);row.status='FAIL';result.status='FAIL';}
   }
   row.elapsedMs=performance.now()-started;row.finalFileState=tx?.status??null;
   row.indexDirectoriesRemoved=await missing(root,jobId+'-in')&&await missing(root,jobId+'-out');
   row.heldJobLocks=(await navigator.locks.query()).held.filter(lock=>lock.name.includes(jobId)).length;
   row.indexReservedAfterCleanup=row.metrics?.indexReservedAfterCleanup??null;
   if(!row.indexDirectoriesRemoved||row.heldJobLocks!==0||row.indexReservedAfterCleanup!==0){row.status='FAIL';result.status='FAIL';}
   if(trial.expectCancel){row.savedBytes=(await handle.getFile()).size;
    if(row.savedBytes!==0||row.finalFileState?.state!=='aborted'){row.status='FAIL';result.status='FAIL';}}
   if(result.status==='FAIL')break;
  }
 }catch(error){result.status=/UNAVAILABLE|not supported|not allowed/i.test(error.message)?'BLOCKED':'FAIL';result.error=describe(error);}
 result.unhandledRejectionCount=unhandledCount;if(unhandledCount)result.status='FAIL';return result;
}
self.onmessage=({data})=>run(data).then(result=>self.postMessage({result}),error=>self.postMessage({result:{status:'FAIL',error:describe(error),cases:[],files:[]}}));
"""
PAGE=r"""async(cases)=>{
 const state=globalThis.__indexedProbe={namespace:'v-'+crypto.randomUUID(),worker:null,urls:[],record:null,unhandledErrors:[]};
 try{
  const worker=state.worker=new Worker('/probe-worker.mjs',{type:'module'});
  const result=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{
   if(data.unhandledError){if(state.unhandledErrors.length<8)state.unhandledErrors.push(data.unhandledError);}
   else if(data.result)resolve(data.result);
  };worker.onerror=e=>reject(Error(e.message));worker.postMessage({namespace:state.namespace,cases});});
  await new Promise(resolve=>setTimeout(resolve,0));result.unhandledErrors=state.unhandledErrors;
  if(result.unhandledErrors.length)result.status='FAIL';
  const files=result.files;result.files=files.map(({caseIndex,name})=>({caseIndex,name}));
  state.urls=files.map(({file})=>URL.createObjectURL(file));state.record=result;
  state.urls.push(URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})));
 }catch(error){state.record={status:'FAIL',error:{name:error.name,message:error.message},cases:[],files:[]};}
 return state.record;
}"""
CLEANUP=base.PAGE_CLEANUP.replace('__outputProbe','__indexedProbe')

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
      'notVerified':['OS picker','whole-browser native/GPU memory','large media','target VR player','public deployment']}
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
