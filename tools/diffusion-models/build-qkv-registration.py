"""Build a data-only QKV catalog proposal from fixed Git bytes; no model IO."""
import copy
import hashlib
import json
import posixpath
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = '6dae9a6fac3e9ad29ea941f22211edbe4aa894ad'
CODE = '8cdfd3f5f7db0cd66762e78f09c209fb5b27366b'
HANDOFF = '621796a2cb5266a4c8ea7abc2f676322836360c5'
REPO = 'Kushyameln01/kushyameln-works'
CATALOG = 'docs/shared/ai-connection/reference/catalog.v1.json'
BASE_CATALOG_SHA = '14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'
REFDIR = 'docs/shared/ai-connection/reference/'
PROFILE_PATHS = [REFDIR + 'profiles/' + n + '.v1.json' for n in ['shape', 'numeric-execution', 'normalization', 'loader-policy']]
RULES, NORMS = REFDIR + 'numerical-rules.v1.json', REFDIR + 'norms.v1.json'
API = 'docs/shared/diffusion-models/api/'
QKV = 'docs/shared/diffusion-models/ort-bridge/qkv/'
P4 = 'development/ai-connection/profile-adoption/p4/'
NATIVE = 'bernini-block0-qkv5120-norm-rope-selected16-head0-f32-v1'
SCOPE = 'ACTUAL_WEIGHTS_EXPLICIT_HIDDEN_N16_FULL_WIDTH_HEAD0'
PROFILE_IDS = ['SHAPE-BERNINI-QKV-N16', 'EXEC-BERNINI-QKV-N16-F32', 'NORM-BERNINI-QK5120-N16-F32']
RULE_IDS = ['NR-BERNINI-QKV-N16-F32', 'NR-BERNINI-QK5120-F32', 'NR-BERNINI-ROPE64-F32', 'NR-BERNINI-QKV-ATTENTION-N16-F32']
PROPOSAL_PATH = 'docs/shared/diffusion-models/profiles/registration-qkv-n16.json'
OUT = ROOT / 'development/ai-connection/qkv-next/registration'
# Trusted fixed-C anchors prevent a self-consistent replacement plan/receipt
# from being presented under the unchanged source commit string.
PINNED_OWNER_DOCS = {
    API + 'build-info.mjs': 'f29fc0f15a3cfd09d9804afc6c6c6128d4fec36ad72f02090ac44a5e98ef7a1a',
    P4 + 'candidate-plan.json': '01edee68925c960ae4931d0521ca67b6f46a3dd05feb2aff90d9e73596b3afe6',
    P4 + 'runtime-admission.json': '974538b24afcc93224988e1ab3151aac58ce1d4a6552587468a8182f32096502',
    P4 + 'runtime-LOW.json': 'dd6e8f8d91486bceeeb1851e91ffdac04718167366d2a552714bb07dac3b2751',
    P4 + 'runtime-HIGH.json': 'bec41812815ab597bc7af150c1c2559a9ce5a2637e862ee737e0b05d5927b957',
    P4 + 'reference-LOW-receipt.json': '048fdb6c9549fafbb252fe608ec31396af3a3a2e0b465ad25649a377c90b6741',
    P4 + 'reference-HIGH-receipt.json': '22fe549d75dfc9c30b7b4abfb54a7dd33798f9621f8a26997142dd784d5b2c1e',
    P4 + 'core-manifest.json': '1e8d247798a1ffc7125420dd17fca4613f5b9a88d293067bd845699a0a322941',
    P4 + 'core-semantics.md': '72298270cc92c34f8892edd46982fecfdfca8f87fbec684380e561c08b1a96cc',
    P4 + 'RUNTIME-RESULT.md': '2004f02348c87b0d28c1fd5f7c864e2d4bd197336080961d0896ac7e07364ebf',
}


def digest(value): return hashlib.sha256(value).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()
def parse(raw): return json.loads(raw)
def fail(condition, message):
    if not condition: raise ValueError(message)
def git(commit, path): return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)
def ref(path, commit=CODE, repository=REPO): return {'repository': repository, 'commit': commit, 'path': path}
def read_owner(owners, path): return parse(owners[CODE + ':' + path])


def kernel_bindings(owners):
    definitions = [
        ('fp8-f16-decode-and-bias', 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm', 'docs/shared/diffusion-models/ort-bridge/hike.mjs', 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.hike', 'docs/shared/diffusion-models/ort-bridge/kernel/build-record.json'),
        ('full5120-rmsnorm', 'docs/shared/inference/kernel/tensor.wasm', 'docs/shared/inference/hike.mjs', 'tools/inference/kernel/tensor.hike', 'tools/inference/kernel/manifest.json'),
        ('axis-and-source-id-rope', QKV + 'kernel.wasm', QKV + 'rope.mjs', QKV + 'rope.hike', QKV + 'build-record.json'),
        ('online-attention-recurrence', 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm', 'docs/shared/diffusion-models/ort-bridge/stream-attention/hike.mjs', 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.hike', 'docs/shared/diffusion-models/ort-bridge/stream-attention/build-record.json'),
    ]
    out = []
    for role, wasm, host, source, receipt in definitions:
        item = {'role': role, 'sourceCommit': CODE, 'rebuiltForThisRegistration': False}
        for key, path in [('wasm', wasm), ('host', host), ('source', source), ('buildReceipt', receipt)]:
            raw = owners[CODE + ':' + path]
            item[key] = {'path': path, 'byteLength': len(raw), 'sha256': digest(raw)}
        item['historicalCompilerSHA256'] = read_owner(owners, receipt)['compilerSha256']
        item['historicalCompilerNote'] = 'Existing binary and owner build receipt are reused; this registration runs no compiler.'
        out.append(item)
    return out


def load_inputs():
    cat = parse(git(BASE, CATALOG))
    base = {CATALOG: git(BASE, CATALOG)}
    for item in cat['files'] + cat['documents']: base[item['path']] = git(BASE, item['path'])
    info = git(CODE, API + 'build-info.mjs')
    closure = json.loads(re.search(rb'Object.freeze\((\{.*\})\);', info, re.S)[1])
    paths = {API + 'build-info.mjs'}
    paths.update(posixpath.normpath(API + name) for name in closure)
    paths.update(P4 + n for n in ['candidate-plan.json', 'runtime-admission.json', 'runtime-LOW.json', 'runtime-HIGH.json', 'reference-LOW-receipt.json', 'reference-HIGH-receipt.json', 'core-manifest.json', 'core-semantics.md', 'RUNTIME-RESULT.md'])
    for side in ['LOW', 'HIGH']: paths.update(parse(git(CODE, P4 + 'runtime-' + side + '.json'))['sourceSHA256'])
    return base, {CODE + ':' + path: git(CODE, path) for path in sorted(paths)}


def build_proposal(base, owners):
    plan, admission = read_owner(owners, P4 + 'candidate-plan.json'), read_owner(owners, P4 + 'runtime-admission.json')
    runs = {side: read_owner(owners, P4 + 'runtime-' + side + '.json') for side in ['LOW', 'HIGH']}
    info = owners[CODE + ':' + API + 'build-info.mjs'].decode()
    build_id = json.loads(re.search(r'BUILD_ID=("[^"]+");', info)[1])
    common = {'ownerRole': 'diffusion_models', 'nativeContract': 'bernini-qkv-diagnostic/0.1', 'sourceRefs': [ref(QKV + 'stage.mjs'), ref(P4 + 'candidate-plan.json'), ref(P4 + 'runtime-admission.json'), ref(P4 + 'RUNTIME-RESULT.md')], 'evidenceScopes': ['Fixed actual retained HIGH/LOW block0 weights and explicit deterministic hidden16 fixture; reused owner receipt, not fresh inference for this registration'], 'limitations': ['No actual timestep/block post-modulation hidden provenance', 'No original production precision/backend parity', 'No full32760 or context65520+ sequence, all heads/stages or combined pipeline budget', 'load/predict/sample remain NOT_READY; registration is not management adoption']}
    shape = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[0], 'nativeProfileId': None,
        'requiredDeclarations': {'dtype': 'float32', 'layout': 'row-major', 'hiddenShape': [16, 5120], 'projectionShape': [16, 5120], 'normalizationAxis': 5120, 'selectedHead': 0, 'selectedHeadShape': [16, 128], 'sourceIdShape': [16], 'positionShape': [16, 3], 'ropeMatrixShape': [16, 64, 2, 2], 'attentionKeyCount': 16, 'nativeExecutionProfileId': NATIVE},
        'admissionConstraints': {'exactShapeRequired': True, 'noPaddingOrHeadLocalNorm': True, 'shapeIdIsCatalogOnly': True, 'positionGrid': [21, 30, 52], 'sourceIds': 'Int32 0..16777216; only the predeclared0/1/2 coordinate fixture is numerically evidenced'}}
    numeric = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[1], 'nativeProfileId': NATIVE,
        'requiredDeclarations': {'nativeEntry': 'createActualQkvDiagnostic({file,side,bridgeBytes,tensorBytes,ropeBytes}).run({hidden,positions,sourceIds,signal,onProgress,headIndex:0})', 'dtype': 'float32', 'layout': 'row-major', 'hiddenShape': [16, 5120], 'normalizationAxis': 5120, 'normalizationEpsilonLiteral': 1e-6, 'selectedHead': 0, 'headCountInModel': 40, 'attentionKeyCount': 16, 'hiddenProvenance': plan['target']['diagnosticHiddenProvenance'], 'scope': SCOPE, 'storage': plan['storage'], 'gates': plan['gates'], 'gateFormula': plan['gateFormula'], 'reference': plan['reference'], 'numericalRuleRefs': RULE_IDS + ['NR-SCOPED-GATES'], 'projectionGraphSHA256': runs['LOW']['evidence']['projectionGraphSHA256'], 'buildBinding': 'catalog.registrationSourceBuild: external source/build/loaded-byte declaration; native describe has no buildId field'},
        'admissionConstraints': {'finiteCompactNonsharedOwnedInputs': True, 'qkProjectionMaxAbs': admission['normalization']['inputMaxAbs'], 'qkNormAxis': 5120, 'head0Only': True, 'explicitHighOrLowOriginalBlob': True, 'fullFileHashRecomputed': False, 'noInitializerSubstitutionOrImplicitQuantization': True, 'rawReferencePayloadPublished': False, 'productionQKVVerified': False, 'modelInference': False}}
    norm = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[2], 'nativeProfileId': None,
        'requiredDeclarations': {'nativeEntry': 'internal Q/K stage of ' + NATIVE, 'dtype': 'float32', 'layout': 'row-major', 'shape': [16, 5120], 'axis': 5120, 'epsilonLiteral': 1e-6, 'affineWeightShape': [5120], 'affineStorageDtype': 'F16', 'nativeNormalizationRuleId': None, 'numericalRuleRefs': [RULE_IDS[1], 'NR-SCOPED-GATES'], 'gate': plan['gates']['norm']},
        'admissionConstraints': {'inputMaxAbs': admission['normalization']['inputMaxAbs'], 'proof': admission['normalization']['proof'], 'sharedTextProfileChanged': False, 'sameAsUMT5Norm': False, 'head128ReductionForbidden': True, 'standaloneNativeNormProfileDefined': False}}
    expressions = [
        {'operations': ['Decode original E4M3FN code, multiply scalar scale with F32 rounding', 'ORT WASM F32 Gemm over all5120 input columns, then real Hike F32 bias addition'], 'storage': plan['storage'], 'reference': plan['reference']['projection'], 'gate': plan['gates']['projection']},
        {'operations': ['Reduce x*x in ascending-column F32 order across all5120 channels', 'F32 mean and epsilon addition, fixed env.sqrt F64 primitive, F32 reciprocal, x then affine weight multiplication'], 'epsilonLiteral': 1e-6, 'axis': 5120, 'inputMaxAbs': 1e16, 'admissionProof': admission['normalization']['proof'], 'reference': plan['reference']['norm'], 'gate': plan['gates']['norm'], 'originalTorchRsqrtParity': 'UNVERIFIED'},
        {'operations': ['F64 power/cos/sin primitives construct per-axis44/42/42 rotation matrices then cast to F32', 'Construct sourceId rotation over all64 pairs separately', 'Compose each2x2 matrix with ordered F32 two-product sums; do not add angles', 'Apply matrix to each Q/K pair with ordered F32 products/sums'], 'reference': plan['reference']['rope'], 'matrixGate': plan['gates']['ropeMatrix'], 'applicationGate': plan['gates']['ropeApply']},
        {'operations': ['Existing ORT score/max/Exp and Hike online numerator/denominator accumulation', 'Use all16 explicitly declared selected keys, no mask/dropout, no phantom padding'], 'reference': plan['reference']['attention'], 'gate': plan['gates']['connectedAttention'], 'existingK32760FixturePassIsSeparate': True}]
    rules = [{'ruleId': ident, 'ownerRole': 'diffusion_models', 'sourceRefs': copy.deepcopy(common['sourceRefs']) + [ref('docs/shared/inference/hike.mjs')] if i == 1 else copy.deepcopy(common['sourceRefs']), 'rule': expression, 'conditions': {'nativeExecutionProfileId': NATIVE, 'scope': SCOPE, 'originalWorkflowInputsVerified': False, 'productionPrecisionVerified': False}, 'evidenceScope': common['evidenceScopes'][0], 'notManagerResponsibility': True, 'normInputs': [{'normalizationRecordId': PROFILE_IDS[2], 'declarations': ['full5120 axis', 'source/build/kernel', 'predeclared gate/reference', 'fixed scope'], 'condition': 'P4 candidate only; never mean/generated or UMT5 profile'}]} for i, (ident, expression) in enumerate(zip(RULE_IDS, expressions))]
    proposed_norm = {'normId': 'N-QKV-N16-DIAGNOSTIC', 'title': 'QKV実重みと明示hidden16の限定診断', 'decisionOwner': '管理', 'managerReads': ['nativeExecutionProfileId', 'loadedSourceBuildKernelBytes', 'exactShapeAndFullNormAxis', 'hiddenProvenance', 'predeclaredGateAndReference', 'ownerReceiptScope', 'resourceAndCleanupState'], 'comparisons': ['exact-source-and-byte-identity', 'no-shape-or-precision-scope-promotion', 'owner-numerical-receipt-not-manager-recalculation'], 'profileRefs': PROFILE_IDS, 'numericalRuleRefs': RULE_IDS + ['NR-SCOPED-GATES'], 'reasonLabels': ['qkv-candidate-not-adopted', 'qkv-provenance-or-scope-mismatch', 'qkv-gate-or-source-mismatch'], 'status': 'proposed-not-runtime-integrated'}
    candidate = {'candidateSetId': 'CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F', 'status': 'proposed-owner-scoped-evidence-not-manager-adoption', 'independentOfAdoptionSetId': 'ADOPT-MANAGER-285967', 'diffusionCommit': CODE, 'handoffCommit': HANDOFF, 'profileRefs': PROFILE_IDS, 'normRefs': [proposed_norm['normId']], 'executionProfileId': NATIVE, 'scope': SCOPE, 'actualModelHiddenVerified': False, 'productionQKVVerified': False, 'managerAccepted': False, 'generationReady': False, 'e5FullSessionAccepted': False, 'P5': 'BLOCKED', 'reusedOwnerEvidence': [{'side': side, 'sourceRef': ref(P4 + 'runtime-' + side + '.json'), 'sha256': digest(owners[CODE + ':' + P4 + 'runtime-' + side + '.json']), 'cases': len(run['cases']), 'allComparisonFailures': sum(c['failed'] for c in run['comparisons'].values()), 'actualModelHiddenVerified': False, 'freshForRegistration': False} for side, run in runs.items()]}
    return {'schemaVersion': 'works-profile-registration-proposal/0.1', 'recordedDateJST': '2026-11-01', 'status': 'PROPOSED_NOT_PUBLISHED', 'runtimeIntegrated': False, 'baselineCommit': BASE, 'baselineCatalogSHA256': BASE_CATALOG_SHA, 'proposedDocumentVersion': '1.0-draft.2', 'nativeExecutionProfileId': NATIVE, 'sourceBuild': {'runtimeCodeCommit': CODE, 'handoffCommit': HANDOFF, 'buildId': build_id, 'apiVersion': 'diffusion-models/0.1', 'nativeDescriptorSchema': 'bernini-qkv-diagnostic/0.1', 'kernelBindings': kernel_bindings(owners), 'assets': [{'commit': CODE, 'path': key.split(':', 1)[1], 'byteLength': len(raw), 'sha256': digest(raw)} for key, raw in sorted(owners.items())]}, 'profileRecords': {'shape': [shape], 'numeric-execution': [numeric], 'normalization': [norm]}, 'numericalRules': rules, 'managerNorms': [proposed_norm], 'managementCandidateSet': candidate, 'registrationIsManagementAdoption': False, 'subsequentPrefixOrAllHeadProfileIncluded': False}


def checked_base(base):
    fail(digest(base.get(CATALOG, b'')) == BASE_CATALOG_SHA, 'Fixed original catalog bytes required')
    cat = parse(base[CATALOG])
    for item in cat['files'] + cat['documents']:
        data = base.get(item['path'], b'')
        fail(digest(data) == item['sha256'], 'Original referenced bytes mismatch: ' + item['path'])
        if 'byteLength' in item: fail(len(data) == item['byteLength'], 'Original file length mismatch')
    return cat


def check_owner(proposal, owners):
    fail(proposal['sourceBuild']['runtimeCodeCommit'] == CODE, 'Only the fixed existing QKV source is proposed')
    assets = proposal['sourceBuild']['assets']; seen = set()
    for asset in assets:
        key = asset['commit'] + ':' + asset['path']
        fail(asset['commit'] == CODE and key not in seen, 'Conflicting or foreign owner asset')
        seen.add(key); raw = owners.get(key, b'')
        fail(len(raw) == asset['byteLength'] and digest(raw) == asset['sha256'], 'Owner loaded-byte identity mismatch: ' + asset['path'])
    authenticated = {CODE + ':' + path for path in PINNED_OWNER_DOCS}
    for path, expected in PINNED_OWNER_DOCS.items():
        fail(CODE + ':' + path in seen and digest(owners.get(CODE + ':' + path, b'')) == expected, 'Fixed-C source anchor mismatch: ' + path)
    text = owners[CODE + ':' + API + 'build-info.mjs'].decode()
    build = json.loads(re.search(r'BUILD_ID=("[^"]+");', text)[1])
    source_digest = json.loads(re.search(r'BUILD_SOURCE_SHA256=("[^"]+");', text)[1])
    closure = json.loads(re.search(r'Object.freeze\((\{.*\})\);', text, re.S)[1])
    fail(build == proposal['sourceBuild']['buildId'] == 'diffusion-models/0.1+' + source_digest, 'Actual build-info identity mismatch')
    fail(digest(json.dumps(closure, sort_keys=True, separators=(',', ':')).encode()) == source_digest, 'Build source-map digest mismatch')
    for name, expected in closure.items():
        path = posixpath.normpath(API + name)
        authenticated.add(CODE + ':' + path)
        fail(CODE + ':' + path in seen and digest(owners.get(CODE + ':' + path, b'')) == expected, 'Build source closure mismatch: ' + path)
    for side in ['LOW', 'HIGH']:
        run = read_owner(owners, P4 + 'runtime-' + side + '.json')
        fail(run['passed'] is True and run['productionQKVVerified'] is False and run['P5'] == 'BLOCKED', 'Fixed owner receipt scope changed')
        for path, expected in run['sourceSHA256'].items():
            authenticated.add(CODE + ':' + path)
            fail(CODE + ':' + path in seen and digest(owners.get(CODE + ':' + path, b'')) == expected, 'Receipt source byte mismatch: ' + path)
    fail(seen == authenticated == set(owners), 'Every owner asset must belong to the fixed authenticated source closure')


def apply_registration(base_files, proposal, owner_files):
    # Parsing/bytes copies isolate the proposal and source maps from mutation.
    base = {k: bytes(v) for k, v in base_files.items()}
    owners = {k: bytes(v) for k, v in owner_files.items()}
    p = copy.deepcopy(proposal); cat = checked_base(base)
    fail(p['schemaVersion'] == 'works-profile-registration-proposal/0.1' and p['status'] == 'PROPOSED_NOT_PUBLISHED' and p['runtimeIntegrated'] is False, 'Registration proposal is data only')
    fail(p['baselineCommit'] == BASE and p['baselineCatalogSHA256'] == BASE_CATALOG_SHA and p['proposedDocumentVersion'] == '1.0-draft.2', 'A separate catalog revision is required')
    check_owner(p, owners)
    expected = build_proposal(base, owners)
    # The fixed existing profile is not an arbitrary numerical extension point.
    # Any new prefix/head/precision scope needs a new owner registration request.
    for field in ['sourceBuild', 'profileRecords', 'numericalRules', 'managerNorms', 'managementCandidateSet', 'nativeExecutionProfileId', 'registrationIsManagementAdoption', 'subsequentPrefixOrAllHeadProfileIncluded']:
        fail(p[field] == expected[field], 'Fixed profile registration content changed: ' + field)
    output = dict(base)
    for category, path in zip(['shape', 'numeric-execution', 'normalization', 'loader-policy'], PROFILE_PATHS):
        document = parse(base[path]); document['documentVersion'] = p['proposedDocumentVersion']
        document['records'].extend(copy.deepcopy(p['profileRecords'].get(category, [])))
        document['registrationStatus'] = 'proposal-preview-not-published'; output[path] = encode(document)
    for path, added in [(RULES, p['numericalRules']), (NORMS, p['managerNorms'])]:
        document = parse(base[path]); document['documentVersion'] = p['proposedDocumentVersion']
        document['rules'].extend(copy.deepcopy(added)); document['registrationStatus'] = 'proposal-preview-not-published'; output[path] = encode(document)
    cat['documentVersion'] = p['proposedDocumentVersion']; cat['date'] = p['recordedDateJST']
    cat['registrationStatus'] = 'proposal-preview-not-published'; cat['runtimeIntegrated'] = False
    cat['authority']['humanReadable'] = 'Original1.0-draft.1 documents retained as baseline references; candidate registration commentary is registration-QKV.md. Pages and publication are not revised.'
    cat['managementCandidateSets'] = [copy.deepcopy(p['managementCandidateSet'])]
    cat['registrationSourceBuild'] = copy.deepcopy(p['sourceBuild'])
    cat['registrationBaseline'] = {'commit': BASE, 'catalogSHA256': BASE_CATALOG_SHA, 'documentVersion': '1.0-draft.1', 'originalDocumentsRemainBaseline': True}
    for item in cat['files']:
        raw = output[item['path']]; item.update({'sha256': digest(raw), 'byteLength': len(raw), 'documentVersion': p['proposedDocumentVersion']})
    output[CATALOG] = encode(cat)
    validate_preview(base, output)
    return output


def validate_preview(base, output):
    oldcat, cat = parse(base[CATALOG]), parse(output[CATALOG])
    fail(cat['managementAdoptionSets'] == oldcat['managementAdoptionSets'], 'Existing management adoption was overwritten')
    fail(cat['mappingAuthority'] == oldcat['mappingAuthority'] and cat['classification'] == oldcat['classification'], 'Existing owner or classification semantics changed')
    records = []
    for path in PROFILE_PATHS:
        before, after = parse(base[path]), parse(output[path]); fail(after['records'][:len(before['records'])] == before['records'], 'Old profile widened')
        fail(after['runtimeIntegrated'] is False and after['schemaVersion'] == before['schemaVersion'], 'Profile schema/runtime state changed')
        records.extend(after['records'])
    ids = [r['recordId'] for r in records]; fail(len(ids) == len(set(ids)) == 21, 'Expected18 original plus3 distinct profile records')
    rules = parse(output[RULES])['rules']; rule_ids = {r['ruleId'] for r in rules}; fail(len(rules) == len(rule_ids) == 14, 'Expected10 original plus4 distinct numeric rules')
    norms = parse(output[NORMS])['rules']; fail(len(norms) == 13 and len({r['normId'] for r in norms}) == 13, 'New QKV norm must be separate')
    for path in [RULES, NORMS]:
        before, after = parse(base[path]), parse(output[path]); fail(after['rules'][:len(before['rules'])] == before['rules'], 'Old rule widened')
    for norm in norms:
        fail(set(norm['profileRefs']) <= set(ids) and set(norm['numericalRuleRefs']) <= rule_ids, 'Unresolved norm profile/rule reference')
    fail({x for n in norms for x in n['profileRefs']} == set(ids), 'Unbound profile')
    fail({x for n in norms for x in n['numericalRuleRefs']} == rule_ids, 'Unbound numeric rule')
    for item in cat['files'] + cat['documents']:
        raw = output[item['path']]; fail(digest(raw) == item['sha256'], 'Preview file digest mismatch')
        if 'byteLength' in item: fail(len(raw) == item['byteLength'], 'Preview file length mismatch')


def main():
    base, owners = load_inputs(); proposal = build_proposal(base, owners); preview = apply_registration(base, proposal, owners)
    proposal_raw = encode(proposal); (ROOT / PROPOSAL_PATH).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / PROPOSAL_PATH).write_bytes(proposal_raw); OUT.mkdir(parents=True, exist_ok=True)
    for path, raw in preview.items():
        target = OUT / 'candidate' / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    receipt = {'schemaVersion': 'diffusion-qkv-registration-receipt/0.1', 'passed': True, 'baselineCommit': BASE, 'runtimeCodeCommit': CODE, 'ownerHandoffCommit': HANDOFF, 'proposalPath': PROPOSAL_PATH, 'proposalSHA256': digest(proposal_raw), 'proposalBytes': len(proposal_raw), 'candidateCatalogPath': 'candidate/' + CATALOG, 'candidateCatalogSHA256': digest(preview[CATALOG]), 'candidateDocumentVersion': '1.0-draft.2', 'baseJSONDataUnmodified': True, 'oldManagementAdoptionSetsUnmodified': True, 'profileRecords': 21, 'numericRules': 14, 'managerNorms': 13, 'ownerSourceAssetsVerified': len(owners), 'runtimeIntegrated': False, 'registrationPublished': False, 'managerCandidateAccepted': False, 'numericalInferenceExecutedByThisTool': False, 'candidateFiles': [{'path': path, 'byteLength': len(raw), 'sha256': digest(raw)} for path, raw in sorted(preview.items())]}
    (OUT / 'receipt.json').write_bytes(encode(receipt)); print(json.dumps({k: receipt[k] for k in ['passed', 'proposalSHA256', 'profileRecords', 'numericRules', 'managerNorms', 'runtimeIntegrated']}))


if __name__ == '__main__': main()
