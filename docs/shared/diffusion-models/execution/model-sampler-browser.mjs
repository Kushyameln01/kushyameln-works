import {createBerniniModelSamplerCandidate} from './model-sampler-candidate.mjs';
import {encodeTensor,decodeTensor,describeTensor} from '../../inference/tensor.mjs';

export const SAMPLER_FIXTURE_SHA256='a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c';
const SHAPE=[1,16,1,2,4],TRACE_NAMES=['initialX','velocity00','step00X','velocity01','step01X','velocity02','step02X','highPublic','lowEntry','velocity03','step03X','velocity04','step04X','velocity05','step05X','finalRaw'];
const demand=(value,message)=>{if(!value)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
const errorMetadata=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,1000)});
const identity=async tensor=>({shape:[...tensor.shape],elements:tensor.data.length,bytes:tensor.data.byteLength,sha256:await sha(tensor.data)});

/** Reuse the independently frozen controlled fixture without an expected-array
 * or reference port. This helper performs input capture only, never inference.
 */
export async function createControlledN5SamplerInput(fixtureBytes){
 const owned=new Uint8Array(fixtureBytes instanceof ArrayBuffer?new Uint8Array(fixtureBytes):fixtureBytes),fixtureSHA256=await sha(owned);demand(fixtureSHA256===SAMPLER_FIXTURE_SHA256,'Exact frozen N5/L3 fixture bytes required');
 const fixture=JSON.parse(new TextDecoder().decode(owned));
 demand(fixture.fixtureClass==='controlled-n5-l3-not-original-media-or-81-frame-workflow','Controlled fixture class required');
 const text=()=>({...structuredClone(fixture.conditioning),data:Float32Array.from(fixture.conditioning.data),attentionMask:Uint8Array.from(fixture.conditioning.attentionMask)});
 const noise=Float32Array.from(fixture.construction.explicitNoise);
 demand(noise.length===128&&noise.every(Number.isFinite),'Explicit frozen 128-value noise required');
 const tensors=fixture.tensors.map(tensor=>({...structuredClone(tensor),data:Float32Array.from(tensor.data)}));
 demand(tensors.length===3&&JSON.stringify(tensors[0].shape)===JSON.stringify(SHAPE),'Exact target/source/reference N5 population required');
 return {fixtureSHA256,fixtureClass:fixture.fixtureClass,input:{shapeRequest:structuredClone(fixture.shapeRequest),tensors,noise,positive:text(),negative:text()}};
}

/** Actual retained HIGH/LOW File six-NN harness. Normal mode calls .sample with
 * ordinary inputs. Diagnostic mode calls the separately exposed .diagnose;
 * snapshots only leave through the private host binding, whose return is ignored.
 */
export async function runModelSamplerBrowser({files,fixtureFile,mode='sample',deliverTrace,deliverEncoded,checkpoint,memoryObserver,timeoutMs=21600000}={}){
 demand(files?.HIGH instanceof File&&files?.LOW instanceof File&&fixtureFile instanceof File,'Actual HIGH/LOW retained model Files and frozen fixture File required');
 demand(['sample','diagnose'].includes(mode),'Explicit sample or diagnose mode required');
 demand([deliverTrace,deliverEncoded,checkpoint].every(value=>typeof value==='function'),'Private trace/encoded and public checkpoint bindings required');
 demand(Number.isFinite(timeoutMs)&&timeoutMs>0,'Positive timeout required');
 const captured=await createControlledN5SamplerInput(await fixtureFile.arrayBuffer()),input=captured.input;
 const inputIdentities={noise:await identity({shape:SHAPE,data:input.noise}),tensors:await Promise.all(input.tensors.map(async tensor=>({requirementId:tensor.requirementId,...await identity(tensor)}))),positive:await identity(input.positive),negative:await identity(input.negative)};
 const controller=new AbortController(),started=performance.now(),traceIdentities={},events=[];let candidate=null,result=null,outcome='failed',error=null,cleanupError=null,cancelReason=null,queue=Promise.resolve(),codec=null;
 const enqueue=event=>{const record={elapsedMs:performance.now()-started,...event};events.push(record);queue=queue.then(()=>checkpoint(record));};
 const snapshot=(stage,event={})=>({stage,...event,resources:candidate?.stats()??null,wasmMemory:memoryObserver?.sample(stage)??null});
 const deliver=async(name,tensor,metadata={})=>{
  demand(TRACE_NAMES.includes(name)&&!Object.hasOwn(traceIdentities,name),'Unexpected or duplicate private sampler trace');
  demand(JSON.stringify(tensor.shape)===JSON.stringify(SHAPE)&&tensor.data instanceof Float32Array&&tensor.data.length===128&&tensor.data.every(Number.isFinite),'Finite exact target-shape sampler trace required');
  const bound=await identity(tensor);await deliverTrace({name,shape:[...SHAPE],data:Array.from(tensor.data),...metadata});traceIdentities[name]=bound;
  enqueue(snapshot('trace',{name,identity:bound}));
 };
 const timer=setTimeout(()=>{cancelReason='timeout';controller.abort(new DOMException('Controlled sampler timeout','AbortError'));},timeoutMs);
 const heartbeat=setInterval(()=>enqueue(snapshot('heartbeat')),15000);
 try{
  enqueue({stage:'prepare',mode,fixtureSHA256:captured.fixtureSHA256,acceptedProduction:false});
  candidate=await createBerniniModelSamplerCandidate({files,signal:controller.signal});
  enqueue(snapshot('prepared',{description:candidate.describe()}));
  const ordinary={...input,signal:controller.signal,onProgress:event=>{
   if(event.stage==='prediction-start'||event.stage==='step-complete'||event.model?.stage==='block-complete')enqueue(snapshot(event.model?.stage??event.stage,{step:event.step,side:event.side,block:event.model?.block??null}));
  }};
  if(mode==='sample')result=await candidate.sample(ordinary);
  else result=await candidate.diagnose(ordinary,{onTrace:async trace=>{
   const name=trace.name==='stepX'?'step'+String(trace.step).padStart(2,'0')+'X':trace.name;
   await deliver(name,trace,{meaning:trace.meaning??null,...(trace.step!==undefined?{step:trace.step}:{}),...(trace.side?{side:trace.side}:{}),...(trace.sigma!==undefined?{sigma:trace.sigma}:{}),...(trace.handoffProfile?{handoffProfile:trace.handoffProfile}:{}),...(trace.latentContract?{latentContract:structuredClone(trace.latentContract)}:{})});
  }});
  demand(result.evidence.steps===6&&result.evidence.highUpdates===3&&result.evidence.lowUpdates===3&&result.evidence.modelRuns.length===6&&result.evidence.modelRuns.every((run,index)=>run.side===(index<3?'HIGH':'LOW')&&run.prediction.blocksCompleted===40),'Six complete actual full40 neural predictions required');
  demand(result.meaning==='wan21-raw-generated-sample:v1'&&result.latentContract?.normalization?.state==='restored','Final raw generated sample contract required');
  if(mode==='sample')await deliver('finalRaw',result,{meaning:result.meaning,latentContract:structuredClone(result.latentContract)});
  else demand(TRACE_NAMES.every(name=>Object.hasOwn(traceIdentities,name))&&Object.keys(traceIdentities).length===16,'All sixteen full sampler diagnostic snapshots required');
  const encoded=await encodeTensor(result),decoded=await decodeTensor(encoded),before=new Uint32Array(result.data.buffer,result.data.byteOffset,128),after=new Uint32Array(decoded.data.buffer,decoded.data.byteOffset,128);
  demand(before.every((bits,index)=>bits===after[index]),'Saved codec payload must preserve every F32 bit');
  demand(JSON.stringify(describeTensor(decoded))===JSON.stringify(describeTensor(result)),'Saved codec metadata differs from final raw sample');
  codec={encodedSHA256:await sha(encoded),encodedBytes:encoded.byteLength,payloadSHA256:await sha(decoded.data),payloadBitsCompared:128,payloadBitsExact:128,metadata:describeTensor(decoded)};
  await deliverEncoded({bytes:Array.from(encoded),sha256:codec.encodedSHA256,byteLength:encoded.byteLength});
  enqueue(snapshot('encoded',{codec}));outcome='completed';
 }catch(caught){error=errorMetadata(caught);outcome=controller.signal.aborted?'cancelled':'failed';}
 finally{
  clearTimeout(timer);clearInterval(heartbeat);enqueue(snapshot('terminal',{outcome,cancelReason,error}));
  enqueue(snapshot('before-dispose'));
  try{await candidate?.dispose();}catch(caught){cleanupError=errorMetadata(caught);outcome='failed';}
  enqueue(snapshot('after-dispose'));
  await queue;
 }
 return {schemaVersion:'bernini-model-sampler-browser/0.1',outcome,mode,diagnosticOnly:true,nativeSixFull40PredictionsExecuted:outcome==='completed',actualRetainedFiles:true,fixtureSHA256:captured.fixtureSHA256,fixtureClass:captured.fixtureClass,inputIdentities,noise:'explicit frozen construction.explicitNoise; not seeded RNG',conditioning:'controlled L3 fixture; positive/negative identical; negative validated and skipped at CFG1',initialTarget:'frozen fixture target retained; initial sigma1 CONST coefficient on target is zero',required81FrameWorkflowVerified:false,originalProductionPrecisionVerified:false,acceptedProduction:false,generationReady:false,publicRuntimeEnabled:false,producerVerified:false,sourceFullFileHashRecomputed:false,traceIdentities,traceCount:Object.keys(traceIdentities).length,tensor:result?describeTensor(result):null,evidence:result?.evidence??null,codec,wasmMemory:memoryObserver?.sample('returned-after-dispose')??null,resources:candidate?.stats()??null,elapsedMs:performance.now()-started,error,cleanupError,cancelReason,events};
}

/** Invoke only after the private host has saved the actual encoded bytes and
 * selected that saved path as a new browser File. No reference enters this API.
 */
export async function readSavedSamplerFile(file){
 demand(file instanceof File,'Actual disk-saved generated sample File required');
 const encoded=new Uint8Array(await file.arrayBuffer()),tensor=await decodeTensor(encoded);
 demand(tensor.meaning==='wan21-raw-generated-sample:v1'&&tensor.latentContract?.normalization?.state==='restored','Saved raw generated-sample contract required');
 return {encodedSHA256:await sha(encoded),encodedBytes:encoded.byteLength,payloadSHA256:await sha(tensor.data),payloadElements:tensor.data.length,metadata:describeTensor(tensor)};
}
