/** Actual default operational holding proxy and native Worker/codec controls.
 * No model files, injected factories, NN, LoRA package or numerical oracle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const require=createRequire('/opt/codex/cua_node/package.json');
const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');

test('holding proxy uses real operational root, native Worker, canonical retained artifacts and exact root cancellation',async()=>{
 const workers=[],errors=[],denied=[];let browser;
 const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Model-free holding controller</title>');return;}
  if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+sep)||!['/docs/','/tools/ai-connection/'].some(prefix=>pathname.startsWith(prefix))){denied.push(pathname);res.writeHead(403).end();return;}
  try{
   const body=await readFile(path);
   // Keep a real Worker startup pending long enough to observe exact targets.
   if(pathname.endsWith('/diffusion-models/api/worker.mjs'))await new Promise(r=>setTimeout(r,150));
   res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');res.end(body);
  }catch(e){errors.push({path:pathname,message:e.message});res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push({page:e.message}));
  page.on('worker',worker=>{const row={url:worker.url(),closed:false};workers.push(row);worker.on('close',()=>{row.closed=true;});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const result=await page.evaluate(async()=>{
   const {createHoldingOperationalManager}=await import('/tools/ai-connection/diffusion-public-browser.mjs');
   const manager=await createHoldingOperationalManager({apiSessionId:'holding-model-free-api',managerSessionId:'holding-model-free-public'});
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   const observations=[],NativeWorker=Worker;
   globalThis.Worker=class extends NativeWorker{
    constructor(url,options){const requested=new URL(url,location.href),bootstrap=new URL('/tools/ai-connection/diffusion-public-worker-observer.mjs',location.href);bootstrap.searchParams.set('worker',requested.href);super(bootstrap,options);this.addEventListener('message',e=>{if(e.data?.__publicWasmObservation)observations.push(e.data);});}
   };
   try{
    const initial=manager.inspect();check(initial.controlTestDouble===false&&initial.root.modules.diffusion.configured,'Actual default controller not configured');
    const status=await manager.modelStatus();check(status.result.loaded===false&&status.rootTarget.requestId!==status.target.requestId,'Root/public response identities collapsed');
    check(status.rootTerminal.originalTerminal&&status.rootTerminal.resourceReleased&&status.rootTerminal.resultAccepted,'Root terminal unconfirmed');
    const input={dtype:'float32',shape:[1,16,1,2,2],layout:'NCTHW',meaning:'raw-posterior-mean',modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:Float32Array.from({length:64},(_,i)=>i/16)};
    const before=Array.from(new Uint32Array(input.data.buffer));
    const saved=await manager.saveTensor({tensor:input}),read=await manager.readTensor({file:new File([saved.bytes],'actual-native-control.wktensor')});
    check(read.sha256===saved.sha256&&read.artifact?.tensor,'Native codec/read artifact missing');
    const durable=await manager.saveRetainedTensor(read.outputRef),durableRead=await manager.readTensor({file:durable});
    check(durableRead.sha256===saved.sha256,'Controller retained canonical bytes changed');
    check(JSON.stringify(before)===JSON.stringify(Array.from(new Uint32Array(input.data.buffer))),'Caller input mutated');
    check(JSON.stringify(before)===JSON.stringify(Array.from(new Uint32Array(durableRead.tensor.data.buffer))),'Retained artifact bits changed');
    // A paired-load attempt starts in a fresh real Worker. Cancel while its
    // module is loading; tiny files cannot produce numerical model execution.
    const priorBootstraps=observations.filter(value=>value.stage==='worker-bootstrap').length;
    const pending=manager.load({files:{HIGH:new File([new Uint8Array(8)],'invalid-high'),LOW:new File([new Uint8Array(8)],'invalid-low')}});
    const rejected=pending.then(()=>{throw Error('Cancelled load unexpectedly succeeded');},e=>e.code);
    let observation;const deadline=performance.now()+10000;
    do{observation=manager.inspect();if(observation.activeTarget&&observation.root.modules.diffusion.observation.activeTarget&&observations.filter(value=>value.stage==='worker-bootstrap').length>priorBootstraps)break;await new Promise(r=>setTimeout(r,0));}while(performance.now()<deadline);
    const rootTarget=observation.activeTarget,publicTarget=observation.root.modules.diffusion.observation.activeTarget;
    check(rootTarget&&publicTarget&&rootTarget.requestId!==publicTarget.requestId,'Active root/public targets missing');
    let wrongCode;try{await manager.cancel(publicTarget);}catch(e){wrongCode=e.code;}
    check(['TARGET_MISMATCH','STALE_INVOCATION'].includes(wrongCode),'Public target was incorrectly accepted as root cancellation: '+wrongCode);
    const cancelled=await manager.cancel(rootTarget);check(cancelled.originalTerminal&&cancelled.resourceReleased&&cancelled.stopConfirmed,'Exact root cancel failed');
    check(await rejected==='INVOCATION_CANCELLED','Root operation did not reject after cancellation');
    const resumed=await manager.modelStatus();check(resumed.result.loaded===false,'Fresh idle owner did not recover');
    check(observations.some(value=>value.stage==='worker-import-ready'&&value.captureListenerRemoved===true),'Actual observer startup did not complete');
    check(observations.every(value=>value.crossOriginIsolated===false),'Default no-COI environment changed');
    return {controlTestDouble:false,nativeNNExecuted:false,scope:'Actual default operational proxy, real Worker/codec, synthetic tensor File, invalid-file cancellation only',identitySeparation:status.identitySeparation,cancelTargets:{rootTarget,publicTarget},wrongTargetRejected:true,rootCancelled:cancelled,callerInputBitsPreserved:true,controllerArtifactPersisted:true,observerMessages:observations.length};
   }finally{await manager.dispose();globalThis.Worker=NativeWorker;}
  });
  const deadline=Date.now()+10000;while(workers.some(row=>!row.closed)&&Date.now()<deadline)await page.waitForTimeout(50);
  assert.ok(workers.length>=3);assert.ok(workers.every(row=>row.closed),'Physical Worker close must precede browser teardown');
  assert.deepEqual(errors,[]);assert.deepEqual(denied,[]);assert.equal(result.nativeNNExecuted,false);assert.equal(result.wrongTargetRejected,true);assert.equal(result.controllerArtifactPersisted,true);
  process.stdout.write(JSON.stringify({...result,physicalWorkersClosedBeforeBrowserTeardown:true,workerCount:workers.length})+'\n');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
