"""No model reads: adversarial private-reference identity regression."""
import json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
root=Path(__file__).resolve().parents[2];private=Path(os.environ.get('BERNINI_PRIVATE_HIDDEN','/workspace/work/diffusion-private-hidden'))
class Boundary(unittest.TestCase):
 def test_changed_reference_gate_is_rejected_before_comparison(self):
  reference=json.loads((private/'low-prefix-reference.json').read_text());reference['gates']['hidden']['abs']=1
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'changed.json';path.write_text(json.dumps(reference));result=subprocess.run([sys.executable,str(root/'tools/diffusion-models/hidden-compare.py'),'--reference',str(path),'--actual',str(private/'low-prefix-actual.json'),'--out',str(Path(tmp)/'receipt.json')],capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0,'mutable reference gates were accepted')
if __name__=='__main__':unittest.main()
