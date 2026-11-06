// Explicit development-only replacement for the public model Worker. The
// adopted host factory/relay/client/server/full-feed are real; NN is absent.
import {createSyntheticSource,W,B} from './adopted-port-fixture.mjs';
import {attachDiffusionWeightServer} from '/shared/ai-connection/native/diffusion-b6e16647/docs/shared/diffusion-models/api/weight-port.mjs';
import {createFullModelWeightFeed} from '/shared/ai-connection/native/diffusion-b6e16647/docs/shared/diffusion-models/execution/model-weight-feed.mjs';
import {BUILD_ID} from '/shared/ai-connection/native/diffusion-b6e16647/docs/shared/diffusion-models/api/build-info.mjs';
let serial=0,modelSessionId=null,modelEpoch=0;const feeds=new Map(),sources=new Map(),servers=new Set(),captures=new Map();
const sideOf=()=>feeds.get('LOW');
async function probe(source){return {weight:Array.from((await source.readRows(W,0,4)).values),bias:Array.from((await source.readVector(B,0,4)).values)};}
async function control(q){
 if(q.action==='probe')return {...await probe(sideOf().source),feed:sideOf().stats(),base:sources.get('LOW').stats()};
 if(q.action==='stats')return {feed:sideOf()?.stats(),base:sources.get('LOW')?.stats(),servers:[...servers].map(s=>s.stats()),captures:captures.size};
 if(q.action==='pause-next'){sources.get('LOW').pauseNext();return {armed:true};}
 if(q.action==='resume'){sources.get('LOW').resume();return {resumed:true};}
 if(q.action==='capture'){const view=sideOf().capture();captures.set('held',view);return {epoch:view.epoch,packageHash:view.packageHash};}
 if(q.action==='probe-capture')return {...await probe(captures.get('held').source),epoch:captures.get('held').epoch};
 if(q.action==='release-capture'){await captures.get('held')?.release();captures.delete('held');return {released:true};}
 throw Error('Unknown development probe');
}
self.onmessage=async({data:q})=>{
 if(q?.fixtureControl){try{self.postMessage({fixtureReply:q.id,ok:true,value:await control(q)});}catch(e){self.postMessage({fixtureReply:q.id,ok:false,error:{code:e.code,message:e.message,stack:e.stack}});}return;}
 const identity={buildId:BUILD_ID,protocolVersion:q?.protocolVersion,sessionId:q?.sessionId,jobId:q?.jobId,inputRevision:q?.inputRevision,op:q?.op};
 try{
  let result;
  if(q.op==='load'){modelSessionId='synthetic-dyadic:'+ ++serial;modelEpoch++;result={loaded:true,modelSessionId,modelEpoch,fixtureOnly:true};}
  else if(q.op==='modelStatus')result={loaded:!!modelSessionId,modelSessionId,modelEpoch,fixtureOnly:true};
  else if(q.op==='openWeightFeed'){
   if(!modelSessionId)throw Error('Load conforming fixture first');const side=q.input.side;
   if(!feeds.has(side)){const source=await createSyntheticSource(side,{onPaused:()=>self.postMessage({fixtureEvent:'base-paused'})});sources.set(side,source);feeds.set(side,await createFullModelWeightFeed({source}));}
   const feed=feeds.get(side),channel=new MessageChannel(),binding={side,modelSessionId,modelEpoch},server=attachDiffusionWeightServer(channel.port1,feed,{binding});servers.add(server);result={port:channel.port2,binding,descriptor:feed.describe(),protocol:'diffusion-weight-port/1'};
  }else if(q.op==='unload'){
   for(const view of captures.values())await view.release();captures.clear();for(const s of servers)s.close();for(const f of feeds.values())await f.dispose();for(const s of sources.values())s.dispose();result={unloaded:true,fixtureOnly:true};modelSessionId=null;
  }else throw Object.assign(Error('Development fixture forbids NN or non-weight operations'),{code:'FIXTURE_OPERATION_UNSUPPORTED'});
  self.postMessage({...identity,status:'ok',result},result.port?[result.port]:[]);
 }catch(e){self.postMessage({...identity,status:'error',error:{code:e.code??'FIXTURE_ERROR',message:e.message}});}
};
