import {createBerniniModelCandidate} from './model-candidate.mjs';

const FIXTURE_SHA256='a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c';
const demand=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
const metadata=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,1000)});

/** Actual retained-File controlled-N5 diagnostics. The reference's expected
 * arrays are never inputs. Trace values go only to the private host binding;
 * the return value contains metrics and identities, never tensor values.
 */
export async function runModelCandidateBrowser({file,fixtureFile,side='LOW',contract,contractSHA256,deliverTrace,checkpoint,stopAfterBlock=null,stopAfterPrefix=false,timeoutMs=3600000}={}){
 demand(file instanceof File&&fixtureFile instanceof File,'Actual retained model File and separate private fixture File required');
 demand(typeof deliverTrace==='function'&&typeof checkpoint==='function','Private trace and metrics checkpoint bindings required');
 demand(['LOW','HIGH'].includes(side)&&contract?.models?.[side],'Explicit original side and frozen contract required');
 demand(contract.fixtureSHA256===FIXTURE_SHA256&&contract.blockRange?.[0]===0&&contract.blockRange?.[1]===40&&Object.keys(contract.traceShapes??{}).length===47,'Frozen controlled N5 full40 contract required');
 demand(stopAfterBlock===null||Number.isInteger(stopAfterBlock)&&stopAfterBlock>=0&&stopAfterBlock<40,'stopAfterBlock must be null or block0..39');
 demand(Number.isFinite(timeoutMs)&&timeoutMs>0,'Positive timeout required');
 const fixtureBytes=await fixtureFile.arrayBuffer(),fixtureSHA256=await sha(fixtureBytes);demand(fixtureSHA256===FIXTURE_SHA256,'Private fixture bytes differ from pre-execution contract');
 const fixture=JSON.parse(new TextDecoder().decode(fixtureBytes));
 const input={shapeRequest:fixture.shapeRequest,tensors:fixture.tensors.map(tensor=>({...tensor,data:Float32Array.from(tensor.data)})),conditioning:{...fixture.conditioning,data:Float32Array.from(fixture.conditioning.data),attentionMask:Uint8Array.from(fixture.conditioning.attentionMask)},timestep:fixture.timestep};
 const controller=new AbortController(),started=performance.now(),traces={},events=[];let candidate=null,outcome='failed',error=null,result=null,cleanupError=null,cancelReason=null,queue=Promise.resolve();
 const enqueue=event=>{const record={elapsedMs:performance.now()-started,...event};events.push(record);queue=queue.then(()=>checkpoint(record));};
 const snapshot=(stage,event={})=>{const stats=candidate?.stats();return {stage,...event,stats:stats??null,sourceDecodeCalls:stats?.source?.decoder?.calls??0,sourcePayloadReads:stats?.source?.payloadReads??0,sourcePayloadReadBytes:stats?.source?.payloadReadBytes??0,sourceDecodedF32Bytes:stats?.source?.decodedF32Bytes??0};};
 const timer=setTimeout(()=>{cancelReason='timeout';controller.abort(new DOMException('Controlled candidate diagnostic timeout','AbortError'));},timeoutMs);
 const heartbeat=setInterval(()=>enqueue(snapshot('heartbeat')),15000);
 try{
  enqueue({stage:'prepare',side,fixtureSHA256,acceptedProduction:false});
  candidate=await createBerniniModelCandidate({file,side,decoder:'lookup',signal:controller.signal});
  const description=candidate.describe(),model=description.model;demand(model.headerSHA256===contract.models[side].headerSHA256&&model.modelSha256===contract.models[side].previouslyVerifiedModelSHA256,'Prepared candidate differs from frozen source binding');
  enqueue(snapshot('prepared',{model,decoder:candidate.stats().source.decoderSelection}));
  result=await candidate.diagnose({...input,signal:controller.signal,onProgress:event=>{if(event.stage==='block-complete'||event.stage==='patch')enqueue(snapshot(event.stage,event));}}, {onTrace:async trace=>{
   const expected=contract.traceShapes[trace.name];demand(expected&&JSON.stringify(trace.shape)===JSON.stringify(expected)&&!Object.hasOwn(traces,trace.name),'Unexpected, duplicate or wrong-shape actual trace');
   demand(trace.data instanceof Float32Array&&trace.data.length===expected.reduce((a,b)=>a*b,1)&&trace.data.every(Number.isFinite),'Finite exact F32 actual trace required');
   const identity={shape:[...trace.shape],elements:trace.data.length,bytes:trace.data.byteLength,sha256:await sha(trace.data)};
   await deliverTrace({name:trace.name,shape:[...trace.shape],data:Array.from(trace.data)});traces[trace.name]=identity;
   enqueue(snapshot('trace',{name:trace.name,identity}));
   if(stopAfterPrefix&&trace.name==='timeProjection'||stopAfterBlock!==null&&trace.name==='block'+String(stopAfterBlock).padStart(2,'0')+'Output'){
    cancelReason=stopAfterPrefix?'requested-prefix-probe':'requested-block-probe';controller.abort(new DOMException('Controlled diagnostic probe complete','AbortError'));
   }
  }});
  demand(Object.keys(traces).length===47&&result.evidence.blocksCompleted===40&&result.evidence.headRows===5,'Complete native full40 N5 trace required');outcome='completed';
 }catch(caught){error=metadata(caught);outcome=controller.signal.aborted?'cancelled':'failed';}
 finally{
  clearTimeout(timer);clearInterval(heartbeat);enqueue(snapshot('terminal',{outcome,cancelReason,error}));
  try{await candidate?.dispose();}catch(caught){cleanupError=metadata(caught);outcome='failed';}
  await queue;
 }
 const tensor=result?{dtype:result.dtype,shape:result.shape,layout:result.layout,meaning:result.meaning,space:result.space,modelSha256:result.modelSha256}:null;
 return {schemaVersion:'bernini-model-candidate-browser/0.1',outcome,nativeFull40ControlledCaseExecuted:outcome==='completed',diagnosticOnly:true,actualRetainedFile:true,side,fixtureSHA256,contractSHA256,coreSourceSHA256:contract.coreSourceSHA256,previouslyVerifiedModelSHA256:contract.models[side].previouslyVerifiedModelSHA256,headerSHA256:contract.models[side].headerSHA256,fixtureClass:contract.fixtureClass,producerVerified:false,required81FrameWorkflowVerified:false,acceptedProduction:false,generationReady:false,publicRuntimeEnabled:false,sourceFullFileHashRecomputed:false,traceIdentities:traces,traceCount:Object.keys(traces).length,tensor,evidence:result?.evidence??null,resources:candidate?.stats()??null,elapsedMs:performance.now()-started,error,cleanupError,cancelReason,events};
}
