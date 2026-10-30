// Read original bytes without a whole-model allocation. Run from the repository root.
import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectSafetensors} from '../../docs/shared/inference/lora/safetensors.mjs';
import {analyze} from '../../docs/shared/inference/lora/planner.mjs';
const root=process.argv[2]??'/workspace/work/lora';
const files=[['light-safetensors','Bernini-R_LightX2V_high_noise.safetensors','high'],['light-safetensors','Bernini-R_LightX2V_low_noise.safetensors','low'],['detail-safetensors','NSFW-22-H-e8.safetensors','high'],['detail-safetensors','NSFW-22-L-e8.safetensors','low']];
const results=[];
for(const [category,name,noise] of files){
 const file=await fs.open(path.join(root,category,name));try{
  const stat=await file.stat();let readBytes=0;
  const source={size:stat.size,async read(offset,length){const bytes=new Uint8Array(length);const {bytesRead}=await file.read(bytes,0,length,offset);readBytes+=bytesRead;return bytes.subarray(0,bytesRead);}};
  const parsed=await inspectSafetensors(source),analysis=analyze(parsed),dtypes={};for(const t of Object.values(parsed.tensors))dtypes[t.dtype]=(dtypes[t.dtype]??0)+1;
  results.push({category,noise,file:name,size:stat.size,tensorCount:Object.keys(parsed.tensors).length,metadata:parsed.metadata,dtypes,headerReadBytes:readBytes,lowRankPairs:analysis.groups.filter(g=>g.down&&g.up).length,weightDiffs:analysis.groups.filter(g=>g.diff).length,biasDiffs:analysis.groups.filter(g=>g.bias).length,unknownTensors:analysis.unknown,baseCompatibility:'NOT_VERIFIED',actualInference:'NOT_VERIFIED'});
 }finally{await file.close();}
}
const result={schemaVersion:1,recordedAt:new Date().toISOString(),scope:'four original local safetensors headers; no base inferred',results};
console.log(JSON.stringify(result,null,2));
