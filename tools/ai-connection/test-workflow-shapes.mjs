// Metadata geometry only. No pixel transforms, native imports or neural execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const api=await import('../../docs/shared/ai-connection/workflow-shapes.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const geometry={rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'};
const absent=()=>({state:'absent'});
function request(change={}){return{schemaVersion:1,ruleId:api.BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:81,height:480,width:832},refMaxSize:848,geometry:structuredClone(geometry),media:{sourceVideo:absent(),referenceVideo:absent(),slots:[]},...change};}
function derive(input){assert.equal(typeof api.deriveWorkflowShapes,'function','shared shape derivation must exist');return api.deriveWorkflowShapes(input);}
const req=(p,id)=>{const r=p.requirements.find(x=>x.requirementId===id);assert.ok(r,'requirement '+id);return r;};
const image=(h,w,f=1,extra={})=>({state:'present',rgb:{frames:f,height:h,width:w},...extra});
const slot=(index,supply)=>({slotIndex:index,wired:supply,editor:absent()});

// Catches forcing source F81, target/controlled-profile conflation, wrong target-first offsets.
test('one plan preserves target81 and a separate controlled Rect context',()=>{
 const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[slot(0,image(16,32,1,{inputId:'controlled',sourceFrameIndices:[7]}))]}}));
 assert.deepEqual(req(p,'target.latent').shape,[1,16,21,60,104]);
 assert.deepEqual(req(p,'context:0:0.latent').shape,[1,16,1,2,4]);
 assert.deepEqual(req(p,'context:0:0.latent').axes,['N','C','T','H','W']);
 assert.equal(req(p,'context:0:0.latent').dtype,'float32');
 assert.equal(req(p,'context:0:0.latent').meaning,null);
 assert.equal(p.target.tokenCount,32760);
 assert.equal(p.concatenation.totalTokens,32762);
 assert.deepEqual(p.orderedContexts.entries[0].concatTokenRange,[32760,32762]);
 assert.equal(p.orderedContexts.entries[0].sourceId,1);
 assert.equal(p.ownerSupport,'NOT_QUERIED');
 for(const field of ['validProfile','compatibility','generationReady'])assert.equal(Object.hasOwn(p,field),false);
});
// Catches padding a short supplied source to target81 or using source dimensions as canvas.
test('source uses actual supplied F and configured canvas independently',()=>{
 const p=derive(request({media:{sourceVideo:image(720,1280,5),referenceVideo:absent(),slots:[]}}));
 assert.deepEqual(req(p,'source.rgb').shape,[1,3,5,480,832]);
 assert.deepEqual(req(p,'source.latent').shape,[1,16,2,60,104]);
 assert.equal(req(p,'source.rgb').preprocessing.interpolation,'area');
 assert.equal(req(p,'source.rgb').preprocessing.crop,'center');
 assert.equal(p.concatenation.totalTokens,35880);
});
// Catches replacing a non4n+1 source by77/81 or claiming every input frame retained.
test('F80 remains F80 and floor compression records its unretained temporal tail',()=>{
 const p=derive(request({media:{sourceVideo:image(480,832,80),referenceVideo:absent(),slots:[]}}));
 assert.equal(req(p,'source.rgb').shape[2],80);
 assert.deepEqual(req(p,'source.latent').shape,[1,16,20,60,104]);
 assert.equal(req(p,'source.latent').qualification.fullFrameRetention,false);
 assert.equal(req(p,'source.latent').qualification.coveredRgbFrames,77);
 assert.ok(req(p,'source.latent').issues.some(x=>x.code==='TEMPORAL_TAIL_NOT_RETAINED'));
 assert.deepEqual(req(p,'target.latent').shape,[1,16,21,60,104]);
});
// Catches treating UI step hints as server rejection or rounding target parameters.
test('off-grid target keeps literal floor zero-latent requirement and requested RGB',()=>{
 const p=derive(request({target:{batch:1,frames:80,height:24,width:40}}));
 assert.deepEqual(req(p,'target.rgb').shape,[1,3,80,24,40]);
 assert.deepEqual(req(p,'target.latent').shape,[1,16,20,3,5]);
 assert.deepEqual(p.target.tokenGrid,[20,2,3]);
 assert.equal(p.target.tokenCount,120);
});
// Catches Math.round half-up, square848 substitution and a no-upscale clamp absent from source.
test('reference long-edge uses Python half-even with minimum16',()=>{
 for(const [h,w,expected] of [[40,24,[1,3,1,32,32]],[56,72,[1,3,1,64,64]],[8,8,[1,3,1,16,16]],[850,1700,[1,3,1,416,848]]]){
  const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[slot(0,image(h,w))]}}));
  assert.deepEqual(req(p,'context:0:0.rgb').shape,expected);
 }
});
// Catches applying the source canvas to reference video.
test('reference video slices available frames then preserves its own non-square long edge',()=>{
 const p=derive(request({target:{batch:1,frames:5,height:480,width:832},media:{sourceVideo:absent(),referenceVideo:image(850,1700,9),slots:[]}}));
 assert.deepEqual(req(p,'reference.rgb').shape,[1,3,5,416,848]);
 assert.deepEqual(req(p,'reference.latent').shape,[1,16,2,52,106]);
});
// Catches preferring editor, numbering by original slot, or creating absent placeholders.
test('wired input wins while compacted ordinal remains separate from original slot',()=>{
 const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[{slotIndex:3,wired:image(16,32),editor:image(512,512)}]}}));
 const e=p.orderedContexts.entries[0];
 assert.equal(p.orderedContexts.entries.length,1);assert.equal(e.originalSlotIndex,3);assert.equal(e.compactedSlotOrdinal,0);assert.equal(e.sourceId,1);
 assert.deepEqual(req(p,'context:3:0.rgb').shape,[1,3,1,16,32]);
 assert.equal(req(p,'context:3:0.rgb').selectedOrigin,'wired');
});
// Catches combining slot batch frames into one video, deduplicating, or aliasing caller arrays.
test('each slot batch frame is a distinct context with duplicated frame/time mapping retained',()=>{
 const indices=[9,9],times=[.25,.25];
 const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[slot(2,image(16,32,2,{sourceFrameIndices:indices,sourceFrameTimesSeconds:times}))]}}));
 assert.equal(p.orderedContexts.entries.length,2);
 assert.deepEqual(p.orderedContexts.entries.map(x=>x.sourceId),[1,2]);
 assert.deepEqual(req(p,'context:2:0.latent').provenance.sourceFrameIndices,[9]);
 assert.deepEqual(req(p,'context:2:1.latent').provenance.sourceFrameTimesSeconds,[.25]);
 indices[0]=77;times[0]=88;
 assert.deepEqual(req(p,'context:2:0.latent').provenance.sourceFrameIndices,[9]);
 assert.deepEqual(req(p,'context:2:0.latent').provenance.sourceFrameTimesSeconds,[.25]);
});
// Catches sorting/deleting input-frame duplicates or treating missing optional times as failure.
test('source selection keeps original frame order and optional times remain absent',()=>{
 const p=derive(request({target:{batch:1,frames:5,height:480,width:832},media:{sourceVideo:image(90,160,6,{sourceFrameIndices:[9,8,8,1,2,3]}),referenceVideo:absent(),slots:[]}}));
 assert.deepEqual(req(p,'source.rgb').provenance.sourceFrameIndices,[9,8,8,1,2]);
 assert.equal(Object.hasOwn(req(p,'source.rgb').provenance,'sourceFrameTimesSeconds'),false);
 assert.equal(p.issues.some(x=>x.code==='FRAME_TIMES_LENGTH_MISMATCH'),false);
});
// Catches inventing source_id/counts when an earlier supply might exist.
test('unknown supply invalidates dependent IDs and totals but preserves known target and slot shape',()=>{
 const p=derive(request({media:{sourceVideo:{state:'unknown'},referenceVideo:absent(),slots:[slot(0,image(16,32))]}}));
 assert.equal(req(p,'source.rgb').state,'unknown');
 assert.deepEqual(req(p,'target.latent').shape,[1,16,21,60,104]);
 assert.deepEqual(req(p,'context:0:0.latent').shape,[1,16,1,2,4]);
 assert.equal(p.orderedContexts.complete,false);assert.equal(p.orderedContexts.entries[0].sourceId,null);assert.equal(p.concatenation.totalTokens,null);
});
// Catches erasing source lineage and offsets already known before a later unknown supply.
test('a later unresolved population preserves the known source prefix and only blocks its dependents',()=>{
 const p=derive(request({media:{sourceVideo:image(720,1280,5),referenceVideo:absent(),slots:[{slotIndex:1,wired:{state:'unknown'},editor:absent()},slot(2,image(16,32))]}}));
 assert.equal(p.orderedContexts.complete,false);
 assert.equal(p.orderedContexts.entries[0].sourceId,1);
 assert.deepEqual(p.orderedContexts.entries[0].concatTokenRange,[32760,35880]);
 assert.equal(p.orderedContexts.entries[1].sourceId,null);
 assert.equal(p.orderedContexts.entries[1].concatTokenRange,null);
 assert.equal(p.concatenation.contextTokens,null);
 assert.equal(p.concatenation.totalTokens,null);
});
// Catches publishing known shape requirements from an unbound source procedure.
test('unknown or omitted workflow rule is rejected before deriving requirements',()=>{
 for(const ruleId of [undefined,'different-workflow-v1'])assert.throws(()=>derive(request({ruleId})),{name:'TypeError'});
});
// Catches treating unresolved wired supply as editor fallback.
test('unknown wire blocks only that slot selection despite a present editor candidate',()=>{
 const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[{slotIndex:1,wired:{state:'unknown'},editor:image(16,32)}]}}));
 assert.equal(req(p,'slot:1.latent').state,'unknown');
 assert.equal(p.orderedContexts.complete,false);assert.equal(p.target.tokenCount,32760);
});
// Catches turning absent roles into blockers and forgetting editor fallback.
test('known absent roles do not block and an editor single frame uses its oriented dimensions',()=>{
 const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[{slotIndex:4,wired:absent(),editor:image(40,24,1,{rgb:{frames:1,height:40,width:24,geometryStage:'exif-oriented-rgb'}})}]}}));
 assert.equal(req(p,'source.latent').state,'absent');
 assert.equal(p.orderedContexts.complete,true);
 assert.equal(req(p,'context:4:0.rgb').selectedOrigin,'editor');
 assert.deepEqual(req(p,'context:4:0.rgb').shape,[1,3,1,32,32]);
});
// Catches assuming raw file dimensions have already had rotation/EXIF applied.
test('unresolved orientation leaves only affected geometry unknown',()=>{
 const p=derive(request({media:{sourceVideo:absent(),referenceVideo:absent(),slots:[slot(0,{state:'present',rgb:{frames:1,height:40,width:24,geometryStage:'unknown'}})]}}));
 assert.equal(req(p,'context:0:0.rgb').state,'unknown');assert.equal(p.target.tokenCount,32760);
});
// Catches a hidden model-wide geometry default or an invented native meaning.
test('geometry and semantics must be explicit and remain unqueried',()=>{
 const p=derive(request({geometry:{dtype:'float32',rgbChannels:3}}));
 assert.equal(req(p,'target.rgb').state,'known');assert.equal(req(p,'target.latent').state,'unknown');
 const q=derive(request({semantics:{'target-latent':{meaning:'caller:logical',normalization:{owner:'declared'}}}}));
 assert.equal(req(q,'target.latent').meaning,'caller:logical');assert.deepEqual(req(q,'target.latent').normalization,{owner:'declared'});
 const r=derive(request({geometry:{...geometry,dtype:undefined}}));assert.equal(req(r,'target.latent').state,'unknown');
});
// Catches unsafe integer products becoming plausible profile/token counts.
test('overflow never produces a known count or a numeric admission verdict',()=>{
 const p=derive(request({target:{batch:1,frames:Number.MAX_SAFE_INTEGER,height:Number.MAX_SAFE_INTEGER,width:Number.MAX_SAFE_INTEGER}}));
 assert.equal(p.concatenation.totalTokens,null);
 assert.ok(p.issues.some(x=>x.code==='SHAPE_INTEGER_OVERFLOW'));
});
// Catches importing stale workflow filenames as actual media supply or duplicating parser formulas.
test('parser reads the actual source workflow settings but only explicit media supplies become present',async()=>{
 assert.equal(typeof api.parseBerniniWorkflowShapeRequest,'function','workflow parser must exist');
 const workflow=JSON.parse(await readFile(new URL('../../development/ai-connection/p4-management/workflow/source/bernini_rv2v_basic.ca69274.original.json',import.meta.url),'utf8'));
 const input=api.parseBerniniWorkflowShapeRequest({workflow,geometry});
 assert.deepEqual(input.target,{batch:1,frames:81,height:480,width:832});
 assert.equal(input.refMaxSize,848);assert.equal(input.media.sourceVideo.state,'unknown');assert.equal(input.media.referenceVideo.state,'absent');
 assert.equal(input.media.slots[0].wired.state,'unknown');assert.equal(input.media.slots[0].editor.state,'unknown');assert.equal(input.media.slots[3].wired.state,'absent');
 const p=derive(input);assert.deepEqual(req(p,'target.latent').shape,[1,16,21,60,104]);assert.equal(p.concatenation.totalTokens,null);
 const known=api.parseBerniniWorkflowShapeRequest({workflow,geometry,media:{sourceVideo:absent(),slots:[slot(0,image(16,32))]}});
 assert.deepEqual(req(derive(known),'context:0:0.latent').shape,[1,16,1,2,4]);
});

