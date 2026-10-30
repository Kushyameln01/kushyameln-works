// Internal bounded real-weight linear candidate; no numerical JavaScript fallback.
export const MAX_ROWS=16,MAX_COLS=5120,MAX_CODES=256;
export function createLinearKernel(module){
 if(!(module instanceof WebAssembly.Module)||WebAssembly.Module.imports(module).length)throw TypeError('Expected no-import Hike module');
 let instance=new WebAssembly.Instance(module,{}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.Fp8Decode!=='function'||typeof instance.exports.Fp8Linear!=='function')throw Error('Hike linear ABI missing');
 const start=memory.buffer.byteLength,qPtr=start,biasPtr=qPtr+MAX_ROWS*MAX_COLS,xPtr=biasPtr+MAX_ROWS*4,outPtr=xPtr+MAX_COLS*4;
 const arenaBytes=outPtr+MAX_CODES*4-start;
 memory.grow(Math.ceil(arenaBytes/65536));
 let disposed=false,calls=0,inputCopyBytes=0,outputCopyBytes=0;
 const active=()=>{if(disposed)throw Error('Linear kernel disposed');};
 const floats=(v,n)=>{if(!(v instanceof Float32Array)||v.length!==n||!v.every(Number.isFinite))throw TypeError('Finite Float32Array with exact shape required');};
 const qbytes=(v,n)=>{if(!(v instanceof Uint8Array)||v.length!==n)throw TypeError('Uint8Array with exact shape required');};
 function dispatch(q,bias,x,count,invoke){
  active();const b=new Uint8Array(memory.buffer);b.fill(0,start,start+arenaBytes);b.set(q,qPtr);
  if(bias)new Float32Array(memory.buffer,biasPtr,bias.length).set(bias);
  if(x)new Float32Array(memory.buffer,xPtr,x.length).set(x);
  inputCopyBytes+=q.byteLength+(bias?.byteLength??0)+(x?.byteLength??0);
  try{const rc=invoke();if(rc!==0)throw Error('Hike linear rejected input: '+rc);calls++;
   const result=new Float32Array(memory.buffer,outPtr,count).slice();
   if(!result.every(Number.isFinite))throw Error('Non-finite Hike output');outputCopyBytes+=result.byteLength;return result;
  }finally{new Uint8Array(memory.buffer).fill(0,start,start+arenaBytes);}
 }
 return {decode(q){active();if(!(q instanceof Uint8Array)||q.length<1||q.length>MAX_CODES)throw RangeError('Decode count');return dispatch(q,null,null,q.length,()=>instance.exports.Fp8Decode(qPtr,q.length,outPtr,MAX_CODES));},
 linear(q,rows,cols,scale,bias,x){active();if(!Number.isInteger(rows)||rows<1||rows>MAX_ROWS||!Number.isInteger(cols)||cols<1||cols>MAX_COLS)throw RangeError('Tile dimensions');qbytes(q,rows*cols);floats(bias,rows);floats(x,cols);if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(Math.fround(scale))||Math.fround(scale)<=0)throw TypeError('Positive finite f32 scale required');
  return dispatch(q,bias,x,rows,()=>instance.exports.Fp8Linear(qPtr,rows,cols,scale,biasPtr,xPtr,outPtr,MAX_ROWS));},
 stats(){active();return {memoryBytes:memory.buffer.byteLength,arenaBytes,calls,inputCopyBytes,outputCopyBytes,workspaceReused:true,imports:0};},
 dispose(){disposed=true;instance=null;memory=null;}
 };
}
