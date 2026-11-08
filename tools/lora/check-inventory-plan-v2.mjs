// Reproducible schema fixture reconstructed from the already completed inventory.
// Does not open original safetensors or assert an actual graph/base binding.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildPlanV2,CONTRACT_VERSION,LOADER_POLICY_ID} from '../../docs/shared/inference/lora/planner-v2.mjs';
import {resolveLoraTarget,resolveLoraBiasTarget} from '../../docs/shared/diffusion-models/lora/targets.mjs';

const path=new URL('../../development/lora/contracts/original-inventory.json',import.meta.url);
const bytes=fs.readFileSync(path),inventoryHash=createHash('sha256').update(bytes).digest('hex');
assert.equal(inventoryHash,'97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3');
const inventory=JSON.parse(bytes),results=[];
for(const item of inventory){
 const tensors={},targets=[],alphaValues={};
 function addTarget(key,shape,role){targets.push({key,weightId:key,module:'diffusion_models',shape,dtype:'F32',layout:'row-major',parameterRole:role,binding:{kind:role==='bias'?'hike-parameter':'runtime-input',name:key},transform:{kind:'identity'}});}
 for(const pair of item.lowRankPairs){
  // Confirmed original structural dialects, reconstructed here as tiny metadata
  // objects. This is a fixture of the inventory, not a fresh file inspection.
  const down=item.pairId==='light'?'.lora_down.weight':'.lora_A.weight';
  const up=item.pairId==='light'?'.lora_up.weight':'.lora_B.weight';
  tensors[pair.targetStem+down]={dtype:'BF16',shape:pair.downShape};
  tensors[pair.targetStem+up]={dtype:'BF16',shape:pair.upShape};
  if(pair.alpha!==null){tensors[pair.targetStem+'.alpha']={dtype:'BF16',shape:[]};alphaValues[pair.targetStem+'.alpha']=pair.alpha;}
  addTarget(pair.targetStem+'.weight',[pair.upShape[0],pair.downShape[1]],'weight');
 }
 for(const [names,suffix,role,resolve] of [[item.weightDiffTargets,'.diff','weight',resolveLoraTarget],[item.biasDiffTargets,'.diff_b','bias',resolveLoraBiasTarget]])for(const stem of names){
  const logicalTarget=resolve(stem);assert.ok(logicalTarget,'Cached logical target must exist: '+stem);
  tensors[stem+suffix]={dtype:'BF16',shape:logicalTarget.shape};addTarget(stem+'.'+role,logicalTarget.shape,role);
 }
 const registry={contractVersion:CONTRACT_VERSION,modelHash:'a'.repeat(64),graphHash:'b'.repeat(64),registryVersion:'inventory-schema-fixture',side:item.side.toUpperCase(),executionProfileId:'FIXTURE_NOT_REAL_GRAPH',loaderPolicyId:LOADER_POLICY_ID,targets};
 const args={inspection:{tensors},registry,sourceSha256:item.sha256,strength:1,loaderPolicyId:LOADER_POLICY_ID,alphaValues};
 const full=buildPlanV2(args),stem='diffusion_model.blocks.0.self_attn.q';
 const diagnostic={targets:[{key:stem+'.weight',slice:{startRow:0,rowCount:16}},...item.pairId==='light'?[{key:stem+'.bias',slice:{startRow:0,rowCount:16}}]:[]]};
 const partial=buildPlanV2({...args,diagnostic});
 assert.equal(full.operations.length,item.pairId==='light'?1052:400);
 assert.equal(partial.coverage,'PARTIAL');assert.equal(partial.completeAdapter,false);
 assert.equal(partial.operations.length,item.pairId==='light'?2:1);
 assert.equal(partial.excludedTargets.length,item.pairId==='light'?1050:399);
 assert.deepEqual(partial.operations[0].fullShape,[5120,5120]);
 assert.equal(partial.includedPatches[0].key,stem+'.weight');
 results.push({pairId:item.pairId,side:item.side,sourceSha256:item.sha256,fullPatchCount:full.operations.length,partialPatchCount:partial.operations.length,excludedPatchCount:partial.excludedTargets.length,coverage:partial.coverage});
}
const report={schemaVersion:'lora-inventory-plan-fixture/1',scope:'RECONSTRUCTED_INVENTORY_SCHEMA_FIXTURE_NOT_RAW_HEADER_NOT_REAL_BASE_OR_GRAPH',contractVersion:CONTRACT_VERSION,inventory:{path:'development/lora/contracts/original-inventory.json',sha256:inventoryHash},originalFilesRead:false,originalFilesRehashed:false,numericalCalculation:false,results};
if(process.argv[2]==='--write'){
 if(!process.argv[3])throw Error('Explicit report output path required');
 fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
