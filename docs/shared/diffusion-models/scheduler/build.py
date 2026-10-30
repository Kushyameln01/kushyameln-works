#!/usr/bin/env python3
import hashlib,json,os,subprocess
from pathlib import Path
r=Path(__file__).resolve().parent;t=Path(os.environ.get('DIFFUSION_TOOLCHAIN',str(r.parent/'toolchain'))).resolve();out=r/'build';out.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=json.loads((t/'provenance.json').read_text());compiler=t/'hikec';assert sha(compiler)==record['sha256']['compiler']
env=dict(os.environ,PATH=str(t/'wabt/node_modules/.bin')+os.pathsep+os.environ['PATH'])
command=[str(compiler),'build','-target','wabt','-wasm-mode','normal','-o',str(out/'scheduler.wasm'),str(r/'scheduler.hike')]
p=subprocess.run(command,env=env,capture_output=True,text=True);(out/'compiler.log').write_text(p.stdout+p.stderr);p.check_returncode()
subprocess.run(['node',str(t/'wabt/node_modules/wabt/bin/wasm2wat'),str(out/'scheduler.wasm'),'-o',str(out/'scheduler.wat')],check=True)
wat=(out/'scheduler.wat').read_text();assert '(import ' not in wat
result={'hikeCommit':record['hikeCommit'],'compilerSha256':sha(compiler),'sourceSha256':sha(r/'scheduler.hike'),'wasmSha256':sha(out/'scheduler.wasm'),'watSha256':sha(out/'scheduler.wat'),'generatedRuntimeSha256':sha(out/'runtime.js'),'runtimeUsed':False,'command':command,'backend':'wabt normal','versions':record['versions'],'imports':[],'sourceReference':'ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4','status':'built; execution separately recorded'}
(out/'build-record.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
