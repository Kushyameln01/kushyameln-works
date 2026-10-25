import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as rules from '../../docs/shared/animator-integrator/default-value-rules.mjs';
import {integratePackages} from '../../docs/shared/animator-integrator/integrate.mjs';
import {parseExpression,serializeExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {integratorFixture,GUIDS,asset,parameter} from './fixture.mjs';
const kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const enc=new TextEncoder(),dec=new TextDecoder();
const row=(name,extra={})=>({name,type:'Float',defaultValue:0.25,saved:true,networkSynced:false,...extra});
// BinaryParameters-only regression cases explicitly disable the independent range rule.
const run=f=>integratePackages(f.packages,{...f.request,vrcft5RangeSync:false},kernel);
function expressions(f,rows){f.packages[0].assets.find(a=>a.guid===GUIDS.expr).asset=enc.encode(serializeExpression(rows));}
function addExpression(f,rows){const guid='ab'.repeat(16);f.packages[0].assets.push(asset(guid,'Assets/OtherExpressions.asset',serializeExpression(rows),'11400000'));f.request.expressionIds.push(`${guid}:11400000`);}
test('pure Expression sync rule matches strict ASCII digit or Negative suffix and preserves every other field',()=>{
 assert.equal(typeof rules.applyExpressionSyncRules,'function','independent Expression sync normalization must exist');
 const targets=['v2/EyeLidLeft8','v2.EyeLidRightNegative','Value123','Value0','0','Negative','v2'];
 const nonTargets=['v2/EyeLidLeft','v2.EyeLidRightnegative','v2.EyeLidRightNEGATIVE','Value8Tail','Value0/Part','ValueNegativeTail','ValueNegative ','Value８','Value١','Value8\n'];
 const rows=[...targets,...nonTargets].map((name,i)=>Object.freeze(row(name,{type:i%2?'Int':'Float',defaultValue:i%2?17:0.375,saved:i%3===0,networkSynced:i%4===0,customMarker:'preserved'}))),before=structuredClone(rows);
 const result=rules.applyExpressionSyncRules(rows,{sourceId:'source-expression'});
 assert.deepEqual(rows,before,'pure normalization must not modify inputs');
 for(const [i,source]of rows.entries())assert.deepEqual(result.rows[i],{...source,networkSynced:targets.includes(source.name)?true:source.networkSynced});
 assert.equal(result.changes.length,targets.filter(name=>!rows.find(r=>r.name===name).networkSynced).length);
 for(const c of result.changes){assert.equal(c.domain,'expression');assert.equal(c.sourceId,'source-expression');assert.deepEqual(c.before,{networkSynced:false});assert.deepEqual(c.after,{networkSynced:true});assert(rules.EXPRESSION_SYNC_RULES.some(rule=>rule.id===c.rule.id));}
});
test('integration forces only matching Expression synchronization, keeps Animator defaults and separate provenance',async()=>{
 const f=integratorFixture(),rows=[row('v2/EyeLidLeft8',{saved:false}),row('v2.EyeLidRightNegative',{type:'Int',defaultValue:19}),row('LocalOnly',{defaultValue:0.625}),row('AlreadySynced0',{networkSynced:true})];expressions(f,rows);
 const base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('v2/EyeLidLeft8',1,0.125)));
 const before=structuredClone(f.packages),r=await run(f);assert.deepEqual(f.packages,before);
 const serialized=parseExpression(dec.decode(r.diagnosticAssets.find(a=>a.path.endsWith('ExpressionParameters.asset')).asset));
 assert.deepEqual(serialized.filter(p=>p.name!=='AlwaysOne'),rows.map(p=>({...p,networkSynced:p.name==='LocalOnly'?false:true})));
 assert.equal(r.report.animatorParameters.find(p=>p.name==='v2/EyeLidLeft8').defaultValue,0.125);
 assert.deepEqual(r.report.expressionSyncRules.rules,rules.EXPRESSION_SYNC_RULES);assert.deepEqual(r.report.expressionSyncRules.changes.map(c=>c.name),['v2/EyeLidLeft8','v2.EyeLidRightNegative']);
 assert(r.report.expressionSyncRules.changes.every(c=>c.sourceId===`${GUIDS.expr}:11400000`));assert(!r.report.defaultValueRules.changes.some(c=>c.name==='v2/EyeLidLeft8'));
 const control=structuredClone(f);control.request.expressionIds=[];const c=await run(control);assert.deepEqual(r.diagnosticAssets.find(a=>a.path.endsWith('.controller')).asset,c.diagnosticAssets.find(a=>a.path.endsWith('.controller')).asset,'Expression sync rules must not alter Animator bytes');
});
test('matching false/true sync differences normalize before merge conflict comparison',async()=>{
 const f=integratorFixture(),r=row('Value8');expressions(f,[r]);addExpression(f,[{...r,networkSynced:true}]);
 const result=await run(f);assert.equal(result.report.parameters.filter(p=>p.name==='Value8').length,1);assert.equal(result.report.parameters.find(p=>p.name==='Value8').networkSynced,true);
});
test('normalization preserves Saved/default/type conflicts and unmatched synchronization conflicts',async()=>{
 for(const difference of [{saved:false},{defaultValue:0.5},{type:'Int',defaultValue:0}]){const f=integratorFixture();expressions(f,[row('Value8')]);addExpression(f,[row('Value8',difference)]);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_conflict'&&i.name==='Value8'));}
 const f=integratorFixture();expressions(f,[row('Value8Tail')]);addExpression(f,[row('Value8Tail',{networkSynced:true})]);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_conflict'&&i.name==='Value8Tail'));
});
test('forced synchronization keeps 256-bit boundary and rejects a formerly local set exceeding it',async()=>{
 const f=integratorFixture(),rows=Array.from({length:32},(_,i)=>row(`Local${i}`));expressions(f,rows);const r=await run(f);assert.equal(r.report.bitCost,256);assert(r.report.parameters.filter(p=>p.name!=='AlwaysOne').every(p=>p.networkSynced));
 rows.push(row('Local32'));expressions(f,rows);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_invalid'&&i.message.includes('264')&&i.message.includes('256')));
});
