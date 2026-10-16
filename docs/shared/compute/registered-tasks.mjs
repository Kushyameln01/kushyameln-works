// Pages deployment contains only the already-public FT task; Unity is added by tasks.mjs.
import {validateRequest,WASM_SHA256} from './protocol.mjs';
import {prepareKernelModule,instantiateKernel} from './kernel.mjs';
export const inspectTaskRequest=r=>validateRequest(r,{copy:false});
export const snapshotTaskRequest=r=>({...r,payload:{masks:r.payload.masks.slice(),weights:r.payload.weights.slice()}});
export const inputBytes=r=>(r.payload.masks.length+r.payload.weights.length)*8;
export const kernelInfo=()=>({sha256:WASM_SHA256,variant:'scalar',abi:'ft-v1',key:`ft-v1:${WASM_SHA256}:scalar`});
export const resultShape=r=>({length:r.payload.masks.length});
export const validTaskResult=(t,s,r)=>Array.isArray(r)&&r.length===s.length&&Array.from(r).every(x=>typeof x==='number'&&Number.isFinite(x));
export const resultBytes=r=>r?r.length*8:0;
export const freezeTaskResult=r=>r===undefined?undefined:Object.freeze(r);
export const transferTaskInput=()=>[];
export const transferTaskResult=()=>[];
export const prepareTaskModule=prepareKernelModule;
export const instantiateTask=(r,m)=>instantiateKernel(m);
export const executeTask=(r,k)=>r.payload.masks.map(mask=>k.magnitude(mask,r.payload.weights));
export const taskInputCount=(r,v)=>v.length;
