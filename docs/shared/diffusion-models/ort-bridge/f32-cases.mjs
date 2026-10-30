const ensure=(v,m)=>{if(!v)throw Error(m);};
async function rejects(action,message){let rejected=false;try{await action();}catch{rejected=true;}ensure(rejected,message);}
export async function runF32Cases(){
 const {createOrtProjectionStage}=await import('./stage.mjs');
 const stage=await createOrtProjectionStage(),cases=[];
 try{
  ensure(typeof stage.runF32==='function','Missing runF32 runtime-weight consumer');
  const weight=new Float32Array(81920),x=new Float32Array(5120),bias=new Float32Array(16);
  weight.set([1,2,3]);weight.set([-2,1,0.5],5120);x.set([2,0,-1]);bias.set([0.125,-1]);
  const beforeWeight=weight.slice(),beforeX=x.slice(),beforeBias=bias.slice();
  const first=await stage.runF32({weight,x,bias});
  ensure(first.output.length===16&&first.output[0]===-0.875&&first.output[1]===-5.5&&first.output.slice(2).every(v=>v===0),'F32 weight and bias did not reach real ORT/Hike output');
  ensure(first.evidence.inputEncoding==='F32-runtime-weight'&&first.evidence.executionProviders[0]==='wasm'&&first.evidence.ortVersion==='1.24.3','Missing real F32 runtime evidence');
  ensure(first.evidence.hikeMemory.calls>=1,'Hike AddBias was not called');
  ensure(weight.every((v,i)=>Object.is(v,beforeWeight[i]))&&x.every((v,i)=>Object.is(v,beforeX[i]))&&bias.every((v,i)=>Object.is(v,beforeBias[i])),'Caller buffers were changed or detached');
  cases.push({name:'real ORT F32 weight feed and Hike bias contribute to output; caller inputs retained',passed:true});

  weight[0]=2;bias[0]=0.5;
  const second=await stage.runF32({weight,x,bias});
  ensure(second.output[0]===1.5,'Changed F32 weight/bias did not change output');
  ensure(second.evidence.hikeMemory.memoryBytes===first.evidence.hikeMemory.memoryBytes&&second.evidence.hikeMemory.arenaBytes===first.evidence.hikeMemory.arenaBytes&&second.evidence.hikeMemory.workspaceReused,'Hike fixed workspace was not reused');
  ensure(second.evidence.hikeMemory.calls===first.evidence.hikeMemory.calls+1,'F32 path unexpectedly dequantized or skipped Hike');
  cases.push({name:'changed consumer weights are used and fixed Hike workspace is reused',passed:true});

  const pending=stage.runF32({weight,x,bias});
  weight.fill(999);x.fill(999);bias.fill(999);
  await rejects(()=>stage.runF32({weight,x,bias}),'Concurrent F32 operation was accepted');
  await rejects(()=>stage.dispose(),'Active stage was disposed');
  const owned=await pending;
  ensure(owned.output[0]===1.5&&owned.output[1]===-5.5,'Caller mutation crossed asynchronous ORT boundary');
  cases.push({name:'F32 inputs are snapshotted before async ORT; active BUSY and dispose guards hold',passed:true});

  const good={weight:new Float32Array(81920),x:new Float32Array(5120),bias:new Float32Array(16)};
  for(const name of ['weight','x','bias']){
   const invalid={...good,[name]:new Float32Array(1)};
   await rejects(()=>stage.runF32(invalid),'Wrong '+name+' shape was accepted');
   const nonfinite={...good,[name]:good[name].slice()};nonfinite[name][0]=NaN;
   await rejects(()=>stage.runF32(nonfinite),'Nonfinite '+name+' was accepted');
  }
  const final=await stage.runF32(good);
  ensure(final.output.every(v=>v===0),'Rejected input poisoned later F32 work');
  cases.push({name:'wrong shapes and nonfinite values are refused without poisoning later work',passed:true});
  return {passed:true,scope:'bounded runtime F32 Q-projection weight/bias consumer; explicit activation; not full model or full LoRA acceptance',cases,evidence:{first:first.evidence,reused:second.evidence,last:final.evidence}};
 }finally{await stage.dispose();}
}
