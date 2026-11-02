"""NN0 artifact/stop-policy controls; no ORT session, model load or export."""
import copy,hashlib,importlib.util,json,struct,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('diagnostic_target',HERE/'diagnose_block.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class BlockOptionPreflight(unittest.TestCase):
 def fixture(self,root):
  self.assertTrue(callable(getattr(module,'block_options_preflight',None)),'A bounded same-source block option diagnostic is missing')
  bundle=root/'bundle';reference=root/'source';bundle.mkdir();reference.mkdir()
  # Tiny fixture bytes validate the real file/hash guards under explicit mock
  # pins. They are not valid NN graphs or source checkpoints.
  artifacts={'source-hidden-18.f32':b'input-18','source-hidden-19.f32':b'output-19','final-norm.f32':b'norm','source-norm-rows-19.f32':b'rows'}
  records={}
  for name,raw in artifacts.items():
   (reference/name).write_bytes(raw);records[name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
  graph=b'not-a-model';(bundle/'block-19.onnx').write_bytes(graph)
  pins={'manifestSha256':None,'graphBytes':len(graph),'graphSha256':hashlib.sha256(graph).hexdigest(),
   'inputSha256':records['source-hidden-18.f32']['sha256'],'sourceSha256':records['source-hidden-19.f32']['sha256'],
   'allLocalSha256':'f'*64,'normSha256':records['final-norm.f32']['sha256'],'rowsSha256':records['source-norm-rows-19.f32']['sha256'],
   'tensorBytes':len(artifacts['source-hidden-18.f32']),'sourceBytes':len(artifacts['source-hidden-19.f32']),
   'normBytes':len(artifacts['final-norm.f32']),'rowsBytes':len(artifacts['source-norm-rows-19.f32'])}
  manifest={'modelSha256':'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68','finalNorm':{'sha256':pins['normSha256'],'epsilon':1e-6},
   'blocks':[{'index':i,'path':f'block-{i:02}.onnx','bytes':len(graph),'sha256':pins['graphSha256']}for i in range(24)]}
  raw=json.dumps(manifest).encode();(bundle/'manifest.json').write_bytes(raw);pins['manifestSha256']=hashlib.sha256(raw).hexdigest()
  inp={'id':'id-l512-all-active','attentionMask':[1]*512,'shape':[1,512,4096],'tokenIds':[0]*512,'manifestSha256':pins['manifestSha256']}
  layers=[{'index':i,'hiddenSha256':pins['inputSha256'] if i==18 else pins['sourceSha256'],'matchesOriginalOracle':True}for i in range(24)]
  source={'passed':True,'executionSourceSha':'a'*40,'originalOracleExecutionSha':'5954d48e0fb6df1d6977964fd8a7ba2a242b6eff',
   'manifest':{'sha256':pins['manifestSha256']},'input':inp,'allLayerDigestsMatchOriginalOracle':True,'sourceFinalMatchesOriginalOracle':True,'selectedNormRows':[0,1,255,511],'layers':layers,'files':records}
  native={'passed':True,'executionSourceSha':'b'*40,'sourceCheckpointExecutionSha':source['executionSourceSha'],'originalOracleExecutionSha':source['originalOracleExecutionSha'],
   'input':copy.deepcopy(inp),'manifest':copy.deepcopy(source['manifest']),'preservedCanaryReproducedBitwise':True,'finalFixedGatePassed':False,
   'native':{'options':{'executionProviders':['wasm'],'graphOptimizationLevel':'all','extra':{'session':{'disable_prepacking':'1','use_ort_model_bytes_directly':'1'}}},
    'layers':[{'index':i,'graphSha256':pins['graphSha256'],'input':{'sourceSha256':pins['inputSha256']},'output':{'localSha256':pins['allLocalSha256'],'sourceSha256':pins['sourceSha256']}}for i in range(24)]}}
  (reference/'trace-source-results.json').write_text(json.dumps(source));native_path=root/'native.json';native_path.write_text(json.dumps(native))
  def run(index=19):
   with patch.dict(module.BLOCK19_PINS,pins,clear=True):return module.block_options_preflight(bundle,reference,native_path,index)
  return run,bundle,reference,native_path,source,native
 def test_only_selected_existing_graph_and_relevant_hashes_are_required(self):
  with tempfile.TemporaryDirectory() as folder:
   run,bundle,reference,native_path,source,native=self.fixture(Path(folder));value=run()
   self.assertEqual(value['layerIndex'],19);self.assertEqual(value['expectedAllLocalSha256'],'f'*64);self.assertEqual(value['newExports'],0);self.assertEqual(value['newSourceRuns'],0)
 def test_modified_last_source_byte_rejects_before_any_native_process(self):
  with tempfile.TemporaryDirectory() as folder:
   run,bundle,reference,native_path,source,native=self.fixture(Path(folder));path=reference/'source-hidden-18.f32';raw=path.read_bytes();path.write_bytes(raw[:-1]+bytes([raw[-1]^1]))
   with self.assertRaisesRegex(ValueError,'checkpoint.*hash'):run()
 def test_other_layer_and_changed_creation_options_are_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   run,bundle,reference,native_path,source,native=self.fixture(Path(folder))
   with self.assertRaisesRegex(ValueError,'block19'):run(20)
   native['native']['options']['extra']['session']['disable_prepacking']='0';native_path.write_text(json.dumps(native))
   with self.assertRaisesRegex(ValueError,'options'):run()
 def test_wrong_all_baseline_or_mask_cannot_be_relabelled_as_selected_evidence(self):
  for change in [lambda d:d['native']['layers'][19]['output'].__setitem__('localSha256','0'*64),lambda d:d['input']['attentionMask'].__setitem__(0,0)]:
   with tempfile.TemporaryDirectory() as folder:
    run,bundle,reference,native_path,source,native=self.fixture(Path(folder));change(native);native_path.write_text(json.dumps(native))
    with self.assertRaises(ValueError):run()

class BoundedNativeControlFlow(unittest.TestCase):
 def execute(self,failure=None,material=False):
  self.assertTrue(hasattr(module,'BLOCK_OPTIONS_NODE_CODE'),'Bounded native executor is missing')
  # Execute the actual runner body with a32-element lifecycle fixture. Only the
  # fixed dimension constants/check literal change in this test copy; the CLI's
  # pinned full512 artifact preflight and production source remain unchanged.
  shape_constant='const ROWS=512,COLUMNS=4096,ELEMENTS=ROWS*COLUMNS,SELECTED_ROWS=[0,1,255,511];'
  self.assertEqual(module.BLOCK_OPTIONS_NODE_CODE.count(shape_constant),1);self.assertEqual(module.BLOCK_OPTIONS_NODE_CODE.count("'1,512,4096'"),1)
  node_code=module.BLOCK_OPTIONS_NODE_CODE.replace(shape_constant,'const ROWS=4,COLUMNS=8,ELEMENTS=ROWS*COLUMNS,SELECTED_ROWS=[0,1,2,3];').replace("'1,512,4096'","'1,4,8'")
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);runtime=root/'runtime';(runtime/'vendor').mkdir(parents=True);(runtime/'kernel').mkdir()
   actual=HERE.parents[2]/'docs/shared/inference'
   (runtime/'hike.mjs').symlink_to(actual/'hike.mjs');(runtime/'kernel/tensor.wasm').symlink_to(actual/'kernel/tensor.wasm')
   fake=f'''// Lifecycle-only ORT double; no graph parsing or NN execution.
export const env={{versions:{{web:'1.24.3'}},wasm:{{}}}};
const failure={json.dumps(failure)},material={str(material).lower()};
export class Tensor{{constructor(type,data,dims){{if(failure==='constructor'&&dims.length===2)throw Error('injected mask constructor');Object.assign(this,{{type,data,dims}});}}dispose(){{this.data=undefined;}}}}
export const InferenceSession={{create:async(bytes,options)=>({{
 run:async feeds=>{{if(failure==='run')throw Error('injected run');const data=new Float32Array(feeds.hidden.data);
 if(failure==='mutate-input')feeds.hidden.data[0]=1;
 if(failure==='mutate-graph')bytes[bytes.length-1]^=1;
 if(failure==='baseline')data[0]=1;else if(material)data[0]=options.graphOptimizationLevel==='all'?.001:.0001;
 return{{hidden_out:new Tensor('float32',data,[1,4,8])}};}},release:async()=>{{}}
}})}};
'''
   (runtime/'vendor/ort.wasm.min.mjs').write_text(fake)
   reference=root/'reference';reference.mkdir();output=root/'output';output.mkdir();records={};zero=b'\0'*(4*8*4)
   for name,raw in [('source-hidden-18.f32',zero),('source-hidden-19.f32',zero),('final-norm.f32',struct.pack('<f',1)*8),('source-norm-rows-19.f32',b'\0'*(4*8*4))]:
    path=reference/name;path.write_bytes(raw);records[name]={'sha256':hashlib.sha256(raw).hexdigest()}
   graph=root/'graph.onnx';graph.write_bytes(b'not-a-model')
   expected=bytearray(zero)
   if material:struct.pack_into('<f',expected,0,.001)
   config={'runtime':str(runtime),'reference':str(reference),'output':str(output),
    'selection':{'layerIndex':19,'maximumNativeRuns':2,'input':{'attentionMask':[1]*4},'creationOptionsAll':module.BLOCK_OPTIONS_CREATION,
     'checkpoints':records,'graph':{'path':str(graph),'bytes':graph.stat().st_size,'sha256':hashlib.sha256(graph.read_bytes()).hexdigest()},'expectedAllLocalSha256':hashlib.sha256(expected).hexdigest()}}
   process=subprocess.run(['node','--input-type=module','-e',node_code],input=json.dumps(config),text=True,capture_output=True,timeout=30)
   report_path=output/'native-option-results.json'
   self.assertTrue(report_path.exists(),process.stderr[-2000:]);return process.returncode,json.loads(report_path.read_text())
 def test_reproduced_baseline_runs_exactly_two_sessions_and_stops_on_marginal_difference(self):
  code,report=self.execute();self.assertEqual(code,0);self.assertTrue(report['passed']);self.assertTrue(report['baselineAllReproduced']);self.assertEqual([value['optimization']for value in report['variants']],['all','disabled'])
  self.assertEqual(report['counts']['sessionsCreated'],2);self.assertEqual(report['counts']['sessionsReleased'],2);self.assertEqual(report['counts']['tensorDisposeCalls'],6);self.assertEqual(report['counts']['activeSessions'],0)
  self.assertTrue(all(variant['graphUnchanged']for variant in report['variants']));self.assertEqual(report['variants'][0]['graphSha256'],report['variants'][1]['graphSha256'])
  self.assertEqual(report['triage']['outcome'],'STOP_MARGINAL_LOCAL_DIFFERENCE');self.assertFalse(report['full24Acceptance']);self.assertFalse(report['full24GateReevaluated'])
 def test_baseline_hash_mismatch_cleans_up_and_never_creates_disabled_session(self):
  code,report=self.execute('baseline');self.assertEqual(code,1);self.assertFalse(report['passed']);self.assertFalse(report['baselineAllReproduced']);self.assertEqual(report['counts']['createAttempts'],1)
  self.assertEqual(report['counts']['sessionsReleased'],1);self.assertEqual(report['counts']['tensorDisposeCalls'],3);self.assertEqual(report['counts']['activeSessions'],0);self.assertIn('must not execute',report['failure']['message'])
 def test_run_and_partial_constructor_errors_release_every_created_resource(self):
  for failure,tensors in [('run',2),('constructor',1),('mutate-input',3)]:
   with self.subTest(failure=failure):
    code,report=self.execute(failure);self.assertEqual(code,1);self.assertFalse(report['passed']);self.assertEqual(report['counts']['createAttempts'],1);self.assertEqual(report['counts']['sessionsReleased'],1);self.assertEqual(report['counts']['tensorDisposeCalls'],tensors);self.assertEqual(report['counts']['activeSessions'],0)
 def test_graph_mutation_rejects_before_disabled_and_releases_the_first_session(self):
  code,report=self.execute('mutate-graph');self.assertEqual(code,1);self.assertFalse(report['passed']);self.assertEqual(report['counts']['createAttempts'],1);self.assertEqual(report['counts']['sessionsReleased'],1);self.assertEqual(report['counts']['tensorDisposeCalls'],3);self.assertEqual(report['counts']['activeSessions'],0);self.assertIn('graph changed during',report['failure']['message'])
 def test_material_local_difference_is_still_not_full24_acceptance(self):
  code,report=self.execute(material=True);self.assertEqual(code,0);self.assertTrue(report['passed']);self.assertEqual(report['triage']['outcome'],'MATERIAL_LOCAL_DIFFERENCE_ONLY');self.assertFalse(report['full24Acceptance']);self.assertFalse(report['triage']['productionChangeAuthorizedByDiagnostic'])

if __name__=='__main__':unittest.main()
