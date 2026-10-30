"""Rebuild the pinned Hike tensor kernel; no session-workspace paths are required."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
DEFAULT_OUTPUT=ROOT/'docs/shared/inference/kernel/tensor.wasm'

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--toolchain',type=Path,default=Path(os.environ.get('HIKE_TOOLCHAIN',str(HERE/'toolchain'))),help='Directory containing pinned hikec and node_modules/wabt; or HIKE_TOOLCHAIN')
 p.add_argument('--compiler-source',type=Path,default=Path(os.environ['HIKE_SOURCE_DIR']) if os.environ.get('HIKE_SOURCE_DIR') else None,help='Pinned Hike source checkout (for std imports); or HIKE_SOURCE_DIR. Default: TOOLCHAIN/hike-source')
 p.add_argument('--output',type=Path,default=DEFAULT_OUTPUT,help='WASM destination; optional private path permits a non-mutating reproduction check')
 p.add_argument('--record',type=Path,help='Build record destination; default: kernel/manifest.json for the normal output, otherwise OUTPUT.manifest.json')
 args=p.parse_args();tool=args.toolchain.resolve();compiler_source=(args.compiler_source or tool/'hike-source').resolve();output=args.output.resolve()
 original=json.loads((HERE/'manifest.json').read_text())
 compiler=tool/'hikec';wabt=tool/'node_modules/wabt';wasm2wat=wabt/'bin/wasm2wat'
 if not compiler.is_file():p.error(f'Missing pinned compiler: {compiler}; supply --toolchain or HIKE_TOOLCHAIN')
 if sha(compiler)!=original['compilerSha256']:raise ValueError('Pinned compiler SHA256 mismatch; do not substitute a different compiler build')
 if not (compiler_source/'go.mod').is_file():p.error(f'Missing Hike source checkout: {compiler_source}; supply --compiler-source or HIKE_SOURCE_DIR')
 if not (wabt/'package.json').is_file() or json.loads((wabt/'package.json').read_text()).get('version')!='1.0.39':raise ValueError('Pinned WABT1.0.39 is required in TOOLCHAIN/node_modules')
 source_sha=sha(HERE/'tensor.hike');output.parent.mkdir(exist_ok=True,parents=True)
 env=dict(os.environ,PATH=str(tool/'node_modules/.bin')+os.pathsep+os.environ.get('PATH',''))
 command=[str(compiler),'build','-target','wabt','-wasm-mode','normal','-o',str(output),str(HERE/'tensor.hike')]
 normal_output=output==DEFAULT_OUTPUT.resolve();log=HERE/'build.log' if normal_output else output.with_suffix('.build.log')
 result=subprocess.run(command,cwd=compiler_source,env=env,capture_output=True,text=True);log.write_text(result.stdout+result.stderr);result.check_returncode()
 # The unchanged pinned source must reproduce the recorded, accepted kernel.
 if source_sha==original['sourceSha256'] and sha(output)!=original['wasmSha256']:raise ValueError('Unchanged source did not reproduce the pinned WASM hash')
 wat=HERE/'tensor.wat' if normal_output else output.with_suffix('.wat')
 subprocess.run(['node',str(wasm2wat),str(output),'-o',str(wat)],check=True)
 record={'compilerCommit':original['compilerCommit'],'compilerSha256':sha(compiler),'sourceSha256':source_sha,'wasmSha256':sha(output),'hostSha256':sha(ROOT/'docs/shared/inference/hike.mjs'),'backend':'wabt normal','command':command,'compilerSourceDirectory':str(compiler_source),'wabtVersion':'1.0.39','imports':[{'module':'env','name':'sqrt','signature':'f64->f64','bridge':'Fixed compiler runtime Math.sqrt'}],'scope':'Real Hike f32 affine/MatMul/divide/RMSNorm with documented sqrt primitive; numeric tolerance tested separately'}
 record_path=args.record or (HERE/'manifest.json' if normal_output else output.with_suffix('.manifest.json'))
 record_path.parent.mkdir(parents=True,exist_ok=True);record_path.write_text(json.dumps(record,indent=2));print(json.dumps(record))
if __name__=='__main__':main()
