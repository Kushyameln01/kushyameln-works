#!/usr/bin/env python3
"""Verify approved Diffusion Pages bytes and real browser API/WASM behavior.

Only GET requests to --base-url's origin are allowed. No model or fixture is
served/uploaded. --model-file uses a browser-local File and header-only inspect.
Full-model load/predict/sample are expected to remain NOT_READY.
"""
import argparse,hashlib,json,os,re,sys,time,traceback,urllib.parse,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BROWSER_CASES=r'''async ({apiUrl,codecUrl,peerUrl,expectedBuild,checkPeers})=>{
 const mod=await import(apiUrl),codec=await import(codecUrl),cases=[],workerEvents=[];
 const assert=(yes,message)=>{if(!yes)throw Error(message);};
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const NativeWorker=globalThis.Worker;
 globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);workerEvents.push({event:'created',url:String(args[0]),type:args[1]?.type});}terminate(){workerEvents.push({event:'terminated'});return super.terminate();}};
 const api=mod.createDiffusionModels({sessionId:'live-public-direct'});let seq=0;
 const request=(op,input={})=>({protocolVersion:mod.PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'live-'+(++seq),inputRevision:0,op,input});
 const ask=(op,input)=>api.request(request(op,input));
 const test=async(name,fn)=>{try{const result=await fn();cases.push({name,passed:true,...(result===undefined?{}:{result})});}catch(e){cases.push({name,passed:false,error:String(e.stack??e)});}};
 const ok=r=>{assert(r.status==='ok',JSON.stringify(r.error));assert(r.buildId===expectedBuild,'Wrong response build');return r.result;};
 const VAE='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b';
 const TE='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
 const raw={dtype:'float32',shape:[1,16,2,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:VAE,data:Float32Array.from({length:128},(_,i)=>(i%17-8)/4)};
 try{
 await test('same-page API advertises bounded implemented scope',async()=>{assert(mod.BUILD_ID===expectedBuild,'Module build mismatch');const r=ok(await ask('capabilities'));assert(r.modelInference===false&&r.partialOnly===true&&r.execution==='dedicated-worker','Capabilities scope');for(const op of ['eulerStep','schedule','noiseMix','inverseNoiseScale','flowDenoised','normalizeRawMean','restoreRawMean','linearProjection','inspect'])assert(r[op]===true,'Missing capability '+op);return r;});
 await test('actual dedicated Worker and Hike Euler preserve caller arrays',async()=>{const a=new Float32Array([3,7,-2]),b=new Float32Array([1,3,2]);const r=ok(await ask('eulerStep',{latent:a,denoised:b,sigma:2,nextSigma:1}));assert(r.latent instanceof Float32Array&&String([...r.latent])==='2,5,0','Euler literal');assert(String([...a])==='3,7,-2'&&String([...b])==='1,3,2','Caller ownership');assert(r.hikeWasmSHA256?.length===64,'Hike identity');return{values:[...r.latent],hikeWasmSHA256:r.hikeWasmSHA256,memoryBytes:r.memoryBytes};});
 await test('Hike discrete simple6 shifted schedule and HIGH LOW overlap',async()=>{const r=ok(await ask('schedule',{profile:'bernini-comfy-simple6-shift5-v1'}));const expected=[1,0.9617158770561218,0.9092148542404175,0.8333333134651184,0.7148972749710083,0.5005995035171509,0];assert(r.sigmas instanceof Float32Array&&r.sigmas.every((v,i)=>Object.is(v,expected[i])),'Schedule values');assert(String([...r.tableIndices])==='999,833,666,499,333,166','Discrete indices');assert(r.highSigmas[3]===r.lowSigmas[0]&&r.modelTimesteps.length===6,'Stage overlap');return{sigmas:[...r.sigmas],indices:[...r.tableIndices],sigmasSha256:await hash(r.sigmas.buffer),hikeWasmSHA256:r.hikeWasmSHA256,hike:r.evidence.hike};});
 await test('actual Hike CONST noise flow and inverse primitives',async()=>{const noise=new Float32Array([2,-2,1,0]),latent=new Float32Array([4,2,-1,3]);const mix=ok(await ask('noiseMix',{noise,latent,shape:[1,4],sigma:.25,noiseScale:1}));assert(String([...mix.data])==='3.5,1,-0.5,2.25','Noise literal');const inverse=ok(await ask('inverseNoiseScale',{latent:new Float32Array([1,-2,3]),shape:[3],sigma:.5}));assert(String([...inverse.data])==='2,-4,6','Inverse literal');const flow=ok(await ask('flowDenoised',{input:new Float32Array([2,-1,0]),velocity:new Float32Array([1,2,-3]),shape:[3],sigma:.5}));assert(String([...flow.data])==='1.5,-2,1.5','Flow literal');assert(String([...noise])==='2,-2,1,0'&&String([...latent])==='4,2,-1,3','Caller buffers changed');return{mix:[...mix.data],inverse:[...inverse.data],flow:[...flow.data],hike:flow.evidence.hike};});
 await test('Diffusion-owned raw mean normalization and existing WKTENSOR restoration',async()=>{const normalized=ok(await ask('normalizeRawMean',{tensor:raw}));const tensor=normalized.tensor;assert(normalized.normalizationApplied===true&&tensor.data instanceof Float32Array&&tensor.meaning==='wan21-normalized-posterior-mean:v1','Normalization semantics');const mean=Float32Array.from([-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921]),std=Float32Array.from([2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.916]),f=Math.fround;tensor.data.forEach((v,i)=>assert(Object.is(v,f(f(f(raw.data[i]-mean[Math.floor(i/8)])*1)/std[Math.floor(i/8)])),'All-channel f32 reference'));const binary=await codec.encodeTensor(tensor),read=await codec.decodeTensor(binary);assert(read.normalization===undefined&&read.meaning==='wan21-normalized-posterior-mean:v1','Existing codec meaning');const restored=ok(await ask('restoreRawMean',{tensor:read}));assert(restored.tensor.meaning==='raw-posterior-mean'&&restored.tensor.modelSha256===VAE,'Restored semantics');let maxAbs=0;restored.tensor.data.forEach((v,i)=>{maxAbs=Math.max(maxAbs,Math.abs(v-raw.data[i]));});assert(maxAbs<=2e-6,'Roundtrip threshold');assert(raw.data[0]===-2&&raw.shape.join(',')==='1,16,2,2,2','Caller mutated');return{normalizedSha256:await hash(tensor.data.buffer),restoredSha256:await hash(restored.tensor.data.buffer),persistedSha256:await hash(binary),maxAbs,tolerance:2e-6,hike:normalized.evidence.hike};});
 await test('strict tensor spaces provenance shape and native input errors reject',async()=>{const conditioning={dtype:'float32',shape:[1,2,4096],layout:'BLC',meaning:'text_hidden_states',modelSha256:TE,data:new Float32Array(8192),attentionMask:new Uint8Array([1,0])};ok(await ask('validateConditioning',{tensor:conditioning}));ok(await ask('validateRawLatent',{tensor:raw}));for(const [op,input] of [['normalizeRawMean',{tensor:{...raw,meaning:'generated-samples'}}],['normalizeRawMean',{tensor:{...raw,modelSha256:TE}}],['normalizeRawMean',{tensor:{...raw,shape:[1,16,1,2,4]}}],['restoreRawMean',{tensor:{...raw,meaning:'generated-samples'}}],['validateConditioning',{tensor:{...conditioning,attentionMask:new Uint8Array([1,2])}}],['inverseNoiseScale',{latent:new Float32Array([1]),shape:[1],sigma:1}]]){const r=await ask(op,input);assert(r.status==='error','Invalid tensor accepted '+op);}return{invalidCases:6};});
 await test('bounded literal projection executes Hike ORT WASM Hike',async()=>{const q=new Uint8Array(81920).fill(56),x=new Float32Array(5120),bias=Float32Array.from({length:16},(_,i)=>i/16);x[0]=2;x[1]=-1;const r=ok(await ask('linearProjection',{q,x,bias,scale:.25}));assert(r.output instanceof Float32Array&&r.output.length===16,'Partial output shape');r.output.forEach((v,i)=>assert(Object.is(v,Math.fround(.25+i/16)),'Projection literal row'+i));assert(r.partialOnly===true&&r.modelInference===false,'Partial scope');assert(r.evidence.executionProviders.join(',')==='wasm'&&r.evidence.numThreads===1&&r.evidence.hikeMemory.calls>=2,'Actual ORT/Hike evidence');assert(q[0]===56&&q.length===81920&&x[0]===2&&x[1]===-1,'Projection caller detached');return{output:[...r.output],outputSha256:await hash(r.output.buffer),evidence:r.evidence,fixture:'Explicit literal synthetic weights and activation, not an actual-model prediction'};});
 await test('header-format-only File and NOT_READY inference boundary',async()=>{let h=JSON.stringify({x:{dtype:'F32',shape:[2],data_offsets:[0,8]}});h+=' '.repeat((8-h.length%8)%8);const header=new TextEncoder().encode(h),prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,BigInt(header.length),true);const file=new File([prefix,header,new Uint8Array(8)],'format-only-fixture.safetensors');const inspected=ok(await ask('inspect',{file}));assert(inspected.tensorCount===1&&inspected.payloadBytes===8&&inspected.fullFileSHA256===null&&inspected.modelInference===false,'Header inspection');for(const [op,input] of [['load',{file}],['predict',{}],['sample',{}]]){const r=await ask(op,input);assert(r.status==='error'&&r.error.code==='NOT_READY','Unsupported inference success '+op);}return{headerBytes:inspected.headerBytes,headerSHA256:inspected.headerSHA256,fullModelInference:false};});
 await test('explicit MessagePort uses a separately owned actual Worker',async()=>{const other=mod.createDiffusionModels({sessionId:'live-public-port'}),ch=new MessageChannel(),detach=mod.attachDiffusionPort(ch.port1,other);try{ch.port2.start();const q={protocolVersion:mod.PROTOCOL_VERSION,sessionId:other.sessionId,jobId:'port-euler',inputRevision:0,op:'eulerStep',input:{latent:new Float32Array([3,7]),denoised:new Float32Array([1,3]),sigma:2,nextSigma:1}};const reply=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Port timeout')),60000);ch.port2.addEventListener('message',e=>{clearTimeout(timer);resolve(e.data);},{once:true});ch.port2.postMessage(q);});assert(reply.status==='ok'&&reply.result.latent instanceof Float32Array&&String([...reply.result.latent])==='2,5'&&reply.buildId===expectedBuild,'Port binary reply');return{values:[...reply.result.latent],buildId:reply.buildId};}finally{detach();ch.port2.close();other.dispose();}});
 await test('owned Worker cancellation and clean recreation',async()=>{const q=request('eulerStep',{latent:new Float32Array(65536).fill(3),denoised:new Float32Array(65536).fill(1),sigma:2,nextSigma:1}),pending=api.request(q);const cancelled=api.cancel({sessionId:api.sessionId,jobId:q.jobId,inputRevision:q.inputRevision});assert(cancelled.status==='ok'&&cancelled.result.workerTerminated,'Cancel acknowledgement');assert((await pending).error?.code==='CANCELLED','Pending terminal cancellation');const r=ok(await ask('eulerStep',{latent:new Float32Array([3]),denoised:new Float32Array([1]),sigma:2,nextSigma:1}));assert(r.latent[0]===2,'Worker restart');});
 if(checkPeers)await test('published Text Encoder VAE remain independent API modules',async()=>{const peer=await import(peerUrl),p=peer.createInferenceAPI();try{const text=p.textEncoder.capabilities(),vae=p.vae.capabilities();assert(p.textEncoder!==p.vae&&text.module==='text_encoder'&&vae.module==='vae','Independent modules');assert(text.apiVersion==='works-ai-1'&&vae.apiVersion==='works-ai-1','Peer API version');return{text,vae,scope:'Capabilities only; no peer-model inference'};}finally{p.dispose();}});
 }finally{api.dispose();globalThis.Worker=NativeWorker;}
 assert(workerEvents.filter(e=>e.event==='created').length>=2,'No independent real Workers observed');
 return{passed:cases.every(c=>c.passed),buildId:mod.BUILD_ID,cases,workerEvents,fullModelInference:false};
}'''

LARGE_FILE_CASE=r'''async ({apiUrl,expectedBuild,expectedSize,expectedName})=>{
 const mod=await import(apiUrl),api=mod.createDiffusionModels({sessionId:'live-private-header'}),file=document.querySelector('#private-model-file').files[0];let n=0;
 const ask=(op,input)=>api.request({protocolVersion:mod.PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'header-'+(++n),inputRevision:0,op,input});
 try{
 if(!file||file.size!==expectedSize||file.name!==expectedName)throw Error('Local File identity mismatch');
 const r=await ask('inspect',{file});if(r.status!=='ok'||r.buildId!==expectedBuild)throw Error(JSON.stringify(r.error));
 const m=r.result;if(m.fileBytes!==expectedSize||m.fullFileSHA256!==null||m.modelInference!==false)throw Error('Header-only identity');
 if(expectedSize===15574833216&&(m.tensorCount!==1815||!m.readiness.reasons.includes('SINGLE_WASM32_MEMORY_EXCEEDED')))throw Error('Actual Bernini header contract mismatch');
 const load=await ask('load',{file});if(load.status!=='error'||load.error.code!=='NOT_READY')throw Error('Actual model load must remain NOT_READY');
 return{passed:true,name:file.name,fileBytes:file.size,headerBytes:m.headerBytes,headerSHA256:m.headerSHA256,payloadBytes:m.payloadBytes,tensorCount:m.tensorCount,dtypePayloadBytes:m.dtypePayloadBytes,fullFileSHA256:null,fullFileHashStatus:m.fullFileHashStatus,readiness:m.readiness,loadStatus:load.error.code,scope:'Browser-local actual File; header-only inspection, no model payload loading or upload'};
 }finally{api.dispose();}
}'''

class OriginRedirect(urllib.request.HTTPRedirectHandler):
 def __init__(self,origin):self.origin=origin
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  p=urllib.parse.urlparse(newurl)
  if (p.scheme,p.netloc)!=self.origin:raise RuntimeError('Cross-origin redirect rejected: '+newurl)
  return super().redirect_request(req,fp,code,msg,headers,newurl)

def expected_assets(root):
 manifest=json.loads((root/'security/public-files.json').read_text());files=manifest['files']
 if not isinstance(files,list) or len(files)!=len(set(files)):raise ValueError('Invalid/duplicate public allowlist')
 selected=sorted(p for p in files if p.startswith('shared/diffusion-models/') or p in ('diffusion-models/index.html','github/index.html'))
 for required in ['diffusion-models/index.html','github/index.html','shared/diffusion-models/api/index.mjs']:
  if required not in selected:raise ValueError('Candidate public allowlist missing '+required)
 docs=(root/'docs').resolve()
 for name in selected:
  path=docs/name
  if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(docs):raise ValueError('Invalid candidate path '+name)
 return selected

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--base-url',default='https://kushyameln01.github.io/kushyameln-works/');p.add_argument('--candidate-root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--output-dir',type=Path,default=Path('/workspace/work/diffusion-publication'));p.add_argument('--model-file',type=Path,action='append',default=[]);p.add_argument('--skip-peer-capabilities',action='store_true');p.add_argument('--timeout-ms',type=int,default=180000);args=p.parse_args()
 base=args.base_url.rstrip('/')+'/';parsed=urllib.parse.urlparse(base)
 if parsed.scheme!='https' and not(parsed.scheme=='http' and parsed.hostname in ('127.0.0.1','localhost')):p.error('Require HTTPS or explicit loopback HTTP')
 origin=(parsed.scheme,parsed.netloc);root=args.candidate_root.resolve();out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=True)
 receipt={'schemaVersion':1,'baseUrl':base,'candidateRoot':str(root),'passed':False,'scope':'Public assets and bounded actual-browser API/Hike/ORT verification; no full model inference','tlsVerification':True,'assets':[],'blockedRequests':[],'pageErrors':[],'consoleErrors':[],'network':[],'localFiles':[]};started=time.monotonic()
 try:
  assets=expected_assets(root);opener=urllib.request.build_opener(OriginRedirect(origin))
  for name in assets:
   local=(root/'docs'/name).read_bytes();url=urllib.parse.urljoin(base,name)
   with opener.open(url,timeout=60) as r:raw=r.read();status=r.status;mime=r.headers.get('Content-Type','');final=r.url
   exact=raw==local;mimepass=(('javascript' in mime) if name.endswith('.mjs') else (mime.split(';')[0].strip()=='application/wasm') if name.endswith('.wasm') else ('text/html' in mime) if name.endswith('.html') else True)
   receipt['assets'].append(dict(path=name,url=url,finalUrl=final,status=status,mime=mime,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),expectedSha256=hashlib.sha256(local).hexdigest(),byteExact=exact,mimePass=mimepass))
   if status!=200 or not exact or not mimepass:raise RuntimeError('Asset bytes/status/MIME mismatch: '+name)
  build_source=(root/'docs/shared/diffusion-models/api/build-info.mjs').read_text();expected_build=re.search(r'export const BUILD_ID\s*=\s*[\"\']([^\"\']+)',build_source).group(1)
  receipt['candidateBuildId']=expected_build
  with sync_playwright() as playwright:
   launch_options={'executable_path':'/usr/bin/chromium','headless':True,'args':['--disable-dev-shm-usage']}
   inherited_proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY') or os.environ.get('https_proxy') or os.environ.get('http_proxy')
   if parsed.scheme=='https' and inherited_proxy:launch_options['proxy']={'server':inherited_proxy}
   receipt['browserUsesInheritedProxy']=bool(parsed.scheme=='https' and inherited_proxy)
   browser=playwright.chromium.launch(**launch_options);context=browser.new_context(ignore_https_errors=False,service_workers='block');page=context.new_page();page.set_default_timeout(args.timeout_ms)
   def route(request_route):
    request=request_route.request;u=urllib.parse.urlparse(request.url)
    if u.scheme in ('http','https') and ((u.scheme,u.netloc)!=origin or request.method!='GET'):
     receipt['blockedRequests'].append({'url':request.url,'method':request.method});request_route.abort();return
    request_route.continue_()
   context.route('**/*',route)
   context.on('request',lambda r:receipt['network'].append({'url':r.url,'method':r.method,'resourceType':r.resource_type}))
   page.on('pageerror',lambda error:receipt['pageErrors'].append(str(error)))
   page.on('console',lambda msg:receipt['consoleErrors'].append(msg.text) if msg.type=='error' else None)
   landing=page.goto(urllib.parse.urljoin(base,'diffusion-models/'),wait_until='networkidle');receipt['landing']={'status':landing.status if landing else None,'title':page.title(),'url':page.url};receipt['browserVersion']=browser.version
   if not landing or landing.status!=200:raise RuntimeError('Public landing unavailable')
   api_url=urllib.parse.urljoin(base,'shared/diffusion-models/api/index.mjs')
   receipt['browser']=page.evaluate(BROWSER_CASES,dict(apiUrl=api_url,codecUrl=urllib.parse.urljoin(base,'shared/inference/tensor.mjs'),peerUrl=urllib.parse.urljoin(base,'shared/inference/api.mjs'),expectedBuild=expected_build,checkPeers=not args.skip_peer_capabilities))
   for file in args.model_file:
    file=file.resolve()
    if not file.is_file():raise RuntimeError('Missing optional actual model File: '+str(file))
    page.evaluate("() => {document.querySelector('#private-model-file')?.remove();const i=document.createElement('input');i.type='file';i.id='private-model-file';document.body.append(i);}")
    page.locator('#private-model-file').set_input_files(str(file))
    receipt['localFiles'].append(page.evaluate(LARGE_FILE_CASE,dict(apiUrl=api_url,expectedBuild=expected_build,expectedSize=file.stat().st_size,expectedName=file.name)))
   browser.close()
  receipt['assetCount']=len(receipt['assets']);receipt['assetBytes']=sum(a['bytes'] for a in receipt['assets']);receipt['passed']=receipt['browser']['passed'] and not receipt['blockedRequests'] and not receipt['pageErrors'] and all(x['passed'] for x in receipt['localFiles'])
 except Exception as error:receipt['error']=str(error);receipt['traceback']=traceback.format_exc()
 finally:
  receipt['seconds']=time.monotonic()-started;(out/'live-pages-receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({'passed':receipt['passed'],'assetCount':len(receipt['assets']),'browserCases':len(receipt.get('browser',{}).get('cases',[])),'localFiles':len(receipt['localFiles']),'seconds':receipt['seconds'],'receipt':str(out/'live-pages-receipt.json'),'error':receipt.get('error')}))
 return 0 if receipt['passed'] else 1
if __name__=='__main__':sys.exit(main())
