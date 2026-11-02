"""NN0 Node reference-host acceptance controls; synthetic artifacts only."""
import argparse,hashlib,json,tempfile,unittest
from pathlib import Path
import numpy as np
import accept_plain as acceptance

class NodeSdkAcceptance(unittest.TestCase):
 def test_mode_requires_explicit_suite_no_controls_and_file_cases(self):
  validate=getattr(acceptance,'validate_node_sdk_mode',None);self.assertTrue(callable(validate),'Explicit reference-host mode validation required')
  validate(True,True,[{'id':'file-case'}])
  for args in [(False,True,[{'id':'file-case'}]),(True,False,[{'id':'file-case'}]),(True,True,[{'id':'bytes-case','byteGraph':0}])]:
   with self.assertRaises(ValueError):validate(*args)
 def test_completed_native_artifacts_are_compared_once_and_numeric_failure_does_not_discard_later_outputs(self):
  consume=getattr(acceptance,'consume_node_sdk_artifacts',None);self.assertTrue(callable(consume),'Completed native artifacts must survive a later host failure')
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);reference=root/'reference';reference.mkdir();output=root/'output';output.mkdir();inputs=[];cases=[];oracle={};manifest={'modelSha256':'a'*64,'tokenizer':{'sha256':'b'*64}}
   for index,name in enumerate(['first','second']):
    record={'id':name,'shape':[1,1,4096],'attentionMask':[1]};inputs.append(record);np.zeros((1,1,4096),dtype='<f4').tofile(reference/(name+'-reference.f32'));values=np.zeros((1,1,4096),dtype='<f4');values[0,0,0]=.002 if index==0 else 0;payload=values.tobytes();header={'schemaVersion':1,'dtype':'float32','shape':record['shape'],'byteOrder':'little','layout':'BLC','meaning':'text_hidden_states','byteLength':len(payload),'dataSha256':hashlib.sha256(payload).hexdigest(),'modelSha256':manifest['modelSha256'],'tokenizerSha256':manifest['tokenizer']['sha256'],'normalization':'umt5-final-rmsnorm-f32-v1','attentionMask':[1]};encoded=json.dumps(header).encode();raw=b'WKTSR001'+len(encoded).to_bytes(4,'little')+encoded+payload;(output/(name+'.wktensor')).write_bytes(raw);cases.append({'id':name,'passed':True,'artifact':{'path':name+'.wktensor','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}});oracle[name]={'reference':{'sha256':'c'*64}}
   report={'comparisons':[],'numericFailures':[]};a=argparse.Namespace(output=output,reference=reference)
   consume(a,{'cases':cases[:1]},inputs,manifest,oracle,report);self.assertEqual(len(report['comparisons']),1)
   consume(a,{'cases':cases,'passed':False,'failure':{'message':'later owned Node process stopped'}},inputs,manifest,oracle,report)
   self.assertEqual([item['passed']for item in report['comparisons']],[False,True]);self.assertEqual(report['numericFailures'][0]['id'],'first')
   consume(a,{'cases':cases},inputs,manifest,oracle,report);self.assertEqual(len(report['comparisons']),2)
   raw=(output/'second.wktensor').read_bytes();(output/'second.wktensor').write_bytes(raw[:-1]+bytes([raw[-1]^1]));report={'comparisons':[],'numericFailures':[]}
   with self.assertRaises(ValueError):consume(a,{'cases':cases[1:]},inputs,manifest,oracle,report)

if __name__=='__main__':unittest.main()
