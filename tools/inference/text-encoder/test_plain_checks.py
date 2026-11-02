import hashlib,json,struct,unittest
import numpy as np
import plain_checks
from plain_checks import compare_values,unpack_tensor,validate_gate

class PlainChecks(unittest.TestCase):
 def test_gate_cannot_be_relaxed_or_scope_removed(self):
  valid={'maxAbsError':.001,'rtol':.001,'registeredBeforeComparison':True,'scope':'FP32 source-reference diagnostics; no original workflow quality guarantee'}
  self.assertEqual(validate_gate(valid),valid)
  for bad in [{**valid,'maxAbsError':.002},{**valid,'rtol':.002},{**valid,'scope':''},{**valid,'registeredBeforeComparison':False}]:
   with self.assertRaises(ValueError):validate_gate(bad)
 def test_all_positions_and_padding_are_checked(self):
  ref=np.zeros((1,512,4096),dtype=np.float32);mask=np.zeros(512,dtype=np.uint8);mask[:3]=1
  self.assertTrue(compare_values(ref.copy(),ref,mask)['passed'])
  actual=ref.copy();actual[0,1,700]=.0011
  self.assertFalse(compare_values(actual,ref,mask)['passed'])
  actual=ref.copy();actual[0,511,4095]=1e-7
  self.assertFalse(compare_values(actual,ref,mask)['passed'])
  actual=ref.copy();actual[0,0,0]=np.nan
  self.assertFalse(compare_values(actual,ref,mask)['passed'])
  with self.assertRaises(ValueError):compare_values(ref.reshape(512,4096),ref,mask)
 def test_real_codec_bytes_reject_payload_changes(self):
  data=np.zeros((1,512,4096),dtype='<f4').tobytes();header={'schemaVersion':1,'dtype':'float32','layout':'BLC','shape':[1,512,4096],'meaning':'text_hidden_states','byteOrder':'little','byteLength':len(data),'dataSha256':hashlib.sha256(data).hexdigest()}
  h=json.dumps(header).encode();raw=b'WKTSR001'+struct.pack('<I',len(h))+h+data
  meta,values=unpack_tensor(raw);self.assertEqual(values.size,2097152)
  changed=bytearray(raw);changed[-1]^=1
  with self.assertRaises(ValueError):unpack_tensor(changed)
 def test_id_lengths_compare_every_value_and_do_not_accept_wrong_contract(self):
  for length in [1,2,511,512]:
   ref=np.ones((1,length,4096),dtype=np.float32);mask=np.ones(length,dtype=np.uint8)
   self.assertTrue(compare_values(ref.copy(),ref,mask,shape=(1,length,4096))['passed'])
   changed=ref.copy();changed[0,-1,-1]+=.002
   self.assertFalse(compare_values(changed,ref,mask,shape=(1,length,4096))['passed'])
   with self.assertRaises(ValueError):compare_values(ref,ref,mask,shape=(1,512,4096) if length!=512 else (1,511,4096))
 def test_case_contract_keeps_id_native_length_and_pads_only_the_oracle(self):
  compile_case=getattr(plain_checks,'compile_case',None)
  self.assertTrue(callable(compile_case),'compile_case is required for a shared frozen input contract')
  case=compile_case({'id':'id-boundaries','input':{'tokenIds':[0,256383,42,1],'attentionMask':[1,0,1,0]}},None)
  self.assertEqual(case['shape'],[1,4,4096]);self.assertEqual(case['effectiveTokens'],3)
  ids,mask=plain_checks.oracle_vectors(case)
  self.assertEqual(len(ids),512);self.assertEqual(ids[:4],[0,256383,42,1]);self.assertEqual(mask[:4],[1,0,1,0]);self.assertEqual(sum(mask),2)
  self.assertEqual(case['tokenIds'],[0,256383,42,1])
 def test_case_contract_rejects_empty_mixed_invalid_id_and_mask_inputs(self):
  compile_case=getattr(plain_checks,'compile_case',None)
  self.assertTrue(callable(compile_case),'compile_case is required')
  bad=[{'tokenIds':[],'attentionMask':[]},{'text':'x','tokenIds':[1],'attentionMask':[1]},{'tokenIds':[256384],'attentionMask':[1]},{'tokenIds':[1],'attentionMask':[0]},{'tokenIds':[True],'attentionMask':[1]},{'tokenIds':[1],'attentionMask':[.5]}]
  for input_value in bad:
   with self.assertRaises((ValueError,TypeError)):compile_case({'id':'invalid','input':input_value},lambda text:[42,1])
 def test_plain_case_is_full512_and_rejects_overflow_without_truncation(self):
  compile_case=getattr(plain_checks,'compile_case',None)
  self.assertTrue(callable(compile_case),'compile_case is required')
  case=compile_case({'id':'empty','input':{'text':''}},lambda text:[1])
  self.assertEqual(case['shape'],[1,512,4096]);self.assertEqual(case['tokenIds'][:2],[1,0]);self.assertEqual(sum(case['attentionMask']),1)
  with self.assertRaises(ValueError):compile_case({'id':'overflow','input':{'text':'long'}},lambda text:[42]*512+[1])
 def test_default_suite_has_frozen_boundary_and_mask_cases(self):
  build=getattr(plain_checks,'default_suite_cases',None)
  self.assertTrue(callable(build),'A single deterministic suite definition is required')
  encode=lambda text:[42]*len(text.split())+[1]
  cases,negative=build(encode)
  records=[plain_checks.compile_case(case,encode) for case in cases]
  self.assertEqual(len(records),9);self.assertEqual(len({r['id'] for r in records}),9)
  by_id={r['id']:r for r in records}
  self.assertEqual(by_id['plain-long-eos512']['activeTokens'],512)
  self.assertEqual(by_id['id-l1']['tokenIds'],[0]);self.assertEqual(by_id['id-l2']['tokenIds'],[0,256383])
  self.assertEqual(by_id['id-l511']['shape'],[1,511,4096]);self.assertEqual(by_id['id-l512-all-active']['activeTokens'],512)
  internal=by_id['id-internal-trailing-mask'];self.assertEqual(internal['attentionMask'][1],0);self.assertGreater(internal['effectiveTokens'],2);self.assertEqual(internal['attentionMask'][-1],0)
  self.assertIn('plain-overflow',{r['id'] for r in negative});self.assertIn('mixed-mode',{r['id'] for r in negative})

if __name__=='__main__':unittest.main()
