// Diagnostic harness only. No runtime/kernel/accepted receipt is changed.
import {createResourceObserver} from './observer.mjs';

const demand = (value, message) => { if (!value) throw Error(message); };
const sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), b => b.toString(16).padStart(2, '0')).join('');
const serial = value => ArrayBuffer.isView(value) ? Array.from(value) : Array.isArray(value) ? value.map(serial) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serial(item)])) : value;
const span = (name, bytes, scope = 'source-derived named span; allocator liveness is not directly observed') => ({name, bytes, scope});

export function selectExecutedSourceHashes(candidates, requestedPaths, harnessSources) {
  const result = {...harnessSources};
  for (const path of new Set(requestedPaths)) {
    demand(Object.hasOwn(candidates, path), 'Unanchored executed source: ' + path);
    result[path] = candidates[path];
  }
  return result;
}

export async function releaseObservation({prefix, downstream, observer}) {
  const failures = [];
  try {
    for (const owner of [prefix, downstream]) {
      try { await owner?.dispose(); } catch (error) { failures.push(error); }
    }
  } finally {
    observer.restore();
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Diagnostic owner release failed');
}

async function compare(actual, expected, gate, identity) {
  demand(actual instanceof Float32Array && actual.length === expected.length, 'Exact comparison shape');
  const actualSHA256 = await sha(actual);
  let failed = 0, maxAbsolute = 0;
  for (let i = 0; i < actual.length; i++) {
    const delta = Math.abs(actual[i] - expected[i]);
    maxAbsolute = Math.max(maxAbsolute, delta);
    if (!Number.isFinite(delta) || ('abs' in gate && delta > gate.abs + gate.rel * Math.abs(expected[i]))) failed++;
  }
  if (!('abs' in gate) && actualSHA256 !== identity.sha256) failed++;
  demand(failed === 0, 'Fixed numerical gate failed');
  return {values: actual.length, failed, maxAbsolute, actualSHA256, gate};
}

const prefixSpans = (key = '') => {
  const inner = key.startsWith('patch_') ? 64 : key.startsWith('time_embedding.0') ? 256 : 5120;
  const rows = key.startsWith('patch_') ? 2 : 1;
  return [span('weightRawF16Tile', 16 * inner * 2), span('weightDecodedF32Tile', 16 * inner * 4),
    span('ORTWeightInputSnapshot', 16 * inner * 4), span('ORTXInputSnapshot', rows * inner * 4),
    span('decodeOwnedRawCopy', 16 * inner * 2), span('decodeTypedBits', 16 * inner * 2)];
};
const headWeightSpans = () => [span('weightRawFP8Tile', 81920), span('weightDecodedF32Tile', 327680),
  span('ORTWeightInputSnapshot', 327680), span('ORTXInputSnapshot', 40960),
  span('callerAndSnapshotHidden', 81920), span('retainedRawAndDecodedBiasNorm', 153600),
  span('QKVOutputMaximumForThisRun', 122880, 'cumulative output extent; completion depends on operator phase')];
const attentionSpans = () => [span('QKVFull', 122880), span('normQKFull', 81920), span('postRopeQKVFull', 122880),
  span('attentionInputSnapshots', 122880), span('contextOutput', 40960), span('headQKV', 3072),
  span('ORTPrevMax', 8), span('ORTScoreAndMaxAlphaOutputs', 32)];

export async function runResourcePipeline(file, payload) {
  const observer = createResourceObserver({modules: payload.modules});
  observer.install();
  let prefix = null, downstream = null;
  const phases = [], seenOperators = new Set();
  let progressCalls = 0;
  const executedSources = () => {
    const paths = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
      url.origin === location.origin && /\.(mjs|js|wasm)$/.test(url.pathname)).map(url => 'docs' + decodeURIComponent(url.pathname));
    return selectExecutedSourceHashes(payload.actualSourceCandidates, paths, payload.executedHarnessSourceSHA256);
  };
  const capture = (phase, nativeStats = null, namedSpans = [], detail = {}) => {
    const memory = observer.snapshot(phase);
    const entry = {phase, elapsedMs: performance.now(), memory, nativeStats, namedSpans,
      realmObservedCapacityBytes: memory.memories.every(item => item.capacityBytes !== null) ? memory.memories.reduce((total, item) => total + item.capacityBytes, 0) : null,
      realmCapacityScope: 'Sum across currently observable distinct Memory objects, including disposed owners awaiting GC. This is not host/allocator/OS total peak.',
      collectedMemoryIds: memory.memories.filter(item => !item.alive).map(item => item.id), ...detail};
    phases.push(entry);
    return entry;
  };
  try {
    // These imports occur after installation in a fresh realm.
    const {createBlockHiddenPrefix} = await import('../../ort-bridge/block-hidden/stage.mjs');
    const {createDerivedQkvHeads} = await import('../../ort-bridge/attention-heads/stage.mjs');
    capture('before-prefix-construction');
    prefix = await createBlockHiddenPrefix({file, side: payload.side});
    await observer.settle();
    const prefixCreated = capture('prefix-constructed', prefix.stats());
    const prefixIds = prefixCreated.memory.memories.filter(item => item.roles.some(role => role.startsWith('Hike.'))).map(item => item.id);
    demand(prefixIds.length === 4, 'Exactly four hash-attributed prefix Hike Memories');
    const reference = payload.prefixReference;
    let produced = await prefix.run({
      rawMean: {...reference.input.rawMean, data: Float32Array.from(reference.input.rawMean.data)},
      noise: Float32Array.from(reference.input.noise), noiseScale: 1, scheduleIndex: reference.meta.globalSigmaIndex,
      onProgress(event) {
        progressCalls++;
        // Read capacity after every bounded native tile; retain only operator boundaries.
        observer.snapshot('prefix-tile');
        if (!seenOperators.has(event.operator)) {
          seenOperators.add(event.operator);
          capture('prefix-first-tile:' + event.operator, prefix.stats(), prefixSpans(event.operator), {progress: event,
            observationPoint: 'after native run and tensor disposal; listed staging spans describe the just-completed source-bound tile'});
        }
      }
    });
    await observer.settle();
    const prefixCompleted = capture('prefix-complete', prefix.stats(), Object.entries(produced.arrays).map(([name, value]) => span('returned.' + name, value.byteLength, 'actual returned typed-array extent')));
    const prefixComparisons = {};
    for (const [name, expected] of Object.entries(reference.expected)) {
      prefixComparisons[name] = await compare(produced.arrays[name], expected, reference.gates[name], reference.arrayIdentities[name]);
    }
    for (const expected of reference.ranges) {
      const actual = expected.key.endsWith('.bias') ? produced.evidence.parameterSources[expected.key.replace('.bias', '.weight')]?.bias : produced.evidence.parameterSources[expected.key];
      demand(actual && actual.rawSHA256 === expected.rawSHA256 && actual.decodedF32SHA256 === expected.decodedF32SHA256, 'Independent prefix parameter bytes: ' + expected.key);
    }
    demand(produced.evidence.hiddenSHA256 === payload.priorEvidence.hiddenSHA256, 'Fresh hidden bits changed; new local oracle required');
    demand(produced.evidence.positionsSHA256 === payload.priorEvidence.positionsSHA256 && produced.evidence.sourceIdsSHA256 === payload.priorEvidence.sourceIdsSHA256, 'Fresh coordinate/source bits changed');
    const prefixEvidence = produced.evidence;
    const hidden = produced.hidden, positions = produced.positions, sourceIds = produced.sourceIds;
    const artifact = {hidden: serial(hidden), positions: serial(positions), sourceIds: serial(sourceIds), evidence: prefixEvidence};
    const privateArtifactText = JSON.stringify(artifact) + '\n';
    const freshArtifactSHA256 = await sha(new TextEncoder().encode(privateArtifactText));
    const trusted = {schemaVersion: 'bernini-hidden-prefix-trusted-receipt/0.1', passed: true,
      artifactSHA256: freshArtifactSHA256, producerSourceSHA256: executedSources(), evidence: prefixEvidence,
      sourceClosureScope: 'New resource-browser Python orchestrator plus pipeline/observer and fixed-hash native/module resources loaded in this fresh realm through prefix verification; not the old hidden/head browser harnesses'};
    produced = null;
    await prefix.dispose();
    prefix = null;
    await observer.settle();
    const barrier = capture('prefix-disposed-before-downstream', null,
      [span('ownedHidden', hidden.byteLength, 'actual typed-array extent'), span('positions', positions.byteLength), span('sourceIds', sourceIds.byteLength)],
      {ownerReleasedMemoryIds: prefixIds, gcReclamationClaimed: false, nativeOwnerResourcesDisposed: true});
    const previousIds = new Set(barrier.memory.memories.map(item => item.id));
    downstream = await createDerivedQkvHeads({file, side: payload.side, trustedProducer: trusted});
    await observer.settle();
    const headCreated = capture('downstream-constructed', downstream.stats());
    const downstreamIds = headCreated.memory.memories.filter(item => !previousIds.has(item.id) && item.roles.some(role => role.startsWith('Hike.'))).map(item => item.id);
    demand(downstreamIds.length === 4, 'Exactly four hash-attributed downstream Hike Memories');
    const attended = await downstream.run({hidden, positions, sourceIds, evidence: prefixEvidence,
      artifactSHA256: freshArtifactSHA256,
      onProgress(event) {
        progressCalls++;
        observer.snapshot('downstream-tile');
        const key = 'downstream:' + event.operator;
        if (!seenOperators.has(key)) {
          seenOperators.add(key);
          capture('downstream-first-tile:' + event.operator, downstream.stats(), event.operator === 'attention' ? attentionSpans() : headWeightSpans(),
            {progress: event, observationPoint: 'after native call; staging extents come from fixed runtime source, not allocator introspection'});
        }
      }
    });
    await observer.settle();
    capture('downstream-complete', downstream.stats(), [...headWeightSpans(), ...attentionSpans()]);
    const local = payload.localReference, composed = payload.composedReference;
    const pairs = [
      ...['q', 'k', 'v'].map(kind => ['qkv.' + kind, attended.qkv[kind], local.expected.qkv[kind], local.gates.projection]),
      ...['q', 'k'].map(kind => ['norm.' + kind, attended.norm[kind], local.expected.norm[kind], local.gates.qkNorm]),
      ['matrices', attended.matrices, local.expected.matrices, local.gates.ropeMatrix],
      ['q', attended.q, local.expected.q, local.gates.ropeApply], ['k', attended.k, local.expected.k, local.gates.ropeApply],
      ['v', attended.v, local.expected.v, local.gates.projection],
      ['context-local', attended.attention, local.expected.attention, local.gates.allHeadContext],
      ['context-composed', attended.attention, composed.expected.attention, local.gates.composedPrefixToContext]
    ];
    const headComparisons = {};
    for (const [name, actual, expected, gate] of pairs) headComparisons[name] = await compare(actual, expected, gate);
    for (const kind of ['q', 'k', 'v']) {
      const expected = local.ranges.find(item => item.key === 'blocks.0.self_attn.' + kind + '.weight');
      const actual = attended.evidence.sourceWeights[kind];
      demand(actual.rawSHA256 === expected.rawSHA256 && actual.decodedF32SHA256 === expected.decodedF32SHA256 &&
        attended.evidence.parameters[kind + 'Bias'].decodedF32SHA256 === expected.biasF32SHA256, 'Independent downstream weight/bias bytes');
    }
    for (const kind of ['q', 'k']) demand(attended.evidence.parameters[kind + 'Norm'].decodedF32SHA256 === local.ranges.find(item => item.key === 'blocks.0.self_attn.norm_' + kind + '.weight').decodedF32SHA256, 'Independent norm parameter bytes');
    const downstreamStats = downstream.stats();
    await downstream.dispose();
    downstream = null;
    await observer.settle();
    const retainedOutputs = [
      ...Object.entries(attended.qkv).map(([name, value]) => span('callerOutput.qkv.' + name, value.byteLength, 'actual caller-owned typed-array extent, retained after native dispose')),
      ...Object.entries(attended.norm).map(([name, value]) => span('callerOutput.norm.' + name, value.byteLength, 'actual caller-owned typed-array extent, retained after native dispose')),
      ...['matrices', 'q', 'k', 'v', 'attention'].map(name => span('callerOutput.' + name, attended[name].byteLength, 'actual caller-owned typed-array extent, retained after native dispose')),
      span('callerHidden', hidden.byteLength, 'actual typed-array extent'), span('callerPositions', positions.byteLength), span('callerSourceIds', sourceIds.byteLength),
      span('freshArtifactJSONStringUTF8', new TextEncoder().encode(privateArtifactText).byteLength, 'serialization extent; JS heap bytes remain unknown'),
      span('freshArtifactNumberArrayJSHeap', null, '10248 Number elements; allocator extent unknown'),
      span('privateReferenceParsedJSHeap', null, 'three parsed private reference objects remain held by harness')
    ];
    const final = capture('downstream-disposed', null, retainedOutputs,
      {ownerReleasedMemoryIds: downstreamIds, gcReclamationClaimed: false, callerOwnedOutputsRetained: true});
    const ortMemories = final.memory.memories.filter(item => item.roles.includes('ORT'));
    demand(ortMemories.length === 1 && ortMemories[0].moduleSHA256 !== null, 'One shared hash-attributed ORT Memory');
    const prefixActive = prefixCompleted.memory.memories.filter(item => prefixIds.includes(item.id));
    const downstreamPhase = phases.find(item => item.phase === 'downstream-complete');
    const downstreamActive = downstreamPhase.memory.memories.filter(item => downstreamIds.includes(item.id));
    const sumCapacity = items => items.reduce((total, item) => total + item.capacityBytes, 0);
    demand(sumCapacity(prefixActive) === prefixEvidence.resources.hikeMemoryBytes, 'Observed prefix capacity matches four owner Hike Memories');
    const downstreamHikeBytes = attended.evidence.resources.sourceHikeMemoryBytes + attended.evidence.resources.normHikeMemoryBytes + attended.evidence.resources.ropeHikeMemoryBytes + attended.evidence.resources.attentionHikeMemoryBytes;
    demand(sumCapacity(downstreamActive) === downstreamHikeBytes, 'Observed downstream capacity matches four owner Hike Memories');
    demand(observer.diagnostics().hashFailures === 0 && observer.diagnostics().observationFailures === 0 &&
      final.memory.unknownModuleCount === 0 && observer.diagnostics().memoryImportObservationComplete === true,
      'Complete native hash and import Memory attribution required');
    return {schemaVersion: 'bernini-n2-resource-observer/0.1', passed: true, side: payload.side, privateArtifactText,
      freshArtifactSHA256, freshProducerReceipt: trusted, prefixComparisons, headComparisons, phases,
      topology: {prefix: {ortSessions: 2, hikeMemories: 4, activeHikeMemoryIds: prefixIds, observedHikeCapacityBytes: sumCapacity(prefixActive)},
        downstream: {ortSessions: 2, hikeMemories: 4, activeHikeMemoryIds: downstreamIds, observedHikeCapacityBytes: sumCapacity(downstreamActive)},
        distinctORTMemoryCount: ortMemories.length, sessionCountIsMemoryCount: false, serialOwnerBarrier: true},
      ORTLinearMemoryCapacity: {unit: 'bytes', byIdentity: ortMemories.map(item => ({id: item.id, capacityBytes: item.capacityBytes, highWaterBytes: item.highWaterBytes})),
        allocatorLiveBytes: null, sessionAllocatedBytes: null, totalPeakBytes: null},
      stagingAndCopy: {prefix: prefixEvidence.resources, downstream: attended.evidence.resources,
        actualPrefixCounters: prefixEvidence.after, actualDownstreamCounters: attended.evidence.after,
        downstreamFinalStats: downstreamStats, summedHostLiveBytes: null,
        namedSpanScope: 'Per-phase source-derived extents may alias or occur at different instants. No sum is a measured host peak. ORT allocator copies/GC/File backing remain unknown.',
        privateArtifactJSONStringRetained: {utf8Bytes: new TextEncoder().encode(privateArtifactText).byteLength, jsHeapBytes: null}},
      harnessHostRetention: {privateReferenceParsedNumberArrays: true, privateReferenceJSHeapBytes: null,
        freshArtifactNumberArrayElements: hidden.length + positions.length + sourceIds.length, freshArtifactNumberArrayJSHeapBytes: null,
        sourceFingerprintByteCopiesPeakBytes: null,
        scope: 'Caller inputs, three private reference JSON objects, fresh artifact number arrays/string and observer copies coexist with operators. JSON UTF8 sizes are recorded by Python anchors; JS heap retention/GC is unmeasured.'},
      localReferenceReuse: {sameActualHiddenBits: true, priorArtifactSHA256: payload.priorArtifactSHA256,
        freshArtifactSHA256, inputHiddenSHA256: prefixEvidence.hiddenSHA256, composedReferenceUsesIndependentPrefix: true},
      observer: {...observer.diagnostics(), boundedProgressObservations: progressCalls},
      actualExecutedSourceSHA256: executedSources(),
      actualExecutedSourceScope: 'New orchestration source and fixed-hash module/WASM resources loaded in this fresh realm; loading a module does not mean every exported function was called',
      instrumentationOverhead: {moduleByteFingerprintCopies: true, streamingResponseCloneMayCopy: true,
        peakBytes: null, nativeThroughputBenchmark: false, forcedGC: false,
        scope: 'Hash snapshots/Response clones and browser/private-reference serialization add diagnostic traffic and GC pressure. Their host allocation peak is unmeasured.'},
      unknowns: {ORTAllocatorLiveBytes: null, hostAllocatorGCBytes: null, FileBackingBytes: null, referenceParsedJSHeapBytes: null, totalPeakBytes: null},
      acceptance: {naturalN2Only: true, originalGridNumericalVerified: false, originalWorkflowInputsVerified: false,
        productionHiddenVerified: false, originalProductionPrecisionVerified: false, fullBlockVerified: false,
        modelInference: false, load: 'NOT_READY', predict: 'NOT_READY', sample: 'NOT_READY'}};
  } finally {
    await releaseObservation({prefix, downstream, observer});
  }
}
