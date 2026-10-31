/** Receiver-only compatibility shim. Official management admission is not
 * implemented here. Production owner exports raw DATA; this test harness owns
 * evaluator injection and the historical eight mutation probes. */
import {createLoraManagementAdmissionInputs, catalogSourceAlias} from '../../docs/shared/inference/lora/management-admission-inputs.mjs';
export {catalogSourceAlias};
const clone = structuredClone;
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
const NUMERIC_SCOPE = 'p3:actual-q16-projection';
export function createP3NormEdge({evaluateEdge, ...options} = {}) {
  requireValue(typeof evaluateEdge === 'function', 'Actual management evaluator required');
  // Historical callers provided a stable outside selection/resource callback.
  // This explicit legacy shim fallback is not an official staging-context API.
  const data = createLoraManagementAdmissionInputs({...options, isPublishedCurrent: options.isPublishedCurrent ?? options.isCurrent}), referenceSet = options.referenceSet,
    p = clone(options.plan), inspection = options.inspection;
  let checkpointInput = null;
  function result(phase, decisions) { const description = data.describe();
    return {phase, coverage: 'PARTIAL', generationReady: false, baseKind: options.baseKind, decisions,
      sourceAliasPolicy: {scope: 'external-referenceContext-only', catalogRepository: 'Kushyameln01/kushyameln-works', nativePinsPreserved: true},
      consumerBinding: description.consumerBinding, nativeSourcePins: description.nativeSourcePins}; }
  function copyInput(q) { const {referenceSet: ignored, ...context} = q.referenceContext;
    return {...clone({...q, referenceContext: context}), referenceContext: {...clone(context), referenceSet}}; }
  function preflight() { return result('preflight', data.preflightInputs().map(({input, ...patch}) => ({...patch, decision: evaluateEdge(input)}))); }
  function checkpoint(receipts) { const input = data.checkpointInputs(receipts); checkpointInput = input;
    return result('checkpoint', [{decision: evaluateEdge(input)}]); }
  function postpublication(receipts) { return result('postpublication', [{decision: evaluateEdge(data.postpublicationInputs(receipts))}]); }
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
  return Object.freeze({preflight, checkpoint, postpublication, negativeProbes, describe: data.describe});
}
