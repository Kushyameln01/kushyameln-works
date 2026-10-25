// External execution only. No behavior/generation tests have been run in Codex for this revision.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EXPRESSION_BOOL_RULES,findBinaryParameterSuffixRule,applyExpressionBoolRules,applyExpressionSyncRules} from '../../docs/shared/animator-integrator/default-value-rules.mjs';
import {integratePackages} from '../../docs/shared/animator-integrator/integrate.mjs';
import {parseExpression,serializeExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {integratorFixture,GUIDS,asset,parameter} from './fixture.mjs';
const kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const enc=new TextEncoder(),dec=new TextDecoder();
const row=(name,extra={})=>({name,type:'Float',defaultValue:0,saved:true,networkSynced:false,...extra});
const run=f=>integratePackages(f.packages,f.request,kernel);
function expressions(f,rows){f.packages[0].assets.find(a=>a.guid===GUIDS.expr).asset=enc.encode(serializeExpression(rows));}
function addExpression(f,rows){const guid='ab'.repeat(16);f.packages[0].assets.push(asset(guid,'Assets/OtherExpressions.asset',serializeExpression(rows),'11400000'));f.request.expressionIds.push(`${guid}:11400000`);}
test('Bool and synchronization share strict Binary suffix matching; other fields and inputs remain intact',()=>{
 const targets=['v2/EyeLidLeft8','v2.EyeLidRightNegative','Value123','Value0','0','Negative','v2'],others=['v2/EyeLidLeft','Valuenegative','ValueNEGATIVE','Value8Tail','ValueNegativeTail','Value８','Value١','ValueNegative '];
 const rows=[...targets,...others].map((name,i)=>Object.freeze(row(name,{type:i%2?'Int':'Float',defaultValue:targets.includes(name)?i%2:0.375,saved:i%3===0,networkSynced:i%4===0,marker:'preserve'}))),before=structuredClone(rows),r=applyExpressionBoolRules(rows,{sourceId:'expr'}),sync=applyExpressionSyncRules(rows);
 assert.deepEqual(rows,before);assert.deepEqual(r.issues,[]);assert.equal(r.changes.length,targets.length);
 for(const [i,p]of rows.entries()){assert.equal(Boolean(findBinaryParameterSuffixRule(p.name)),targets.includes(p.name));assert.deepEqual(r.rows[i],{...p,type:targets.includes(p.name)?'Bool':p.type});assert.deepEqual(sync.rows[i],{...p,networkSynced:targets.includes(p.name)?true:p.networkSynced});}
 assert(r.changes.every(c=>c.domain==='expression'&&c.sourceId==='expr'&&c.after.type==='Bool'&&EXPRESSION_BOOL_RULES.some(rule=>rule.id===c.ruleId)));
});
test('unrepresentable Binary defaults are never rounded or reset and have an explicit issue',async()=>{
 for(const value of [0.25,0.75,-1,19]){const p=row('UnknownNegative',{type:value===19?'Int':'Float',defaultValue:value}),r=applyExpressionBoolRules([p],{sourceId:'expr'});assert.equal(r.rows[0].type,'Bool');assert.equal(r.rows[0].defaultValue,value);assert(r.issues.some(i=>i.code==='binary_bool_default'&&i.name===p.name&&i.defaultValue===value&&i.sourceId==='expr'));
  const f=integratorFixture();expressions(f,[p]);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='binary_bool_default'&&i.name===p.name&&i.defaultValue===value));}
});
test('Bool registration preserves0/1 and Saved while Animator retains its own types and numerical defaults',async()=>{
 const f=integratorFixture(),rows=[row('Counter8',{defaultValue:1}),row('v2/JawXNegative',{type:'Int',defaultValue:0,saved:false}),row('v2/EyeLidRightNegative',{defaultValue:1}),row('Ordinary',{defaultValue:0.625,networkSynced:true})];expressions(f,rows);
 const base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('Counter8',1,1)+parameter('v2/JawXNegative',3,0)+parameter('v2/EyeLidRightNegative',1,1)));
 const before=structuredClone(f.packages),r=await run(f),output=parseExpression(dec.decode(r.diagnosticAssets.find(a=>a.guid===GUIDS.expr).asset));assert.deepEqual(f.packages,before);
 for(const [i,p]of rows.entries()){const actual=output.find(x=>x.name===p.name);assert.equal(actual.type,i<3?'Bool':p.type);assert.equal(actual.defaultValue,p.defaultValue);assert.equal(actual.saved,p.saved);assert.equal(actual.networkSynced,i===2?false:true);}
 assert.deepEqual(r.report.animatorParameters.filter(p=>['Counter8','v2/JawXNegative','v2/EyeLidRightNegative'].includes(p.name)),[{name:'Counter8',type:'Float',defaultValue:1},{name:'v2/JawXNegative',type:'Int',defaultValue:0},{name:'v2/EyeLidRightNegative',type:'Float',defaultValue:1}]);
 assert.deepEqual(r.report.expressionBoolRules.rules,EXPRESSION_BOOL_RULES);assert.equal(r.report.expressionBoolRules.changes.length,3);assert(r.report.expressionBoolRules.changes.every(c=>c.sourceId===`${GUIDS.expr}:11400000`));
 const control=structuredClone(f);expressions(control,[]);const c=await run(control);assert.deepEqual(r.diagnosticAssets.find(a=>a.path.endsWith('.controller')).asset,c.diagnosticAssets.find(a=>a.path.endsWith('.controller')).asset);
});
test('same numeric defaults merge after Float/Int/Bool Binary normalization; Saved and0/1 differences still conflict',async()=>{
 for(const type of ['Int','Bool']){const f=integratorFixture();expressions(f,[row('Value8',{defaultValue:1})]);addExpression(f,[row('Value8',{type,defaultValue:1})]);const r=await run(f);assert.equal(r.report.parameters.filter(p=>p.name==='Value8').length,1);assert.equal(r.report.parameters.find(p=>p.name==='Value8').type,'Bool');}
 for(const change of [{saved:false},{defaultValue:1}]){const f=integratorFixture();expressions(f,[row('Value8')]);addExpression(f,[row('Value8',change)]);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_conflict'&&i.name==='Value8'));}
});
test('range setting changes synchronization only: Bool applies in both ON and OFF modes',async()=>{
 const f=integratorFixture();expressions(f,[row('v2/EyeLidRightNegative',{defaultValue:1,saved:false})]);const on=await run(f);f.request.vrcft5RangeSync=false;const off=await run(f);
 for(const r of [on,off]){const p=r.report.parameters.find(p=>p.name==='v2/EyeLidRightNegative');assert.equal(p.type,'Bool');assert.equal(p.defaultValue,1);assert.equal(p.saved,false);}assert.equal(on.report.parameters.find(p=>p.name==='v2/EyeLidRightNegative').networkSynced,false);assert.equal(off.report.parameters.find(p=>p.name==='v2/EyeLidRightNegative').networkSynced,true);
});
