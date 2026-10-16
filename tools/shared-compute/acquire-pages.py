"""Acquire actual Pages bytes and compare every public file with a GitHub tree snapshot.
The caller obtains the tree and commit using the GitHub connector. No source-copy substitution.
"""
import concurrent.futures, hashlib, json, sys, urllib.request
from pathlib import Path
commit,tree_path,manifest_path,destination=sys.argv[1:]
assert len(commit)==40 and all(c in '0123456789abcdef' for c in commit)
tree=json.loads(Path(tree_path).read_text());manifest=json.loads(Path(manifest_path).read_text())['files']
expected={e['path'][5:]:e['sha'] for e in tree['tree'] if e['type']=='blob' and e['path'].startswith('docs/')}
assert sorted(expected)==sorted(manifest),'GitHub tree and public allowlist differ'
root=Path(destination);root.mkdir(parents=True,exist_ok=True);public=root/'docs';public.mkdir(exist_ok=True)
base='https://kushyameln01.github.io/kushyameln-works/'
def acquire(path):
 assert '..' not in Path(path).parts and not path.startswith('/')
 with urllib.request.urlopen(base+path,timeout=30) as response:
  data=response.read();status=response.status;typ=response.headers.get('Content-Type')
 blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 if blob!=expected[path]:raise ValueError('Deployed blob mismatch: '+path)
 target=public/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 return path,{'sha256':hashlib.sha256(data).hexdigest(),'gitBlobSha1':blob,'bytes':len(data),'httpStatus':status,'contentType':typ}
rows={};errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 futures={pool.submit(acquire,path):path for path in manifest}
 for future in concurrent.futures.as_completed(futures):
  try:path,row=future.result();rows[path]=row
  except Exception as e:errors.append({'path':futures[future],'error':str(e)})
report={'status':'verified-deployed-pages-copy' if not errors and len(rows)==len(manifest) else 'incomplete-deployed-pages-copy','sourceCommit':commit,'baseUrl':base,'files':{p:r['sha256'] for p,r in sorted(rows.items())},'responses':dict(sorted(rows.items())),'errors':errors}
(root/'acquisition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'matchedFiles':len(rows),'expectedFiles':len(manifest),'errors':errors}))
if errors:sys.exit(1)
