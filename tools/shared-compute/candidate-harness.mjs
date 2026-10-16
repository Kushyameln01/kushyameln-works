// Local candidate validation. Never claims verified-deployed-pages-copy.
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const root=resolve(process.env.COMPUTE_SOURCE_ROOT??fileURLToPath(new URL('../../docs',import.meta.url)));
export const base=pathToFileURL(root+'/');
const {createComputePool}=await import(new URL('shared/compute/pool.mjs',base));
const {prepareTaskModule}=await import(new URL('shared/compute/tasks.mjs',base));
const allowed=['shared/unity-analysis/kernel/unity-analysis.wasm','shared/ft/kernel/ft-kernel.wasm','shared/media/kernel/lbp-scalar.wasm'].map(p=>new URL(p,base).href);
const fetchImpl=async url=>{if(!allowed.includes(String(url)))throw Error('Unexpected candidate module fetch');return new Response(await readFile(new URL(url)),{headers:{'content-type':'application/wasm'}});};
export function candidatePool({concurrency=2,moduleReuse=false,mode='module'}={}){
  return createComputePool({concurrency,moduleReuse,workerMode:mode,prepareModule:o=>prepareTaskModule({...o,fetchImpl}),workerFactory:()=>{
    const worker=new Worker(new URL('./candidate-worker.mjs',import.meta.url),{workerData:{root,mode}});
    const bridge={postMessage:(data,transfer)=>worker.postMessage(data,transfer),terminate:()=>worker.terminate(),onmessage:null,onerror:null,onmessageerror:null};
    worker.on('message',data=>bridge.onmessage?.({data}));worker.on('error',error=>bridge.onerror?.(error));worker.on('messageerror',error=>bridge.onmessageerror?.(error));return bridge;
  }});
}
