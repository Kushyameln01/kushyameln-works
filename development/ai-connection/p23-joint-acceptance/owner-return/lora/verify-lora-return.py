#!/usr/bin/env python3
"""Read-only reconciliation of retained dd95 metadata. No native/model execution."""
import argparse, datetime, gzip, hashlib, json, pathlib, struct, subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=pathlib.Path, required=True, help='Git repository containing all pinned commit objects')
parser.add_argument('--received', type=pathlib.Path, required=True, help='Acquired dd95 tree root, containing development/ and docs/')
parser.add_argument('--output', type=pathlib.Path, required=True, help='Directory for verification receipts and lossless decoded original')
args = parser.parse_args()
REPO, ACQUIRED, ROOT = args.repo.resolve(), args.received.resolve(), args.output.resolve()
ROOT.mkdir(parents=True, exist_ok=True)
BASE = 'development/ai-connection/lora-p2-p3-consumer/'
DIST = 'dd95ed05f058930a391f015c11b9a2b963a42db5'
EXEC = '28f44c3a1b71bef59e2d018a0db736de6d84675c'
MANAGER = '60d16b64d6020d3d20239f087f8add91268dcaad'
UPDATED = '8849891f19124df31847bd691503c2491278eaa8'
FIXED_DIST = 'f34bf10a67c91f462ab46dec033eaeb2110facf1'
DATA = '82b21f09cb63926543181b16f0e97ebc6b9fa6be'
PRIOR = '0c27874908638afc748ea2455a2779a16736730b'
checks = []
def sha(b): return hashlib.sha256(b).hexdigest()
def git(*args): return subprocess.check_output(['git', *args], cwd=REPO)
def blob(c, p): return git('cat-file', 'blob', c + ':' + p)
def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
def dump(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def read(p): return (ACQUIRED / (BASE + p)).read_bytes()
def obj(p): return json.loads(read(p))

observed = datetime.datetime.now(datetime.timezone.utc).isoformat()
paths = sorted(p.relative_to(ACQUIRED).as_posix() for p in ACQUIRED.rglob('*') if p.is_file())
receipts = []
for p in paths:
    b, expected = (ACQUIRED / p).read_bytes(), blob(DIST, p)
    mode, kind, oid = git('ls-tree', DIST, '--', p).decode().split('\t')[0].split()
    same = b == expected
    check('acquired:' + p, same)
    receipts.append({'path': p, 'sourceCommit': DIST, 'gitObjectId': oid,
                     'gitMode': mode, 'byteLength': len(b), 'sha256': sha(b),
                     'gitByteLength': len(expected), 'gitSha256': sha(expected),
                     'localFullBytesEqualGit': same})
manifest, result, small, independent = [obj(p) for p in [
    'evidence/MANIFEST.json', 'RESULT.json', 'evidence/receipt.json', 'evidence/independent-readback.json']]
for f in manifest['files']:
    b = read('evidence/' + f['path'])
    check('manifest:' + f['path'], len(b) == f['bytes'] and sha(b) == f['sha256'])
compressed = read('evidence/run-result.json.gz')
decoded = gzip.decompress(compressed)
(ROOT / 'run-result.original-decoded.json').write_bytes(decoded)
run = json.loads(decoded)
raw_manifest = next(f for f in manifest['files'] if f['path'] == 'run-result.json.gz')
check('gzip:lossless decoded original bytes', len(decoded) == raw_manifest['rawBytes'] == 37764410 and sha(decoded) == raw_manifest['rawSha256'] == '50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032')
check('gzip:compressed original bytes', len(compressed) == 1211308 and sha(compressed) == '29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754')
check('execution:manager60d16 and receiver28f', run['receiverCommit'] == EXEC == result['executionSourceCommit'] == small['executionSourceCommit'] and run['fixedCommits']['manager'] == MANAGER)
check('execution:not884', run['receiverCommit'] != UPDATED and run['fixedCommits']['manager'] != UPDATED)
source_checks = []
for source in run['loadedSources']:
    b = blob(source['commit'], source['path'])
    ok = len(b) == source['bytes'] and sha(b) == source['sha256']
    check('loaded-source:' + source['owner'] + ':' + source['path'], ok)
    source_checks.append({**source, 'gitObjectId': git('rev-parse', source['commit'] + ':' + source['path']).decode().strip(), 'gitFullBytesHashMatchesReceipt': ok})
    if source['owner'] == 'receiver':
        check('receiver-execution-versus-distribution:' + source['path'], b == blob(DIST, source['path']))
for f in obj('evidence/boundary-sources.json')['staticLiteralImportClosure']:
    b = blob(f['commit'], f['path'])
    check('boundary-source:' + f['path'], len(b) == f['byteLength'] and sha(b) == f['sha256'])
data_checks = []
for f in run['dataSourceProof']:
    s, d = f['sourceRef'], f['deploymentSourceRef']
    a, b = blob(s['commit'], s['path']), blob(d['commit'], d['path'])
    original_oid = git('rev-parse', s['commit'] + ':' + s['path']).decode().strip()
    deployed_oid = git('rev-parse', d['commit'] + ':' + d['path']).decode().strip()
    ok = a == b and len(a) == f['bytes'] and sha(a) == f['sha256'] and original_oid == deployed_oid == f['originalGitBlob'] == f['deploymentGitBlob'] and s['commit'] == DATA and d['commit'] == MANAGER
    check('owner-DATA-original-deployment:' + f['key'], ok)
    data_checks.append({**f, 'freshGitBytesVerified': ok})
for name, s in run['sourcePins'].items():
    b = blob(s['commit'], s['path'])
    check('native-pin:' + name, sha(b) == s['sha256'])
reference_bytes = blob(PRIOR, 'development/ai-connection/evidence/lora-e1/HIGH-reference.json')
gate_bytes = blob(PRIOR, 'development/ai-connection/evidence/lora-e1/HIGH-gates.json')
reference, gates = json.loads(reference_bytes), json.loads(gate_bytes)
check('reference:fixed original bytes', sha(reference_bytes) == run['referenceInputs']['referenceIdentity']['sha256'])
check('gates:fixed original bytes', sha(gate_bytes) == run['referenceInputs']['gateIdentity']['sha256'] and reference['gates'] == gates['gates'])
expected = {c['strength']: c for c in reference['cases'] if c['pairId'] == 'light'}
check('case-order', [(c['id'], c['strength']) for c in run['cases']] == [('initial-zero',0),('initial-one',1),('initial-negative',-1),('reapply-one',1),('validation-recovery',1),('cancel-recovery',1)])
case_receipts = []
for c, s in zip(run['cases'], small['cases']):
    prefix = 'case:' + c['id'] + ':'
    a, own, app, publication = c['admission'], c['ownerState'], c['application'], c['publication']
    target, queue_target = own['target'], own['queueTarget']
    native_tuple = {k:c[k] for k in ['sdkInstanceId','localInputRevision','localApplicationRevision']}
    check(prefix + 'small-receipt-fields', all(c[k] == v for k,v in s.items() if k in c))
    check(prefix + 'published-formal-phases', a['phase'] == 'postpublication' and c['formalBridgeAdmitted'] and len(a['preflight']) == 2 and len(a['decisions']) == 2 and all(d['phase'] == 'published' and d['publicationObserved'] and not d['failure'] for d in a['decisions']))
    for pre in a['preflight']:
        n = pre['numericDeclarations']
        # Additive diff_b has no rank/alpha fields; preserve that original
        # presence/missing observation instead of imposing weight-only fields.
        expected_missing = ['/operations/1/rank','/operations/1/alpha','/operations/1/alphaName'] if n['variant'] == 'additive-diff-b' else []
        check(prefix + 'receipt-free-preflight:' + pre['patch'], pre['input']['evidence'] == [] and pre['input']['requiredScopes'] == [] and n['missingPaths'] == expected_missing and bool(n['observed']) and bool(n['presence']) and bool(n['origins']) and n['sourceSha256'] == c['sourceSha256'] and n['planId'] == c['planId'])
    for phase in ['checkpoint','postpublication']:
        phase_input = a[phase]
        b = phase_input['referenceContext']['ownerAdmission']['phaseBinding']
        check(prefix + phase + '-exact-binding', b['bound'] and not b['missing'] and b['snapshotTarget'] == target == b['outerOwnerValidationTarget'] and (phase != 'postpublication' or b['publicationTarget'] == target) and all(e['result'] == 'pass' for e in phase_input['evidence']))
    check(prefix + 'native-and-manager-distinct', app['receipt']['state'] == 'CONSUMER_APPLIED' and not app['receipt']['snapshotPublished'] and publication['state'] == 'SNAPSHOT_PUBLISHED' and not publication['generationReady'])
    check(prefix + 'native-tuple-resource-target', target['localRevisionBindings'] == native_tuple == app['management']['localRevisionBindings'] and target['managerRevision'] == c['managerRevision'] == queue_target['revision'] and target['resourceBinding'] == app['management']['resourceBinding'] and queue_target['resourceGeneration'] == target['resourceBinding']['resourceGeneration'] and own['nativePhaseTarget'] == app['management']['target'] and bool(queue_target['requestId']))
    check(prefix + 'snapshot-binding', target['snapshotId'] == publication['snapshot']['snapshotId'] and target['snapshotHash'] == publication['snapshot']['snapshotHash'] and c['ownerValidation']['target'] == target)
    check(prefix + 'copy-owner', app['receipt']['ownership'] == publication['nativeStates'][0]['ownership'] and app['receipt']['ownership']['kind'] == 'independent-copy')
    check(prefix + 'terminal-release', all(own[k] for k in ['originalTerminal','queueReleased','published','preparedReleased']) and c['preparedReleasedBeforeRun'] and c['candidateHistoryReleasedBeforeRun'])
    check(prefix + 'expected16-from-fixed-ref', c['expectedOutput'] == expected[c['strength']]['expectedOutput'])
    output_bytes = struct.pack('<16f', *c['actualOutput'])
    check(prefix + 'saved16-output-hash-in-memory', sha(output_bytes) == c['outputArtifact']['sha256'] and c['outputArtifact']['bytes'] == 64)
    tol = reference['gates']['projection']
    errors = [abs(x-y) for x,y in zip(c['actualOutput'], c['expectedOutput'])]
    check(prefix + 'saved16-output-retained-gate', len(c['actualOutput']) == 16 and all(err <= tol['absolute'] + tol['relative']*abs(y) for err,y in zip(errors,c['expectedOutput'])) and max(errors) == c['outputComparison']['maxAbsoluteError'])
    check(prefix + 'reported-selected-comparison', c['weightComparison']['compared'] == 81920 and c['biasComparison']['compared'] == 16 and c['outputComparison']['compared'] == 16 and all(c[k]['passed'] and c[k]['failedCount'] == 0 for k in ['weightComparison','biasComparison','outputComparison']))
    case_receipts.append({'id':c['id'],'strength':c['strength'],'managerRevision':c['managerRevision'],'nativeTuple':native_tuple,'consumerEpoch':c['consumerEpoch'],'snapshotTarget':target,'nativePhaseTarget':own['nativePhaseTarget'],'queueTarget':queue_target,'outputSha256':sha(output_bytes),'nativeCopyOwner':app['receipt']['ownership']})
historical_artifacts = {v['file']:v for v in independent['artifactReadback']}
for f in run['selectedArtifacts']:
    h = historical_artifacts[f['file']]
    check('historical-private-artifact-descriptor:' + f['file'], f['bytes'] == h['bytes'] == h['observedBytes'] and f['sha256'] == h['sha256'] == h['observedSha256'] and h['fileReadback'])
positive = [c for c in run['cases'] if c['strength'] == 1]
check('reapply:stable hashes', len({c['weightArtifact']['sha256'] for c in positive}) == 1 and len({c['ownerValidation']['nativeValidation']['evidence']['nativeReceipt']['packageHash'] for c in positive}) == 1)
life = {x['kind']:x for x in run['lifecycle']}
failure = life['native-validation-failure']
check('negative:actual-native-activation-mismatch', failure['code'] == 'NATIVE_VALIDATION_MISMATCH' and 'activation copy[0] +1024' in failure['control'] and 'expected/gate unchanged' in failure['control'] and len(failure['preparedBlocks']) > 0)
cancel = life['formal-native-checkpoint-cancel']
check('cancel:barrier-and-prior-feed', all(cancel['cancelReply'][k] for k in ['stopConfirmed','originalTerminal','resourceReleased','reusable']) and not cancel['cancelReply']['quarantined'] and cancel['priorFeedUnchanged'] and cancel['snapshotUncurrent'])
restore = life['immutable-base-restore']
check('restore:queue-owned-terminal-release', all(restore[k] for k in ['snapshotUncurrent','originalTerminal','afterTerminal','resourceReleased']) and restore['comparison']['passed'] and restore['queue']['originalTerminal'] and restore['queue']['resourceReleased'])
check('source-release:independent-copy', life['source-release-independent-copy']['code'] == 'SOURCE_BINDING_UNAVAILABLE' and life['source-release-independent-copy']['copySurvives'])
check('terminal:scope-and-cleanup', not run['currentLiveAdmission'] and not run['generationReady'] and not run['completeAdapter'] and not run['modelInference'] and not run['snapshotTrace']['selectionCurrent'] and all(run['cleanup'].values()) and not run['pageErrors'] and not run['serverErrors'])
check('base:bounded-and-historical', not run['baseProviderStats']['fullFileSHA256Verified'] and not run['baseProviderStats']['fullFileHashRecomputed'] and run['baseProviderStats']['priorOwnerReceipt']['verification'] == 'PRIOR_OWNER_RECEIPT_NOT_REHASHED')
check('updated884:no-E4-return-evidence', 'savedPackage' not in run and 'packageFiles' not in run and 'pre-native-reference-guard' not in life)
runtime_delta = git('diff','--name-only',MANAGER,UPDATED,'--','docs/shared/ai-connection').decode().splitlines()
check('updated884:shared-runtime-unchanged', runtime_delta == ['docs/shared/ai-connection/API.md'])
updated_path = 'tools/ai-connection/managed-lora-data-real-browser-cases.mjs'
updated_source = blob(UPDATED, updated_path)
check('updated884:source-delta-present', all(s.encode() in updated_source for s in ['validationExpected[0]+=1','NORM_REFERENCE_PAYLOAD_MISMATCH','writeArtifactPackage','readArtifactPackage','ASSET_HASH_MISMATCH','REQUIRED_ASSET_MISSING']))
dump('acquisition-receipt.json', {'schemaVersion':'management-lora-return-acquisition/1','observedUTC':observed,'dateJST':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat(),'distributionCommit':DIST,'executionSourceCommit':EXEC,'managementExecutionCommit':MANAGER,'updatedRunnerCommit':UPDATED,'fixedManagementDistributionCommit':FIXED_DIST,'status':'ACQUIRED_FULL_BYTES_VERIFIED' if all(x['localFullBytesEqualGit'] for x in receipts) else 'FAIL','files':receipts,'gzip':{'compressedBytes':len(compressed),'compressedSha256':sha(compressed),'decodedBytes':len(decoded),'decodedSha256':sha(decoded),'decodedPath':'run-result.original-decoded.json','losslessByteDecode':True},'loadedSourceGitReadback':source_checks,'ownerDataOriginalDeploymentReadback':data_checks,'acquisitionIsNotTransactionAcceptance':True})
dump('case-bindings.json', case_receipts)
dump('verification-output.json', {'schemaVersion':'management-lora-return-verification/1','observedUTC':observed,'scriptSha256':sha(pathlib.Path(__file__).read_bytes()),'inputs':{'repo':str(REPO),'received':str(ACQUIRED),'output':str(ROOT)},'status':'PASS' if all(c['passed'] for c in checks) else 'FAIL','checks':len(checks),'passed':sum(c['passed'] for c in checks),'failed':[c for c in checks if not c['passed']],'checkResults':checks,'freshNativeExecutions':0,'freshModelExecutions':0,'oracleRegenerations':0,'modelDownloads':0,'privateSelectedWeightBytesRead':0,'scope':'Fresh public retained metadata/Git/hash/binding/saved16-output reconciliation. Private large input/weight hashes and native numerical tests remain historical reported evidence.'})
print(json.dumps({'status':'PASS' if all(c['passed'] for c in checks) else 'FAIL','checks':len(checks),'passed':sum(c['passed'] for c in checks),'failed':[c['name'] for c in checks if not c['passed']],'acquiredFiles':len(receipts),'loadedSources':len(source_checks),'rawBytes':len(decoded),'nativeExecutions':0},indent=2))
raise SystemExit(0 if all(c['passed'] for c in checks) else 1)
