import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runInteropCases} from './interop-cases.mjs';
const output=new URL('../../../../development/diffusion-models/rev3-interop.json',import.meta.url);
let previous={};try{previous=JSON.parse(fs.readFileSync(output));}catch{}
try{
 const result=await runInteropCases();
 const {encodeWanRawLatent,decodeWanRawLatent}=await import('../tensor-interop.mjs');
 const original={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:Float32Array.from({length:128},(_,i)=>i/8)};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wan-interop-'));
 try{const file=path.join(dir,'raw.wktensor');fs.writeFileSync(file,await encodeWanRawLatent(original));const restored=await decodeWanRawLatent(fs.readFileSync(file));if(restored.data[127]!==15.875||restored.modelSha256!==original.modelSha256)throw Error('File save/readback changed tensor');result.fileSaveReadback=true;}finally{fs.rmSync(dir,{recursive:true,force:true});}
 previous.node={runtime:process.version,...result};fs.mkdirSync(new URL('.',output),{recursive:true});fs.writeFileSync(output,JSON.stringify(previous,null,2)+'\n');console.log(JSON.stringify(previous.node));
}catch(error){previous.red={runtime:process.version,message:String(error.stack??error)};fs.mkdirSync(new URL('.',output),{recursive:true});fs.writeFileSync(output,JSON.stringify(previous,null,2)+'\n');console.error(String(error.stack??error));process.exitCode=1;}
