// Expectations authored before implementation. Execute only on an identified deployed Pages copy.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.UNITY_PAGES_ROOT;
assert.ok(root,'UNITY_PAGES_ROOT must identify the acquired Pages revision');
const receipt=JSON.parse(await readFile(root+'/../acquisition.json','utf8'));
assert.equal(receipt.status,'verified-deployed-pages-copy');
const base=pathToFileURL(root+'/');
const {analyzeSnapshot,compareSnapshots}=await import(new URL('shared/unity-analysis/analysis.mjs',base));
const {normalizeAssetId,freezeDeep}=await import(new URL('shared/unity-analysis/model.mjs',base));
const {createReportCache}=await import(new URL('unity-analyzer/report-cache.mjs',base));
const {instantiateUnityKernel}=await import(new URL('shared/unity-analysis/kernel/kernel.mjs',base));
const kernel=instantiateUnityKernel(await WebAssembly.compile(await readFile(new URL('shared/unity-analysis/kernel/unity-analysis.wasm',base))));
after(()=>kernel.dispose());
const g='abcdef0123456789abcdef0123456789',h='bcdef0123456789abcdef0123456789a';
const snapshot=files=>({schemaVersion:'unity-analysis-snapshot/1',files});
const object=(fileId='1',extra={})=>({fileId,classId:'1',properties:{name:'unchanged'},...extra});
const file=(path='Assets/Original.asset',id=g)=>({path,guid:id,contentHash:'1'.repeat(64),objects:[object()]});

test('GUID case alone changes neither file nor object identity and never mutates input',()=>{
 const before=snapshot([file()]),later=structuredClone(before);later.files[0].guid=g.toUpperCase();
 const original=JSON.stringify([before,later]),diff=compareSnapshots(before,later,kernel);
 assert.deepEqual(diff.fileChanges,[]);assert.deepEqual(diff.changes,[]);assert.deepEqual(diff.ambiguous,[]);
 assert.equal(JSON.stringify([before,later]),original);assert.equal(later.files[0].guid,g.toUpperCase());
});
test('normalized GUID identity retains rename and raw hash changes',()=>{
 const before=snapshot([file()]),later=snapshot([file('Assets/Renamed.asset',g.toUpperCase())]);later.files[0].contentHash='2'.repeat(64);
 const diff=compareSnapshots(before,later,kernel);
 assert.deepEqual(new Set(diff.fileChanges.map(x=>x.kind)),new Set(['file-renamed','raw-bytes-changed']));
 assert.ok(diff.fileChanges.every(x=>x.identity===g));assert.deepEqual(diff.changes,[]);
 assert.equal(diff.fileChanges.find(x=>x.kind==='raw-bytes-changed').beforeHash,'1'.repeat(64));
});
test('case variants of one GUID stay ambiguous within each snapshot',()=>{
 const input=snapshot([file('Assets/A.asset'),file('Assets/B.asset',g.toUpperCase()),{path:'Assets/Source.asset',objects:[object('2',{references:[{property:'/ref',guid:g.toUpperCase(),fileId:'1'}]})]}]);
 const report=analyzeSnapshot(input,kernel),diff=compareSnapshots(input,structuredClone(input),kernel);
 assert.ok(report.findings.some(x=>x.code==='DUPLICATE_ASSET_ID'&&x.assetId===g));assert.equal(report.references[0].state,'ambiguous');
 assert.ok(diff.ambiguous.some(x=>x.kind==='file-identity'&&x.identity===g&&x.beforeCount===2&&x.afterCount===2));assert.deepEqual(diff.fileChanges,[]);
});
test('explicit scopes and Expression links normalize GUID case without rewriting supplied values',()=>{
 const input=snapshot([{path:'Assets/C.controller',guid:g,objects:[object('1',{classId:'91',parameters:[{name:'Speed',type:'Float'},{name:'Toggle',type:'Float'}]})]},
  {path:'Assets/E.asset',guid:h,objects:[object('2',{classId:'114',parameters:[{domain:'vrchat-expression',name:'Toggle',type:'Bool'}]})]},
  {path:'Assets/U.asset',objects:[object('3',{parameterUses:[{name:'Speed',allowedTypes:['Float'],scope:{assetId:g.toUpperCase(),fileId:'1'}}]})]}]);
 input.parameterLinks=[{expression:{assetId:h.toUpperCase(),fileId:'2'},controller:{assetId:g.toUpperCase(),fileId:'1'}}];
 const original=JSON.stringify(input),report=analyzeSnapshot(input,kernel);
 assert.equal(report.parameters.checks[0].verdict,'compatible');assert.equal(report.parameters.checks[0].scope,g+':1');
 assert.equal(report.parameters.conversions[0].state,'permitted-conversion');assert.equal(report.parameters.conversions[0].expression,h+':2');
 const later=structuredClone(input);later.files[2].objects[0].parameterUses[0].scope.assetId=g;
 assert.deepEqual(compareSnapshots(input,later,kernel).changes,[]);assert.equal(JSON.stringify(input),original);
});
test('recognized reference identity is case-insensitive while original property differences remain',()=>{
 const before=snapshot([file()]);before.files[0].objects[0].properties.serializedGuid=g;
 before.files[0].objects[0].references=[{property:'/ref',guid:g,fileId:'1'}];
 const later=structuredClone(before);later.files[0].objects[0].properties.serializedGuid=g.toUpperCase();later.files[0].objects[0].references[0].guid=g.toUpperCase();
 const diff=compareSnapshots(before,later,kernel),report=analyzeSnapshot(later,kernel);
 assert.equal(diff.changes.filter(x=>x.domain==='references').length,0);
 assert.ok(diff.changes.some(x=>x.domain==='property'&&x.property==='/serializedGuid'&&x.before===g&&x.after===g.toUpperCase()));
 assert.equal(report.objects[0].properties.serializedGuid,g.toUpperCase());assert.equal(report.references[0].state,'resolved');
});
test('path case and unknown property values are not normalized as GUID identities',()=>{
 const upper='input:Assets/Upper.asset',lower='input:Assets/upper.asset';
 assert.equal(normalizeAssetId(upper),upper);assert.equal(normalizeAssetId(lower),lower);assert.notEqual(normalizeAssetId(upper),normalizeAssetId(lower));
 const before=snapshot([{path:'Assets/Upper.asset',objects:[object()]}]),later=snapshot([{path:'Assets/upper.asset',objects:[object()]}]);
 const diff=compareSnapshots(before,later,kernel);assert.deepEqual(new Set(diff.fileChanges.map(x=>x.kind)),new Set(['file-removed','file-added']));
 assert.deepEqual(new Set(diff.changes.map(x=>x.kind)),new Set(['object-removed','object-added']));
});

test('compact size is computed once; rendering does not create pretty JSON; display and save reuse full output',()=>{
 let time=0;const cache=createReportCache({clock:()=>++time}),report=freezeDeep({sessionId:'current',title:'日本語🙂',findings:Array.from({length:123},(_,i)=>({index:i,evidence:'preserved '+i})),unknown:{rawText:'unparsed\nbody'}});
 cache.reset(7);assert.equal(cache.accept(report,6),false);assert.equal(cache.accept(report,7),true);assert.equal(cache.accept(report,7),true);
 assert.equal(cache.compactBytes,new TextEncoder().encode(JSON.stringify(report)).byteLength);
 assert.equal(cache.diagnostics().compactSerializations,1);assert.equal(cache.diagnostics().prettySerializations,0);
 for(let i=0;i<6;i++){void cache.compactBytes;cache.recordRender(1.25);}
 assert.equal(cache.diagnostics().renderCount,6);assert.equal(cache.diagnostics().prettySerializations,0);assert.equal(cache.diagnostics().compactSerializations,1);
 const display=cache.pretty(),save=cache.pretty();assert.equal(display,save);assert.deepEqual(JSON.parse(save),report);assert.equal(JSON.parse(save).findings.length,123);
 assert.equal(cache.diagnostics().prettySerializations,1);assert.ok(cache.diagnostics().prettySerializationMs>=0);assert.ok(Object.isFrozen(cache.diagnostics()));
 assert.equal(report.uiDiagnostics,undefined);
});
test('input change/pagehide reset releases report text; old reports cannot replace the current revision',()=>{
 const cache=createReportCache(),first=freezeDeep({name:'old',rows:['all old rows']}),second=freezeDeep({name:'new',rows:['all new rows']});
 cache.reset(1);assert.equal(cache.accept(first,1),true);cache.pretty();cache.reset(2);
 assert.equal(cache.diagnostics().hasReport,false);assert.equal(cache.diagnostics().prettyCached,false);assert.equal(cache.compactBytes,null);assert.throws(()=>cache.pretty(),/REPORT_CACHE_EMPTY/);
 assert.equal(cache.accept(first,1),false);assert.equal(cache.accept(second,2),true);assert.equal(cache.accept(first,2),false);
 assert.deepEqual(JSON.parse(cache.pretty()),second);assert.equal(cache.diagnostics().compactSerializations,1);assert.equal(cache.diagnostics().prettySerializations,1);
 cache.reset(3);assert.equal(cache.diagnostics().hasReport,false);assert.equal(cache.diagnostics().prettyCached,false);assert.equal(cache.diagnostics().renderCount,0);
});

// Required actual deployed UI observations, separate from the helper assertions above:
// 1. Result accepted: compactSerializations=1, prettySerializations=0, output remains empty/hidden.
// 2. Change filter, page and snapshot: renderCount grows, both serialization counts are unchanged.
// 3. Display then save (and save then display on a fresh report): prettySerializations=1; saved JSON is full report.
// 4. Change input while work is pending: old completion does not restore cache/output; new input receives a new cache.
// 5. Clear/pagehide: report/pretty cache, textarea and Blob URLs are released; counters reset.
