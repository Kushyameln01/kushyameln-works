import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
globalThis.fetch=async(url)=>new Response(await readFile(new URL(url)));
await import(workerData.kind==='scan'?'../../docs/shared/parameter-registrar/scan-worker.mjs':workerData.bundle?'../../docs/shared/compute/pool-worker.bundle.mjs':'../../docs/shared/compute/pool-worker.mjs');
parentPort.on('message',data=>self.onmessage?.({data}));
