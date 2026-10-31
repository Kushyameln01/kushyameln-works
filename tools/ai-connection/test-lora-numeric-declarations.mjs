// Static public-contract fixtures only; no original/model bytes or inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {describeLoraNumericDeclarations, LORA_NUMERIC_DECLARATIONS_VERSION} from '../../docs/shared/inference/lora/numeric-declarations.mjs';

const key = 'diffusion_model.blocks.0.self_attn.q';
function fixture() {
  const connectionTargets = [
    {key:key+'.weight',weightId:'q.weight',module:'diffusion_models',shape:[5120,5120],dtype:'F32',layout:'row-major',parameterRole:'weight',binding:{kind:'runtime-input',name:'weight'},transform:{kind:'identity'}},
    {key:key+'.bias',weightId:'q.bias',module:'diffusion_models',shape:[5120],dtype:'F32',layout:'row-major',parameterRole:'bias',binding:{kind:'hike-parameter',name:'bias'},transform:{kind:'identity'}}
  ];
  // Native order deliberately differs from SDK order. Never join array indices.
  const nativeTargets = [
    {key:key+'.bias',weightId:'q.bias',originalKey:'blocks.0.self_attn.q.bias',fullShape:[5120],shape:[16],dtype:'F32',computeDtype:'F32',storageDtype:'F16',layout:'row-major',binding:{kind:'hike-parameter',name:'bias'},transform:{kind:'row-slice',rowStart:0,rowCount:16,transpose:false}},
    {key:key+'.weight',weightId:'q.weight',originalKey:'blocks.0.self_attn.q.weight',fullShape:[5120,5120],shape:[16,5120],dtype:'F32',computeDtype:'F32',storageDtype:'F8_E4M3',layout:'row-major',binding:{kind:'runtime-input',name:'weight'},transform:{kind:'row-slice',rowStart:0,rowCount:16,columnStart:0,columnCount:5120,transpose:false}}
  ];
  const registry = {contractVersion:'lora-connection/2.0-draft.1',modelHash:'1'.repeat(64),graphHash:'2'.repeat(64),registryVersion:'lora-diffusion-diagnostic-adapter/0.1',side:'HIGH',executionProfileId:'bernini-q16x5120-f32-wasm-v1',loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',targets:connectionTargets};
  const plan = {contractVersion:'lora-connection/2.0-draft.1',sdkInstanceId:'fixture-sdk',localInputRevision:7,localApplicationRevision:7,planId:'5'.repeat(64),sourceSha256:'6'.repeat(64),registryHash:'4'.repeat(64),registry,
    buildId:'7'.repeat(64),coverage:'PARTIAL',completeAdapter:false,scope:'diagnostic-projection',selection:{pairId:'light',noise:'high'},loaderPolicyId:registry.loaderPolicyId,strength:-1,operations:[
      {key:key+'.weight',target:structuredClone(connectionTargets[0]),variant:'linear-down-up',rank:8,alpha:0,alphaName:key+'.alpha',scale:0,fullShape:[5120,5120],slice:{startRow:0,rowCount:16},names:[key+'.lora_down.weight',key+'.lora_up.weight',key+'.alpha']},
      {key:key+'.bias',target:structuredClone(connectionTargets[1]),variant:'additive-diff-b',scale:-1,fullShape:[5120],slice:{startRow:0,rowCount:16},names:[key+'.diff_b']}
    ]};
  const ownerBinding = {adapterVersion:'lora-diffusion-diagnostic-adapter/0.1',nativeRegistryHash:'3'.repeat(64),connectionRegistryHash:plan.registryHash,
    nativeRegistry:{schemaVersion:'bernini-diagnostic-registry/0.1',registryHash:'3'.repeat(64),modelHash:registry.modelHash,graphHash:registry.graphHash,side:'HIGH',targets:nativeTargets},connectionRegistry:structuredClone(registry)};
  return {plan,ownerBinding};
}

test('joins public weight and bias bindings by key and weightId and separates raw storage', () => {
  const f=fixture(), result=describeLoraNumericDeclarations(f), [weight,bias]=result.patches;
  assert.equal(result.schemaVersion,LORA_NUMERIC_DECLARATIONS_VERSION);
  assert.equal(result.declarationScope,'prepared-weight-bias');
  assert.deepEqual([weight.baseDtype,weight.outputDtype,weight.layout,weight.baseLayout,weight.sourceStorageDtype],['F32','F32','row-major','row-major','F8_E4M3']);
  assert.deepEqual([bias.baseDtype,bias.outputDtype,bias.layout,bias.baseLayout,bias.sourceStorageDtype],['F32','F32','row-major','row-major','F16']);
  assert.equal(weight.origins.baseDtype.path,'/nativeRegistry/targets/1/computeDtype');
  assert.equal(bias.origins.baseDtype.path,'/nativeRegistry/targets/0/computeDtype');
  assert.equal(weight.origins.outputDtype.path,'/connectionRegistry/targets/0/dtype');
  assert.equal(weight.origins.layout.key,key+'.weight');
  assert.equal(weight.origins.layout.weightId,'q.weight');
  assert.deepEqual(weight.fullShape,[5120,5120]);assert.deepEqual(weight.slice,{startRow:0,rowCount:16});
  assert.equal(weight.sourceSha256,f.plan.sourceSha256);assert.equal(weight.planId,f.plan.planId);
  assert.equal(weight.nativeRegistryHash,f.ownerBinding.nativeRegistryHash);assert.equal(weight.connectionRegistryHash,f.plan.registryHash);
  assert.equal(weight.alpha,0);assert.equal(weight.scale,0);assert.equal(weight.strength,-1);assert.equal(weight.rank,8);
  assert.equal(bias.rank,null);assert.equal(bias.presence.rank,false);
  assert.equal('compatibility' in result,false);assert.equal('readiness' in result,false);
});

test('missing owner dtype and layout stay absent with exact origin paths rather than defaults', () => {
  const f=fixture();delete f.ownerBinding.nativeRegistry.targets[1].computeDtype;
  delete f.ownerBinding.nativeRegistry.targets[1].layout;delete f.ownerBinding.connectionRegistry.targets[0].dtype;
  delete f.ownerBinding.connectionRegistry.targets[0].layout;delete f.plan.operations[0].target.dtype;
  const [weight]=describeLoraNumericDeclarations(f).patches;
  assert.equal(weight.baseDtype,null);assert.equal(weight.outputDtype,null);assert.equal(weight.layout,null);assert.equal(weight.baseLayout,null);
  assert.equal(weight.presence.baseDtype,false);assert.equal(weight.presence.outputDtype,false);assert.equal(weight.presence.layout,false);
  assert.equal(weight.observed.target.dtype,null);assert.equal(weight.presence.observed.target.dtype,false);
  assert.ok(weight.missingPaths.includes('/nativeRegistry/targets/1/computeDtype'));
  assert.ok(weight.missingPaths.includes('/connectionRegistry/targets/0/layout'));
  assert.ok(weight.missingPaths.includes('/operations/0/target/dtype'));
});

test('known contradictory dtype and layout observations remain data for the manager judge', () => {
  const f=fixture();f.ownerBinding.nativeRegistry.targets[1].computeDtype='F16';
  f.ownerBinding.nativeRegistry.targets[1].layout='column-major';f.ownerBinding.connectionRegistry.targets[0].dtype='F64';
  f.ownerBinding.connectionRegistry.targets[0].layout='blocked';f.plan.operations[0].target.dtype='F8_E4M3';f.plan.operations[0].target.layout='transposed';
  const [weight]=describeLoraNumericDeclarations(f).patches;
  assert.deepEqual([weight.baseDtype,weight.outputDtype,weight.layout,weight.baseLayout],['F16','F64','blocked','column-major']);
  assert.equal(weight.observed.native.dtype,'F32');assert.equal(weight.observed.target.dtype,'F8_E4M3');assert.equal(weight.observed.target.layout,'transposed');
  assert.equal(weight.presence.baseDtype,true);assert.equal(weight.presence.observed.target.dtype,true);
});

test('explicit null alpha stays declared while an omitted alpha is never replaced with a multiplier', () => {
  const f=fixture();f.plan.operations[0].alpha=null;delete f.plan.operations[0].scale;
  const [weight]=describeLoraNumericDeclarations(f).patches;
  assert.equal(weight.alpha,null);assert.equal(weight.presence.alpha,true);assert.equal(weight.scale,null);assert.equal(weight.presence.scale,false);
});

test('top-level missing identity metadata is distinguishable from explicit null declarations', () => {
  const f=fixture();delete f.plan.sdkInstanceId;delete f.plan.localInputRevision;delete f.plan.buildId;
  f.plan.localApplicationRevision=null;f.plan.scope=null;delete f.plan.coverage;
  const result=describeLoraNumericDeclarations(f);
  assert.equal(result.sdkInstanceId,null);assert.equal(result.presence?.sdkInstanceId,false);
  assert.equal(result.localInputRevision,null);assert.equal(result.presence.localInputRevision,false);
  assert.equal(result.localApplicationRevision,null);assert.equal(result.presence.localApplicationRevision,true);
  assert.equal(result.presence.scope,true);assert.equal(result.presence.coverage,false);
  assert.equal(result.origins.localInputRevision.path,'/localInputRevision');
  assert.ok(result.missingPaths.includes('/buildId'));assert.ok(result.missingPaths.includes('/coverage'));
  assert.equal(result.missingPaths.includes('/scope'),false);
});

test('rejects non-JSON collections instead of returning a superficially frozen mutable Map or Set', () => {
  for(const value of [new Map([['dtype','F32']]),new Set(['F32']),new Date(0)]){
    const f=fixture();f.ownerBinding.nativeRegistry.targets[1].computeDtype=value;
    assert.throws(()=>describeLoraNumericDeclarations(f),error=>error.code==='LORA_DECLARATION_IDENTITY_ERROR');
  }
});

test('rejects non-index or symbol array properties that could hide mutable metadata', () => {
  for(const attach of [array=>{array.extra=new Map([['mutable',true]]);},array=>{array[Symbol('hidden')]='value';}]){
    const f=fixture();attach(f.plan.operations[0].fullShape);
    assert.throws(()=>describeLoraNumericDeclarations(f),error=>error.code==='LORA_DECLARATION_IDENTITY_ERROR');
  }
});

test('refuses foreign registry identity and key-or-weightId aliases instead of borrowing another target', () => {
  for(const mutate of [f=>{f.plan.registryHash='8'.repeat(64);},f=>{f.ownerBinding.nativeRegistry.registryHash='9'.repeat(64);},
    f=>{f.ownerBinding.connectionRegistry.targets[0].weightId='q.bias';},f=>{f.ownerBinding.nativeRegistry.targets[1].key=key+'.bias';},
    f=>{f.ownerBinding.nativeRegistry.targets.push(structuredClone(f.ownerBinding.nativeRegistry.targets[1]));},
    f=>{f.plan.operations[0].target.key=key+'.bias';}]){
    const f=fixture();mutate(f);assert.throws(()=>describeLoraNumericDeclarations(f),error=>error.code==='LORA_DECLARATION_IDENTITY_ERROR');
  }
});

test('accepts an explicit facade envelope, freezes returned data and never mutates caller objects', () => {
  const f=fixture(), before=structuredClone(f), envelope={owner:f.ownerBinding,management:{sourcePins:{sdk:{repository:'fixed-source',commit:'a'.repeat(40)}}}}, envelopeBefore=structuredClone(envelope);
  const result=describeLoraNumericDeclarations({plan:f.plan,ownerBinding:envelope});
  assert.equal(result.patches[0].origins.baseDtype.path,'/owner/nativeRegistry/targets/1/computeDtype');
  assert.deepEqual(f,before);assert.deepEqual(envelope,envelopeBefore);
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.patches));assert.ok(Object.isFrozen(result.patches[0].origins.baseDtype));
  assert.throws(()=>{result.patches[0].layout='changed';},TypeError);
  f.plan.operations[0].slice.rowCount=1;f.ownerBinding.connectionRegistry.targets[0].dtype='F16';
  assert.deepEqual(result.patches[0].slice,{startRow:0,rowCount:16});assert.equal(result.patches[0].outputDtype,'F32');
});
