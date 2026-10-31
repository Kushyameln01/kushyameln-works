#!/usr/bin/env node
// Private bounded-range export. Never writes model bytes into the repository.
import {open,readFile,writeFile,mkdir,realpath,lstat,stat} from 'node:fs/promises';
import {isAbsolute,resolve,relative,dirname,basename,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBerniniDiagnosticBase} from '../../docs/shared/diffusion-models/lora/diagnostic-base.mjs';
import {BASE_MODEL_HASHES} from '../../docs/shared/diffusion-models/lora/weights.mjs';
import {TARGET_PROVENANCE} from '../../docs/shared/diffusion-models/lora/targets.mjs';

const repository=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const MAX_READ=181280;
const digest=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const inside=(root,path)=>{const r=relative(root,path);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};
async function canonicalFuturePath(path){
 let p=resolve(path),tail=[];
 for(;;){try{return resolve(await realpath(p),...tail.reverse());}catch(e){if(e.code!=='ENOENT')throw e;const parent=dirname(p);if(parent===p)throw e;tail.push(basename(p));p=parent;}}
}
async function privateOutput(path){
 if(typeof path!=='string'||!isAbsolute(path))throw Error('Output must be an absolute private path');
 const target=await canonicalFuturePath(path),repo=await realpath(repository);
 if(inside(repo,target)||inside(repository,resolve(path)))throw Error('Private base bytes cannot be written inside the repository');
 for(let parent=dirname(target);;parent=dirname(parent)){
  try{
   const marker=join(parent,'.git'),kind=await stat(marker);
   // Managed workspaces can contain empty protected .git placeholders. A real
   // repository has HEAD or a linked-worktree gitdir file, not only that name.
   if(kind.isFile()&&(await readFile(marker,'utf8')).startsWith('gitdir:'))throw Error('Private base bytes cannot be written inside any Git repository');
   if(kind.isDirectory()&&(await stat(join(marker,'HEAD'))).isFile())throw Error('Private base bytes cannot be written inside any Git repository');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  if(dirname(parent)===parent)break;
 }
 try{await lstat(path);throw Error('Refusing to overwrite existing private artifact');}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(dirname(target),{recursive:true});return target;
}

async function openBoundedModel(path){
 const fd=await open(path,'r'),initial=await fd.stat({bigint:true});
 let actualSourceReadBytes=0,maximumReadBytes=0;
 const verify=async()=>{const s=await fd.stat({bigint:true});if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>s[k]!==initial[k]))throw Error('Original model inode, size or modification identity changed');};
 async function read(start,length){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<1||length>MAX_READ||start+length>Number(initial.size))throw RangeError('Export source read must be an actual bounded range');
  await verify();const data=Buffer.alloc(length);let at=0;
  while(at<length){const r=await fd.read(data,at,length-at,start+at);if(!r.bytesRead)throw Error('Short original-model range read');at+=r.bytesRead;}
  await verify();actualSourceReadBytes+=length;maximumReadBytes=Math.max(maximumReadBytes,length);return data;
 }
 // Node24 openAsBlob misreports >4GiB files. This exporter-only adapter keeps
 // the real opened inode/size and checks stat identity around every actual read.
 const blob=new class extends Blob{
  get size(){return Number(initial.size);}
  slice(start=0,end=this.size){return {async arrayBuffer(){const b=await read(start,end-start);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}};}
  async arrayBuffer(){throw Error('Whole-model materialization is forbidden in the bounded exporter');}
  stream(){throw Error('Whole-model streaming is not part of this export');}
 };
 return {blob,read,verify,stats:()=>({actualSourceReadBytes,maximumReadBytes}),close:()=>fd.close()};
}

export async function exportE1BaseBlock({models,output}={}){
 if(typeof models!=='string'||!models)throw Error('Explicit --models directory required');
 const destination=await privateOutput(output),manifestBytes=await readFile(join(models,'manifest.json')),prior=JSON.parse(manifestBytes),manifestSha256=await digest(manifestBytes);
 if(!Array.isArray(prior))throw Error('Prior-owner download manifest must be an array');
 const hikeBytes=await readFile(new URL('../../docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm',import.meta.url));
 const artifact={schemaVersion:'bernini-diagnostic-base-block/0.1',scope:'PARTIAL',fullFileHashRecomputed:false,sides:{}};
 let actualSourceReadBytes=0,maximumReadBytes=0;
 for(const side of ['HIGH','LOW']){
  const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side)),receipt=prior.find(r=>r.name===pinned.name);
  if(!receipt||receipt.verified!==true||receipt.bytes!==pinned.fileBytes||receipt.sha256!==BASE_MODEL_HASHES[side])throw Error('Missing matching prior-owner full hash receipt for '+side);
  const file=await openBoundedModel(join(models,pinned.name));let base;
  try{
   if(file.blob.size!==pinned.fileBytes)throw Error('Original model size differs from prior receipt');
   base=await createBerniniDiagnosticBase({file:file.blob,side,rowStart:0,hikeBytes});
   const registry=base.describe(),payloadStart=8+181280,targets=registry.targets;
   const header=await file.read(8,181280),headerObject=JSON.parse(header.toString('utf8'));
   const selections=[
    ['header',8,181280],
    ['q.weight',payloadStart+targets[0].source.payloadByteOffset,81920],
    ['q.bias',payloadStart+targets[1].source.payloadByteOffset,32],
    ['weight_scale',payloadStart+headerObject[targets[0].fp8.scaleKey].data_offsets[0],4],
    ['comfy_quant',payloadStart+headerObject[registry.quantizationConfig.key].data_offsets[0],27]
   ];
   const ranges=[];
   for(const [id,absoluteByteOffset,byteLength]of selections){const bytes=id==='header'?header:await file.read(absoluteByteOffset,byteLength);ranges.push({id,absoluteByteOffset,byteLength,sha256:await digest(bytes),encoding:'base64',data:bytes.toString('base64')});}
   await file.verify();
   artifact.sides[side]={registry,source:{name:pinned.name,fileBytes:pinned.fileBytes,modelSha256:BASE_MODEL_HASHES[side],priorOwnerReceipt:{kind:'retained-download-manifest',manifestSha256,sha256:receipt.sha256,verified:true,verification:'PRIOR_OWNER_RECEIPT_NOT_REHASHED',authenticity:'not-independently-certified'}},ranges};
   const stats=file.stats();actualSourceReadBytes+=stats.actualSourceReadBytes;maximumReadBytes=Math.max(maximumReadBytes,stats.maximumReadBytes);
  }finally{base?.dispose();await file.close();}
 }
 const bytes=Buffer.from(JSON.stringify(artifact)+'\n');if(bytes.length>=1048576)throw Error('Bounded block artifact exceeds the 1MiB format budget');
 await writeFile(destination,bytes,{flag:'wx',mode:0o600});
 return {schemaVersion:artifact.schemaVersion,scope:'PARTIAL',output:destination,bytes:bytes.length,sha256:await digest(bytes),fullFileHashRecomputed:false,providedRanges:['header','q.weight','q.bias','weight_scale','comfy_quant'],actualSourceReadBytes,maximumReadBytes};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){if(!['--models','--output'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i].slice(2)))throw Error('Usage: --models original-directory --output absolute-private-path');options[args[i].slice(2)]=args[i+1];}
  console.log(JSON.stringify(await exportE1BaseBlock(options)));
 }catch(error){console.error(String(error.message??error));process.exitCode=1;}
}
