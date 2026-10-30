const ensure=(v,m)=>{if(!v)throw Error(m);};
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function runCases(read){
 const {createOrtProjectionStage}=await import('./stage.mjs');
 const cases=[],results=[];
 let stage=await createOrtProjectionStage();
 try {
  const q=new Uint8Array(81920),x=new Float32Array(5120),bias=new Float32Array(16);
  q.set([56,64,68]);q.set([72,74,76],5120);x.set([2,0,-1]);bias.set([0.125,-1]);
  const literal=await stage.run({q,scale:1,bias,x});
  ensure(literal.output.length===16&&literal.output[0]===-0.875&&literal.output[1]===1&&literal.output.slice(2).every(v=>v===0),'Literal Hike→ORT→Hike result');
  cases.push({name:'literal nonidentity dequant/ORT Gemm/Hike bias',passed:true});
  let rejected=false;try{await stage.run({q,scale:1,bias:new Float32Array(1),x});}catch{rejected=true;}
  ensure(rejected,'bad bias shape accepted');cases.push({name:'shape mismatch refused before compute',passed:true});
  const fixture=JSON.parse(new TextDecoder().decode(await read('../linear/work/fixture.json')));
  for(const item of fixture.models){
   const weights=await read('../linear/'+item.tileFile),rawBias=await read('../linear/'+item.biasFile);
   const b=new Float32Array(rawBias.slice().buffer),a=Float32Array.from({length:5120},(_,i)=>((i%31)-15)/64);
   const before=await sha(weights),copy=a.slice();
   const actual=await stage.run({q:weights,scale:item.scale,bias:b,x:a});
   ensure(actual.output.length===16,'truncated projection');
   let maxAbsError=0;
   for(let i=0;i<16;i++){
    const error=Math.abs(actual.output[i]-item.expectedDouble[i]);
    maxAbsError=Math.max(maxAbsError,error);
    ensure(error<=1e-4+1e-5*Math.abs(item.expectedDouble[i]),'real-weight partial projection exceeds predeclared tolerance');
   }
   ensure(await sha(weights)===before&&a.every((v,i)=>Object.is(v,copy[i])),'caller buffers changed');
   results.push({role:item.role,output:Array.from(actual.output),maxAbsError,outputSHA256:await sha(new Uint8Array(actual.output.buffer)),...actual.evidence});
  }
  cases.push({name:'all 32 real-weight partial outputs vs independent reference',passed:true});
 } finally {await stage.dispose();}
 let rejected=false;try{await stage.run({});}catch{rejected=true;}ensure(rejected,'disposed stage accepted work');cases.push({name:'owned ORT session/Hike references disposed',passed:true});
 rejected=false;try{await createOrtProjectionStage({hikeBytes:new Uint8Array()});}catch{rejected=true;}ensure(rejected,'missing Hike silently substituted');cases.push({name:'Hike failure has no JS/ORT replacement',passed:true});
 return {passed:true,scope:'partial q projection with synthetic activation only; no full model inference',tolerance:{absolute:1e-4,relative:1e-5},cases,results};
}
