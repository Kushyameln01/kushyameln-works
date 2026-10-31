"""Pinned native codec/port + outer adapter binary smoke; no model execution."""
import argparse,functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--native-root',required=True);parser.add_argument('--diffusion-root');parser.add_argument('--diffusion-commit',default='9023329b8d803306abcdd9342f24c01ba0df2676');parser.add_argument('--diagnostic-f32',action='store_true');parser.add_argument('--lora-root');args=parser.parse_args()
 repo=pathlib.Path(__file__).resolve().parents[2];native=pathlib.Path(args.native_root).resolve()/'docs/shared/inference'
 if not (native/'tensor.mjs').is_file():raise RuntimeError('Pinned native source closure required')
 class Handler(http.server.BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):
   path=self.path.split('?')[0]
   if path=='/':data=b'<!doctype html><title>AI connection local boundary test</title>';kind='text/html'
   else:
    if path.startswith('/native/'):root=native;relative=path[len('/native/'):]
    elif args.lora_root and path.startswith('/pinned-lora/'):root=pathlib.Path(args.lora_root).resolve()/'docs';relative=path[len('/pinned-lora/'):]
    elif args.diffusion_root and path.startswith('/pinned-diffusion/'):root=pathlib.Path(args.diffusion_root).resolve()/'docs';relative=path[len('/pinned-diffusion/'):]
    elif path.startswith('/shared/ai-connection/'):root=repo/'docs/shared/ai-connection';relative=path[len('/shared/ai-connection/'):]
    else:self.send_error(404);return
    target=(root/relative).resolve()
    if not target.is_relative_to(root) or not target.is_file():self.send_error(404);return
    data=target.read_bytes();kind='text/javascript' if target.suffix in ('.mjs','.js') else 'application/json' if target.suffix=='.json' else 'application/wasm' if target.suffix=='.wasm' else 'application/octet-stream'
   self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   try:
    page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/')
    result=page.evaluate('''async(options)=>{
     const {createInferenceAPI,bindInferencePort,encodeTensor,decodeTensor}=await import('/native/api.mjs');
     const {createTextVaeAdapter}=await import('/shared/ai-connection/adapters/text-vae.mjs');
     const {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor}=await import('/shared/ai-connection/adapters/artifacts.mjs');
     const descriptor=await(await fetch('/shared/ai-connection/examples/g1c-sample-artifact.json')).json();
     const tensor={...descriptor.native.metadata,data:new Float32Array(128).fill(.25)};
     const encoded=await encodeTensor(tensor),decoded=await decodeTensor(encoded);
     const store=createOwnedArtifactStore(),h=captureNativeTensor({tensor:decoded,response:{tensor:decoded,evidence:{scope:'codec-fixture'}},descriptor,store});
     const recovered=restoreNativeTensor(h,store);
     if(recovered.context.sourceFrameIndices.join()!=='4,2,2,1,0'||recovered.latentContract.producerModelSha256s.length!==2||recovered.data.length!==128)throw Error('Lossy codec/store roundtrip');
     const api=createInferenceAPI(),adapter=createTextVaeAdapter({module:'vae',descriptor:{nativeAPI:{version:'works-ai-1',build:'works-inference-v1'},operations:[{operationId:'capabilities',implementationState:'implemented'},{operationId:'decode',implementationState:'implemented'}]},nativeClient:api.vae,binding:{ownerId:'browser:vae',sessionId:'local'},sourceVerified:true});
     const capabilities=await adapter.invoke({requestId:'caps',operationId:'capabilities',localRevision:1});
     if(capabilities.status!=='ok'||capabilities.result.apiVersion!=='works-ai-1')throw Error('Native capabilities boundary failed');
     const rejected=await adapter.invoke({requestId:'unconfigured',operationId:'decode',input:decoded,localRevision:2});
     if(rejected.status!=='error'||rejected.error.nativeCode!==null||!rejected.error.rawMessage.includes('Configure'))throw Error('Native error boundary changed');
     let hostTensor;
     const fixtureHost={vae:{decode:async t=>{hostTensor=t;return {tensor:t,evidence:{scope:'transport-fixture-only'}};}}};
     const {port1,port2}=new MessageChannel(),unbind=bindInferencePort(port1,fixtureHost);
     const reply=await new Promise((resolve,reject)=>{port2.onmessage=e=>resolve(e.data);port2.onmessageerror=reject;port2.postMessage({apiVersion:'works-ai-1',id:'binary',module:'vae',method:'decode',args:decoded});});
     if(!reply.ok||reply.id!=='binary'||reply.result.tensor.data.byteLength!==512||hostTensor.data.byteLength!==0||decoded.data.byteLength!==512)throw Error('Binary ownership transfer mismatch');
     unbind();port2.close();api.dispose();await adapter.dispose();store.clear();
     let diffusion={scope:'not-tested'};
     if(options.withDiffusion){
      const {createDiffusionModels,PROTOCOL_VERSION,BUILD_ID}=await import('/pinned-diffusion/shared/diffusion-models/api/index.mjs');
      const {createDiffusionAdapter}=await import('/shared/ai-connection/adapters/diffusion.mjs');
      const dm=createDiffusionModels({sessionId:'browser-dm'});
      try{
       const a=createDiffusionAdapter({descriptor:{nativeAPI:{version:PROTOCOL_VERSION,build:BUILD_ID},operations:['schedule','eulerStep','validateConditioning','normalizeRawMean','restoreRawMean','linearProjectionF32','loadLora','listLoras','readLora','readLoraSource','unloadLora'].map(operationId=>({operationId,implementationState:'implemented'}))},nativeClient:dm,binding:{ownerId:'browser:dm',sessionId:'manager-dm',nativeSessionId:dm.sessionId,inputRevision:5},sourceVerified:true,cancelOwner:target=>dm.cancel({sessionId:dm.sessionId,jobId:target.requestId,inputRevision:5})});
       const schedule=await a.invoke({requestId:'schedule',operationId:'schedule',localRevision:20,input:{profile:'bernini-comfy-simple6-shift5-v1'}});
       if(schedule.status!=='ok'||schedule.result.sigmas.length!==7||!schedule.result.evidence.hike)throw Error('Actual native Hike schedule boundary failed '+JSON.stringify(schedule));
       const euler=await a.invoke({requestId:'euler',operationId:'eulerStep',localRevision:21,input:{latent:new Float32Array([1,2]),denoised:new Float32Array([.5,1]),sigma:1,nextSigma:.5}});
       if(euler.status!=='ok'||euler.result.latent.join()!=='.75,1.5'.replace('.75','0.75'))throw Error('Actual native Hike Euler mismatch '+JSON.stringify(euler));
       const rawMean={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:new Float32Array(128).fill(.25)};
       const normalized=await a.invoke({requestId:'normalize',operationId:'normalizeRawMean',localRevision:22,input:{tensor:rawMean}});
       if(normalized.status!=='ok')throw Error('Native normalization failed '+JSON.stringify(normalized));
       const restored=await a.invoke({requestId:'restore',operationId:'restoreRawMean',localRevision:23,input:{tensor:normalized.result.tensor}});
       if(restored.status!=='ok'||restored.result.tensor.meaning!=='raw-posterior-mean'||restored.result.tensor.data.some(x=>Math.abs(x-.25)>1e-6))throw Error('Native mean roundtrip mismatch');
       const conditioning=await a.invoke({requestId:'conditioning',operationId:'validateConditioning',localRevision:24,input:{tensor:{dtype:'float32',shape:[1,1,4096],layout:'BLC',meaning:'text_hidden_states',modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',attentionMask:new Uint8Array([1]),data:new Float32Array(4096)}}});
       if(conditioning.status!=='ok')throw Error('Native conditioning boundary failed '+JSON.stringify(conditioning));
       let f32Projection=null;
       if(options.diagnosticF32){
        const weight=new Float32Array(81920),x=new Float32Array(5120),bias=new Float32Array(16).fill(.5);
        for(let i=0;i<16;i++){weight[i*5120+i]=1;x[i]=i;}
        const projected=await a.invoke({requestId:'f32-projection',operationId:'linearProjectionF32',localRevision:25,input:{weight,x,bias}});
        if(projected.status!=='ok'||projected.result.output.some((v,i)=>v!==i+.5)||projected.result.modelInference!==false||projected.result.partialOnly!==true)throw Error('Native F32 projection failed '+JSON.stringify(projected));
        f32Projection={output:Array.from(projected.result.output),executionProviders:projected.result.evidence.executionProviders,ortVersion:projected.result.evidence.ortVersion,scope:projected.result.evidence.scope};
       }
       let loraSource=null;
       if(options.withLora){
        const down=new Float32Array(5120).fill(.25),up=new Float32Array(5120).fill(.5);
        const header=new TextEncoder().encode(JSON.stringify({'diffusion_model.blocks.0.self_attn.q.lora_down.weight':{dtype:'F32',shape:[1,5120],data_offsets:[0,down.byteLength]},'diffusion_model.blocks.0.self_attn.q.lora_up.weight':{dtype:'F32',shape:[5120,1],data_offsets:[down.byteLength,down.byteLength+up.byteLength]}}));
        const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,BigInt(header.length),true);const file=new File([prefix,header,down,up],'explicit-synthetic-native-lora.safetensors');
        const loaded=await a.invoke({requestId:'load-native-lora',operationId:'loadLora',localRevision:30,input:{file,stage:'HIGH',strength:1,baseModelSha256:'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52'}});
        if(loaded.status!=='ok'||loaded.result.applied!==false)throw Error('Native LoRA registration failed '+JSON.stringify(loaded));
        const {createLoraSource}=await import('/pinned-diffusion/shared/diffusion-models/lora/source.mjs');
        const source=createLoraSource({sessionId:dm.sessionId,binding:loaded.result,inputRevision:5,request:async q=>{const r=await a.invoke({requestId:q.jobId,operationId:q.op,localRevision:31,input:q.input});return r.native.rawReply;}});
        const verifiedSourceHash=await source.hash();
        const {createLoraV2,CONTRACT_VERSION}=await import('/pinned-lora/shared/inference/lora/sdk-v2.mjs');const sdk=await createLoraV2({sourceFactory:()=>source});
        try{
         const {createLoraAdapter}=await import('/shared/ai-connection/adapters/lora.mjs');
         const peer=createLoraAdapter({descriptor:{nativeAPI:{version:CONTRACT_VERSION,build:sdk.kernelInfo.wasmSha256},operations:[{operationId:'inspect',implementationState:'implemented'}]},nativeClient:sdk,binding:{ownerId:'browser:lora',sessionId:'lora-manager'},sourceVerified:true});
         const inspected=await peer.invoke({requestId:'inspect-native-lora',operationId:'inspect',nativeArguments:[{pairId:'explicit-fixture',noise:'high'}],localRevision:32,nativeRevisionBinding:{sdkInstanceId:sdk.sdkInstanceId,inputRevision:0,applicationRevision:0}});
         if(inspected.status!=='ok'||inspected.result.tensorCount!==2||inspected.result.generationReady!==false)throw Error('Actual LoRA v2 source boundary failed '+JSON.stringify(inspected));
         loraSource={scope:'synthetic File registration to actual source adapter to actual LoRA v2 inspect; no application',fileBytes:file.size,fullFileSHA256:verifiedSourceHash,tensorCount:2,sourceState:inspected.result.state,sdkSourceSha256:inspected.result.sourceSha256};await peer.dispose();
        }finally{await sdk.dispose();}
        const unloaded=await a.invoke({requestId:'unload-native-lora',operationId:'unloadLora',localRevision:33,input:{bindingId:loaded.result.bindingId,stage:'HIGH'}});if(unloaded.status!=='ok')throw Error('Native LoRA unload failed');
       }
       diffusion={loraSource,f32Projection,mean128Roundtrip:true,conditioningL:1,scope:'actual-native-partial-Hike-ORT-operations; no model or real-base acceptance',source:options.diffusionCommit,build:BUILD_ID,scheduleBoundaries:7,euler:Array.from(euler.result.latent)};await a.dispose();
      }finally{dm.dispose();}
     }
     return {scope:'real-native-codec-and-native-port-host-with-fixture-endpoint; no model inference',nativeSource:'54bfeadbd83f1fea074c503c0e05ec478aba5cfb',browser:navigator.userAgent,encodedBytes:encoded.byteLength,dataBytes:512,producers:2,sourceFrames:5,nativeHostTransferredViewDetached:true,callerInputRetained:true,capabilities:true,nativeStringErrorPreserved:true,diffusion};
    }''',{'withDiffusion':bool(args.diffusion_root),'diffusionCommit':args.diffusion_commit,'diagnosticF32':args.diagnostic_f32,'withLora':bool(args.lora_root)})
    if errors:raise RuntimeError(str(errors))
    print(json.dumps(result,ensure_ascii=False,indent=2))
   finally:browser.close()
 finally:server.shutdown();server.server_close();thread.join(timeout=5)
if __name__=='__main__':main()
