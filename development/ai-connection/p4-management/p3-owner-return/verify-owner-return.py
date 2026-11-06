#!/usr/bin/env python3
"""Verify a80 owner-return metadata/Git closure. No native execution or private payload reads."""
import argparse, base64, collections, datetime, gzip, hashlib, json, pathlib, struct, subprocess

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--repo',type=pathlib.Path,required=True)
p.add_argument('--received',type=pathlib.Path,required=True,help='Acquired tree preserving repository-relative paths')
p.add_argument('--output',type=pathlib.Path,required=True,help='Sanitized public verification packet directory')
a=p.parse_args(); repo=a.repo.resolve(); received=a.received.resolve(); out=a.output.resolve(); out.mkdir(parents=True,exist_ok=True)
DIST='a80db72feea60b9bd69e292e4716665c6f0ee77f'
EXEC='8849891f19124df31847bd691503c2491278eaa8'
BASE='development/ai-connection/lora-p4-adapter/manager-884/'
PRIOR='0c27874908638afc748ea2455a2779a16736730b'
DATA='82b21f09cb63926543181b16f0e97ebc6b9fa6be'
CODEC='2bdca59ea78580d4fe7a9d31a8de33209b64d029'
checks=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=repo)
def blob(c,path):return git('cat-file','blob',c+':'+path)
def check(name,value):checks.append({'check':name,'pass':bool(value)})
def read(path):return (received/(BASE+path)).read_bytes()
def obj(path):return json.loads(read(path))
def dump(name,value):(out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

acquired=[]
for path in git('ls-tree','-r','--name-only',DIST,'--',BASE).decode().splitlines():
 b=(received/path).read_bytes(); original=blob(DIST,path)
 check('acquired-fullbytes:'+path,b==original)
 acquired.append({'path':path,'distributionCommit':DIST,'gitObjectId':git('rev-parse',DIST+':'+path).decode().strip(),'byteLength':len(b),'sha256':sha(b),'gitFullBytesMatched':b==original})
manifest=obj('evidence/MANIFEST.json'); result=obj('RESULT.json'); independent=obj('evidence/manager884-run-2-independent.json'); first=obj('evidence/first-attempt.json')
compact_receipt=obj('evidence/receipt.json')
for f in manifest['files']:
 b=read('evidence/'+f['path']);check('owner-manifest:'+f['path'],len(b)==f['byteLength'] and sha(b)==f['sha256'])
compressed=read('evidence/run-result.json.gz'); decoded=gzip.decompress(compressed); run=json.loads(decoded); fm=manifest['fullRunMetadata']
check('raw-gzip-original',len(compressed)==2053790==fm['byteLength'] and sha(compressed)==fm['sha256']=='d860d9eef7354b29f644f8defcd728e8e0d3758153c4a9f6e9bb0cf16282970e')
check('lossless-decoded-original',len(decoded)==64415767==fm['decodedByteLength'] and sha(decoded)==fm['decodedSha256']=='123538bcf1aac5df2f2c26d6d989378b5e04efd2b96260e787ab279c61481d50')
check('execution884-not-delivery-relabel',run['receiverCommit']==run['executedSourceCommit']==run['distributionCommit']==run['fixedCommits']['manager']==result['executionSourceCommit']==EXEC and DIST!=EXEC)
check('original-run-pass',run['status']=='PASS_MANAGED_FORMAL_DATA_REAL_BASE_PARTIAL_SNAPSHOT' and run['formalBridgeAccepted'] and len(run['cases'])==6)
check('compact-public-receipt-matches-original',all(v==run[k] for k,v in compact_receipt.items() if k in run and k not in ['cases','lifecycle','snapshotTrace','queueTrace']) and compact_receipt['rawReceipt']==fm)
check('actual-new-browser-File-hash-evidence',run['localInput']['wholeHashComputedByThisBrowserLoad'] and run['localInput']['byteLength']==1244141856 and run['localInput']['sourceSha256']=='9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945' and run['localInput']['inspection']['sourceSha256'] is None and run['localInput']['inspection']['integrity']=='header-only' and run['inputSelection']['fullHashPerformedByHost'] is False and result['wholeSourceHashesForNewLoads']==1)
sources=obj('evidence/sources.json'); entry=obj('evidence/runtime-entrypoints.json')
check('source-list-matches-original',sources['loadedSources']==run['loadedSources'] and len(run['loadedSources'])==59)
ip={s['path']:s for s in independent['sourceProof']}
fresh_sources=[]
for s in run['loadedSources']:
 b=blob(s['commit'],s['path']); oid=git('rev-parse',s['commit']+':'+s['path']).decode().strip()
 ok=len(b)==s['bytes'] and sha(b)==s['sha256'] and ip[s['path']]['gitBlob']==oid
 check('pinned-source:'+s['owner']+':'+s['path'],ok)
 fresh_sources.append({'owner':s['owner'],'commit':s['commit'],'path':s['path'],'byteLength':len(b),'sha256':sha(b),'gitObjectId':oid,'fullGitBytesMatchedReceipt':ok})
for s in entry['files']:
 b=blob(EXEC,s['path']);check('runtime-entrypoint:'+s['path'],len(b)==s['byteLength'] and sha(b)==s['sha256'])
for s in run['ownerDataSourceProof']:
 original=blob(s['commit'],s['path']); deployed=blob(EXEC,s['deploymentPath'])
 check('DATA-origin-deployment:'+s['path'],s['commit']==DATA and original==deployed and len(original)==s['byteLength'] and sha(original)==s['sha256'])
codec=run['storageCodecSourceProof']; cb=blob(CODEC,codec['path']);db=blob(EXEC,codec['deploymentPath'])
check('codec-origin-deployment',cb==db and len(cb)==codec['byteLength']==8256 and sha(cb)==codec['sha256'])
for s in run['sourcePins'].values():check('native-origin:'+s['path'],sha(blob(s['commit'],s['path']))==s['sha256'])
reference=json.loads(blob(PRIOR,'development/ai-connection/evidence/lora-e1/HIGH-reference.json'));gates=json.loads(blob(PRIOR,'development/ai-connection/evidence/lora-e1/HIGH-gates.json'))
check('fixed-reference-and-gates',reference['gates']==gates['gates'] and all(sha(blob(x['sourceRef']['commit'],x['sourceRef']['path']))==x['sha256'] for x in run['referenceInputs'].values()))
expected={c['strength']:c['expectedOutput'] for c in reference['cases'] if c['pairId']=='light'}
case_rows=[]
for c in run['cases']:
 prefix='case:'+c['id']+':'
 check(prefix+'three-phases',c['normPreflight']['phase']=='preflight' and c['normCheckpoint']['phase']=='checkpoint' and c['normPostpublication']['phase']=='postpublication')
 pre=c['normPreflight']; checkpoint=c['normCheckpoint']['checkpoint']; post=c['normPostpublication'];target=c['ownerState']['target'];tup={k:c[k] for k in ['sdkInstanceId','localInputRevision','localApplicationRevision']}
 check(prefix+'preflight-no-future-receipts',len(pre['preflight'])==2 and all(not x['input']['evidence'] and not x['input']['requiredScopes'] for x in pre['preflight']))
 binding=checkpoint['referenceContext']['ownerAdmission']['phaseBinding'];pb=post['postpublication']['referenceContext']['ownerAdmission']['phaseBinding']
 check(prefix+'exact-phase-binding',binding['bound'] and not binding['missing'] and binding['snapshotTarget']==binding['outerOwnerValidationTarget']==target==pb['publicationTarget'])
 check(prefix+'snapshot-native-tuple',target['snapshotId']==c['publication']['snapshot']['snapshotId'] and target['snapshotHash']==c['publication']['snapshot']['snapshotHash'] and target['managerRevision']==c['managerRevision'] and target['localRevisionBindings']==tup==c['application']['management']['localRevisionBindings'])
 check(prefix+'published-guards',len(post['decisions'])==2 and all(d['phase']=='published' and d['publicationObserved'] and not d['failure'] for d in post['decisions']))
 check(prefix+'native-owner-terminal',c['application']['receipt']['state']=='CONSUMER_APPLIED' and not c['application']['receipt']['snapshotPublished'] and c['publication']['state']=='SNAPSHOT_PUBLISHED' and c['application']['receipt']['ownership']==c['publication']['nativeStates'][0]['ownership'] and all(c['ownerState'][k] for k in ['originalTerminal','queueReleased','preparedReleased','published']))
 check(prefix+'saved-expectation',c['expectedOutput']==expected[c['strength']])
 output=struct.pack('<16f',*c['actualOutput']);tol=reference['gates']['projection'];errors=[abs(x-y) for x,y in zip(c['actualOutput'],c['expectedOutput'])]
 check(prefix+'saved-output-hash-gate',len(output)==c['outputArtifact']['bytes']==64 and sha(output)==c['outputArtifact']['sha256'] and all(e<=tol['absolute']+tol['relative']*abs(y) for e,y in zip(errors,c['expectedOutput'])) and max(errors)==c['outputComparison']['maxAbsoluteError'])
 check(prefix+'reported-selected-numerical-scope',c['weightComparison']['compared']==81920 and c['biasComparison']['compared']==16 and c['outputComparison']['compared']==16 and all(c[k]['passed'] and c[k]['failedCount']==0 for k in ['weightComparison','biasComparison','outputComparison']))
 case_rows.append({'id':c['id'],'strength':c['strength'],'managerRevision':c['managerRevision'],'nativeTuple':tup,'snapshotTarget':target,'outputSha256':sha(output)})
# Original serializer, invoked only on saved JSON. No native or package runtime.
canonical=base64.b64encode(blob(EXEC,'docs/shared/ai-connection/canonical.mjs')).decode()
program="import fs from 'node:fs'; const {hashCanonical}=await import('data:text/javascript;base64,"+canonical+"');const values=JSON.parse(fs.readFileSync(0,'utf8')); const result=[];for(const s of values){const {snapshotHash,...body}=s;result.push(snapshotHash===await hashCanonical(body));}process.stdout.write(JSON.stringify(result));"
nr=subprocess.run(['node','--input-type=module','-e',program],input=json.dumps([c['publication']['snapshot'] for c in run['cases']]).encode(),capture_output=True,check=True)
for c,ok in zip(run['cases'],json.loads(nr.stdout)):check('canonical-snapshot:'+c['id'],ok)
life={x['kind']:x for x in run['lifecycle']}; guard=life['pre-native-reference-guard'];cancel=life['native-checkpoint-cancel'];restore=life['immutable-base-restore']
check('pre-native-exact-code-and-old-feed',guard['code']=='NORM_REFERENCE_PAYLOAD_MISMATCH' and guard['previousActiveRetained'] and guard['snapshotUncurrent'])
check('pre-native-no-owner-prepared-trace',not any(t['phase']=='OWNER_PREPARED' and t['managerRevision']==1005 for t in guard['manager']['trace']) and not any(i['revision']==1005 or 'wrong-reference' in i['id'] for i in guard['queue']['invocations']))
check('seven-prepares-seven-stages',run['nativePrepareCount']==run['nativeTransactionCount']==7 and len([i for i in run['queueTrace']['invocations'] if ':formal:' in i['id']])==7)
check('six-publications-plus-separate-restore',run['formalBridgePublishedCaseCount']==6 and run['nativeCommitCount']==7 and run['restoreTransactionCount']==1)
check('cancel-original-terminal-release',all(cancel['cancelReply'][k] for k in ['stopConfirmed','originalTerminal','resourceReleased','reusable']) and not cancel['cancelReply']['quarantined'] and cancel['priorFeedUnchanged'])
check('source-release-independent-copy',life['source-release-independent-copy']['code']=='SOURCE_BINDING_UNAVAILABLE' and life['source-release-independent-copy']['copySurvives'])
check('restore-original-terminal-release',all(restore[k] for k in ['originalTerminal','afterTerminal','resourceReleased','snapshotUncurrent']) and restore['comparison']['passed'])
saved=run['savedPackage'];positive=next(c for c in run['cases'] if c['id']=='initial-one');audit_package=independent['package'];descriptor_manifest=obj('evidence/artifact-package-manifest.json')
check('E4-complete-bound-to-actual-output-snapshot',saved['status']=='complete' and saved['outputSha256']==positive['outputArtifact']['sha256'] and saved['snapshotId']==positive['publication']['snapshot']['snapshotId'] and saved['snapshotHash']==positive['publication']['snapshot']['snapshotHash'])
check('E4-tamper-and-missing-exact-refusals',saved['tampered']['rejected'] and saved['tampered']['code']=='ASSET_HASH_MISMATCH' and saved['missing']['rejected'] and saved['missing']['code']=='REQUIRED_ASSET_MISSING')
check('E4-eight-fresh-disk-records',len(run['packageFiles'])==8 and all(f['readbackCount']>=1 for f in run['packageFiles']) and run['packageFiles']==audit_package['files']==descriptor_manifest['packageFiles'])
check('artifact26-descriptors-match',len(run['selectedArtifacts'])==26 and run['selectedArtifacts']==descriptor_manifest['selectedArtifacts'])
ar=audit_package['independentExistingE4ReaderReadback']
check('independent-existing-E4-reader-result',ar['status']=='complete' and ar['artifactCount']==1 and ar['decodedOutputCount']==16 and ar['decodedOutputSha256']==saved['outputSha256'] and ar['snapshotHash']==saved['snapshotHash'] and len(ar['readPaths'])==8 and ar['codecOriginCommit']==CODEC)
check('independent152-original-results',independent['checksTotal']==independent['checksPassed']==len(independent['checks'])==152 and all(x['pass'] for x in independent['checks']) and not independent['blockers'] and independent['blockerCount']==0)
check('first-blocked-attempt-preserved',first['status']=='SOURCE_ACQUISITION_BLOCKED' and first['nativeLoraTransactionCount']==first['originalWholeHashCount']==0 and not first['browserLaunched'] and not first['resolution']['sourceChanged'])
check('final-disposed-no-live-admission',all(run['cleanup'].values()) and not run['currentLiveAdmission'] and not run['generationReady'] and not run['snapshotTrace']['selectionCurrent'] and not run['modelInference'] and not run['completeAdapter'])
check('transport-invariants',not run['pageErrors'] and not run['serverErrors'] and not run['privateInputHTTPRequests'] and not run['legacyBridgeLoaded'] and run['inputFileUnchanged'] and run['artifactFileUnchanged'])
check('no-oracle-regeneration',run['oracleRecalculationCount']==0 and result['referenceOracleRecalculations']==0)
check('base-remains-bounded',not run['baseProviderStats']['fullFileSHA256Verified'] and not run['baseProviderStats']['fullFileHashRecomputed'])
old=json.loads(blob('dd95ed05f058930a391f015c11b9a2b963a42db5','development/ai-connection/lora-p2-p3-consumer/RESULT.json'))
check('old60d-cohort-not-relabeled',result['previousEvidencePreserved']['newRunNotRetroactivelyApplied'] and old['executionSourceCommit']=='28f44c3a1b71bef59e2d018a0db736de6d84675c' and old['fixedCommits']['manager']=='60d16b64d6020d3d20239f087f8add91268dcaad' and not set(c['sdkInstanceId'] for c in old['publishedComparisons']['cases']).intersection(c['sdkInstanceId'] for c in run['cases']))
resources=run['executionResources']
check('owner-resource-observation-scope',resources['sdkKernelInfo']['memoryBytes']==33554432 and resources['baseHike']['memoryBytes']==1572864 and resources['actualNativeStageEvidence']['OSMemoryPeak'] is None and resources['totalOSPeakBytes'] is None)
candidate=[]
for path in ['docs/shared/inference/lora/P4-API.md','docs/shared/inference/lora/diffusion-p4-adapter.mjs','docs/shared/inference/lora/diffusion-p4-registry.mjs']:
 b=blob(DIST,path);candidate.append({'distributionCommit':DIST,'path':path,'byteLength':len(b),'sha256':sha(b),'gitObjectId':git('rev-parse',DIST+':'+path).decode().strip(),'classification':'NEW_P4_CANONICAL_ADAPTER_CANDIDATE_NOT_MANAGEMENT_ADOPTED'})
check('new-P4-candidate-not-loaded-by-P3',not any('diffusion-p4-' in s['path'] for s in run['loadedSources']))
copies=[]
# Keep unsafe original audit/receipt paths in the non-public acquisition area.
for src,dest in [('RESULT.md','OWNER-RESULT.md'),('evidence/MANIFEST.json','OWNER-MANIFEST.json'),('evidence/sources.json','OWNER-SOURCES.json'),('evidence/runtime-entrypoints.json','OWNER-RUNTIME-ENTRYPOINTS.json')]:
 b=read(src);safe=b'/workspace/' not in b and b'/tmp/' not in b
 check('public-copy-no-private-root:'+dest,safe)
 if safe:copies.append((dest,b))
status='PASS' if all(x['pass'] for x in checks) else 'FAIL'
observed=datetime.datetime.now(datetime.timezone.utc).isoformat()
dump('ACQUISITION.json',{'schemaVersion':'management-owner884-acquisition/1','observedUTC':observed,'distributionCommit':DIST,'executionSourceCommit':EXEC,'files':acquired,'loadedSources':fresh_sources,'originalGzip':{'byteLength':len(compressed),'sha256':sha(compressed),'decodedByteLength':len(decoded),'decodedSha256':sha(decoded),'losslessDecodedOriginal':True},'privatePayloadsAcquired':False,'acquisitionIsSeparateFromScopedAcceptance':True})
dump('VERIFICATION.json',{'schemaVersion':'management-owner884-verification/1','observedUTC':observed,'status':status,'verifierSha256':sha(pathlib.Path(__file__).read_bytes()),'checksTotal':len(checks),'checksPassed':sum(x['pass'] for x in checks),'failed':[x for x in checks if not x['pass']],'checks':checks,'freshNativeExecutions':0,'freshFileWholeHashes':0,'freshModelInferences':0,'freshExports':0,'freshPrivatePackageReadbacks':0,'newOracleGeneration':0})
acceptance={'schemaVersion':'management-owner884-scoped-acceptance/1','observedUTC':observed,'originalObservedUTC':run['observedUTC'],'distributionCommit':DIST,'executionSourceCommit':EXEC,'status':'ACCEPTED_P3_ADDED_BOUNDARIES_FROM_OWNER_RETURN' if status=='PASS' else 'BLOCKED_VERIFICATION_FAILURE','accepted':status=='PASS','scope':{'pair':'light','side':'HIGH','coverage':'PARTIAL','selectedWeightShape':[16,5120],'selectedBiasShape':[16],'output16E4':status=='PASS','payloadTamperRefusal':saved['tampered']['code'],'snapshotMissingRefusal':saved['missing']['code'],'preNativeReferenceGuard':guard['code']},'runtimeCounts':{'publishedCases':6,'nativePrepareAttempts':7,'nativeStageAttempts':7,'separateRestoreTransactions':1,'wrongReferenceNativePreparations':0},'cases':case_rows,'ownerPackageMetadata':{'status':saved['status'],'outputSha256':saved['outputSha256'],'snapshotHash':saved['snapshotHash'],'manifestReceipt':saved['receipt'],'files':run['packageFiles'],'independentExistingReaderReadback':{'status':ar['status'],'decodedOutputSha256':ar['decodedOutputSha256'],'snapshotHash':ar['snapshotHash']}},'evidenceLimits':['Current receiver rechecked original public Git bytes, hashes, metadata bindings and saved output16 only.','The private selected artifact26 and package8 payload readbacks are original owner/independent-auditor observations, not fresh receiver payload reads.','Original884 tamper/missing tests alter freshly disk-read return bytes or omit a reader result; physical copied negative directories are not asserted.','Serialized publication records do not recreate a live publication brand.','Owner independent152 count is historical recorded evidence, distinct from this verifier count.'],'previousEvidence':{'distributionCommit':'dd95ed05f058930a391f015c11b9a2b963a42db5','executionCommit':'28f44c3a1b71bef59e2d018a0db736de6d84675c','managementCommit':'60d16b64d6020d3d20239f087f8add91268dcaad','unchanged':True},'avoidRedundantLocalRun':status=='PASS','localDeltaRunnerExecuted':False,'newP4Candidate':{'acceptedByManagement':False,'files':candidate},'unaccepted':['selected-weight N-ARTIFACT','LoRA-modified new P4 weight-feed/mapping integration','other pair/sides','joint HIGH/LOW atomic snapshot','new lease model','full-target/full-model session','generation','merge/Pages publication'],'generationReady':False,'currentLiveAdmission':False,'load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY'}
acceptance['ownerObservedResources']={'scope':'historical owner884 bounded diagnostic measurements; no fresh receiver runtime','loraKernelMemoryBytes':resources['sdkKernelInfo']['memoryBytes'],'boundedBaseHikeMemoryBytes':resources['baseHike']['memoryBytes'],'ortVersion':resources['actualNativeStageEvidence']['ortVersion'],'lastProjectionElapsedMs':resources['actualNativeStageEvidence']['elapsed'],'totalOSPeakBytes':None,'fullPipelinePeakBytes':None,'freshReceiverResourceRun':False}
acceptance['actualFileHashEvidence']={'scope':'owner884 new immutable browser File load; receiver did not reopen it','byteLength':run['localInput']['byteLength'],'sha256':run['localInput']['sourceSha256'],'wholeHashComputedByThisBrowserLoad':True,'newOwnerLoadHashCount':1,'headerInspectionIsSeparate':True}
dump('ACCEPTANCE.json',acceptance)
# Copy only already public safe documents, never the raw receipt/audit containing private paths.
for dest,b in copies:(out/dest).write_bytes(b)
print(json.dumps({'status':status,'checksPassed':sum(x['pass'] for x in checks),'checksTotal':len(checks),'acquiredPaths':len(acquired),'pinnedSourceObjects':len(fresh_sources),'freshNativeExecutions':0,'freshFileWholeHashes':0,'failed':[x for x in checks if not x['pass']]},indent=2))
raise SystemExit(0 if status=='PASS' else 1)
