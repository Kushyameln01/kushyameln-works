import {queryWorkflowRequirements} from './workflow-normal-requests.mjs';

const text=value=>typeof value==='string'&&value.length>0;

/** Explicit scalar workflow routes. Owner descriptor factories own all native
 * meanings/model/decoder/context metadata; the shared bridge owns geometry. */
export async function queryWorkflowOwners({shapePlan,bindings}={}){
  if(!Array.isArray(shapePlan?.requirements)||!Array.isArray(bindings)) throw new TypeError('A shared shape plan and explicit owner bindings are required');
  const requirementsById=new Map();
  for(const requirement of shapePlan.requirements){
    if(!text(requirement?.requirementId)||requirementsById.has(requirement.requirementId)) throw new TypeError('Unique workflow requirement identities are required');
    requirementsById.set(requirement.requirementId,requirement);
  }
  const routes=new Map();
  for(const binding of bindings){
    if(!text(binding?.requirementId)||routes.has(binding.requirementId)||!requirementsById.has(binding.requirementId)||typeof binding.owner?.querySupport!=='function') throw new TypeError('Each route needs a unique existing requirement and an owner querySupport');
    const direct=binding.descriptor!==undefined,factory=typeof binding.createDescriptor==='function';
    if(direct===factory||factory&&!text(binding.operationId)) throw new TypeError('Provide a descriptor or an explicit operation and descriptor factory');
    routes.set(binding.requirementId,binding);
  }
  const requirements=[];
  for(const requirement of shapePlan.requirements){
    const binding=routes.get(requirement.requirementId);
    let descriptor=binding?.descriptor;
    if(binding?.createDescriptor&&requirement.state==='known'){
      descriptor=await binding.createDescriptor({requirement,supply:binding.supply,operationId:binding.operationId});
      if(descriptor?.operationId!==binding.operationId) throw new TypeError('Descriptor factory must retain the explicitly selected operation');
    }
    const result=await queryWorkflowRequirements({shapePlan:{...shapePlan,requirements:[requirement]},bindings:binding?[{requirementId:requirement.requirementId,descriptor}]:[],queryOwner:merged=>binding.owner.querySupport(merged)});
    let entry=result.requirements[0];
    // Rebase only bridge-generated local paths; shared and owner reasons stay opaque.
    if(!Object.hasOwn(entry,'ownerResponse')&&entry.reasons!==requirement.issues&&entry.reasons?.some(reason=>reason.fieldPath==='/requirements/0')) entry={...entry,reasons:entry.reasons.map(reason=>reason.fieldPath==='/requirements/0'?{...reason,fieldPath:'/requirements/'+requirements.length}:reason)};
    requirements.push(entry);
  }
  return {shapePlan,requirements,generationReady:false};
}
