// Run only against an acquired, deployed Pages copy. Real Worker threads + WASM.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {base,receipt,poolFor} from '../unity-analysis/cloud-harness.mjs';
const {createSharedDiagnostics}=await import(new URL('animator-composer/lib/shared-diagnostics.mjs',base));
const encode=new TextEncoder();
const file=(path,character,count)=>({path,bytes:encode.encode('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &1\nGameObject:\n  m_Name: '+character.repeat(count)+'\n')});
const payload=files=>({files,parameterLinks:[],source:{target:'input'},coverage:{unselected:[],referenceOnly:[]}});
const context={inputRevision:1,selectionRevision:1,planRevision:1,target:'input'};
const hash=f=>createHash('sha256').update(f.bytes).digest('hex');
const samples=[];
for(const kind of ['snapshot','report']){
  const pool=poolFor(2,false),service=createSharedDiagnostics({pool});
  const files=kind==='snapshot'?[file('Assets/one.asset','a',2500000),file('Assets/two.asset','b',2500000)]:[file('Assets/one.asset','a',2500000)];
  const changed=[file('Assets/one.asset','b',2500000)];
  const inventory=files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:hash(f)}));
  try{
    const result=await service.start({...context,target:kind==='report'?'compare':'input'},()=>kind==='snapshot'?payload(files):{before:payload(files),after:payload(changed)}).promise;
    assert.equal(result.status,'failed');assert.equal(result.sdkReport,null);
    assert.match(result.reason.message,kind==='snapshot'?/SNAPSHOT_IR_LIMIT|Snapshot limit exceeded/:/Report budget exceeded|REPORT_BYTE_LIMIT/);
    assert.deepEqual(files.map(hash),inventory.map(f=>f.sha256),'Caller original bytes remain intact');
    samples.push({kind,expectedStatus:'failed',status:result.status,reason:result.reason,operationId:result.operationId,context:result.context,timings:result.timings,inventory,after:kind==='report'?changed.map(f=>({path:f.path,bytes:f.bytes.length,sha256:hash(f)})):null});
    const recovery=await service.start({...context,inputRevision:2},()=>payload([file('Assets/recovery.asset','x',1)])).promise;
    assert.equal(recovery.status,'succeeded');assert.equal(recovery.sdkReport.before.counts.objects,1);
    samples.at(-1).recovery={status:recovery.status,objects:recovery.sdkReport.before.counts.objects};
  }finally{service.dispose();pool.dispose();}
}
console.log(JSON.stringify({status:'PASS',commit:receipt.sourceCommit??receipt.commit,scope:'Deployed code in Node Worker threads with real shared File SDK and WASM; not browser timing',settings:{concurrency:2,moduleReuse:false},samples},null,2));
