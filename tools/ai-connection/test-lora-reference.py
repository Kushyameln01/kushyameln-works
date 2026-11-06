import importlib.util,pathlib,unittest,numpy as np
path=pathlib.Path(__file__).with_name('lora-reference.py')
class ReferenceTests(unittest.TestCase):
 def module(self):
  self.assertTrue(path.exists(),'independent joint reference is not implemented')
  spec=importlib.util.spec_from_file_location('oracle',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def test_decode_fp8_profile(self):
  m=self.module();v=m.decode_fp8(np.array([0,128,1,56,184,126],dtype=np.uint8),np.float32(2));np.testing.assert_array_equal(v,np.array([0,-0,2**-8,2,-2,896],dtype=np.float32))
  with self.assertRaises(ValueError):m.decode_fp8(np.array([127],dtype=np.uint8),1)
 def test_bf16_preserves_values(self):
  m=self.module();np.testing.assert_array_equal(m.decode_bf16(bytes.fromhex('803f00c0')),np.array([1,-2],dtype=np.float32))
 def test_full_product_zero_positive_negative_and_explicit_alpha(self):
  m=self.module();base=np.array([[10.,11.],[12.,13.]]);down=np.array([[1.,2.],[3.,4.]]);up=np.array([[2.,1.],[1.,-1.]])
  for strength in [0,1,-1]:np.testing.assert_array_equal(m.merge_reference(base,down,up,strength,2),base+strength*np.array([[5.,8.],[-2.,-2.]]))
  np.testing.assert_array_equal(base,np.array([[10.,11.],[12.,13.]]))
if __name__=='__main__':unittest.main()
