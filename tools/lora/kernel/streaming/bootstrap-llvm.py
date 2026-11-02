#!/usr/bin/env python3
"""Prepare a workspace-local Clang/LLD 19.1.7; never install system packages."""
import argparse,hashlib,json,os,pathlib,subprocess,urllib.request
from llvm_pins import BASE,PACKAGES,SYSTEM_LLVM_PATH,EXPECTED_BINARIES

DEFAULT_OUT=pathlib.Path(os.environ.get('LORA_HIKE_LLVM','/workspace/work/lora/standalone-task/llvm'))
HERE=DEFAULT_OUT
SYSTEM_LLVM=pathlib.Path(SYSTEM_LLVM_PATH)
SYSTEM_LLVM_SHA=EXPECTED_BINARIES['systemLLVM']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(argv,**kwargs):return subprocess.run(list(map(str,argv)),check=True,capture_output=True,text=True,**kwargs).stdout.strip()
def main():
 global HERE
 ap=argparse.ArgumentParser();ap.add_argument('--out',type=pathlib.Path,default=DEFAULT_OUT);a=ap.parse_args();HERE=a.out.resolve();HERE.mkdir(parents=True,exist_ok=True)
 if sha(SYSTEM_LLVM)!=SYSTEM_LLVM_SHA:raise RuntimeError('The inherited libLLVM19 differs from the verified build dependency')
 packages=[]
 for name,expected in PACKAGES.items():
  path=HERE/name
  if not path.exists():urllib.request.urlretrieve(BASE+name,path)
  if sha(path)!=expected:raise RuntimeError('Debian package hash mismatch: '+name)
  run(['dpkg-deb','-x',path,HERE/'root'])
  packages.append({'url':BASE+name,'sha256':expected,'bytes':path.stat().st_size})
 clang=HERE/'root/usr/lib/llvm-19/bin/clang';lld=HERE/'root/usr/lib/llvm-19/bin/lld';cpp=HERE/'root/usr/lib/x86_64-linux-gnu/libclang-cpp.so.19.1'
 for name,p in [('clang',clang),('lld',lld),('libclangCpp',cpp)]:
  if sha(p)!=EXPECTED_BINARIES[name]:raise RuntimeError('Pinned extracted LLVM '+name+' hash differs')
 env=dict(os.environ,LD_LIBRARY_PATH=str(cpp.parent)+(os.pathsep+os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else ''))
 record={'packages':packages,'systemLLVM':{'path':str(SYSTEM_LLVM),'realPath':str(SYSTEM_LLVM.resolve()),'sha256':SYSTEM_LLVM_SHA,'debianVersion':run(['dpkg-query','-W','-f=${Version}','libllvm19:amd64'])},'clang':{'path':str(clang),'sha256':sha(clang),'version':run([clang,'--version'],env=env)},'lld':{'path':str(lld),'sha256':sha(lld),'version':run([lld.parent/'wasm-ld','--version'],env=env)},'libclangCpp':{'path':str(cpp),'sha256':sha(cpp)}}
 (HERE/'bootstrap-record.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
if __name__=='__main__':main()
