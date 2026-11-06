#!/usr/bin/env python3
"""Lightweight real Worker/RPC lifecycle checks; no complete P4 inference or model hash."""
import argparse
import functools
import hashlib
import http.server
import json
from pathlib import Path
import re
import subprocess
import threading
import time

from playwright.sync_api import sync_playwright


SCRIPT_ROOT = Path(__file__).resolve().parent
REPOSITORY = SCRIPT_ROOT.parents[3]
DOCS = REPOSITORY / 'docs'
DEFAULT_MODEL = REPOSITORY.parent / 'retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors'


def current_build():
    api = DOCS / 'shared/diffusion-models/api'
    text = (api / 'build-info.mjs').read_text()
    build_id = json.loads(re.search(r'export const BUILD_ID=(.*);', text).group(1))
    sources = json.loads(re.search(r'export const BUILD_SOURCES=Object.freeze\((\{.*\})\);', text, re.S).group(1))
    mismatches = [name for name, expected in sources.items()
                  if hashlib.sha256((api / name).read_bytes()).hexdigest() != expected]
    digest = hashlib.sha256(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if mismatches or build_id != 'diffusion-models/0.1+' + digest:
        raise RuntimeError('Build identity is stale; regenerate build-info before RPC validation: ' + ', '.join(mismatches))
    return {'buildId': build_id, 'sourceCount': len(sources), 'sourceStatus': 'CURRENT'}


def source_commit():
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPOSITORY, text=True).strip()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__normal_rpc_harness__':
            body = b'<!doctype html><meta charset="utf-8"><title>Normal P4 RPC lifecycle</title><input id="model" type="file">'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *_args):
        pass


CASES = r"""async expectedBuild => {
 const {createDiffusionModels,PROTOCOL_VERSION,BUILD_ID}=await import('/shared/diffusion-models/api/index.mjs');
 const checks=[],assert=(value,message)=>{if(!value)throw Error(message);};
 const file=document.querySelector('#model').files[0];assert(file instanceof File,'Real LOW local File is required');
 assert(BUILD_ID===expectedBuild,'Imported build differs from preflight');
 const NativeWorker=window.Worker,observed={created:0,terminated:0,runDispatches:0};
 window.Worker=class extends NativeWorker {
  constructor(...args){super(...args);observed.created++;}
  postMessage(request,...args){if(request?.op==='runP4')observed.runDispatches++;return super.postMessage(request,...args);}
  terminate(){observed.terminated++;return super.terminate();}
 };
 const api=createDiffusionModels();let nextJob=0;const revision=0;
 const envelope=(op,input)=>({protocolVersion:PROTOCOL_VERSION,buildId:BUILD_ID,sessionId:api.sessionId,jobId:'normal-rpc-'+(++nextJob),inputRevision:revision,op,input});
 const verify=(q,r)=>{for(const key of ['protocolVersion','buildId','sessionId','jobId','inputRevision','op'])assert(q[key]===r[key],'Reply identity mismatch: '+key);return r;};
 const ask=async(op,input={})=>{const q=envelope(op,input);return verify(q,await api.request(q));};
 const ok=(r,name)=>{assert(r.status==='ok',name+': '+r.error?.code);return r.result;};
 const refused=(r,code,name)=>{assert(r.status==='error'&&r.error?.code===code,name+' should return '+code);return {status:r.status,code:r.error.code};};
 try {
  const capabilities=ok(await ask('capabilities'),'capabilities'),descriptor=capabilities.executionDescriptor;
  assert(descriptor?.schemaVersion==='diffusion-execution-capabilities/0.1','Execution descriptor missing');
  for(const op of ['prepareP4','runP4','releaseP4','checkSupport'])assert(capabilities[op]===true&&descriptor.controls[op].available===true,'Missing RPC control '+op);
  assert(capabilities.modelInference===false&&descriptor.generationReady===false,'Readiness must remain partial');
  checks.push({name:'capabilities.executionDescriptor',passed:true,operationCount:Object.keys(descriptor.operations).length,controlCount:Object.keys(descriptor.controls).length,modelInference:false,generationReady:false});
  const semantics=structuredClone(descriptor.operations.postSelfAttention.inputs),model={side:'LOW',modelSha256:descriptor.models.LOW};
  const declaration={operation:'postSelfAttention',model,blockIndex:0,contextLatents:[],inputs:{...semantics,conditioning:{...semantics.conditioning,shape:[1,1,4096]}}};
  const supported=ok(await ask('checkSupport',declaration),'checkSupport canonical P4');
  assert(supported.supported===true&&supported.validation==='metadata-only','Canonical L1 descriptor was refused');
  checks.push({name:'checkSupport arbitrary L1 canonical P4',passed:true,supported:true,validation:supported.validation});
  for(const [name,change,code] of [
   ['N32760',q=>q.inputs.residual.shape=[32760,5120],'UNSUPPORTED_SHAPE'],
   ['context',q=>q.contextLatents=[{shape:[1,16,21,60,104]}],'UNSUPPORTED_CONTEXT']
  ]){
   const changed=structuredClone(declaration);change(changed);const support=ok(await ask('checkSupport',changed),'checkSupport '+name);
   assert(support.supported===false&&support.reasons.some(reason=>reason.code===code),'Unsupported '+name+' was accepted');
   checks.push({name:'checkSupport '+name,passed:true,supported:false,codes:support.reasons.map(reason=>reason.code)});
  }
  const runInput=()=>({operation:'postSelfAttention',model,blockIndex:0,contextLatents:[],inputs:{
   residual:{...semantics.residual,data:Float32Array.from({length:10240},(_,i)=>Math.fround(((i%19)-9)/64))},
   timeAct1:{...semantics.timeAct1,data:Float32Array.from({length:5120},(_,i)=>Math.fround(((i%11)-5)/32))},
   conditioning:{...semantics.conditioning,shape:[1,1,4096],data:Float32Array.from({length:4096},(_,i)=>Math.fround(((i%13)-6)/128)),attentionMask:new Uint8Array([1])}
  }});
  checks.push({name:'runP4 before preparation',passed:true,...refused(await ask('runP4',runInput()),'P4_NOT_PREPARED','runP4 before preparation')});
  const prepared=ok(await ask('prepareP4',{file,side:'LOW'}),'prepareP4 real LOW');
  assert(prepared.model?.side==='LOW'&&prepared.model.modelSha256===model.modelSha256,'Prepared side/model mismatch');
  const released=ok(await ask('releaseP4'),'releaseP4');
  assert(released.released===true&&released.activeORTSessions===0&&released.readLeases===0,'Released owner retains a native session or read lease');
  checks.push({name:'prepare/release real LOW owner',passed:true,released:true,activeORTSessions:released.activeORTSessions,readLeases:released.readLeases});
  const preparedAgain=ok(await ask('prepareP4',{file,side:'LOW'}),'prepareP4 again');assert(preparedAgain.model.side==='LOW','Second preparation changed side');
  const request=envelope('runP4',runInput()),dispatchesBefore=observed.runDispatches,workersBefore=observed.created,started=performance.now();
  const pending=api.request(request);let cancelReply,timerFired=false;
  const timer=setTimeout(()=>{timerFired=true;cancelReply=api.cancel({sessionId:api.sessionId,jobId:request.jobId,inputRevision:request.inputRevision});},20);
  let terminal;try{terminal=verify(request,await pending);}finally{clearTimeout(timer);}
  assert(timerFired&&observed.runDispatches===dispatchesBefore+1,'Cancellation must target a dispatched pending Worker request');
  refused(terminal,'CANCELLED','Original pending runP4');
  assert(cancelReply?.status==='ok'&&cancelReply.result.cancelled===true&&cancelReply.result.workerTerminated===true,'Owned Worker termination ACK missing');
  checks.push({name:'cancel actual pending runP4 Worker',passed:true,originalTerminal:terminal.error.code,workerTerminated:true,cancelDelayMs:20,terminalElapsedMs:performance.now()-started,completeP4ResultProduced:false});
  const afterCancel=await ask('runP4',runInput());refused(afterCancel,'P4_NOT_PREPARED','Recreated Worker must require preparation');
  assert(observed.created===workersBefore+1,'Cancelled Worker was not replaced');
  checks.push({name:'Worker recreation loses prepared P4 owner',passed:true,status:afterCancel.status,code:afterCancel.error.code,newWorkerCreated:true});
  const disposed=ok(await ask('dispose'),'dispose');assert(disposed.disposed===true,'Dispose ACK missing');
  refused(await ask('capabilities'),'DISPOSED','Disposed API');
  checks.push({name:'dispose is terminal',passed:true,disposed:true});
  return {schemaVersion:'diffusion-normal-rpc-browser/0.1',passed:true,buildId:BUILD_ID,checks,workerLifecycle:observed,acceptance:{scope:'Normal metadata RPC and real LOW prepare/release plus in-flight Worker cancellation only',fullP4InferenceCompleted:false,numericalAcceptanceClaimed:false,wholeModelHashRecomputed:false,modelInference:false,generationReady:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'}};
 } finally {api.dispose();window.Worker=NativeWorker;}
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=DEFAULT_MODEL)
    parser.add_argument('--output', type=Path, default=SCRIPT_ROOT / 'rpc-browser.json')
    args = parser.parse_args()
    began = time.perf_counter()
    report = {'schemaVersion': 'diffusion-normal-rpc-browser/0.1', 'passed': False,
              'sourceCommitBefore': source_commit(), 'modelFileBytes': args.model.stat().st_size,
              'modelFileHashRecomputed': False}
    server = None
    try:
        before = current_build()
        handler = functools.partial(Handler, directory=str(DOCS))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                 args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.set_default_timeout(180000)
                page_errors = []
                page.on('pageerror', lambda error: page_errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/__normal_rpc_harness__')
                page.locator('#model').set_input_files(str(args.model.resolve()))
                result = page.evaluate(CASES, before['buildId'])
                report.update(result)
                report.update(browser=browser.version, pageErrors=page_errors, buildPreflight=before,
                              buildAfter=current_build(), sourceCommitAfter=source_commit())
                if page_errors or report['buildAfter'] != before:
                    raise RuntimeError('Browser error or source/build change during validation')
            finally:
                browser.close()
    except Exception as error:
        report.update(passed=False, errorType=type(error).__name__, error=str(error))
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
        report['elapsedSeconds'] = time.perf_counter() - began
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'checks': len(report.get('checks', [])),
                      'output': str(args.output), 'error': report.get('error')}))
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
