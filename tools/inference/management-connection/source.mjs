// Development bootstrap only. Copy the real fixed source import closure from
// locally acquired Git objects; no branch checkout, network, model or export.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,posix,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const exec=promisify(execFile);
export const MANAGEMENT_COMMIT='e1661e561dfb1a4f20544ff48bc375175b5981d1';
export const DIFFUSION_COMMIT='ffeeeedb6b57d182a977c3ac02c042ce235fc87a';
export const MANAGEMENT_SOURCE_ROOTS=Object.freeze([
 'docs/shared/ai-connection/adapters/text-vae.mjs',
 'docs/shared/ai-connection/adapters/artifacts.mjs',
 'docs/shared/ai-connection/queue.mjs',
 'docs/shared/ai-connection/management-workspace.mjs'
]);
const conditioningPath='docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs';

export function validateSourcePath(path){
 if(typeof path!=='string'||!path||posix.isAbsolute(path)||posix.normalize(path)!==path||path.endsWith('/')||/[\\\u0000-\u001f\u007f:%?#]/.test(path)||path.split('/').some(part=>part==='.'||part==='..'))throw TypeError('Unsafe source path: '+String(path));
 return path;
}

export function relativeSourceDependencies(path,bytes){
 validateSourcePath(path);
 const imports=/(?:import|export)\s+[^'";\n]*?(?:from\s*)?['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,dependencies=[];
 for(const match of bytes.toString('utf8').matchAll(imports)){
  const specifier=match[1]??match[2];
  if(!/^\.\.?\//.test(specifier)||/[\\\u0000-\u001f\u007f:%?#]/.test(specifier))throw TypeError('Unsafe relative source import: '+specifier);
  dependencies.push(validateSourcePath(posix.normalize(posix.join(posix.dirname(path),specifier))));
 }
 return [...new Set(dependencies)];
}

export async function acquireSourceClosure({repositoryRoot,outputRoot,commit,roots}){
 if(!/^[a-f0-9]{40}$/.test(commit)||!Array.isArray(roots)||!roots.length)throw TypeError('Full commit and explicit roots required');
 const root=resolve(outputRoot);await mkdir(root,{recursive:false});
 const pending=[...roots],seen=new Set(),files=[];
 while(pending.length){
  const path=pending.shift();if(seen.has(path))continue;seen.add(path);
  validateSourcePath(path);
  const {stdout:bytes}=await exec('git',['show',commit+':'+path],{cwd:repositoryRoot,encoding:'buffer',maxBuffer:8*1024*1024});
  const destination=resolve(root,path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:'wx'});
  const gitBlobSha=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),gitBlobSha});
  pending.push(...relativeSourceDependencies(path,bytes));
 }
 const receipt={repository:'Kushyameln01/kushyameln-works',commit,method:'git show exact acquired full commit; static relative source import closure',roots,files,scope:'Source acquisition only; no model inference or numeric acceptance'};
 await writeFile(resolve(root,'ACQUISITION.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return {root,receipt};
}

export async function acquireConnectionSources({repositoryRoot,outputRoot}){
 const root=resolve(outputRoot);await mkdir(root,{recursive:false});
 const management=await acquireSourceClosure({repositoryRoot,outputRoot:resolve(root,'management'),commit:MANAGEMENT_COMMIT,roots:MANAGEMENT_SOURCE_ROOTS});
 const diffusion=await acquireSourceClosure({repositoryRoot,outputRoot:resolve(root,'diffusion'),commit:DIFFUSION_COMMIT,roots:[conditioningPath]});
 return {management,diffusion};
}

export async function importManagementSource(root){
 const imp=path=>import(pathToFileURL(resolve(root,path)).href);
 const [adapter,artifacts,queue,workspace]=await Promise.all(MANAGEMENT_SOURCE_ROOTS.map(imp));
 return Object.freeze({...adapter,...artifacts,...queue,...workspace});
}
export const importDiffusionConditioning=root=>import(pathToFileURL(resolve(root,conditioningPath)).href);
