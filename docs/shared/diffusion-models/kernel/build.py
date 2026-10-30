#!/usr/bin/env python3
"""Build using the task-local, pinned toolchain; no dependency installation."""
import hashlib,json,os,pathlib,re,subprocess
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parent
TOOL=pathlib.Path(os.environ.get('DIFFUSION_TOOLCHAIN',str(ROOT/'toolchain')))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    provenance=json.loads((TOOL/'provenance.json').read_text())
    env=dict(os.environ,PATH=str(TOOL/'wabt/node_modules/.bin')+os.pathsep+os.environ['PATH'])
    command=[str(TOOL/'hikec'),'build','-target','wabt','-wasm-mode','normal','-o',str(HERE/'euler.wasm'),str(HERE/'euler.hike')]
    r=subprocess.run(command,env=env,capture_output=True,text=True)
    (HERE/'build.log').write_text(r.stdout+r.stderr)
    if r.returncode: raise RuntimeError(r.stdout+r.stderr)
    subprocess.run(['node',str(TOOL/'wabt/node_modules/wabt/bin/wasm2wat'),str(HERE/'euler.wasm'),'-o',str(HERE/'euler.wat')],check=True)
    wat=(HERE/'euler.wat').read_text()
    if '(import ' in wat: raise RuntimeError('Unexpected WASM imports')
    index=re.search(r'\(export "EulerDenoised" \(func (\d+)\)\)',wat).group(1)
    if not re.search(r'\(func \(;'+index+r';\) \(type \d+\) \(param i32 i32 i32 i32 i32 f32 f32\) \(result i32\)',wat):
        raise RuntimeError('Unexpected array ABI')
    digest=sha(HERE/'euler.wasm')
    (ROOT/'kernel-registry.mjs').write_text('export const EULER_WASM_SHA256 = '+json.dumps(digest)+';\n')
    record=dict(compilerCommit='3c51fde6675f317453919bd505d0e2d0f638e7f1',compilerSha256=sha(TOOL/'hikec'),backend='wabt',mode='normal',flags=['-target','wabt','-wasm-mode','normal'],sourceSha256=sha(HERE/'euler.hike'),wasmSha256=digest,watSha256=sha(HERE/'euler.wat'),runtimeJsSha256=sha(HERE/'runtime.js') if (HERE/'runtime.js').exists() else None,wasmBytes=(HERE/'euler.wasm').stat().st_size,abi='EulerDenoised(i32,i32,i32,i32,i32,f32,f32)->i32',imports=[],toolchainProvenance=provenance,status='BUILT_ABI_INSPECTED; runtime results separately recorded')
    (HERE/'build-record.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({k:v for k,v in record.items() if k!='toolchainProvenance'}))
if __name__=='__main__': main()
