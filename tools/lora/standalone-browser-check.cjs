// Development-only actual Chromium / File / OPFS controller acceptance.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
const repo=path.resolve(__dirname,'../..');
const args=process.argv.slice(2);if(args.includes('--help')){console.log('node tools/lora/standalone-browser-check.cjs [--out <directory outside repository>]');process.exit(0);}
if(args.length!==0&&(args.length!==2||args[0]!=='--out'||!args[1]))throw Error('Only --out <directory outside repository> is accepted');
const outIndex=args.indexOf('--out'),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8),out=path.resolve(outIndex<0?'/workspace/work/lora/standalone-task/browser-'+runId:args[outIndex+1]??'');
if(out===repo||out.startsWith(repo+path.sep))throw Error('Only --out outside the repository is accepted');
const directoryName='lora-standalone-fixture-'+runId,served=new Map(),requests=[],errors=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Standalone LoRA browser acceptance</title>');return;}
 const name=decodeURIComponent(url.pathname),allowed=name.startsWith('/docs/shared/inference/lora/')||['/docs/shared/vr180/sha256.mjs','/tools/lora/standalone-host.mjs','/tools/lora/standalone-browser-fixture.mjs'].includes(name),file=path.resolve(repo,'.'+name);
 if(!allowed||!file.startsWith(repo+path.sep)||!['.mjs','.wasm'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
 try{const bytes=fs.readFileSync(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex');if(served.has(name)&&served.get(name).sha256!==sha256)throw Error('Source changed between browser phases');served.set(name,{path:name.slice(1),bytes:bytes.length,sha256});requests.push(name);res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.setHeader('Cache-Control','no-store');res.end(bytes);}catch(error){errors.push({path:name,message:error.message});res.writeHead(404);res.end();}
});
(async()=>{
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('Browser acceptance output directory must be fresh/empty');fs.mkdirSync(out,{recursive:true});let browser,control,readback,page,baseURL;const started=Date.now();
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort());
  page=await context.newPage();page.on('pageerror',error=>errors.push({kind:'pageerror',message:error.message}));await page.goto(baseURL);
  control=await page.evaluate(async input=>(await import('/tools/lora/standalone-browser-fixture.mjs')).runControlAndSave(input),{directoryName});
  fs.writeFileSync(path.join(out,'control.json'),JSON.stringify(control,null,2)+'\n');
  await page.close();page=await context.newPage();page.on('pageerror',error=>errors.push({kind:'pageerror',message:error.message}));await page.goto(baseURL);
  readback=await page.evaluate(async input=>(await import('/tools/lora/standalone-browser-fixture.mjs')).runFreshReadback(input),control.saved);
  fs.writeFileSync(path.join(out,'readback.json'),JSON.stringify(readback,null,2)+'\n');
  if(errors.length)throw Error('Browser/server errors: '+JSON.stringify(errors));
  const report={status:'TINY_STANDALONE_BROWSER_CONTROLLER_VERIFIED',passed:true,scope:'two fixture File safetensors, HIGH registry weight[3,2] and bias[3]; controller/ownership/persistence acceptance only',wholeModel:false,all2904Patches:false,modelInference:false,normalNumericalComparison:false,testOnlyManualComparison:true,browser:browser.version(),elapsedMs:Date.now()-started,control,readback,sources:[...served.values()].sort((a,b)=>a.path.localeCompare(b.path)),httpRequests:requests,errors};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browser:report.browser,cases:control.cases.length,opfsReadback:readback.passed,sourceFiles:control.sourceFiles.length,wholeModel:false,all2904Patches:false,terminalKernelBytes:readback.terminal.kernel.memoryBytes,out}));
 }catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({status:'BROWSER_CHECK_FAILED',message:error.message,stack:error.stack,control,readback,errors,sources:[...served.values()]},null,2)+'\n');throw error;}
 finally{if(page&&baseURL)await page.evaluate(async name=>{try{const root=await navigator.storage.getDirectory();await root.removeEntry(name,{recursive:true});}catch{}},directoryName).catch(()=>{});if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
