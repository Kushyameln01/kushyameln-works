#!/usr/bin/env python3
"""Retrieve immutable public packet bytes only; no Git refs, model or inference."""
import concurrent.futures, hashlib, json, os, pathlib, urllib.request

OUT = pathlib.Path(os.environ.get('TEXT_RECEIPT_DIR','/tmp/text-packet-receipt-20261102'))
ROOT = OUT / 'source'
REPO = 'Kushyameln01/kushyameln-works'
COMMIT = 'f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48'
RAW = f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/'
BASE = 'development/inference/p2-p3-acceptance/'

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'conditioning-receipt-only', 'Accept':'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()

def metadata(name, url):
    data = get(url)
    (OUT/name).write_bytes(data)
    return json.loads(data)

OUT.mkdir(parents=True, exist_ok=True)
ROOT.mkdir(exist_ok=True)
commit = metadata('remote-commit.json', f'https://api.github.com/repos/{REPO}/git/commits/{COMMIT}')
assert commit['sha'] == COMMIT
tree = metadata('remote-tree.json', f'https://api.github.com/repos/{REPO}/git/trees/{commit["tree"]["sha"]}?recursive=1')
assert tree['truncated'] is False
entries = {e['path']: e for e in tree['tree'] if e['type'] == 'blob'}

def download(path):
    e = entries[path]
    data = get(RAW+path)
    blob = hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
    assert len(data)==e['size'], f'Git tree size mismatch {path}'
    assert blob==e['sha'], f'Git blob mismatch {path}'
    target = ROOT/path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {'path':path,'url':RAW+path,'byteLength':len(data),'sha256':hashlib.sha256(data).hexdigest(),'gitBlobSha':blob,'remoteCommit':COMMIT,'remoteTreeBlobMatched':True}

initial = [BASE+'conditioning/manifest.json',BASE+'conditioning/RECEIVER.md',BASE+'conditioning/CONTRACT.md',BASE+'plain/EVIDENCE-INDEX.json']
records = [download(p) for p in initial]
packet = json.loads((ROOT/initial[0]).read_bytes())
index = json.loads((ROOT/initial[3]).read_bytes())
paths = {BASE+'plain/'+e['path'] for e in index['entries']}
selected = [packet['input']['prompt']['file'],packet['input']['tokenIds'],packet['artifact']['tensor'],packet['artifact']['attentionMask'],packet['numericAcceptance']['independentReference'],packet['numericAcceptance']['comparisonReport'],packet['outerEvidence']['evidence'],packet['outerEvidence']['trace']]
for ref in selected:
    path = pathlib.PurePosixPath(BASE+'conditioning')/ref['path']
    import posixpath
    paths.add(posixpath.normpath(str(path)))
sources = [*packet['sourceIdentity']['knownNativeImplementation'],packet['finalNormalization']['kernelSource'],packet['finalNormalization']['kernelWasm'],packet['artifact']['saveReadback']['codec']]
paths.update(e['path'] for e in sources)
paths.update(['tools/inference/text-encoder/inspect_conditioning_handoff.mjs','development/inference/codec-marker-handoff/manifests/text/manifest.json'])
paths.difference_update(initial)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    records.extend(pool.map(download, sorted(paths)))
result={'schemaVersion':'diffusion-native-conditioning-acquisition/0.1','passed':True,'repository':REPO,'distributionCommit':COMMIT,'remoteTreeSha':commit['tree']['sha'],'retrievalMethod':'GitHub immutable commit Git tree metadata plus raw HTTPS bytes; no Git checkout/fetch/ref change','gitCheckoutCreated':False,'actualCheckoutSha':None,'newNN':0,'newExport':0,'modelDownload':False,'files':sorted(records,key=lambda r:r['path'])}
(OUT/'acquisition.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'distributionCommit':COMMIT,'files':len(records),'totalBytes':sum(r['byteLength'] for r in records),'acquisition':str(OUT/'acquisition.json')}))
