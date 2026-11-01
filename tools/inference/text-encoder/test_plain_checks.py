import hashlib,json,struct,unittest
import numpy as np
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

if __name__=='__main__':unittest.main()
