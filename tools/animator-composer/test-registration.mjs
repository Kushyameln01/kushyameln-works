import assert from 'node:assert/strict';
import {parseExpression, resolveRegistration, serializeExpression, serializeInstaller} from '../../docs/animator-composer/lib/registration.mjs';
import {splitUnityDocuments, extractReferences} from '../../docs/shared/ft/unity-text.mjs';

const cases = [];
const test = (name, fn) => cases.push({name, fn});
const parameter = (name, type = 'Float', defaultValue = 0) => ({name, type, defaultValue, usage: []});
const external = (name, type = 'Float', defaultValue = 0, networkSynced = true, saved = false) => ({name, type, defaultValue, saved, networkSynced});
const block = (id, parameters, expressionId = null, outputId = 'fx') => ({id, label: id, outputId, parameters, expressionId});
const plan = (patch = {}) => ({schemaVersion: 1, parameterEdits: {}, conflictChoices: {}, animatorChoices: {}, ...patch});
const errors = result => result.issues.filter(x => x.severity === 'error');
const codes = result => errors(result).map(x => x.code);
const resolve = (blocks, expressions = new Map(), settings = plan()) => resolveRegistration(blocks, expressions, settings);
const fixed = rows => new Map([['expression', rows]]);
const fixture = (rows, suffix = '') => `%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!114 &11400000\nMonoBehaviour:\n  m_Script: {fileID: -1506855854, guid: 67cc4cb7839cd3741b63733d5adf0442, type: 3}\n  m_Name: Parameters\n  parameters:${rows.length ? '\n' + rows.map(r => `  - name: ${JSON.stringify(r.name)}\n    valueType: ${{Int:0,Float:1,Bool:2}[r.type]}\n    saved: ${+r.saved}\n    defaultValue: ${r.defaultValue}\n    networkSynced: ${+r.networkSynced}\n`).join('') : ' []\n'}${suffix}`;
const controllers = [{outputId:'fx', guid:'1234567890abcdef1234567890abcdef', fileId:'9100000', path:'Assets/Test/FX.controller', playable:'FX'}];
const options = {pathMode:'Absolute', mergeMode:'Append', matchWriteDefaults:false};

test('parse actual Unity schema and retain original registration order', () => {
  const input = [external('z last alphabetically', 'Bool', 1, false, true), external('v2/EyeLidLeft', 'Float', .75), external('int', 'Int', 255)];
  assert.deepEqual(parseExpression(fixture(input)), input);
  assert.deepEqual(parseExpression(fixture([])), []);
  assert.deepEqual(parseExpression(fixture(input).replace(/^%.*\n/gm, '')), input);
  assert.deepEqual(parseExpression(fixture(input).replaceAll('\n', '\r\n')), input);
});

test('parser rejects malformed fixed rows rather than normalizing them', () => {
  const source = fixture([external('A')]);
  for (const mutated of [source.replace('valueType: 1', 'valueType: 9'), source.replace('saved: 0', 'saved: 2'),
    source.replace('networkSynced: 1\n', ''), source.replace('defaultValue: 0', 'defaultValue: NaN'),
    source.replace('defaultValue: 0', 'defaultValue: 1.1'), source.replace('name: "A"', 'name: ""'),
    source.replace('saved: 0', 'saved: 0\n    saved: 1'), source.replace('saved: 0', 'saved: 0\n    unsupported: 1'),
    source.replace('67cc4cb7839cd3741b63733d5adf0442', '00000000000000000000000000000000')]) assert.throws(() => parseExpression(mutated));
  assert.throws(() => parseExpression(fixture([external('A'), external('A')])));
  assert.throws(() => parseExpression(fixture([external('BadBool','Bool',.5)])));
  assert.throws(() => parseExpression(fixture([external('BadInt','Int',1.5)])));
  assert.throws(() => parseExpression(fixture([external('BadInt','Int',-1)])));
});

test('whole asset parsing identifies exactly one SDK Expression document', () => {
  const unrelated = '--- !u!114 &9\nMonoBehaviour:\n  m_Name: Other\n  parameters: []\n';
  assert.deepEqual(parseExpression(fixture([external('A')], unrelated)), [external('A')]);
  assert.throws(() => parseExpression(fixture([]) + fixture([]).replace(/^%.*\n/gm,'').replace('&11400000', '&12')));
});

test('comments between fixed rows never truncate later registrations', () => {
  const rows=[external('First'),external('Second','Bool',1,false)];
  const source=fixture(rows).replace('  - name: "Second"','  # Keep the second row\n\n  - name: "Second"');
  assert.deepEqual(parseExpression(source),rows);
  assert.throws(()=>parseExpression(fixture([]).replace('parameters: []','parameters:')));
});

test('registration remains undecided without an explicit On/Off choice', () => {
  const blocks = [block('base',[parameter('AAP'),parameter('Face')])];
  const pending = resolve(blocks);
  assert.equal(pending.rows[0].registered, null);
  assert.equal(errors(pending).filter(x=>x.code==='registration_undecided').length, 2);
  const done = resolve(blocks, new Map(), plan({parameterEdits:{AAP:{registered:false},Face:{registered:true,type:'Float',defaultValue:.4,saved:false,networkSynced:true}}}));
  assert.deepEqual(errors(done), []);
  assert.deepEqual(done.registrations.map(x=>x.name), ['Face']);
  assert.equal(done.animators.fx.find(x=>x.name==='AAP').type,'Float');
  assert.equal(done.bitCost, 8);
});

test('Menu-only candidates require explicit registration and external type, without fabricating Animator declarations', () => {
  const menu=[{name:'MenuOnly',nodeId:'menu:11400000',path:'Assets/Menu.asset'}];
  const pending=resolveRegistration([],new Map(),plan(),menu);
  assert.equal(pending.rows[0].registered,null);
  assert.equal(pending.rows[0].type,null);
  assert.deepEqual(pending.animators,{});
  assert.ok(codes(pending).includes('registration_undecided'));
  const noType=resolveRegistration([],new Map(),plan({parameterEdits:{MenuOnly:{registered:true}}}),menu);
  assert.ok(codes(noType).includes('invalid_external_parameter'));
  assert.deepEqual(noType.registrations,[]);
  const before=JSON.stringify(menu);
  const done=resolveRegistration([],new Map(),plan({parameterEdits:{MenuOnly:{registered:true,type:'Bool',defaultValue:1,saved:true,networkSynced:true}}}),menu);
  assert.deepEqual(errors(done),[]);
  assert.deepEqual(done.animators,{});
  assert.equal(done.bitCost,1);
  assert.deepEqual(parseExpression(serializeExpression(done.registrations)),[external('MenuOnly','Bool',1,true,true)]);
  assert.equal(JSON.stringify(menu),before);
});

test('global fixed nonlisting also excludes Menu-only candidates and cannot be edited open', () => {
  const menu=[{name:'Missing',nodeId:'menu:11400000',path:'Assets/Menu.asset'}];
  const result=resolveRegistration([],fixed([]),plan({globalExpressionId:'expression'}),menu);
  assert.deepEqual(errors(result),[]);
  assert.equal(result.rows[0].fixed,true);
  assert.equal(result.rows[0].registered,false);
  assert.deepEqual(result.animators,{});
  const changed=resolveRegistration([],fixed([]),plan({globalExpressionId:'expression',parameterEdits:{Missing:{registered:true,type:'Bool'}}}),menu);
  assert.ok(codes(changed).includes('fixed_parameter_edit'));
  assert.equal(changed.registrations.length,0);
});

test('Menu references preserve existing fixed registrations and fixed block exclusions', () => {
  const menu=[{name:'Shared',nodeId:'menu:1',path:'Assets/Menu.asset'},{name:'Internal',nodeId:'menu:1',path:'Assets/Menu.asset'}];
  const result=resolveRegistration([block('base',[parameter('Shared'),parameter('Internal')],'expression')],fixed([external('Shared','Bool',1,false,true)]),plan(),menu);
  assert.deepEqual(errors(result),[]);
  assert.deepEqual(result.registrations.map(({applyAnimatorDefault,...r})=>r),[external('Shared','Bool',1,false,true)]);
  assert.equal(result.rows.find(r=>r.name==='Internal').fixed,true);
  assert.equal(result.rows.find(r=>r.name==='Internal').registered,false);
  assert.equal(result.animators.fx.length,2);
});

test('repeated Menu references are deduplicated, retain sources, and invalid candidate names are rejected', () => {
  const menu=[{name:'M',nodeId:'menu:1',path:'Assets/Menu.asset'},{name:'M',nodeId:'menu:2',path:'Assets/Sub.asset'},{name:'M',nodeId:'menu:1',path:'Assets/Menu.asset'}];
  const result=resolveRegistration([],new Map(),plan({parameterEdits:{M:{registered:true,type:'Float',defaultValue:.5}}}),menu);
  assert.deepEqual(errors(result),[]);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].sourceIds.length,2);
  assert.equal(result.registrations.length,1);
  assert.deepEqual(result.animators,{});
  assert.ok(codes(resolveRegistration([],new Map(),plan(),[{name:'',nodeId:'menu:1',path:'Assets/Menu.asset'}])).includes('invalid_external_candidate'));
});

test('global Expression is the sole registration authority and retains extra rows', () => {
  const rows = [external('Z','Bool',1,false,true), external('Eye','Float',.75)];
  const result = resolve([block('base',[parameter('Eye'),parameter('AAP')],'invalid-ignored')], fixed(rows), plan({globalExpressionId:'expression'}));
  assert.deepEqual(errors(result), []);
  assert.deepEqual(result.registrations.map(({applyAnimatorDefault,...x})=>x), rows);
  assert.equal(result.rows.find(x=>x.name==='AAP').registered,false);
  assert.equal(result.rows.find(x=>x.name==='AAP').fixed,true);
  assert.equal(result.animators.fx.find(x=>x.name==='Eye').defaultValue,0);
});

test('block fixed rows exclude nonlisted names and preserve attached-only rows', () => {
  const result=resolve([block('base',[parameter('In'),parameter('Internal')],'expression')],fixed([external('In'),external('MenuOnly','Int',7)]));
  assert.deepEqual(errors(result),[]);
  assert.deepEqual(result.registrations.map(x=>x.name),['In','MenuOnly']);
  assert.equal(result.rows.find(x=>x.name==='Internal').fixed,true);
  assert.equal(result.rows.find(x=>x.name==='Internal').registered,false);
});

test('an unconfigured block cannot overwrite a shared fixed registration', () => {
  const blocks=[block('base',[parameter('Shared')],'expression'),block('add',[parameter('Shared'),parameter('New')])];
  const result=resolve(blocks,fixed([external('Shared','Float',.25)]),plan({parameterEdits:{Shared:{registered:true,type:'Float',defaultValue:.5,saved:false,networkSynced:true},New:{registered:false}}}));
  assert.ok(codes(result).includes('fixed_parameter_edit'));
  assert.equal(result.rows.find(x=>x.name==='Shared').defaultValue,.25);
  assert.equal(result.rows.find(x=>x.name==='Shared').fixed,true);
});

test('block exclusion is scoped, with a diagnostic for shared external registration', () => {
  const result=resolve([block('base',[parameter('Shared')],'empty'),block('add',[parameter('Shared')],'full')],new Map([['empty',[]],['full',[external('Shared')]]]));
  assert.deepEqual(errors(result),[]);
  assert.equal(result.registrations[0].name,'Shared');
  assert.ok(result.issues.some(x=>x.code==='shared_excluded_parameter'&&x.severity==='warning'));
  const edited=resolve([block('base',[parameter('Shared')],'empty'),block('add',[parameter('Shared')])],new Map([['empty',[]]]),plan({parameterEdits:{Shared:{registered:true,networkSynced:false}}}));
  assert.deepEqual(errors(edited),[]);
  assert.equal(edited.registrations[0].networkSynced,false);
});

test('same-name fixed conflicts require a selected source, across Playables', () => {
  const blocks=[block('base',[parameter('A')],'one'),block('add',[parameter('A')],'two','additive')];
  const expressions=new Map([['one',[external('A','Float',0,false)]],['two',[external('A','Float',.75,true)]]]);
  const conflict=resolve(blocks,expressions);
  assert.ok(codes(conflict).includes('registration_conflict'));
  assert.equal(conflict.rows[0].options.length,2);
  const resolved=resolve(blocks,expressions,plan({conflictChoices:{A:'add'}}));
  assert.deepEqual(errors(resolved),[]);
  assert.equal(resolved.registrations[0].defaultValue,.75);
  assert.equal(resolved.registrations[0].networkSynced,true);
  assert.ok(codes(resolve(blocks,expressions,plan({conflictChoices:{A:'not-a-source'}}))).includes('registration_conflict'));
});

test('identical fixed definitions are shared without a conflict', () => {
  const result=resolve([block('base',[parameter('A')],'one'),block('add',[parameter('A')],'two')],new Map([['one',[external('A')]],['two',[external('A')]]]));
  assert.deepEqual(errors(result),[]);
  assert.equal(result.registrations.length,1);
  assert.equal(result.rows[0].conflict,false);
});

test('Animator conflicts are independent of fixed external registration', () => {
  const blocks=[block('base',[parameter('A','Float',0)],'expression'),block('add',[parameter('A','Bool',1)],'expression')];
  const expr=fixed([external('A','Bool',1)]);
  const unresolved=resolve(blocks,expr);
  assert.ok(codes(unresolved).includes('animator_conflict'));
  assert.equal(unresolved.animatorConflicts[0].options.length,2);
  const done=resolve(blocks,expr,plan({animatorChoices:{fx:{A:{type:'Float',defaultValue:.2}}}}));
  assert.deepEqual(errors(done),[]);
  assert.deepEqual(done.animators.fx,[{name:'A',type:'Float',defaultValue:.2}]);
  assert.equal(done.registrations[0].defaultValue,1);
});

test('explicit default reflection is independent of the external fixed fields', () => {
  const blocks=[block('base',[parameter('v2/EyeLidLeft'),parameter('v2/EyeLidRight')],'expression')];
  const expr=fixed([external('v2/EyeLidLeft','Float',.75),external('v2/EyeLidRight','Float',.75)]);
  const original=resolve(blocks,expr);
  assert.equal(original.animators.fx[0].defaultValue,0);
  const reflected=resolve(blocks,expr,plan({parameterEdits:{'v2/EyeLidLeft':{applyAnimatorDefault:true}}}));
  assert.deepEqual(errors(reflected),[]);
  assert.deepEqual(reflected.animators.fx.map(x=>x.defaultValue),[.75,0]);
  assert.equal(reflected.registrations[0].applyAnimatorDefault,true);
  const generic=resolve([block('base',[parameter('v2/EyeLidLeft','Float',.2)],'expression')],fixed([external('v2/EyeLidLeft','Float',.2)]));
  assert.equal(generic.registrations[0].defaultValue,.2);
});

test('default reflection covers every consuming output, preserving internal defaults otherwise', () => {
  const blocks=[block('base',[parameter('Shared','Float',.1)],'expression'),block('add',[parameter('Shared','Float',.8)],'expression','additive')];
  const expr=fixed([external('Shared','Float',.75)]);
  const first=resolve(blocks,expr);
  assert.deepEqual(errors(first),[]);
  assert.equal(first.animators.fx[0].defaultValue,.1);
  assert.equal(first.animators.additive[0].defaultValue,.8);
  const next=resolve(blocks,expr,plan({parameterEdits:{Shared:{applyAnimatorDefault:true}}}));
  assert.deepEqual(errors(next),[]);
  assert.equal(next.animators.fx[0].defaultValue,.75);
  assert.equal(next.animators.additive[0].defaultValue,.75);
});

test('all five fixed external fields reject changed values and allow exact repeats', () => {
  const blocks=[block('base',[parameter('Fixed')],'expression')],expr=fixed([external('Fixed','Float',.5,false,true)]);
  const equal={registered:true,type:'Float',defaultValue:.5,networkSynced:false,saved:true};
  assert.deepEqual(errors(resolve(blocks,expr,plan({parameterEdits:{Fixed:equal}}))),[]);
  for(const delta of [{registered:false},{type:'Int'},{defaultValue:0},{networkSynced:true},{saved:false}])
    assert.ok(codes(resolve(blocks,expr,plan({parameterEdits:{Fixed:{...equal,...delta}}}))).includes('fixed_parameter_edit'));
});

test('Bool-to-Float is explicit supported compatibility, and reflection uses 0/1', () => {
  const result=resolve([block('base',[parameter('Binary','Float',0)],'expression')],fixed([external('Binary','Bool',1)]),plan({parameterEdits:{Binary:{applyAnimatorDefault:true}}}));
  assert.deepEqual(errors(result),[]);
  assert.equal(result.animators.fx[0].type,'Float');
  assert.equal(result.animators.fx[0].defaultValue,1);
  assert.ok(codes(resolve([block('base',[parameter('A','Int',0)],'expression')],fixed([external('A','Float',.5)]))).includes('unsupported_type_conversion'));
});

test('builtins are excluded and Trigger is not silently made into an external Bool', () => {
  const result=resolve([block('base',[parameter('IsLocal','Bool',1),parameter('VelocityX'),parameter('Pulse','Trigger',0)])],new Map(),plan({parameterEdits:{Pulse:{registered:false}}}));
  assert.deepEqual(errors(result),[]);
  assert.equal(result.registrations.length,0);
  assert.equal(result.animators.fx[2].type,'Trigger');
  assert.ok(codes(resolve([block('base',[parameter('IsLocal','Bool',1)],'expression')],fixed([external('IsLocal','Bool',1)]))).includes('builtin_registration'));
});

test('selected missing or malformed Expression is an error, never an editable fallback', () => {
  assert.ok(codes(resolve([block('base',[parameter('A')],'missing')])).includes('missing_expression'));
  assert.ok(codes(resolve([block('base',[parameter('A')])],new Map(),plan({globalExpressionId:'missing'}))).includes('missing_expression'));
  assert.ok(errors(resolve([block('base',[parameter('A')],'expression')],fixed([external('A'),external('A')]))).length);
});

test('external limits count synced Bool as 1 bit, Int and Float as 8, local as zero', () => {
  const rows=Array.from({length:32},(_,i)=>external('P'+i));
  const ok=resolve([],fixed(rows),plan({globalExpressionId:'expression'}));
  assert.deepEqual(errors(ok),[]); assert.equal(ok.bitCost,256);
  const tooMany=resolve([],fixed([...rows,external('Extra','Bool')]),plan({globalExpressionId:'expression'}));
  assert.ok(codes(tooMany).includes('sync_budget'));
  const local=resolve([],fixed([...rows,external('Local','Int',200,false)]),plan({globalExpressionId:'expression'}));
  assert.deepEqual(errors(local),[]); assert.equal(local.bitCost,256);
  assert.throws(()=>serializeExpression([...rows,external('Extra','Bool')]));
  assert.throws(()=>serializeExpression(Array.from({length:8193},(_,i)=>external('U'+i,'Bool',0,false))));
});

test('site values are validated without coercing flags, clipping, or rounding', () => {
  const blocks=[block('base',[parameter('A')])];
  for(const edit of [{registered:1},{registered:true,networkSynced:1},{registered:true,saved:'false'},
    {registered:true,defaultValue:NaN},{registered:true,defaultValue:Infinity},{registered:true,defaultValue:1.01},
    {registered:true,type:'Int',defaultValue:256},{registered:true,type:'Bool',defaultValue:.75},
    {registered:true,applyAnimatorDefault:'false'}]) assert.ok(errors(resolve(blocks,new Map(),plan({parameterEdits:{A:edit}}))).length,JSON.stringify(edit));
  assert.ok(errors(resolve(blocks,new Map(),plan({parameterEdits:{Typo:{registered:false}}}))).length);
});

test('inputs are immutable, prototype-like names work, and repeated output is deterministic', () => {
  const blocks=[block('base',[parameter('__proto__'),parameter('constructor')],'expression')];
  const expr=fixed([external('__proto__','Float',.3),external('constructor','Bool',1)]);
  const settings=plan();
  const before=JSON.stringify({blocks,expr:[...expr],settings});
  const first=resolve(blocks,expr,settings),second=resolve(blocks,expr,settings);
  assert.deepEqual(errors(first),[]); assert.deepEqual(first,second);
  assert.equal(JSON.stringify({blocks,expr:[...expr],settings}),before);
  assert.deepEqual(parseExpression(serializeExpression(first.registrations)),[...expr.values()][0]);
});

test('Expression YAML round trip quotes names and reproduces all external settings', () => {
  const rows=[external('Z: #quoted "name"','Bool',1,false,true),external('v2/EyeLidLeft','Float',.75),external('Counter','Int',12)];
  const text=serializeExpression(rows,'Quoted: Name');
  assert.deepEqual(parseExpression(text),rows);
  const script=extractReferences(text).find(x=>x.guid);
  assert.equal(script.fileId,'-1506855854');
  assert.equal(script.guid,'67cc4cb7839cd3741b63733d5adf0442');
});

test('Installer produces a complete root, shared MA rows, Merge Animator and optional Menu', () => {
  const rows=[{...external('Eye','Float',.75,true),applyAnimatorDefault:true},external('Local','Bool',1,false,true),external('Mode','Int',4,true)];
  const second={outputId:'additive',guid:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',fileId:'9100000',path:'Assets/Test/Additive.controller',playable:'Additive'};
  const menu={guid:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',fileId:'11400000',path:'Assets/Test/Menu.asset'};
  const text=serializeInstaller({name:'Test',controllers:[...controllers,second],registrations:rows,options,menu});
  const docs=splitUnityDocuments(text).documents;
  assert.equal(docs.length,6); assert.equal(docs[0].fileId,'100000');
  const ids=new Set(docs.map(x=>x.fileId));
  for(const ref of extractReferences(text).filter(x=>!x.guid&&x.fileId!=='0')) assert.ok(ids.has(ref.fileId));
  const ma=docs.find(x=>x.text.includes('71a96d4ea0c344f39e277d82035bf9bd')).text;
  assert.equal((ma.match(/nameOrPrefix:/g)||[]).length,3);
  assert.match(ma,/nameOrPrefix: "Eye"[\s\S]*?syncType: 2[\s\S]*?localOnly: 0[\s\S]*?defaultValue: 0\.75[\s\S]*?hasExplicitDefaultValue: 1[\s\S]*?m_overrideAnimatorDefaults: 1/);
  assert.match(ma,/nameOrPrefix: "Local"[\s\S]*?syncType: 3[\s\S]*?localOnly: 1[\s\S]*?defaultValue: 1[\s\S]*?saved: 1/);
  assert.match(text,/layerType: 5/); assert.match(text,/layerType: 2/);
  assert.equal((text.match(/pathMode: 1/g)||[]).length,2);
  assert.equal((text.match(/mergeAnimatorMode: 0/g)||[]).length,2);
  assert.ok(extractReferences(text).some(x=>x.guid===menu.guid&&x.fileId===menu.fileId));
  assert.equal(serializeInstaller({name:'Test',controllers:[...controllers,second],registrations:rows,options,menu}),text);
});

test('Installer excludes the Menu component when unselected, supports explicit options, and rejects bad references', () => {
  const text=serializeInstaller({name:'Test',controllers,registrations:[],options:{pathMode:'Relative',mergeMode:'Replace',matchWriteDefaults:true},menu:null});
  assert.equal(splitUnityDocuments(text).documents.length,4);
  assert.ok(!text.includes('7ef83cb0c23d4d7c9d41021e544a1978'));
  assert.match(text,/parameters: \[\]/); assert.match(text,/pathMode: 0/); assert.match(text,/mergeAnimatorMode: 1/); assert.match(text,/matchAvatarWriteDefaults: 1/);
  assert.throws(()=>serializeInstaller({name:'X',controllers:[],registrations:[],options}));
  assert.throws(()=>serializeInstaller({name:'X',controllers:[{...controllers[0],guid:'bad'}],registrations:[],options}));
  assert.throws(()=>serializeInstaller({name:'X',controllers:[{...controllers[0],fileId:9100000}],registrations:[],options}));
  assert.throws(()=>serializeInstaller({name:'X',controllers,registrations:[],options:{...options,pathMode:'Maybe'}}));
  assert.throws(()=>serializeInstaller({name:'X',controllers,registrations:[external('Local','Bool',.5,false)],options}));
});

let passed=0;
for(const {name,fn} of cases) { try { await fn(); passed++; console.log(`PASS ${name}`); } catch(error) { console.error(`FAIL ${name}`); throw error; } }
console.log(`Registration: ${passed}/${cases.length} passed (static JavaScript/YAML; Unity runtime unverified).`);
