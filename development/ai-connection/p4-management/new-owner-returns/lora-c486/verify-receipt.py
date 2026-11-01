#!/usr/bin/env python3
"""Read/hash the published c486 receipt closure; never run NN, oracle or a writer."""
import argparse, datetime, gzip, hashlib, json, pathlib, subprocess
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--repo',type=pathlib.Path,required=True);p.add_argument('--received',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True)
a=p.parse_args();repo=a.repo.resolve();received=a.received.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
DIST='c4860579d01d9f704cb16714e364a22668f9d57e';EXEC='a80db72feea60b9bd69e292e4716665c6f0ee77f';BASE='development/ai-connection/lora-p4-adapter/'
checks=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*argv):return subprocess.check_output(['git',*argv],cwd=repo)
def blob(c,p):return git('cat-file','blob',c+':'+p)
def read(p):return (received/p).read_bytes()
def obj(p):return json.loads(read(p))
def check(n,v):checks.append({'check':n,'pass':bool(v)})
def dump(n,v):(out/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
mbytes=read(BASE+'DELIVERY-MANIFEST.json');manifest=json.loads(mbytes);acquired=[]
check('manifest-fixed-identity',len(mbytes)==20981 and sha(mbytes)=='5e0442e31e445ee533d65e753907f673f91a551fce60defd04ed95c7da8b1cd5' and mbytes==blob(DIST,BASE+'DELIVERY-MANIFEST.json'))
check('manifest86-unique-paths',len(manifest['files'])==86==len({f['path'] for f in manifest['files']}))
for f in manifest['files']:
 b=read(f['path']);original=blob(DIST,f['path']);ok=b==original and len(b)==f['bytes'] and sha(b)==f['sha256'];check('delivery-file:'+f['path'],ok)
 if f.get('unchangedAtFixedSource'):check('unchanged-runtime-file:'+f['path'],b==blob(f['unchangedAtFixedSource'],f['path']))
 acquired.append({'path':f['path'],'distributionCommit':DIST,'byteLength':len(b),'sha256':sha(b),'gitObjectId':git('rev-parse',DIST+':'+f['path']).decode().strip(),'fullGitBytesMatched':ok})
raw_descriptor=obj(BASE+'evidence/RAW-RECEIPT.json');gz=read(BASE+'evidence/run-result.json.gz');decoded=gzip.decompress(gz);run=json.loads(decoded);result=obj(BASE+'RESULT.json');ind=obj(BASE+'evidence/independent-readback.json');sources=obj(BASE+'evidence/sources.json');contract=obj('development/lora/contracts/p4-connection-contract-0.1.json')
check('lossless-gzip-fixed',len(gz)==raw_descriptor['compressedBytes']==881221 and sha(gz)==raw_descriptor['compressedSHA256']=='8b01ef4b5fc8190a07c4a4737e1707f9573235017c7cbf463be1509b0f95a7dc')
check('lossless-decoded-fixed',len(decoded)==raw_descriptor['uncompressedBytes']==35805981 and sha(decoded)==raw_descriptor['uncompressedSHA256']=='f07081581e46d8252c207fd945f676b888bf35dbca888bd03a019dfd56bdb6b0')
check('separate-execution-a80-distribution-c486',run['receiverCommit']==run['fixedCommits']['lora']==manifest['runtimeSourceCommit']==EXEC and DIST!=EXEC and run['fixedCommits']['diffusion']=='7ee36228030ba3bb544a90b1d4b528702a7bae32' and run['fixedCommits']['manager']=='8849891f19124df31847bd691503c2491278eaa8')
check('source-records-match-original',sources['loadedSources']==run['loadedSources'] and sources['preverifiedSources']==run['preverifiedSources'] and len(run['loadedSources'])==40 and len(run['preverifiedSources'])==42)
unique={}
for s in run['loadedSources']+run['preverifiedSources']:unique[(s['commit'],s['path'])]=s
source_rows=[]
for (commit,path),s in unique.items():
 b=blob(commit,path);oid=git('rev-parse',commit+':'+path).decode().strip();ok=len(b)==s['bytes'] and sha(b)==s['sha256'] and oid==s['gitBlobSha'];check('source-Git:'+commit+':'+path,ok)
 if commit==EXEC:check('runtime-unchanged-at-delivery:'+path,b==blob(DIST,path))
 source_rows.append({'commit':commit,'path':path,'byteLength':len(b),'sha256':sha(b),'gitObjectId':oid,'freshGitReadbackMatched':ok})
for name,s in run['sourcePins'].items():
 b=blob(s['commit'],s['path']);check('role-pin:'+name,len(b)==s['byteLength'] and sha(b)==s['sha256'])
for name in ['baseContract','originalInventory','adapter','registryValidator','sdk','planner','loader','api']:
 s=contract[name];b=blob(s['commit'],s['path']);check('contract-binding:'+name,len(b)==s['bytes'] and sha(b)==s['sha256'])
check('contract-pending-management-adoption',contract['schemaVersion']=='lora-p4-connection-contract/0.1-draft.1' and contract['runtimeSourceCommit']==EXEC and contract['managementP4NormAdoption'] is False and contract['managerSnapshotPublished'] is False)
check('controlled-partial-not-management-joint-admission',run['status']=='PASS_LORA_P4_REAL_PARTIAL' and run['producerAuthenticated'] is False and run['naturalP2OrN2AcceptanceClaimed'] is False and run['managementP4NormAdoption'] is False and run['managerSnapshotPublished'] is False and not run['generationReady'] and not run['currentLiveAdmission'])
selection=result['selection'];check('lightLOW-crossQ4-scope',selection['pairId']=='light' and selection['side']=='LOW' and selection['rows']==[0,4] and selection['columns']==[0,5120] and selection['fullWeightShape']==[5120,5120] and selection['fullBiasShape']==[5120] and selection['excludedPatchCount']==1050)
check('seven-owned-case-strengths',[(c['id'],c['strength']) for c in run['cases']]==[('initial-zero',0),('initial-one',1),('initial-negative',-1),('reapply-one',1),('validation-recovery',1),('prepare-cancel-recovery',1),('native-cancel-recovery',1)])
case_rows=[]
for c in run['cases']:
 check('case-receipt:'+c['id'],c['application']['planId']==c['planId'] and c['application']['sourceSha256']==c['sourceSha256'] and c['application']['sdkInstanceId']==c['sdkInstanceId'] and c['application']['ownership']['kind']=='independent-copy' and c['weightComparison']['compared']==20480 and c['biasComparison']['compared']==4 and c['outputComparison']['compared']==10240 and c['weightComparison']['passed'] and c['biasComparison']['passed'] and c['outputComparison']['passed'])
 case_rows.append({'id':c['id'],'strength':c['strength'],'managerRevision':c['managerRevision'],'sdkInputRevision':c['localInputRevision'],'sdkApplicationRevision':c['localApplicationRevision'],'nativeEpoch':c['nativeEpoch'],'actualOutputArtifact':c['actualOutputArtifact']})
check('independent399-is-recorded-not-new-tests',ind['summary']['sourceAndOutputChecks']==399==len(ind['checks']) and ind['summary']['failures']==0 and all(c['passed'] for c in ind['checks']))
phase=ind['phaseAudit'];check('independent76-lifetime-is-recorded',len(phase['checks'])==76 and all(c['status']=='PASS' for c in phase['checks']) and not phase['blockers'])
oldbase=BASE+'manager-884/'
oldpaths=git('ls-tree','-r','--name-only',EXEC,'--',oldbase).decode().splitlines()
for path in oldpaths:check('P3-original-a80-bytes-preserved:'+path,blob(DIST,path)==blob(EXEC,path))
check('P3-original-path-count',len(oldpaths)==13)
check('partial-sampled-resources-retained',result['resourceSummary']['measurementStatus']=='PARTIAL_SAMPLED_OBSERVATION' and result['resourceSummary']['incompleteSamples']==1 and len(result['resourceSummary']['samplingErrors'])==2)
# Actual existing-package readback is a distinct new receiver action, with no writer.
helper=pathlib.Path(__file__).with_name('read-existing-p3-package.mjs')
readback=json.loads(subprocess.check_output(['node',str(helper),'--repo',str(repo),'--received',str(received)]))
check('P3-new-fresh-payload-readback',readback['status']=='PASS_FRESH_EXISTING_P3_PACKAGE_READBACK' and readback['readback']['outputByteLength']==64 and readback['originalFilesUnchanged'] and readback['packageWriterCalls']==0 and readback['packageBuilderCalls']==0 and readback['nativePrepareCalls']==0)
check('P3-reader-refusals',readback['tampered']['code']=='ASSET_HASH_MISMATCH' and readback['missingSnapshot']['code']=='REQUIRED_ASSET_MISSING')
status='PASS' if all(c['pass'] for c in checks) else 'FAIL';now=datetime.datetime.now(datetime.timezone.utc).isoformat()
identities=[{'path':BASE+'DELIVERY-MANIFEST.json','byteLength':len(mbytes),'sha256':sha(mbytes)}]+[{k:f[k] for k in ['path','byteLength','sha256']} for f in acquired if f['path'] in [BASE+'RESULT.md',BASE+'RESULT.json','docs/shared/inference/lora/P4-API.md','docs/shared/inference/lora/diffusion-p4-adapter.mjs','docs/shared/inference/lora/diffusion-p4-registry.mjs','development/lora/contracts/p4-connection-contract-0.1.json',BASE+'evidence/run-result.json.gz',BASE+'evidence/independent-readback.json']]
dump('ACQUISITION.json',{'schemaVersion':'management-c486-lora-owner-acquisition/1','observedUTC':now,'distributionCommit':DIST,'executionSourceCommit':EXEC,'status':status,'keyIdentities':identities,'manifestFileCount':86,'files':acquired,'sourceGitClosure':source_rows,'loadedSourceCount':40,'preverifiedSourceCount':42,'uniqueSourceCount':len(unique),'rawMetadata':{'gzipByteLength':len(gz),'gzipSha256':sha(gz),'decodedByteLength':len(decoded),'decodedSha256':sha(decoded)},'originalP3a80PathsByteIdenticalAtC486':len(oldpaths),'acquisitionDoesNotImplyManagementNormAdoption':True})
dump('VERIFICATION.json',{'schemaVersion':'management-c486-lora-verification/1','observedUTC':now,'status':status,'verifierSha256':sha(pathlib.Path(__file__).read_bytes()),'checksPassed':sum(c['pass'] for c in checks),'checksTotal':len(checks),'failed':[c for c in checks if not c['pass']],'checks':checks,'neuralExecutions':0,'newModelExports':0,'actualOriginalFileWholeHashes':0,'newOracleGeneration':0,'newP4NumericalArrayComparisons':0,'freshExistingP3PackageReadbacks':1})
dump('P3-PAYLOAD-READBACK.json',readback)
dump('CLASSIFICATION.json',{'schemaVersion':'management-c486-lora-separate-candidate/1','observedUTC':now,'distributionCommit':DIST,'ownerExecutionSourceCommit':EXEC,'classification':'NEW_SEPARATE_LORA_P4_CANDIDATE','acquiredAndMetadataVerified':status=='PASS','ownerReportedStatus':run['status'],'ownerReportedActualScope':{'selection':selection,'inputCohort':'controlled-caller-input-n2-k4','producerAuthenticated':False,'caseCount':7,'cases':case_rows,'independentRecordedChecks':{'sourceArtifactOutput':399,'phaseLifetimeResource':76}},'managementP4NormCatalogJointAdopted':False,'managerP4SnapshotPublished':False,'actualNaturalP2N2OrTextL512Adopted':False,'currentSourcePinsReplaced':False,'retainedP3Acceptance':{'runtimeSourceCommit':'8849891f19124df31847bd691503c2491278eaa8','originalA80MetadataPathsUnchanged':13,'originalAcceptanceUnchanged':True,'newAsOfC486PublicPayloadReadback':readback['status'],'originalEightPublicPackageFilesRead':8,'privateSelectedWeightArtifacts26Received':False,'livePublicationBrandRecreated':False},'formalE4ReimportToNativePrepare':{'status':'DEPENDENCY_WAITING','readerAcceptanceIsNotPrepareEntryAcceptance':True,'sourceAPIOrEntryNotAcquired':True,'nativePrepareExecuted':False},'resourcesOwnerObserved':{'scope':'owner-controlled diagnostic; retained recorded measurements only','hostElapsedMs':result['resourceSummary']['hostElapsedMs'],'status':result['resourceSummary']['measurementStatus'],'sampledOwnedProcessRssSumPeakBytes':result['resourceSummary']['sampledProcessRssSumPeakBytes'],'incompleteSamples':1,'unavailableRssObservations':2,'nodeHighWaterRssBytes':result['resourceSummary']['nodeProcess']['resourceUsageMaxRSSBytes'],'fullPipelinePeakBytes':None},'receiverActions':{'neuralExecutions':0,'newModelExports':0,'actualFileWholeHashes':0,'oracleGeneration':0,'P4NumericalAcceptanceRuns':0,'existingP3FilesystemPackageReadback':1},'unaccepted':['management P4 norm/catalog/three-phase hook/snapshot joint adoption','natural producer authenticated P2/N2 or actualText L512','formal output16 E4 reimport-to-native-prepare entry','other pair/side/selection/full model','SDK active lease ownership','rich conditioning metadata','generation and contribution to generated output'],'generationReady':False,'currentLiveAdmission':False,'load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY'})
print(json.dumps({'status':status,'checksPassed':sum(c['pass'] for c in checks),'checksTotal':len(checks),'failed':[c for c in checks if not c['pass']],'deliveryPaths':86,'uniqueSources':len(unique),'P3Readback':readback['status']},indent=2))
raise SystemExit(0 if status=='PASS' else 1)
