import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const [url,out,sourcePath]=process.argv.slice(2);assert(url&&out);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.VISEME_CHROME_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
const proof={url,browser:browser.version(),cases:[],errors};
const wait=async()=>{await page.waitForFunction(()=>!document.querySelector('#result').hidden||document.querySelector('#status').dataset.error==='true');};
async function generate(mesh,file){
  if(mesh!==undefined)await page.locator('#mesh').fill(mesh);
  await page.locator('#generate').click();await wait();assert(await page.locator('#result').isVisible(),await page.locator('#status').innerText());
  const pending=page.waitForEvent('download');await page.locator('#download').click();const download=await pending;
  assert.equal(download.suggestedFilename(),'Viseme.unitypackage');await download.saveAs(resolve(out,file));
  const bytes=await readFile(resolve(out,file));proof.cases.push({name:file,meshName:mesh??'Body',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
try{
  assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);
  assert.equal(await page.locator('#mesh').inputValue(),'Body');
  await generate(undefined,'browser-body.unitypackage');
  await page.screenshot({path:resolve(out,'desktop.png'),fullPage:true});
  await page.locator('#mesh').fill('顔/メッシュ "A" #1');assert(await page.locator('#result').isHidden());assert.equal(await page.locator('#download').getAttribute('href'),null);
  await generate('顔/メッシュ "A" #1','browser-unicode.unitypackage');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(out,'mobile.png'),fullPage:true});
  await page.locator('#mesh').fill('');await page.locator('#generate').click();assert(await page.locator('#result').isHidden());assert.equal(await page.locator('#mesh').getAttribute('aria-invalid'),'true');
  await page.locator('#mesh').fill('Body');
  await page.evaluate(()=>{document.querySelector('#generate').click();document.querySelector('#cancel').click();});
  assert(await page.locator('#result').isHidden());assert.match(await page.locator('#status').innerText(),/取り消し/);
  await generate('Face','browser-retry.unitypackage');
  proof.cases.push({name:'edit invalidation, empty rejection, cancel/retry',status:'PASS'});
  await page.route('**/viseme-template/template.json',route=>route.fulfill({body:'{}',contentType:'application/json'}));
  await page.locator('#generate').click();await wait();assert(await page.locator('#result').isHidden());assert.match(await page.locator('#status').innerText(),/Template/);
  await page.unroute('**/viseme-template/template.json');
  await generate('Body','browser-recovered.unitypackage');
  proof.cases.push({name:'corrupt Template rejection and recovery',status:'PASS'});
  const modes=await page.evaluate(async()=>{
    const {createComputePool}=await import('../shared/compute/client.mjs');
    const {createVisemeGenerator}=await import('./client.mjs');
    const rows=[];
    for(const workerMode of ['module','bundle']){
      const pool=createComputePool({concurrency:2,workerMode});
      const generator=createVisemeGenerator({pool});
      try{
        const cancelled=generator.generate('Cancelled',{inputRevision:11}).then(()=>{throw Error('cancel should reject');},e=>{if(e.name!=='AbortError')throw e;});
        generator.cancel();await cancelled;
        const result=await generator.generate('Face',{inputRevision:12});
        if(result.execution.metrics.wasmSha256!=='b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad')throw Error('Expected actual Hike execution');
        if(pool.getResult(result.execution.jobId)!==null)throw Error('delivery-only result retained');
        generator.dispose();
        const ft=await pool.submit({protocolVersion:1,taskType:'ft-magnitude-batch',taskVersion:1,jobId:'survivor.'+workerMode,inputRevision:13,payload:{masks:[0,3,5],weights:[1,2,4]}}).promise;
        if(ft.status!=='succeeded'||String(ft.result)!=='0,3,5')throw Error('Borrowed pool was destroyed');
        const template=await pool.submit({protocolVersion:1,taskType:'parameter-template-generate',taskVersion:1,jobId:'old-template.'+workerMode,inputRevision:14,payload:{target:'v2/VisemeRegression'}}).promise;
        if(template.status!=='succeeded'||template.result.treeCount!==16)throw Error('Existing Template task regression');
        rows.push({workerMode,status:'PASS',metrics:result.execution.metrics,poolStatus:pool.getStatus(),bytes:Array.from(result.bytes)});
      }finally{generator.dispose();pool.dispose();}
    }return rows;
  });
  for(const row of modes){await writeFile(resolve(out,'browser-'+row.workerMode+'.unitypackage'),new Uint8Array(row.bytes));delete row.bytes;}
  proof.modes=modes;
  if(sourcePath){
    const sourceBytes=await readFile(sourcePath),outputBytes=await readFile(resolve(out,'browser-body.unitypackage'));
    const report=await page.evaluate(async({before,after})=>{
      const {createUnityFileAnalyzer}=await import('../shared/unity-analysis/file-sdk.mjs');
      const analyzer=createUnityFileAnalyzer({concurrency:2});
      try{return await analyzer.compare([{path:'Template.unitypackage',bytes:Uint8Array.from(before)}],[{path:'Output.unitypackage',bytes:Uint8Array.from(after)}],{inputRevision:21});}
      finally{analyzer.dispose();}
    },{before:Array.from(sourceBytes),after:Array.from(outputBytes)});
    await writeFile(resolve(out,'unity-analysis.json'),JSON.stringify(report,null,2)+'\n');
    assert.equal(report.status,'succeeded');proof.analysis={status:report.status,buildId:report.buildId,completeness:report.completeness};
  }
  assert.deepEqual(errors,[]);
  proof.networkOrigins=[...new Set(requests.filter(r=>!r.startsWith('blob:')).map(r=>new URL(r).origin))];
  assert.deepEqual(proof.networkOrigins,[new URL(url).origin]);
  proof.status='PASS';await writeFile(resolve(out,'browser.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,browser:proof.browser,cases:proof.cases,modes:modes.map(m=>({mode:m.workerMode,status:m.status})),analysis:proof.analysis}));
}finally{await browser.close();}
