#!/usr/bin/env python3
"""Compile actual Hike-owned product math to strict-F32 SIMD WASM via LLVM."""
import argparse,hashlib,json,os,pathlib,re,shutil,subprocess
from llvm_pins import BASE,PACKAGES,EXPECTED_BINARIES
HERE=pathlib.Path(__file__).resolve().parent
TOOL=pathlib.Path(os.environ.get('LORA_HIKE_TOOLCHAIN','/workspace/work/lora-toolchain'))
LLVM=pathlib.Path(os.environ.get('LORA_HIKE_LLVM','/workspace/work/lora/standalone-task/llvm'))
ROOT=HERE.parents[3]
DIST=ROOT/'docs/shared/inference/lora/kernel/streaming'
HIKE_SHA='556a11f406482a0b2015ba0a40e34813ad6c1ec2c50eed175f9d005e7f39a95f'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(argv,**kwargs):return subprocess.run(list(map(str,argv)),check=True,capture_output=True,text=True,**kwargs).stdout.strip()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=pathlib.Path,default=ROOT/'tools/lora/kernel/streaming/lora.hike');ap.add_argument('--out',type=pathlib.Path,default=HERE/'build');a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 bootstrap=json.loads((LLVM/'bootstrap-record.json').read_text());clang=pathlib.Path(bootstrap['clang']['path']);lld=pathlib.Path(bootstrap['lld']['path']);cpp=pathlib.Path(bootstrap['libclangCpp']['path'])
 for name,expected in EXPECTED_BINARIES.items():
  dependency=bootstrap[name];p=pathlib.Path(dependency['path'])
  if dependency['sha256']!=expected or sha(p)!=expected:raise RuntimeError('Pinned LLVM '+name+' dependency hash differs: '+str(p))
 if {(p['url'],p['sha256']) for p in bootstrap['packages']}!={(BASE+name,digest) for name,digest in PACKAGES.items()}:raise RuntimeError('Pinned LLVM package provenance differs')
 if sha(lld.parent/'wasm-ld')!=sha(lld):raise RuntimeError('WASM linker entrypoint differs from pinned LLD')
 if sha(TOOL/'hikec')!=HIKE_SHA:raise RuntimeError('Pinned Hike compiler binary differs')
 env=dict(os.environ,LD_LIBRARY_PATH=str(cpp.parent)+(os.pathsep+os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else ''))
 ir=a.out/'lora.ll';wasm=a.out/'lora.wasm';wat=a.out/'lora.wat'
 emit=[TOOL/'hikec','emit-ir','-target','wasm32','-o',ir,a.source];run(emit)
 text=ir.read_text();unsafe=re.findall(r'\b(?:fadd|fsub|fmul|fdiv)\s+(?:fast|reassoc|contract|afn|arcp|nnan|ninf|nsz)\b',text)
 if unsafe:raise RuntimeError('Unsafe FP operation flags in Hike LLVM IR: '+str(unsafe))
 flags=['--target=wasm32-unknown-unknown','-O3','-msimd128','-fno-fast-math','-ffp-contract=off','-fuse-ld='+str(lld.parent/'wasm-ld'),'-nostdlib','-Wl,--no-entry','-Wl,--export=LoraProduct4','-Wl,--export=LoraProduct8','-Wl,--export=LoraProduct16','-Wl,--export=LoraProduct32','-Wl,--export=LoraAdd','-Wl,--export=LoraCopy','-Wl,--export=LoraDecode','-Wl,--export=LoraFinite','-Wl,--export-memory','-Wl,--initial-memory=33554432','-Wl,--max-memory=33554432']
 run([clang,*flags,ir,'-o',wasm],env=env)
 run(['node',TOOL/'node_modules/wabt/bin/wasm2wat','--enable-all',wasm,'-o',wat]);w=wat.read_text()
 if '(import ' in w:raise RuntimeError('Unexpected WASM imports')
 if 'relaxed_madd' in w or 'relaxed_nmadd' in w or 'f64.' in w:raise RuntimeError('Unexpected fused or FP64 math')
 if '(export "LoraFinite" ' not in w:raise RuntimeError('Missing Hike all-values finite validator')
 record={'hikeCommit':'3c51fde6675f317453919bd505d0e2d0f638e7f1','hikeCompilerSha256':HIKE_SHA,'hikeSourceArchive':json.loads((TOOL/'hike-source.json').read_text()),'sourceSha256':sha(a.source),'llvmIrSha256':sha(ir),'wasmSha256':sha(wasm),'wasmBytes':wasm.stat().st_size,'watSha256':sha(wat),'backend':'hike-llvm-clang19-simd128-strict-f32','preferredProductExport':'LoraProduct16','finiteValidationExport':'LoraFinite','flags':flags,'emitCommand':list(map(str,emit)),'bootstrap':bootstrap,'audit':{'unsafeFPFlags':unsafe,'imports':[],'f32x4MulCount':w.count('f32x4.mul'),'f32x4AddCount':w.count('f32x4.add'),'f32MulCount':w.count('f32.mul'),'f32AddCount':w.count('f32.add'),'fma':False,'fp64':False}}
 (a.out/'build-record.json').write_text(json.dumps(record,indent=2)+'\n')
 DIST.mkdir(parents=True,exist_ok=True);shutil.copyfile(wasm,DIST/'lora.wasm')
 kernel={'abiVersion':'lora-streaming-f32-v1','wasmSha256':record['wasmSha256'],'hikeCommit':record['hikeCommit'],'backend':record['backend'],'productExport':record['preferredProductExport']}
 (DIST/'registry.mjs').write_text('export const KERNEL = Object.freeze('+json.dumps(kernel)+');\n')
 (HERE/'build-record.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'wasmSha256':record['wasmSha256'],'wasmBytes':record['wasmBytes'],'backend':record['backend'],'audit':record['audit']}))
if __name__=='__main__':main()
