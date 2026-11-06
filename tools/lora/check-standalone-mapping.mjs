// Development-only header mapping evidence. Reuses cached whole-source hashes;
// opens only each original header and scalar alpha payload, never dense output.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectSafetensors,readTensor} from '../../docs/shared/inference/lora/safetensors.mjs';
import {createBerniniStandaloneRegistry,STANDALONE_CONTRACT_VERSION} from '../../docs/shared/inference/lora/standalone-registry.mjs';
import {buildStandalonePlan} from '../../docs/shared/inference/lora/standalone-planner.mjs';
import {LOADER_POLICY_ID} from '../../docs/shared/inference/lora/loader-policy.mjs';

const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--assets-root'||args[2]!=='--out')throw Error('Usage: node tools/lora/check-standalone-mapping.mjs --assets-root <local-lora-directory> --out <report.json>');
const root=fileURLToPath(new URL('../../',import.meta.url)),assetsRoot=path.resolve(args[1]),out=path.resolve(args[3]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inventoryPath='development/lora/contracts/original-inventory.json',inventoryBytes=await fs.readFile(path.join(root,inventoryPath)),inventory=JSON.parse(inventoryBytes);
const files=[],union=new Map();
for(const item of inventory){
 const filename=path.join(assetsRoot,item.pairId+'-safetensors',item.fileName),handle=await fs.open(filename,'r');
 let headerRaw,bytesRead=0,alphaPayloadBytesRead=0;
 try{
  const size=(await handle.stat()).size;
  const source={size,async read(offset,length,{signal}={}){signal?.throwIfAborted();const bytes=new Uint8Array(length);const result=await handle.read(bytes,0,length,offset);signal?.throwIfAborted();if(result.bytesRead!==length)throw Error('Truncated local source');bytesRead+=length;if(offset===8)headerRaw=bytes.slice();return bytes;}};
  const inspection=await inspectSafetensors(source),headerSha256=digest(headerRaw),alphaValues={};
  assert.equal(size,item.bytes);assert.equal(headerSha256,item.headerSha256);
  for(const [name,t] of Object.entries(inspection.tensors))if(name.endsWith('.alpha')){
   assert.equal(t.dtype,'BF16');assert.deepEqual(t.shape,[]);
   const bytes=await readTensor(source,inspection,name),view=new DataView(new ArrayBuffer(4));
   view.setUint32(0,new DataView(bytes.buffer,bytes.byteOffset,2).getUint16(0,true)*65536,true);alphaValues[name]=view.getFloat32(0,true);alphaPayloadBytesRead+=bytes.length;
  }
  // The zero model identity is explicitly a structural registry fixture. No
  // original training base or supplied runtime base is authenticated here.
  const registry=createBerniniStandaloneRegistry({modelHash:'0'.repeat(64),side:item.side.toUpperCase()});
  const plan=buildStandalonePlan({inspection,registry,sourceSha256:item.sha256,strength:1,loaderPolicyId:LOADER_POLICY_ID,alphaValues});
  assert.equal(plan.operations.length,item.pairId==='light'?1052:400);
  const patches=plan.operations.map(op=>{
   const elements=op.fullShape.reduce((a,b)=>a*b,1);union.set(op.key,elements);
   return {key:op.key,weightId:op.target.weightId,kind:op.kind,variant:op.variant,fullShape:op.fullShape,coordinateSpace:'original-full-tensor',offsetUnit:'elements',layout:'row-major',parameterRole:op.target.parameterRole,computeDtype:'F32',slice:op.slice,elements,
    rank:op.rank??null,alpha:op.alpha??null,effectiveScaleAtStrength1:op.scale,logicalBinding:op.target.logicalBinding,
    sourceTensors:op.names.map(name=>({name,dtype:inspection.tensors[name].dtype,shape:inspection.tensors[name].shape,dataOffsets:inspection.tensors[name].data_offsets})),
    logicalNameShapeMatched:true,standaloneTargetSupported:true,graphBinding:'UNBOUND',trainingBaseVerified:false,runtimeHostExecution:'NOT_EXECUTED'};
  });
  const selectedElements=patches.reduce((n,p)=>n+p.elements,0),rankProducts=patches.reduce((n,p)=>n+p.elements*(p.rank??0),0);
  assert.equal(selectedElements,item.pairId==='light'?14286919744:14050918400);
  files.push({pairId:item.pairId,side:item.side.toUpperCase(),fileName:item.fileName,bytes:size,
   sourceSha256:item.sha256,sourceHashRole:'CACHED_WHOLE_SOURCE_IDENTITY_NOT_REHASHED_THIS_RUN',sourceWholeHashRecomputed:false,
   headerBytes:inspection.headerBytes,headerSha256,expectedHeaderSha256:item.headerSha256,headerHashMatched:true,headerReadBytes:inspection.headerBytes+8,alphaPayloadBytesRead,totalOriginalBytesRead:bytesRead,
   tensorCount:Object.keys(inspection.tensors).length,sourceDtypes:item.dtypes,alphaValuesCount:Object.keys(alphaValues).length,distinctAlphaValues:[...new Set(Object.values(alphaValues))],
   mappingVersion:registry.mappingVersion,registryVersion:registry.registryVersion,knownLogicalRegistryTargets:registry.targets.length,coverage:plan.coverage,patchCount:patches.length,selectedElements,selectedOutputF32Bytes:selectedElements*4,rankProducts,estimatedMultiplyAddFLOPs:rankProducts*2,excludedTargets:plan.excludedTargets.length,excludedRegions:plan.excludedRegions.length,patches});
 }finally{await handle.close();}
}
const patchCount=files.reduce((n,f)=>n+f.patchCount,0),selectedElements=files.reduce((n,f)=>n+f.selectedElements,0),composedUnionElementsPerSide=[...union.values()].reduce((a,b)=>a+b,0);
assert.equal(patchCount,2904);assert.equal(selectedElements,56675676288);assert.equal(union.size,1052);
const report={schemaVersion:'lora-standalone-mapping-evidence/1',contractVersion:STANDALONE_CONTRACT_VERSION,recordedAt:new Date().toISOString(),scope:'FRESH_ORIGINAL_HEADERS_AND_ALPHA_LOGICAL_MAPPING_NOT_NUMERIC_OR_DIFFUSION_GRAPH_ACCEPTANCE',
 command:'node tools/lora/check-standalone-mapping.mjs --assets-root <local-lora-directory> --out development/lora/standalone/MAPPING.json',
 inventory:{path:inventoryPath,sha256:digest(inventoryBytes),wholeSourceHashes:'REUSED_FROM_EXISTING_INVENTORY',baselineSourceCommit:'86f87f42c8585d823f06810370bc0bd451f3fce3'},
 registryModelIdentityRole:'STRUCTURAL_MAPPING_FIXTURE_NOT_REAL_BASE',freshHeadersRead:true,freshHeaderHashChecksPassed:4,wholeSourceHashesRecomputed:false,sourcePayloadReadScope:'SCALAR_ALPHA_ONLY',numericalCalculation:false,actualInference:false,trainingBaseVerified:false,graphBindings:'UNBOUND',runtimeHostExecution:'NOT_EXECUTED',
 totals:{originalFiles:files.length,logicalPatches:patchCount,selectedElements,separateSourceOutputF32Bytes:selectedElements*4,rankProducts:files.reduce((n,f)=>n+f.rankProducts,0),estimatedMultiplyAddFLOPs:files.reduce((n,f)=>n+f.estimatedMultiplyAddFLOPs,0),composedUnionTargetsPerSide:union.size,composedUnionElementsPerSide,composedUnionOutputF32BytesBothSides:composedUnionElementsPerSide*8,originalBytesRead:files.reduce((n,f)=>n+f.totalOriginalBytesRead,0)},files};
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:out,scope:report.scope,totals:report.totals}));
