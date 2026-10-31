import {evaluateEdge} from './compatibility.mjs';
import {isVerifiedReferenceSet} from './reference-loader.mjs';
import {canonicalize} from './canonical.mjs';
const clone=structuredClone;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const same=(a,b)=>{try{return canonicalize(a)===canonicalize(b);}catch{return false;}};
const fail=(code,message,decision)=>Object.assign(Error(message),{code,...(decision?{decision}:{} )});
export const NORM_EXECUTION_POLICIES=freeze({
 'lora-q16':{policyId:'lora-q16',requiredNormIds:['N-IDENTITY','N-LOADER','N-MAPPING','N-NUMERIC','N-EVIDENCE','N-TRANSACTION']},
 'rect-decode':{policyId:'rect-decode',requiredNormIds:['N-IDENTITY','N-SHAPE','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT']},
 'rect-mean':{policyId:'rect-mean',requiredNormIds:['N-IDENTITY','N-SHAPE','N-NORMALIZATION','N-NUMERIC','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT']}
});
const publicationScopes=new Set(['norm:N-TRANSACTION','norm:N-ARTIFACT']);
/** Ordered evidence composition only. evaluateEdge remains the sole judge.
 * Explicit wrappers obtain observations from their actual public owner calls;
 * this helper never imports a native runtime or evaluates reference JSON. */
export function createNormExecution({policyId,referenceSet,edgeInput}={}){
 const policy=Object.hasOwn(NORM_EXECUTION_POLICIES,policyId)?NORM_EXECUTION_POLICIES[policyId]:null;if(!policy)throw fail('UNKNOWN_NORM_POLICY','Select an implemented norm execution policy');
 if(!isVerifiedReferenceSet(referenceSet)||!edgeInput||!edgeInput.referenceContext)throw fail('NORM_INPUT_REQUIRED','Verified ReferenceSet and complete predeclared edge inputs are mandatory');
 if(edgeInput.requiredNormPolicy!==undefined||edgeInput.referenceContext.phase!==undefined)throw fail('NORM_PHASE_OWNED','Execution phase and required policy belong to the mandatory entry');
 if(!Array.isArray(edgeInput.evidence)||edgeInput.evidence.length||Object.values(edgeInput.referenceContext.delegations??{}).some(d=>d?.receiptRef!==undefined||d?.receipt!==undefined))throw fail('FUTURE_NORM_RECEIPT','No numerical or transaction receipt may be supplied before its native operation');
 const {referenceSet: supplied,...context}=edgeInput.referenceContext;if(supplied!==undefined&&supplied!==referenceSet)throw fail('NORM_INPUT_REQUIRED','ReferenceSet identity differs from this execution');
 const captured=freeze(clone({...edgeInput,referenceContext:context})),numericScopes=new Set([...(captured.referenceContext.numericRequirements??[]).map(r=>r.scope),...captured.requiredScopes??[],'norm:N-EVIDENCE']);
 let phase='declaration',validated=null,published=null,publicationObserved=false,failure=null;const decisions=[];
 function observation(value,due){
  if(!value||!Array.isArray(value.evidence)||value.evidence.length===0)throw fail('NORM_RECEIPT_REQUIRED','Actual phase evidence is required');
  const allowed=due==='published'?publicationScopes:numericScopes;
  if(value.evidence.some(e=>!allowed.has(e?.scope))||Object.keys(value.delegations??{}).some(k=>due==='published'?!['N-TRANSACTION','N-ARTIFACT'].includes(k):k!=='N-EVIDENCE'))throw fail('FUTURE_NORM_RECEIPT','A receipt is not due in this execution phase');
  for(const key of Object.keys(value))if(!['evidence','delegations','evidenceTarget','managerState','activeBindings','resourceState'].includes(key))throw fail('NORM_DECLARATION_IMMUTABLE','Phase observations cannot rewrite predeclared contracts, gates or references');
  if(value.evidenceTarget!==undefined&&!same(value.evidenceTarget,captured.referenceContext.evidenceTarget))throw fail('NORM_DECLARATION_IMMUTABLE','Actual evidence cannot relabel the predeclared base/reference/scope/coverage');
  if(due!=='published'&&value.managerState!==undefined)throw fail('FUTURE_NORM_RECEIPT','Publication state is not available during validation');
  const {activeBindings,resourceState,...receipts}=value;return {receipts:freeze(clone(receipts)),runtime:{...(activeBindings!==undefined?{activeBindings:clone(activeBindings)}:{}),...(resourceState!==undefined?{resourceState:clone(resourceState)}:{})}};
 }
 function evaluate(at,observed,runtime={}){
  if(runtime.activeBindings){const selected=value=>Object.fromEntries(Object.entries(value??{}).filter(([key])=>!['valid','currentRevision','leaseCurrent'].includes(key)));for(const side of new Set([...Object.keys(captured.activeBindings??{}),...Object.keys(runtime.activeBindings)]))if(!same(selected(captured.activeBindings?.[side]),selected(runtime.activeBindings[side])))throw fail('NORM_BINDING_COHORT_MISMATCH','Live observations cannot replace the selected binding identity or expected revision');}
  const q=clone(captured);q.requiredNormPolicy=clone(policy);q.referenceContext={...q.referenceContext,referenceSet,phase:at};
  const all=[...(validated?[validated]:[]),...(observed?[observed]:[])];q.evidence=all.flatMap(o=>clone(o.evidence));
  for(const o of all){if(o.delegations)q.referenceContext.delegations={...q.referenceContext.delegations,...clone(o.delegations)};if(o.evidenceTarget)q.referenceContext.evidenceTarget=clone(o.evidenceTarget);if(o.managerState)q.referenceContext.managerState=clone(o.managerState);}
  Object.assign(q,runtime);const decision=evaluateEdge(q);decisions.push(freeze({phase:at,decision:clone(decision)}));
  if(decision.readiness.state!=='ready')throw fail(`NORM_${at.toUpperCase()}_BLOCKED`,`Norm ${at} admission is blocked`,decision);return decision;
 }
 const poison=error=>{failure??=freeze({code:error?.code??'NORM_OWNER_VALIDATION_FAILED',message:String(error?.message??error)});};
 const healthy=()=>{if(failure)throw fail('NORM_EXECUTION_FAILED','This selected validation cohort has already failed');};
 const initial=evaluate('declaration');
 return Object.freeze({
  declaration(runtime={}){healthy();if(phase!=='declaration'||publicationObserved)throw fail('NORM_PHASE_ORDER','Declaration must precede actual validation');if(Object.keys(runtime).some(k=>!['activeBindings','resourceState'].includes(k)))throw fail('NORM_DECLARATION_IMMUTABLE','Only live bindings and resource state may be refreshed');return evaluate('declaration',null,clone(runtime));},
  failValidation(error){if(!publicationObserved)poison(error);},
  assertDeclaration(){healthy();if(phase!=='declaration'||publicationObserved)throw fail('NORM_PHASE_ORDER','One actual validation observation is allowed per selected cohort');},
  assertValidated(){healthy();if(phase!=='validated'||publicationObserved)throw fail('NORM_PHASE_ORDER','A completed live validation is required before commit');},
  validated(value){healthy();try{if(publicationObserved||phase!=='declaration')throw fail('NORM_PHASE_ORDER','Validation must follow declaration and precede publication');const o=observation(value,'validated'),decision=evaluate('validated',o.receipts,o.runtime);validated=o.receipts;phase='validated';return decision;}catch(error){poison(error);throw error;}},
  published(value){healthy();if(phase!=='validated'&&phase!=='published')throw fail('NORM_PHASE_ORDER','Publication audit requires completed actual validation');const o=observation(value,'published');publicationObserved=true;if(published&&!same(published,o.receipts))throw fail('NORM_RECEIPT_MISMATCH','Recovery must audit the same retained publication receipts');published??=o.receipts;const decision=evaluate('published',published,o.runtime);phase='published';return decision;},
  inspect(){return {policyId,phase,publicationObserved,failure:failure?clone(failure):null,catalogSha256:referenceSet.catalogSha256,initialDecision:clone(initial),decisions:clone(decisions),generationReady:false};}
 });
}
