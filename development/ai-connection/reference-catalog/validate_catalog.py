"""Static document/catalog integrity checks. Does not run inference or a manager validator."""
import json, hashlib, math, re
from pathlib import Path

def main():
 p=Path(__file__).resolve().parent
 def read(n):
  local=p/n
  if not local.exists():
   for root in [p,*p.parents]:
    refdir=root/'docs/shared/ai-connection/reference'
    for candidate in [refdir/n,refdir/'profiles'/n]:
     if candidate.is_file():
      local=candidate
      break
    if local.exists():break
  return json.loads(local.read_text())
 cat=read('catalog.v1.json')
 profiles=[]
 for n,category in [('shape.v1.json','shape'),('numeric-execution.v1.json','numeric-execution'),('normalization.v1.json','normalization'),('loader-policy.v1.json','loader-policy')]:
  j=read(n)
  assert j['category']==category and j['runtimeIntegrated'] is False
  assert j['schemaVersion']=='works-profile-reference/1.0-draft.1'
  for r in j['records']:
   assert set(['recordId','nativeProfileId','ownerRole','nativeContract','sourceRefs','requiredDeclarations','admissionConstraints','evidenceScopes','limitations']) <= set(r)
   assert r['nativeProfileId'] is None or isinstance(r['nativeProfileId'],str)
   for ref in r['sourceRefs']:
    assert re.fullmatch('[0-9a-f]{40}',ref['commit']) and ref['path'] and ref['repository']
   profiles.append(r)
 ids=[r['recordId'] for r in profiles]
 assert len(ids)==len(set(ids))==18
 rules=read('numerical-rules.v1.json')['rules']; ruleids={r['ruleId'] for r in rules}
 assert len(ruleids)==len(rules)==10
 for r in rules:
  assert r['notManagerResponsibility'] is True
  for ref in r['sourceRefs']:assert re.fullmatch('[0-9a-f]{40}',ref['commit']) and ref['path']
  for inp in r['normInputs']:
   if 'normalizationRecordId' in inp:assert inp['normalizationRecordId'] in ids
 def refs(obj):
  if isinstance(obj,dict):
   for k,v in obj.items():
    if k in ['numericalRuleRefs','ruleRefs']:assert set(v)<=ruleids,(k,v)
    refs(v)
  elif isinstance(obj,list):
   for v in obj:refs(v)
 for r in profiles:refs(r)
 norm=read('norms.v1.json')
 assert norm['runtimeIntegrated'] is False
 for r in norm['rules']:
  assert set(r['profileRefs'])<=set(ids) and set(r['numericalRuleRefs'])<=ruleids
 assert len({r['normId'] for r in norm['rules']})==len(norm['rules'])==12
 allnormprofiles={i for r in norm['rules'] for i in r['profileRefs']}
 assert allnormprofiles==set(ids)
 allnormrules={i for r in norm['rules'] for i in r['numericalRuleRefs']}
 assert allnormrules==ruleids
 shape={r['recordId']:r['requiredDeclarations'] for r in read('shape.v1.json')['records']}
 for r in list(shape.values())[:3]:
  assert math.prod(r['rawLatentShape'])==r['rawLatentElements']
  assert r['rawLatentBytes']==r['rawLatentElements']*4
 assert shape['SHAPE-VAE-WAN21-F5-16X16']['rawLatentElements']==shape['SHAPE-VAE-WAN21-F1-16X32']['rawLatentElements']
 assert shape['SHAPE-VAE-WAN21-F5-16X16']['rawLatentShape']!=shape['SHAPE-VAE-WAN21-F1-16X32']['rawLatentShape']
 norms={r['recordId']:r for r in read('normalization.v1.json')['records']}
 assert norms['NORM-WAN21-MEAN-F5']['admissionConstraints']['numericGate']['status']=='NOT_VERIFIED_FOR_F5_IN_THIS_CATALOG'
 for id in ['NORM-WAN21-MEAN-F1','NORM-WAN21-MEAN-RECT']:
  assert norms[id]['admissionConstraints']['numericGate']['maximumAbsoluteError']==2e-6
 assert cat['runtimeIntegrated'] is False
 assert cat['mappingAuthority']['duplicateMappingAllowed'] is False
 assert cat['mappingAuthority']['regressionOnly']['mayStackWithOwnerAdapter'] is False
 assert all(not r['generationReady'] and not r['e5FullSessionAccepted'] for r in cat['managementAdoptionSets'])
 assert all(not r['isManagementAdoption'] for r in cat['ownerSourceObservations'])
 for f in cat['files']+cat['documents']:
  local=p/Path(f['path']).name
  if not local.exists():
   local=next((root/f['path'] for root in [p,*p.parents] if (root/f['path']).is_file()),local)
  data=local.read_bytes()
  assert hashlib.sha256(data).hexdigest()==f['sha256'],f['path']
  if 'byteLength' in f:assert len(data)==f['byteLength']
 print(json.dumps({'result':'PASS','scope':'static catalog and document consistency only','profileRecords':len(ids),'numericalRules':len(rules),'norms':len(norm['rules']),'catalogDataDigests':len(cat['files']),'documentDigests':len(cat['documents']),'runtimeInferenceExecuted':False},ensure_ascii=False))

if __name__=='__main__':main()
