#!/usr/bin/env python3
"""GET-only public LoRA IO + actual SDK-source inspection; no model application.

Test code and synthetic files remain local/injected. No fixtures/test harness is
published or served by this script. HTTPS keeps inherited proxy and TLS trust.
"""
import argparse,hashlib,json,os,re,sys,time,traceback,urllib.parse,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
 def __init__(self,origin):self.origin=origin
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  p=urllib.parse.urlparse(newurl)
  if (p.scheme,p.netloc)!=self.origin:raise RuntimeError('Cross-origin redirect rejected')
  return super().redirect_request(req,fp,code,msg,headers,newurl)

def entry(path):
 text=path.read_text()
 if text.count('export async function run(')!=1:raise ValueError('Expected one self-contained test entry: '+str(path))
 return text.replace('export async function run(','async function run(',1)

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--base-url',default='https://kushyameln01.github.io/kushyameln-works/');parser.add_argument('--candidate-root',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--output-dir',type=Path,default=Path('/workspace/work/diffusion-publication/lora-public'));parser.add_argument('--allow-unlisted-local',action='store_true',help='Loopback-only prepublication check of the four new production IO modules');parser.add_argument('--timeout-ms',type=int,default=180000);args=parser.parse_args()
 root=args.candidate_root.resolve();base=args.base_url.rstrip('/')+'/';p=urllib.parse.urlparse(base);local=p.scheme=='http'and p.hostname in('127.0.0.1','localhost')
 if p.scheme!='https'and not local:parser.error('Require HTTPS or explicit loopback HTTP')
 if args.allow_unlisted_local and not local:parser.error('--allow-unlisted-local is restricted to loopback HTTP')
 origin=(p.scheme,p.netloc);out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=True);started=time.monotonic()
 receipt={'schemaVersion':1,'baseUrl':base,'passed':False,'tlsVerification':True,'scope':'LoRA file IO/source connection and actual SDK.inspect only; no prepare/apply or model inference','assets':[],'network':[],'blockedRequests':[],'pageErrors':[],'consoleErrors':[],'prepublicationLocal':bool(args.allow_unlisted_local)}
 try:
  manifest=json.loads((root/'security/public-files.json').read_text());listed=set(manifest['files'])
  paths={x for x in listed if x.startswith('shared/diffusion-models/lora/')or x.startswith('shared/inference/lora/')}
  required={'shared/diffusion-models/api/index.mjs','shared/diffusion-models/api/worker.mjs','shared/diffusion-models/api/build-info.mjs','shared/diffusion-models/api/safetensors.mjs','shared/diffusion-models/lora/source.mjs','shared/diffusion-models/lora/weights.mjs','shared/diffusion-models/lora/targets.mjs','shared/diffusion-models/lora/strict-json.mjs','shared/vr180/sha256.mjs','shared/inference/lora/sdk.mjs','shared/inference/lora/kernel/lora.wasm'}
  missing=required-listed
  if missing and not args.allow_unlisted_local:raise ValueError('Required production files missing from public allowlist: '+', '.join(sorted(missing)))
  paths|=required
  opener=urllib.request.build_opener(SameOriginRedirect(origin));docs=(root/'docs').resolve()
  for name in sorted(paths):
   candidate=docs/name
   if not candidate.is_file()or candidate.is_symlink()or not candidate.resolve().is_relative_to(docs):raise ValueError('Invalid candidate path '+name)
   expected=candidate.read_bytes();url=urllib.parse.urljoin(base,name)
   with opener.open(url,timeout=60)as response:raw=response.read();status=response.status;mime=response.headers.get('Content-Type','')
   exact=raw==expected;mime_pass='javascript'in mime if name.endswith('.mjs')else mime.split(';')[0].strip()=='application/wasm'if name.endswith('.wasm')else True
   receipt['assets'].append({'path':name,'status':status,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'expectedSha256':hashlib.sha256(expected).hexdigest(),'byteExact':exact,'mime':mime,'mimePass':mime_pass})
   if status!=200 or not exact or not mime_pass:raise RuntimeError('Public asset mismatch: '+name)
  build_text=(docs/'shared/diffusion-models/api/build-info.mjs').read_text();expected_build=re.search(r'export const BUILD_ID\s*=\s*[\"\']([^\"\']+)',build_text).group(1);receipt['candidateBuildId']=expected_build
  api_code=entry(docs/'shared/diffusion-models/api/test/lora-cases.mjs');source_code=entry(docs/'shared/diffusion-models/lora/source-cases.mjs')
  receipt['testSourceSha256']={'apiCases':hashlib.sha256(api_code.encode()).hexdigest(),'sdkSourceCases':hashlib.sha256(source_code.encode()).hexdigest()}
  with sync_playwright()as playwright:
   launch={'executable_path':'/usr/bin/chromium','headless':True,'args':['--disable-dev-shm-usage']};proxy=os.environ.get('HTTPS_PROXY')or os.environ.get('HTTP_PROXY')or os.environ.get('https_proxy')or os.environ.get('http_proxy')
   if p.scheme=='https'and proxy:launch['proxy']={'server':proxy}
   receipt['browserUsesInheritedProxy']=bool(p.scheme=='https'and proxy)
   browser=playwright.chromium.launch(**launch);context=browser.new_context(ignore_https_errors=False,service_workers='block');page=context.new_page();page.set_default_timeout(args.timeout_ms)
   def route(r):
    req=r.request;url=urllib.parse.urlparse(req.url)
    if url.scheme in('http','https')and((url.scheme,url.netloc)!=origin or req.method!='GET'):
     receipt['blockedRequests'].append({'url':req.url,'method':req.method});r.abort();return
    r.continue_()
   context.route('**/*',route);context.on('request',lambda r:receipt['network'].append({'url':r.url,'method':r.method,'resourceType':r.resource_type}));page.on('pageerror',lambda e:receipt['pageErrors'].append(str(e)));page.on('console',lambda m:receipt['consoleErrors'].append(m.text)if m.type=='error'else None)
   response=page.goto(urllib.parse.urljoin(base,'diffusion-models/'),wait_until='networkidle');receipt['landing']={'status':response.status if response else None,'url':page.url,'title':page.title()};receipt['browserVersion']=browser.version
   if not response or response.status!=200:raise RuntimeError('Diffusion landing unavailable')
   api_url=urllib.parse.urljoin(base,'shared/diffusion-models/api/index.mjs');receipt['api']=page.evaluate('async value => {\n'+api_code+'\nreturn await run(value);\n}',api_url);receipt['source']=page.evaluate('async value => {\n'+source_code+'\nreturn await run(value);\n}',dict(apiUrl=api_url,sourceUrl=urllib.parse.urljoin(base,'shared/diffusion-models/lora/source.mjs'),sdkUrl=urllib.parse.urljoin(base,'shared/inference/lora/sdk.mjs')))
   if page.evaluate('async url => (await import(url)).BUILD_ID',api_url)!=expected_build:raise RuntimeError('Loaded API build differs from candidate')
   browser.close()
  receipt['assetCount']=len(receipt['assets']);receipt['assetBytes']=sum(x['bytes']for x in receipt['assets']);receipt['passed']=bool(receipt['api'].get('passed')and receipt['source'].get('passed')and not receipt['blockedRequests']and not receipt['pageErrors'])
 except Exception as error:receipt['error']=str(error);receipt['traceback']=traceback.format_exc()
 finally:receipt['seconds']=time.monotonic()-started;(out/'live-lora-receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({'passed':receipt['passed'],'assets':len(receipt['assets']),'seconds':receipt['seconds'],'receipt':str(out/'live-lora-receipt.json'),'error':receipt.get('error')}));return 0 if receipt['passed']else 1
if __name__=='__main__':sys.exit(main())
