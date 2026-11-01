// Metadata bridge only. Geometry comes from workflow-shapes; support comes from owner.
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0;
const reason=(code,fieldPath,detail)=>({code,fieldPath,reason:detail});
const geometryKnown=r=>{
  if(!Array.isArray(r.shape)||!r.shape.length||!text(r.dtype)||!Array.isArray(r.axes)||r.axes.length!==r.shape.length) return false;
  for(let i=0;i<r.shape.length;i++) if(!Number.isSafeInteger(r.shape[i])||r.shape[i]<=0||!text(r.axes[i])) return false;
  return true;
};
const equal=(a,b)=>{
  if(a===b) return true;
  if(Array.isArray(a)||Array.isArray(b)) return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
  if(!record(a)||!record(b)) return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));
};

/** Query actual owner contracts for explicit, known workflow requirements. */
export async function queryWorkflowRequirements({shapePlan,bindings,queryOwner}={}){
  if(!record(shapePlan)||!Array.isArray(shapePlan.requirements)||!Array.isArray(bindings)||typeof queryOwner!=='function') throw new TypeError('shapePlan.requirements, bindings and queryOwner are required');
  const byId=new Map();
  for(const binding of bindings){
    if(!record(binding)||!text(binding.requirementId)||byId.has(binding.requirementId)) throw new TypeError('Bindings require unique requirementId values');
    byId.set(binding.requirementId,binding.descriptor);
  }
  const seen=new Set(),requirements=[];
  for(const r of shapePlan.requirements){
    if(!record(r)||!text(r.requirementId)||seen.has(r.requirementId)||!['known','unknown','absent'].includes(r.state)) throw new TypeError('Requirements need unique identities and explicit states');
    seen.add(r.requirementId);
    const entry={...r,required:r.state!=='absent'};
    if(r.state==='absent'){
      requirements.push({...entry,status:'NOT_REQUIRED',reasons:r.issues??[]});
      continue;
    }
    if(r.state!=='known'||!geometryKnown(r)){
      requirements.push({...entry,status:'UNVERIFIED',reasons:r.issues?.length?r.issues:[reason('WORKFLOW_REQUIREMENT_UNKNOWN',`/requirements/${requirements.length}`,'Required workflow geometry is unresolved')]});
      continue;
    }
    const d=byId.get(r.requirementId);
    if(!record(d)||!record(d.artifact)||!record(d.artifact.tensor)){
      requirements.push({...entry,status:'UNVERIFIED',reasons:[reason('WORKFLOW_REQUIREMENT_UNBOUND',`/requirements/${requirements.length}`,'No explicit normal descriptor is bound to this requirement')]});
      continue;
    }
    const conflict=[
      [r.shape,d.artifact.tensor.shape,'/artifact/tensor/shape'],
      [r.dtype,d.artifact.tensor.dtype,'/artifact/tensor/dtype'],
      [r.axes,d.artifact.tensor.axes,'/artifact/tensor/axes'],
      [r.meaning,d.artifact.tensor.nativeMeaning,'/artifact/tensor/nativeMeaning'],
      [r.normalization,d.artifact.semantics?.normalization,'/artifact/semantics/normalization']
    ].find(([expected,observed])=>expected!==null&&expected!==undefined&&observed!==undefined&&!equal(expected,observed));
    if(conflict){
      const [expected,observed,fieldPath]=conflict;
      requirements.push({...entry,descriptor:d,ownerResponse:null,status:'NOT_QUERIED',inputAdmission:{state:'REJECTED',code:'WORKFLOW_BINDING_CONTRACT_MISMATCH',fieldPath,expected,observed}});
      continue;
    }
    const descriptor={...d,artifact:{...d.artifact,tensor:{...d.artifact.tensor,...(d.artifact.tensor.shape===undefined?{shape:r.shape.slice()}:{}),...(d.artifact.tensor.dtype===undefined?{dtype:r.dtype}:{}),...(d.artifact.tensor.axes===undefined?{axes:r.axes.slice()}: {})}}};
    const ownerResponse=await queryOwner(descriptor);
    requirements.push({...entry,descriptor,ownerResponse,status:ownerResponse?.status,reasons:ownerResponse?.reasons});
  }
  return {shapePlan,requirements,generationReady:false};
}
