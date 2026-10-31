"""Synthetic source/base contract run through fixed peer SDK/Hike + real ORT/Hike.
Never opens/downloads any original model or LoRA payload. No joint acceptance.
"""
import argparse,http.server,json,threading,urllib.parse,base64,struct,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--peer',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--base-artifact',type=Path);a=p.parse_args()
repo=Path(__file__).resolve().parents[2];peer=a.peer.resolve()
allowed={
'/tools/ai-connection/test-lora-diffusion.mjs',
'/docs/shared/diffusion-models/lora/v2-adapter.mjs',
'/docs/shared/diffusion-models/lora/base-block.mjs',
'/docs/shared/diffusion-models/lora/weights.mjs',
'/docs/shared/diffusion-models/lora/targets.mjs',
'/docs/shared/diffusion-models/lora/strict-json.mjs',
'/docs/shared/diffusion-models/api/safetensors.mjs',
'/docs/shared/diffusion-models/lora/diagnostic-consumer.mjs',
'/docs/shared/diffusion-models/lora/diagnostic-identity.mjs',
'/docs/shared/vr180/sha256.mjs',
'/docs/shared/diffusion-models/ort-bridge/stage.mjs',
'/docs/shared/diffusion-models/ort-bridge/graph.mjs',
'/docs/shared/diffusion-models/ort-bridge/hike.mjs',
'/docs/shared/diffusion-models/ort-bridge/kernel/registry.mjs',
'/docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm',
'/docs/shared/inference/vendor/ort.wasm.min.mjs',
'/docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs',
'/docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'}
peer_allowed={'sdk-v2.mjs','planner-v2.mjs','loader-policy.mjs','planner.mjs','safetensors.mjs','kernel/host.mjs','kernel/registry.mjs','kernel/lora.wasm'}
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urllib.parse.urlsplit(self.path).path
  if path=='/e1':raw=b'<!doctype html><meta charset="utf-8">'
  elif path.startswith('/peer/') and path[6:] in peer_allowed:raw=(peer/path[6:]).read_bytes()
  elif path in allowed:raw=(repo/path[1:]).read_bytes()
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type','application/wasm' if path.endswith('.wasm') else 'text/javascript' if path.endswith('.mjs') else 'text/html');self.end_headers();self.wfile.write(raw)
payload={'registries':json.loads((repo/'development/ai-connection/diagnostic-registry-examples.json').read_text())['registries'],'artifact':None,'reference':{}}
if a.base_artifact:
 if a.base_artifact.resolve().is_relative_to(repo):p.error('Private base artifact must be outside the repository')
 raw=a.base_artifact.read_bytes();artifact=json.loads(raw);payload['artifact']=artifact;payload['artifactSha256']=hashlib.sha256(raw).hexdigest()
 previous={x['side']:x for x in json.loads((repo/'development/ai-connection/l1-reference.json').read_text())['models']}
 def f32(v):return struct.unpack('<f',struct.pack('<f',v))[0]
 for side,data in artifact['sides'].items():
  ranges={x['id']:base64.b64decode(x['data'],validate=True) for x in data['ranges']};scale=struct.unpack('<f',ranges['weight_scale'])[0];weights=[]
  for code in ranges['q.weight']:
   if code&127==127:raise ValueError('Nonfinite FP8 code')
   exponent=(code>>3)&15;mantissa=code&7;value=mantissa*2**-9 if exponent==0 else (1+mantissa/8)*2**(exponent-7)
   weights.append(f32((-value if code&128 else value)*scale))
  weight=struct.pack('<81920f',*weights);bias=struct.pack('<16f',*struct.unpack('<16e',ranges['q.bias']))
  assert hashlib.sha256(weight).hexdigest()==previous[side]['weightSHA256'];assert hashlib.sha256(bias).hexdigest()==previous[side]['biasSHA256']
  payload['reference'][side]={'weight':base64.b64encode(weight).decode(),'bias':base64.b64encode(bias).decode()}
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/e1')
   r=page.evaluate('''async (payload)=>{try{const registries=payload.registries;
    const {diagnosticRegistryHash}=await import('/docs/shared/diffusion-models/lora/diagnostic-identity.mjs');
    const {runLoraDiffusionDiagnostic}=await import('/tools/ai-connection/test-lora-diffusion.mjs');
    const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),b=>b.toString(16).padStart(2,'0')).join('');
    const results=[];
    for(const includeBias of [false,true])for(const original of registries){
     let r=structuredClone(original),base,weight,bias;
     if(payload.artifact){const {createBerniniBlockProvider}=await import('/docs/shared/diffusion-models/lora/base-block.mjs');base=await createBerniniBlockProvider({artifact:payload.artifact,side:r.side});r=base.describe();const decode=s=>new Float32Array(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);weight=decode(payload.reference[r.side].weight);bias=decode(payload.reference[r.side].bias);}
     else{r.baseVerification={kind:'SYNTHETIC_CONTRACT_FIXTURE',fullFileSHA256Verified:false};r.registryHash=diagnosticRegistryHash(r);weight=new Float32Array(81920).fill(.25);bias=new Float32Array(16).fill(2);base={describe:()=>structuredClone(r),baseProvider:{async readBlock(id,o,n,c){if(c.registryHash!==r.registryHash)throw Error('wrong native identity');return(id==='q.weight'?weight:bias).slice(o,o+n);}}};}
     const stem='diffusion_model.blocks.0.self_attn.q',tensors={},down=new Float32Array(5120);down[0]=1;
     tensors[stem+(includeBias?'.lora_down.weight':'.lora_A.weight')]={shape:[1,5120],data:down};tensors[stem+(includeBias?'.lora_up.weight':'.lora_B.weight')]={shape:[5120,1],data:new Float32Array(5120).fill(2)};
     if(includeBias){tensors[stem+'.alpha']={shape:[],data:Float32Array.of(1)};tensors[stem+'.diff_b']={shape:[5120],data:new Float32Array(5120).fill(3)};}
     let offset=0;const header={},parts=[];for(const [name,t]of Object.entries(tensors)){header[name]={dtype:'F32',shape:t.shape,data_offsets:[offset,offset+t.data.byteLength]};offset+=t.data.byteLength;parts.push(t.data);}
     const text=new TextEncoder().encode(JSON.stringify(header)),prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(text.length),true);const blob=new Blob([prefix,text,...parts]),digest=await sha(await blob.arrayBuffer());
     const source={size:blob.size,read:async(o,n)=>new Uint8Array(await blob.slice(o,o+n).arrayBuffer()),hash:async()=>digest};
     const x=new Float32Array(5120);x[0]=1;const patched=weight.slice();for(let row=0;row<16;row++)patched[row*5120]=Math.fround(weight[row*5120]+2);const patchedBias=Float32Array.from(bias,v=>includeBias?Math.fround(v+3):v),patchOutput=Float32Array.from(bias,(_,i)=>Math.fround(patched[i*5120]+patchedBias[i])),baseOutput=Float32Array.from(bias,(_,i)=>Math.fround(weight[i*5120]+bias[i]));
     const result=await runLoraDiffusionDiagnostic({peerRootUrl:new URL('/peer/',location.href).href,base,loraSource:source,selection:{pairId:includeBias?'light':'detail',noise:r.side.toLowerCase()},strength:1,reference:{x,expected:patchOutput,tolerance:{absolute:0,relative:0}},baseReference:{x,expected:baseOutput,tolerance:{absolute:0,relative:0}},expectedWeight:patched,expectedBias:patchedBias,expectedBaseWeight:weight,expectedBaseBias:bias,weightTolerance:{absolute:0,relative:0},expectedSourceSha256:digest,evidenceScope:payload.artifact?'real-base-synthetic-lora':'synthetic-contract',isCurrent:()=>true});
     if(result.realOriginalJoint!==false||result.generationReady!==false)throw Error('contract fixture falsely promoted');if(base.dispose)base.dispose();results.push(result);
    }
    return {passed:true,results};
   }catch(e){return {passed:false,error:String(e.stack||e),progress:e.e1Progress};}}''',payload)
   report={'browser':browser.version,'evidenceScope':'ACTUAL_BASE_SYNTHETIC_LORA_REAL_SDK_HIKE_ORT_PARTIAL_ONLY' if a.base_artifact else 'SYNTHETIC_CONTRACT_REAL_SDK_HIKE_ORT_ONLY','privateArtifactSha256':payload.get('artifactSha256'),'realOriginalJoint':False,'pageErrors':errors,**r};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'cases':len(report.get('results',[])),'pageErrors':errors,'error':report.get('error'),'output':str(a.output)}));assert report['passed'] and not errors
  finally:browser.close()
finally:server.shutdown();server.server_close()
