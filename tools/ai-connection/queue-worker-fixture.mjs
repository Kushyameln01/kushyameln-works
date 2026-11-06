import {parentPort} from 'node:worker_threads';
parentPort.on('message',message=>{
 if(message.op==='ready')parentPort.postMessage({ready:true});
 if(message.op==='sum')parentPort.postMessage({sum:message.data.reduce((a,b)=>a+b,0)});
});
