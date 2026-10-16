// Test-only adapter: execute the unmodified browser Worker module in Node.
import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
const kernelURL=new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url).href;
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
globalThis.fetch=async(url,options)=>{
  if(String(url)!==kernelURL||options?.credentials!=='omit')throw Error('Unexpected test fetch');
  return new Response(await readFile(url));
};
await import('../../docs/shared/compute/pool-worker.mjs');
parentPort.on('message',data=>data?.type==='test-ping'?parentPort.postMessage({type:'test-pong'}):self.onmessage?.({data}));
