import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const messages=[];
globalThis.self={postMessage:message=>messages.push(message)};
const target=new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url).href;
globalThis.fetch=async(url,options)=>{assert.equal(String(url),target);assert.equal(options.credentials,'omit');return new Response(await readFile(url));};
await import('../../docs/shared/compute/compute-worker.mjs');
for(const masks of [[0,3,5],[]]){messages.length=0;await self.onmessage({data:{protocolVersion:1,jobId:'node-wasm',inputRevision:1,taskType:'ft-magnitude-batch',taskVersion:1,payload:{masks,weights:[1,2,4]}}});const last=messages.at(-1);assert.equal(last.type,'result',last.message);assert.deepEqual(last.result,masks);assert.equal(last.metrics.inputCount,masks.length);assert(last.metrics.computeEndEpochMs>=last.metrics.computeStartEpochMs);}
console.log('PASS actual Hike WASM worker handler, fixed fetch, zero/empty and metrics; Node only, browser pending');
