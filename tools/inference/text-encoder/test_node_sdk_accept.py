"""NN0 Node reference-host acceptance controls; synthetic artifacts only."""
import argparse,fcntl,hashlib,json,os,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import accept_plain as acceptance

class NodeSdkAcceptance(unittest.TestCase):
 def test_parent_verifies_exact_commit_and_every_source_byte_before_node(self):
  verify=getattr(acceptance,'verify_node_sdk_sources',None);self.assertTrue(callable(verify),'Parent Git source verification required')
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);paths=['tools/inference/text-encoder/accept_plain.py','tools/inference/text-encoder/plain_checks.py','tools/inference/vae/process_lifecycle.py',*acceptance.NODE_SDK_SOURCE_PATHS]
   for index,path in enumerate(paths):target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(('source-'+str(index)).encode())
   calls=[]
   def git(args,**kwargs):
    calls.append(args)
    if args[:3]==['git','cat-file','-t']:return types.SimpleNamespace(stdout=b'commit\n')
    return types.SimpleNamespace(stdout=(root/args[-1].split(':',1)[1]).read_bytes())
   with patch.object(acceptance.subprocess,'run',side_effect=git):records=verify(root,'a'*40)
   self.assertEqual(calls[0],['git','cat-file','-t','a'*40]);self.assertEqual(len(records),len(paths));self.assertEqual(len({record['path']for record in records}),len(paths));self.assertTrue(all(record['executionSourceSha']=='a'*40 for record in records))
   self.assertEqual(records[0]['sha256'],hashlib.sha256((root/paths[0]).read_bytes()).hexdigest())
   with patch.object(acceptance.subprocess,'run',return_value=types.SimpleNamespace(stdout=b'blob\n')):
    with self.assertRaisesRegex(ValueError,'commit'):verify(root,'a'*40)
   def changed(args,**kwargs):return types.SimpleNamespace(stdout=b'commit\n' if args[:3]==['git','cat-file','-t'] else b'different committed bytes')
   with patch.object(acceptance.subprocess,'run',side_effect=changed):
    with self.assertRaisesRegex(ValueError,'committed source'):verify(root,'a'*40)
 def test_text_graph_cache_advice_is_readonly_deduplicated_and_keeps_file_bytes(self):
  advise=getattr(acceptance,'advise_text_graph_cache',None);self.assertTrue(callable(advise),'Node-only prepared graph cache advice required')
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);path=root/'block-00.onnx';path.write_bytes(bytes(range(256))*64);before=hashlib.sha256(path.read_bytes()).hexdigest();blocks=[{'index':0,'path':path.name,'bytes':path.stat().st_size}];policy={};seen=set();calls=[];real_advice=os.posix_fadvise
   def observe(fd,start,length,advice):
    self.assertEqual(fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE,os.O_RDONLY);self.assertEqual((start,length,advice),(0,0,os.POSIX_FADV_DONTNEED));calls.append(fd);real_advice(fd,start,length,advice)
   with patch.object(acceptance.os,'posix_fadvise',side_effect=observe):
    advise(root,blocks,0,policy,phase='block-complete',case_id='one',seen=seen);advise(root,blocks,0,policy,phase='block-complete',case_id='one',seen=seen)
    advise(root,blocks,99,policy,phase='block-complete',case_id='one',seen=seen)
   self.assertEqual(len(calls),1);self.assertEqual(policy['advisedCount'],1);self.assertEqual(policy['advisedFileBytes'],path.stat().st_size);self.assertTrue(policy['errors']);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
   with patch.object(acceptance.os,'posix_fadvise',side_effect=OSError('advisory unavailable')):advise(root,blocks,0,policy,phase='before-node')
   self.assertEqual(policy['advisedCount'],1);self.assertIn('advisory unavailable',policy['errors'][-1]['message']);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
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
