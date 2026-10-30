"""Fast destination/source guards; no model bytes or numerical dependencies loaded."""
import argparse,builtins,importlib.util,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('text_prepare_preflight',HERE/'prepare.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)
PUBLIC=HERE.parents[2]/'docs'

class PreparationPreflight(unittest.TestCase):
 def args(self,out,**overrides):
  values=dict(out=str(out),limit=24,resume=False,source=str(HERE/'pinned-t5.py'),config=str(HERE/'pinned-umt5-config.json'))
  values.update(overrides);return argparse.Namespace(**values)
 def test_cli_rejects_invalid_limit_before_heavy_imports(self):
  imported=[];original=builtins.__import__
  def guarded(name,*args,**kwargs):
   if name.split('.')[0] in {'numpy','torch','onnx','onnxruntime','safetensors'}:
    imported.append(name);raise AssertionError('Numerical dependency imported before preflight')
   return original(name,*args,**kwargs)
  with tempfile.TemporaryDirectory() as tmp:
   destination=Path(tmp)/'not-created'
   argv=['prepare.py','--model','unused.safetensors','--out',str(destination),'--limit','0']
   with patch.object(sys,'argv',argv),patch('builtins.__import__',guarded):
    with self.assertRaisesRegex(ValueError,'limit'):prepare.main()
   self.assertEqual(imported,[]);self.assertFalse(destination.exists())
 def test_rejects_public_docs_and_symlink_alias_without_writing(self):
  destination=PUBLIC/'preflight-must-not-create'
  with self.assertRaisesRegex(ValueError,'public|docs'):prepare.preflight(self.args(destination))
  with tempfile.TemporaryDirectory() as tmp:
   alias=Path(tmp)/'alias';alias.symlink_to(PUBLIC,target_is_directory=True)
   with self.assertRaisesRegex(ValueError,'public|docs'):prepare.preflight(self.args(alias/'private-model'))
   self.assertFalse((alias/'private-model').exists())
 def test_limit_is_bounded_one_to_24(self):
  with tempfile.TemporaryDirectory() as tmp:
   for limit in [0,-1,25]:
    with self.subTest(limit=limit),self.assertRaisesRegex(ValueError,'limit'):prepare.preflight(self.args(Path(tmp)/'out',limit=limit))
   for limit in [1,24]:prepare.preflight(self.args(Path(tmp)/'out',limit=limit))
 def test_existing_artifacts_are_preserved_without_explicit_resume(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp)/'bundle';out.mkdir();sentinel=out/'existing';sentinel.write_text('keep')
   with self.assertRaisesRegex(FileExistsError,'resume'):prepare.preflight(self.args(out))
   self.assertEqual(sentinel.read_text(),'keep')
   self.assertEqual(prepare.preflight(self.args(out,resume=True)),out.resolve())
 def test_new_and_empty_private_outputs_are_accepted_without_creation(self):
  with tempfile.TemporaryDirectory() as tmp:
   new=Path(tmp)/'new';self.assertEqual(prepare.preflight(self.args(new)),new.resolve());self.assertFalse(new.exists())
   empty=Path(tmp)/'empty';empty.mkdir();self.assertEqual(prepare.preflight(self.args(empty)),empty.resolve())
 def test_existing_file_is_not_an_output_directory_even_with_resume(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp)/'file';out.write_text('keep')
   with self.assertRaisesRegex(ValueError,'directory'):prepare.preflight(self.args(out,resume=True))
   self.assertEqual(out.read_text(),'keep')
 def test_explicit_identical_pinned_copies_are_accepted_and_mutations_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);source=root/'reference.py';config=root/'config.json'
   source.write_bytes((HERE/'pinned-t5.py').read_bytes());config.write_bytes((HERE/'pinned-umt5-config.json').read_bytes())
   args=self.args(root/'out',source=str(source),config=str(config));prepare.preflight(args)
   source.write_bytes(source.read_bytes()+b'\nraise RuntimeError("must never execute")\n')
   with self.assertRaisesRegex(ValueError,'source.*SHA256'):prepare.preflight(args)
   source.write_bytes((HERE/'pinned-t5.py').read_bytes());config.write_bytes(config.read_bytes()+b' ')
   with self.assertRaisesRegex(ValueError,'config.*SHA256'):prepare.preflight(args)
   self.assertFalse((root/'out').exists())
if __name__=='__main__':unittest.main()
