import {createBatchedModelOps} from '/docs/shared/diffusion-models/execution/batched-ops.mjs';
import {createModelMath} from '/docs/shared/diffusion-models/execution/model-math.mjs';
import {Sha256} from '/docs/shared/vr180/sha256.mjs';

const demand=(value,message)=>{if(!value)throw Error(message);};
const bytes=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const sameHashes=(a,b)=>Object.keys(a).length===Object.keys(b??{}).length&&Object.entries(a).every(([name,value])=>b[name]===value);
function query(contract){
 const {heads,queries,headDim}=contract.shape,q=new Float32Array(heads*queries*headDim);
 for(let h=0;h<heads;h++)for(let r=0;r<queries;r++)for(let d=0;d<headDim;d++)q[(h*queries+r)*headDim+d]=((h*7+r*3+d*5)%29-14)/64;
 return q;
}
function keyValue(contract,offset,count){
 const {heads,headDim}=contract.shape,k=new Float32Array(heads*count*headDim),v=new Float32Array(k.length);
 for(let h=0;h<heads;h++)for(let r=0;r<count;r++){
  const globalKey=offset+r,drift=(Math.floor(globalKey/256)%11-5)/128;
  for(let d=0;d<headDim;d++){
   const at=(h*count+r)*headDim+d;k[at]=((h*11+globalKey*7+d*3)%31-15)/64+drift;
   v[at]=globalKey===contract.generator.finalKey?2048+(h*3+d)%17/16:1/8+(h*13+globalKey*5+d*7)%37/256;
  }
 }return {k,v};
}
function compare(actual,reference,label,gate){
 demand(actual instanceof Float32Array&&actual.length===reference.length,label+' shape');
 let failed=0,maxAbsolute=0,maxRelative=0,nonfinite=0;
 for(let i=0;i<actual.length;i++){
  if(!Number.isFinite(actual[i])||!Number.isFinite(reference[i])){nonfinite++;failed++;continue;}
  const difference=Math.abs(actual[i]-reference[i]);maxAbsolute=Math.max(maxAbsolute,difference);maxRelative=Math.max(maxRelative,difference/Math.max(1e-30,Math.abs(reference[i])));
  if(difference>gate.absolute+gate.relative*Math.abs(reference[i]))failed++;
 }
 return {label,elements:actual.length,failed,nonfinite,maxAbsolute,maxRelative,gate,passed:failed===0};
}
async function reference(name,manifest){
 const response=await fetch('/__reference/'+name+'.f64');demand(response.ok,'Missing private reference '+name);
 const buffer=await response.arrayBuffer(),spec=manifest.arrays[name],hash=new Sha256();hash.update(new Uint8Array(buffer));
 demand(buffer.byteLength===spec.bytes&&hash.digestHex()===spec.sha256,'Reference byte/hash mismatch '+name);
 return new Float64Array(buffer);
}

export function testLongAttentionGenerator(contract){
 demand(JSON.stringify(contract.shape)===JSON.stringify({heads:40,queries:128,keys:65520,headDim:128}),'Fixed full-key selected-query contract required');
 demand(contract.tiles===256&&contract.tailKeys===240&&contract.generator.finalKey===65519,'Exact tile/tail contract');
 const q=query(contract),tail=keyValue(contract,65513,7);
 demand(q[0]===-14/64&&q[(39*128+127)*128+127]===((39*7+127*3+127*5)%29-14)/64,'Query coordinate formula');
 demand(tail.v[(39*7+6)*128+127]===2048+(39*3+127)%17/16,'Final-key sentinel coordinate');
 demand(tail.v[0]===1/8+(65513*5)%37/256,'Nonfinal value coordinate');
 return {passed:true,queryElements:q.length,tailElements:tail.k.length,finalSentinel:tail.v[(39*7+6)*128+127]};
}

export async function runLongAttention({manifest,referenceMetadataSHA256,sourceCommit,sourceSHA256,onProgress}={}){
 const response=await fetch(new URL('./contract.json',import.meta.url));demand(response.ok,'Missing frozen long-attention contract');const contract=await response.json();
 testLongAttentionGenerator(contract);demand(manifest.contractSHA256===sourceSHA256['development/ai-connection/standalone-d1-d4-20261102/long-attention/contract.json'],'Reference frozen contract mismatch');
 demand(sameHashes(manifest.sourceSHA256,sourceSHA256),'Reference and browser must use the same frozen sources');
 const expected={};for(const name of contract.gate.arrays)expected[name]=await reference(name,manifest);
 const {heads,queries,keys:totalKeys,headDim}=contract.shape,q=query(contract),qHash=new Sha256(),kHash=new Sha256(),vHash=new Sha256();qHash.update(bytes(q));
 let maximum=new Float32Array(heads*queries).fill(-3.4028234663852886e38),denominator=new Float32Array(heads*queries),context=new Float32Array(heads*queries*headDim),ops=null,math=null,keysConsumed=0,tiles=0,tailKeys=0,maxUpdates=0;
 const began=performance.now();let ortMs=0,hashMs=0,generatorMs=0;
 try{
  ops=await createBatchedModelOps();math=await createModelMath();
  for(let offset=0;offset<totalKeys;offset+=contract.keyTile){
   const count=Math.min(contract.keyTile,totalKeys-offset),before=performance.now(),{k,v}=keyValue(contract,offset,count),afterGenerate=performance.now();kHash.update(bytes(k));vHash.update(bytes(v));const afterHash=performance.now();
   const result=await ops.attentionTile({q,k,v,previousMax:maximum,previousDenominator:denominator,previousContext:context,heads,queries,keys:count,headDim});
   for(let i=0;i<maximum.length;i++){demand(result.max[i]>=maximum[i],'Online maximum decreased');if(result.max[i]>maximum[i])maxUpdates++;}
   maximum=result.max;denominator=result.denominator;context=result.context;keysConsumed+=count;tiles++;tailKeys=count;
   demand(result.evidence.keys===count&&result.evidence.phantomKeys===0,'Exact logical key tile required');
   generatorMs+=afterGenerate-before;hashMs+=afterHash-afterGenerate;ortMs+=performance.now()-afterHash;
   if(tiles===1||tiles%16===0||keysConsumed===totalKeys)onProgress?.({tiles,keysConsumed,totalKeys,lastCount:count,elapsedMs:performance.now()-began});
  }
  demand(keysConsumed===65520&&tiles===256&&tailKeys===240,'Every one of 65520 keys and the exact240 tail must be processed');
  const inputSHA256={q:qHash.digestHex(),k:kHash.digestHex(),v:vHash.digestHex()};
  demand(sameHashes(inputSHA256,manifest.inputSHA256),'Independent Python/JS full input stream hashes differ');
  const output=math.divideAttention({context,denominator,heads,queries,headDim}),comparisons={max:compare(maximum,expected.max,'max',contract.gate),denominator:compare(denominator,expected.denominator,'denominator',contract.gate),context:compare(context,expected.context,'unnormalized context',contract.gate),output:compare(output,expected.output,'Hike normalized output',contract.gate)};
  const result={passed:Object.values(comparisons).every(value=>value.passed),scope:contract.scope,modelInference:false,productionQKV:false,shape:contract.shape,keysConsumed,tiles,tailKeys,phantomKeys:0,maxUpdates,inputSHA256,sourceCommit,sourceSHA256,referenceMetadataSHA256,precisionProfile:ops.describe().precisionProfile,comparisons,sentinel:manifest.sentinel,elapsed:{generatorMs,hashMs,ortMs,totalMs:performance.now()-began},opsBeforeDispose:ops.stats(),mathBeforeDispose:math.stats(),denseSequenceScoreAllocated:false,maximumLogicalScoreElements:heads*queries*contract.keyTile,knownCallerNumericBytes:q.byteLength+context.byteLength+denominator.byteLength+maximum.byteLength+heads*contract.keyTile*headDim*8,knownCallerScope:'Named query/state/one K+V tile only; excludes expected arrays, ORT/Hike internals, GC, browser and other harness allocations'};
  await ops.dispose();math.dispose();result.opsAfterDispose=ops.stats();result.mathAfterDispose=math.stats();return result;
 }finally{await ops?.dispose();math?.dispose();}
}
