// Test-only Node bridge for a named source candidate. This is not Pages acquisition evidence.
import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const base=pathToFileURL(workerData.root+'/');
const allowed=['shared/unity-analysis/kernel/unity-analysis.wasm','shared/ft/kernel/ft-kernel.wasm','shared/media/kernel/lbp-scalar.wasm'].map(p=>new URL(p,base).href);
globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
globalThis.fetch=async(url,options)=>{
  if(!allowed.includes(String(url))||options?.credentials!=='omit')throw Error('Unexpected candidate test fetch');
  return new Response(await readFile(new URL(url)),{headers:{'content-type':'application/wasm'}});
};
await import(new URL('shared/compute/'+(workerData.mode==='bundle'?'pool-worker.bundle.mjs':'pool-worker.mjs'),base));
parentPort.on('message',data=>self.onmessage?.({data}));
