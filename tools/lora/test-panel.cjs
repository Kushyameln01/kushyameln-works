const assert=require('node:assert/strict');const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const http=require('node:http');const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
(async()=>{
 const docs=path.resolve(__dirname,'../../docs');const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'lora-panel-'));const dir=path.join(temp,'Models');await fsp.mkdir(dir);
 const header=Buffer.from(JSON.stringify({'diffusion_model.layer.lora_A.weight':{dtype:'BF16',shape:[1,1],data_offsets:[0,2]},'diffusion_model.layer.lora_B.weight':{dtype:'BF16',shape:[1,1],data_offsets:[2,4]}}));const prefix=Buffer.alloc(8);prefix.writeBigUInt64LE(BigInt(header.length));const bytes=Buffer.concat([prefix,header,Buffer.from([128,63,0,64])]);
 const files=['HighNoise.safetensors','LowNoise.safetensors'].map(name=>path.join(dir,name));for(const file of files)await fsp.writeFile(file,bytes);
 const requests=[];const server=http.createServer((req,res)=>{requests.push(req.url);const p=path.resolve(docs,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(docs+path.sep)){res.writeHead(403).end();return;}let file=p;if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(`http://127.0.0.1:${server.address().port}/lora/`);
  await page.locator('input[type=file][webkitdirectory]').waitFor({timeout:3000});
  assert.match(await page.locator('[data-role=connection]').textContent(),/推論モジュール未接続/);
  const rejected=await page.evaluate(()=>[ {contractVersion:'lora-connection/2.0-draft.1'}, {stagingOnly:true} ].map(connection=>{try{window.loraPanel.connect(connection);return null;}catch(e){return e.message;}}));
  assert.match(rejected[0],/v1/);assert.match(rejected[1],/staging/);
  await page.locator('input[type=file]').setInputFiles(dir);await page.waitForFunction(()=>!document.querySelector('[data-action=inspect]').disabled);
  assert.equal(await page.locator('[data-role=pair] option').count(),1);assert.equal(await page.locator('[data-role=noise]').inputValue(),'high');
  await page.locator('[data-action=inspect]').click();await page.waitForFunction(()=>document.querySelector('[data-role=result]').textContent.includes('tensor: 2'));
  assert.match(await page.locator('[data-role=result]').textContent(),/HighNoise.safetensors/);assert.equal(await page.locator('[data-action=apply]').isDisabled(),true);
  await page.locator('[data-role=noise]').selectOption('low');await page.locator('[data-action=inspect]').click();await page.waitForFunction(()=>document.querySelector('[data-role=result]').textContent.includes('LowNoise.safetensors'));
  await page.evaluate(()=>{
   const registry={apiVersion:1,modelHash:'a'.repeat(64),graphHash:'b'.repeat(64),registryVersion:'fixture-v1',targets:[{key:'diffusion_model.layer.weight',weightId:'w',graphInitializer:'w',module:'diffusion_models',dtype:'F32',layout:'row-major',shape:[1,1]}]};
   window.fixture={commits:0,weights:null};
   const target={describe:async()=>registry,prepareLoad:async handle=>handle,prepareBase:async()=>({base:true}),validate:async candidate=>candidate.base===true||candidate.data[0]===3,commit:async candidate=>{window.fixture.commits++;window.fixture.weights=candidate.base?[1]:[...candidate.data];},rollback:async()=>{}};
   const connection={targetResolver:async()=>target,baseProvider:{readBlock:async()=>new Float32Array([1])},createSink:async()=>{let data;return{begin:async()=>{},writeBlock:async block=>{data=block.data;},finish:async()=>({data}),abort:async()=>{},release:async()=>{}};}};
   window.fixture.connection=connection;window.loraPanel.connect(connection);
  });
  await page.locator('[data-action=apply]').click();await page.waitForFunction(()=>document.querySelector('[data-role=status]').textContent==='consumerの切替処理が完了しました。生成snapshotは未確認です。');
  assert.deepEqual(await page.evaluate(()=>window.fixture.weights),[3]);
  await page.locator('[data-action=detach]').click();await page.waitForFunction(()=>document.querySelector('[data-role=status]').textContent==='選択したsideを解除しました。管理snapshotは未確認です。');assert.deepEqual(await page.evaluate(()=>window.fixture.weights),[1]);
  await page.evaluate(()=>{window.fixture.connection.targetResolver=()=>new Promise(resolve=>{window.resolveOldTarget=resolve;});window.loraPanel.connect(window.fixture.connection);});
  await page.locator('[data-action=apply]').click();await page.waitForFunction(()=>typeof window.resolveOldTarget==='function');await page.locator('[data-role=noise]').selectOption('high');
  await page.evaluate(async()=>{window.resolveOldTarget({describe:async()=>{throw Error('Stale target must not be read');}});await new Promise(r=>setTimeout(r,30));});
  assert.equal(await page.locator('[data-role=status]').textContent(),'設定を変更しました。');assert.equal(await page.evaluate(()=>window.fixture.commits),2);
  assert.deepEqual(errors,[]);assert.equal(requests.some(u=>/\.safetensors|huggingface|google/.test(u)),false);await page.evaluate(()=>window.loraPanel.dispose());assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),0);
  console.log(JSON.stringify({status:'PASS',host:'Chromium',cases:12,tensorCount:2,modelHTTPRequests:0,requests}));
 }finally{await browser.close();await new Promise(r=>server.close(r));await fsp.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
