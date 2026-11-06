// Metadata-only inventory/consumer join. Reads fixed Git blobs, never a model,
// selected File, native handle or weight array. No SDK/evaluator/ORT execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = 'development/ai-connection/lora-p2-p3-consumer/TARGET-CONSUMER-MATRIX';
const BASELINE = '82cd9bb3d6792fa20a5305f52198efca5a30459f';
const FC = 'fc2789a0f649e33f15eb13750e6a983b5c52d170';
const DIFF = '5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3';
const NEXT = '508d72cc9036e7f500827465c644b4aed3c5f711';
const REPO = 'Kushyameln01/kushyameln-works';
const Q = 'diffusion_model.blocks.0.self_attn.q';
const E1 = 'development/ai-connection/evidence/lora-e1';
const P3 = 'development/ai-connection/reference-adoption/lora/evidence/p3';
const POLICY = 'comfy-lora-b5a4321-linear-diff-v1';
// Declared original-only parameter contracts, not LoRA injection bindings.
const NEXT_PARAMETERS = {
  'blocks.0.self_attn.o.weight': {storageDtype: 'F8_E4M3', fullShape: [5120, 5120], columns: 5120, allowedRows: [0, 5120]},
  'blocks.0.self_attn.o.bias': {storageDtype: 'F16', fullShape: [5120], allowedElements: [0, 5120]},
  'time_projection.1.weight': {storageDtype: 'F16', fullShape: [30720, 5120], columns: 5120, allowedRows: [10240, 15360]},
  'time_projection.1.bias': {storageDtype: 'F16', fullShape: [30720], allowedElements: [10240, 15360]},
  'blocks.0.modulation': {storageDtype: 'F16', fullShape: [1, 6, 5120], allowedElements: [10240, 15360]}
};
const sources = {};
let nextTailSource;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
function load(id, commit, path, {json = true, expected = null} = {}) {
  const bytes = git('show', `${commit}:${path}`), digest = sha256(bytes);
  if (expected) assert.equal(digest, expected, `Fixed metadata digest: ${path}`);
  sources[id] = {repository: REPO, commit, path, byteLength: bytes.length, sha256: digest,
    gitBlobSha: git('rev-parse', `${commit}:${path}`).toString().trim(),
    url: `https://github.com/${REPO}/blob/${commit}/${path}`};
  return json ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8');
}
const inventory = load('inventory', BASELINE, 'development/lora/contracts/original-inventory.json', {
  expected: '97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3'});
load('logical-correspondence', BASELINE, 'development/lora/contracts/registry-correspondence-v2.json');
const logicalSource = load('logical-targets', DIFF, 'docs/shared/diffusion-models/lora/targets.mjs', {json: false});
const rowText = logicalSource.match(/const rows=\[([\s\S]*?)\n\];/)?.[1];
assert.ok(rowText, 'Pinned logical target metadata table');
const logicalTargets = new Map(JSON.parse(`[${rowText.trim().replace(/,\s*$/, '')}]`)
  .map(([key, shape]) => [`diffusion_model.${key}`, shape]));
for (const [id, commit, path] of [
  ['native-adapter', FC, 'docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs'],
  ['native-loader-policy', FC, 'docs/shared/inference/lora/loader-policy.mjs'],
  ['native-consumer', DIFF, 'docs/shared/diffusion-models/lora/diagnostic-consumer.mjs'],
  ['native-base-block', DIFF, 'docs/shared/diffusion-models/lora/base-block.mjs'],
  ['native-local-file-base', DIFF, 'docs/shared/diffusion-models/lora/diagnostic-base.mjs'],
  ['native-graph', DIFF, 'docs/shared/diffusion-models/ort-bridge/graph.mjs'],
  ['native-stage', DIFF, 'docs/shared/diffusion-models/ort-bridge/stage.mjs'],
  ['new-api', NEXT, 'docs/shared/diffusion-models/API.md'],
  ['new-tail-stage', NEXT, 'docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs'],
  ['new-tail-source', NEXT, 'docs/shared/diffusion-models/ort-bridge/self-attention-tail/source.mjs'],
  ['new-tail-readme', NEXT, 'docs/shared/diffusion-models/ort-bridge/self-attention-tail/README.md']
]) {
  const body = load(id, commit, path, {json: false});
  if (id === 'new-tail-source') nextTailSource = body;
}
const nextKeysText = nextTailSource.match(/const KEYS=({[\s\S]*?\n});/)?.[1];
assert.ok(nextKeysText, 'Pinned original-only tail parameter declarations');
const nextKeys = JSON.parse(nextKeysText.replaceAll("'", '"').replace(/([{,])([A-Za-z][\w]*):/g, '$1"$2":'));
assert.deepEqual(Object.fromEntries(Object.entries(nextKeys).map(([key, {dtype, ...spec}]) => [key, {storageDtype: dtype, ...spec}])), NEXT_PARAMETERS);
assert.ok(nextTailSource.includes("computeDtype:'F32'") && nextTailSource.includes("transform:'identity-row-major'"));
assert.equal(sources['native-adapter'].sha256, 'bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f');
assert.equal(sources['native-consumer'].sha256, 'fdac31542f87d68b9e01a1ba674ee9b60433cae685d6670222f8d914dd27f943');
const latest = load('p3-receipt', BASELINE, `${P3}/receipt.json`, {
  expected: '919d1fed96bcee3aa9df3338de235ae51b4003c072003cc9642c3fde033dd935'});
load('p3-selected-scope', BASELINE, `${P3}/selected-scope.json`, {
  expected: '1af75e98c507e25e4e306503c7f851a882e33751ec000dd589d3b75add1414f7'});
const sides = {}, rows = [], pairSides = [];
for (const side of ['HIGH', 'LOW']) {
  const registry = load(`registry:${side}`, BASELINE, `${E1}/${side}-registry-correspondence.json`);
  const result = load(`e1-result:${side}`, BASELINE, `${E1}/${side}-result.json`);
  const reference = load(`e1-reference:${side}`, BASELINE, `${E1}/${side}-reference.json`);
  const gates = load(`e1-gates:${side}`, BASELINE, `${E1}/${side}-gates.json`);
  assert.equal(result.status, 'PASS_DIAGNOSTIC_PARTIAL');
  assert.equal(result.cases.length, 10);
  assert.equal(result.binding.nativeRegistryHash, registry.nativeRegistryHash);
  assert.equal(result.binding.connectionRegistryHash, registry.connectionRegistryHash);
  assert.equal(registry.nativeRegistry.side, side);
  assert.equal(registry.connectionRegistry.side, side);
  assert.equal(registry.nativeRegistry.targets.length, 2);
  assert.equal(registry.connectionRegistry.targets.length, 2);
  assert.equal(result.modelInference, false);
  assert.equal(result.generationReady, false);
  sides[side] = {registry, result, reference, gates};
}
for (const item of inventory) {
  const side = item.side.toUpperCase(), pairId = item.pairId, id = `${pairId}:${side}`;
  const {registry, result} = sides[side];
  const scopeRef = `scope:${id}`, scope = load(scopeRef, BASELINE, `${E1}/${pairId}-${side}-scope.json`);
  assert.equal(scope.sourceSha256, item.sha256);
  assert.equal(scope.coverage, 'PARTIAL');
  assert.equal(scope.completeAdapter, false);
  assert.deepEqual(Object.keys(item.dtypes), ['BF16']);
  assert.equal(item.dtypes.BF16, item.tensorCount);
  assert.deepEqual(item.unknownTensorKeys, []);
  const lowRank = new Map(item.lowRankPairs.map(pair => [`${pair.targetStem}.weight`, pair]));
  const inventoryKeys = [...lowRank.keys(), ...item.weightDiffTargets.map(key => `${key}.weight`),
    ...item.biasDiffTargets.map(key => `${key}.bias`)];
  const patches = [...scope.includedPatches.map((patch, index) => ({patch, selected: true, index})),
    ...scope.excludedTargets.map((patch, index) => ({patch, selected: false, index}))];
  assert.equal(new Set(inventoryKeys).size, inventoryKeys.length, `Unique inventory: ${id}`);
  assert.equal(new Set(patches.map(({patch}) => patch.key)).size, patches.length, `Unique retained targets: ${id}`);
  assert.deepEqual(patches.map(({patch}) => patch.key).sort(), inventoryKeys.sort(), `No missing/extra patch: ${id}`);
  assert.equal(patches.length, pairId === 'light' ? 1052 : 400);
  assert.equal(scope.includedPatches.length, pairId === 'light' ? 2 : 1);
  assert.equal(scope.excludedTargets.length, pairId === 'light' ? 1050 : 399);
  const cases = result.cases.filter(record => record.pairId === pairId);
  assert.equal(cases.length, 5);
  for (const record of cases) {
    assert.equal(record.sourceSha256, item.sha256);
    assert.equal(record.coverage, 'PARTIAL');
    assert.equal(record.weightComparison.passed, true);
    assert.equal(record.weightComparison.compared, 81920);
    assert.equal(record.biasComparison.passed, true);
    assert.equal(record.biasComparison.compared, 16);
    assert.equal(record.outputComparison.passed, true);
    assert.equal(record.outputComparison.compared, 16);
  }
  pairSides.push({pairId, side, original: {fileName: item.fileName, byteLength: item.bytes,
    sha256: item.sha256, headerSha256: item.headerSha256, tensorCount: item.tensorCount,
    sourceDtypes: item.dtypes, inventoryRef: 'inventory', inventoryIndex: inventory.indexOf(item)},
    scopeRef, logicalPatchCount: patches.length, selectedPatchCount: scope.includedPatches.length,
    excludedPatchCount: scope.excludedTargets.length, selectedRows: [0, 16], selectedColumns: [0, 5120],
    excludedRegions: scope.excludedRegions, completeAdapter: false, coverage: 'PARTIAL',
    nativeRegistryHash: registry.nativeRegistryHash, connectionRegistryHash: registry.connectionRegistryHash,
    modelHash: registry.nativeRegistry.modelHash, baseVerification: registry.nativeRegistry.baseVerification,
    retainedE1CaseIds: cases.map(record => record.id), retainedE1ResultRef: `e1-result:${side}`,
    retainedE1LoraExecutionCommit: result.loraSourceCommit, retainedE1DiffusionExecutionCommit: result.peerCommit,
    detailBaseBiasPassThrough: pairId === 'detail' ? {weightId: 'q.bias', fullShape: [5120], selectedShape: [16],
      region: [0, 16], source: 'immutable base', loRaPatch: false, binding: {kind: 'hike-parameter', name: 'bias'},
      hashEvidenceRef: `registry:${side}`, pointer: '/passThrough'} : null});
  for (const {patch, selected, index} of patches) {
    const native = registry.nativeRegistry.targets.find(target => target.key === patch.key);
    const connection = registry.connectionRegistry.targets.find(target => target.key === patch.key);
    const factor = lowRank.get(patch.key);
    assert.deepEqual(patch.fullShape, logicalTargets.get(patch.key), `Retained logical shape: ${id}/${patch.key}`);
    if (factor) {
      assert.deepEqual(patch.fullShape, [factor.upShape[0], factor.downShape[1]]);
      assert.equal(factor.rank, factor.downShape[0]); assert.equal(factor.rank, factor.upShape[1]);
      assert.ok(Number.isInteger(factor.rank) && factor.rank > 0 && Number.isFinite(factor.scale));
      assert.ok(factor.alpha === null || Number.isFinite(factor.alpha));
      assert.equal(factor.scale, factor.alpha === null ? 1 : factor.alpha / factor.rank);
      assert.equal(patch.variant, pairId === 'light' ? 'linear-down-up' : 'linear-a-b');
    } else assert.equal(patch.variant, patch.key.endsWith('.bias') ? 'additive-diff-b' : 'additive-diff');
    if (selected) {
      assert.ok(native && connection, `Selected native/connection join: ${id}/${patch.key}`);
      assert.deepEqual(patch.fullShape, native.fullShape);
      assert.deepEqual(connection.shape, patch.fullShape);
      assert.deepEqual(patch.slice, {startRow: 0, rowCount: 16});
      assert.equal(native.computeDtype, 'F32'); assert.equal(connection.dtype, 'F32');
      assert.equal(native.layout, 'row-major'); assert.equal(connection.layout, 'row-major');
      assert.deepEqual(native.binding, connection.binding);
    } else assert.equal(patch.reason, 'outside-diagnostic-selection');
    const ptr = `/${selected ? 'includedPatches' : 'excludedTargets'}/${index}`;
    rows.push({pairId, side, originalSha256: item.sha256, key: patch.key,
      layer: patch.key.replace(/\.(weight|bias)$/, ''), variant: patch.variant, sourceTensorNames: patch.names,
      loader: {policyId: POLICY, rank: factor?.rank ?? null, alpha: factor?.alpha ?? null,
        alphaPresence: factor ? (factor.alpha === null ? 'ABSENT' : 'PRESENT') : 'NOT_APPLICABLE',
        scale: factor?.scale ?? null, scaleRule: factor ? (factor.alpha === null ? 'fixed-policy-missing-alpha-scale-1' : 'alpha/rank') : 'strength*delta',
        strength: null, strengthMeaning: 'Selected by request; historical diagnostic evidence only at 0,+1,-1'},
      fullShape: patch.fullShape,
      logicalShapeProvenance: {sourceRef: scopeRef, pointer: `${ptr}/fullShape`,
        inventoryRef: 'inventory', logicalTargetRef: 'logical-targets',
        meaning: factor ? 'Retained factor output dimensions, crosschecked with cached base target name/shape' : 'Retained logical target shape from cached base header mapping',
        provesFullGraphCompatibility: false},
      selectedRegion: selected ? {rows: [0, 16], columns: patch.fullShape.length === 2 ? [0, 5120] : null,
        selectedShape: native.shape, transpose: native.transform.transpose} : null,
      excludedRegions: scope.excludedRegions.filter(region => region.key === patch.key),
      actualFullShape: selected ? native.fullShape : null,
      actualShapeProvenance: selected ? {sourceRef: `registry:${side}`, nativeTargetIndex: registry.nativeRegistry.targets.indexOf(native),
        connectionTargetIndex: registry.connectionRegistry.targets.indexOf(connection),
        meaning: 'Original header full dimensions with actual bounded provider/consumer mapping; no full-tensor value acceptance'} : null,
      dtype: {sourceLoRa: 'BF16', baseStorage: selected ? native.storageDtype : null,
        baseCompute: selected ? native.computeDtype : null, preparedOutput: selected ? connection.dtype : null,
        layout: selected ? connection.layout : null,
        provenance: selected ? `registry:${side}` : null,
        unknownReason: selected ? null : 'No actual immutable base/provider and consumer binding for this target; cached logical shape supplies no dtype/layout guarantee'},
      oldConsumer: {consumerId: selected ? 'q16-diagnostic' : null,
        status: selected ? 'RETAINED_REAL_PARTIAL_ACCEPTANCE' : 'UNSUPPORTED_NO_REAL_BINDING',
        reasonId: selected ? 'ONLY_SELECTED_Q16_ROWS_ACCEPTED' : 'NO_REAL_GRAPH_FEED_SESSION_BINDING',
        weightId: selected ? native.weightId : null, binding: selected ? native.binding : null,
        graphHash: selected ? registry.nativeRegistry.graphHash : null,
        executionProfileId: selected ? registry.nativeRegistry.executionProfileId : null,
        sessionEvidenceRef: selected ? `e1-result:${side}` : null,
        coverage: 'PARTIAL', currentLiveSession: false},
      nextConsumer: {consumerId: 'diffusion508d-n2-tail', status: 'DEPENDENCY_WAITING',
        reasonId: 'NO_PUBLIC_LORA_WEIGHT_INJECTION',
        originalParameterKey: Object.hasOwn(NEXT_PARAMETERS, patch.key.slice('diffusion_model.'.length))
          ? patch.key.slice('diffusion_model.'.length) : null,
        originalParameterContractRef: Object.hasOwn(NEXT_PARAMETERS, patch.key.slice('diffusion_model.'.length))
          ? 'consumers.diffusion508d-n2-tail.originalParameterContracts' : null,
        originalParameterIsLoRaInjection: false},
      exclusionReason: selected ? null : patch.reason,
      descriptorProvenance: {sourceRef: scopeRef, pointer: ptr},
      completeAdapter: false, generationReady: false});
  }
}
assert.equal(rows.length, 2904);
assert.equal(rows.filter(row => row.oldConsumer.status === 'RETAINED_REAL_PARTIAL_ACCEPTANCE').length, 6);
assert.equal(rows.filter(row => row.oldConsumer.status === 'UNSUPPORTED_NO_REAL_BINDING').length, 2898);
assert.equal(rows.filter(row => row.nextConsumer.status === 'DEPENDENCY_WAITING').length, 2904);
for (const [id, {registry}] of Object.entries(sides)) {
  assert.deepEqual(registry.connectionRegistry.targets.map(t => t.binding.kind), ['runtime-input', 'hike-parameter']);
  for (const path of ['docs/shared/diffusion-models/lora/diagnostic-consumer.mjs',
    'docs/shared/diffusion-models/lora/base-block.mjs', 'docs/shared/diffusion-models/lora/diagnostic-base.mjs',
    'docs/shared/diffusion-models/ort-bridge/stage.mjs'])
    assert.equal(git('rev-parse', `${DIFF}:${path}`).toString(), git('rev-parse', `${NEXT}:${path}`).toString(), `Q16 source stable at508d: ${id}/${path}`);
}
assert.equal(latest.publishedCases.length, 6);
assert.equal(latest.selection.pairId, 'light'); assert.equal(latest.selection.side, 'HIGH');
const matrix = {
  schemaVersion: 'lora-target-consumer-matrix/0.1-draft.1',
  status: 'RETAINED_Q16_PARTIAL_WITH_NEW_CONSUMER_DEPENDENCY_WAITING',
  metadataBaselineCommit: BASELINE, generator: 'tools/lora/build-target-consumer-matrix.mjs',
  inputPolicy: {productInput: 'User-selected local .safetensors', inventoryRole: 'Historical evidence for these four sources, never a required original whitelist',
    historicalFourOriginalsRequired: false, originalFilesOpened: false, originalHashesRecomputed: false,
    modelPayloadOpened: false, numericOrNativeExecution: false},
  nativePins: latest.sourcePins,
  loaderPolicy: {id: POLICY, upstreamCommit: 'b5a432157de6b8884f81104cd02926adf4d597e4',
    missingAlphaScale1Scope: 'This fixed loader policy only; not a universal LoRA default',
    unknownVariantOrScale: 'REJECT; never infer a multiplier'},
  sources,
  consumers: {
    'q16-diagnostic': {nativeCommit: DIFF, mappingCommit: FC, mappingAuthority: 'createDiffusionDiagnosticAdapter',
      graph: {hash: sides.HIGH.registry.nativeRegistry.graphHash, sourceRef: 'native-graph', operator: 'Gemm',
        inputs: {x: [1, 5120], weight: [16, 5120]}, ortOutput: {projection: [1, 16]},
        postOrt: 'Hike adds explicit bias[16]', fullModelGraph: false},
      feed: {weight: {binding: 'runtime-input', dtype: 'F32', layout: 'row-major'},
        bias: {binding: 'hike-parameter', dtype: 'F32', layout: 'row-major'}, graphInitializer: null},
      session: {kind: 'actual ORT WASM diagnostic Gemm + Hike bias', sourceRef: 'native-stage',
        publicConsumerRef: 'native-consumer', inputEncoding: 'F32-runtime-weight',
        preparedOutputMeaning: 'Prepared weight/bias bytes, not the 16 projection outputs',
        ownership: 'independent-copy in retained trials', leaseAccepted: false,
        historicalEvidenceOnly: true, currentLiveSession: false,
        fullModelSessionAccepted: false, modelInference: false, generationReady: false},
      sideRegistries: Object.fromEntries(Object.entries(sides).map(([side, value]) => [side, {
        sourceRef: `registry:${side}`, nativeRegistryHash: value.registry.nativeRegistryHash,
        connectionRegistryHash: value.registry.connectionRegistryHash, nativeRegistry: value.registry.nativeRegistry,
        connectionRegistry: value.registry.connectionRegistry}]))},
    'diffusion508d-n2-tail': {commit: NEXT, apiRef: 'new-api', constructorRef: 'new-tail-stage',
      factory: 'createSelfAttentionTail', profileId: 'bernini-block0-n2-self-attention-residual-f32-v1',
      nativeScope: 'Fixed N2 block0 O projection + chunk2 gate + original patchHidden residual',
      constructorArguments: ['file', 'side', 'trustedInputs', 'bridgeBytes', 'mathBytes'],
      methods: ['describe', 'run', 'stats', 'dispose', 'recover'],
      originalParameterContracts: Object.fromEntries(Object.entries(NEXT_PARAMETERS).map(([key, spec]) => [key, {
        ...spec, computeDtype: 'F32', transform: 'identity-row-major', sourceRef: 'new-tail-source',
        provenance: 'Declared original File reader guards; not an observed LoRA weight binding or new numerical acceptance',
        loRaInjection: false}])),
      loRaInjectionAccepted: false, status: 'DEPENDENCY_WAITING', reasonId: 'NO_PUBLIC_LORA_WEIGHT_INJECTION',
      fixedQ16FilesUnchangedFrom5f: true, q16AcceptancePromotedToTail: false}
  },
  reasonDefinitions: {
    ONLY_SELECTED_Q16_ROWS_ACCEPTED: 'Only retained Q first16 rows/all5120 input columns and explicit light Q bias have actual native mapping and numerical evidence. Remaining selected-target rows are excluded.',
    NO_REAL_GRAPH_FEED_SESSION_BINDING: 'Logical target name/shape exists, but no corresponding full-target graph initializer/runtime feed/Hike argument, immutable provider, sink and real consumer session has been accepted.',
    NO_PUBLIC_LORA_WEIGHT_INJECTION: '508d tail reads its fixed original O/time/modulation keys and exposes no external LoRA target registry/provider/sink/prepared/candidate/feed injection. Registry, package/feed identity, session ownership and commit/rollback contract are required before connecting prepared LoRA bytes.'
  },
  retainedEvidence: {
    e1FourPairSides: {sourceRefs: ['e1-result:HIGH', 'e1-result:LOW'], cases: 20,
      casesPerPairSide: 5, strengths: [0, 1, -1], otherCases: ['positive reapply after base restore', 'positive cancellation recovery'],
      highLoraExecutionCommit: sides.HIGH.result.loraSourceCommit, lowLoraExecutionCommit: sides.LOW.result.loraSourceCommit,
      diffusionExecutionCommit: sides.HIGH.result.peerCommit, nativeModuleIdentity: 'Retained source hashes; consumer is byte-identical to pinned5f',
      coverage: 'PARTIAL', selectedWeightValuesPerCase: 81920, selectedBiasValuesPerCase: 16, projectionOutputsPerCase: 16,
      gateReferences: ['e1-gates:HIGH', 'e1-gates:LOW'], referenceMetadata: ['e1-reference:HIGH', 'e1-reference:LOW'],
      executionSourceFiles: Object.fromEntries(Object.entries(sides).map(([side, value]) => [side, {
        lora: value.result.ourSourceFiles, diffusion: value.result.peerSourceFiles,
        runnerSha256: value.result.runnerSourceSHA256, oracleSha256: value.result.oracleSourceSHA256}])),
      oldRollbackScope: {HIGH: 'older prepared uncommitted candidate versus newer epoch', LOW: 'older already committed candidate versus newer epoch'},
      modelInference: false, managerSnapshotAcceptedByE1: false, rerunByMatrix: false},
    laterSelectedLightHigh: {sourceRef: 'p3-receipt', receiverSourceCommit: latest.receiverSourceCommit,
      distributionCommit: '40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68', managerCommit: latest.fixedCommits.manager,
      pairId: 'light', side: 'HIGH', publishedCases: 6, coverage: 'PARTIAL',
      selectedWeightValues: 491520, selectedBiasValues: 96, projectionOutputs: 96,
      fullReceiptArchive: latest.fullReceiptArchive, nativePins: latest.sourcePins,
      referenceProof: latest.referenceProof, caseIds: latest.publishedCases.map(record => record.id),
      scope: latest.scope, endState: latest.endState, rerunByMatrix: false,
      notMergedWithE1CaseCount: true, notAcceptanceOfOtherPairSides: true,
      notAcceptanceOfNewManagerDataBridge: true, notAcceptanceOfNewTail: true},
    freshMatrixWork: {metadataExpansionOnly: true, originalLoads: 0, originalWholeHashes: 0,
      nativeCalculations: 0, modelSessions: 0, newNumericAcceptance: false}
  },
  totals: {pairSides: 4, logicalPatches: rows.length, oldQ16SelectedPatches: 6, oldUnboundPatches: 2898,
    newTailDependencyWaitingPatches: 2904},
  pairSides, patches: rows,
  scopeBarriers: ['No all-target acceptance', 'No full-model inference/session', 'No two-pair composition',
    'No new numerical or formal-management bridge acceptance from this matrix', 'No generation or publication'],
  generationReady: false
};
const doc = `# LoRA targetと実consumerの対応\n\n固定metadataから4つのpair/side、全2,904 patchを展開した。[JSON正本](TARGET-CONSUMER-MATRIX.json)は各patchの原本hash、層、variant、倍率規約、full shape、選択領域、dtype、binding、graph/feed/session、除外理由を保持する。原本の再load・hash、実計算は行っていない。\n\n| pair | side | logical patch | 旧Q16へ接続したpatch | 除外patch | 新tail |\n| --- | --- | ---: | --- | ---: | --- |\n${pairSides.map(p => `| ${p.pairId} | ${p.side} | ${p.logicalPatchCount} | ${p.pairId === 'light' ? 'Q weight + Q bias' : 'Q weight（biasは不変base pass-through）'} | ${p.excludedPatchCount} | DEPENDENCY_WAITING |`).join('\n')}\n\nQ weightのfull shapeは[5120,5120]、選択は先頭16行・全5120列。lightの明示biasはfull[5120]の先頭16値。detailにbias patchを作らず、consumerに必要なbase biasを別に記録する。残りの行と全除外targetを保持し、coverage=PARTIAL、completeAdapter=falseとする。\n\n旧Q16はLoRA mapping ${FC}、Diffusion ${DIFF}。実registryはweightがruntime-input \`weight\`、biasがhike-parameter \`bias\`。単一Gemmのx[1,5120]とweight[16,5120]からprojection[1,16]を作り、Hikeでbiasを加える実ORT WASM診断sessionである。実base storageはweight F8_E4M3、bias F16、decode後base/準備済みweight・bias出力はF32 row-major。準備済み重みのdtypeと16出力のdtypeを混同しない。\n\nfullShapeのlogical provenanceと実native descriptorを別々に記録する。選択外2,898 patchは旧Q16へのLoRA適用bindingがなく、元の照合は論理名・形状に限られる。base storage/compute dtype、準備済み出力、layout、実fullShape、bindingはnullのまま未確認理由を示す。未知値をF32やFP8で補わず、shape一致をbase適合としない。\n\n新Diffusion ${NEXT}のcreateSelfAttentionTailは固定N2 block0のO projection、chunk2 gate、元patchHidden残差を扱う。constructorはfile/side/trustedInputs/bridgeBytes/mathBytes、runはattention/patchHidden/timeAct1と制御引数を受ける。LoRA prepared/candidate/feedを実tail sessionへ渡す公開経路がないため、全2,904 patchにDEPENDENCY_WAITINGを付けた。新tailが原本から読むO/time/modulationの5keyは、originalParameterContractsに元readerのstorage/compute dtype・full shape・許可領域として別記し、対応するpatchから参照する。これはLoRAの注入口や実適用を意味しない。旧Q16のconsumer/base/stageのGit blobが新commitでも同一であることと、新tailへのLoRA適用は別である。\n\n旧E1の20件はHIGH実行${sides.HIGH.result.loraSourceCommit}、LOW実行${sides.LOW.result.loraSourceCommit}、Diffusion実行${sides.HIGH.result.peerCommit}の4 pair/side各5件。強度0,+1,-1、再適用、取消復帰を元scopeで再利用する。HIGHの古rollbackは旧prepared未commit候補、LOWは旧commit済み候補なので同じ試験として扱わない。\n\n直近のlight/HIGH 6件は実行${latest.receiverSourceCommit}、配布40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68の別scope。491,520 weight・96 bias・96出力と診断snapshotの証拠を再利用するが、旧20件と合算して全モデル合格にしない。この表はmetadataの展開だけであり、旧数値試験の再実行、新管理DATA bridgeや新tailの採用を証明しない。いずれも現在のlive session利用権ではなく、generationReady=false。\n\n入力はユーザーが選ぶローカル.safetensors。4原本の記録は過去証拠であり、全部の取得やhash再計算を製品の前提にしない。全targetは対応する実graph/consumer成立後に受け入れ、二組同時合成・全model/session・生成・公開は追加しない。\n\n再生成・照合はrepo内から次を実行する。固定commitのGit objectsが必要だが、原本バイナリやnative runtimeは不要。\n\n\`\`\`sh\nnode tools/lora/build-target-consumer-matrix.mjs --write\nnode tools/lora/build-target-consumer-matrix.mjs --check\n\`\`\`\n\n検査はinventoryと4scopeのkey集合の完全一致、重複なし、variant/fullShape、原本hash対応、両registryの実Q16 binding、全2,904件の収録、未対応理由の保持、固定sourceと決定的な生成結果を確認する。生成物だけを編集せず、変更時はgeneratorと固定sourceを合わせて更新する。\n`;
const normalizedDoc = doc;
const artifacts = new Map([[`${OUT}.json`, `${JSON.stringify(matrix, null, 2)}\n`], [`${OUT}.md`, normalizedDoc]]);
const mode = process.argv[2] ?? '--check';
if (!['--write', '--check'].includes(mode) || process.argv.length > 3) throw Error('Usage: node tools/lora/build-target-consumer-matrix.mjs [--write|--check]');
for (const [path, content] of artifacts) {
  if (mode === '--write') writeFileSync(`${ROOT}${path}`, content);
  else assert.equal(readFileSync(`${ROOT}${path}`, 'utf8'), content, `Generated artifact differs: ${path}`);
}
console.log(JSON.stringify({status: 'PASS_METADATA_MATRIX', mode, ...matrix.totals,
  fixedSourceCount: Object.keys(sources).length, originalLoads: 0, originalWholeHashes: 0,
  nativeCalculations: 0, newNumericAcceptance: false}));
