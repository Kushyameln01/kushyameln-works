const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const files=new Set(['/test/browser.html','/test/cases.mjs','/euler-kernel.mjs','/kernel-registry.mjs','/kernel/euler.wasm']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(!files.has(name)){res.writeHead(404);res.end();return;}
  const mime=name.endsWith('.wasm')?'application/wasm':name.endsWith('.html')?'text/html':'text/javascript';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});
  fs.createReadStream(path.join(root,name)).pipe(res);
});
(async()=>{
  let browser;
  const errors=[];
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/test/browser.html`);
    await page.waitForFunction(()=>window.result||window.failure,{},{timeout:30000});
    const state=await page.evaluate(()=>({result:window.result,failure:window.failure}));
    if(state.failure||!state.result?.passed||errors.length) throw Error(JSON.stringify({state,errors}));
    const result={browser:await browser.version(),errors,...state.result};
    fs.writeFileSync(path.join(root,'browser-results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
