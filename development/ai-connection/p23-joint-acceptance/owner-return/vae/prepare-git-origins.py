"""Read original Git blobs only; no runtime, model acquisition or inference."""
import argparse,hashlib,json,pathlib,subprocess
script_root=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('repo_positional',nargs='?',help='Backward-compatible repository path')
parser.add_argument('--repo',help='Local repository containing the fixed Git objects')
parser.add_argument('--output',type=pathlib.Path,default=script_root,help='Extraction/output directory; defaults to this script directory')
args=parser.parse_args()
root=args.output.resolve();root.mkdir(parents=True,exist_ok=True)
repo=args.repo or args.repo_positional or '/workspace/kushyameln-works'
u=root/'git-originals/development/inference/p2-p3-acceptance/p2/updated-884'
dist='f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48'
mgr='8849891f19124df31847bd691503c2491278eaa8'
f34='f34bf10a67c91f462ab46dec033eaeb2110facf1'
vae='855f435120f08eb9e818e51281fc26f0e2633829'
diff='5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3'
cat='6dae9a6fac3e9ad29ea941f22211edbe4aa894ad'
load=lambda p:json.loads(p.read_text())
records={}
def add(commit,path,expected=None):
    key=commit+':'+path
    if key not in records:
        b=subprocess.check_output(['git','show',key],cwd=repo)
        blob=subprocess.check_output(['git','rev-parse',key],cwd=repo,text=True).strip()
        target=root/'source-git'/commit/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
        records[key]={'commit':commit,'path':path,'byteLength':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitBlob':blob}
    r=records[key]
    if expected:
        assert r['byteLength']==expected.get('byteLength',expected.get('bytes')),(key,'length')
        assert r['sha256']==expected['sha256'],(key,'sha256')
        if expected.get('gitBlobSha'):assert r['gitBlob']==expected['gitBlobSha'],(key,'blob')
    return r
receipt_path=root/'acquisition-receipt.json'
if not receipt_path.exists():receipt_path.write_bytes((script_root/'acquisition-receipt.json').read_bytes())
for r in load(receipt_path)['files']:
    add(dist,r['path'],r)
    original=root/'git-originals'/r['path'];original.parent.mkdir(parents=True,exist_ok=True)
    original.write_bytes((root/'source-git'/dist/r['path']).read_bytes())
for r in load(u/'NEW-884-SOURCE-CLOSURE.json')['files']:
    add(mgr,r['path'],r);add(f34,r['path'])
comparison=load(u/'SOURCE-COMPARISON-884-60d-f34.json')
for r in comparison['files']:
    add(comparison['recordedManagementExecutionCommit'],r['path'],r['actual60d']);add(comparison['recordedManagementExecutionCommit'],r['path'],r['recordedExecuted60d']);add(mgr,r['path'],r['actual884']);add(f34,r['path'],r['actualF34'])
for r in load(u/'MANAGER-SOURCE-RECEIVED.json')['sourceProof']['records']:add(mgr,r['path'],r)
for scenario in ['decode','cancel-recover']:
    d=load(u/scenario/'result.json');m=d['mean'];v=d['decode']
    for r in d['sourceCheckpoint']['records']:add(mgr,r['path'],r)
    for r in m['sourceReceipts']+v['sourceProof']+[v['manifestIdentity'],v['referenceIdentity']]:add(r['sourceRef']['commit'],r['sourceRef']['path'],r)
    for r in v['cases'][-1]['normExecution']['decisions'][-1]['decision']['referenceTrace']['integrityReceipts']:add(cat,r['path'],r)
for commit,path in [('2bdca59ea78580d4fe7a9d31a8de33209b64d029','docs/shared/inference/tensor.mjs'),(vae,'development/inference/e6/fixtures/png-roundtrip.f32'),(diff,'development/ai-connection/e6/reference-received.json'),(vae,'development/inference/e6/fixtures/api-recovery.wktensor'),('35151d1f447d6bba30931a8c28636b2d5d9c3820','development/inference/reference-adoption/p2/run/restored.wktensor')]:add(commit,path)
observer=load(u/'observer-result.json')
add(observer['observerSourceCommit'],'tools/inference/vae/observe_management_joint.py')
(root/'git-origin-ledger.json').write_text(json.dumps({'schemaVersion':'works-git-original-ledger/1.0','method':'git show commit:path plus git rev-parse commit:path; original bytes retained unchanged','files':list(records.values())},indent=2)+'\n')
print(json.dumps({'originalGitBlobs':len(records),'bytes':sum(r['byteLength'] for r in records.values()),'allRequestedIdentityChecksPassed':True}))
