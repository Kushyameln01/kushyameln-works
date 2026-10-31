// Transport fixture for the real native createInferenceClient owner test.
// It echoes the native envelope and never loads a model, ORT or Hike runtime.
import {parentPort} from 'node:worker_threads';

let current;
parentPort.on('message',message=>{
  if(message?.fixtureCommand==='finish'){
    if(!current)throw Error('No active transport fixture request');
    const data=Float32Array.from(message.values??[3,5]);
    const reply={...current,type:'success',result:{scope:'transport-fixture-not-model',values:data}};
    parentPort.postMessage(reply,[data.buffer]);
    return;
  }
  current=message;
  parentPort.postMessage({...message,type:'progress',progress:{phase:'transport-fixture-ready',scope:'transport-fixture-not-model'}});
});
