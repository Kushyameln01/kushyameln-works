import assert from 'node:assert/strict';
let module;try{module=await import('../../docs/shared/inference/client.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
assert.equal(typeof module?.createInferenceClient,'function','Actual inference controller missing');
class WorkerDouble{static all=[];constructor(){this.listeners={};this.terminated=false;WorkerDouble.all.push(this);}addEventListener(n,f){this.listeners[n]=f;}postMessage(m){this.last=m;}terminate(){this.terminated=true;}reply(data){this.listeners.message({data});}}
const states=[];const c=module.createInferenceClient({workerFactory:()=>new WorkerDouble(),onState:s=>states.push(s)});
const a=c.run({module:'vae',operation:'decode',manifest:{},files:[],input:{}});const wA=WorkerDouble.all.at(-1);const aId=wA.last;
await assert.rejects(c.run({module:'text_encoder',operation:'encode',manifest:{},files:[],input:{}}),/busy/i);
c.cancel();await assert.rejects(a,/cancel/i);assert.ok(wA.terminated);
const b=c.run({module:'vae',operation:'decode',manifest:{},files:[],input:{}});const wB=WorkerDouble.all.at(-1);const bId=wB.last;
wA.reply({...aId,type:'success',result:{bad:true}});assert.equal(c.state.status,'running');
wB.reply({...bId,type:'success',result:{value:42}});assert.deepEqual(await b,{value:42});assert.ok(wB.terminated);assert.equal(c.state.status,'success');
wA.reply({...aId,type:'failure',error:'obsolete'});assert.equal(c.state.status,'success');
const d=c.run({module:'vae',operation:'decode',manifest:{},files:[],input:{}});const wD=WorkerDouble.all.at(-1);wD.listeners.error({message:'WASM failed'});await assert.rejects(d,/WASM failed/);assert.ok(wD.terminated);
c.dispose();await assert.rejects(c.run({module:'vae',operation:'decode'}),/disposed/i);
console.log('PASS: owned Worker termination, busy rejection, stale success/failure, restart and error cleanup');
