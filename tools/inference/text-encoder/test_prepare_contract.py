import json,unittest,os
from pathlib import Path
ROOT=Path(os.environ.get('UMT5_BUNDLE_DIR','/workspace/work/inference/text-implementation/bundle'))
class ActualUMT5Contract(unittest.TestCase):
 def test_real_24_layer_model_completed_with_original_state_and_gate(self):
  self.assertTrue((ROOT/'manifest.json').exists(),'Prepared full actual-model bundle missing')
  d=json.loads((ROOT/'manifest.json').read_text());self.assertTrue(d['complete']);self.assertEqual(len(d['blocks']),24);self.assertEqual(d['sourceKeysCovered'],412)
  self.assertTrue(all(b['nativePass'] for b in d['blocks']));self.assertLessEqual(d['nativeFinalMaxAbsError'],.001)
if __name__=='__main__':unittest.main()
