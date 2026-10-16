// Registered finite alignment job. All arrays are packed, bounded, owned snapshots.
import {ALIGNMENT_KERNEL,prepareAlignmentKernel} from './alignment.mjs';
export {prepareAlignmentKernel};
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const policyKeys=['maxCost','minGap','minTexture','minMatches','minInlierRatio','maxFbError','consensusTolerance'];
export function inspectAlignmentPayload(p={}){
 const {width,height}=p,n=width*height;
 if(!int(width,1,1048576)||!int(height,1,1048576)||n>1048576||p.stride!==width*4)throw RangeError('ALIGNMENT_DIMENSIONS');
 for(const [key,size] of [['referenceCodes',n],['currentCodes',n],['data',n*4]]){
  const value=p[key];if(!(value instanceof Uint8Array)||!(value.buffer instanceof ArrayBuffer)||value.buffer.resizable||value.byteLength!==size)throw TypeError('ALIGNMENT_BYTES');
  new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 }
 const {roi,policy}=inspectAlignmentGeometry(p);
 return {width,height,stride:width*4,referenceCodes:p.referenceCodes,currentCodes:p.currentCodes,data:p.data,roi,searchRadius:p.searchRadius,policy};
}
export function snapshotAlignment(p){return {...p,roi:{...p.roi},policy:{...p.policy},referenceCodes:new Uint8Array(p.referenceCodes),currentCodes:new Uint8Array(p.currentCodes),data:new Uint8Array(p.data)};}
export const alignmentInfo=()=>({...ALIGNMENT_KERNEL,variant:'scalar',key:`${ALIGNMENT_KERNEL.abi}:${ALIGNMENT_KERNEL.sha256}:scalar`});
export const alignmentInputBytes=p=>p.referenceCodes.byteLength+p.currentCodes.byteLength+p.data.byteLength;
const reasons=['accepted','low-texture','cost-too-high','ambiguous','forward-backward-inconsistent','insufficient-search-support','insufficient-matches','inconsistent-translation'];
export function validAlignmentResult(shape,r){
 if(r?.kind!=='media-alignment'||r.width!==shape.width||r.height!==shape.height||typeof r.decision?.applied!=='boolean'||!reasons.includes(r.decision.reason))return false;
 const d=r.decision,c=d.candidate;
 if(c!==null&&(!int(c?.dx,-16,16)||!int(c?.dy,-16,16)))return false;
 if(!Array.isArray(d.patches)||d.patches.length!==4||!d.patches.every(p=>['dx','dy','cost','gap','texture','forwardBackwardError','candidates','comparedPixels'].every(k=>Number.isFinite(p[k]))))return false;
 if(!d.applied)return r.derivative===null&&d.currentToReference===null;
 if(!c||d.reason!=='accepted'||!Array.isArray(d.currentToReference)||d.currentToReference.length!==6||!d.currentToReference.every((v,i)=>v===[1,0,0,1,-c.dx,-c.dy][i]))return false;
 const a=r.derivative,n=shape.width*shape.height;
 return !!(a&&a.width===shape.width&&a.height===shape.height&&a.stride===shape.width*4&&a.data instanceof Uint8Array&&a.data.byteLength===n*4&&a.validMask instanceof Uint8Array&&a.validMask.byteLength===n&&a.validMask.every(v=>v===0||v===1)&&a.validMask.reduce((s,v)=>s+v,0)===a.validPixels);
}
export function runAlignment(kernel,p){
 const decision=kernel.estimate(p),derivative=decision.applied?kernel.warp({...p,...decision.candidate}):null;
 return {kind:'media-alignment',width:p.width,height:p.height,decision,derivative};
}

export function inspectAlignmentGeometry(p){
 const {width,height}=p;
 const r=p.roi;
 if(!r||!int(r.x,1,width-2)||!int(r.y,1,height-2)||!int(r.width,8,128)||!int(r.height,8,128)||r.x+r.width>width-1||r.y+r.height>height-1||!int(p.searchRadius,0,16))throw RangeError('ALIGNMENT_ROI');
 const c=p.policy;
 if(!c||Object.keys(c).length!==policyKeys.length||Object.keys(c).some(k=>!policyKeys.includes(k)))throw TypeError('ALIGNMENT_POLICY');
 for(const k of ['maxCost','minGap','minTexture','minInlierRatio'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw RangeError('ALIGNMENT_POLICY');
 if(!int(c.minMatches,1,4)||!int(c.maxFbError,0,32)||!int(c.consensusTolerance,0,16))throw RangeError('ALIGNMENT_POLICY');
 return {roi:{x:r.x,y:r.y,width:r.width,height:r.height},policy:Object.fromEntries(policyKeys.map(k=>[k,c[k]]))};
}
