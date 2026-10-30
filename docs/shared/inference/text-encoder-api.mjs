import {createInferenceClient} from './client.mjs';
import {inspectTextEncoderManifest} from './text-encoder.mjs';
export function createTextEncoderModule({client=createInferenceClient(),ownsClient=true}={}){
 let config=null,disposed=false;
 function ready(){if(disposed)throw Error('TextEncoder module disposed');if(!config)throw Error('Configure TextEncoder model files before encoding');}
 const api={
  capabilities(){return{apiVersion:'works-ai-1',module:'text_encoder',operations:['encode'],inputs:['plain-text','tokenIds+attentionMask'],output:{dtype:'float32',layout:'BLC',meaning:'text_hidden_states',attentionMask:true},maximumTokens:512,arithmetic:'FP32 diagnostic expansion',configured:!!config};},
  configure({manifest,files}){if(disposed)throw Error('TextEncoder module disposed');inspectTextEncoderManifest(manifest);if(!(files instanceof Map))throw TypeError('Local files Map required');if(client.state.status==='running'&&client.state.module==='text_encoder')client.cancel();config={manifest:structuredClone(manifest),files:new Map(files)};return api.capabilities();},
  async encode(input){ready();return client.run({module:'text_encoder',operation:'encode',...config,input});},
  cancel(){if(client.state.status==='running'&&client.state.module==='text_encoder'){client.cancel();return true;}return false;},
  dispose(){api.cancel();config=null;disposed=true;if(ownsClient)client.dispose();}
 };return Object.freeze(api);
}
