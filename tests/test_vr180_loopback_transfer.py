"""Small contract/loopback tests; no native-browser or 128 MiB qualification."""
import contextlib
import hashlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('loopback_probe',ROOT/'tools/vr180/probe-loopback-transfer.py')
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)


class LoopbackTransferTests(unittest.TestCase):
    def test_exact_origin_guard_has_the_same_admission_boundary_without_local_interception(self):
        origin='http://127.0.0.1:12345';pattern=probe.external_guard(origin)
        urls=[origin+'/',origin+'/transfer/'+32*'a'+'/input/chunk',origin+'/?next=https://foreign.invalid/',
              origin,origin+'0/',origin+'.foreign.invalid/',origin+'@foreign.invalid/',
              'http://127.0.0.1:12346/','https://127.0.0.1:12345/',
              'http://localhost:12345/','https://example.invalid/','data:text/plain,local','file:///tmp/local']
        for url in urls:self.assertEqual(bool(pattern.search(url)),not url.startswith(origin+'/'),url)
        for invalid in ['http://127.0.0.1:0','http://127.0.0.1:65536','http://127.0.0.1:12345/',
                        'http://127.0.0.1:12345@foreign.invalid','https://127.0.0.1:12345']:
            with self.assertRaises(ValueError):probe.external_guard(invalid)
        for mode in ['baseline','filtered']:
            registered=[];observed={'intercepted':0,'continued':0,'aborted':0}
            probe.install_guard(types.SimpleNamespace(route=lambda pattern,fn:registered.append((pattern,fn))),origin,mode,observed)
            matcher,handler=registered[0]
            for url in urls:
                calls=[]
                if matcher=='**/*' or matcher.search(url):
                    handler(types.SimpleNamespace(request=types.SimpleNamespace(url=url),continue_=lambda:calls.append('continue'),abort=lambda:calls.append('abort')))
                self.assertEqual(calls,['continue'] if mode=='baseline' and url.startswith(origin+'/') else [] if url.startswith(origin+'/') else ['abort'])
            self.assertEqual(observed['continued'],3 if mode=='baseline' else 0)

    def test_actual_http10_receiver_preserves_partial_metrics_and_completed_full_hash_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            values={'input':b'a'*(probe.CHUNK_BYTES+7),'output':b'b'*37}
            entries=[{'id':key,'name':key+'.mp4','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for key,data in values.items()]
            receiver=probe.streaming.MediaReceiver(temp,{'input':2*probe.CHUNK_BYTES,'output':probe.CHUNK_BYTES},time.monotonic()+30)
            receiver.prepare(entries);token='a'*32;server=probe.streaming.start_server({},receiver,token)
            origin='http://127.0.0.1:'+str(server.server_port)
            def request(ident,action,data,offset=None):
                connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                try:
                    headers={'Origin':origin}
                    if offset is not None:headers['X-Byte-Offset']=str(offset)
                    connection.request('POST','/transfer/'+token+'/'+ident+'/'+action,data,headers)
                    response=connection.getresponse();self.assertEqual(response.version,10);self.assertTrue(response.will_close)
                    return response.status,json.loads(response.read())
                finally:connection.close()
            try:
                for offset in range(0,len(values['input']),probe.CHUNK_BYTES):
                    self.assertEqual(request('input','chunk',values['input'][offset:offset+probe.CHUNK_BYTES],offset)[0],200)
                self.assertEqual(request('input','complete',b'')[0],200)
                self.assertEqual(request('output','chunk',values['output'][:17],0)[0],200)
                self.assertEqual(request('output','chunk',b'b',0)[0],400)
                partial=receiver.observation();self.assertEqual(partial['files'][0]['receipt']['rereadSHA256'],entries[0]['sha256'])
                self.assertTrue(partial['files'][0]['receipt']['closed'] and partial['files'][0]['receipt']['fsynced'])
                self.assertEqual(partial['files'][1]['receivedBytes'],17);self.assertIsNone(partial['files'][1]['receipt'])
                self.assertEqual(partial['phases']['bodyRead']['count'],4)
                self.assertEqual(partial['phases']['writeAndHash']['count'],4);self.assertEqual(partial['phases']['writeAndHash']['failed'],1)
                self.assertEqual(request('output','chunk',values['output'][17:],17)[0],200)
                self.assertEqual(request('output','complete',b'')[0],200)
                self.assertEqual(len(receiver.receipts()),2)
                final=receiver.observation()
                for phase in final['phases'].values():self.assertGreaterEqual(phase['totalSeconds'],phase['maxSeconds']);self.assertGreaterEqual(phase['maxSeconds'],0)
                self.assertEqual(final['phases']['completeAndReread']['count'],2)
                self.assertEqual(partial['phases']['completeAndReread']['count'],1,'snapshot must not alias later mutation')
            finally:server.shutdown();server.server_close();receiver.abort()

    def test_actual_transfer_has_bounded_success_and_partial_failure_phase_observations(self):
        code=r'''import assert from 'node:assert/strict';
const transfer=__TRANSFER_FUNCTION__;
const input=new Blob([new Uint8Array(1048577)]),output=new Blob([new Uint8Array(7)]),hash='a'.repeat(64);
for(const fail of [false,true]){
 let requests=0;globalThis.__long={result:{status:'READY_FOR_RUNNER_TRANSFER'},files:[{id:'input',bytes:input.size,sha256:hash,file:input},{id:'output',bytes:output.size,sha256:hash,file:output}]};
 globalThis.fetch=async(url,options)=>{requests++;if(fail&&requests===2)throw Error('INJECTED_FETCH_FAILURE');
  const id=url.includes('/input/')?'input':'output',file=id==='input'?input:output;
  assert(options.body.byteLength<=1048576);assert(options.signal instanceof AbortSignal);
  return {ok:true,json:async()=>url.endsWith('/chunk')?{id,acceptedBytes:Number(options.headers['X-Byte-Offset'])+options.body.byteLength}:{bytes:file.size,sha256:hash,rereadSHA256:hash,fsynced:true,closed:true}};
 };
 transfer('b'.repeat(32));for(let i=0;i<1000&&!globalThis.__long.transfer;i++)await new Promise(resolve=>setTimeout(resolve,1));
 const result=globalThis.__long.transfer,partial=globalThis.__long.transferProgress;assert(result);assert.equal(result.status,fail?'FAIL':'PASS');
 assert.equal(partial.files.length,fail?1:2);assert.equal(partial.phases.fetch.count,fail?2:3);assert.equal(partial.phases.fetch.failed,fail?1:0);
 assert.equal(partial.files[0].acknowledgedBytes,fail?1048576:1048577);assert.equal(partial.files[0].readBytes,1048577);
 assert.equal(partial.files[0].complete,!fail);assert.equal(partial.phases.completeFetch.count,fail?0:2);
 for(const phase of Object.values(partial.phases)){assert(phase.totalMs>=phase.maxMs);assert(phase.maxMs>=0);}
 if(fail)assert.match(result.error,/INJECTED_FETCH_FAILURE/);
}
'''.replace('__TRANSFER_FUNCTION__','('+probe.probe.TRANSFER+')')
        subprocess.run(['node','--input-type=module'],input=code,text=True,capture_output=True,check=True,timeout=10)

    def test_fixed_profile_and_worker_parse_without_a_native_acceptance_claim(self):
        self.assertEqual(probe.FILE_BYTES,128*1024**2);self.assertEqual(probe.MODES,('baseline','filtered','baseline'))
        self.assertEqual(probe.DEADLINE_SECONDS,300);self.assertEqual(probe.probe.PROFILES['p5-5gb']['transferSeconds'],600)
        self.assertEqual(probe.probe.PROFILES['p5-10gb']['transferSeconds'],900)
        subprocess.run(['node','--input-type=module','--check'],input=probe.WORKER,text=True,capture_output=True,check=True)

    def test_producer_retains_server_receipt_when_browser_snapshot_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp);owned=probe.persistent.create_owned_profile(path);media=path/'media';media.mkdir()
            receiver=probe.streaming.MediaReceiver(media,{'input':32,'output':32},time.monotonic()+30)
            entries=[{'id':key,'name':key+'.mp4','bytes':len(value),'sha256':hashlib.sha256(value).hexdigest()} for key,value in [('input',b'complete'),('output',b'partial')]]
            receiver.prepare(entries);receiver.chunk('input',0,b'complete');receiver.complete('input');receiver.chunk('output',0,b'par')
            browser=types.SimpleNamespace(version='test-only',connected=True);browser.is_connected=lambda:browser.connected
            class Page:
                def set_default_timeout(self,*_):pass
                def on(self,*_):pass
                def goto(self,*_,**__):pass
                def evaluate(self,text,_arg=None):
                    if text==probe.probe.PAGE:return None
                    if text==probe.probe.CLEANUP:return {'status':'REMOVED'}
                    raise RuntimeError('BROWSER_SNAPSHOT_FAILED')
            class Context:
                def __init__(self):self.browser=browser
                def route(self,*_):pass
                def new_page(self):return Page()
                def close(self):browser.connected=False
            playwright=types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=lambda **kw:Context()))
            sampler=types.SimpleNamespace(start=lambda:None,stop=lambda:{'status':'MOCK'})
            report={'pageErrors':[],'workers':[]}
            try:
                with patch.object(probe.probe,'wait_native',side_effect=RuntimeError('PRIMARY_FAILURE')),patch.object(probe.probe.calibration,'ChromeRssSampler',return_value=sampler):
                    with self.assertRaisesRegex(RuntimeError,'PRIMARY_FAILURE'):
                        probe.probe.browser_trial(playwright,owned,'http://127.0.0.1:12345','p5-5gb',receiver,'a'*32,path,report,time.monotonic()+30)
                record=json.loads((path/'browser-lifecycle.json').read_text())
                self.assertEqual(record['runnerTransferObservationError'],'BROWSER_SNAPSHOT_FAILED')
                server=record['runnerTransferObservation']['server'];self.assertEqual(server['files'][0]['receipt']['rereadSHA256'],entries[0]['sha256'])
                self.assertEqual(server['files'][1]['receivedBytes'],3);self.assertIsNone(record['runnerTransferObservation']['browser'])
                self.assertEqual(report['profileCleanup']['status'],'REMOVED')
            finally:receiver.abort()

    def test_preflight_failure_still_emits_bounded_raw_evidence_and_never_starts_native_work(self):
        with tempfile.TemporaryDirectory() as temp,contextlib.redirect_stdout(io.StringIO()) as output,patch.dict(os.environ,{'GITHUB_REPOSITORY':'wrong'}):
            out=Path(temp)/'run';self.assertEqual(probe.main(['--output',str(out)]),1)
            report=json.loads((out/'evidence/run.json').read_text());self.assertEqual(report['status'],'FAIL');self.assertEqual(report['trials'],[])
            self.assertEqual(report['trialRecords'],[]);self.assertFalse(report['mediaArtifactReady'])
            self.assertIn('VR180_EVIDENCE_BEGIN ',output.getvalue());self.assertIn('VR180_EVIDENCE_END ',output.getvalue())


if __name__=='__main__':unittest.main()
