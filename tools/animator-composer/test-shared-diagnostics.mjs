// Execute only against the permitted post-publication cloud copy of Pages.
// These are regression expectations; creating/checking this file is not a test run.
import assert from 'node:assert/strict';
import {createSharedDiagnostics,preflightDiagnosticFiles,copyDiagnosticFiles,DIAGNOSTIC_LIMITS} from '../../docs/animator-composer/lib/shared-diagnostics.mjs';
import {parseUnityFile} from '../../docs/shared/unity-analysis/text.mjs';
const encoder=new TextEncoder();
const context={inputRevision:7,selectionRevision:2,planRevision:4,target:'input'};
const payload=()=>({files:[{path:'Assets/日本語😀.asset',bytes:encoder.encode('asset')}],parameterLinks:[],source:{target:'input',packageHashes:['a'.repeat(64)]},coverage:{unselected:[],referenceOnly:[]}});
const report=options=>({status:'succeeded',sessionId:options.sessionId,inputRevision:options.inputRevision,before:{coverage:{complete:true},files:[{path:'Assets/日本語😀.asset',coverage:'partial'}],objects:[{fileId:'9223372036854775807'}]},completeness:{totalCount:0,returnedCount:0,truncated:false}});
const pool={dispose(){throw Error('Borrowed pool must not be disposed');}};
let cases=0;
{
 const text='%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!95 &9223372036854775807\nAnimator:\n  m_Name: 日本語😀\n  m_Controller: {fileID: -9223372036854775808}\n';
 const file=parseUnityFile({path:'Assets/日本語😀.prefab',text}),object=file.objects[0],ref=object.references[0];
 assert.equal(object.fileId,'9223372036854775807');assert.equal(ref.fileId,'-9223372036854775808');
 assert.equal(ref.source.start,text.indexOf('{fileID:'));assert.equal(text.slice(ref.source.start,ref.source.end),'{fileID: -9223372036854775808}');
 assert.notEqual(ref.source.start,encoder.encode(text.slice(0,ref.source.start)).byteLength,'UTF-16 offsets must never be interpreted as UTF-8 bytes');cases++;
}
{
 let copies=0;const first=new Uint8Array(1);first.slice=()=>{copies++;return new Uint8Array(1);};
 assert.throws(()=>copyDiagnosticFiles([{path:'a.bin',bytes:first},{path:'b.asset',bytes:new Uint8Array(DIAGNOSTIC_LIMITS.textBytes+1)}]),/TEXT_BYTE_LIMIT/);
 assert.equal(copies,0,'Every input is checked before the first buffer copy');cases++;
}
{
 assert.throws(()=>preflightDiagnosticFiles([{path:'A.asset',bytes:new Uint8Array()},{path:'a.asset',bytes:new Uint8Array()}]),/PATH_CONFLICT/);
 assert.throws(()=>preflightDiagnosticFiles([{path:'a',bytes:new Uint8Array()},{path:'a/b',bytes:new Uint8Array()}]),/PATH_PREFIX_CONFLICT/);
 assert.throws(()=>preflightDiagnosticFiles([{path:'../a',bytes:new Uint8Array()}]),/PATH/);
 assert.throws(()=>preflightDiagnosticFiles([{path:'a.bin',bytes:new Uint8Array(DIAGNOSTIC_LIMITS.fileBytes+1)}]),/FILE_SIZE_LIMIT/);
 assert.throws(()=>preflightDiagnosticFiles(Array.from({length:2049},(_,i)=>({path:String(i),bytes:new Uint8Array()}))),/FILE_COUNT_LIMIT/);
 assert.throws(()=>preflightDiagnosticFiles([0,1,2].map(i=>({path:i+'.bin',bytes:new Uint8Array(12*1024*1024)}))),/RAW_INPUT_LIMIT/);cases++;
}
{
 const source=new Uint8Array([1,2,3]);const result=copyDiagnosticFiles([{path:'a.bin',bytes:source},{path:'a.bin.meta',text:'日本語😀'}]);
 assert.deepEqual(result[0].bytes,source);assert.notEqual(result[0].bytes.buffer,source.buffer);assert.equal(source.byteLength,3);
 assert.equal(result[1].bytes.byteLength,encoder.encode('日本語😀').byteLength);cases++;
}
{
 let called=false;const service=createSharedDiagnostics({pool,analyzerFactory:()=>({analyze(){called=true;}})});
 const h=service.start(context,()=>({notRunReason:{code:'GUID_CHOICE_REQUIRED',message:'Select a version'},source:{target:'input'},coverage:{}}));
 assert.match(h.operationId,/^sd-/);const r=await h.promise;assert.equal(r.status,'not-run');assert.equal(r.sdkReport,null);assert(!called);service.dispose();cases++;
}
for(const kind of ['prepare-sync','prepare-async','sdk-sync','sdk-async']){
 const service=createSharedDiagnostics({pool,analyzerFactory:()=>({analyze(){if(kind==='sdk-sync')throw Error('SDK_SYNC');return Promise.reject(Error('SDK_ASYNC'));},dispose(){}})});
 const h=service.start(context,()=>{if(kind==='prepare-sync')throw Error('PREPARE_SYNC');if(kind==='prepare-async')return Promise.reject(Error('PREPARE_ASYNC'));return payload();});
 const r=await h.promise;assert.equal(r.status,'failed');assert.equal(r.sdkReport,null);assert.equal(r.operationId,h.operationId);assert.equal(r.context.inputRevision,7);assert(r.reason.message);service.dispose();cases++;
}
{
 const service=createSharedDiagnostics({pool,onUpdate(){throw Error('UI callback failure');},analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}})});
 const r=await service.start(context,payload).promise;assert.equal(r.status,'succeeded');assert.equal(r.sdkReport.before.objects[0].fileId,'9223372036854775807');
 assert.equal(r.sourcePositionUnit,'UTF-16 code units');assert.equal(r.exportCompleteness.truncated,false);assert.equal(r.exportCompleteness.sdkReportIncluded,true);
 assert.equal(r.inputCoverage.sdk.fileCoverageCounts.partial,1);assert.equal(r.inputCoverage.sdk.allSuppliedFilesAccountedFor,true);assert.equal(r.inputCoverage.fullOriginalMaterialsDiagnosis,'not-claimed');
 assert(r.timings.callerElapsedMs>=0);assert.equal(JSON.parse(service.getJSON()).sdkReport.before.objects[0].fileId,'9223372036854775807');
 const first=service.getJSON();assert.equal(service.getJSON(),first);assert.equal(service.getCompactBytes(),encoder.encode(JSON.stringify(r)).byteLength);service.dispose();cases++;
}
{
 let release;const delayed=new Promise(resolve=>{release=resolve;});const service=createSharedDiagnostics({pool,analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}})});
 const old=service.start(context,()=>delayed);assert.equal(old.cancel(),true);assert.equal((await old.promise).status,'cancelled');
 const current=service.start({...context,inputRevision:8},payload);assert.equal((await current.promise).status,'succeeded');release(payload());await Promise.resolve();await Promise.resolve();
 assert.equal(service.getReport().operationId,current.operationId);service.dispose();cases++;
}
{
 let calls=0;const service=createSharedDiagnostics({pool});const h=service.start(context,()=>{calls++;return payload();});h.cancel();
 assert.equal((await h.promise).status,'cancelled');await Promise.resolve();assert.equal(calls,0,'Immediate cancellation prevents preparation');service.dispose();cases++;
}
{
 let calls=0;const service=createSharedDiagnostics({pool,analyzerFactory:()=>{calls++;throw Error('Not reached');}});
 const p=payload();p.parameterLinks=[{expression:{assetId:'a'.repeat(32),fileId:11400000},controller:{assetId:'b'.repeat(32),fileId:'9100000'}}];
 const r=await service.start(context,()=>p).promise;assert.equal(r.status,'failed');assert.match(r.reason.message,/PARAMETER_LINK_ID_INVALID/);assert.equal(calls,0);service.dispose();cases++;
}
{
 let calls=0;const service=createSharedDiagnostics({pool,analyzerFactory:()=>{calls++;throw Error('Not reached');}}),before=payload(),after=payload();
 after.files.push({path:'too-large.asset',bytes:new Uint8Array(DIAGNOSTIC_LIMITS.textBytes+1)});
 const r=await service.start({...context,target:'compare'},()=>({before,after})).promise;
 assert.equal(r.status,'failed');assert.match(r.reason.message,/TEXT_BYTE_LIMIT/);assert.equal(calls,0,'Both sides must pass preflight before SDK construction');service.dispose();cases++;
}
{
 let rejectOld,oldOptions,onProgress;const notices=[];
 const service=createSharedDiagnostics({pool,onUpdate:r=>notices.push(r.operationId),analyzerFactory:o=>{onProgress=o.onProgress;return {analyze:(_,opts)=>{oldOptions=opts;return new Promise((_,reject)=>{rejectOld=reject;});},cancel(){},dispose(){}};}});
 const old=service.start(context,payload);while(!rejectOld)await Promise.resolve();
 service.invalidate({...context,planRevision:5});const visible=service.getReport(),count=notices.length;
 onProgress({sessionId:oldOptions.sessionId,inputRevision:7,stage:'late'});rejectOld(Error('OLD_FAILURE'));await old.promise;await Promise.resolve();await Promise.resolve();
 assert.equal(service.getReport(),visible);assert.equal(notices.length,count);assert.equal(visible.status,'not-run');service.dispose();cases++;
}
{
 let input,options;const service=createSharedDiagnostics({pool,analyzerFactory:()=>({compare:(b,a,o)=>{input={b,a};options=o;return Promise.resolve({...report(o),after:{files:[{path:'Assets/日本語😀.asset',coverage:'serialized'}],coverage:{}},diff:{changes:[]}});},dispose(){}})});
 const before=payload(),after=payload();before.source.revision=1;after.source.revision=2;
 const r=await service.start({...context,target:'compare'},()=>({before,after})).promise;
 assert.equal(r.status,'succeeded');assert.equal(input.b,before.files);assert.equal(input.a,after.files);assert.equal(r.source.before.revision,1);assert.equal(r.source.after.revision,2);assert.deepEqual(options.parameterLinks,{before:[],after:[]});service.dispose();cases++;
}
{
 const service=createSharedDiagnostics({pool,analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve({...report(o),inputRevision:o.inputRevision+1}),dispose(){}})});
 const r=await service.start(context,payload).promise;assert.equal(r.status,'failed');assert.match(r.reason.message,/IDENTITY/);assert.equal(r.sdkReport,null);service.dispose();cases++;
}
// Stage A observations stay outside the report and never trigger report serialization.
{
 const service=createSharedDiagnostics({pool,analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}})});
 await service.start(context,payload).promise;assert.equal(service.getMetrics(),null,'Observation is disabled by default');service.dispose();cases++;
}
{
 const service=createSharedDiagnostics({pool,collectMetrics:true,analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}})});
 const h=service.start(context,payload),r=await h.promise,m=service.getMetrics();
 assert.equal(m.operationId,h.operationId);assert.equal(m.status,'succeeded');assert.equal(m.stages.prepare.calls,1);assert.equal(m.stages.sdkSettlement.calls,1);
 assert.equal(m.stages.envelopeSize.calls,1);assert(m.stages.freeze.calls>=1);assert.equal(m.stages.fullJSON.calls,0);
 for(const stage of Object.values(m.stages)){assert(stage.totalMs>=0);assert(stage.lastMs===null||stage.lastMs>=0);}
 assert.equal(Object.hasOwn(r,'measurements'),false);assert.equal(Object.hasOwn(r,'metrics'),false);
 const compact=service.getCompactBytes();service.getMetrics();service.getCompactBytes();assert.equal(service.getMetrics().stages.envelopeSize.calls,1);
 const json=service.getJSON();assert.equal(service.getJSON(),json);assert.equal(service.getMetrics().stages.fullJSON.calls,1);assert.equal(service.getCompactBytes(),compact);
 m.stages.envelopeSize.calls=999;assert.equal(service.getMetrics().stages.envelopeSize.calls,1,'Retrieved observations cannot change live counters');
 assert.deepEqual(JSON.parse(json),r);service.dispose();cases++;
}
for(const kind of ['prepare-sync','prepare-async','sdk-sync','sdk-async']){
 const service=createSharedDiagnostics({pool,collectMetrics:true,analyzerFactory:()=>({analyze(){if(kind==='sdk-sync')throw Error('SDK_SYNC');return Promise.reject(Error('SDK_ASYNC'));},dispose(){}})});
 const r=await service.start(context,()=>{if(kind==='prepare-sync')throw Error('PREPARE_SYNC');if(kind==='prepare-async')return Promise.reject(Error('PREPARE_ASYNC'));return payload();}).promise;
 const m=service.getMetrics();assert.equal(r.status,'failed');assert.equal(m.status,'failed');assert.equal(m.stages.prepare.calls,1);
 assert.equal(m.stages.sdkSettlement.calls,kind.startsWith('sdk-')?1:0);assert.equal(m.stages.envelopeSize.calls,1);service.dispose();cases++;
}
{
 let release,entered;const ready=new Promise(resolve=>{entered=resolve;});
 const service=createSharedDiagnostics({pool,collectMetrics:true,analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}})});
 const old=service.start(context,()=>{entered();return new Promise(resolve=>{release=resolve;});});await ready;old.cancel();await old.promise;
 const next=service.start({...context,inputRevision:8},payload);await next.promise;const before=service.getMetrics();
 release(payload());await Promise.resolve();await Promise.resolve();assert.deepEqual(service.getMetrics(),before,'Late preparation must not alter current observation');service.dispose();cases++;
}
// Stage B expectations: lazy dependencies, current-operation admission and immutable caller inputs.
{
 let pools=0,analyzers=0;const service=createSharedDiagnostics({poolFactory:()=>{pools++;return pool;},analyzerFactory:()=>{analyzers++;return {analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}};}});
 service.getJSON();service.getCompactBytes();service.invalidate(context);service.getJSON();assert.equal(pools,0);assert.equal(analyzers,0);
 await service.start(context,()=>({notRunReason:'NO_DIAGNOSTIC_INPUT'})).promise;assert.equal(pools,0);
 assert.equal((await service.start(context,payload).promise).status,'succeeded');assert.equal(pools,1);assert.equal(analyzers,1);
 await service.start(context,payload).promise;assert.equal(pools,1);assert.equal(analyzers,1);service.dispose();cases++;
}
{
 let attempts=0;const service=createSharedDiagnostics({poolFactory:()=>{if(++attempts===1)return Promise.reject(Error('IMPORT_FAILED'));return pool;},analyzerFactory:()=>({analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}})});
 const failed=await service.start(context,payload).promise;assert.equal(failed.status,'failed');assert.match(failed.reason.message,/IMPORT_FAILED/);
 assert.equal((await service.start(context,payload).promise).status,'succeeded');assert.equal(attempts,2);service.dispose();cases++;
}
{
 let release,pools=0,analyzers=0;const service=createSharedDiagnostics({poolFactory:()=>++pools===1?new Promise(resolve=>{release=resolve;}):pool,analyzerFactory:()=>{analyzers++;return {analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}};}});
 const old=service.start(context,payload);while(!release)await Promise.resolve();old.cancel();assert.equal((await old.promise).status,'cancelled');
 const next=service.start({...context,inputRevision:8},payload);assert.equal((await next.promise).status,'succeeded');
 release(pool);await Promise.resolve();await Promise.resolve();assert.equal(analyzers,1);assert.equal(service.getReport().operationId,next.operationId);service.dispose();cases++;
}
{
 let release,analyzers=0;const service=createSharedDiagnostics({poolFactory:()=>new Promise(resolve=>{release=resolve;}),analyzerFactory:()=>{analyzers++;return {};}});
 const h=service.start(context,payload);while(!release)await Promise.resolve();service.dispose();release(pool);await h.promise;await Promise.resolve();await Promise.resolve();
 assert.equal(analyzers,0,'Disposal during dependency loading must not construct an analyzer');cases++;
}
{
 let release,factories=0,oldDisposed=0;const service=createSharedDiagnostics({pool,analyzerFactory:()=>++factories===1?new Promise(resolve=>{release=resolve;}):{analyze:(_,o)=>Promise.resolve(report(o)),dispose(){}}});
 const old=service.start(context,payload);while(!release)await Promise.resolve();old.cancel();await old.promise;
 const next=service.start({...context,inputRevision:8},payload);assert.equal((await next.promise).status,'succeeded');
 release({analyze(){throw Error('Stale analyzer must not run');},dispose(){oldDisposed++;}});await Promise.resolve();await Promise.resolve();
 assert.equal(oldDisposed,1);assert.equal(service.getReport().operationId,next.operationId);service.dispose();cases++;
}
{
 let failFirst=true;const before=payload(),after=payload(),original=Array.from(before.files[0].bytes);Object.freeze(before.files);Object.freeze(after.files);Object.freeze(before);Object.freeze(after);
 const service=createSharedDiagnostics({pool,analyzerFactory:()=>({compare:(b,a,o)=>{assert.equal(b,before.files);assert.equal(a,after.files);if(failFirst){failFirst=false;throw Error('SNAPSHOT_FAILED');}return Promise.resolve({...report(o),after:{files:[{path:'Assets/日本語😀.asset'}]},diff:{changes:[]}});},dispose(){}})});
 assert.equal((await service.start({...context,target:'compare'},()=>({before,after})).promise).status,'failed');
 const r=await service.start({...context,target:'compare'},()=>({before,after})).promise;assert.equal(r.status,'succeeded');assert(r.inputCoverage.after.sdk.allSuppliedFilesAccountedFor);
 assert.deepEqual(Array.from(before.files[0].bytes),original);assert.equal(before.files.length,1);assert.equal(after.files.length,1);service.dispose();cases++;
}
console.log(JSON.stringify({status:'PASS',cases,note:'Mocked boundary regressions; does not certify browser Worker, WASM, Unity, MA or VRChat.'}));
