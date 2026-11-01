"""Run actual helper finalization code with model/browser control doubles; NN0.

The target try/except/finally and return statements are compiled from the source
under test, not reimplemented here. Expensive setup is replaced by existing saved
outputs and local control objects. These tests establish failure status only.
"""
import argparse,ast,contextlib,copy,importlib.util,io,json,shutil,subprocess,sys,tempfile,time,types,unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
EVIDENCE=ROOT/'development/inference/p2-p3-acceptance/plain/evidence'
cli=argparse.ArgumentParser(add_help=False);cli.add_argument('--source-ref');options,remaining=cli.parse_known_args()
sys.argv=[sys.argv[0],*remaining]

def target(name):
 path=HERE/name
 source=subprocess.run(['git','show',options.source_ref+':'+str(path.relative_to(ROOT))],cwd=ROOT,check=True,capture_output=True,text=True).stdout if options.source_ref else path.read_text()
 namespace={'__name__':'failure_control_target','__file__':str(path)}
 exec(compile(source,str(path),'exec'),namespace)
 main=next(node for node in ast.parse(source).body if isinstance(node,ast.FunctionDef) and node.name=='main')
 return namespace,main,path

def compiled_finalization(main,path,kind):
 candidates=[(i,node) for i,node in enumerate(main.body) if isinstance(node,ast.Try) and node.handlers]
 index,node=candidates[-1];trial=copy.deepcopy(node)
 if kind=='source':
  # Keep the real successful output-write/update and following source-stat check.
  start=next(i for i,n in enumerate(trial.body) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='target' for t in n.targets))
  trial.body=trial.body[start:]
 body=[trial,*copy.deepcopy(main.body[index+1:])]
 function=ast.FunctionDef(name='run_finalization',args=ast.arguments(posonlyargs=[],args=[],kwonlyargs=[],kw_defaults=[],defaults=[]),body=body,decorator_list=[])
 return compile(ast.fix_missing_locations(ast.Module(body=[function],type_ignores=[])),str(path),'exec')

class Noop:
 def set(self):pass
 def join(self):pass
 def shutdown(self):pass
 def server_close(self):pass

class FailureControls(unittest.TestCase):
 def browser_failure(self,fault):
  ns,main,path=target('accept_plain.py')
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);output=root/'output';output.mkdir();reference=root/'reference';reference.mkdir()
   shutil.copyfile(EVIDENCE/'plain-reference.f32',reference/'plain-reference.f32')
   inp=json.loads((EVIDENCE/'plain-input.json').read_text());original=json.loads((EVIDENCE/'browser-results.json').read_text())
   manifest=json.loads((ROOT/'development/inference/reference-adoption/p0/evidence/manifests/text.json').read_text())
   report={'passed':False,'pageErrors':[],'blockedRequests':[],'consoleErrors':[],'httpRequests':[],'progress':[]}
   saved_write=ns['write_json']
   def write(value_path,value):
    if fault=='late-write' and Path(value_path).name=='conditioning-handoff.json':raise OSError('injected late handoff write')
    saved_write(value_path,value)
   class Page:
    def set_default_timeout(self,*a):pass
    def on(self,*a):pass
    def goto(self,*a,**kw):pass
    def wait_for_function(self,*a):pass
    def set_input_files(self,*a):pass
    def evaluate(self,*a):return copy.deepcopy(original['native'])
    @contextlib.contextmanager
    def expect_download(self,**kw):
     yield types.SimpleNamespace(value=types.SimpleNamespace(save_as=lambda dst:shutil.copyfile(EVIDENCE/'plain-conditioning.wktensor',dst)))
   class Context:
    def route(self,*a):pass
    def new_page(self):return Page()
    def close(self):pass
   class Browser:
    version='model-double-control'
    def new_context(self,**kw):return Context()
    def close(self):
     if fault=='late-close':raise OSError('injected late browser close')
   @contextlib.contextmanager
   def sync_playwright():yield types.SimpleNamespace(chromium=types.SimpleNamespace(launch=lambda **kw:Browser()))
   fake=types.ModuleType('playwright.sync_api');fake.sync_playwright=sync_playwright
   ns.update(a=types.SimpleNamespace(browser='control',output=output,reference=reference,bundle=root/'bundle',source=root/'unused-model',preflight_only=False,execution_source_sha=original['executionSourceSha']),manifest=manifest,input_record=inp,oracle=json.loads((EVIDENCE/'reference-results.json').read_text()),report=report,base='http://control.invalid',server_errors=[],server=Noop(),serverthread=Noop(),memory_stop=Noop(),memorythread=Noop(),owner=types.SimpleNamespace(finish=lambda **kw:{'liveAfterClose':[],'zombiesAfterClose':[],'errors':[]}),group_peak=0,memory_samples=0,pid_peaks={},start=time.monotonic(),served={},write_json=write)
   exec(compiled_finalization(main,path,'browser'),ns)
   with patch.dict(sys.modules,{'playwright.sync_api':fake}),contextlib.redirect_stdout(io.StringIO()):code=ns['run_finalization']()
   receipt=json.loads((output/'browser-results.json').read_text())
   self.assertIn('injected late',receipt['failure']['message'])
   self.assertEqual((code,receipt['passed']),(1,False),'Late failure must exit nonzero and revoke the provisional numeric PASS')
 def test_late_handoff_write_revokes_browser_acceptance(self):self.browser_failure('late-write')
 def test_late_browser_close_revokes_browser_acceptance(self):self.browser_failure('late-close')
 def test_changed_source_stat_revokes_reference_receipt(self):
  ns,main,path=target('plain_reference.py')
  with tempfile.TemporaryDirectory() as folder:
   output=Path(folder);report={'passed':False};reference=np.fromfile(EVIDENCE/'plain-reference.f32',dtype='<f4').reshape(1,512,4096)
   class ChangedSource:
    def stat(self):return types.SimpleNamespace(st_size=2,st_mtime_ns=1)
   ns.update(a=types.SimpleNamespace(output=output,model=ChangedSource()),report=report,reference=reference,used=set(),headerraw=b'control-header',torch=types.SimpleNamespace(__version__='model-double-control'),np=np,spm=types.SimpleNamespace(__version__='control'),initial_model_stat=types.SimpleNamespace(st_size=1,st_mtime_ns=1),stop=Noop(),thread=Noop(),process=types.SimpleNamespace(pid=0,create_time=lambda:0,cpu_times=lambda:types.SimpleNamespace(user=0,system=0)),cpu0=types.SimpleNamespace(user=0,system=0),peak=0,samples=[],started=time.monotonic())
   exec(compiled_finalization(main,path,'source'),ns)
   with self.assertRaisesRegex(AssertionError,'Original source changed'),contextlib.redirect_stdout(io.StringIO()):ns['run_finalization']()
   receipt=json.loads((output/'reference-results.json').read_text())
   self.assertIn('Original source changed',receipt['failure']['message'])
   self.assertFalse(receipt['passed'],'A changed source must not retain passed=true in reference JSON')

if __name__=='__main__':unittest.main()
