"""Build a separate data-only N2 catalog proposal from authenticated Git bytes."""
import copy
import hashlib
import json
import posixpath
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = '6dae9a6fac3e9ad29ea941f22211edbe4aa894ad'
CODE = 'e48021d8da29ef3b3b9e9d6161331c282798b6b3'
HANDOFF = '78a3268166eca63e5daafb1b21e184224c4d14b1'
REPO = 'Kushyameln01/kushyameln-works'
CATALOG = 'docs/shared/ai-connection/reference/catalog.v1.json'
REFDIR = 'docs/shared/ai-connection/reference/'
PROFILE_PATHS = [REFDIR + 'profiles/' + name + '.v1.json' for name in ['shape', 'numeric-execution', 'normalization', 'loader-policy']]
RULES, NORMS = REFDIR + 'numerical-rules.v1.json', REFDIR + 'norms.v1.json'
API = 'docs/shared/diffusion-models/api/'
NEXT = 'development/ai-connection/qkv-next/'
HANDOFF_PATH = NEXT + 'handoff.json'
HANDOFF_SHA = 'e8a8cc203b06678d85c902e5fcfce0f145f13e1e47bc8c3a6d889f8192bc80fb'
N16_RECEIPT = NEXT + 'registration/receipt.json'
N16_RECEIPT_SHA = '47cfafaff468f2af1f592da62d0d9808deda094fb21c48c8cd5260d0c2a83a3b'
BASE_CATALOG_SHA = '14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c'
N16_CATALOG_SHA = '3aeccea544fd26bc8720c9bcb700445a41ab1536b1288c84a4d35b5f67047f1d'
PREFIX_PLAN = NEXT + 'hidden-core/candidate-plan.json'
HEAD_PLAN = NEXT + 'expansion/candidate-plan.json'
PREFIX = 'bernini-rect2-block0-postmod-f32-v1'
NATIVE = 'bernini-block0-derived-qkv-n2-allheads-f32-v1'
CANDIDATE = 'CANDIDATE-DIFFUSION-DERIVED-N2-ALL40-F32-V1'
PROFILE_IDS = ['SHAPE-BERNINI-DERIVED-N2-ALL40', 'EXEC-BERNINI-DERIVED-N2-ALL40-F32', 'NORM-BERNINI-QK5120-N2-F32', 'EXEC-BERNINI-RECT2-PREFIX-F32']
RULE_IDS = ['NR-BERNINI-RECT2-PREFIX-F32', 'NR-BERNINI-QKV-N2-F32', 'NR-BERNINI-QK5120-N2-F32', 'NR-BERNINI-ROPE64-N2-F32', 'NR-BERNINI-ATTENTION-N2-ALL40-F32']
PROPOSAL_PATH = 'docs/shared/diffusion-models/profiles/registration-qkv-n2.json'
OUT = ROOT / 'development/ai-connection/qkv-followup/registration'


def digest(raw): return hashlib.sha256(raw).hexdigest()
def parse(raw): return json.loads(raw)
def encode(value): return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()
def fail(condition, message):
    if not condition: raise ValueError(message)
def git(commit, path): return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)
def owner(owners, path, commit=CODE): return parse(owners[commit + ':' + path])
def ref(path, commit=CODE): return {'repository': REPO, 'commit': commit, 'path': path}
def asset(path, raw, commit=CODE): return {**ref(path, commit), 'byteLength': len(raw), 'sha256': digest(raw)}


def build_info(raw):
    text = raw.decode()
    return (json.loads(re.search(r'BUILD_ID=("[^"]+");', text)[1]),
            json.loads(re.search(r'BUILD_SOURCE_SHA256=("[^"]+");', text)[1]),
            json.loads(re.search(r'Object.freeze\((\{.*\})\);', text, re.S)[1]))


def load_inputs():
    handoff_raw, receipt_raw = git(HANDOFF, HANDOFF_PATH), git(HANDOFF, N16_RECEIPT)
    h, receipt = parse(handoff_raw), parse(receipt_raw)
    base = {item['path']: git(HANDOFF, NEXT + 'registration/candidate/' + item['path']) for item in receipt['candidateFiles']}
    paths = set(h['commitAlignment']['assets']) | set(h['artifacts']) | {API + 'build-info.mjs'}
    paths.update(posixpath.normpath(API + name) for name in build_info(git(CODE, API + 'build-info.mjs'))[2])
    for side in ['high', 'low']:
        for mode in ['local', 'composed']: paths.add(NEXT + 'expansion/' + side + '-' + mode + '-reference-receipt.json')
    owners = {CODE + ':' + path: git(CODE, path) for path in sorted(paths)}
    owners[HANDOFF + ':' + HANDOFF_PATH] = handoff_raw
    owners[HANDOFF + ':' + N16_RECEIPT] = receipt_raw
    cat_raw = git(BASE, CATALOG); owners[BASE + ':' + CATALOG] = cat_raw
    for item in parse(cat_raw)['files'] + parse(cat_raw)['documents']:
        owners[BASE + ':' + item['path']] = git(BASE, item['path'])
    return base, owners


def kernel_bindings(owners):
    root = 'docs/shared/diffusion-models/'
    specs = [
        ('fp8-f16-decode-bias', root + 'ort-bridge/kernel/bridge.wasm', root + 'ort-bridge/hike.mjs', root + 'ort-bridge/kernel/bridge.hike', root + 'ort-bridge/kernel/build-record.json'),
        ('full5120-qk-rmsnorm', 'docs/shared/inference/kernel/tensor.wasm', 'docs/shared/inference/hike.mjs', 'tools/inference/kernel/tensor.hike', 'tools/inference/kernel/manifest.json'),
        ('natural-n2-rope', root + 'ort-bridge/qkv/kernel.wasm', root + 'ort-bridge/attention-heads/rope.mjs', root + 'ort-bridge/qkv/rope.hike', root + 'ort-bridge/qkv/build-record.json'),
        ('online-attention-recurrence', root + 'ort-bridge/stream-attention/kernel.wasm', root + 'ort-bridge/stream-attention/hike.mjs', root + 'ort-bridge/stream-attention/kernel.hike', root + 'ort-bridge/stream-attention/build-record.json'),
        ('prefix-time-layernorm-modulate', root + 'ort-bridge/block-hidden/kernel.wasm', root + 'ort-bridge/block-hidden/math.mjs', root + 'ort-bridge/block-hidden/math.hike', root + 'ort-bridge/block-hidden/build-record.json'),
        ('prefix-rect-mean', root + 'latent-space/build/latent-space.wasm', root + 'latent-space/latent-space.mjs', root + 'latent-space/latent-space.hike', root + 'latent-space/build/build-record.json'),
        ('prefix-schedule-noise', root + 'scheduler/build/scheduler.wasm', root + 'scheduler/scheduler-kernel.mjs', root + 'scheduler/scheduler.hike', root + 'scheduler/build/build-record.json'),
    ]
    result = []
    for role, wasm, host, source, receipt in specs:
        entry = {'role': role, 'rebuiltForThisRegistration': False}
        for key, path in [('wasm', wasm), ('host', host), ('source', source), ('buildReceipt', receipt)]:
            entry[key] = asset(path, owners[CODE + ':' + path])
        entry['historicalCompilerSHA256'] = owner(owners, receipt)['compilerSha256']
        result.append(entry)
    return result


def producer_admission(owners):
    runs = {side: owner(owners, NEXT + 'hidden-runtime/' + side.lower() + '-comparison.json') for side in ['HIGH', 'LOW']}
    fields = ['schemaVersion', 'executionProfileId', 'precisionProfile', 'blockIndex', 'implicitBatch', 'originalCoreShape', 'operatorShape', 'layout', 'grid', 'rowToGrid', 'sourceIds', 'contextLatents', 'noiseScale', 'postModulationComputedByModelOperators', 'originalWorkflowInputsVerified', 'productionHiddenVerified', 'originalProductionPrecisionVerified', 'fullBlockVerified', 'modelInference', 'load', 'predict', 'sample']
    exact = {key: copy.deepcopy(runs['HIGH']['evidence'][key]) for key in fields}
    side_fields = ['side', 'modelHash', 'headerSHA256', 'scheduleIndex', 'sigma', 'timestep', 'rawMeanSHA256', 'noiseSHA256', 'hiddenSHA256', 'positionsSHA256', 'sourceIdsSHA256']
    return {'nativeValidator': ref('docs/shared/diffusion-models/ort-bridge/attention-heads/stage.mjs'), 'nativeValidatorExport': 'validateProducerReceipt', 'trustedReceiptSchema': 'bernini-hidden-prefix-trusted-receipt/0.1', 'passed': True, 'artifactAndProducerSourceHashesRequired': True, 'producerSourceSHA256Nonempty': True, 'hashSyntax': 'lowercase64hex', 'evidenceExact': exact, 'sideCases': {side: {**{key: runs[side]['evidence'][key] for key in side_fields}, 'artifactSHA256': runs[side]['artifactSHA256'], 'receipt': asset(NEXT + 'hidden-runtime/' + side.lower() + '-comparison.json', owners[CODE + ':' + NEXT + 'hidden-runtime/' + side.lower() + '-comparison.json'])} for side in runs}, 'runBinding': ['factory side and original modelHash equal trusted producer', 'artifactSHA256 and fixed identity fields equal separately trusted receipt', 'snapshot hidden/positions/sourceIds; exact natural coordinates and source0; verify all3 bit hashes', 'caller booleans and hashes alone do not establish provenance'], 'trustOwner': 'Importing owner independently anchors the public producer receipt/artifact/source identities; the data catalog does not authenticate caller claims by itself.'}


def build_proposal(base, owners):
    prefix, plan = owner(owners, PREFIX_PLAN), owner(owners, HEAD_PLAN)
    admission = producer_admission(owners)
    build, _, closure = build_info(owners[CODE + ':' + API + 'build-info.mjs'])
    common = {'ownerRole': 'diffusion_models', 'nativeContract': 'bernini-derived-heads/0.1', 'sourceRefs': [ref('docs/shared/diffusion-models/ort-bridge/attention-heads/stage.mjs'), ref(HEAD_PLAN), ref(PREFIX_PLAN), ref(NEXT + 'hidden-core/SOURCE-CONTRACT.md')], 'evidenceScopes': ['Reused fixed HIGH1/LOW3 actual Rect raw-mean prefix14 stages and N2/all40 downstream11 comparisons per side; not fresh numeric execution for registration'], 'limitations': copy.deepcopy(prefix['notAccepted']) + ['O projection and full self-attention block absent', 'N16 explicit-hidden fixture acceptance is separate', 'Combined production Memory/staging/copy/time budget remains unaccepted']}
    shape = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[0], 'nativeProfileId': None,
        'requiredDeclarations': {'dtype': 'float32', 'layout': 'LC', 'implicitBatch': 1, 'coreHidden': [1, 2, 5120], 'operatorHidden': [2, 5120], 'grid': [1, 1, 2], 'positions': [[0, 0, 0], [0, 0, 1]], 'sourceIds': [0, 0], 'qkNormAxis': 5120, 'allQueries': 2, 'allKeys': 2, 'allHeads': 40, 'headDimension': 128, 'outputBeforeO': [2, 5120], 'nativeExecutionProfileId': NATIVE},
        'admissionConstraints': {'exactShape': True, 'contextLatents': [], 'paddingOrTokenRepetition': False, 'shapeIdIsCatalogOnly': True, 'nativeProducerAdmissionRecordId': PROFILE_IDS[1]}}
    declared_source = copy.deepcopy(plan['source'])
    declared_source['prefixContract'] = asset(NEXT + 'hidden-core/SOURCE-CONTRACT.md', owners[CODE + ':' + NEXT + 'hidden-core/SOURCE-CONTRACT.md'])
    declared_source['producer'] = [asset(NEXT + 'hidden-runtime/' + side + '-comparison.json', owners[CODE + ':' + NEXT + 'hidden-runtime/' + side + '-comparison.json']) for side in ['high', 'low']]
    numeric = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[1], 'nativeProfileId': NATIVE,
        'requiredDeclarations': {'factory': 'createDerivedQkvHeads({file,side,trustedProducer,bridgeBytes,tensorBytes,ropeBytes})', 'entry': 'run({hidden,positions,sourceIds,evidence,artifactSHA256,signal,onProgress})', 'dtype': 'float32', 'layout': 'LC', 'shape': [2, 5120], 'precisionProfile': 'f32-hike-dequant-fullnorm-rope-ort-gemm-score-hike-context-v1', 'source': declared_source, 'gates': plan['gates'], 'gateRationale': plan['gateRationale'], 'numericalRuleRefs': RULE_IDS + ['NR-SCOPED-GATES'], 'dependencyProfileRefs': [PROFILE_IDS[3]], 'prefixNativeProfileId': PREFIX, 'sourceBuildBinding': 'catalog.registrationN2SourceBuild'},
        'admissionConstraints': {'trustedProducer': admission, 'finiteCompactOwnedNonsharedF32Hidden': [2, 5120], 'finiteCompactOwnedNonsharedF32Positions': [2, 3], 'compactNonsharedInt32SourceIds': [2], 'normProjectionMaxAbs': 1e16, 'fullNormAxisBeforeHeads': 5120, 'noHeadLocalNormOrPadding': True, 'prefixDisposalBarrierRequired': True, 'modelInference': False}}
    normalization = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[2], 'nativeProfileId': None,
        'requiredDeclarations': {'internalStageOf': NATIVE, 'dtype': 'float32', 'layout': 'LC', 'shape': [2, 5120], 'axis': 5120, 'epsilonLiteral': 1e-6, 'affineStorage': 'F16', 'affineShape': [5120], 'nativeNormalizationRuleId': None, 'numericalRuleRefs': [RULE_IDS[2], 'NR-SCOPED-GATES'], 'gate': plan['gates']['qkNorm']},
        'admissionConstraints': {'inputMaxAbs': 1e16, 'fullNormBeforeHeadExtraction': True, 'proof': '5120*(1e16)^2=5.12e35 < maxF32', 'standaloneNativeNormalizationProfileDefined': False, 'oldUMT5AndN16ProfilesUnchanged': True}}
    prefix_record = {**copy.deepcopy(common), 'recordId': PROFILE_IDS[3], 'nativeProfileId': PREFIX, 'nativeContract': 'bernini-block-hidden/0.1',
        'requiredDeclarations': {'dependencyOnly': True, 'factory': 'createBlockHiddenPrefix({file,side,bridgeBytes,mathBytes,latentBytes,schedulerBytes})', 'entry': 'run({rawMean,noise,noiseScale:1,scheduleIndex,signal,onProgress})', 'dtype': 'float32', 'layout': 'LC', 'precisionProfile': 'bernini-block0-prefix-hike-f32-ort-silu-v1', 'sourceInput': prefix['sourceInput'], 'input': prefix['input'], 'target': prefix['target'], 'precision': prefix['precision'], 'gates': prefix['gates'], 'numericalRuleRefs': [RULE_IDS[0], 'NR-WAN21-MEAN-F32', 'NR-FLOW-SCHEDULE-F32', 'NR-FLOW-NOISE-F32', 'NR-SCOPED-GATES'], 'sourceBuildBinding': 'catalog.registrationN2SourceBuild'},
        'admissionConstraints': {**copy.deepcopy(prefix['admission']), 'producerEvidenceExact': copy.deepcopy(admission['evidenceExact']), 'selectedCases': copy.deepcopy(prefix['input']['cases']), 'prefixWeights': 'F16 for these exact keys; no FP8 scale conversion', 'readiness': copy.deepcopy(prefix['readiness'])}}
    math = [
        {'precision': prefix['precision'], 'input': prefix['input'], 'target': prefix['target'], 'admission': prefix['admission'], 'gates': prefix['gates'], 'gateFormula': prefix['gatesFormula'], 'reference': 'Separate fixed HIGH/LOW independent NumPy prefix receipts; 14stage comparisons and9 parameter-decode checks per side'},
        {'operations': plan_owner_numeric(owners)['projection'], 'decode': plan_owner_numeric(owners)['decode'], 'gate': plan['gates']['projection'], 'decodeGate': plan['gates']['decodedWeightBiasNorm']},
        {'operations': plan_owner_numeric(owners)['qkNorm'], 'axis': 5120, 'epsilonLiteral': 1e-6, 'gate': plan['gates']['qkNorm'], 'originalTorchRsqrtParity': 'UNVERIFIED'},
        {'operations': plan_owner_numeric(owners)['rope'], 'matrixGate': plan['gates']['ropeMatrix'], 'applyGate': plan['gates']['ropeApply'], 'prefixTimeSinFrequencyIsDifferent': True},
        {'operations': plan_owner_numeric(owners)['attention'], 'reference': plan_owner_numeric(owners)['reference'], 'localContextGate': plan['gates']['allHeadContext'], 'independentPrefixComposedGate': plan['gates']['composedPrefixToContext'], 'localAndComposedReferenceAreSeparate': True},
    ]
    rules = [{'ruleId': rule_id, 'ownerRole': 'diffusion_models', 'sourceRefs': copy.deepcopy(common['sourceRefs']) + [ref('docs/shared/diffusion-models/ort-bridge/block-hidden/stage.mjs')] if i == 0 else copy.deepcopy(common['sourceRefs']), 'rule': expression, 'conditions': {'executionProfileId': PREFIX if i == 0 else NATIVE, 'operatorShape': [2, 5120], 'HIGHIndex': 1, 'LOWIndex': 3, 'originalWorkflowInputsVerified': False, 'originalProductionPrecisionVerified': False}, 'evidenceScope': common['evidenceScopes'][0], 'notManagerResponsibility': True, 'normInputs': [{'normalizationRecordId': PROFILE_IDS[2], 'declarations': ['fixed source/build/kernel bytes', 'separate N2/prefix gates', 'strict producer dependency and scope'], 'condition': 'Limited natural N2 diagnostic only; old N16 rules are not widened'}]} for i, (rule_id, expression) in enumerate(zip(RULE_IDS, math))]
    rules[0]['normInputs'] = [
        {'normalizationRecordId': 'NORM-WAN21-MEAN-RECT', 'declarations': ['Exact source-bound Rect raw mean and its normalization profile', 'Existing NR-WAN21-MEAN-F32 numerical dependency remains unchanged'], 'condition': 'Prefix normalization input only; no generated latent contract'},
        {'declarations': ['Prefix nonaffine full5120 LayerNorm epsilon1e-6', 'No standalone native normalization Profile ID is defined for this prefix operation'], 'condition': 'Fixed prefix rule and numeric-execution dependency record describe this operator; distinct from downstream affine Q/K RMSNorm'},
    ]
    norm = {'normId': 'N-DERIVED-N2-ALL40-DIAGNOSTIC', 'title': '実Rect prefix依存のN2全40head限定診断', 'decisionOwner': '管理', 'managerReads': ['exactNativeProducerAdmission', 'separatelyTrustedArtifactSourceAndBitHashes', 'dependencyPrefixProfileAndRules', 'sourceBuildLoadedByteIdentity', 'localVsComposedGateAndReceiptScopes', 'resourceDisposalBarrierAndUnknowns'], 'comparisons': ['fixed-source-and-predeclared-gates', 'HIGH1-LOW3-natural-grid-source0-no-context', 'no-production-or-N16-scope-promotion'], 'profileRefs': PROFILE_IDS, 'numericalRuleRefs': RULE_IDS + ['NR-WAN21-MEAN-F32', 'NR-FLOW-SCHEDULE-F32', 'NR-FLOW-NOISE-F32', 'NR-SCOPED-GATES'], 'reasonLabels': ['n2-producer-binding-mismatch', 'n2-dependency-source-or-gate-mismatch', 'n2-scope-not-adopted'], 'status': 'proposed-not-runtime-integrated'}
    reused = {}
    for side in ['HIGH', 'LOW']:
        low = side.lower(); pr = owner(owners, NEXT + 'hidden-runtime/' + low + '-comparison.json'); hr = owner(owners, NEXT + 'expansion/' + low + '-browser.json')
        reused[side] = {'prefixResult': asset(NEXT + 'hidden-runtime/' + low + '-comparison.json', owners[CODE + ':' + NEXT + 'hidden-runtime/' + low + '-comparison.json']), 'headResult': asset(NEXT + 'expansion/' + low + '-browser.json', owners[CODE + ':' + NEXT + 'expansion/' + low + '-browser.json']), 'prefixStages': len(pr['stages']), 'prefixParameterChecks': len(pr['parameters']), 'headComparisons': len(hr['comparisons']), 'failed': sum(x['failCount'] for x in pr['stages'].values()) + sum(x['failed'] for x in hr['comparisons'].values()), 'artifactSHA256': pr['artifactSHA256'], 'prefixReferenceSHA256': pr['referenceSHA256'], 'localReferenceSHA256': hr['localReferenceSHA256'], 'composedReferenceSHA256': hr['composedReferenceSHA256'], 'freshForRegistration': False}
    candidate = {'candidateSetId': CANDIDATE, 'status': 'proposed-owner-scoped-evidence-not-manager-adoption', 'separateFrom': ['ADOPT-MANAGER-285967', 'CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F'], 'diffusionCommit': CODE, 'handoffCommit': HANDOFF, 'executionProfileId': NATIVE, 'dependencyPrefixProfileId': PREFIX, 'profileRefs': PROFILE_IDS, 'normRefs': [norm['normId']], 'scope': plan['scope'], 'allQueriesForThisInput': 2, 'allKeysForThisInput': 2, 'allHeadsForThisInput': 40, 'managerAccepted': False, 'generationReady': False, 'e5FullSessionAccepted': False, 'originalWorkflowInputsVerified': False, 'originalProductionPrecisionVerified': False, 'fullSequenceVerified': False, 'fullSelfAttentionBlockVerified': False, 'actualHighToLowHandoffVerified': False, 'combinedProductionResourceBudgetVerified': False, 'load': 'NOT_READY', 'predict': 'NOT_READY', 'sample': 'NOT_READY', 'reusedOwnerEvidence': reused}
    return {'schemaVersion': 'works-profile-registration-proposal/0.1', 'recordedDateJST': '2026-11-01', 'status': 'PROPOSED_NOT_PUBLISHED', 'runtimeIntegrated': False, 'baselineCommit': BASE, 'baselineCatalogSHA256': BASE_CATALOG_SHA, 'preservedN16PreviewCommit': HANDOFF, 'preservedN16CatalogSHA256': N16_CATALOG_SHA, 'proposedDocumentVersion': '1.0-draft.3', 'nativeExecutionProfileId': NATIVE, 'sourceBuild': {'mainBuildCommit': CODE, 'handoffCommit': HANDOFF, 'apiVersion': 'diffusion-models/0.1', 'nativeDescriptorSchema': 'bernini-derived-heads/0.1', 'prefixDescriptorSchema': 'bernini-block-hidden/0.1', 'buildId': build, 'mainBuildInfo': asset(API + 'build-info.mjs', owners[CODE + ':' + API + 'build-info.mjs']), 'mainSourceCount': len(closure), 'mainSourceClosure': {posixpath.normpath(API + path): sha for path, sha in sorted(closure.items())}, 'kernelBindings': kernel_bindings(owners), 'assets': [asset(key.split(':', 1)[1], raw, key.split(':', 1)[0]) for key, raw in sorted(owners.items())], 'standaloneSourceCommitResolved': True}, 'profileRecords': {'shape': [shape], 'numeric-execution': [numeric, prefix_record], 'normalization': [normalization]}, 'numericalRules': rules, 'managerNorms': [norm], 'managementCandidateSet': candidate, 'registrationIsManagementAdoption': False, 'oldN16RegistrationScopeUnchanged': True, 'modelNumericalInferenceExecutedForRegistration': False}


def plan_owner_numeric(owners): return owner(owners, NEXT + 'expansion/profile-proposal.json')['numericRules']


def authenticate_inputs(base, owners):
    # A separately fixed handoff hash authenticates inventories and metadata; no
    # attacker-supplied self-consistent plan/hash pair becomes a new trust root.
    fail(digest(owners.get(HANDOFF + ':' + HANDOFF_PATH, b'')) == HANDOFF_SHA, 'Fixed handoff bytes required')
    fail(digest(owners.get(HANDOFF + ':' + N16_RECEIPT, b'')) == N16_RECEIPT_SHA, 'Fixed prior N16 receipt required')
    authenticated = {HANDOFF + ':' + HANDOFF_PATH, HANDOFF + ':' + N16_RECEIPT}
    h, prior = owner(owners, HANDOFF_PATH, HANDOFF), owner(owners, N16_RECEIPT, HANDOFF)
    fail(h['runtimeCodeCommit'] == CODE and h['sourceBuild']['mainSources'] == 89, 'Fixed runtime source identity required')
    fail(digest(base.get(CATALOG, b'')) == N16_CATALOG_SHA == prior['candidateCatalogSHA256'], 'Fixed prior N16 catalog required')
    fail(set(base) == {x['path'] for x in prior['candidateFiles']}, 'Prior candidate file set changed')
    for item in prior['candidateFiles']:
        raw = base.get(item['path'], b''); fail(len(raw) == item['byteLength'] and digest(raw) == item['sha256'], 'Prior N16 preview byte mismatch: ' + item['path'])
    original_raw = owners.get(BASE + ':' + CATALOG, b'')
    fail(digest(original_raw) == BASE_CATALOG_SHA, 'Original canonical catalog bytes required')
    authenticated.add(BASE + ':' + CATALOG)
    for item in parse(original_raw)['files'] + parse(original_raw)['documents']:
        key = BASE + ':' + item['path']; raw = owners.get(key, b''); authenticated.add(key)
        fail(digest(raw) == item['sha256'] and ('byteLength' not in item or len(raw) == item['byteLength']), 'Original catalog dependency mismatch')
    info_path = h['sourceBuild']['mainBuildInfoPath']; info = owners.get(CODE + ':' + info_path, b'')
    fail(digest(info) == h['sourceBuild']['mainBuildInfoSHA256'], 'Fixed main build-info bytes required'); authenticated.add(CODE + ':' + info_path)
    build, source_digest, closure = build_info(info)
    fail(build == h['sourceBuild']['buildId'] == 'diffusion-models/0.1+' + source_digest, 'Main build identity mismatch')
    fail(len(closure) == 89 and digest(json.dumps(closure, sort_keys=True, separators=(',', ':')).encode()) == source_digest, 'Main89 source closure mismatch')
    for name, expected in closure.items():
        key = CODE + ':' + posixpath.normpath(API + name); authenticated.add(key)
        fail(digest(owners.get(key, b'')) == expected, 'Main source hash mismatch: ' + name)
    for table in [h['commitAlignment']['assets'], h['artifacts']]:
        for path, item in table.items():
            key = CODE + ':' + path; authenticated.add(key); raw = owners.get(key, b'')
            fail(len(raw) == item['bytes'] and digest(raw) == item['sha256'], 'Anchored runtime source/evidence mismatch: ' + path)
    for side in ['high', 'low']:
        pr = owner(owners, NEXT + 'hidden-runtime/' + side + '-comparison.json'); hr = owner(owners, NEXT + 'expansion/' + side + '-browser.json')
        fail(pr['passed'] is True and hr['passed'] is True and len(pr['stages']) == 14 and len(hr['comparisons']) == 11, 'Exact reused evidence counts required')
        fail(all(x['failCount'] == 0 for x in pr['stages'].values()) and all(x['passed'] is True for x in pr['parameters']) and all(x['failed'] == 0 for x in hr['comparisons'].values()), 'Reused fixed evidence must pass at original gates')
        for mode in ['local', 'composed']:
            path = NEXT + 'expansion/' + side + '-' + mode + '-reference-receipt.json'; key = CODE + ':' + path; authenticated.add(key)
            fail(digest(owners.get(key, b'')) == hr['referenceReceiptSHA256'][mode], 'Separate reference receipt mismatch')
        for path, expected in {**pr['producerSourceSHA256'], **hr['sourceSHA256']}.items():
            key = CODE + ':' + path; authenticated.add(key); fail(digest(owners.get(key, b'')) == expected, 'Executed source hash mismatch')
        fail(pr['predeclaredPlanSHA256'] == digest(owners[CODE + ':' + PREFIX_PLAN]) and hr['planSHA256'] == digest(owners[CODE + ':' + HEAD_PLAN]), 'Predeclared gate plan binding mismatch')
    fail(set(owners) == authenticated, 'Every asset must belong to the fixed authenticated source set')


def counts(files):
    return {'profileRecords': sum(len(parse(files[path])['records']) for path in PROFILE_PATHS), 'numericRules': len(parse(files[RULES])['rules']), 'managerNorms': len(parse(files[NORMS])['rules'])}


def validate_preview(base, output):
    old, cat = parse(base[CATALOG]), parse(output[CATALOG])
    for key in ['managementAdoptionSets', 'registrationSourceBuild', 'registrationBaseline', 'mappingAuthority', 'classification']:
        fail(cat[key] == old[key], 'Prior catalog authority/adoption/source changed: ' + key)
    fail(cat['managementCandidateSets'][:-1] == old['managementCandidateSets'], 'Old N16 candidate changed')
    fail(counts(base) == {'profileRecords': 21, 'numericRules': 14, 'managerNorms': 13}, 'Expected unchanged prior N16 preview counts')
    fail(counts(output) == {'profileRecords': 25, 'numericRules': 19, 'managerNorms': 14}, 'Expected separate N2 dependency additions')
    records = []
    for path in PROFILE_PATHS + [RULES, NORMS]:
        before, after = parse(base[path]), parse(output[path]); key = 'records' if 'records' in before else 'rules'
        fail(after[key][:len(before[key])] == before[key], 'Prior scope widened')
        fail(after.get('runtimeIntegrated') == before.get('runtimeIntegrated') and after['schemaVersion'] == before['schemaVersion'], 'Reference structural schema/runtime state changed')
        if key == 'records': records.extend(after[key])
    ids = [r['recordId'] for r in records]; rules = parse(output[RULES])['rules']; rule_ids = {r['ruleId'] for r in rules}; norms = parse(output[NORMS])['rules']
    fail(len(ids) == len(set(ids)) and len(rules) == len(rule_ids) and len(norms) == len({x['normId'] for x in norms}), 'Duplicate record/rule/norm ID')
    for norm in norms: fail(set(norm['profileRefs']) <= set(ids) and set(norm['numericalRuleRefs']) <= rule_ids, 'Unresolved manager norm reference')
    fail({x for n in norms for x in n['profileRefs']} == set(ids) and {x for n in norms for x in n['numericalRuleRefs']} == rule_ids, 'Unbound profile or rule')
    for item in cat['files'] + cat['documents']:
        raw = output[item['path']]; fail(digest(raw) == item['sha256'] and ('byteLength' not in item or len(raw) == item['byteLength']), 'Preview dependency identity mismatch')


def apply_registration(base_files, proposal, owner_files):
    base, owners, p = {k: bytes(v) for k, v in base_files.items()}, {k: bytes(v) for k, v in owner_files.items()}, copy.deepcopy(proposal)
    authenticate_inputs(base, owners)
    fail(p == build_proposal(base, owners), 'Fixed N2 registration source/gate/precision/admission/scope content changed')
    output = dict(base)
    for category, path in zip(['shape', 'numeric-execution', 'normalization', 'loader-policy'], PROFILE_PATHS):
        document = parse(base[path]); document['records'].extend(copy.deepcopy(p['profileRecords'].get(category, [])))
        document['documentVersion'] = p['proposedDocumentVersion']; document['registrationStatus'] = 'proposal-preview-not-published'; output[path] = encode(document)
    for path, additions in [(RULES, p['numericalRules']), (NORMS, p['managerNorms'])]:
        document = parse(base[path]); document['rules'].extend(copy.deepcopy(additions)); document['documentVersion'] = p['proposedDocumentVersion']; output[path] = encode(document)
    cat = parse(base[CATALOG]); cat['documentVersion'] = p['proposedDocumentVersion']; cat['date'] = p['recordedDateJST']
    cat['authority']['humanReadable'] = 'Original1.0-draft.1 documents remain baseline; separate N16 and N2 registration commentaries describe unadopted additions. No Page or publication update.'
    cat['managementCandidateSets'].append(copy.deepcopy(p['managementCandidateSet']))
    cat['registrationN2SourceBuild'] = copy.deepcopy(p['sourceBuild'])
    cat['registrationN2Baseline'] = {'commit': HANDOFF, 'priorDocumentVersion': '1.0-draft.2', 'priorCatalogSHA256': N16_CATALOG_SHA, 'canonicalCatalogCommit': BASE, 'canonicalCatalogSHA256': BASE_CATALOG_SHA}
    for item in cat['files']:
        raw = output[item['path']]; item.update({'byteLength': len(raw), 'sha256': digest(raw), 'documentVersion': p['proposedDocumentVersion']})
    output[CATALOG] = encode(cat); validate_preview(base, output)
    return output


def main():
    base, owners = load_inputs(); proposal = build_proposal(base, owners); output = apply_registration(base, proposal, owners)
    raw = encode(proposal); (ROOT / PROPOSAL_PATH).write_bytes(raw); OUT.mkdir(parents=True, exist_ok=True)
    for path, data in output.items():
        target = OUT / 'candidate' / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    receipt = {'schemaVersion': 'diffusion-qkv-n2-registration-receipt/0.1', 'passed': True, 'canonicalCommit': BASE, 'preservedN16PreviewCommit': HANDOFF, 'runtimeCodeCommit': CODE, 'proposalPath': PROPOSAL_PATH, 'proposalBytes': len(raw), 'proposalSHA256': digest(raw), 'candidateCatalogSHA256': digest(output[CATALOG]), 'candidateDocumentVersion': proposal['proposedDocumentVersion'], 'priorCounts': counts(base), 'candidateCounts': counts(output), 'authenticatedOwnerAssets': len(owners), 'mainBuildSources': 89, 'oldManagementAdoptionAndN16CandidateUnchanged': True, 'runtimeIntegrated': False, 'registrationPublished': False, 'managerAccepted': False, 'numericalInferenceExecuted': False, 'candidateFiles': [asset(path, data, HANDOFF) for path, data in sorted(output.items())]}
    # Candidate files are newly generated previews: HANDOFF is their source
    # baseline, not a claim that these new bytes already exist at that commit.
    for item in receipt['candidateFiles']:
        item['sourceBaselineCommit'] = item.pop('commit'); item.pop('repository')
    (OUT / 'receipt.json').write_bytes(encode(receipt))
    print(json.dumps({k: receipt[k] for k in ['passed', 'proposalSHA256', 'candidateCatalogSHA256', 'priorCounts', 'candidateCounts', 'authenticatedOwnerAssets', 'runtimeIntegrated']}))


if __name__ == '__main__': main()
