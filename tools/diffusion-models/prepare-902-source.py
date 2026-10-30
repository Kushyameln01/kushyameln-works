#!/usr/bin/env python3
"""Reproduce a weight-free, fixed-commit source reference archive (no execution)."""
import argparse, gzip, hashlib, io, json, subprocess, tarfile
from pathlib import Path

COMMIT = '9023329b8d803306abcdd9342f24c01ba0df2676'
PREFIX = '9023329-source/'
PATHS = [
 'development/diffusion-models/INTEGRATION_ADJUSTMENT.md',
 'development/diffusion-models/api-adjustment/baseline-and-capacity.json',
 'development/diffusion-models/model-architecture/architecture-report.json',
 'development/diffusion-models/rev3-source.json',
 'development/diffusion-models/rev3-latent-space.json',
 'docs/shared/diffusion-models/API.md',
 'docs/shared/diffusion-models/api/index.mjs',
 'docs/shared/diffusion-models/api/worker.mjs',
 'docs/shared/diffusion-models/api/build-info.mjs',
 'docs/shared/diffusion-models/api/build-info.py',
 'docs/shared/diffusion-models/tensor-interop.mjs',
 'docs/shared/diffusion-models/latent-space/latent-space.mjs',
 'docs/shared/diffusion-models/latent-space/latent-space.hike',
 'docs/shared/diffusion-models/latent-space/kernel-registry.mjs',
 'docs/shared/diffusion-models/latent-space/build/build-record.json',
 'docs/shared/diffusion-models/latent-space/LICENSE-Hike.txt',
 'docs/shared/diffusion-models/scheduler/scheduler-kernel.mjs',
 'docs/shared/diffusion-models/scheduler/scheduler.hike',
 'docs/shared/diffusion-models/scheduler/contract.json',
 'docs/shared/diffusion-models/scheduler/build/build-record.json',
 'docs/shared/diffusion-models/scheduler/LICENSE-Hike.txt',
 'docs/shared/diffusion-models/lora/API.md',
 'docs/shared/diffusion-models/lora/source.mjs',
 'docs/shared/inference/API.md',
 'docs/shared/inference/api.mjs',
 'docs/shared/inference/tensor.mjs',
 'docs/shared/inference/tokenizer.mjs',
 'docs/shared/inference/text-encoder-api.mjs',
 'docs/shared/inference/text-encoder.mjs',
 'docs/shared/inference/vae-api.mjs',
 'docs/shared/inference/vae.mjs',
 'docs/shared/inference/lora/README.md',
]

def digest(data):
 return hashlib.sha256(data).hexdigest()

def build(repo, output):
 def git(*args, input=None):
  return subprocess.run(['git','-C',str(repo),*args], input=input,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
 assert git('rev-parse', COMMIT+'^{commit}').decode().strip() == COMMIT
 files=[]
 for name in PATHS:
  assert not name.endswith(('.safetensors','.onnx','.wasm','.bin'))
  data=git('show',COMMIT+':'+name)
  blob=git('rev-parse',COMMIT+':'+name).decode().strip()
  assert hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()==blob
  files.append({'path':name,'bytes':len(data),'sha256':digest(data),'gitBlobSHA1':blob,
                'sourceURL':'https://github.com/Kushyameln01/kushyameln-works/blob/'+COMMIT+'/'+name})
 command=['archive','--format=tar','--prefix='+PREFIX,COMMIT,'--',*PATHS]
 raw=git(*command)
 assert git('get-tar-commit-id',input=raw).decode().strip()==COMMIT
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as archive:
  actual={m.name[len(PREFIX):]:archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
  assert set(actual)==set(PATHS)
  for f in files:
   assert digest(actual[f['path']])==f['sha256']
 output.mkdir(parents=True,exist_ok=True)
 target=output/'9023329-source.tar.gz'
 with target.open('wb') as stream:
  with gzip.GzipFile(fileobj=stream,mode='wb',filename='',mtime=0,compresslevel=9) as zipped:
   zipped.write(raw)
 compressed=target.read_bytes()
 receipt={'schemaVersion':1,'scope':'fixed-commit source reference subset; not a runnable runtime bundle',
  'repository':'https://github.com/Kushyameln01/kushyameln-works',
  'commit':COMMIT,'tree':git('rev-parse',COMMIT+'^{tree}').decode().strip(),
  'commitTime':git('show','-s','--format=%cI',COMMIT).decode().strip(),
  'archive':{'file':target.name,'bytes':len(compressed),'sha256':digest(compressed),
             'uncompressedTarBytes':len(raw),'uncompressedTarSHA256':digest(raw),'prefix':PREFIX,
             'compression':'gzip level9, mtime0, empty filename'},
  'extractionCommand':['git','archive','--format=tar','--prefix='+PREFIX,COMMIT,'--',*PATHS],
  'files':files,'fileCount':len(files),'sourceBytes':sum(f['bytes'] for f in files),
  'includesWeights':False,'includesModelPayloadOrMedia':False,'includesConcurrentWorkingTreeChanges':False,
  'verification':{'paxGitCommitMatches':True,'everyFileMatchesGitBlobSHA1':True,
                  'everyArchiveFileMatchesGitSourceSHA256':True,'archivePathsExactlyMatchAllowlist':True},
  'limits':['subset only: module imports/compiled binaries/dependencies are intentionally incomplete',
            'GitHub retrieval of this local commit may fail; distributed archive bytes + this manifest are the delivery source',
            'external ComfyUI core sources are identified separately; not claimed to belong to this commit',
            'the newly written CORE-CONTRACT-MAPPING.md and later runtime edits are not part of this historical archive'],
  'reproduce':['python prepare-902-source.py --repo <repository-with-fixed-commit> --output-dir <new-directory>',
               'sha256sum 9023329-source.tar.gz',
               'gzip -dc 9023329-source.tar.gz | git get-tar-commit-id',
               'tar -tzf 9023329-source.tar.gz',
               'tar -xzf 9023329-source.tar.gz -C <empty-directory>']}
 manifest=output/'9023329-source.manifest.json'
 manifest.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 (output/'9023329-source.SHA256SUMS').write_text(digest(compressed)+'  '+target.name+'\n'+digest(manifest.read_bytes())+'  '+manifest.name+'\n')
 print(json.dumps({'archiveBytes':len(compressed),'archiveSHA256':digest(compressed),
                   'manifestSHA256':digest(manifest.read_bytes()),'files':len(files)},indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--repo',type=Path,required=True)
 parser.add_argument('--output-dir',type=Path,required=True)
 args=parser.parse_args()
 build(args.repo.resolve(),args.output_dir.resolve())
