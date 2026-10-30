import { schemas } from './contracts/schemas.mjs';

export const CONTRACT_VERSION = 'works-module-contract/1.0-draft.1';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = value => String(value).replaceAll('~','~0').replaceAll('/','~1');
const pointer = (path,key) => `${path}/${esc(key)}`;
const issue = (issues,code,fieldPath,reason) => issues.push({code,fieldPath,reason});

// Implements only the JSON Schema vocabulary used by our five shipped schemas.
// No retrieval, coercion, defaults, stripping, native runtime imports or callbacks.
function inspect(schema, value, path, root, issues) {
  if (schema.$ref) return inspect(root.$defs[schema.$ref.split('/').at(-1)],value,path,root,issues);
  if (schema.anyOf) {
    const alternatives=schema.anyOf.map(choice=>{const errors=[];inspect(choice,value,path,root,errors);return errors;});
    if(!alternatives.some(errors=>errors.length===0)) {
      const best=alternatives.reduce((a,b)=>a.length<=b.length?a:b);
      issues.push(...best);return;
    }
  }
  if ('const' in schema && value !== schema.const) issue(issues,'SCHEMA_CONST',path,`Expected ${JSON.stringify(schema.const)}.`);
  if (schema.enum && !schema.enum.includes(value)) issue(issues,'SCHEMA_ENUM',path,`Expected one of ${schema.enum.join(', ')}.`);
  const types = {object, array:Array.isArray,string:v=>typeof v==='string',number:v=>typeof v==='number'&&Number.isFinite(v),integer:Number.isSafeInteger,boolean:v=>typeof v==='boolean',null:v=>v===null};
  if (schema.type && !types[schema.type](value)) {issue(issues,'SCHEMA_TYPE',path,`Expected ${schema.type}.`);return;}
  if (typeof value==='string') {
    if (schema.minLength!==undefined&&[...value].length<schema.minLength) issue(issues,'SCHEMA_LENGTH',path,'String is shorter than minLength.');
    if (schema.pattern&&!new RegExp(schema.pattern).test(value)) issue(issues,'SCHEMA_PATTERN',path,'String does not match the declared pattern.');
  }
  if (typeof value==='number'&&schema.minimum!==undefined&&value<schema.minimum) issue(issues,'SCHEMA_MINIMUM',path,`Expected at least ${schema.minimum}.`);
  if (Array.isArray(value)) {
    if (schema.minItems!==undefined&&value.length<schema.minItems) issue(issues,'SCHEMA_LENGTH',path,'Array is shorter than minItems.');
    if (schema.items) value.forEach((item,i)=>inspect(schema.items,item,pointer(path,i),root,issues));
  }
  if (object(value)) {
    for (const key of schema.required??[]) if (!Object.hasOwn(value,key)) issue(issues,'SCHEMA_REQUIRED',pointer(path,key),'Required field is missing.');
    for (const [key,item] of Object.entries(value)) {
      if (schema.propertyNames) inspect(schema.propertyNames,key,pointer(path,key),root,issues);
      if (schema.properties&&Object.hasOwn(schema.properties,key)) inspect(schema.properties[key],item,pointer(path,key),root,issues);
      else if (schema.additionalProperties===false) issue(issues,'SCHEMA_ADDITIONAL_PROPERTY',pointer(path,key),'Field is not in the adopted schema.');
      else if (object(schema.additionalProperties)) inspect(schema.additionalProperties,item,pointer(path,key),root,issues);
    }
  }
}
function jsonValue(value,path,issues,seen=new Set()) {
  if (typeof value==='number'&&(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value)))) issue(issues,'NON_JSON_NUMBER',path,'Use finite numbers and decimal strings for integers outside the safe range.');
  if (value===undefined||['function','symbol','bigint'].includes(typeof value)) issue(issues,'NON_JSON_VALUE',path,'Descriptor must contain only JSON values; binary payloads use references.');
  if (value&&typeof value==='object') {
    if(Array.isArray(value)) for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) issue(issues,'NON_JSON_VALUE',pointer(path,i),'Sparse array holes are not JSON values.');
    if (seen.has(value)) {issue(issues,'CYCLIC_VALUE',path,'Descriptor cannot contain object cycles.');return;}
    if (!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null) {issue(issues,'NON_JSON_VALUE',path,'Descriptor must contain plain JSON objects, not runtime handles.');return;}
    seen.add(value);for(const [k,v] of Object.entries(value)) jsonValue(v,pointer(path,k),issues,seen);seen.delete(value);
  }
}
const registeredSchemas = registry => Array.isArray(registry?.schemas)?registry.schemas:[];
function schemaKnown(ref,registry) {return registeredSchemas(registry).some(s=>s?.schemaId===ref?.schemaId&&s?.schemaVersion===ref?.schemaVersion);}
function requiredSchema(ref,path,registry,unknown) {
  if(ref?.schemaId&&ref?.schemaVersion&&!schemaKnown(ref,registry)) unknown.push({schemaId:ref.schemaId,schemaVersion:ref.schemaVersion,fieldPath:path});
}
function extensionSchemas(value,registry,unknown) {
  for(const [key,entry] of Object.entries(value?.extensions??{})) if(entry?.requiredForUse===true) requiredSchema(entry,`/extensions/${esc(key)}`,registry,unknown);
}
function rank(tensor,path,issues) {
  if(Array.isArray(tensor?.shape)&&Array.isArray(tensor?.axes)&&tensor.shape.length!==tensor.axes.length) issue(issues,'TENSOR_RANK_MISMATCH',path,'axes and shape must have the same rank.');
}
function frames(indices,times,path,issues) {
  if(times!==undefined&&Array.isArray(indices)&&(!Array.isArray(times)||times.length!==indices.length)) issue(issues,'FRAME_TIMES_LENGTH',path,'Frame timestamps must have exactly one entry per source index.');
}
function strictKeys(value,allowed,path,issues) {if(object(value)) for(const k of Object.keys(value)) if(!allowed.includes(k)) issue(issues,'STRICT_NATIVE_FIELD',pointer(path,k),'Manager extensions belong outside strict native fields.');}
function g1cMetadata(value,registry,issues) {
  const native=value?.native;
  if(!registeredSchemas(registry).some(s=>s?.schemaId===native?.schemaId&&s?.schemaVersion===native?.schemaVersion&&s.g1cMetadata===true)) return;
  const m=native.metadata??{},context=m.context,latent=m.latentContract;
  if(context!==undefined) {
    strictKeys(context,['schemaVersion','contextId','inputId','inputSha256','slotId','sourceFrameIndices','sourceFrameTimesSeconds'],'/native/metadata/context',issues);
    const ctxSchema={type:'object',required:['schemaVersion','contextId','inputId','inputSha256','slotId','sourceFrameIndices'],properties:{schemaVersion:{const:1},contextId:{type:'string',minLength:1},inputId:{type:'string',minLength:1},inputSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},slotId:{type:'string',minLength:1},sourceFrameIndices:{type:'array',minItems:1,items:{type:'integer',minimum:0}},sourceFrameTimesSeconds:{type:'array',items:{type:'number',minimum:0}}}};
    inspect(ctxSchema,context,'/native/metadata/context',{},issues);frames(context?.sourceFrameIndices,context?.sourceFrameTimesSeconds,'/native/metadata/context/sourceFrameTimesSeconds',issues);
    const sourceFrames=value.lineage.sourceFrames.filter(f=>f.inputId===context?.inputId&&f.slotId===context?.slotId);
    const sameArray=(a,b)=>a===undefined&&b===undefined||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
    if(!value.lineage.inputs.includes(context?.inputId)||!sourceFrames.length||sourceFrames.some(f=>!sameArray(f.indices,context.sourceFrameIndices)||!sameArray(f.timesSeconds,context.sourceFrameTimesSeconds))) issue(issues,'NATIVE_CONTEXT_MAPPING_MISMATCH','/lineage/sourceFrames','G1C input/slot and every source frame index/timestamp must be retained in common lineage in the same order.');
  }
  if(latent!==undefined) {
    const path='/native/metadata/latentContract';
    strictKeys(latent,['schemaVersion','representation','space','vaeModelSha256','producerModelSha256s','normalization'],path,issues);
    strictKeys(latent?.normalization,['id','state','owner'],`${path}/normalization`,issues);
    const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
    inspect({type:'object',required:['schemaVersion','representation','space','vaeModelSha256','producerModelSha256s','normalization'],properties:{schemaVersion:{const:1},representation:{const:'generated-sample'},space:{const:'raw'},vaeModelSha256:sha,producerModelSha256s:{type:'array',minItems:1,items:sha},normalization:{type:'object',required:['id','state','owner'],properties:{id:{const:'wan21-comfy-f32-v1'},state:{const:'restored'},owner:{const:'diffusion_models'}}}}},latent,path,{},issues);
    const sampleMeaning='wan21-raw-generated-sample:v1';
    if(value.tensor?.nativeMeaning!==sampleMeaning||m.meaning!==undefined&&m.meaning!==sampleMeaning) issue(issues,'NATIVE_MEANING_MISMATCH','/tensor/nativeMeaning','G1C generated sample meaning is exactly wan21-raw-generated-sample:v1; declarations cannot relabel it as a mean.');
    const decoders=value.provenance.consumerBindings.filter(identity=>identity.identityKind==='model'&&identity.role==='decoder'&&identity.algorithm==='sha256');
    if(!decoders.length||decoders.some(identity=>identity.value!==latent?.vaeModelSha256)) issue(issues,'NATIVE_DECODER_BINDING_MISMATCH','/provenance/consumerBindings','G1C native decoder VAE identity must be preserved separately as a model/decoder SHA-256 consumer binding.');
    const producers=latent?.producerModelSha256s;
    const commonProducers=value.provenance.producerRefs.filter(identity=>identity.identityKind==='model'&&identity.role==='producer'&&identity.algorithm==='sha256').map(identity=>identity.value);
    if(Array.isArray(producers)&&(commonProducers.length!==producers.length||commonProducers.some((hash,i)=>hash!==producers[i]))) issue(issues,'NATIVE_PRODUCER_MAPPING_MISMATCH','/provenance/producerRefs','All G1C native producer model SHA-256 identities must be retained in the same order; other identity roles remain separate.');
    if(Array.isArray(producers)&&producers.includes(latent?.vaeModelSha256)) issue(issues,'PRODUCER_DECODER_COLLISION',`${path}/producerModelSha256s`,'G1C VAE hash cannot replace generation provenance.');
    if(Array.isArray(producers)&&new Set(producers).size!==producers.length) issue(issues,'DUPLICATE_PRODUCER',`${path}/producerModelSha256s`,'G1C producer model hashes must be unique.');
    if(m.modelSha256!==undefined&&Array.isArray(producers)&&!producers.includes(m.modelSha256)) issue(issues,'PRODUCER_MISMATCH','/native/metadata/modelSha256','modelSha256 must identify one of the generated sample producers.');
  } else if(value.tensor?.nativeMeaning==='wan21-raw-generated-sample:v1'||m.meaning==='wan21-raw-generated-sample:v1') issue(issues,'REQUIRED_NATIVE_METADATA_MISSING','/native/metadata/latentContract','G1C generated sample requires its separate latent contract.');
}
function validate(name,value,registry,extra) {
  const issues=[],unknownRequiredSchemas=[];
  jsonValue(value,'',issues);
  if(!issues.some(x=>x.code==='CYCLIC_VALUE')) inspect(schemas[name],value,'',schemas[name],issues);
  if(issues.length===0) {extensionSchemas(value,registry,unknownRequiredSchemas);extra?.(value,registry,issues,unknownRequiredSchemas);}
  return {valid:issues.length===0&&unknownRequiredSchemas.length===0,issues,unknownRequiredSchemas,value};
}
export function validateModuleDescriptor(value,registry) {
  return validate('module',value,registry,(v,r,issues,unknown)=>{
    const ids=new Set();
    v.operations.forEach((op,i)=>{
      if(ids.has(op.operationId)) issue(issues,'DUPLICATE_OPERATION',`/operations/${i}/operationId`,'Operation IDs must be unique within a module.');ids.add(op.operationId);
      op.roles.forEach((role,j)=>{if(!Array.isArray(r?.roles)||!r.roles.includes(role)) issue(issues,'UNKNOWN_ROLE',`/operations/${i}/roles/${j}`,'Role must be explicitly registered; module names do not define roles.');});
      op.semanticSchemaRefs.forEach((s,j)=>requiredSchema(s,`/operations/${i}/semanticSchemaRefs/${j}`,r,unknown));
      for(const side of ['inputPorts','outputPorts']) {const ports=new Set();op[side].forEach((p,j)=>{const path=`/operations/${i}/${side}/${j}`;if(ports.has(p.portId)) issue(issues,'DUPLICATE_PORT',`${path}/portId`,'Port IDs must be unique per operation side.');ports.add(p.portId);rank(p.tensor,`${path}/tensor`,issues);requiredSchema(p.semantics,`${path}/semantics`,r,unknown);p.requiredExtensionSchemas.forEach((s,k)=>requiredSchema(s,`${path}/requiredExtensionSchemas/${k}`,r,unknown));});}
    });
  });
}
export function validateArtifactDescriptor(value,registry) {
  return validate('artifact',value,registry,(v,r,issues,unknown)=>{requiredSchema(v.native,'/native',r,unknown);requiredSchema(v.semantics,'/semantics',r,unknown);rank(v.tensor,'/tensor',issues);v.lineage.sourceFrames.forEach((f,i)=>frames(f.indices,f.timesSeconds,`/lineage/sourceFrames/${i}/timesSeconds`,issues));g1cMetadata(v,r,issues);});
}
export function validatePipelineProfile(value,registry) {
  return validate('pipeline-profile',value,registry,(v,r,issues)=>{
    const steps=new Set(),available=new Set(v.externalArtifactRefs),producers=new Set(v.externalArtifactRefs);
    if(available.size!==v.externalArtifactRefs.length) issue(issues,'DUPLICATE_ARTIFACT','/externalArtifactRefs','External artifact IDs must be unique.');
    v.steps.forEach((step,i)=>{
      if(steps.has(step.stepId)) issue(issues,'DUPLICATE_STEP',`/steps/${i}/stepId`,'Step IDs must be unique.');steps.add(step.stepId);
      step.inputBindings.forEach((b,j)=>{if(!available.has(b.artifactRef)) issue(issues,'UNRESOLVED_ARTIFACT',`/steps/${i}/inputBindings/${j}/artifactRef`,'Input must resolve to an external input or one earlier step output; cycles and forward references are forbidden.');});
      step.outputBindings.forEach((b,j)=>{if(producers.has(b.artifactRef)) issue(issues,'MULTIPLE_PRODUCERS',`/steps/${i}/outputBindings/${j}/artifactRef`,'Artifact ID already has an external or step producer.');producers.add(b.artifactRef);available.add(b.artifactRef);});
    });
  });
}
export function validateExecutionSnapshot(value,registry) {
  return validate('execution-snapshot',value,registry,(v,r,issues)=>{const seen=new Set();v.stepBindings.forEach((s,i)=>{if(seen.has(s.stepId)) issue(issues,'DUPLICATE_STEP',`/stepBindings/${i}/stepId`,'Snapshot binds each step once.');seen.add(s.stepId);});});
}
export function validateEdgeDecision(value,registry) {return validate('edge-decision',value,registry);}

export function validatePortContract(value,registry) {
  const issues=[],unknownRequiredSchemas=[];jsonValue(value,'',issues);
  if(issues.length===0) inspect(schemas.module.$defs.port,value,'',schemas.module,issues);
  if(issues.length===0) {rank(value.tensor,'/tensor',issues);requiredSchema(value.semantics,'/semantics',registry,unknownRequiredSchemas);value.requiredExtensionSchemas.forEach((s,i)=>requiredSchema(s,`/requiredExtensionSchemas/${i}`,registry,unknownRequiredSchemas));}
  return {valid:issues.length===0&&unknownRequiredSchemas.length===0,issues,unknownRequiredSchemas,value};
}
