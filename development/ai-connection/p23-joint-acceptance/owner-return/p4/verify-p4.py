#!/usr/bin/env python3
"""Receipt/source reconciliation only. Never import or run candidate code/models."""
import argparse
import collections
import hashlib
import json
import math
import pathlib
import posixpath
import re
import subprocess

P = 'development/ai-connection/p4-cross-ffn/'
DIST = '7ee36228030ba3bb544a90b1d4b528702a7bae32'
FINAL = '5744f700e17b23d5c18d32315fb6dfbd7c49089a'
BASE = '829467c14ec6fd1ab1858dfc175c84605de1ac98'
PROFILE = 'bernini-block0-n2-cross-ffn-f32-candidate-v1'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=pathlib.Path, default=pathlib.Path('/workspace/kushyameln-works'))
parser.add_argument('--received', type=pathlib.Path, default=pathlib.Path('/workspace/work/ai-connection/returns-r10/p4-7ee'))
parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
checks = collections.Counter()
failures = []
acquired = {}

def sha(b):
    return hashlib.sha256(b).hexdigest()

def git(commit, path):
    return subprocess.check_output(['git', '-C', str(args.repo), 'show', commit + ':' + path])

def obj(commit, path):
    return json.loads(git(commit, path))

def check(group, name, passed):
    checks[group] += 1
    if not passed:
        failures.append({'group': group, 'check': name})

def acquire(path, expected=None, execution=None, category='public-evidence'):
    data = git(DIST, path)
    local = args.received / path
    if not local.is_file():
        local = args.output / 'acquired-source' / path
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
    actual = {'sha256': sha(data), 'byteLength': len(data)}
    check('acquisition', path + ':local-vs-distribution', local.read_bytes() == data)
    row = {'category': category, 'sourceRef': {'repository': 'Kushyameln01/kushyameln-works', 'commit': DIST, 'path': path},
           'acquisitionPath': str(local), **actual,
           'gitBlobSHA1': subprocess.check_output(['git', '-C', str(args.repo), 'rev-parse', DIST + ':' + path], text=True).strip(),
           'localMatchesDistributionGitBytes': local.read_bytes() == data}
    if expected:
        check('declared-hash-length', path, all(actual[k] == expected[k] for k in ('sha256', 'byteLength')))
        row['declaredIdentityMatch'] = all(actual[k] == expected[k] for k in ('sha256', 'byteLength'))
    if execution:
        exec_data = git(execution, path)
        row['executionSourceCommit'] = execution
        row['executionSourceSHA256'] = sha(exec_data)
        row['executionSourceByteLength'] = len(exec_data)
        row['distributionBytesEqualExecutionSource'] = data == exec_data
        check('execution-distribution', path, data == exec_data)
    acquired[path] = row
    return data

handoff = obj(DIST, P + 'handoff.json')
build = obj(DIST, P + 'build.json')
plan = obj(DIST, P + 'core/candidate-plan.json')
receiver = obj(DIST, P + 'receiver/receipt.json')
for f in handoff['files']:
    acquire(P + f['path'], f)
acquire(P + 'handoff.json')
for path, expected in build['sources'].items():
    acquire(path, expected, FINAL, 'runtime-source-build-closure')
for item in receiver['contractFiles']:
    acquire(item['path'], item, FINAL, 'public-contract')
check('manifest', 'handoff-profile', handoff['profileId'] == PROFILE)
check('manifest', 'sourceCount', len(build['sources']) == build['sourceCount'] == 50)
inventory = {p: {'sha256': acquired[p]['sha256'], 'byteLength': acquired[p]['byteLength']} for p in sorted(build['sources'])}
inventory_hash = sha(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode())
check('manifest', 'computed-source-inventory', inventory_hash == build['sourceInventorySHA256'])
check('manifest', 'api-hash', acquired[handoff['api']['path']]['sha256'] == handoff['api']['sha256'])
check('manifest', 'receiver-source-counts-and-bytes', sum(v['byteLength'] for v in inventory.values()) == receiver['totalSourceBytes'] == 13352427)
check('manifest', 'receiver50-own-actual50', {x['path']: {'sha256': x['sha256'], 'byteLength': x['byteLength']} for x in receiver['sourceFiles']} == inventory)

tree = set(subprocess.check_output(['git', '-C', str(args.repo), 'ls-tree', '-r', '--name-only', DIST], text=True).splitlines())
closure_edges = []
for path in build['sources']:
    if not path.endswith(('.mjs', '.js')):
        continue
    source = git(DIST, path).decode()
    targets = re.findall(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]''', source)
    targets += re.findall(r'''new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url''', source)
    for target in targets:
        target = posixpath.normpath(posixpath.join(posixpath.dirname(path), target))
        is_directory = any(p.startswith(target.rstrip('/') + '/') for p in tree) and target not in tree
        closure_edges.append({'from': path, 'to': target, 'directoryRoot': is_directory})
        check('static-import-assets', path + ':' + target, is_directory or target in build['sources'])
record = obj(DIST, 'docs/shared/diffusion-models/ort-bridge/post-self-attention/build-record.json')
for key, name in [('sourceSha256','math.hike'), ('hostSha256','math.mjs'), ('builderSha256','build.py'), ('wasmSha256','kernel.wasm'), ('watSha256','kernel.wat'), ('runtimeSha256','runtime.js')]:
    path = 'docs/shared/diffusion-models/ort-bridge/post-self-attention/' + name
    check('hike-build', name, acquired[path]['sha256'] == record[key])

source_alignment = []
for scope, file, commit in [('HIGH','integration/high-browser.json',BASE), ('LOW','integration/low-browser.json',BASE), ('F32_FEED_HIGH','feed-integration/high-feed-browser.json',FINAL)]:
    receipt = obj(DIST, P + file)
    matches = 0
    for path, expected in receipt['sourceSHA256'].items():
        original = git(commit, path)
        latest = git(FINAL, path)
        distribution = git(DIST, path)
        same = sha(original) == sha(latest) == sha(distribution) == expected
        check('executed-source-binding', scope + ':' + path, same)
        matches += int(same)
    source_alignment.append({'scope': scope, 'executionSourceCommit': commit, 'records': len(receipt['sourceSHA256']), 'matchedToExecutionFinalAndDistribution': matches})
source_changes = []
for path in build['sources']:
    old, new = git(BASE, path), git(FINAL, path)
    if old != new:
        source_changes.append({'path': path, 'baseSHA256': sha(old), 'finalSHA256': sha(new), 'baseBytes': len(old), 'finalBytes': len(new)})
check('source-version', 'only-feed-browser-changed', [x['path'] for x in source_changes] == ['tools/diffusion-models/p4-cross-ffn-feed-browser.py'])

admission = json.loads((args.repo / 'development/ai-connection/n2-tail-management/acceptance/ADMISSION.json').read_bytes())
old_sides = {x['side']: x for x in admission['sides']}
fixture = obj(DIST, P + 'core/fixture-contract.json')
summary = []
for side in ('HIGH', 'LOW'):
    name = side.lower()
    actual = obj(DIST, P + f'integration/{name}-browser.json')
    compared = obj(DIST, P + f'integration/{name}-comparison.json')
    declared = plan['cases'][side]
    expath = declared['exportReceiptPath']
    export = json.loads(acquire(expath, {'sha256': declared['exportReceiptSHA256'], 'byteLength': len(git(DIST, expath))}, FINAL, 'saved-tail-public-receipt'))
    old = old_sides[side]
    check('accepted-old-tail', side + ':residual', old['outputBinding']['sha256'] == declared['residualSHA256'] == export['arrayIdentities']['residual']['sha256'])
    check('accepted-old-tail', side + ':timeAct1', old['inputHashes']['timeAct1SHA256'] == declared['timeAct1SHA256'] == export['inputBindings']['fullPrefix']['timeAct1SHA256'])
    check('accepted-old-tail', side + ':e4manifest', actual['inputBindings']['savedTailGuard']['oldE4Package']['manifestSHA256'] == old['packageReceipt']['manifestSha256'])
    check('receipt-binding', side + ':runtime-payload', compared['privateArtifactSHA256'] == actual['privateArtifactSHA256'])
    for key in ('conditioningDataSHA256', 'conditioningMaskSHA256'):
        fixture_key = 'dataSHA256' if key == 'conditioningDataSHA256' else 'attentionMaskSHA256'
        check('receipt-binding', side + ':' + key, actual['inputBindings'][key] == fixture[fixture_key])
    check('receipt-binding', side + ':fixture-contract', actual['inputBindings']['fixtureContractSHA256'] == sha(git(DIST, P + 'core/fixture-contract.json')))
    totals = {'side': side, 'executionSourceCommit': BASE, 'comparisonCount': 0, 'comparedValues': 0, 'failedValues': 0, 'parameterSelections': compared['parameterProof']['verifiedParameterCount'], 'privateArraysReceived': False}
    for mode in ('local', 'composed'):
        ref = obj(DIST, P + f'reference-baseline/{name}-{mode}-reference-receipt.json')
        cuts = compared['comparisons'][mode]
        check('reference-binding', side + ':' + mode + ':payload-hash', compared['referenceSHA256'][mode] == ref['referenceSHA256'])
        check('reference-binding', side + ':' + mode + ':plan', compared['candidatePlanSHA256'] == ref['candidatePlanSHA256'] == sha(git(DIST, P + 'core/candidate-plan.json')))
        check('reference-binding', side + ':' + mode + ':input-anchors', all(ref['inputBindings'][k] == v for k, v in declared.items()))
        check('reference-binding', side + ':' + mode + ':array-count', set(cuts) == set(plan['intermediates']) == set(actual['outputIdentities']) == set(ref['arrayIdentities']))
        for array, values in cuts.items():
            ident = actual['outputIdentities'][array]
            reference = ref['arrayIdentities'][array]
            check('comparison-metadata', side + ':' + mode + ':' + array, values['actualSHA256'] == ident['sha256'] and values['referenceSHA256'] == reference['sha256'] and values['values'] == ident['elements'] == reference['elements'] == math.prod(ident['shape']) and ident['bytes'] == 4 * ident['elements'] and values['failed'] == 0 and values['gate'] == plan['gates']['localCut' if mode == 'local' else 'composed'] and values == ref['comparisons'][array])
        totals['comparisonCount'] += len(cuts)
        totals['comparedValues'] += sum(x['values'] for x in cuts.values())
        totals['failedValues'] += sum(x['failed'] for x in cuts.values())
        totals[mode + 'MaxAbsolute'] = max(x['maxAbsolute'] for x in cuts.values())
    check('reported-totals', side, totals['comparisonCount'] == 50 and totals['comparedValues'] == 643072 and totals['failedValues'] == 0 and totals['parameterSelections'] == 29)
    for key, param in compared['parameterProof']['parameters'].items():
        check('parameter-metadata', side + ':' + key, param['rawSHA256'] == ref['parameterSources'][key]['rawSHA256'] and param['decodedF32SHA256'] == param['effectiveF32SHA256'] == param['independentOriginalDecodedF32SHA256'] == ref['parameterSources'][key]['decodedF32SHA256'] and param['strictOriginalAndDecodedBits'] is True)
    summary.append(totals)

feed = obj(DIST, P + 'feed-integration/high-feed-browser.json')
compared = obj(DIST, P + 'feed-integration/high-feed-comparison.json')
reference = obj(DIST, P + 'reference-patched/high-composed-reference-receipt.json')
check('feed-binding', 'payload-and-reference', compared['runtimeArtifactSHA256'] == feed['privateArtifactSHA256'] and compared['referenceSHA256'] == feed['referenceSHA256'] == reference['referenceSHA256'])
check('feed-binding', 'patch-payload', compared['patchArtifactSHA256'] == feed['patchArtifactSHA256'] == reference['weightFeed']['inputArtifactSHA256'])
for name, values in compared['comparisons'].items():
    check('feed-comparison-metadata', name, values['actualSHA256'] == feed['outputIdentities'][name]['sha256'] and values['referenceSHA256'] == reference['arrayIdentities'][name]['sha256'] and values['values'] == feed['outputIdentities'][name]['elements'] == reference['arrayIdentities'][name]['elements'] and values['failed'] == 0 and values['gate'] == plan['gates']['composed'])
check('feed-binding', 'counts', len(compared['comparisons']) == 25 and sum(x['values'] for x in compared['comparisons'].values()) == 321536 and sum(x['failed'] for x in compared['comparisons'].values()) == 0)
check('feed-binding', 'consumer-output', feed['validation']['outputSHA256'] == feed['outputIdentities']['blockOutput']['sha256'] == compared['comparisons']['blockOutput']['actualSHA256'])
check('feed-binding', 'new-high-only-targets', [x['weightId'] for x in feed['patches']] == ['blocks.0.cross_attn.q.weight','blocks.0.cross_attn.q.bias'] and [x['count'] for x in feed['patches']] == [20480, 4] and feed['side'] == 'HIGH')
for patch, declared in zip(feed['patches'], reference['weightFeed']['patches']):
    check('feed-binding', patch['weightId'] + ':patch-metadata', all(patch[k] == v for k, v in declared.items()))
check('feed-binding', 'finite-state-claims', feed['boundaries']['committedEpoch'] == 1 and feed['boundaries']['rollbackEpoch'] == 2 and feed['boundaries']['restoreVerification'] == 'bounded target reread; stage not rerun')
check('feed-binding', 'parameter-count', compared['originalAndFinalF32ParameterProof']['verifiedParameterCount'] == len(compared['originalAndFinalF32ParameterProof']['parameters']) == len(feed['parameterProof']['parameters']) == 29)
for key, param in compared['originalAndFinalF32ParameterProof']['parameters'].items():
    original = reference['parameterSources'][key]
    check('feed-parameter-metadata', key, param == feed['parameterProof']['parameters'][key] and param['rawSHA256'] == original['rawSHA256'] and param['independentOriginalDecodedF32SHA256'] == original['decodedF32SHA256'] and param['actualFinalF32SHA256'] == original['finalF32SHA256'])

receipt = {'schemaVersion': 'works-p4-manager-acquisition/0.1', 'dateJST': '2026-11-02',
           'status': 'PASS_PUBLIC_ACQUISITION_AND_RECEIPT_RECONCILIATION' if not failures else 'FAIL',
           'distributionCommit': DIST, 'executionSources': {'baseHIGHAndLOW': BASE, 'finalF32FeedHIGH': FINAL},
           'method': 'Read exact blobs from freshly fetched fixed Git objects, compare materialized local bytes, and independently recompute SHA-256/length; no producer verification script executed',
           'sourceCount': len(inventory), 'sourceTotalBytes': sum(x['byteLength'] for x in inventory.values()), 'sourceInventorySHA256': inventory_hash,
           'handoffIndexedFiles': len(handoff['files']), 'uniqueAcquiredFiles': len(acquired), 'uniqueAcquiredBytes': sum(x['byteLength'] for x in acquired.values()),
           'checks': dict(checks), 'checkCount': sum(checks.values()), 'failures': failures,
           'files': list(acquired.values()), 'importAssetEdges': closure_edges,
           'executionSourceAlignment': source_alignment, 'baseToFinalSourceChanges': source_changes,
           'baseNumericalReceiptsReconciled': summary,
           'finalF32NumericalReceiptReconciled': {'side': 'HIGH', 'composedArrays': 25, 'comparedValues': 321536, 'failedValues': 0, 'parameterSelectionsReported': 29, 'privateArraysReceived': False},
           'privacyAndExecution': {'publicSourceAndReceiptOnly': True, 'privateModelsReceived': False, 'privateRuntimeArraysReceived': False, 'privateReferencePayloadsReceived': False, 'privateSavedOutputPackagesReceived': False, 'actualTextPayloadReceived': False, 'nativeOrInferenceExecuted': False, 'referencesRecomputed': False, 'exportsRepeated': False, 'canonicalMappingRecreated': False},
           'generationReady': False, 'load': 'NOT_READY', 'predict': 'NOT_READY', 'sample': 'NOT_READY'}
(args.output / 'ACQUISITION-RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: receipt[k] for k in ('status','sourceCount','sourceTotalBytes','sourceInventorySHA256','handoffIndexedFiles','uniqueAcquiredFiles','uniqueAcquiredBytes','checkCount','checks','failures')}, indent=2))
raise SystemExit(bool(failures))
