import {createInferenceClient} from './client.mjs';
import {createTextEncoderModule} from './text-encoder-api.mjs';
import {createVaeModule} from './vae-api.mjs';
export {createTextEncoderModule,createVaeModule};
export {encodeTensor,decodeTensor,requireTensor} from './tensor.mjs';
export const API_VERSION='works-ai-1';
// One optional shared executor; logical modules remain independent.
export function createInferenceAPI(options={}){
 const client=createInferenceClient(options),textEncoder=createTextEncoderModule({client,ownsClient:false}),vae=createVaeModule({client,ownsClient:false});
 return Object.freeze({apiVersion:API_VERSION,textEncoder,vae,cancel:()=>client.cancel(),get state(){return client.state;},dispose(){textEncoder.dispose();vae.dispose();client.dispose();}});
}
export function bindInferencePort(port,api){
 if(!port?.postMessage||!port?.addEventListener)throw TypeError('An explicitly provided MessagePort is required');
 const pending=new Set();let active=true;
 const listener=async({data:m})=>{
  if(!active)return;
  const id=typeof m?.id==='string'?m.id:'';let ownsId=false;
  try{
   if(m?.apiVersion!==API_VERSION||!id||id.length>128||pending.has(id))throw Error('Invalid API version/request ID');
   const module=m.module==='text_encoder'?api.textEncoder:m.module==='vae'?api.vae:null;
   const methods=m.module==='text_encoder'?['capabilities','configure','encode','cancel']:['capabilities','configure','encode','decode','cancel'];
   if(!module||!methods.includes(m.method))throw Error('Unsupported API module or method');
   pending.add(id);ownsId=true;const result=await module[m.method](m.args);
   if(!active)return;const transfers=[];
   if(result?.tensor?.data?.buffer)transfers.push(result.tensor.data.buffer);
   if(result?.attentionMask?.buffer&&!transfers.includes(result.attentionMask.buffer))transfers.push(result.attentionMask.buffer);
   port.postMessage({apiVersion:API_VERSION,id,ok:true,result},transfers);
  }catch(e){if(active)port.postMessage({apiVersion:API_VERSION,id,ok:false,error:String(e.message??e)});}
  finally{if(ownsId)pending.delete(id);}
 };
 port.addEventListener('message',listener);port.start();return()=>{active=false;port.removeEventListener('message',listener);port.close();};
}
