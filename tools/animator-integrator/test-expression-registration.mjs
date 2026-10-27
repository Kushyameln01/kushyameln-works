import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
function output(r){return parseExpression(dec.decode(r.diagnosticAssets.find(a=>a.guid===GUIDS.expr).asset)).filter(p=>p.name!=='AlwaysOne');}

test('AAP registration exclusions keep only Smooth function controls and preserve exact prefix boundaries',async()=>{
 const f=integratorFixture(),excluded=['Decode/Eye','Function/Eye','Proxy/Eye/Output','Smooth/Eye','Smooth/Eye_FunctionTail','Proxy/Smooth/Parts'],kept=[row('Smooth/Eye_Function',{defaultValue:0.375,networkSynced:true}),row('Smooth/Sub/Eye_Function',{type:'Int',defaultValue:7,saved:false,networkSynced:true}),row('Other/Decode/Eye'),row('DecodeTail/Eye'),row('smooth/Eye'),row('v2/EyeLidLeft',{defaultValue:0.75})];
 expressions(f,[...excluded.map(name=>row(name)),...kept]);
 const base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+excluded.map(name=>parameter(name,1,0.25)).join('')));
 const before=structuredClone(f.packages),r=await run(f);assert.deepEqual(f.packages,before);
 assert.deepEqual(output(r),kept.map(p=>p.name.startsWith('Smooth/')?{...p,networkSynced:false}:p));
 assert.deepEqual(r.report.expressionRegistrationRules.exclusions.map(x=>x.name),excluded);
 for(const name of excluded)assert.equal(r.report.animatorParameters.find(p=>p.name===name).defaultValue,0.25);
 assert(r.report.expressionSources.filter(p=>excluded.includes(p.name)).every(p=>p.normalized===null&&p.action==='exclude'));
 for(const p of r.report.expressionSources.filter(p=>!excluded.includes(p.name)))assert.equal(p.name,p.normalized.name,'source mapping must survive removal');
});
test('zero suffix and nonnegative Negative are excluded before Bool validation, merge conflicts and final budget',async()=>{
 const f=integratorFixture(),removed=[row('v2/EyeLidLeft0',{defaultValue:0.375}),row('Counter0',{type:'Int',defaultValue:19}),row('v2/EyeLidLeftNegative',{defaultValue:0.75,networkSynced:true}),row('Nested/v2.JawOpenNegative',{defaultValue:0.125})],normal=row('Ordinary',{defaultValue:0.25});expressions(f,[...removed,normal]);
 addExpression(f,removed.map(p=>({...p,defaultValue:0,saved:!p.saved})));
 const r=await run(f);assert.deepEqual(output(r),[normal]);assert.equal(r.report.expressionRegistrationRules.exclusions.length,8);assert.equal(r.report.bitCost,0);assert.equal(r.report.expressionBoolRules.changes.length,0);
});
test('unknown Negative keeps the entire input definition while signed ranges keep Binary Bool and sync rules',async()=>{
 const f=integratorFixture(),unknowns=[row('v2/UnknownNegative',{defaultValue:0.375}),row('UnknownNegative',{type:'Int',defaultValue:7,networkSynced:true}),row('EyeLidLeftNegative',{defaultValue:0.25,saved:false})],signed=[row('v2/CheekPuffSuckNegative'),row('Nested/v2.JawXNegative',{type:'Int',defaultValue:1})];expressions(f,[...unknowns,...signed]);
 const r=await run(f);assert.deepEqual(output(r),[...unknowns,...signed.map(p=>({...p,type:'Bool',networkSynced:true}))]);assert.equal(r.report.vrcft5RangeSync.unmatched.length,3);
 const g=integratorFixture();expressions(g,[unknowns[0]]);addExpression(g,[{...unknowns[0],networkSynced:true}]);await assert.rejects(run(g),e=>e.issues.some(i=>i.code==='expression_conflict'));
});
test('EyeLid binary defaults use4+8 and clear1+2 before Bool validation, without changing Animator defaults',async()=>{
 const f=integratorFixture(),names=['v2/EyeLidLeft','v2/EyeLidRight','Namespace/v2/EyeLidLeft','Namespace/v2.EyeLidRight'],rows=names.flatMap(base=>['1','2','4','8'].map((suffix,i)=>row(base+suffix,{defaultValue:i<2?1:0.375})));expressions(f,rows);
 const base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('v2/EyeLidLeft4',1,0.125)));
 const r=await run(f);assert.deepEqual(output(r),rows.map(p=>({...p,type:'Bool',defaultValue:/[48]$/.test(p.name)?1:0,networkSynced:true})));assert.equal(r.report.animatorParameters.find(p=>p.name==='v2/EyeLidLeft4').defaultValue,0.125);
 assert.equal(r.report.expressionRegistrationRules.changes.filter(c=>c.ruleId==='eyelid-binary-default').length,16);
 for(const name of names){const sum=output(r).filter(p=>p.name.startsWith(name)&&['1','2','4','8'].some(s=>p.name===name+s)).reduce((n,p)=>n+Number(p.name.at(-1))*p.defaultValue/16,0);assert.equal(sum,0.75);}
 const g=integratorFixture();expressions(g,[row('v2/EyeLidLeft4')]);const only=output(await run(g));assert.equal(only.length,1,'missing Binary entries are not invented');
});
test('existing suffix rules still cover MouthClosed1 and final budget is checked after exclusions',async()=>{
 const f=integratorFixture(),rows=[...Array.from({length:31},(_,i)=>row(`Network${i}Value`,{defaultValue:0.25,networkSynced:true})),...Array.from({length:7},(_,i)=>row(`Binary${i+1}`)),row('v2/MouthClosed1'),row('v2/EyeLidLeftNegative')];expressions(f,rows);const r=await run(f);assert.equal(r.report.bitCost,256);assert.equal(r.report.parameters.find(p=>p.name==='v2/MouthClosed1').networkSynced,true);
 expressions(f,[...rows,row('Extra8')]);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_invalid'&&i.message.includes('257')));
});
test('missing Smooth function controls are registered from selected Animator declarations with local unsaved flags',async()=>{
 const f=integratorFixture(),base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('Smooth/Eye_Function',1,0.375)+parameter('Smooth/Toggle_Function',4,1)+parameter('Smooth/Count_Function',3,7)+parameter('Smooth/Excluded',1,0.5)+parameter('AnimatorOnly',1,0.5)));
 const r=await run(f);for(const [name,type,defaultValue]of [['Smooth/Eye_Function','Float',0.375],['Smooth/Toggle_Function','Bool',1],['Smooth/Count_Function','Int',7]])assert.deepEqual(r.report.parameters.find(p=>p.name===name),{name,type,defaultValue,saved:false,networkSynced:false});
 for(const name of ['Smooth/Excluded','AnimatorOnly'])assert(!r.report.parameters.some(p=>p.name===name));
 assert.equal(r.report.expressionRegistrationRules.changes.filter(c=>c.action==='add').length,3);
 assert(r.report.expressionRegistrationRules.changes.filter(c=>c.action==='add').every(c=>c.sourceId===`${GUIDS.base}:9100000`));
});
test('existing Smooth Expression settings stay independent and Trigger Smooth declarations fail explicitly',async()=>{
 const f=integratorFixture(),base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('Smooth/Eye_Function',1,0.375)));const p=row('Smooth/Eye_Function',{type:'Int',defaultValue:7,saved:true,networkSynced:true});expressions(f,[p]);assert.deepEqual(output(await run(f)),[{...p,networkSynced:false}]);
 const g=integratorFixture(),b=g.packages[0].assets.find(a=>a.guid===GUIDS.base);b.asset=enc.encode(dec.decode(b.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('Smooth/Fire_Function',9,0)));await assert.rejects(run(g),e=>e.issues.some(i=>i.code==='smooth_expression_type'&&i.name==='Smooth/Fire_Function'));
});
