import argparse, concurrent.futures, datetime, hashlib, json, pathlib, subprocess, urllib.request

parser = argparse.ArgumentParser(description='Checksum-only fixed P4 delivery acquisition; no inference/export')
parser.add_argument('--repository', type=pathlib.Path, default=pathlib.Path.cwd())
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
ROOT = args.repository.resolve()
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
D = '7ee36228030ba3bb544a90b1d4b528702a7bae32'
PREFIX = 'development/ai-connection/p4-cross-ffn/'
REPO = 'Kushyameln01/kushyameln-works'
def sha(b): return hashlib.sha256(b).hexdigest()
def obj(path): return subprocess.check_output(['git','show',f'{D}:{path}'],cwd=ROOT)
def raw(commit,path):
    url=f'https://raw.githubusercontent.com/{REPO}/{commit}/{path}'
    with urllib.request.urlopen(url,timeout=90) as f: b=f.read()
    return b,url
handoff=json.loads(obj(PREFIX+'handoff.json'))
build=json.loads(obj(PREFIX+'build.json'))
expected={PREFIX+x['path']:x for x in handoff['files']}
expected.update(build['sources'])
expected['docs/shared/diffusion-models/API.md']={'sha256':handoff['api']['sha256']}
for path,e in expected.items():
    b=obj(path)
    assert sha(b)==e['sha256'],path
    assert e.get('byteLength',len(b))==len(b),path
names=['handoff.json','build.json','RESULT.md','REPRODUCE.md','WEIGHT-FEED.md','CONDITIONING.md','conditioning-contract.json','catalog-submission.json','core/candidate-plan.json','verification.json','RUN-CONTEXT.json','production-budget-estimates.json','integration/high-browser.json','integration/low-browser.json','feed-integration/high-feed-prepare.json','feed-integration/high-feed-browser.json','feed-integration/high-feed-comparison.json']
paths=['docs/shared/diffusion-models/API.md']+[PREFIX+x for x in names]+['docs/shared/diffusion-models/ort-bridge/post-self-attention/'+x+'.mjs' for x in ['source','registry','weights','conditioning','stage']]
def one(path):
    local=obj(path); received,url=raw(D,path)
    assert local==received,path
    dest=OUT/'received'/path; dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(received)
    return {'distributionSHA':D,'path':path,'bytes':len(received),'sha256':sha(received),'gitBlobSHA1':hashlib.sha1(f'blob {len(received)}\0'.encode()+received).hexdigest(),'url':url,'matchesFixedGitObject':True,'roles':['management','lora','vae-text'] if path.endswith(('API.md','handoff.json','build.json','RESULT.md','verification.json')) else (['lora'] if path.endswith(('WEIGHT-FEED.md','weights.mjs','registry.mjs','source.mjs')) else ['vae-text'] if path.endswith(('CONDITIONING.md','conditioning-contract.json','conditioning.mjs')) else ['management'])}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: records=list(ex.map(one,paths))
remote=[]
for commit,path,scope in [
 ('8849891f19124df31847bd691503c2491278eaa8','development/ai-connection/n2-tail-management/acceptance/ADMISSION.json','Prior fixed N2 admission only; no new numerical execution'),
 ('a42ad61a7f56667ceefb4f21a9aacde859e00538','development/inference/recipient-roundtrip/2026-11-02/DIFFUSION-SOURCE-ACQUISITION.json','Text owner acknowledgement of latest 7ee contracts, not Diffusion receipt of Text data')]:
    b,url=raw(commit,path); d=json.loads(b)
    dest=OUT/'received-counterpart'/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
    remote.append({'distributionSHA':commit,'path':path,'bytes':len(b),'sha256':sha(b),'url':url,'scope':scope,'topLevelKeys':list(d)})
result={'schemaVersion':'diffusion-p4-recipient-roundtrip-outbound/0.1','acquiredAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'distributionSHA':D,'executionSources':handoff['acceptedExecutionSources'],'profileId':handoff['profileId'],'candidateBuild':handoff['candidateBuild'],'localFixedManifestUnionVerified':len(expected),'outboundRetrievedCount':len(records),'files':records,'counterpartRecordsAcquired':remote,'numericInferenceRuns':0,'exports':0,'localChecksumVerificationIsCounterpartACK':False,'productionReady':False,'load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY'}
(OUT/'outbound-files.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'PASS','fixedManifestUnion':len(expected),'outboundFiles':len(records),'outboundBytes':sum(x['bytes'] for x in records),'counterpartRecords':remote,'result':str(OUT/'outbound-files.json')},ensure_ascii=False))
