const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
const root=path.resolve(__dirname,'../../../docs/shared/inference/lora/kernel');
(async()=>{
 const server=http.createServer((req,res)=>{const name=req.url.split('?')[0];if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Hike LoRA kernel test</title>');return;}const allowed=['/host.mjs','/registry.mjs','/lora.wasm'];if(!allowed.includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(fs.readFileSync(path.join(root,name)));});
 let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{const {createKernel}=await import('/host.mjs');const k=await createKernel();const merged=[...k.merge({base:new Float32Array([1,2,3,4]),down:new Float32Array([2,3]),up:new Float32Array([4,5]),rows:2,cols:2,rank:1,scale:.5})];const decoded=[...k.decode(new Uint8Array([128,63,0,192]),'BF16')];const f16=[...k.decode(new Uint8Array([0,60,0,192,1,0]),'F16')];const added=[...k.add({base:new Float32Array([1,2]),delta:new Float32Array([2,-4]),scale:-.5})];const info=k.info;k.dispose();let rejected=false;try{k.decode(new Uint8Array(0),'F32');}catch{rejected=true;}return{merged,decoded,f16,added,rejected,info};});
  if(JSON.stringify(result.merged)!=='[5,8,8,11.5]'||JSON.stringify(result.decoded)!=='[1,-2]'||JSON.stringify(result.added)!=='[0,4]'||result.f16[2]!==2**-24||!result.rejected)throw new Error('browser numerical mismatch');
  const record={status:'HTTP_BROWSER_KERNEL_VERIFIED',browser:browser.version(),...result};fs.mkdirSync(path.join(__dirname,'build'),{recursive:true});fs.writeFileSync(path.join(__dirname,'build/browser-results.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
