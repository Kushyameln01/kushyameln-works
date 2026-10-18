import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
export const repo=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
export const page=repo+'/docs/animator-composer/';
export async function workerHarness(onMessage=()=>{}){
  let receive,fetches=0,serial=0;const messages=[];
  const context=vm.createContext({console,URL,Blob,File,ArrayBuffer,Uint8Array,DataView,TextEncoder,TextDecoder,WebAssembly,crypto,setTimeout,clearTimeout,
    self:{addEventListener(type,fn){assert.equal(type,'message');receive=fn;},postMessage(data){messages.push(data);onMessage(data);}},
    async fetch(url){const path=fileURLToPath(url);assert.equal(path,repo+'/docs/shared/ft/kernel/ft-kernel.wasm');fetches++;return new Response(await readFile(path));}});
  const modules=new Map();
  function load(path){if(!modules.has(path))modules.set(path,(async()=>{const m=new vm.SourceTextModule(await readFile(path,'utf8'),{context,identifier:pathToFileURL(path).href,initializeImportMeta(meta){meta.url=pathToFileURL(path).href;}});await m.link(s=>load(fileURLToPath(new URL(s,pathToFileURL(path)))));return m;})());return modules.get(path);}
  await(await load(page+'worker.mjs')).evaluate();
  return{messages,async request(data){const id=data.id??++serial,t=performance.now();await receive({data:{...data,id}});return{message:messages.filter(m=>m.id===id&&m.type!=='progress').at(-1),elapsedMs:Math.round(performance.now()-t)};},get fetches(){return fetches;}};
}
export async function inputFile(path){return new File([await readFile(path)],path.split('/').at(-1));}
