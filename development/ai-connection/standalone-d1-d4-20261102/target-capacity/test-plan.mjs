import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityPlan,inputValue,workflowRequest} from './plan.mjs';
import {deriveWorkflowShapes} from '../../../../docs/shared/ai-connection/workflow-shapes.mjs';

test('shared canonical target/source81 shapes produce65520tokens without payload allocation',()=>{
 const shape=deriveWorkflowShapes(workflowRequest()),plan=capacityPlan();
 assert.deepEqual(shape.requirements.find(item=>item.requirementId==='target.latent').shape,[1,16,21,60,104]);
 assert.deepEqual(shape.requirements.find(item=>item.requirementId==='source.latent').shape,[1,16,21,60,104]);
 assert.equal(shape.target.tokenCount,32760);assert.equal(shape.concatenation.totalTokens,65520);
 assert.equal(plan.components.fourHostStores,5367398400);assert.equal(plan.hostStoreBytes,1341849600);
});

test('all FFN-up output chunks and full down-inner dimension retain the actual cache bytes',()=>{
 const chunks=[[0,5120],[5120,5120],[10240,3584]];
 assert.equal(chunks[0][0],0);for(let i=1;i<chunks.length;i++)assert.equal(chunks[i][0],chunks[i-1][0]+chunks[i-1][1]);
 assert.equal(chunks.at(-1)[0]+chunks.at(-1)[1],13824);
 assert.equal(chunks.reduce((n,[,rows])=>n+rows*5120*4,0)+5120*13824*4,566231040);
 assert.equal(capacityPlan().components.ffnStageCache,566231040);
});

test('native input generator has independent exact dyadic scalar coordinates',()=>{
 for(const [row,column]of [[0,0],[127,13823],[10,537],[17,11317]]){
  const product=row*7+column*3,remainder=product-Math.floor(product/23)*23;
  assert.equal(inputValue(row,column),(remainder-11)*.03125);
  assert.equal(Math.fround(inputValue(row,column)),inputValue(row,column));
 }
});

test('planning spans stay below8GiB and per-array2GiB without claiming a measured peak',()=>{
 const plan=capacityPlan();assert.ok(plan.namedPlusRuntimeReservations<=8*1073741824);assert.ok(plan.hostStoreBytes<2147483648);
 assert.equal(plan.withSafety,plan.namedPlusRuntimeReservations+plan.reservations.safety);
 assert.match(plan.budgetMeaning,/not a measured peak/);assert.match(plan.semantics,/not real model hidden/);
});
