/** Receiver-only P1/P3 assembly. This module does not implement LoRA math,
 * native mapping, an evaluator, or a transaction. All decisions come from the
 * injected fixed management evaluateEdge and actual owner/checker receipts. */
const clone = structuredClone;
const text = value => typeof value === 'string' && value.length > 0;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const json = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const same = (a, b) => json(a) === json(b);
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
const REPOSITORY = 'Kushyameln01/kushyameln-works';
const NUMERIC_SCOPE = 'p3:actual-q16-projection';
const VARIANTS = new Set(['linear-down-up', 'linear-a-b', 'additive-diff', 'additive-diff-b']);

/** The catalog uses a short repository spelling. This external P1 sidecar alias
 * preserves commit/path and never changes native source pins or receipts. */
export function catalogSourceAlias(source) {
  requireValue(source && [REPOSITORY, `https://github.com/${REPOSITORY}`].includes(source.repository)
    && /^[a-f0-9]{40}$/.test(source.commit) && text(source.path), 'Explicit fixed Works source required');
  return {repository: REPOSITORY, commit: source.commit, path: source.path};
}

export function createP3NormEdge({evaluateEdge, referenceSet, candidateSet, sourcePins, plan,
  inspection, ownerBinding, nativeRegistry = ownerBinding?.nativeRegistry, executionKernelDigest,
  gateIdentity, referenceIdentity, baseKind, environment, resourceState, isCurrent, inputKind,
  consumerBinding, readConsumerBinding,
  artifactId = `p3:selected-q-weight:${plan?.planId}`} = {}) {
  ownerBinding = ownerBinding?.owner ?? ownerBinding;
  nativeRegistry ??= ownerBinding?.nativeRegistry;
  requireValue(typeof evaluateEdge === 'function' && referenceSet?.profileRecords?.get
    && typeof isCurrent === 'function', 'Actual evaluator, verified ReferenceSet and currentness required');
  requireValue(text(consumerBinding?.namespace) && text(consumerBinding.revision)
    && text(consumerBinding.managerSessionId) && ['ownerId', 'bindingId', 'resourceGeneration'].every(k => text(consumerBinding.resourceBinding?.[k]))
    && typeof readConsumerBinding === 'function', 'Explicit outside consumer binding namespace/token, manager/resource identity and live reader required');
  const selectedConsumerBinding = clone(consumerBinding);
  requireValue(plan?.coverage === 'PARTIAL' && plan.scope === 'diagnostic-projection'
    && plan.completeAdapter === false && plan.generationReady === false, 'Actual PARTIAL native plan required');
  requireValue(ownerBinding?.connectionRegistryHash === plan.registryHash
    && ownerBinding?.nativeRegistryHash === nativeRegistry?.registryHash
    && same(ownerBinding.connectionRegistry, plan.registry)
    && nativeRegistry?.graphHash === plan.registry.graphHash
    && nativeRegistry?.modelHash === plan.registry.modelHash, 'Actual dual-registry plan binding required');
  requireValue(hex(plan.sourceSha256) && inspection?.tensors && hex(executionKernelDigest)
    && hex(gateIdentity?.sha256) && text(gateIdentity.gateId)
    && ['absolute', 'relative'].every(k => Number.isFinite(gateIdentity.tolerance?.[k]) && gateIdentity.tolerance[k] >= 0)
    && hex(referenceIdentity?.sha256) && hex(referenceIdentity.expectedOutputSha256) && text(referenceIdentity.referenceId)
    && text(baseKind) && text(environment) && resourceState
    && ['local-file', 'local-blob', 'injected-local-source'].includes(inputKind), 'Actual source/header, local-input kind, gate/reference and resource declarations required');
  const nativePins = clone(sourcePins), pins = Object.fromEntries(['sdk', 'adapter', 'kernel', 'diffusion']
    .map(key => [key, catalogSourceAlias(sourcePins[key])])), native = clone(nativeRegistry), p = clone(plan);
  const gateRef = {...clone(gateIdentity), sourceRef: catalogSourceAlias(gateIdentity.sourceRef)};
  const referenceRef = {sourceRef: catalogSourceAlias(referenceIdentity.sourceRef), sha256: referenceIdentity.sha256};
  const weight = native.targets.find(t => t.weightId === 'q.weight'), bias = native.targets.find(t => t.weightId === 'q.bias');
  requireValue(weight && bias && same(weight.shape, [16, 5120]) && same(bias.shape, [16])
    && same(weight.fullShape, [5120, 5120]) && weight.binding.kind === 'runtime-input'
    && bias.binding.kind === 'hike-parameter', 'Actual Q16 descriptors with distinct bindings required');
  const selectionRegion = p.operations.map(op => ({key: op.key, slice: clone(op.slice)}));
  for (const op of p.operations) {
    requireValue(VARIANTS.has(op.variant) && op.names.every(name => inspection.tensors[name])
      && same(op.fullShape, p.registry.targets.find(t => t.key === op.key)?.shape), 'Unsupported or unbound selected patch');
  }
  const profileRef = native.executionProfileId, producerRef = `lora:${p.sdkInstanceId}`,
    consumerRef = `diffusion:${native.registryHash}`, meaning = 'works:selected-q-weight-f32:v1';
  // This receiver descriptor describes actual prepared SDK weight bytes going
  // into the Diffusion consumer. The SDK does not emit the consumer's 16-vector.
  const semantics = {schemaId: 'works:receiver-q16-weight', schemaVersion: '1', spaceId: 'selected-q-weight', unit: 'model-weight-value', normalization: 'none'};
  const tensor = {dtype: 'float32', shape: clone(weight.shape), axes: ['O', 'I'], nativeMeaning: meaning, dataRef: 'native:prepared-q-weight'};
  const execution = {nativeProfileId: native.executionProfileId, weightShape: clone(weight.shape), biasShape: clone(bias.shape),
    activationShape: [weight.shape[1]], outputShape: clone(bias.shape), fullWeightShape: clone(weight.fullShape),
    originalTarget: weight.originalKey, bindings: {weight: `${weight.binding.kind}:${weight.binding.name}`, bias: `${bias.binding.kind}:${bias.binding.name}`},
    coverage: 'PARTIAL', graphSHA256: native.graphHash, kernelDigest: executionKernelDigest};
  const numericRequirement = {scope: NUMERIC_SCOPE, recordId: 'EXEC-BERNINI-Q16-F32', gateRef,
    referenceRef, ownerSourceRef: pins.diffusion, kernelDigest: executionKernelDigest};
  const evidenceTarget = {artifactRef: artifactId, profileRef, coverage: 'PARTIAL', scope: p.scope,
    baseKind, referenceId: referenceIdentity.referenceId};
  const mapping = {ownerRole: 'LoRA', factory: 'createDiffusionDiagnosticAdapter',
    adapterVersion: ownerBinding.adapterVersion, duplicateMappingAllowed: false, regressionOnly: false,
    nativeRegistryHash: native.registryHash, connectionRegistryHash: p.registryHash,
    fullShape: clone(weight.fullShape), selectionRegion, sourceHash: p.sourceSha256,
    ownerBinding: {nativeRegistryHash: ownerBinding.nativeRegistryHash, connectionRegistryHash: ownerBinding.connectionRegistryHash},
    planBinding: {fullShape: clone(weight.fullShape), selectionRegion: clone(selectionRegion), sourceHash: p.sourceSha256}};
  const port = (bindingRef, owner, sourceRef, version, build) => ({portId: bindingRef, bindingRef, owner, sourceRef,
    nativeAPI: {version, build, transport: 'direct', entrypoint: sourceRef.path}, artifactKind: 'tensor', semantics: clone(semantics), profileRef,
    tensor: {dtypes: ['float32'], axes: clone(tensor.axes), shape: clone(tensor.shape)}, requiredMetadata: ['/meaning'], requiredIdentities: [],
    ownershipModes: ['copy'], transports: ['direct'], allowedAdapterRefs: [], requiredExtensionSchemas: []});
  const producerPort = port(producerRef, producerRef, pins.sdk, p.contractVersion, p.buildId);
  const consumerPort = port(consumerRef, consumerRef, pins.diffusion, native.schemaVersion, executionKernelDigest);
  const contractRefs = [...new Set([producerPort, consumerPort].flatMap(port => [port.sourceRef.commit, port.nativeAPI.version, port.nativeAPI.build]))];
  const conditions = {...clone(tensor), coverage: 'PARTIAL', scope: p.scope, baseKind,
    referenceId: referenceIdentity.referenceId, environment};
  delete conditions.dataRef; delete conditions.axes; delete conditions.nativeMeaning;
  const evidence = (scope, evidenceId, data = {}) => ({evidenceId, scope, result: 'pass', subjectRefs: [producerRef, consumerRef],
    contractRefs: clone(contractRefs), artifactRef: artifactId, profileRef, inputConditions: clone(conditions), ...data});
  function activeBindings() {
    const current = isCurrent() === true;
    const observed = readConsumerBinding();
    return {
      producer: {bindingRef: producerRef, valid: current, ownerId: producerRef,
        revisionNamespace: 'native-sdk-input', currentRevision: p.localInputRevision, expectedRevision: p.localInputRevision},
      consumer: {bindingRef: consumerRef, valid: current && same(observed, selectedConsumerBinding), ownerId: consumerRef,
        revisionNamespace: selectedConsumerBinding.namespace, currentRevision: observed?.revision ?? null,
        expectedRevision: selectedConsumerBinding.revision, outsideBinding: clone(selectedConsumerBinding)}
    };
  }
  function input(normIds, producerDeclaration = {}) {
    return {producerPort: clone(producerPort), consumerPort: clone(consumerPort),
      artifact: {contractVersion: 'works-module-contract/1.0-draft.1', artifactId, kind: 'tensor',
        native: {schemaId: 'works:receiver-q16-metadata', schemaVersion: '1', payloadRef: tensor.dataRef,
          metadata: {meaning, fullShape: clone(weight.fullShape), selectedRegion: clone(selectionRegion),
            biasBundle: {weightId: bias.weightId, shape: clone(bias.shape), fullShape: clone(bias.fullShape), binding: clone(bias.binding)},
            consumerOutputShape: clone(execution.outputShape), descriptorScope: 'external-receiver-weight-edge'}},
        semantics: clone(semantics), profileRef, tensor: clone(tensor),
        provenance: {producerRefs: [], consumerBindings: [], transformTraceRefs: []}, lineage: {inputs: [p.sourceSha256], sourceFrames: []},
        snapshotId: null, ownership: {ownerId: producerRef, mode: 'copy'}, extensions: {}}, adapters: [],
      registry: {schemas: [{schemaId: semantics.schemaId, schemaVersion: '1', nativeMeanings: [meaning]}, {schemaId: 'works:receiver-q16-metadata', schemaVersion: '1'}], roles: ['diagnostic-owner']},
      implementationState: {producer: {bindingRef: producerRef, state: 'implemented', roles: ['diagnostic-owner'], operationId: 'prepare'},
        consumer: {bindingRef: consumerRef, state: 'implemented', roles: ['diagnostic-owner'], operationId: 'validate'}}, requiredScopes: [], evidence: [],
      resourceState: clone(resourceState), activeBindings: activeBindings(),
      referenceContext: {referenceSet, normIds: [...normIds], candidateSet: clone(candidateSet),
        identityBindings: [{side: 'producer', module: 'lora', loadedSourceRef: clone(pins.sdk), kernelDigest: sourcePins.kernel.sha256, byteLength: sourcePins.kernel.byteLength},
          {side: 'consumer', module: 'diffusion', loadedSourceRef: clone(pins.diffusion)}],
        profileBindings: [], nativeDeclarations: {producer: clone(producerDeclaration), consumer: clone(execution)}, mapping: clone(mapping)}};
  }
  function result(phase, decisions) {
    return {phase, coverage: 'PARTIAL', generationReady: false, baseKind, decisions,
      sourceAliasPolicy: {scope: 'external-referenceContext-only', catalogRepository: REPOSITORY,
        nativePinsPreserved: true}, consumerBinding: clone(selectedConsumerBinding), nativeSourcePins: clone(nativePins)};
  }
  let checkpointInput = null, checkpointEvidence = null;
  function preflight() {
    const decisions = [];
    for (const op of p.operations) for (const dtype of new Set(op.names.map(name => inspection.tensors[name].dtype))) {
      const declaration = {loaderPolicyId: p.loaderPolicyId, variant: op.variant, sourceDtype: dtype,
        targetRank: op.fullShape.length, strength: p.strength, inputKind, sourceHash: p.sourceSha256};
      const q = input(['N-IDENTITY', 'N-LOADER', 'N-MAPPING'], declaration);
      q.referenceContext.profileBindings = ['LOAD-COMFY-LINEAR-DIFF', 'LOAD-LOCAL-SAFETENSORS'].map(recordId => ({recordId, side: 'producer'}));
      decisions.push({patch: op.key, variant: op.variant, sourceDtype: dtype, declaration,
        loaderDetails: {rank: op.rank ?? null, alpha: op.alpha ?? null, alphaName: op.alphaName ?? null,
          effectiveScale: op.scale, strength: p.strength, names: clone(op.names), fullShape: clone(op.fullShape), slice: clone(op.slice)},
        decision: evaluateEdge(q)});
    }
    return result('preflight', decisions);
  }
  function checkpoint({nativeValidation, weightBiasEvidence} = {}) {
    const v = nativeValidation?.nativeValidation ?? nativeValidation, receipt = v?.evidence?.nativeReceipt;
    requireValue(v?.contractVersion === p.contractVersion && v.valid === true && v.planId === p.planId && v.registryHash === p.registryHash
      && v.sourceSha256 === p.sourceSha256 && v.coverage === 'PARTIAL' && v.scope === p.scope
      && receipt?.schemaVersion === 'bernini-diagnostic-validation/0.1' && receipt.valid === true
      && receipt.scope === 'PARTIAL' && receipt.modelInference === false && receipt.registryHash === native.registryHash
      && receipt.graphHash === native.graphHash && receipt.modelHash === native.modelHash
      && receipt.expectedSHA256 === referenceIdentity.expectedOutputSha256 && same(receipt.tolerance, gateIdentity.tolerance)
      && receipt.evidence?.hikeWasmSHA256 === executionKernelDigest && receipt.evidence?.graphSHA256 === native.graphHash
      && receipt.failedIndices?.length === 0 && Number.isFinite(receipt.maxAbsoluteError),
    'Actual selected native validation receipt required');
    const w = weightBiasEvidence;
    requireValue(text(w?.evidenceId) && w.referenceId === referenceIdentity.referenceId
      && w.referenceSha256 === referenceIdentity.sha256 && w.planId === p.planId
      && w.sourceSha256 === p.sourceSha256 && w.strength === p.strength
      && w.nativeRegistryHash === native.registryHash && w.connectionRegistryHash === p.registryHash
      && w.weightComparison?.passed === true && w.weightComparison.compared === 81920
      && w.biasComparison?.passed === true && w.biasComparison.compared === 16
      && hex(w.weightArtifact?.sha256) && hex(w.biasArtifact?.sha256),
    'Actual independent comparison of every selected weight and bias required');
    const q = input(['N-IDENTITY', 'N-MAPPING', 'N-NUMERIC', 'N-EVIDENCE']);
    q.referenceContext.profileBindings = [{recordId: 'EXEC-BERNINI-Q16-F32', side: 'consumer'}];
    q.referenceContext.numericRequirements = [clone(numericRequirement)];
    q.referenceContext.evidenceTarget = clone(evidenceTarget);
    const delegation = {checker: 'owner-validation', receiptRef: w.evidenceId, target: clone(evidenceTarget)};
    q.referenceContext.delegations = {'N-EVIDENCE': delegation};
    q.evidence.push(evidence(NUMERIC_SCOPE, `native-validation:${receipt.candidateId}`, {
      normBinding: {catalogSha256: referenceSet.catalogSha256, ...clone(numericRequirement)}, ownerReceipt: clone(v)}));
    q.evidence.push(evidence('norm:N-EVIDENCE', w.evidenceId, {delegation: clone(delegation),
      normBinding: {catalogSha256: referenceSet.catalogSha256}, ownerReceipt: clone(w)}));
    checkpointInput = q; checkpointEvidence = clone(w);
    return result('checkpoint', [{decision: evaluateEdge(q)}]);
  }
  function copyInput(q) { const {referenceSet: ignored, ...context} = q.referenceContext;
    return {...clone({...q, referenceContext: context}), referenceContext: {...clone(context), referenceSet}}; }
  function postpublication({snapshotTarget, publication, queueReports, ownerState, ownerValidationRef, artifactPackageReceipt, artifactPackageRecord} = {}) {
    requireValue(checkpointInput && publication?.state === 'SNAPSHOT_PUBLISHED' && publication.generationReady === false
      && publication.cleanupRequired !== true
      && snapshotTarget?.snapshotId === publication.snapshot?.snapshotId && snapshotTarget.snapshotHash === publication.snapshot.snapshotHash
      && snapshotTarget.managerSessionId === publication.snapshot.managerSessionId
      && snapshotTarget.managerRevision === publication.snapshot.managerRevision
      && snapshotTarget.managerSessionId === selectedConsumerBinding.managerSessionId
      && same(snapshotTarget.resourceBinding, selectedConsumerBinding.resourceBinding)
      && same(snapshotTarget.localRevisionBindings, {sdkInstanceId: p.sdkInstanceId, localInputRevision: p.localInputRevision, localApplicationRevision: p.localApplicationRevision})
      && publication.snapshot.stepBindings.some(step => step.stepId === snapshotTarget.stepId && step.operationId === snapshotTarget.operationId
        && same(step.resourceBinding, snapshotTarget.resourceBinding) && same(step.localRevisionBindings, snapshotTarget.localRevisionBindings))
      && same(ownerState?.target, snapshotTarget) && ownerState.published === true && ownerState.originalTerminal === true
      && ownerState.queueReleased === true && ownerState.preparedReleased === true
      && ownerState.nativePhaseTarget?.managerSessionId === snapshotTarget.managerSessionId
      && ownerState.nativePhaseTarget.managerRevision === snapshotTarget.managerRevision
      && same(ownerState.nativePhaseTarget.resourceBinding, snapshotTarget.resourceBinding)
      && same(ownerState.stageEnvelope?.management?.target, ownerState.nativePhaseTarget)
      && same(ownerState.stageEnvelope?.management?.localRevisionBindings, snapshotTarget.localRevisionBindings)
      && ownerState.stageEnvelope?.receipt?.planId === p.planId
      && ownerState.stageEnvelope.receipt.state === 'CONSUMER_APPLIED'
      && ownerState.stageEnvelope.receipt.coverage === 'PARTIAL' && ownerState.stageEnvelope.receipt.scope === p.scope
      && ownerState.stageEnvelope.receipt.generationReady === false && ownerState.stageEnvelope.receipt.snapshotPublished === false
      && ownerState.stageEnvelope.receipt.ownership?.kind === 'independent-copy' && text(ownerState.stageEnvelope.receipt.ownership.ownerId)
      && ownerState.stageEnvelope.receipt.sourceSha256 === p.sourceSha256
      && ownerState.stageEnvelope.receipt.registryHash === p.registryHash
      && same(ownerState.stageEnvelope.receipt.validation, checkpointInput.evidence.find(e => e.scope === NUMERIC_SCOPE).ownerReceipt)
      && Array.isArray(queueReports) && queueReports.length > 0
      && ownerValidationRef === checkpointEvidence.evidenceId, 'Actual published target, native revisions, terminal queue and prior owner validation required');
    const nativeStates = publication.nativeStates?.filter(state => state.stepId === snapshotTarget.stepId);
    requireValue(nativeStates?.length === 1 && nativeStates[0].state === ownerState.stageEnvelope.receipt.state
      && same(nativeStates[0].ownership, ownerState.stageEnvelope.receipt.ownership),
    'Actual published native state and independent-copy owner must match the exact stage receipt');
    const qt = ownerState.queueTarget, queueRecord = queueReports.find(r => r.id === qt?.invocationId);
    requireValue(queueRecord && qt.revision === snapshotTarget.managerRevision
      && qt.ownerId === snapshotTarget.resourceBinding.ownerId && qt.bindingId === snapshotTarget.resourceBinding.bindingId
      && qt.resourceGeneration === snapshotTarget.resourceBinding.resourceGeneration
      && ['requestId', 'ownerId', 'resourceGeneration', 'revision', 'activeToken'].every(k => queueRecord[k] === qt[k])
      && queueRecord.resourceBinding === qt.bindingId && queueRecord.originalTerminal === true
      && queueRecord.resourceReleased === true && queueRecord.reusable === true && queueRecord.resultAccepted === true,
    'Exact native queue invocation terminal/release record required');
    const q = copyInput(checkpointInput), target = clone(snapshotTarget), receiptRef = `snapshot:${target.snapshotId}:${target.snapshotHash}`;
    // A successful checkpoint cannot cache permission for a later publication.
    // SDK revisions and the outside consumer selection token are distinct.
    q.activeBindings = activeBindings();
    q.referenceContext.normIds.push('N-TRANSACTION'); q.referenceContext.managerState = {target};
    const delegation = {checker: 'snapshot.mjs', receiptRef, target};
    q.referenceContext.delegations['N-TRANSACTION'] = delegation;
    q.evidence.push(evidence('norm:N-TRANSACTION', receiptRef, {delegation: clone(delegation),
      normBinding: {catalogSha256: referenceSet.catalogSha256}, ownerReceipt: {publication: clone(publication),
        ownerState: clone(ownerState), queueRecord: clone(queueRecord)}}));
    if (artifactPackageReceipt !== undefined) {
      requireValue(artifactPackageReceipt?.packageVersion === 'works-artifact-package/1.0-draft.1'
        && artifactPackageRecord?.descriptor?.artifactId === artifactId
        && artifactPackageRecord.descriptor.profileRef === profileRef,
      'Actual E4 receipt/readback record for this selected-weight artifact required; an output-vector package is a separate edge');
      const artifactDelegation = {checker: 'package.mjs', receiptRef: `package:${artifactPackageReceipt.packageId}`,
        target: {artifactRef: artifactId, profileRef}, receipt: clone(artifactPackageReceipt)};
      q.referenceContext.normIds.push('N-ARTIFACT'); q.referenceContext.delegations['N-ARTIFACT'] = artifactDelegation;
      q.evidence.push(evidence('norm:N-ARTIFACT', artifactDelegation.receiptRef, {delegation: clone(artifactDelegation),
        normBinding: {catalogSha256: referenceSet.catalogSha256}, packageReceipt: clone(artifactPackageReceipt)}));
    }
    return result('postpublication', [{decision: evaluateEdge(q)}]);
  }
  function negativeProbes() {
    requireValue(checkpointInput, 'Real checkpoint required before negative probes');
    const probes = [];
    const probe = (id, expected, mutate) => { const q = copyInput(checkpointInput); mutate(q);
      probes.push({id, expected, decision: evaluateEdge(q)}); };
    probe('missing-numeric-receipt', {compatibility: 'COMPATIBLE', validation: 'not-verified', readiness: 'blocked'}, q => {q.evidence = q.evidence.filter(e => e.scope !== NUMERIC_SCOPE);});
    probe('wrong-execution-graph', {compatibility: 'INCOMPATIBLE'}, q => {q.referenceContext.nativeDeclarations.consumer.graphSHA256 = '0'.repeat(64);});
    probe('wrong-source-hash', {compatibility: 'INCOMPATIBLE'}, q => {q.referenceContext.mapping.planBinding.sourceHash = '0'.repeat(64);});
    probe('wrong-selection-region', {compatibility: 'INCOMPATIBLE'}, q => {q.referenceContext.mapping.planBinding.selectionRegion[0].slice.startRow++;});
    probe('wrong-loaded-source', {compatibility: 'INCOMPATIBLE'}, q => {q.referenceContext.identityBindings[0].loadedSourceRef.commit = '0'.repeat(40);});
    probe('old-kernel', {compatibility: 'INCOMPATIBLE'}, q => {q.referenceContext.identityBindings[0].byteLength = 4919;});
    probe('missing-loader-policy', {compatibility: 'UNVERIFIED'}, q => {
      q.referenceContext.normIds.push('N-LOADER'); q.referenceContext.profileBindings.push({recordId: 'LOAD-COMFY-LINEAR-DIFF', side: 'producer'});
      const op = p.operations[0]; q.referenceContext.nativeDeclarations.producer = {variant: op.variant, sourceDtype: inspection.tensors[op.names[0]].dtype, targetRank: op.fullShape.length, strength: p.strength};
    });
    probe('unknown-required-norm', {compatibility: 'UNVERIFIED'}, q => {q.referenceContext.normIds.push('N-FUTURE-REQUIRED');});
    return {...result('negative-probes', []), numericScope: NUMERIC_SCOPE, probes};
  }
  return Object.freeze({preflight, checkpoint, postpublication, negativeProbes,
    describe() { return {coverage: 'PARTIAL', generationReady: false, execution: clone(execution), mapping: clone(mapping),
      numericRequirement: clone(numericRequirement), nativeSourcePins: clone(nativePins), sourceAliasPolicy: 'external-referenceContext-only'}; }});
}
