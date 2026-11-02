import {validatePipelineProfile} from './descriptor.mjs';
import {deriveWorkflowShapes} from './workflow-shapes.mjs';
import {bindWorkflowRequirement} from './adapters/workflow-normal-requests.mjs';

/** Additive management proposal. This is a structural plan, not a native API,
 * numeric verifier, owner capability declaration or generation-ready proof. */
export const PIPELINE_PLAN_VERSION='works-standalone-pipeline/1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const text=value=>typeof value==='string'&&value.length>0;
const esc=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const problem=(code,fieldPath,reason)=>({code,fieldPath,reason});
function invalid(issues){throw Object.assign(new TypeError('Pipeline structure is invalid; no owner may be queried.'),{code:'PIPELINE_INVALID',issues});}
function freeze(value){if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)&&!(value instanceof ArrayBuffer)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function jsonCopy(value,path,seen=new Set()){
  // Common descriptor extensions/native metadata may retain owned binary
  // masks. Only structural containers freeze; JS cannot freeze typed elements.
  if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return structuredClone(value);
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value)))return value;
  if(!Array.isArray(value)&&!object(value)||seen.has(value))invalid([problem('INVALID_EXTERNAL_DESCRIPTOR',path,'External descriptors must be finite acyclic metadata or owned binary arrays; native tensor payloads stay outside the plan.')]);
  seen.add(value);
  const entries=Object.entries(value).map(([key,item])=>[key,jsonCopy(item,`${path}/${esc(key)}`,seen)]);
  const result=Array.isArray(value)?entries.map(([,item])=>item):Object.fromEntries(entries);
  if(Array.isArray(value)&&entries.length!==value.length)invalid([problem('INVALID_EXTERNAL_DESCRIPTOR',path,'Sparse descriptor arrays are not supported.')]);
  seen.delete(value);return result;
}
function conditionFor(step,selections){
  if(!step.when)return {state:'ACTIVE'};
  const {selection,equals}=step.when;
  if(!Object.hasOwn(selections,selection))return {state:'SELECTION_UNCONFIRMED',selection,equals};
  const actual=selections[selection];
  return {state:actual===equals?'ACTIVE':step.bypass?'BYPASSED':'SKIPPED',selection,equals,actual};
}

/** Compile a finite PipelineProfile before asking any owner about execution.
 *
 * externalInputs: artifactRef -> {descriptor: common Artifact, tensor: native
 * tensor}. Missing declared inputs remain INPUT_UNCONFIRMED; undeclared refs
 * fail. Tensor data and runtime/File handles are deliberately not retained.
 *
 * Additive fields: step.when={selection,equals: JSON scalar}; a conditional
 * step may supply step.bypass={outputPortId:inputPortId} for every output.
 * False without bypass is SKIPPED (no implicit tensor conversion). Optional
 * profile.finalArtifactRefs selects ordered outputs, otherwise sink outputs
 * are selected in their original declaration order. Existing diagnostics and
 * their requiredEvidenceScopes are preserved without becoming normal gates.
 */
export function compilePipeline(profile,{externalInputs={},selections={},registry}={}){
  // The existing validator intentionally accepts only ordered profiles. Keep
  // its schema/identity checks and defer only ordering until graph resolution.
  const validation=validatePipelineProfile(profile,registry);
  const schemaIssues=validation.issues.filter(entry=>entry.code!=='UNRESOLVED_ARTIFACT');
  for(const entry of validation.unknownRequiredSchemas)schemaIssues.push(problem('UNKNOWN_REQUIRED_SCHEMA',entry.fieldPath,`Required schema ${entry.schemaId}@${entry.schemaVersion} is not registered.`));
  if(schemaIssues.length)invalid(schemaIssues);
  const issues=[];
  if(!object(externalInputs))issues.push(problem('INVALID_EXTERNAL_INPUTS','/externalInputs','External inputs must be an artifactRef-keyed record.'));
  if(!object(selections))issues.push(problem('INVALID_SELECTIONS','/selections','Selections must be a plain JSON scalar record.'));
  if(issues.length)invalid(issues);
  for(const [key,value]of Object.entries(selections))if(!text(key)||!(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value))))issues.push(problem('INVALID_SELECTIONS',`/selections/${esc(key)}`,'Selection values must be JSON scalars.'));

  const steps=new Map(profile.steps.map((step,index)=>[step.stepId,{step,index}]));
  const sources=new Map(profile.externalArtifactRefs.map(artifactRef=>[artifactRef,{kind:'external',artifactRef}]));
  let workflowShapePlan=null;
  if(Object.hasOwn(profile,'workflowShapeRequest')){
    try{workflowShapePlan=deriveWorkflowShapes(profile.workflowShapeRequest);}catch(error){issues.push(problem('WORKFLOW_SHAPE_REQUEST_INVALID','/workflowShapeRequest',error.message));}
  }
  const workflowRequirements=new Set(workflowShapePlan?.requirements.map(requirement=>requirement.requirementId)??[]);
  for(const artifactRef of Object.keys(externalInputs))if(!sources.has(artifactRef))issues.push(problem('UNDECLARED_EXTERNAL_INPUT',`/externalInputs/${esc(artifactRef)}`,'Live input is not a declared external artifact.'));
  for(const {step,index}of steps.values()){
    for(const side of ['inputBindings','outputBindings']){
      const ports=new Set();
      step[side].forEach((binding,j)=>{
        if(ports.has(binding.portId))issues.push(problem('DUPLICATE_PORT',`/steps/${index}/${side}/${j}/portId`,'Port IDs must be unique on each side of a step.'));
        ports.add(binding.portId);
        if(side==='inputBindings'&&Object.hasOwn(binding,'workflowRequirementId')&&(!text(binding.workflowRequirementId)||!workflowRequirements.has(binding.workflowRequirementId)))issues.push(problem('UNRESOLVED_WORKFLOW_REQUIREMENT',`/steps/${index}/${side}/${j}/workflowRequirementId`,'Port must reference a requirement derived by the supplied workflowShapeRequest.'));
      });
    }
    for(const binding of step.outputBindings)sources.set(binding.artifactRef,{kind:'step',artifactRef:binding.artifactRef,stepId:step.stepId,portId:binding.portId});
    if(Object.hasOwn(step,'when')){
      const when=step.when,value=when?.equals;
      if(!object(when)||!text(when.selection)||!Object.hasOwn(when,'equals')||!(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value))))issues.push(problem('INVALID_CONDITION',`/steps/${index}/when`,'when requires a selection name and JSON scalar equals value.'));
    }
    if(Object.hasOwn(step,'bypass')){
      const inputs=new Set(step.inputBindings.map(binding=>binding.portId)),outputs=new Set(step.outputBindings.map(binding=>binding.portId));
      if(!step.when||!object(step.bypass)||Object.keys(step.bypass).length!==outputs.size||Object.entries(step.bypass).some(([out,input])=>!outputs.has(out)||!inputs.has(input)))issues.push(problem('INVALID_BYPASS',`/steps/${index}/bypass`,'Conditional bypass must explicitly map every declared output port to an existing input port.'));
    }
  }
  const dependencies=new Map(),consumers=new Set();
  for(const {step,index}of steps.values()){
    const deps=new Set();
    step.inputBindings.forEach((binding,j)=>{
      const source=sources.get(binding.artifactRef);
      if(!source)issues.push(problem('UNRESOLVED_ARTIFACT',`/steps/${index}/inputBindings/${j}/artifactRef`,'Input is neither a declared external artifact nor a produced step output.'));
      else if(source.kind==='step')deps.add(source.stepId);
      consumers.add(binding.artifactRef);
    });dependencies.set(step.stepId,[...deps]);
  }
  const requestedFinals=Object.hasOwn(profile,'finalArtifactRefs')?profile.finalArtifactRefs:profile.steps.flatMap(step=>step.outputBindings.map(binding=>binding.artifactRef)).filter(ref=>!consumers.has(ref));
  if(!Array.isArray(requestedFinals)||requestedFinals.some(ref=>!text(ref)||!sources.has(ref))||new Set(requestedFinals).size!==requestedFinals.length)issues.push(problem('INVALID_FINAL_REF','/finalArtifactRefs','Final references must be unique declared or produced artifact IDs.'));
  if(issues.length)invalid(issues);

  // Kahn layers retain original declaration order inside each independent
  // layer. A blocked external input therefore cannot erase another DAG branch.
  const pending=new Set(steps.keys()),resolved=new Set(),layers=[];
  while(pending.size){
    const layer=[...pending].filter(id=>dependencies.get(id).every(dep=>resolved.has(dep)));
    if(!layer.length)invalid([problem('PIPELINE_CYCLE','/steps','Pipeline contains a cycle among: '+[...pending].join(', '))]);
    layers.push(layer);for(const id of layer){pending.delete(id);resolved.add(id);}
  }
  const topologicalOrder=layers.flat(),orderedProfile=structuredClone({...profile,steps:topologicalOrder.map(id=>steps.get(id).step)});
  const orderedValidation=validatePipelineProfile(orderedProfile,registry);
  if(!orderedValidation.valid)invalid(orderedValidation.issues);

  const externalBindings=Object.fromEntries(profile.externalArtifactRefs.map(artifactRef=>{
    const record=externalInputs[artifactRef],descriptor=record?.descriptor;
    const binding={artifactRef,state:descriptor!==undefined&&descriptor!==null&&record?.tensor!==undefined&&record?.tensor!==null?'AVAILABLE':'INPUT_UNCONFIRMED'};
    if(descriptor!==undefined&&descriptor!==null)binding.descriptor=jsonCopy(descriptor,`/externalInputs/${esc(artifactRef)}/descriptor`);
    return [artifactRef,binding];
  }));
  const compiledSteps=topologicalOrder.map(id=>{
    const step=structuredClone(steps.get(id).step);
    return {...step,dependencies:dependencies.get(id),condition:conditionFor(step,selections),bypassBindings:Object.entries(step.bypass??{}).map(([outputPortId,inputPortId])=>({outputPortId,inputPortId})),inputBindings:step.inputBindings.map(binding=>{
      const source={...sources.get(binding.artifactRef)};
      if(source.kind==='external')source.state=externalBindings[binding.artifactRef].state;
      return {...binding,source};
    })};
  });
  return freeze({schemaVersion:PIPELINE_PLAN_VERSION,profile:orderedProfile,steps:compiledSteps,topologicalOrder,layers,externalBindings,finalArtifactRefs:[...requestedFinals],workflowShapePlan});
}

/** Resolve scalar or named operation ports through the existing shared metadata
 * bridge. The caller must still query the operation's real owner using the
 * returned descriptor; geometry alone never establishes owner capability. */
export function resolvePipelineWorkflowRequest({shapePlan,step,descriptor}={}){
  if(!Array.isArray(step?.inputBindings)||!object(descriptor))throw TypeError('Compiled step and normal operation descriptor required');
  const bindings=step.inputBindings.filter(binding=>Object.hasOwn(binding,'workflowRequirementId'));
  if(!bindings.length)return {status:'BOUND',descriptor:structuredClone(descriptor),requirements:[],reasons:[]};
  if(!Array.isArray(shapePlan?.requirements))throw TypeError('Workflow-bound step requires the derived shared shape plan');
  const requirementsById=new Map(shapePlan.requirements.map(requirement=>[requirement.requirementId,requirement])),merged=structuredClone(descriptor),requirements=[];
  const named=Object.hasOwn(merged,'artifacts');
  for(const binding of bindings){
    const requirement=requirementsById.get(binding.workflowRequirementId);
    if(!requirement)throw TypeError('Compiled workflow requirement no longer resolves');
    const artifact=named?merged.artifacts?.[binding.portId]:merged.artifact;
    const entry=bindWorkflowRequirement(requirement,{...merged,artifact},{fieldPath:'/inputBindings/'+esc(binding.portId)+'/workflowRequirementId'});
    requirements.push({...entry,portId:binding.portId});
    if(entry.status==='BOUND'){
      if(named)merged.artifacts[binding.portId]=entry.descriptor.artifact;else merged.artifact=entry.descriptor.artifact;
    }
  }
  const rejected=requirements.find(entry=>entry.status==='NOT_QUERIED');
  if(rejected){
    const admission=rejected.inputAdmission;
    const fieldPath=named?admission.fieldPath.replace('/artifact','/artifacts/'+esc(rejected.portId)):admission.fieldPath;
    return {status:'BLOCKED',descriptor:merged,requirements,reasons:[{code:admission.code,fieldPath,reason:'Workflow requirement conflicts with the explicitly declared operation input.',expected:admission.expected,observed:admission.observed}]};
  }
  const unresolved=requirements.filter(entry=>entry.status==='UNVERIFIED');
  if(unresolved.length)return {status:'INPUT_UNCONFIRMED',descriptor:merged,requirements,reasons:unresolved.flatMap(entry=>entry.reasons)};
  if(requirements.every(entry=>entry.status==='NOT_REQUIRED'))return {status:'NOT_REQUIRED',descriptor:merged,requirements,reasons:requirements.flatMap(entry=>entry.reasons)};
  if(requirements.some(entry=>entry.status==='NOT_REQUIRED'))return {status:'INPUT_UNCONFIRMED',descriptor:merged,requirements,reasons:[problem('WORKFLOW_OPTIONAL_PORT_ABSENT','/inputBindings','A named required operation port maps to an absent workflow input; choose an explicit bypass or another operation.')]};
  return {status:'BOUND',descriptor:merged,requirements,reasons:[]};
}
