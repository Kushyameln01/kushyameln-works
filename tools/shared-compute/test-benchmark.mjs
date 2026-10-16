import assert from 'node:assert/strict';
import {summarizeResults,chooseModuleReuse,runPreparedComparison} from '../../docs/worker-runner/benchmark.mjs';
const item=(workerId,start,end,result=[0,3,5])=>({status:'succeeded',result,workerId,instanceId:workerId,metrics:{computeStartEpochMs:start,computeEndEpochMs:end}});
assert.equal(summarizeResults([item('a',1,3),item('b',2,4)],[[0,3,5],[0,3,5]]).overlap,true);
assert.equal(summarizeResults([item('a',1,2),item('b',2,4)],[[0,3,5],[0,3,5]]).overlap,false);
assert.equal(summarizeResults([item('a',1,3),item('a',2,4)],[[0,3,5],[0,3,5]]).overlap,false);
assert.equal(summarizeResults([item('a',1,3,[0,9,5])],[[0,3,5]]).correct,false);
assert.equal(summarizeResults([item('a',1,3,[])],[[]]).correct,true);
assert.equal(summarizeResults([item('a',1,3,[0])],[[0]]).correct,true);
assert.equal(chooseModuleReuse([100,100,100,100,100],[91,91,91,91,91],true),false);
assert.equal(chooseModuleReuse([100,100,100,100,100],[90,90,90,90,90],true),true);
assert.equal(chooseModuleReuse([100,100,100,100,100],[50,50,50,50,50],false),false);
const admissions=[];
const prepared=await runPreparedComparison({isCurrent:()=>true,onPool(){},createPool:({concurrency,moduleReuse})=>({
  submitBatch(requests,options){assert.equal(options.startTogether,true);assert.equal(moduleReuse,false);assert(requests.length<=concurrency);admissions.push({concurrency,count:requests.length});return{promise:Promise.resolve(requests.map((r,i)=>{assert.equal(r.payload.masks.length,262144);assert.deepEqual(r.payload.weights,[1,2,4]);assert(r.payload.masks.every((x,j)=>x===j%8));return{status:'succeeded',result:r.payload.masks,workerId:'w'+i,instanceId:'i'+i,metrics:{computeStartEpochMs:1,computeEndEpochMs:2}};}))};},getStatus(){return{outstanding:0,inputBytes:0};},dispose(){}
})});
assert.deepEqual(admissions,[{concurrency:2,count:2},{concurrency:2,count:2},{concurrency:4,count:4}]);
assert.equal(prepared.correct,true);assert.equal(prepared.parallelVerified,true);
console.log('PASS benchmark correctness, interval overlap, fixed adoption threshold and unchanged prepared-batch workload');
