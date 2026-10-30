#!/usr/bin/env python3
import hashlib,json,os,subprocess
from pathlib import Path
r=Path(__file__).resolve().parent;t=Path(os.environ.get('DIFFUSION_TOOLCHAIN',str(r.parent/'toolchain'))).resolve();out=r/'build';out.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
provenance=json.loads((t/'provenance.json').read_text());compiler=t/'hikec'
assert sha(compiler)==provenance['sha256']['compiler']
env=dict(os.environ,PATH=str(t/'wabt/node_modules/.bin')+os.pathsep+os.environ['PATH'])
command=[str(compiler),'build','-target','wabt','-wasm-mode','normal','-o',str(out/'linear.wasm'),str(r/'linear.hike')]
p=subprocess.run(command,env=env,capture_output=True,text=True);(out/'compiler.log').write_text(p.stdout+p.stderr);print(p.stdout+p.stderr);p.check_returncode()
subprocess.run(['node',str(t/'wabt/node_modules/wabt/bin/wasm2wat'),str(out/'linear.wasm'),'-o',str(out/'linear.wat')],check=True)
record={'hikeCommit':provenance['hikeCommit'],'compilerSha256':sha(compiler),'backend':'wabt','mode':'normal','sourceSha256':sha(r/'linear.hike'),'wasmSha256':sha(out/'linear.wasm'),'watSha256':sha(out/'linear.wat'),'runtimeSha256':sha(out/'runtime.js') if (out/'runtime.js').exists() else None,'versions':provenance['versions'],'command':command,'imports':'See inspected WAT and Node/browser result; no imports expected','status':'built; execution evidence separately recorded'}
(out/'build-record.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
