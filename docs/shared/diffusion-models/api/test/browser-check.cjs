const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const files=new Set(['/api/test/browser.html','/api/test/cases.mjs','/api/index.mjs','/api/build-info.mjs','/api/worker.mjs','/api/safetensors.mjs','/euler-kernel.mjs','/kernel-registry.mjs','/kernel/euler.wasm']);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(!files.has(name)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':name.endsWith('.wasm')?'application/wasm':name.endsWith('.html')?'text/html':'text/javascript','Cache-Control':'no-store'});fs.createReadStream(path.join(root,name)).on('error',()=>{res.destroy();}).pipe(res);});
(async()=>{let browser;try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(`http://127.0.0.1:${server.address().port}/api/test/browser.html`);await page.waitForFunction(()=>window.result||window.failure,{},{timeout:30000});const result=await page.evaluate(()=>({result:window.result,failure:window.failure}));const actualModels=[];
for(const modelPath of process.argv.slice(2)){
 await page.evaluate(()=>{if(!document.querySelector('#actual-model')){const input=document.createElement('input');input.id='actual-model';input.type='file';document.body.append(input);}});
 await page.setInputFiles('#actual-model',modelPath);
 actualModels.push(await page.evaluate(async()=>{
  const {createDiffusionModels}=await import('/api/index.mjs');const api=createDiffusionModels();
  const file=document.querySelector('#actual-model').files[0];
  const q={protocolVersion:'diffusion-models/0.1',sessionId:api.sessionId,jobId:'actual-inspect',inputRevision:0,op:'inspect',input:{file}};
  try{const r=await api.request(q);if(r.status!=='ok')throw Error(JSON.stringify(r));const load=await api.request({...q,jobId:'actual-load',op:'load'});
  if(load.error?.code!=='NOT_READY'||!load.error?.details?.reasons?.includes('SINGLE_WASM32_MEMORY_EXCEEDED'))throw Error('Large model load was not refused');
  return {name:r.result.name,fileBytes:r.result.fileBytes,headerBytes:r.result.headerBytes,payloadBytes:r.result.payloadBytes,tensorCount:r.result.tensorCount,headerSHA256:r.result.headerSHA256,fullFileSHA256:r.result.fullFileSHA256,readiness:r.result.readiness,loadError:load.error};}finally{api.dispose();}
 }));
}
const report={browser:await browser.version(),errors,...result,actualModels};fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(result.failure||errors.length||!result.result?.passed)process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
