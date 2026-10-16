export const BUILD_ID = 'compute-unity-b4';
export const WASM_SHA256 = 'b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad';
export const MAX_MASKS = 262144;
export function validateRequest(input,{copy=true}={}) {
  if (!input || input.protocolVersion !== 1 || input.taskType !== 'ft-magnitude-batch' || input.taskVersion !== 1) throw new TypeError('対応していないprotocol・task・versionです');
  if (typeof input.jobId !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(input.jobId)) throw new TypeError('jobIdは1〜64文字の英数字・_.:-で指定してください');
  if (!Number.isSafeInteger(input.inputRevision) || input.inputRevision < 0) throw new TypeError('inputRevisionは0以上の整数で指定してください');
  const {masks, weights} = input.payload ?? {};
  if (!Array.isArray(weights) || weights.length < 1 || weights.length > 5 || Array.from(weights).some(x => typeof x !== 'number' || !Number.isFinite(x) || x <= 0) || !Number.isFinite(weights.reduce((a,b) => a+b,0))) throw new RangeError('weightsは合計が有限になる1〜5個の正の数で指定してください');
  if (!Array.isArray(masks) || masks.length > MAX_MASKS) throw new RangeError('masksの件数が不正です');
  for (const mask of masks) if (!Number.isInteger(mask) || mask < 0 || mask >= 2 ** weights.length) throw new RangeError('masksの値域が不正です');
  const timeoutMs = input.limits?.timeoutMs ?? 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new RangeError('timeoutMsは1〜30000で指定してください');
  return {protocolVersion:1,jobId:input.jobId,inputRevision:input.inputRevision,taskType:input.taskType,taskVersion:1,payload:{masks:copy?masks.slice():masks,weights:copy?weights.slice():weights},limits:{timeoutMs}};
}
