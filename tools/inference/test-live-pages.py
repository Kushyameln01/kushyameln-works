#!/usr/bin/env python3
"""Verify deployed Pages bytes and real public-origin inference with private local files.

Never publishes or uploads model/media data. Default: all public bytes + both UI
smoke checks + actual VAE PNG encode and fixed-latent decode. Text24 is opt-in via
--module text/all. Run only after the intended commit is deployed.
"""
import argparse,hashlib,json,math,os,shutil,struct,time,urllib.parse,urllib.request
from pathlib import Path
REPO=Path(__file__).resolve().parents[2]
PUBLIC_ROOTS=('shared/inference','text-encoder','vae')
DEFAULT_BASE='https://kushyameln01.github.io/kushyameln-works/'
RUNTIME_PATHS=('shared/inference/inference-worker.mjs','shared/inference/kernel/tensor.wasm','shared/inference/vendor/ort.wasm.min.mjs','shared/inference/vendor/ort-wasm-simd-threaded.mjs','shared/inference/vendor/ort-wasm-simd-threaded.wasm')

def digest(data):return hashlib.sha256(data).hexdigest()
def origin(url):
 p=urllib.parse.urlsplit(url);return p.scheme,p.netloc

def arguments():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--base-url',default=DEFAULT_BASE)
 p.add_argument('--output',required=True,type=Path,help='Private evidence directory outside repository docs/')
 p.add_argument('--module',choices=['assets','smoke','vae','text','all'],default='vae')
 p.add_argument('--fixture-root',type=Path,default=Path(os.environ.get('WORKS_INFERENCE_WORK','/workspace/work/inference')))
 p.add_argument('--candidate-root',type=Path,default=REPO/'docs')
 p.add_argument('--browser',default=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium'))
 p.add_argument('--timeout-ms',type=int,default=600000)
 return p.parse_args()

class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
 def __init__(self,allowed):self.allowed=allowed
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if origin(newurl)!=self.allowed:raise ValueError('Cross-origin asset redirect rejected: '+newurl)
  return super().redirect_request(req,fp,code,msg,headers,newurl)

def verify_assets(args,report):
 root=args.candidate_root.resolve();paths=[]
 for name in PUBLIC_ROOTS:
  folder=root/name
  if not folder.is_dir() or folder.is_symlink():raise ValueError('Missing/unsafe candidate directory: '+name)
  paths.extend(p for p in folder.rglob('*') if p.is_file())
 paths.append(root/'github/index.html')
 opener=urllib.request.build_opener(SameOriginRedirect(origin(args.base_url)))
 mime_types={'.mjs':{'application/javascript','text/javascript'},'.js':{'application/javascript','text/javascript'},'.wasm':{'application/wasm'},'.css':{'text/css'},'.html':{'text/html'},'.json':{'application/json'},'.txt':{'text/plain'},'.md':{'text/plain','text/markdown','application/octet-stream'}}
 records=[];report['assets']=records
 for path in sorted(set(paths)):
  if path.is_symlink() or not path.is_file() or path.suffix in {'.onnx','.safetensors'}:raise ValueError('Unsafe public candidate: '+str(path))
  relative=path.relative_to(root).as_posix();url=urllib.parse.urljoin(args.base_url,relative)
  expected=path.read_bytes();request=urllib.request.Request(url,headers={'Accept-Encoding':'identity','Cache-Control':'no-cache'},method='GET')
  with opener.open(request,timeout=90) as response:
   data=response.read();mime=response.headers.get_content_type();record={'path':relative,'url':url,'finalUrl':response.geturl(),'method':'GET','status':response.status,'mime':mime,'bytes':len(data),'sha256':digest(data),'expectedBytes':len(expected),'expectedSha256':digest(expected),'etag':response.headers.get('ETag')}
  record['byteExact']=data==expected;record['mimePass']=mime in mime_types.get(path.suffix,{'application/octet-stream'})
  records.append(record)
  if not record['byteExact'] or not record['mimePass'] or record['status']!=200:raise AssertionError('Live asset mismatch: '+relative)
 report['assetCount']=len(records);report['assetBytes']=sum(v['bytes'] for v in records)
 print(json.dumps({'stage':'assets','passed':True,'files':len(records),'bytes':report['assetBytes']}),flush=True)

def unpack(path):
 import numpy as np
 raw=path.read_bytes()
 if raw[:8]!=b'WKTSR001' or len(raw)<12:raise ValueError('Invalid downloaded Works tensor')
 length=int.from_bytes(raw[8:12],'little');metadata=json.loads(raw[12:12+length]);data=raw[12+length:]
 if not 0<length<=65536 or metadata['schemaVersion']!=1 or metadata['dtype']!='float32' or metadata['byteOrder']!='little' or metadata['byteLength']!=len(data) or digest(data)!=metadata['dataSha256']:raise ValueError('Downloaded tensor schema/hash mismatch')
 result=np.frombuffer(data,dtype='<f4')
 if result.size!=math.prod(metadata['shape']) or not np.isfinite(result).all():raise ValueError('Downloaded tensor shape/finite mismatch')
 return metadata,result

def pack_raw(path,raw,shape,meaning,model_hash):
 if len(raw)!=math.prod(shape)*4:raise ValueError('Invalid local raw fixture size')
 metadata={'schemaVersion':1,'dtype':'float32','shape':shape,'layout':'NCTHW','meaning':meaning,'byteOrder':'little','byteLength':len(raw),'dataSha256':digest(raw),'modelSha256':model_hash}
 header=json.dumps(metadata,separators=(',',':')).encode();path.write_bytes(b'WKTSR001'+struct.pack('<I',len(header))+header+raw)

def compare(path,reference,shape,meaning,tolerance):
 import numpy as np
 metadata,data=unpack(path);expected=np.fromfile(reference,dtype='<f4')
 if metadata['shape']!=shape or metadata['meaning']!=meaning or data.size!=expected.size:raise AssertionError('Live result shape/meaning mismatch')
 error=float(np.max(np.abs(data-expected)));passed=error<=tolerance
 if not passed:raise AssertionError(f'Live result differs from FP32 fixture: {error} > {tolerance}')
 return {'passed':True,'shape':metadata['shape'],'meaning':metadata['meaning'],'downloadSha256':digest(path.read_bytes()),'tensorDataSha256':metadata['dataSha256'],'referenceSha256':digest(reference.read_bytes()),'maxAbsError':error,'tolerance':tolerance,'scope':'Fixed private FP32 diagnostic fixture; not original lower-precision workflow or user-machine performance'}

def run_ui(page,args,operation,output):
 page.locator('#run').click()
 page.wait_for_function('!document.querySelector("#save").disabled || !document.querySelector("#run").disabled',timeout=args.timeout_ms)
 if page.locator('#save').is_disabled():raise RuntimeError(operation+': '+page.locator('#status').text_content())
 evidence=json.loads(page.locator('#evidence').text_content()) # evidence lives in a collapsed details element
 with page.expect_download(timeout=60000) as download:page.locator('#save').click()
 download.value.save_as(str(output))
 return evidence

def smoke(page,args):
 checks=[]
 for name in ['text-encoder','vae']:
  url=urllib.parse.urljoin(args.base_url,name+'/');response=page.goto(url,wait_until='networkidle',timeout=90000)
  if response.status!=200 or page.locator('body').get_attribute('data-inference')!=('text_encoder' if name=='text-encoder' else 'vae'):raise AssertionError('Live module UI did not load: '+name)
  if page.locator('#bundle').count()!=1 or page.locator('#run').count()!=1:raise AssertionError('Missing live controls: '+name)
  checks.append({'module':name,'url':page.url,'status':response.status,'title':page.title()})
 api_url=urllib.parse.urljoin(args.base_url,'shared/inference/api.mjs')
 capabilities=page.evaluate('''async url=>{
  const mod=await import(url),api=mod.createInferenceAPI(),{port1,port2}=new MessageChannel();let unbind,timer;
  try{
   unbind=mod.bindInferencePort(port1,api);
   const port=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('MessagePort capabilities timeout')),5000);port2.onmessage=e=>resolve(e.data);port2.postMessage({apiVersion:mod.API_VERSION,id:'live-capabilities',module:'vae',method:'capabilities'});});
   return{apiVersion:mod.API_VERSION,text:api.textEncoder.capabilities(),vae:api.vae.capabilities(),port};
  }finally{clearTimeout(timer);unbind?.();port2.close();api.dispose();}
 }''',api_url)
 if capabilities['apiVersion']!='works-ai-1' or capabilities['text']['module']!='text_encoder' or capabilities['text']['maximumTokens']!=512 or capabilities['vae']['operations']!=['encode','decode'] or not capabilities['port']['ok']:raise AssertionError('Live direct/MessagePort API capabilities mismatch')
 return {'pages':checks,'apiUrl':api_url,'capabilities':capabilities}

def test_vae(page,args):
 work=args.fixture_root;bundle=work/'vae-implementation/bundle';manifest=json.loads((bundle/'manifest.json').read_text());profile=manifest['profile'];records=[]
 page.goto(urllib.parse.urljoin(args.base_url,'vae/'),wait_until='networkidle',timeout=90000)
 page.locator('#bundle').set_input_files(str(bundle));page.wait_for_function('!document.querySelector("#run").disabled',timeout=30000)
 images=sorted((work/'vae-implementation/png-fixtures').glob('frame-*.png'))
 if len(images)!=profile['videoShape'][2]:raise ValueError('Missing exact private PNG fixture frames')
 page.locator('#images').set_input_files([str(p) for p in images]);page.wait_for_function('document.querySelector("#input-info").textContent.includes("画像5枚")',timeout=30000)
 path=args.output/'vae-png-encode.wktensor';evidence=run_ui(page,args,'VAE PNG encode',path)
 check=compare(path,work/'vae-implementation/png-encode-reference.f32',profile['latentShape'],'raw-posterior-mean',.002)
 if not evidence.get('hikeContributed') or evidence.get('hikeCalls')!=1 or evidence.get('provider')!='wasm' or evidence.get('threads')!=1:raise AssertionError('Missing actual public-origin VAE encode Hike/WASM evidence')
 records.append({'operation':'PNG encode','checks':check,'evidence':evidence,'localInputSha256':[{'name':p.name,'sha256':digest(p.read_bytes())} for p in images]})
 # Separate known raw latent preserves an independent exact decode reference.
 input_path=args.output/'private-decode-input.wktensor';pack_raw(input_path,(bundle/'decode-input.f32').read_bytes(),profile['latentShape'],'raw-posterior-mean',manifest['model']['sha256'])
 page.locator('#operation').select_option('decode');page.locator('#tensor-input').set_input_files(str(input_path));page.wait_for_function('document.querySelector("#input-info").textContent.includes("raw-posterior-mean")',timeout=30000)
 path=args.output/'vae-decode.wktensor';evidence=run_ui(page,args,'VAE decode',path);check=compare(path,bundle/'decode-reference.f32',profile['videoShape'],'raw-decoder-rgb',.002)
 if not evidence.get('hikeContributed') or evidence.get('hikeCalls',0)<1 or evidence.get('provider')!='wasm' or evidence.get('threads')!=1:raise AssertionError('Missing actual public-origin VAE decode Hike/WASM evidence')
 records.append({'operation':'raw latent decode','checks':check,'evidence':evidence,'inputSha256':digest(input_path.read_bytes())})
 return records

def test_text(page,args):
 bundle=args.fixture_root/'text-implementation/bundle';source=args.fixture_root.parent/'models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors'
 # The original session keeps models under work/models, alongside inference/.
 if not source.is_file():raise ValueError('Missing original private UMT5 file: '+str(source))
 page.goto(urllib.parse.urljoin(args.base_url,'text-encoder/'),wait_until='networkidle',timeout=90000)
 page.locator('#bundle').set_input_files(str(bundle));page.locator('#source').set_input_files(str(source));page.wait_for_function('!document.querySelector("#run").disabled',timeout=30000)
 page.locator('details').first.locator('summary').click();page.locator('#token-input').fill('{"tokenIds":[42,1234,1,0],"attentionMask":[1,1,1,0]}')
 path=args.output/'text-known-ids.wktensor';evidence=run_ui(page,args,'Text24 known IDs',path)
 check=compare(path,bundle/'final-reference.f32',[1,4,4096],'text_hidden_states',.001)
 if not evidence.get('hikeContributed') or evidence.get('numLayers')!=24:raise AssertionError('Missing actual Text24/Hike evidence')
 return {'operation':'actual24-layer token-ID encode','checks':check,'evidence':evidence}

def browser_checks(args,report):
 from playwright.sync_api import sync_playwright
 requests=[];responses=[];blocked=[];errors=[];workers=[];console=[]
 report.update(httpRequests=requests,httpResponses=responses,blockedRequests=blocked,pageErrors=errors,workers=workers,consoleErrors=console)
 with sync_playwright() as playwright:
  options={'headless':True,'args':['--no-sandbox']}
  if args.browser:options['executable_path']=args.browser
  proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
  if proxy:options['proxy']={'server':proxy}
  browser=playwright.chromium.launch(**options);context=browser.new_context(accept_downloads=True,service_workers='block')
  try:
   def route(request_route):
    req=request_route.request
    if req.method=='GET' and origin(req.url)==origin(args.base_url):request_route.continue_()
    else:blocked.append({'method':req.method,'url':req.url});request_route.abort()
   context.route('**/*',route)
   context.on('request',lambda req:requests.append({'method':req.method,'url':req.url,'resourceType':req.resource_type}))
   context.on('response',lambda res:responses.append({'url':res.url,'status':res.status,'mime':res.headers.get('content-type')}))
   page=context.new_page();page.on('pageerror',lambda err:errors.append(str(err)));page.on('worker',lambda worker:workers.append(worker.url));page.on('console',lambda message:console.append(message.text) if message.type=='error' else None)
   report['browser']=browser.version;report['smoke']=smoke(page,args)
   if args.module in {'vae','all'}:report['vae']=test_vae(page,args);print(json.dumps({'stage':'live-vae','passed':True}),flush=True)
   if args.module in {'text','all'}:report['text']=test_text(page,args);print(json.dumps({'stage':'live-text24','passed':True}),flush=True)
   if blocked or errors:raise AssertionError('Blocked request or page error during live verification')
   if any(r['method']!='GET' or origin(r['url'])!=origin(args.base_url) for r in requests):raise AssertionError('Unexpected live request origin/method')
   if any(urllib.parse.urlsplit(r['url']).path.endswith(('.onnx','.safetensors')) for r in requests):raise AssertionError('A local model was unexpectedly requested over HTTP')
   if args.module in {'vae','text','all'}:
    report['runtimeUrls']={name:urllib.parse.urljoin(args.base_url,name) for name in RUNTIME_PATHS}
    for name,url in report['runtimeUrls'].items():
     if not any(r['url']==url and r['status']==200 for r in responses):raise AssertionError('Required public-origin runtime path not observed: '+name)
    if not any(url==report['runtimeUrls'][RUNTIME_PATHS[0]] for url in workers):raise AssertionError('Public-origin dedicated Worker not observed')
  finally:context.close();browser.close()

def main():
 args=arguments();args.base_url=args.base_url.rstrip('/')+'/'
 if urllib.parse.urlsplit(args.base_url).scheme not in {'https','http'}:raise ValueError('Expected an HTTP(S) base URL')
 args.output=args.output.resolve();public=(REPO/'docs').resolve()
 if args.output==public or public in args.output.parents:raise ValueError('Live evidence must stay outside public docs/')
 args.output.mkdir(parents=True,exist_ok=True);started=time.monotonic()
 report={'passed':False,'baseUrl':args.base_url,'module':args.module,'localCandidateRoot':str(args.candidate_root.resolve()),'scope':'Live public deployment bytes and actual fixed private FP32 fixtures; no publication or model uploads','networkRule':'Only GET requests to the selected live origin; other requests aborted; local files never sent through HTTP'}
 try:
  verify_assets(args,report)
  if args.module!='assets':browser_checks(args,report)
  report['passed']=True
 except Exception as error:
  report['error']=str(error);report['errorType']=type(error).__name__;raise
 finally:
  report['seconds']=time.monotonic()-started;(args.output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'passed':True,'module':args.module,'assetCount':report.get('assetCount'),'seconds':report['seconds'],'evidence':str(args.output/'results.json')}),flush=True)
if __name__=='__main__':main()
