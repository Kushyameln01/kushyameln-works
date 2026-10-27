// Runtime regression cases for range synchronization and Binary rule precedence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VRCFT5_RANGE_SOURCE,VRCFT5_PARAMETER_RANGES,VRCFT5_RANGE_SYNC_POLICY,lookupVrcft5ParameterRange,applyVrcft5RangeSync} from '../../docs/shared/animator-integrator/vrcft5-ranges.mjs';
import {integratePackages} from '../../docs/shared/animator-integrator/integrate.mjs';
import {VRCFT5_REGISTRATION_RANGE_POLICY} from '../../docs/shared/animator-integrator/expression-rules.mjs';
import {applyExpressionSyncRules} from '../../docs/shared/animator-integrator/default-value-rules.mjs';
import {parseExpression,serializeExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {integratorFixture,GUIDS,asset,parameter} from './fixture.mjs';
const kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url)));
const enc=new TextEncoder(),dec=new TextDecoder();
const row=(name,extra={})=>({name,type:'Float',defaultValue:0,saved:true,networkSynced:false,...extra});
const run=f=>integratePackages(f.packages,f.request,kernel);
function expressions(f,rows){f.packages[0].assets.find(a=>a.guid===GUIDS.expr).asset=enc.encode(serializeExpression(rows));}
function addExpression(f,rows){const guid='ab'.repeat(16);f.packages[0].assets.push(asset(guid,'Assets/OtherExpressions.asset',serializeExpression(rows),'11400000'));f.request.expressionIds.push(`${guid}:11400000`);}
test('dataset contains all124 documented parameters and footnotes are not name suffixes',()=>{
 assert.equal(VRCFT5_PARAMETER_RANGES.length,124);assert.equal(new Set(VRCFT5_PARAMETER_RANGES.map(r=>r.name)).size,124);
 assert.equal(VRCFT5_PARAMETER_RANGES.filter(r=>r.min===0&&r.max===1).length,97);assert.equal(VRCFT5_PARAMETER_RANGES.filter(r=>r.min===-1&&r.max===1).length,27);
 for(const name of ['v2/JawClench','v2/JawMandibleRaise']){assert(VRCFT5_PARAMETER_RANGES.some(r=>r.name===name));assert(!VRCFT5_PARAMETER_RANGES.some(r=>r.name===name+'1'));}
 assert.equal(VRCFT5_RANGE_SOURCE.recordCount,124);assert.equal(VRCFT5_RANGE_SOURCE.version,'Current (v5.0)');assert.match(VRCFT5_RANGE_SOURCE.sourceSha256,/^[a-f0-9]{64}$/);
});
test('only documented v2 names, official slash namespaces and explicit dot aliases resolve',()=>{
 for(const [base,mode]of [['v2/EyeLidRight','canonical'],['Example/Nest/v2/EyeLidRight','slash-namespace'],['v2.EyeLidRight','dot-alias'],['Example/Nest/v2.EyeLidRight','slash-namespace-dot-alias']]){const found=lookupVrcft5ParameterRange(base);assert.equal(found.canonicalName,'v2/EyeLidRight');assert.equal(found.matchMode,mode);assert.deepEqual([found.range.min,found.range.max],[0,1]);}
 for(const base of ['EyeLidRight','Example.EyeLidRight','Notv2/EyeLidRight','Example.v2/EyeLidRight','v2/eyelidright','v2/Unknown','v2/JawClench1','v2/JawMandibleRaise1','v2/EyeLidRight8','v2/EyeLidRightNegative'])assert.equal(lookupVrcft5ParameterRange(base),null,base);
});
test('pure range policy overrides only synchronization and records matches/unknowns/actual changes',()=>{
 const rows=Object.freeze([row('v2/EyeLidRightNegative',{networkSynced:true}),row('v2/EyeLeftXNegative',{type:'Int',defaultValue:1,saved:false}),row('Example/Nest/v2/JawClenchNegative',{networkSynced:true}),row('v2.JawMandibleRaiseNegative',{networkSynced:true}),row('v2/UnknownNegative',{networkSynced:false}),row('EyeLidRightNegative',{networkSynced:true}),row('v2/EyeLidRight8',{networkSynced:true}),row('v2/EyeLidRightnegative',{networkSynced:true}),row('v2/EyeLidRightNegativeTail',{networkSynced:false})].map(Object.freeze)),before=structuredClone(rows);
 const r=applyVrcft5RangeSync(rows,{sourceId:'expr'});assert.deepEqual(rows,before);const expected=[false,true,false,false,false,true,true,true,false];for(const [i,source]of rows.entries())assert.deepEqual(r.rows[i],{...source,networkSynced:expected[i]});
 assert.equal(r.matches.length,4);assert.equal(r.unmatched.length,2);assert.equal(r.changes.length,4);assert(r.changes.every(c=>c.sourceId==='expr'&&c.ruleId===VRCFT5_RANGE_SYNC_POLICY.id));
 const off=applyVrcft5RangeSync(rows,{enabled:false});assert.deepEqual(off.rows,rows);assert.deepEqual([off.matches,off.unmatched,off.changes],[[],[],[]]);
});
test('BinaryParameters remains independent and new rule runs afterwards',()=>{
 const original=[row('v2/EyeLidRightNegative'),row('v2/EyeLeftXNegative'),row('v2/UndocumentedNegative'),row('v2/EyeLidRight8'),row('v2/EyeLidRight0',{networkSynced:true}),row('v2/EyeLeftX0',{networkSynced:true})],binary=applyExpressionSyncRules(original);
 assert.deepEqual(binary.rows.map(p=>p.networkSynced),[true,true,true,true,false,false]);const r=applyVrcft5RangeSync(binary.rows);assert.deepEqual(r.rows.map(p=>p.networkSynced),[false,true,true,true,false,false]);assert.equal(r.changes.length,1);
});
test('API omitted/true enables VRCFT5 registration; false and malformed values fail explicitly',async()=>{
 const f=integratorFixture(),rows=[row('v2.EyeLidRightNegative',{type:'Int',defaultValue:1}),row('v2/EyeLeftXNegative',{saved:false}),row('UnknownNegative'),row('v2/EyeLidRight8')];expressions(f,rows);
 const base=f.packages[0].assets.find(a=>a.guid===GUIDS.base);base.asset=enc.encode(dec.decode(base.asset).replace('  m_AnimatorParameters:\n','  m_AnimatorParameters:\n'+parameter('v2.EyeLidRightNegative',1,0.125)));
 const before=structuredClone(f.packages),omitted=await run(f);f.request.vrcft5RangeSync=true;const on=await run(f);assert.deepEqual(f.packages,before);
 const output=r=>parseExpression(dec.decode(r.diagnosticAssets.find(a=>a.guid===GUIDS.expr).asset)).filter(p=>p.name!=='AlwaysOne');
 assert.deepEqual(output(on),output(omitted));assert.deepEqual(output(on),[{...rows[1],type:'Bool',networkSynced:true},rows[2],{...rows[3],type:'Bool',defaultValue:1,networkSynced:true}]);
 assert.equal(on.report.vrcft5RangeSync.enabled,true);assert.equal(omitted.report.vrcft5RangeSync.enabled,true);assert.equal(on.report.vrcft5RangeSync.matches.length,2);assert.equal(on.report.vrcft5RangeSync.unmatched.length,1);assert.equal(on.report.vrcft5RangeSync.changes.length,1);
 assert.deepEqual(on.report.vrcft5RangeSync.source,VRCFT5_RANGE_SOURCE);assert.deepEqual(on.report.vrcft5RangeSync.policy,VRCFT5_REGISTRATION_RANGE_POLICY);assert.equal(on.report.expressionSyncRules.changes.length,2);
 assert.equal(on.report.animatorParameters.find(p=>p.name==='v2.EyeLidRightNegative').defaultValue,0.125);
 for(const invalid of [false,null,'true',1,{}]){f.request.vrcft5RangeSync=invalid;await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='vrcft5_range_sync_option'));}
});
test('range exclusions happen before conflicts while retained settings still conflict',async()=>{
 for(const difference of [{networkSynced:true},{saved:false},{defaultValue:1}]){const f=integratorFixture();expressions(f,[row('v2/EyeLidRightNegative')]);addExpression(f,[row('v2/EyeLidRightNegative',difference)]);const r=await run(f);assert(!r.report.parameters.some(p=>p.name==='v2/EyeLidRightNegative'));}
 for(const difference of [{saved:false},{defaultValue:1}]){const g=integratorFixture();expressions(g,[row('v2/JawXNegative')]);addExpression(g,[row('v2/JawXNegative',difference)]);await assert.rejects(run(g),e=>e.issues.some(i=>i.code==='expression_conflict'&&i.name==='v2/JawXNegative'));}
});
test('post-policy mixed Float/Bool budget allows256 and rejects257 after omitted nonnegative sign bits',async()=>{
 const f=integratorFixture(),rows=[...Array.from({length:31},(_,i)=>row(`Network${i}Value`,{defaultValue:0.25,networkSynced:true})),...Array.from({length:7},(_,i)=>row(`Unknown${i+1}`)),row('v2/EyeLeftXNegative'),row('v2/EyeLidRightNegative')];expressions(f,rows);const on=await run(f);assert.equal(on.report.bitCost,256);
 expressions(f,[...rows,row('Unknown8')]);await assert.rejects(run(f),e=>e.issues.some(i=>i.code==='expression_invalid'&&i.message.includes('257')));
});
