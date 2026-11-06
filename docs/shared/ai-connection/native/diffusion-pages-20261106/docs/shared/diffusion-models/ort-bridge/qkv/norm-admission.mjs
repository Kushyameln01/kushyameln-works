// Candidate-specific admission before the reused F32 RMSNorm. This is a
// value-range check, not a second implementation of the model reduction.
// 5120 * (1e16)^2 = 5.12e35, leaving over two orders of magnitude below
// maximum finite F32, including sequential-rounding margin.
export const QK_NORM_MAX_ABS=1e16;
export function requireQkNormRange(value){
 if(!(value instanceof Float32Array)||value.length!==81920||!(value.buffer instanceof ArrayBuffer)||value.byteOffset!==0||value.byteLength!==value.buffer.byteLength)throw TypeError('Exact owned full-width norm input required');
 for(const x of value)if(!Number.isFinite(x)||Math.abs(x)>QK_NORM_MAX_ABS)throw RangeError('P4 diagnostic QK norm input exceeds admitted finite range');
 return value;
}
