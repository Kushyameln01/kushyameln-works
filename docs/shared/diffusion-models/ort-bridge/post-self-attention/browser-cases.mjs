import {createP4Linear} from './linear.mjs';
import {createPostSelfAttention} from './stage.mjs';
import {captureP4FixtureConditioning} from './conditioning.mjs';
const assert=(value,message)=>{if(!value)throw Error(message);};
async function rejects(promise,pattern){try{await promise;}catch(error){assert(pattern.test(error.name+':'+error.message),'Unexpected rejection: '+error);return;}throw Error('Expected rejection');}
// Tiny kernel/lifecycle checks only. No original model payload is read here.
export async function runP4RuntimeBrowserCases({mathBytes,attentionBytes}={}){
 const linear=await createP4Linear();let finalLinear;
 try{
  const inner=13824,x=new Float32Array(2*inner),weight=new Float32Array(4*inner);x[0]=2;x[inner-1]=3;x[inner]=5;x[2*inner-1]=7;
  weight[0]=11;weight[inner-1]=13;weight[inner]=17;weight[2*inner-1]=19;weight[2*inner]=23;weight[3*inner-1]=29;weight[3*inner]=31;weight[4*inner-1]=37;
  const running=linear.run({x,weight,rows:2,inner,columns:4});x.fill(99);weight.fill(99);const got=await running;
  assert(String(got.output)===String([61,91,133,173,146,218,318,414]),'Actual ORT intact FFN-down reduction or preawait snapshots differ');
  assert(got.evidence.innerSplit===false,'FFN down split inner');
  const q=new Float32Array(256),k=new Float32Array(3*128);q[0]=1;k[0]=1;k[128]=2;k[256]=3;
  const scored=await linear.score({q,k,prevMax:new Float32Array(2).fill(-3.4028234663852886e38),keys:3});
  assert(scored.weights.length===6&&scored.alpha.length===2&&scored.newMax.length===2,'Score graph padded logical key tail');
  assert(Math.abs(scored.newMax[0]-Math.fround(3*Math.fround(1/Math.sqrt(128))))<1e-7,'Actual score graph scale differs');
  assert(scored.weights[2]===1&&scored.weights[0]<scored.weights[1]&&scored.weights[1]<1,'Actual score graph stability differs');

  await rejects(linear.run({x:new Float32Array(13824),weight:new Float32Array(5*13824),rows:1,inner:13824,columns:5}),/shape/);
  const controller=new AbortController(),cancelled=linear.run({x:new Float32Array(2*13824),weight:new Float32Array(4*13824),rows:2,inner:13824,columns:4,signal:controller.signal});controller.abort();await rejects(cancelled,/AbortError/);
  assert(linear.stats().pendingTensors===0&&!linear.stats().busy,'Cancellation retained ORT tensors');
  const waiting=linear.run({x:new Float32Array([2,3]),weight:new Float32Array([5,7]),rows:1,inner:2,columns:1}),disposing=linear.dispose();assert((await waiting).output[0]===31,'Disposal interrupted pending ORT result');await disposing;finalLinear=linear.stats();assert(finalLinear.disposed&&finalLinear.activeORTSessions===0&&finalLinear.pendingTensors===0,'Disposal did not await native resources');
 }finally{await linear.dispose();}
 let sourceDisposed=false,reads=0,releases=0;
 const description={side:'EXPLICIT_FIXTURE',epoch:4,packageHash:null,entries:{}};
 const source={describe:()=>structuredClone(description),stats:()=>({payloadReads:reads}),readVector:async(key,start,count)=>({values:new Float32Array(count),source:{originalKey:key,elementStart:start,elementCount:count}}),readRows:async(key,start,count)=>{reads++;return {values:new Float32Array(count*4096),raw:new Uint8Array(count*4096*2),source:{originalKey:key,rowStart:start,rowCount:count}};},addBias:(values)=>new Float32Array(values),dispose:()=>{sourceDisposed=true;},captureSource(){return {...source,captureSource:undefined,release(){releases++;}};}};
 const stage=await createPostSelfAttention({source,mathBytes,attentionBytes}),before=stage.stats(),controller=new AbortController();let observed=false;
 const cyclicMetadata={tag:'p4-runtime-cyclic-binding-v1',bytes:new Uint8Array([0,255]),map:new Map([['key',1n]])};cyclicMetadata.self=cyclicMetadata;
 const conditioning=captureP4FixtureConditioning({fixtureMetadata:cyclicMetadata,data:new Float32Array(8192),shape:[1,2,4096],attentionMask:new Uint8Array([1,0]),fixtureId:'p4-runtime-browser-boundary-v1',sourceRef:'post-self-attention/browser-cases.mjs'}),input={residual:new Float32Array(10240),timeAct1:new Float32Array(5120),conditioning,signal:controller.signal,onProgress:event=>{assert(event.stage==='projection'&&event.operator==='text_embedding.0.weight'&&event.completedRows===16,'First source tile progress differs');observed=true;controller.abort();}};
 try{
  const running=stage.run(input);input.residual.fill(999);input.timeAct1.fill(999);conditioning.data.fill(999);await rejects(running,/AbortError/);
  assert(observed&&reads===1&&releases===1,'Captured source was not released after first actual tile cancellation');const after=stage.stats();assert(!after.busy&&after.cancelledRuns===1&&after.linear.pendingTensors===0,'Stage cancellation retained busy/tensor state');assert(before.math.memoryBytes===after.math.memoryBytes&&before.attention.memoryBytes===after.attention.memoryBytes,'Stage workspace capacity changed');
 }finally{await stage.dispose();}
 const after=stage.stats();assert(after.disposed&&after.activeORTSessions===0&&!sourceDisposed,'Stage must release operators and preserve caller-owned source');
 return {schemaVersion:'bernini-p4-runtime-focused-browser/0.1',passed:true,intactFFNDownReduction:true,preAwaitSnapshots:true,subclassAndShapeAdmission:'covered by focused Node tests',cancelledPendingORTReleased:true,disposeWaitedForORT:true,sourceLeaseReleased:true,cyclicBinaryMetadataBound:true,callerSourcePreserved:true,finalLinear,construction:before,finalStage:after};
}
