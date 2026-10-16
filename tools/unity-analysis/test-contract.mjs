// Authored before implementation. Execute only against a verified deployed Pages cloud copy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.UNITY_PAGES_ROOT;
assert.ok(root,'UNITY_PAGES_ROOT must name verified Pages copy');
const {createUnityAnalyzer}=await import(new URL('file://'+root+'/shared/unity-analysis/sdk.mjs'));
const fixture=JSON.parse(await readFile(new URL('./fixtures/minimum.json',import.meta.url),'utf8'));
export async function checkMinimum(pool){
 const analyzer=createUnityAnalyzer({pool});
 try{
  const report=await analyzer.compare(fixture.before,fixture.after,{inputRevision:7});
  assert.equal(report.status,'succeeded');assert.equal(report.inputRevision,7);
  const snapshot=report.before;
  for(const [state,n] of Object.entries({null:1,resolved:2,'missing-local':1,'external-unprovided':1}))assert.equal(snapshot.references.filter(r=>r.state===state).length,n,state);
  assert.ok(snapshot.shared.some(x=>x.fileId==='9223372036854775807'&&x.incoming===2));
  assert.ok(snapshot.findings.some(x=>x.code==='PARAMETER_TYPE_CONSTRAINT'&&x.name==='Speed'));
  assert.ok(report.diff.changes.some(x=>x.property==='m_Name'&&x.before==='Idle'&&x.after==='Idle revised'));
  assert.equal(report.completeness.truncated,false);
  return report;
 }finally{analyzer.dispose();}
}

export async function checkReservedProperties(pool){
 const analyzer=createUnityAnalyzer({pool});const a=structuredClone(fixture.before),b=structuredClone(fixture.before);
 a.files[0].objects[0].properties.$references='original';b.files[0].objects[0].properties.$references='changed';b.files[0].objects[0].classId='92';
 try{const report=await analyzer.compare(a,b);assert.ok(report.diff.changes.some(c=>c.domain==='property'&&c.property==='$references'));assert.ok(report.diff.changes.some(c=>c.domain==='metadata'&&c.property==='classId'));return report;}finally{analyzer.dispose();}
}

export async function checkProvenance(pool){
 const analyzer=createUnityAnalyzer({pool});const input=structuredClone(fixture.before);
 try{const r=await analyzer.analyze(input);assert.match(r.inputs.before.sha256,/^[0-9a-f]{64}$/);assert.equal(r.before.coverage.source,'caller-supplied schema');input.files[0].objects[0].references[0].source={path:'forged',line:1};assert.throws(()=>analyzer.analyze(input),/source|position/i);}finally{analyzer.dispose();}
}
