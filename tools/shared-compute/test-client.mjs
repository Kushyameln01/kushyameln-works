import assert from 'node:assert/strict';
import {createComputeClient} from '../../docs/shared/compute/client.mjs';
import {validateRequest} from '../../docs/shared/compute/protocol.mjs';
const request=(jobId='test-1',masks=[0,3,5])=>({protocolVersion:1,jobId,inputRevision:1,taskType:'ft-magnitude-batch',taskVersion:1,payload:{masks,weights:[1,2,4]}});
assert.deepEqual(validateRequest(request()).payload.masks,[0,3,5]);
assert.deepEqual(validateRequest(request('empty',[])).payload.masks,[]);
assert.throws(()=>validateRequest(request('sparse',new Array(2))));
assert.throws(()=>validateRequest({...request(),payload:{masks:[],weights:new Array(2)}}));
for(const mutate of [r=>r.protocolVersion=2,r=>r.payload.masks=[8],r=>r.payload.masks=[1.5],r=>r.payload.weights=[0],r=>r.payload.weights=[Number.MAX_VALUE,Number.MAX_VALUE],r=>r.inputRevision=-1,r=>r.taskType='unknown']){const r=request();mutate(r);assert.throws(()=>validateRequest(r));}
class Fake {constructor(){this.terminated=0;}postMessage(r){this.request=r;}terminate(){this.terminated++;}emit(m){this.onmessage({data:m});}}
let w;const client=createComputeClient({workerFactory:()=>w=new Fake()});
const one=client.submit(request());assert.equal(client.getStatus('test-1').status,'running');assert.throws(()=>client.submit(request('busy')));
w.emit({type:'result',jobId:'stale',inputRevision:1,result:[99]});assert.equal(client.getStatus('test-1').status,'running');
w.emit({type:'result',jobId:'test-1',inputRevision:1,result:[0,3,5],metrics:{computeMs:1}});const result=await one.promise;assert.equal(result.status,'succeeded');assert.deepEqual(result.result,[0,3,5]);assert.equal(w.terminated,1);
const two=client.submit(request('cancel'));const old=w;assert.equal(client.cancel('cancel'),true);assert.equal((await two.promise).status,'cancelled');assert.equal(old.terminated,1);old.emit({type:'result',jobId:'cancel',inputRevision:1,result:[99]});assert.equal(client.getResult('cancel').status,'cancelled');
const reused=client.submit(request('cancel'));old.emit({type:'result',jobId:'cancel',inputRevision:1,result:[99,99,99]});assert.equal(client.getStatus('cancel').status,'running');w.emit({type:'result',jobId:'cancel',inputRevision:1,result:new Array(3)});assert.equal((await reused.promise).errorCode,'INVALID_RESPONSE');
const three=client.submit(request('dispose'));client.dispose();assert.equal((await three.promise).errorCode,'DISPOSED');assert.throws(()=>client.submit(request('after-dispose')));
for(const failure of ['constructor','post','error','messageerror','timeout']){let worker;const c=createComputeClient({workerFactory:()=>{if(failure==='constructor')throw Error('startup');worker=new Fake();if(failure==='post')worker.postMessage=()=>{throw Error('clone')};return worker;}});const r=c.submit({...request(failure),limits:{timeoutMs:10}});if(failure==='error')worker.onerror({preventDefault(){}});if(failure==='messageerror')worker.onmessageerror({});const result=await r.promise;assert.equal(result.status,'failed');assert(result.errorCode);c.dispose();}
console.log('PASS prototype validation, zero/empty, stale identity, cancellation, disposal and failure settlement');
