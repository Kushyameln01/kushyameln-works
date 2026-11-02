const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
const root=path.resolve(__dirname,'../../../../docs/shared/inference/lora/kernel');

(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0];if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Streaming Hike LoRA</title>');return;}
  if(!['/host.mjs','/registry.mjs','/lora.wasm','/streaming/host.mjs','/streaming/registry.mjs','/streaming/lora.wasm'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(fs.readFileSync(path.join(root,name)));
 });let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{
   const {createStreamingKernel}=await import('/streaming/host.mjs'),{createKernel}=await import('/host.mjs');
   const k=await createStreamingKernel(),old=await createKernel(),cases=[];
   function bits(a){return new Uint32Array(a.buffer,a.byteOffset,a.length);}
   function same(a,b){const aa=bits(a),bb=bits(b);if(aa.length!==bb.length)throw Error('shape mismatch');for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])throw Error('F32 bit mismatch '+i);}
   for(const [cols,rank]of [[7,3],[17,64],[256,64],[4096,64],[5120,128],[13824,128]]){
    const rows=2,down=Float32Array.from({length:rank*cols},(_,i)=>Math.sin(i*.37)*.02),up=Float32Array.from({length:rows*rank},(_,i)=>Math.cos(i*.17)*.03),base=Float32Array.from({length:rows*cols},(_,i)=>(i%17-8)*.01),delta=k.product({down,up,rows,cols,rank});
    for(const scale of [0,-.73,1,1.0000001192092896])same(k.apply({base,delta,scale}),old.merge({base,down,up,rows,cols,rank,scale}));cases.push({rows,cols,rank,comparedValues:4*base.length});
   }
   const lease=k.retain('browser-owned-package');k.dispose();if(!lease.isValid())throw Error('Owner disposal invalidated lease');
   same(lease.kernel.product({down:new Float32Array([2]),up:new Float32Array([3]),rows:1,cols:1,rank:1}),new Float32Array([6]));lease.release();
   const stats=k.stats();if(!stats.disposed||stats.leaseCount!==0||stats.memoryBytes!==0)throw Error('Final lease did not release kernel');old.dispose();return {kernel:k.info,cases,stats};
  });
  const record={status:'HTTP_BROWSER_STREAMING_KERNEL_VERIFIED',browser:browser.version(),...result};fs.mkdirSync(path.join(__dirname,'build'),{recursive:true});fs.writeFileSync(path.join(__dirname,'build/browser-results.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
