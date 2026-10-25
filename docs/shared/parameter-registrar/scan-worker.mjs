import {readMotionDocuments} from './core.mjs';
// Separate from the shared pool's bounded jobs: only eligible document text is
// passed back; cancellation terminates this session's own scanner.
self.onmessage=async({data})=>{
  const identity={sessionId:data?.sessionId,requestId:data?.requestId,inputRevision:data?.inputRevision};
  try{
    if(data?.version!==1||typeof identity.sessionId!=='string'||typeof identity.requestId!=='string'||!Number.isSafeInteger(identity.inputRevision)||identity.inputRevision<0||!(data.bytes instanceof Uint8Array))throw Error('Invalid package scan input');
    const result=await readMotionDocuments(data.bytes);
    self.postMessage({...identity,type:'result',...result});
  }catch(error){self.postMessage({...identity,type:'error',message:String(error?.message??error).slice(0,1000)});}
};
