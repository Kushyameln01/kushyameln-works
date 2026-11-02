"""NN0 suite control-flow tests: real acceptance branch and real tensor checks.

Browser/download ownership is a control double. Tiny synthetic native-L tensors
exercise failure collection only; they are never model numerical evidence.
"""
import contextlib,copy,io,json,shutil,sys,tempfile,time,types,unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from test_plain_failure_controls import target,compiled_finalization,Noop

class ControlReferencePreflight(unittest.TestCase):
 def fixture(self,folder):
  ns,_,_=target('accept_plain.py');self.assertTrue(callable(ns.get('validate_suite_control_references')),'Control inputs and recovery references must be checked before any NN execution')
  root=Path(folder);source='d'*40;manifest='f'*64
  inputs=[{'id':name,'input':{'tokenIds':[1],'attentionMask':[1]},'tokenIds':[1],'attentionMask':[1],'shape':[1,1,4096],'manifestSha256':manifest,'executionSourceSha':source,'oracleUsesFull512Positions':True}for name in ['normal','recovery']]
  oracle={}
  for record in inputs:
   raw=np.zeros((1,1,4096),dtype='<f4').tobytes();(root/(record['id']+'-reference.f32')).write_bytes(raw)
   oracle[record['id']]={'input':copy.deepcopy(record),'oracleInternalShape':[1,512,4096],'reference':{'bytes':len(raw),'sha256':ns['sha'](raw)}}
  plan={'cases':[{'id':record['id'],'input':copy.deepcopy(record['input'])}for record in inputs],'controls':[{'id':'save','caseId':'normal','action':'cancel-save'},{'id':'cancel-recover','caseId':'recovery','action':'cancel','recover':True}]}
  def run(selected=None):return ns['validate_suite_control_references'](plan,inputs,['normal'] if selected is None else selected,oracle,root,source,manifest)
  return run,inputs,oracle,plan,root
 def test_unselected_recovery_reference_is_prehashed_without_running_it(self):
  with tempfile.TemporaryDirectory() as folder:
   run,inputs,oracle,plan,root=self.fixture(folder);records,checks=run()
   self.assertEqual([record['id']for record in records],['recovery']);self.assertEqual({check['id']for check in checks},{'normal','recovery'});self.assertTrue(all(check['passed']for check in checks))
 def test_last_reference_byte_change_is_rejected_before_execution(self):
  with tempfile.TemporaryDirectory() as folder:
   run,inputs,oracle,plan,root=self.fixture(folder);path=root/'recovery-reference.f32';raw=path.read_bytes();path.write_bytes(raw[:-1]+bytes([raw[-1]^1]))
   with self.assertRaisesRegex(ValueError,'reference bytes/hash'):run()
 def test_control_input_must_match_the_independent_oracle(self):
  with tempfile.TemporaryDirectory() as folder:
   run,inputs,oracle,plan,root=self.fixture(folder);inputs[1]['input']['tokenIds'][0]=2
   with self.assertRaisesRegex(ValueError,'input|oracle'):run()
 def test_control_source_and_full512_reference_scope_are_required(self):
  for field,value in [('executionSourceSha','e'*40),('oracleUsesFull512Positions',False)]:
   with self.subTest(field=field),tempfile.TemporaryDirectory() as folder:
    run,inputs,oracle,plan,root=self.fixture(folder);inputs[1][field]=value;oracle['recovery']['input']=copy.deepcopy(inputs[1])
    with self.assertRaisesRegex(ValueError,'source|full512'):run()
 def test_save_control_cannot_be_silently_skipped_when_its_case_is_not_selected(self):
  with tempfile.TemporaryDirectory() as folder:
   run,inputs,oracle,plan,root=self.fixture(folder)
   with self.assertRaisesRegex(ValueError,'save.*selected'):run([])

class SuiteFailureCollection(unittest.TestCase):
 def execute(self,fault=None):
  ns,main,path=target('accept_plain.py')
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);output=root/'output';reference=root/'reference';output.mkdir();reference.mkdir();model='a'*64;tokenizer='b'*64
   inputs=[{'id':name,'input':{'tokenIds':[1],'attentionMask':[1]},'tokenIds':[1],'attentionMask':[1],'shape':[1,1,4096],'manifestSha256':'f'*64,'executionSourceSha':'d'*40,'oracleUsesFull512Positions':True}for name in ['first','second']]
   (reference/'text-inputs.json').write_text(json.dumps({'inputs':inputs}))
   for record in inputs:np.zeros((1,1,4096),dtype='<f4').tofile(reference/(record['id']+'-reference.f32'))
   artifacts={}
   for i,record in enumerate(inputs):
    values=np.zeros((1,1,4096),dtype='<f4');values[0,0,0]=np.nan if fault=='nonfinite-artifact' and i==0 else .002 if i==0 else 0;payload=values.tobytes()
    meta={'schemaVersion':1,'dtype':'float32','byteOrder':'little','layout':'BLC','meaning':'text_hidden_states','shape':[1,1,4096],'byteLength':len(payload),'dataSha256':ns['sha'](payload),'modelSha256':model,'tokenizerSha256':tokenizer,'normalization':'umt5-final-rmsnorm-f32-v1','attentionMask':[1]};header=json.dumps(meta).encode();raw=b'WKTSR001'+len(header).to_bytes(4,'little')+header+payload
    if fault=='corrupt-artifact' and i==0:raw=raw[:-1]+bytes([raw[-1]^1])
    target_path=root/(record['id']+'.wktensor');target_path.write_bytes(raw);artifacts[record['id']]=target_path
   recovery_raw=artifacts['second'].read_bytes();recovery_path=root/'recovery.wktensor';recovery_path.write_bytes(recovery_raw);artifacts['recovery']=recovery_path
   if fault=='corrupt-recovery':recovery_path.write_bytes(recovery_raw[:-1]+bytes([recovery_raw[-1]^1]))
   if fault=='corrupt-control-reference':
    path=reference/'second-reference.f32';raw=path.read_bytes();path.write_bytes(raw[:-1]+bytes([raw[-1]^1]))
   reference_records={record['id']:{'input':copy.deepcopy(record),'oracleInternalShape':[1,512,4096],'reference':{'bytes':4096*4,'sha256':ns['sha'](np.zeros((1,1,4096),dtype='<f4').tobytes())}}for record in inputs}
   calls=[]
   class Page:
    current=None
    def set_default_timeout(self,*a):pass
    def on(self,*a):pass
    def goto(self,*a,**kw):pass
    def wait_for_function(self,*a):pass
    def set_input_files(self,*a):pass
    def evaluate(self,expression,spec):
     if spec['inputs']:
      self.current=spec['inputs'][0]['id'];calls.append(self.current)
      return {'passed':not(fault=='native-failure' and self.current=='first'),'error':'Injected native failure','cases':[{'id':self.current}],'controls':[{'id':'save','passed':True}] if self.current=='first' else []}
     calls.append('controls');self.current='recovery';return {'passed':True,'controls':[{'id':'cancel-recover','caseId':'second','passed':True,'recovery':{'passed':True,'download':{'name':'recovery-cancel-recover.wktensor','bytes':len(recovery_raw),'sha256':ns['sha'](recovery_raw),'readback':{'passed':True,'metadataExact':True,'allValuesExact':True}}}}]}
    @contextlib.contextmanager
    def expect_download(self,**kw):yield types.SimpleNamespace(value=types.SimpleNamespace(save_as=lambda destination:shutil.copyfile(artifacts[self.current],destination)))
   page=Page()
   class Context:
    def route(self,*a):pass
    def new_page(self):return page
    def close(self):pass
   class Browser:
    version='NN0-control-double'
    def new_context(self,**kw):return Context()
    def close(self):pass
   @contextlib.contextmanager
   def sync_playwright():yield types.SimpleNamespace(chromium=types.SimpleNamespace(launch=lambda **kw:Browser()))
   fake=types.ModuleType('playwright.sync_api');fake.sync_playwright=sync_playwright
   gate={'maxAbsError':.001,'rtol':.001,'registeredBeforeComparison':True,'scope':'FP32 source-reference diagnostics; no original workflow quality guarantee'}
   manifest={'modelSha256':model,'tokenizer':{'path':'spiece.model','sha256':tokenizer},'numericGate':gate,'blocks':[{'path':str(i)}for i in range(24)],'embedding':{'rowHashes':{'path':'rows'}},'finalNorm':{'path':'norm'}}
   events=[]
   for record in inputs:
    for name,count in [('ort-create-end',24),('ort-run-end',24),('ort-release-end',24),('tensor-dispose-end',72)]:events.extend({'source':'worker','phase':'case:'+record['id'],'event':name,'wasmMemories':[{'capacityBytes':65536}]}for _ in range(count))
   report={'passed':False,'pageErrors':[],'blockedRequests':[],'consoleErrors':[],'httpRequests':[],'progress':[],'memoryEvents':events,'memoryTimeline':[{'epochMs':0,'elapsedSeconds':0,'rssSumBytes':0,'pssSumBytes':0,'pssComplete':True,'processes':[]}]}
   ns.update(a=types.SimpleNamespace(browser='control',output=output,reference=reference,bundle=root,source=root/'model',preflight_only=False,execution_source_sha='c'*40,skip_controls=False),suite_mode=True,inputs=inputs,input_record=inputs[0],reference_source_sha='d'*40,manifest=manifest,oracle_cases=reference_records,plan={'cases':[{'id':record['id'],'input':copy.deepcopy(record['input'])}for record in inputs],'controls':[{'id':'save','caseId':'first','action':'cancel-save'},{'id':'cancel-recover','caseId':'second','action':'cancel','recover':True}],'negativeCases':[]},report=report,base='http://control.invalid',server_errors=[],server=Noop(),serverthread=Noop(),memory_stop=Noop(),memorythread=Noop(),owner=types.SimpleNamespace(finish=lambda **kw:{'liveAfterClose':[],'zombiesAfterClose':[],'errors':[]}),group_peak=0,memory_samples=0,pid_peaks={},start=time.monotonic(),served={})
   exec(compiled_finalization(main,path,'browser'),ns)
   with patch.dict(sys.modules,{'playwright.sync_api':fake}),contextlib.redirect_stdout(io.StringIO()):code=ns['run_finalization']()
   receipt=json.loads((output/'browser-results.json').read_text());handoff=json.loads((output/'conditioning-handoff.json').read_text()) if (output/'conditioning-handoff.json').exists() else None
   return code,receipt,handoff,calls
 def test_numeric_failure_keeps_later_case_controls_and_recovery_but_exits_failed(self):
  code,receipt,handoff,calls=self.execute()
  self.assertEqual(calls,['first','second','controls'],'A numerical rejection must not skip remaining independent cases or native controls')
  self.assertEqual(code,1);self.assertFalse(receipt['passed']);self.assertEqual([item['passed']for item in receipt['comparisons']],[False,True]);self.assertEqual(receipt['numericFailures'][0]['id'],'first')
  self.assertTrue(receipt['native']['controls'][-1]['recovery']['comparison']['passed']);self.assertFalse(handoff['passed']);self.assertEqual(receipt['failure']['name'],'NumericGateFailure')
  recovery=receipt['native']['controls'][-1]['recovery'];self.assertEqual(recovery['artifact']['path'],'recovery-cancel-recover.wktensor');self.assertTrue(recovery['comparison']['allValuesCompared']);self.assertNotIn('values',recovery)
 def test_native_failure_still_stops_the_suite(self):
  code,receipt,handoff,calls=self.execute('native-failure');self.assertEqual(code,1);self.assertFalse(receipt['passed']);self.assertEqual(calls,['first']);self.assertIsNone(handoff);self.assertIn('Injected native failure',receipt['failure']['message'])
 def test_corrupt_output_still_stops_before_later_cases_or_controls(self):
  code,receipt,handoff,calls=self.execute('corrupt-artifact');self.assertEqual(code,1);self.assertFalse(receipt['passed']);self.assertEqual(calls,['first']);self.assertIsNone(handoff);self.assertIn('hash mismatch',receipt['failure']['message'])
 def test_nonfinite_output_is_a_native_contract_failure_and_stops_the_suite(self):
  code,receipt,handoff,calls=self.execute('nonfinite-artifact');self.assertEqual(code,1);self.assertFalse(receipt['passed']);self.assertEqual(calls,['first']);self.assertIsNone(handoff);self.assertIn('finite',receipt['failure']['message'])
 def test_control_reference_corruption_rejects_before_any_native_case(self):
  code,receipt,handoff,calls=self.execute('corrupt-control-reference');self.assertEqual(code,1);self.assertFalse(receipt['passed']);self.assertEqual(calls,[]);self.assertIsNone(handoff);self.assertIn('Control reference bytes/hash',receipt['failure']['message'])
 def test_recovery_artifact_corruption_rejects_even_when_control_reports_success(self):
  code,receipt,handoff,calls=self.execute('corrupt-recovery');self.assertEqual(code,1);self.assertFalse(receipt['passed']);self.assertEqual(calls,['first','second','controls']);self.assertIsNone(handoff);self.assertIn('Recovery artifact bytes/hash',receipt['failure']['message'])

if __name__=='__main__':unittest.main()
