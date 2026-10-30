#!/usr/bin/env python3
"""Build the LoRA Hike kernel from the pinned compiler; no downloads or installs."""
import os,pathlib,json,hashlib,subprocess,shutil,re
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
TOOL=pathlib.Path(os.environ.get('LORA_HIKE_TOOLCHAIN','/workspace/work/lora-toolchain'))
REV='3c51fde6675f317453919bd505d0e2d0f638e7f1'
DIST=ROOT/'docs/shared/inference/lora/kernel'
BUILD=HERE/'build'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(cmd,env=None):return subprocess.run(list(map(str,cmd)),check=True,capture_output=True,text=True,env=env).stdout.strip()
def main():
 BUILD.mkdir(exist_ok=True);DIST.mkdir(parents=True,exist_ok=True)
 source=TOOL/('hike-lang-'+REV)
 # Toolchain source archive is identified separately from the built compiler.
 provenance=json.loads((TOOL/'hike-source.json').read_text())
 if REV not in provenance['url']:raise RuntimeError('unpinned Hike source')
 versions={'go':run([TOOL/'go/bin/go','version']),'node':run(['node','--version']),'wabt':run(['node',TOOL/'node_modules/wabt/bin/wat2wasm','--version'])}
 if versions['wabt']!='1.0.39':raise RuntimeError('WABT version mismatch')
 env=dict(os.environ,PATH=str(TOOL/'node_modules/.bin')+os.pathsep+os.environ['PATH'])
 cmd=[TOOL/'hikec','build','-target','wabt','-wasm-mode','normal','-o',BUILD/'lora.wasm',HERE/'lora.hike']
 result=subprocess.run(list(map(str,cmd)),capture_output=True,text=True,env=env)
 (BUILD/'build.log').write_text(result.stdout+result.stderr)
 if result.returncode:raise RuntimeError(result.stdout+result.stderr)
 run(['node',TOOL/'node_modules/wabt/bin/wasm2wat',BUILD/'lora.wasm','-o',BUILD/'lora.wat'])
 wat=(BUILD/'lora.wat').read_text()
 if '(import ' in wat:raise RuntimeError('Unexpected imports')
 signatures={}
 for name in ['LoraMerge','LoraAdd','LoraCopy','LoraDecode']:
  idx=re.search(r'\(export "'+name+r'" \(func (\d+)\)\)',wat).group(1)
  signature=re.search(r'\(func \(;'+idx+r';\) \(type \d+\) (\(param [^\n]+?\) \(result [^\n]+?\))',wat).group(1)
  signatures[name]=signature
 expected={'LoraMerge':'(param i32 i32 i32 i32 i32 i32 i32 f32) (result i32)','LoraAdd':'(param i32 i32 i32 i32 f32) (result i32)','LoraCopy':'(param i32 i32 i32) (result i32)','LoraDecode':'(param i32 i32 i32 i32) (result i32)'}
 if signatures!=expected:raise RuntimeError('ABI signature mismatch: '+str(signatures))
 shutil.copyfile(BUILD/'lora.wasm',DIST/'lora.wasm')
 shutil.copyfile(source/'LICENSE',DIST/'LICENSE-Hike.txt')
 kernel={'abiVersion':'lora-block-f32-v1','wasmSha256':sha(DIST/'lora.wasm'),'hikeCommit':REV,'backend':'wabt-normal'}
 (DIST/'registry.mjs').write_text('export const KERNEL = Object.freeze('+json.dumps(kernel)+');\n')
 record={**kernel,'status':'BUILT_ABI_VERIFIED; numerical tests separately recorded','versions':versions,'compilerSha256':sha(TOOL/'hikec'),'sourceSha256':sha(HERE/'lora.hike'),'wasmBytes':(DIST/'lora.wasm').stat().st_size,'watSha256':sha(BUILD/'lora.wat'),'runtimeJsSha256':sha(BUILD/'runtime.js') if (BUILD/'runtime.js').exists() else None,'sourceArchive':provenance,'goArchive':json.loads((TOOL/'go-source.json').read_text()),'wabtLockSha256':sha(TOOL/'package-lock.json'),'flags':['-target','wabt','-wasm-mode','normal'],'imports':[],'signatures':signatures}
 (HERE/'build-record.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
if __name__=='__main__':main()
