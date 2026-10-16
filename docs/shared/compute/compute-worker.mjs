import {validateRequest, BUILD_ID, WASM_SHA256} from './protocol.mjs';
import {instantiateFtKernel} from '../ft/kernel/load-kernel.mjs';
const workerId = crypto.randomUUID();
self.onmessage = async ({data}) => {
  const identity = {jobId:data?.jobId,inputRevision:data?.inputRevision,workerId};
  const started=performance.now();
  try {
    const request=validateRequest(data);
    self.postMessage({...identity,type:'phase',phase:'loading'});
    const response=await fetch(new URL('../ft/kernel/ft-kernel.wasm',import.meta.url),{credentials:'omit'});
    if(!response.ok)throw Error('WASM読込み失敗');
    const bytes=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==WASM_SHA256)throw Error('WASM識別値が一致しません');
    const kernel=await instantiateFtKernel(bytes);
    const computeStart=performance.now();
    self.postMessage({...identity,type:'phase',phase:'computing'});
    const result=request.payload.masks.map(mask=>kernel.magnitude(mask,request.payload.weights));
    const computeEnd=performance.now();
    self.postMessage({...identity,type:'result',result,metrics:{buildId:BUILD_ID,wasmSha256:hash,loadMs:computeStart-started,computeMs:computeEnd-computeStart,computeStartEpochMs:performance.timeOrigin+computeStart,computeEndEpochMs:performance.timeOrigin+computeEnd,inputCount:result.length,logicalMinimumBytes:result.length*16+1048576,memoryMeasurement:null}});
  } catch(error) {self.postMessage({...identity,type:'error',message:error.message});}
};
