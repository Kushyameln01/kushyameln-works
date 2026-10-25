// Real dedicated Worker harness; browser module runs unchanged via a thin Node bridge.
import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.self={postMessage:(data,transfers)=>parentPort.postMessage(data,transfers)};
globalThis.fetch=async url=>new Response(await readFile(url));
await import('../../docs/shared/animator-integrator/worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));
