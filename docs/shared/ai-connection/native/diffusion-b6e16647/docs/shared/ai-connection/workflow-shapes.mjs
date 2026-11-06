/**
 * Pure metadata requirements for the ca69274 Bernini / B5 context_latents path.
 * No native imports, pixels, payloads, numerical admission or model execution.
 * ca69274 bernini_studio.py379-388,600-603,630-688.
 * B5 wan/model.py581-584,603-607,704-725: target tokens first; target ID0,
 * actual ordered contexts IDs1+. Geometry is an explicit owner declaration.
 */
export const BERNINI_WORKFLOW_RULE_ID='bernini-ca69274-b5a4321-wan21-shapes-v1';
const positive=n=>Number.isSafeInteger(n)&&n>0;
const clone=x=>x===undefined?undefined:structuredClone(x);
const absent=()=>({state:'absent'});
const axesFor=kind=>kind==='tokens'?['B','L','C']:['N','C','T','H','W'];
function product(values){let n=1;for(const v of values){if(!positive(v)||!Number.isSafeInteger(n*v))return null;n*=v;}return n;}
function halfEven(n){const low=Math.floor(n),fraction=n-low;return fraction<.5?low:fraction>.5?low+1:low%2===0?low:low+1;}
function temporal(frames,factor){return Math.floor((frames-1)/factor)+1;}

/** Input schema: explicit target+geometry and media:{sourceVideo,referenceVideo,slots}.
 * Supply state is present/absent/unknown; rgb describes supplied (or EXIF-oriented)
 * RGB geometry, never an inference from a filename, widget, duration or FPS.
 * Missing optional times remain absent. Semantic labels come only from callers.
 */
export function deriveWorkflowShapes(input={}){
 if(input.ruleId!==BERNINI_WORKFLOW_RULE_ID)throw new TypeError('An explicit supported workflow rule ID is required');
 const geometry=input.geometry??{},target=input.target??{},media=input.media??{};
 const requirements=[],issues=[],entries=[],slotSelections=[];
 let populationComplete=true,populationBarrier=null;
 function populationUnknown(){populationComplete=false;populationBarrier??=entries.length;}
 function issue(code,fieldPath,reason,stage='geometry',owner='management'){
  const value={code,fieldPath,reason,stage,owner};
  if(!issues.some(x=>x.code===code&&x.fieldPath===fieldPath))issues.push(value);
  return value;
 }
 function shapeOk(shape,path,local){
  if(!shape||shape.some(n=>!positive(n)))return null;
  if(product(shape)===null){local.push(issue('SHAPE_INTEGER_OVERFLOW',path,'Shape element count is not a safe positive integer.'));return null;}
  return shape;
 }
 function requirement(prefix,role,kind,shape,state,provenance={},extra={},local=[]){
  const id=prefix+'.'+kind,dtype=typeof geometry.dtype==='string'&&geometry.dtype?geometry.dtype:null;
  let owned=state==='absent'?null:shapeOk(shape,'/'+id,local);
  if(state!=='absent'&&!dtype)local.push(issue('DTYPE_UNBOUND','/geometry/dtype','Owner-declared dtype is required.'));
  const semantics=input.semantics?.[role]??{};
  const r={requirementId:id,role,state:state==='absent'?'absent':owned&&dtype?'known':'unknown',shape:owned,dtype,axes:axesFor(kind),meaning:clone(semantics.meaning??null),normalization:clone(semantics.normalization??null),provenance:clone(provenance),issues:[...local],...extra};
  requirements.push(r);return r;
 }
 function family(prefix,role,rgb,state,provenance={},extra={},local=[],isTarget=false){
  const rgbRequirement=requirement(prefix,role+'-rgb','rgb',rgb,state,provenance,extra,[...local]);
  let latent=null,qualification=null;
  const comp=geometry.temporalCompression,spatial=geometry.spatialCompression,channels=geometry.latentChannels;
  const latentIssues=[...local];
  if(state!=='absent'&&rgb){
   if(!positive(comp)||!positive(channels)||!Array.isArray(spatial)||spatial.length!==2||!spatial.every(positive)){
    latentIssues.push(issue('COMPRESSION_GEOMETRY_UNBOUND','/geometry','Explicit latent channels and temporal/spatial compression are required.','geometry','vae'));
   }else if(!isTarget&&geometry.temporalRule!=='first-then-groups-floor'){
    latentIssues.push(issue('TEMPORAL_RULE_UNBOUND','/geometry/temporalRule','Context compression needs the declared first-then-groups-floor owner rule.','geometry','vae'));
   }else if(!isTarget&&(rgb[3]%spatial[0]||rgb[4]%spatial[1])){
    latentIssues.push(issue('SPATIAL_COMPRESSION_NOT_EXACT','/'+prefix,'Context dimensions are not exactly divisible by declared spatial compression.','geometry','vae'));
   }else{
    const t=temporal(rgb[2],comp),covered=comp*(t-1)+1;
    latent=[rgb[0],channels,t,Math.floor(rgb[3]/spatial[0]),Math.floor(rgb[4]/spatial[1])];
    qualification={inputRgbFrames:rgb[2],coveredRgbFrames:covered,fullFrameRetention:covered===rgb[2],spatialRoundtripExact:latent[3]*spatial[0]===rgb[3]&&latent[4]*spatial[1]===rgb[4]};
    if(!qualification.fullFrameRetention)latentIssues.push(issue('TEMPORAL_TAIL_NOT_RETAINED','/'+prefix,'The declared floor rule does not retain every supplied/requested frame; RGB frame count is unchanged.','geometry','vae'));
   }
  }
  const latentRequirement=requirement(prefix,role+'-latent','latent',latent,state,provenance,{...extra,qualification},latentIssues);
  let grid=null,count=null,padding=null,tokenShape=null;
  const tokenIssues=[...latentIssues],patch=geometry.patchSize;
  if(latentRequirement.shape){
   if(!Array.isArray(patch)||patch.length!==3||!patch.every(positive)||!positive(geometry.hiddenSize)){
    tokenIssues.push(issue('PATCH_GEOMETRY_UNBOUND','/geometry/patchSize','Explicit patch size and hidden width are required.','geometry','diffusion_models'));
   }else{
    grid=latent.slice(2).map((n,i)=>Math.ceil(n/patch[i]));
    count=product(grid);
    if(count===null)tokenIssues.push(issue('SHAPE_INTEGER_OVERFLOW','/'+prefix+'.tokens','Patch token count is not a safe integer.'));
    else{
     padding={tail:latent.slice(2).map((n,i)=>grid[i]*patch[i]-n),mode:geometry.paddingMode??null};
     tokenShape=[latent[0],count,geometry.hiddenSize];
    }
   }
  }
  const tokens=requirement(prefix,role+'-tokens','tokens',tokenShape,state,provenance,{tokenGrid:grid,tokenCount:count,padding},tokenIssues);
  return {rgb:rgbRequirement,latent:latentRequirement,tokens,tokenGrid:grid,tokenCount:tokens.shape?count:null,padding};
 }
 const targetLocal=[];
 if(!['batch','frames','height','width'].every(k=>positive(target[k])))targetLocal.push(issue('TARGET_PARAMETER_MISSING','/target','Explicit positive target batch, frames, height and width are required.'));
 const targetRgb=targetLocal.length||!positive(geometry.rgbChannels)?null:[target.batch,geometry.rgbChannels,target.frames,target.height,target.width];
 if(!positive(geometry.rgbChannels))targetLocal.push(issue('RGB_CHANNELS_UNBOUND','/geometry/rgbChannels','Explicit RGB channel count is required.'));
 const targetFamily=family('target','target',targetRgb,'present',{}, {},targetLocal,true);
 function provenance(supply,frame=null,limit=null,slotIndex=null){
  const p={...clone(supply.provenance??{})};
  for(const key of ['inputId','inputSha256'])if(supply[key]!==undefined)p[key]=clone(supply[key]);
  if(slotIndex!==null)p.originalSlotIndex=slotIndex;
  if(frame!==null)p.originalFrameIndex=frame;
  for(const key of ['sourceFrameIndices','sourceFrameTimesSeconds'])if(supply[key]!==undefined){
   const value=supply[key];
   p[key]=Array.isArray(value)?clone(frame!==null?value.slice(frame,frame+1):limit!==null?value.slice(0,limit):value):clone(value);
  }
  if(Array.isArray(supply.sourceFrameTimesSeconds)&&(!Array.isArray(supply.sourceFrameIndices)||supply.sourceFrameTimesSeconds.length!==supply.sourceFrameIndices.length)){
   issue('FRAME_TIMES_LENGTH_MISMATCH','/media/'+(slotIndex===null?'video':slotIndex)+'/sourceFrameTimesSeconds','Provided times require the same number of original source indices.','lineage');
  }
  return p;
 }
 function geometryFor(supply,path,local,framesOverride=null){
  const rgb=supply.rgb??{};
  if(rgb.geometryStage==='unknown'||rgb.geometryStage==='decoded-unoriented'){
   local.push(issue('MEDIA_ORIENTATION_UNRESOLVED',path,'Supply oriented RGB dimensions rather than unresolved file orientation.'));return null;
  }
  const f=framesOverride??rgb.frames;
  if(![f,rgb.height,rgb.width,geometry.rgbChannels].every(positive)){
   local.push(issue('MEDIA_DIMENSIONS_UNKNOWN',path,'Supplied RGB frame count, dimensions and channel declaration are required.'));return null;
  }
  return [1,geometry.rgbChannels,f,rgb.height,rgb.width];
 }
 function longEdge(rgb,path,local){
  if(!rgb)return null;
  if(!positive(input.refMaxSize)){local.push(issue('REFERENCE_LIMIT_UNBOUND','/refMaxSize','Explicit reference max size is required.'));return null;}
  const scale=Math.min(input.refMaxSize/Math.max(rgb[3],rgb[4]),1);
  return [rgb[0],rgb[1],rgb[2],Math.max(16,halfEven(rgb[3]*scale/16)*16),Math.max(16,halfEven(rgb[4]*scale/16)*16)];
 }
 function addEntry(prefix,role,family,extra={}){
  entries.push({contextKey:prefix,role,...extra,sourceId:null,rgbShape:clone(family.rgb.shape),latentShape:clone(family.latent.shape),tokenGrid:clone(family.tokenGrid),tokenCount:family.tokenCount,concatTokenRange:null,provenance:clone(family.latent.provenance)});
 }
 function video(name,prefix,role){
  const supply=media[name]??absent(),state=supply.state??'unknown',local=[];
  if(state==='unknown'){populationUnknown();local.push(issue('MEDIA_SUPPLY_UNKNOWN','/media/'+name,'Actual supply is unresolved.'));}
  let rgb=state==='present'?geometryFor(supply,'/media/'+name+'/rgb',local):null;
  if(rgb){
   if(!positive(target.frames)){local.push(issue('TARGET_LENGTH_UNBOUND','/target/frames','Video first-length selection needs target frames.'));rgb=null;}
   else rgb[2]=Math.min(rgb[2],target.frames);
  }
  if(rgb&&prefix==='source'){
   if(!positive(target.height)||!positive(target.width)){local.push(issue('TARGET_CANVAS_UNBOUND','/target','Source resize needs explicit canvas dimensions.'));rgb=null;}
   else{rgb[3]=target.height;rgb[4]=target.width;}
  }else if(rgb)rgb=longEdge(rgb,'/media/'+name,local);
  const preprocessing=prefix==='source'?{interpolation:'area',crop:'center',canvas:{height:target.height??null,width:target.width??null}}:{interpolation:'area',crop:'disabled',longEdge:input.refMaxSize??null,rounding:'python-ties-to-even',stride:16};
  const f=family(prefix,role,rgb,state,provenance(supply,null,rgb?.[2]??null),{preprocessing},local);
  if(state==='present')addEntry(prefix,role,f);
 }
 video('sourceVideo','source','source');
 video('referenceVideo','reference','reference');
 const suppliedSlots=new Map();
 for(const slot of media.slots??[]){
  if(!Number.isSafeInteger(slot.slotIndex)||slot.slotIndex<0||slot.slotIndex>7||suppliedSlots.has(slot.slotIndex))throw new TypeError('Unique original slot indices0..7 required');
  suppliedSlots.set(slot.slotIndex,slot);
 }
 let compacted=0,slotPopulationComplete=true;
 for(let index=0;index<8;index++){
  const slot=suppliedSlots.get(index)??{},wired=slot.wired??absent(),editor=slot.editor??absent();
  let supply,origin,state;
  if(wired.state==='present'){supply=wired;origin='wired';state='present';}
  else if(wired.state==='unknown'||!['present','absent'].includes(wired.state)){state='unknown';}
  else{supply=editor;origin='editor';state=editor.state??'unknown';}
  const local=[];
  if(state==='unknown'){populationUnknown();slotPopulationComplete=false;local.push(issue('WIRED_EDITOR_SELECTION_UNRESOLVED','/media/slots/'+index,'Resolve actual wired supply before selecting an editor fallback.'));}
  let frames=state==='present'?(origin==='editor'?1:supply.rgb?.frames):null;
  if(state==='present'&&!positive(frames)){state='unknown';populationUnknown();slotPopulationComplete=false;local.push(issue('IMAGE_BATCH_FRAME_COUNT_UNKNOWN','/media/slots/'+index+'/rgb/frames','Each supplied image-batch frame needs an actual count.'));}
  // Reject arithmetic overflow before attempting any context expansion.
  if(state==='present'&&product([frames,geometry.rgbChannels,supply.rgb?.height,supply.rgb?.width])===null&&[frames,geometry.rgbChannels,supply.rgb?.height,supply.rgb?.width].every(positive)){
   state='unknown';populationUnknown();slotPopulationComplete=false;local.push(issue('SHAPE_INTEGER_OVERFLOW','/media/slots/'+index,'Image-batch geometry overflows safe integer metadata.'));
  }
  slotSelections.push({originalSlotIndex:index,state,selectedOrigin:state==='present'?origin:null,compactedSlotOrdinal:state==='present'&&slotPopulationComplete?compacted:null});
  if(state!=='present'){
   family('slot:'+index,'context',null,state,{}, {originalSlotIndex:index},local);continue;
  }
  const ordinal=slotPopulationComplete?compacted:null;compacted++;
  for(let frame=0;frame<frames;frame++){
   const frameFacts=supply.frames?.[frame],actual=frameFacts?{...supply,rgb:{...supply.rgb,height:frameFacts.height,width:frameFacts.width}}:supply;
   const frameLocal=[];
   const rgb=longEdge(geometryFor(actual,'/media/slots/'+index+'/frames/'+frame,frameLocal,1),'/media/slots/'+index,frameLocal);
   const prefix='context:'+index+':'+frame,extra={selectedOrigin:origin,originalSlotIndex:index,originalFrameIndex:frame,compactedSlotOrdinal:ordinal,preprocessing:{interpolation:'area',crop:'disabled',longEdge:input.refMaxSize??null,rounding:'python-ties-to-even',stride:16}};
   const f=family(prefix,'context',rgb,'present',provenance(supply,frame,null,index),extra,frameLocal);
   addEntry(prefix,'reference-image',f,extra);
  }
 }
 let contextTokens=populationComplete?0:null;
 for(let i=0;i<entries.length;i++){
  if(populationBarrier===null||i<populationBarrier)entries[i].sourceId=i+1;
  if(entries[i].tokenCount===null||contextTokens===null||!Number.isSafeInteger(contextTokens+entries[i].tokenCount))contextTokens=null;
  else contextTokens+=entries[i].tokenCount;
 }
 const orderVerified=geometry.concatOrder==='target-first';
 if(!orderVerified)issue('CONCAT_ORDER_UNVERIFIED','/geometry/concatOrder','Explicit target-first B5 context_latents order is required.','geometry','diffusion_models');
 let offset=orderVerified?targetFamily.tokenCount:null;
 for(const entry of entries){
  if(entry.sourceId===null||offset===null||entry.tokenCount===null||!Number.isSafeInteger(offset+entry.tokenCount)){offset=null;continue;}
  entry.concatTokenRange=[offset,offset+entry.tokenCount];offset+=entry.tokenCount;
 }
 const total=populationComplete&&orderVerified?offset:null;
 const batchMatches=target.batch===1;
 if(!batchMatches&&entries.length)issue('CONCAT_BATCH_POLICY_UNBOUND','/target/batch','Context N1 broadcast/repeat is not declared for this target batch.','geometry','diffusion_models');
 return {schemaVersion:1,ruleId:input.ruleId??null,ownerSupport:'NOT_QUERIED',geometry:clone(geometry),requirements,issues,
  target:{requestedRgbShape:clone(targetFamily.rgb.shape),initialLatentShape:clone(targetFamily.latent.shape),tokenGrid:clone(targetFamily.tokenGrid),tokenCount:targetFamily.tokenCount,padding:clone(targetFamily.padding)},
  slotSelections,orderedContexts:{complete:populationComplete,entries,positiveAndNegativeReferenceSameList:true},
  concatenation:{axis:'token',order:orderVerified?['target',...entries.map(x=>x.contextKey)]:null,targetSourceId:0,hiddenWidth:positive(geometry.hiddenSize)?geometry.hiddenSize:null,targetTokens:targetFamily.tokenCount,contextTokens,totalTokens:total,shapePerBatch:total!==null&&batchMatches?[1,total,geometry.hiddenSize]:null}
 };
}

/** Read only saved node parameters/declarations. A link or filename never proves
 * runtime supply. Explicit media metadata overrides those unknown declarations.
 * No geometry default or owner profile is supplied by the workflow parser.
 */
export function parseBerniniWorkflowShapeRequest({workflow,media={},geometry}={}){
 const nodes=workflow?.nodes;
 if(!Array.isArray(nodes))throw new TypeError('A ComfyUI workflow nodes array is required');
 const matches=nodes.filter(n=>n.type==='BerniniStudio');
 if(matches.length!==1)throw new TypeError('Exactly one BerniniStudio node is required');
 const node=matches[0],w=node.widgets_values??[],ports=node.inputs??[];
 const port=name=>ports.find(p=>p.name===name),unknownFor=name=>port(name)?.link!=null?{state:'unknown',declaration:{linkId:port(name).link}}:absent();
 const value=(name,index)=>port(name)?.link!=null?null:w[index]??null;
 let editors=[];try{const parsed=JSON.parse(w[13]??'[]');if(Array.isArray(parsed))editors=parsed;}catch{}
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const observed=new Map((media.slots??[]).map(s=>[s.slotIndex,s]));
 const slots=Array.from({length:8},(_,slotIndex)=>{
  const wired=unknownFor('image'+slotIndex);
  if(wired.state==='unknown'){
   const link=workflow.links?.find(l=>l[0]===wired.declaration.linkId),producer=link&&byId.get(link[1]);
   wired.declaration={...wired.declaration,nodeId:producer?.id??null,mode:producer?.mode??null,filename:producer?.widgets_values?.[0]??null};
  }
  const editor=editors[slotIndex]?{state:'unknown',declaration:{filename:editors[slotIndex]}}:absent();
  const explicit=observed.get(slotIndex);
  return {slotIndex,wired:clone(explicit?.wired??wired),editor:clone(explicit?.editor??editor)};
 });
 return {schemaVersion:1,ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:value('batch_size',3),frames:value('length',2),height:value('height',1),width:value('width',0)},refMaxSize:value('ref_max_size',8),geometry:clone(geometry),media:{sourceVideo:clone(media.sourceVideo??unknownFor('source_video')),referenceVideo:clone(media.referenceVideo??unknownFor('reference_video')),slots}};
}

