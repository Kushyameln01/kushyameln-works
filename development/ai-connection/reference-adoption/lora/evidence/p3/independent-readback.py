#!/usr/bin/env python3
"""Read recorded selected diagnostic evidence only; never runs native inference.

Inputs are this trial's selected artifacts, retained independent arrays and Git
source blobs. No original .safetensors or raw base artifact is opened.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess

ROOT = Path('/workspace/work/lora/p3-resume')
RUN = ROOT / 'run-1'
REFERENCE = Path('/workspace/work/lora/e1-joint/HIGH-fixed/reference')
REPO = Path('/workspace/work/lora-implementation')
EXECUTION = '25e5b56feeb070594110bb292d9de21e4e234f0a'
PRIOR = '0c27874908638afc748ea2455a2779a16736730b'
COMMITS = {'receiver': EXECUTION, 'manager': 'edda43f9ea69c5b3ab1af3c6eb82295f2912887c',
           'lora': 'fc2789a0f649e33f15eb13750e6a983b5c52d170',
           'diffusion': '5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3'}
checks = []
sha = lambda b: hashlib.sha256(b).hexdigest()

def check(ok, label):
    if not ok:
        raise AssertionError(label)
    checks.append(label)

def git(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=REPO)

def jbytes(value, sort=False):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False, sort_keys=sort).encode()

def floats(raw, width):
    check(len(raw) % width == 0, 'compact selected float bytes')
    return list(struct.unpack('<' + ('f' if width == 4 else 'd') * (len(raw) // width), raw))

def f32(values):
    return list(struct.unpack('<' + 'f' * len(values), struct.pack('<' + 'f' * len(values), *values)))

def compare(actual, expected, gate, record=None, label='numerical comparison'):
    check(len(actual) == len(expected) and len(actual) > 0, label + ' exact length')
    check(all(math.isfinite(v) for v in actual + expected), label + ' all finite')
    errors = [abs(a - e) for a, e in zip(actual, expected)]
    failed = [i for i, (d, e) in enumerate(zip(errors, expected)) if d > gate['absolute'] + gate['relative'] * abs(e)]
    maximum = max(errors)
    check(not failed, label + ' predeclared gate')
    if record is not None:
        check(record['passed'] is True and record['compared'] == len(actual)
              and record['failedCount'] == 0 and not record['failedIndices']
              and record['gate'] == gate and record['maxAbsoluteError'] == maximum,
              label + ' recorded comparison exactly agrees')
    return {'compared': len(actual), 'maxAbsoluteError': maximum,
            'failedCount': len(failed), 'gate': gate}

raw_result = (RUN / 'result.json').read_bytes()
r = json.loads(raw_result)
check(r['receiverCommit'] == EXECUTION and r['fixedCommits'] == {k: v for k, v in COMMITS.items() if k != 'receiver'}, 'execution and fixed owner commits')
check(r['status'] == 'PASS_MANAGED_REAL_BASE_PARTIAL_SNAPSHOT', 'actual run PASS scoped status')
check(r['realBase'] is True and r['realOriginalLoRa'] is True and r['snapshotPublished'] is True
      and r['completeAdapter'] is False and r['generationReady'] is False and r['modelInference'] is False,
      'actual bounded base diagnostic scope only')
check(not r['pageErrors'] and not r['serverErrors'] and r['inputFileUnchanged'] and r['artifactFileUnchanged']
      and not r['privateInputHTTPRequests'] and not r['legacyBridgeLoaded'], 'transport private input and source invariants')
check(all(r['cleanup'].values()), 'all recorded native and manager cleanup completed')

ref_bytes = (REFERENCE / 'reference.json').read_bytes()
gate_bytes = (REFERENCE / 'pre-execution-gates.json').read_bytes()
old_bytes = (REFERENCE.parent / 'result.json').read_bytes()
check(ref_bytes == git(PRIOR, 'development/ai-connection/evidence/lora-e1/HIGH-reference.json'), 'immutable old independent reference JSON')
check(gate_bytes == git(PRIOR, 'development/ai-connection/evidence/lora-e1/HIGH-gates.json'), 'immutable old pre-execution gates')
check(old_bytes == git(PRIOR, 'development/ai-connection/evidence/lora-e1/HIGH-result.json'), 'immutable historical source/base receipt')
ref = json.loads(ref_bytes)
gates = ref['gates']
check(gates == json.loads(gate_bytes)['gates'], 'reference and gate receipt agree')
check(gates == {'baseDecode': {'absolute': 0, 'relative': 0}, 'weight': {'absolute': 1e-5, 'relative': 1e-4},
                'bias': {'absolute': 0, 'relative': 0}, 'projection': {'absolute': 1e-6, 'relative': 1e-5}}, 'unchanged predeclared scoped gates')
refs = {c['strength']: c for c in ref['cases'] if c['pairId'] == 'light'}
check(list(refs) == [0, 1, -1], 'only retained light HIGH strengths')
reference_records = [ref['activation'], ref['baseWeight'], ref['baseBias']] + [v for c in refs.values() for v in (c['weight'], c['bias'])]
arrays = {}
for item in reference_records:
    p = REFERENCE / item['file']
    check(p.parent == REFERENCE and p.is_file(), 'safe reference path ' + item['file'])
    data = p.read_bytes()
    check(len(data) == item['bytes'] and sha(data) == item['sha256'], 'retained array bytes hash ' + item['file'])
    arrays[item['file']] = data
check(len(arrays) == 9, 'nine selected independent reference arrays')
check(r['referenceProof']['referenceJSONSHA256'] == sha(ref_bytes)
      and r['referenceProof']['gateJSONSHA256'] == sha(gate_bytes)
      and r['referenceProof']['reusedIndependentReference']
      and r['referenceProof']['priorModelFullFileVerified']
      and r['referenceProof']['priorModelReceiptIsHistorical']
      and r['referenceProof']['fullFileHashRecomputed'] is False, 'historical full-base receipt reuse not rehash claim')
check(r['privateBaseArtifact']['bytes'] == 709364
      and r['privateBaseArtifact']['sha256'] == '25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff'
      and r['privateBaseArtifact']['fullFileHashRecomputed'] is False, 'fixed bounded artifact metadata')
check(r['inputSelection']['pairId'] == 'light' and r['inputSelection']['side'] == 'HIGH'
      and r['localInput']['sourceSha256'] == r['inputSelection']['expectedSha256']
      and r['localInput']['wholeHashComputedByThisBrowserLoad'] is True
      and r['inputSelection']['fullHashPerformedByHost'] is False, 'one selected local File and browser new-load hash proof')
check(all(c['retainedOriginalIdentity']['sha256'] == r['localInput']['sourceSha256'] for c in refs.values()), 'retained reference source identity')

sources = []
for s in r['loadedSources']:
    data = git(s['commit'], s['path'])
    check(s['commit'] == COMMITS[s['owner']] and len(data) == s['bytes'] and sha(data) == s['sha256'], 'loaded Git source ' + s['owner'] + ':' + s['path'])
    sources.append({k: s[k] for k in ['owner', 'commit', 'path', 'bytes', 'sha256']})
check(len(sources) == 49 and not any(s['path'].endswith('/diagnostic-lora.mjs') for s in sources), 'all49 loaded sources no legacy bridge')
check(r['sourcePins']['kernel']['byteLength'] == 5051 and r['sourcePins']['kernel']['sha256'] == '3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24', 'corrected actual LoRA kernel')

artifacts = {}
for a in r['selectedArtifacts']:
    p = RUN / 'actual' / a['file']
    check(p.parent == RUN / 'actual', 'safe artifact path')
    data = p.read_bytes()
    check(a['file'] not in artifacts and len(data) == a['bytes'] and sha(data) == a['sha256'], 'selected artifact bytes hash ' + a['file'])
    artifacts[a['file']] = data
check(len(artifacts) == 26 and sorted(p.name for p in (RUN / 'actual').iterdir()) == sorted(artifacts), 'all26 actual artifacts no omitted extra file')

native = r['registryBindings']['nativeRegistry']
case_records = []
case_raw = {}
for c in r['cases']:
    expected = refs[c['strength']]
    wr = artifacts[c['weightArtifact']['file']]
    br = artifacts[c['biasArtifact']['file']]
    output = artifacts[c['outputArtifact']['file']]
    for k, data in [('weightArtifact', wr), ('biasArtifact', br), ('outputArtifact', output), ('scopeArtifact', artifacts[c['scopeArtifact']['file']])]:
        check(len(data) == c[k]['bytes'] and sha(data) == c[k]['sha256'], c['id'] + ' embedded artifact identity ' + k)
    weight = compare(floats(wr, 4), floats(arrays[expected['weight']['file']], 8), gates['weight'], c['weightComparison'], c['id'] + ' selected weights')
    bias = compare(floats(br, 4), floats(arrays[expected['bias']['file']], 4), gates['bias'], c['biasComparison'], c['id'] + ' selected bias')
    expected_output = f32(expected['expectedOutput'])
    actual_output = floats(output, 4)
    oc = compare(actual_output, expected_output, gates['projection'], c['outputComparison'], c['id'] + ' consumer16')
    check(actual_output == c['actualOutput'] and expected_output == c['expectedOutput'], c['id'] + ' all16 raw output matches recorded actual/expected')
    scope = json.loads(artifacts[c['scopeArtifact']['file']])
    check(scope['coverage'] == 'PARTIAL' and scope['completeAdapter'] is False
          and scope['selection'] == {'pairId': 'light', 'noise': 'high'} and scope['fullShape'] == [5120, 5120]
          and scope['sourceSha256'] == c['sourceSha256'] == r['localInput']['sourceSha256'], c['id'] + ' full shape/source versus coverage')
    check(len(scope['includedPatches']) == 2 and [p['variant'] for p in scope['includedPatches']] == ['linear-down-up', 'additive-diff-b']
          and all(p['slice'] == {'startRow': 0, 'rowCount': 16} for p in scope['includedPatches'])
          and len(scope['excludedTargets']) == expected['excludedPatchCount'] == 1050
          and len(scope['excludedRegions']) == 2
          and all(p['slice'] == {'startRow': 16, 'rowCount': 5104} for p in scope['excludedRegions']), c['id'] + ' explicit patches selected/excluded regions')
    nr = c['application']['receipt']['validation']['evidence']['nativeReceipt']
    metadata = {'schemaVersion': 'bernini-runtime-feed-set/0.1', 'modelHash': native['modelHash'],
                'graphHash': native['graphHash'], 'registryHash': native['registryHash'], 'side': 'HIGH',
                'scope': 'PARTIAL', 'weightHash': sha(wr), 'biasHash': sha(br)}
    package_hash = sha(jbytes(metadata))
    check(package_hash == nr['packageHash'], c['id'] + ' native consumer package binds all captured W/b bytes')
    check(nr['expectedSHA256'] == sha(struct.pack('<16f', *expected_output)) and nr['tolerance'] == gates['projection'], c['id'] + ' native independent output reference')
    snapshot = c['publication']['snapshot']
    check(sha(jbytes({k: v for k, v in snapshot.items() if k != 'snapshotHash'}, sort=True)) == snapshot['snapshotHash'], c['id'] + ' independently canonical snapshot hash')
    case_records.append({'id': c['id'], 'strength': c['strength'], 'weight': weight, 'bias': bias, 'output': oc,
                         'actualOutput': actual_output, 'expectedOutput': expected_output, 'nativePackageHash': package_hash,
                         'managerRevision': c['managerRevision'], 'sdkLocalInputRevision': c['localInputRevision'],
                         'sdkLocalApplicationRevision': c['localApplicationRevision'], 'nativeConsumerEpoch': next(e['receipt']['epoch'] for e in r['events'] if e['phase'] == 'NATIVE_COMMITTED' and e['managerRevision'] == c['managerRevision'])})
    case_raw[c['id']] = (wr, br, output)
check([c['id'] for c in r['cases']] == ['initial-zero', 'initial-one', 'initial-negative', 'reapply-one', 'validation-recovery', 'cancel-recovery'], 'six published case identities')
check(case_raw['initial-zero'][0] == arrays[ref['baseWeight']['file']] and case_raw['initial-zero'][1] == arrays[ref['baseBias']['file']], 'strength zero captured values reproduce retained immutable base bytes')
compare(floats(case_raw['initial-zero'][0], 4), floats(arrays[ref['baseWeight']['file']], 4), gates['baseDecode'], r['baseDecode']['weight'], 'recorded exact bounded base weight decode corroborated by zero application')
compare(floats(case_raw['initial-zero'][1], 4), floats(arrays[ref['baseBias']['file']], 4), gates['baseDecode'], r['baseDecode']['bias'], 'recorded exact bounded base bias decode corroborated by zero application')
check(r['baseDecode']['weightBytesEqual'] and r['baseDecode']['biasBytesEqual'], 'recorded raw decoded F32 digests exact')
check(all(case_raw[k] == case_raw['initial-one'] for k in ['reapply-one', 'validation-recovery', 'cancel-recovery']), 'all positive reapplications recover exact same selected W/b/output bytes')

cancel_weight = compare(floats(artifacts['cancel-at-checkpoint-weight.f32'], 4), floats(arrays[refs[-1]['weight']['file']], 8), gates['weight'], label='unpublished cancelled-checkpoint weights')
cancel_bias = compare(floats(artifacts['cancel-at-checkpoint-bias.f32'], 4), floats(arrays[refs[-1]['bias']['file']], 4), gates['bias'], label='unpublished cancelled-checkpoint bias')
check('cancel-at-checkpoint-output.f32' not in artifacts and all(c['id'] != 'cancel-at-checkpoint' for c in r['cases']), 'cancel checkpoint is not counted as published case or output artifact')
lifecycle_records = []
for item in r['lifecycle']:
    if 'actualOutput' not in item:
        continue
    baseline = item['kind'] == 'immutable-base-restore'
    expected_output = f32(ref['baseExpectedOutput'] if baseline else refs[1]['expectedOutput'])
    oc = compare(item['actualOutput'], expected_output, gates['projection'], item.get('comparison'), item['kind'] + ' preserved/restored output16')
    lifecycle_records.append({'kind': item['kind'], 'actualOutput': item['actualOutput'], 'expectedOutput': expected_output, 'output': oc})
check(len(lifecycle_records) == 4, 'four separately recorded lifecycle16 outputs')

base_stats = r['baseProviderStats']
check(base_stats['source'] == 'bounded-fragment-artifact' and base_stats['scope'] == 'PARTIAL'
      and base_stats['fullFileHashRecomputed'] is False and base_stats['fullFileSHA256Verified'] is False
      and base_stats['unprovidedRangesAvailable'] is False and len(base_stats['providedRanges']) == 5,
      'bounded provider never claims omitted ranges or new full-file proof')
for reported in r['referenceProof']['ranges']:
    observed = next(v for v in base_stats['providedRanges'] if v['id'] == reported['id'])
    prior = None if reported['id'] == 'header' else next(v for v in ref['inputRanges'] if v['name'] == 'blocks.0.self_attn.q.' + {'q.weight': 'weight', 'q.bias': 'bias', 'weight_scale': 'weight_scale', 'comfy_quant': 'comfy_quant'}[reported['id']])
    check(reported['sha256'] == (ref['baseIdentity']['headerSha256'] if prior is None else prior['sha256'])
          and reported['bytes'] == (181280 if prior is None else prior['byteLength']), 'provided range binds immutable prior reference metadata ' + reported['id'])
    check(observed['absoluteByteOffset'] == reported['absoluteByteOffset'] and observed['byteLength'] == reported['bytes']
          and observed['sha256'] == reported['sha256'] and reported['priorRangeEqual'], 'provided raw range metadata ' + reported['id'])

restored = next(v for v in r['lifecycle'] if v['kind'] == 'immutable-base-restore')
base_metadata = {'schemaVersion': 'bernini-base-feed/0.1', 'registryHash': native['registryHash'],
                 'weightHash': sha(arrays[ref['baseWeight']['file']]), 'biasHash': sha(arrays[ref['baseBias']['file']])}
check(restored['receipt']['commit']['packageHash'] == sha(jbytes(base_metadata))
      and restored['receipt']['validation']['packageHash'] == sha(jbytes(base_metadata)), 'queued immutable base restore package binds exact retained F32 base bytes')

phase_path = ROOT / 'independent-phase-fragment.json'
phase = json.loads(phase_path.read_bytes()) if phase_path.exists() else None
if phase is not None:
    check(phase.get('status') == 'PROCEED' and phase.get('executedCommit') == EXECUTION
          and not phase.get('blockers') and len(phase.get('checks', [])) == 59
          and all(c['status'] == 'PASS' for c in phase['checks']), 'independent delegated59 phase checks PASS')

output = {'schemaVersion': 'lora-managed-real-base-independent-readback/0.1', 'status': 'PASS_SCOPED_ARTIFACT_AND_SOURCE_READBACK',
          'executionCommit': EXECUTION, 'reviewer': '/root/p0_catalog_audit',
          'inputReceipt': {'file': 'run-1/result.json', 'bytes': len(raw_result), 'sha256': sha(raw_result)},
          'noRuntimeRerun': True, 'noRawOriginalOrBaseArtifactReads': True, 'noOriginalOrModelHashRecomputation': True,
          'independentReference': {'commit': PRIOR, 'referenceSha256': sha(ref_bytes), 'gateSha256': sha(gate_bytes),
                                   'arraysReadAndVerified': len(arrays), 'gates': gates},
          'artifactsReadAndVerified': len(artifacts), 'loadedGitSourceBlobsVerified': len(sources), 'loadedSourceBytes': sum(s['bytes'] for s in sources),
          'publishedCaseCounts': {'cases': 6, 'weights': 6 * 81920, 'biases': 6 * 16, 'rawOutputValues': 6 * 16, 'scopeJSONFiles': 6},
          'unpublishedCancellationCounts': {'casesPublished': 0, 'weightArtifacts': 1, 'weights': 81920, 'biasArtifacts': 1, 'biases': 16, 'candidateOutputArtifacts': 0},
          'separateLifecycleOutputValues': 4 * 16, 'publishedCases': case_records,
          'cancelledCheckpoint': {'strength': -1, 'weight': cancel_weight, 'bias': cancel_bias, 'published': False},
          'lifecycleNumericalComparisons': lifecycle_records, 'sourceFiles': sources,
          'phaseAudit': phase, 'checksPassed': len(checks),
          'scope': 'one light/HIGH local original; actual bounded first16-row Q/full5120-column weight and explicit Q bias; receiver P1 phase hooks plus native queue/snapshot',
          'generationReady': False, 'completeAdapter': False, 'modelInference': False, 'E4PackageAccepted': False,
          'notAccepted': ['other pair/side fresh receiver run', 'two-pair composition', 'full targets or full model/session', 'new whole-base file verification', 'lease or verified rebind', 'E4 package', 'generated output or generation admission'],
          'limits': ['Selected W/b/session package digests are reconstructed from all persisted bytes; individual SDK write observer records were not separately persisted in published case records.',
                     'Cancelled candidate W/b are independently read back separately; its candidate output vector is not persisted, so no additional raw candidate-output values are counted.',
                     'The actual local original whole-file hash is owner/browser evidence; the reviewer did not reopen or rehash that original or raw base artifact.']}
target = ROOT / 'independent-readback.json'
target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': output['status'], 'checksPassed': len(checks), 'artifacts': len(artifacts), 'sources': len(sources),
                  'phaseFragmentIncluded': phase is not None, 'path': str(target), 'sha256': sha(target.read_bytes())}))
