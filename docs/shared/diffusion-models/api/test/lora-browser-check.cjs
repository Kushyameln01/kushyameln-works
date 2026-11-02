const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const files=new Set(['/execution/capabilities.mjs','/tensor-interop.mjs','/latent-space/latent-space.mjs','/latent-space/kernel-registry.mjs','/scheduler/scheduler-kernel.mjs','/api/test/lora-browser.html','/api/test/lora-cases.mjs','/api/index.mjs','/api/model-adapter.mjs','/inference/tensor.mjs','/api/build-info.mjs','/api/worker.mjs','/api/safetensors.mjs','/euler-kernel.mjs','/kernel-registry.mjs','/lora/weights.mjs','/lora/targets.mjs','/lora/strict-json.mjs','/vr180/sha256.mjs']);
// Finite explicit inventory, including generated owner dependencies. No directory fallback.
const routes=new Map([...files].map(name=>[name,(name.startsWith('/inference/')||name.startsWith('/vr180/')||name.startsWith('/ai-connection/'))?path.join(root,'..',name.slice(1)):path.join(root,name)]));
let buildIdentity;
async function addBuildInventory(){
 const {pathToFileURL}=require('node:url'),build=await import(pathToFileURL(path.join(root,'api/build-info.mjs')).href);
 for(const [relative,sha256] of Object.entries(build.BUILD_SOURCES)){
  if(!/^[0-9a-f]{64}$/.test(sha256))throw Error('Invalid generated source identity');
  const route=new URL(relative,'http://inventory.invalid/api/').pathname,source=path.resolve(root,'api',relative),previous=routes.get(route);
  if(previous&&previous!==source)throw Error('Generated source URL collision: '+route);
  routes.set(route,source);
 }
 buildIdentity={buildId:build.BUILD_ID,ownerSources:Object.keys(build.BUILD_SOURCES).length,servedPaths:routes.size};
}
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(!routes.has(name)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':'text/javascript','Cache-Control':'no-store'});fs.createReadStream(routes.get(name)).on('error',()=>res.destroy()).pipe(res);});
(async()=>{let browser;try{await addBuildInventory();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto(`http://127.0.0.1:${server.address().port}/api/test/lora-browser.html`);await page.waitForFunction(()=>window.result||window.failure,{},{timeout:30000});const state=await page.evaluate(()=>({result:window.result,failure:window.failure})),report={browser:await browser.version(),buildIdentity,errors,...state};fs.writeFileSync(path.join(__dirname,'lora-browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(state.failure||errors.length||!state.result?.passed)process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
