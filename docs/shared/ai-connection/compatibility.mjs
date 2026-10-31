/** Pure contract decision. No native imports, globals, dispatch or implicit conversion. */
import { validateArtifactDescriptor, validatePortContract } from './descriptor.mjs';
import { compileNormBindings } from './norm-bindings.mjs';

const array = v => Array.isArray(v) ? v : [];
const CONTRACT = 'works-module-contract/1.0-draft.1';
const equal = (a,b) => {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();
  return ka.length===kb.length&&ka.every((k,i)=>k===kb[i]&&equal(a[k],b[k]));
};
const present = x => x !== undefined && x !== null;
const pointer = (o,p) => {
  if (typeof p !== 'string' || !p.startsWith('/')) return undefined;
  for (const k of p.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))) {
    if (!o || !Object.hasOwn(o,k)) return undefined;
    o=o[k];
  }
  return o;
};
const known = (r,s) => Array.isArray(r?.schemas) && r.schemas.some(e=>e?.schemaId===s?.schemaId && e?.schemaVersion===s?.schemaVersion);
const sourceKnown = s => !!s && ((typeof s.repository==='string' && /^[a-f\d]{40}$/i.test(s.commit) && typeof s.path==='string') || (typeof s.archiveRef==='string' && /^[a-f\d]{64}$/i.test(s.sha256)));
const finiteInt = n => Number.isSafeInteger(n) && n>=0;

/**
 * Explicit inputs are mandatory for readiness, even for statically compatible data.
 * Checks use JSON Pointer field paths relative to artifact, or /producerPort etc.
 * See README for evidence binding and the finite adapter-rule descriptor.
 */
export function evaluateEdge({producerPort,consumerPort,artifact,adapters,registry,implementationState,requiredScopes,evidence,resourceState,activeBindings,referenceContext,requiredNormPolicy}={}) {
  const p=producerPort??{},c=consumerPort??{},a=artifact??{};
  const refs=[CONTRACT];
  for(const port of [p,c]) {
    for(const v of [port.sourceRef?.commit,port.sourceRef?.sha256,port.nativeAPI?.version,port.nativeAPI?.build,
      port.semantics && `${port.semantics.schemaId}@${port.semantics.schemaVersion}`,port.profileRef]) if(typeof v==='string') refs.push(v);
  }
  const contractRefs=[...new Set(refs)];
  const checks=[];
  function check(criterion,fieldPath,expected,observed,{unknown=false,code='CONTRACT_MISMATCH',owner=c.owner??'consumer-owner',message,adaptable=false,normId}={}) {
    const outcome=unknown?'unknown':equal(expected,observed)?'match':'mismatch';
    checks.push({criterion,fieldPath,expected:expected??null,observed:observed??null,outcome,
      code:outcome==='unknown'&&code==='CONTRACT_MISMATCH'?'MISSING_DECLARATION':code,reason:message??`${criterion}: ${outcome}`,
      owner,contractRefs:[...contractRefs],evidenceRefs:[],adaptable,...(normId?{normId}:{})});
  }
  for(const [side,port] of [['producerPort',p],['consumerPort',c]]) {
    const portResult=validatePortContract(port,registry);
    for(const i of portResult.issues)check('port-schema',`/${side}${i.fieldPath||'/'}`,true,false,{unknown:i.code==='SCHEMA_REQUIRED'||i.code==='UNKNOWN_SCHEMA',code:i.code,message:i.reason,owner:port.owner});
    for(const f of ['bindingRef','owner','artifactKind','profileRef']) check('declaration',`/${side}/${f}`,true,typeof port[f]==='string'&&port[f].length>0,{unknown:!port[f]});
    check('source',`/${side}/sourceRef`,true,sourceKnown(port.sourceRef),{unknown:!sourceKnown(port.sourceRef)});
    for(const f of ['version','build','transport','entrypoint']) check('native-api',`/${side}/nativeAPI/${f}`,true,typeof port.nativeAPI?.[f]==='string'&&port.nativeAPI[f].length>0,{unknown:!port.nativeAPI?.[f]});
    check('schema',`/${side}/semantics`,true,known(registry,port.semantics),{unknown:!known(registry,port.semantics),code:'UNKNOWN_SCHEMA'});
    for(const f of ['requiredMetadata','requiredIdentities','ownershipModes','transports','allowedAdapterRefs','requiredExtensionSchemas']) check('declaration',`/${side}/${f}`,true,Array.isArray(port[f]),{unknown:!Array.isArray(port[f])});
  }
  check('contract-version','/contractVersion',CONTRACT,a.contractVersion,{unknown:a.contractVersion!==CONTRACT,code:'UNKNOWN_SCHEMA'});
  const validation=validateArtifactDescriptor(a,registry);
  for(const i of validation.issues) {
    check('artifact-schema',i.fieldPath??'/',true,false,{unknown:i.code==='UNKNOWN_SCHEMA'||(i.fieldPath==='/contractVersion'&&a.contractVersion!==CONTRACT),code:i.code??'INVALID_DESCRIPTOR',message:i.reason});
  }
  for(const u of validation.unknownRequiredSchemas??[]) check('schema',u.fieldPath??'/semantics',true,false,{unknown:true,code:'UNKNOWN_SCHEMA',message:`Required schema not interpreted: ${JSON.stringify(u)}`});
  const semanticDefinition=array(registry?.schemas).find(s=>s?.schemaId===a.semantics?.schemaId&&s?.schemaVersion===a.semantics?.schemaVersion);
  if(a.kind==='tensor') {
    check('native-meaning','/tensor/nativeMeaning',true,array(semanticDefinition?.nativeMeanings).includes(a.tensor?.nativeMeaning),{
      unknown:!Array.isArray(semanticDefinition?.nativeMeanings)||!semanticDefinition.nativeMeanings.length,code:'SEMANTIC_MISMATCH',message:'nativeMeaning must be explicitly defined by the selected versioned semantic registry entry'});
  }
  for(const rule of array(semanticDefinition?.nativeAssertions)) {
    check('semantic-native-assertion',`/native/metadata${rule?.metadataPath??''}`,rule?.expected,pointer(a.native?.metadata,rule?.metadataPath),{
      unknown:typeof rule?.metadataPath!=='string'||!rule.metadataPath.startsWith('/'),code:'SEMANTIC_MISMATCH'});
  }
  for(const port of [p,c]) {
    check('artifact-kind','/kind',port.artifactKind,a.kind,{unknown:!present(port.artifactKind),owner:port.owner,code:'ARTIFACT_KIND_MISMATCH'});
    for(const f of new Set(['schemaId','schemaVersion','spaceId','unit','normalization',...array(semanticDefinition?.semanticFields)])) {
      check('semantics',`/semantics/${f}`,port.semantics?.[f],a.semantics?.[f],{unknown:!present(port.semantics?.[f])||!present(a.semantics?.[f]),owner:port.owner,code:'SEMANTIC_MISMATCH',adaptable:port===c && ['spaceId','unit','normalization'].includes(f)});
    }
    check('profile','/profileRef',port.profileRef,a.profileRef,{unknown:!present(a.profileRef)||!present(port.profileRef),owner:port.owner,code:'PROFILE_MISMATCH'});
    for(const path of array(port.requiredMetadata)) check('required-metadata',`/native/metadata${path}`,true,present(pointer(a.native?.metadata,path)),{owner:port.owner,code:'REQUIRED_METADATA_MISSING'});
    for(const expected of array(port.requiredIdentities)) {
      if(!expected||typeof expected!=='object')continue;
      const {location,...identity}=expected;
      const pool=location==='producerRefs'||location==='consumerBindings'?array(a.provenance?.[location]):[...array(a.provenance?.producerRefs),...array(a.provenance?.consumerBindings)];
      const observed=pool.find(id=>id?.identityKind===identity.identityKind && id.role===identity.role && id.algorithm===identity.algorithm && id.scope===identity.scope && id.value===identity.value);
      check('identity',`/provenance/${location??'*'}`,identity,observed??null,{owner:port.owner,code:'PROVENANCE_MISMATCH'});
    }
    check('ownership','/ownership/mode',true,array(port.ownershipModes).includes(a.ownership?.mode),{unknown:!Array.isArray(port.ownershipModes),owner:port.owner,code:'OWNERSHIP_MISMATCH'});
    check('transport',`/${port===p?'producerPort':'consumerPort'}/transports`,true,array(port.transports).includes(p.nativeAPI?.transport),{unknown:!Array.isArray(port.transports)||!p.nativeAPI?.transport,owner:port.owner,code:'TRANSPORT_MISMATCH'});
    for(const schema of array(port.requiredExtensionSchemas)) {
      const ext=Object.values(a.extensions??{}).find(x=>x?.schemaId===schema?.schemaId && x?.schemaVersion===schema?.schemaVersion);
      check('extension','/extensions',true,!!ext,{owner:port.owner,code:'REQUIRED_METADATA_MISSING'});
      check('schema','/extensions',true,known(registry,schema),{unknown:!known(registry,schema),owner:port.owner,code:'UNKNOWN_SCHEMA'});
    }
    if (port.artifactKind==='tensor') {
      const t=port.tensor, actual=a.tensor;
      check('tensor-declaration',`/${port===p?'producerPort':'consumerPort'}/tensor`,true,!!t,{unknown:!t,owner:port.owner});
      check('dtype','/tensor/dtype',true,array(t?.dtypes).includes(actual?.dtype),{unknown:!Array.isArray(t?.dtypes),owner:port.owner,code:'DTYPE_MISMATCH',adaptable:false});
      check('axes','/tensor/axes',t?.axes,actual?.axes,{unknown:!Array.isArray(t?.axes)||!Array.isArray(actual?.axes),owner:port.owner,code:'AXES_MISMATCH',adaptable:false});
      const shape=t?.shape,values=actual?.shape;
      const fits=Array.isArray(shape)&&Array.isArray(values)&&shape.length===values.length&&shape.every((d,i)=>d===null||d===values[i]);
      check('shape','/tensor/shape',true,fits,{unknown:!Array.isArray(shape)||!Array.isArray(values),owner:port.owner,code:'SHAPE_MISMATCH'});
      if(Array.isArray(values)) {
        const n=values.reduce((v,d)=>v*BigInt(Number.isSafeInteger(d)&&d>0?d:0),1n);
        if(present(t?.maxElements)) {
          check('static-budget','/tensor/shape',true,finiteInt(t.maxElements)&&n<=BigInt(t.maxElements),{owner:port.owner,code:'STATIC_BUDGET_EXCEEDED'});
          Object.assign(checks.at(-1),{limit:t.maxElements,observedElements:n.toString(),observedShape:values});
        }
        if(present(t?.maxBytes)) {
          const width={float32:4,float16:2,bfloat16:2,float64:8,int32:4,uint32:4,int16:2,uint16:2,int8:1,uint8:1}[actual?.dtype];
          check('static-budget','/tensor/dtype',true,!!width&&finiteInt(t.maxBytes)&&n*BigInt(width)<=BigInt(t.maxBytes),{unknown:!width,owner:port.owner,code:'STATIC_BUDGET_EXCEEDED'});
          Object.assign(checks.at(-1),{limit:t.maxBytes,observedBytes:width?(n*BigInt(width)).toString():null,observedShape:values});
        }
      }
    }
  }
  const norm=referenceContext===undefined&&requiredNormPolicy===undefined?null:compileNormBindings(referenceContext,{producerPort:p,consumerPort:c,artifact:a});
  if(requiredNormPolicy!==undefined){
    check('required-norm-policy','/requiredNormPolicy',true,typeof requiredNormPolicy?.policyId==='string'&&requiredNormPolicy.policyId.length>0&&Array.isArray(requiredNormPolicy?.requiredNormIds)&&requiredNormPolicy.requiredNormIds.length>0&&requiredNormPolicy.requiredNormIds.every(id=>typeof id==='string'&&id.length>0),{unknown:!requiredNormPolicy?.policyId||!Array.isArray(requiredNormPolicy?.requiredNormIds)||!requiredNormPolicy.requiredNormIds.length,code:'REQUIRED_NORM_POLICY_MISSING'});
    check('required-norm-phase','/referenceContext/phase',true,['declaration','validated','published'].includes(referenceContext?.phase),{unknown:!['declaration','validated','published'].includes(referenceContext?.phase),code:'UNKNOWN_EXECUTION_PHASE'});
    for(const id of array(requiredNormPolicy?.requiredNormIds))check('required-norm','/referenceContext/normIds',true,array(referenceContext?.normIds).includes(id),{unknown:!array(referenceContext?.normIds).includes(id),code:'REQUIRED_NORM_MISSING',normId:id});
  }
  if(norm){
    if(requiredNormPolicy!==undefined)norm.trace.requiredNormPolicy={policyId:requiredNormPolicy?.policyId??null,requiredNormIds:[...array(requiredNormPolicy?.requiredNormIds)]};
    if(norm.trace.catalogSha256)contractRefs.push(norm.trace.catalogSha256,`works-reference-catalog/${norm.trace.documentVersion}`);
    for(const spec of norm.checks)check(spec.criterion,spec.fieldPath,spec.expected,spec.observed,spec);
  }
  const mismatches=checks.filter(x=>x.outcome==='mismatch');
  const unknowns=checks.filter(x=>x.outcome==='unknown');
  // Only explicitly permitted finite, exact transformations can be proposed.
  const candidates=(Array.isArray(adapters)?adapters:[]).filter(ad=>
    ad?.available===true && typeof ad.adapterId==='string' && typeof ad.version==='string' && ad.version.length>0 && typeof ad.owner==='string' && sourceKnown(ad.sourceRef) &&
    array(ad.profiles).includes(c.profileRef) && array(p.allowedAdapterRefs).includes(ad.adapterId) && array(c.allowedAdapterRefs).includes(ad.adapterId) && Array.isArray(ad.rules) &&
    mismatches.length>0 && mismatches.every(m=>m.adaptable&&ad.rules.some(rule=>rule?.fieldPath===m.fieldPath && equal(rule.from,pointer(a,m.fieldPath)) && equal(rule.to,pointer(c,m.fieldPath)) && typeof rule.reason==='string')));
  const adapter=candidates[0];
  const compatibility=adapter&&!unknowns.length?'NEEDS_ADAPTER':mismatches.length?'INCOMPATIBLE':unknowns.length?'UNVERIFIED':'COMPATIBLE';
  const reasons=checks.filter(x=>x.outcome!=='match').map(x=>({code:x.code,fieldPath:x.fieldPath,message:x.reason,owner:x.owner,contractRefs:x.contractRefs,...(x.normId?{normId:x.normId}:{})}));
  if(adapter)reasons.push({code:'EXPLICIT_ADAPTER_REQUIRED',fieldPath:'/adapters',message:`Insert and re-evaluate ${adapter.adapterId}@${adapter.version}; no transformation executed`,owner:adapter.owner,contractRefs});
  const scopes=[...new Set([...(Array.isArray(requiredScopes)?requiredScopes:[]),...(norm?.scopes??[]).map(x=>x.scope)])];
  const evidenceList=Array.isArray(evidence)?evidence:[];
  const phaseOrder={declaration:0,validated:1,published:2},phase=referenceContext?.phase;
  const scopeResults=scopes.map(scope=>{
    const requirements=(norm?.scopes??[]).filter(x=>x.scope===scope);
    const duePhase=requirements.reduce((due,r)=>phaseOrder[r.duePhase]>phaseOrder[due]?r.duePhase:due,'declaration');
    if(Object.hasOwn(phaseOrder,phase)&&phaseOrder[phase]<phaseOrder[duePhase])return {scope,result:'not-verified',evidenceRefs:[],pending:true,duePhase};
    const bound=evidenceList.filter(e=>requirements.every(r=>r.available&&r.constraints.every(([path,expected])=>present(expected)&&equal(pointer(e,path),expected)))&&e?.scope===scope && e.artifactRef===a.artifactId && e.profileRef===a.profileRef &&
      [p.bindingRef,c.bindingRef].every(v=>array(e.subjectRefs).includes(v)) &&
      [p.nativeAPI?.version,p.nativeAPI?.build,c.nativeAPI?.version,c.nativeAPI?.build,p.sourceRef?.commit??p.sourceRef?.sha256,c.sourceRef?.commit??c.sourceRef?.sha256].every(v=>typeof v==='string'&&array(e.contractRefs).includes(v)) &&
      equal(e.inputConditions?.shape,a.tensor?.shape)&&e.inputConditions?.dtype===a.tensor?.dtype && e.inputConditions?.coverage && e.inputConditions?.environment);
    return {scope,result:bound.some(e=>e.result==='fail')?'fail':bound.some(e=>e.result==='pass')?'pass':'not-verified',evidenceRefs:bound.map(e=>e.evidenceId)};
  });
  const blocked=[];
  if(compatibility!=='COMPATIBLE')blocked.push(`CONTRACT_${compatibility}`);
  if(!Array.isArray(requiredScopes)||!Array.isArray(evidence))blocked.push('EVIDENCE_REQUIREMENTS_NOT_EXPLICIT');
  for(const s of scopeResults)if(!s.pending&&s.result!=='pass')blocked.push(`SCOPE_${s.result}:${s.scope}`);
  if(phase==='declaration')for(const s of norm?.scopes??[])if(s.declarationReady===false)blocked.push(`NUMERICAL_DECLARATION_MISSING:${s.scope}`);
  for(const s of norm?.readiness??[])if(!equal(s.expected,s.observed))blocked.push(`${s.normId}:${s.fieldPath}`);
  for(const side of ['producer','consumer']) {
    const s=implementationState?.[side];
    if(s?.state!=='implemented')blocked.push(`IMPLEMENTATION_NOT_READY:${side}`);
    if(!Array.isArray(s?.roles)||!s.roles.length||s.roles.some(r=>!array(registry?.roles).includes(r)))blocked.push(`ROLE_NOT_REGISTERED:${side}`);
    if(typeof s?.operationId!=='string')blocked.push(`OPERATION_NOT_EXPLICIT:${side}`);
    const b=activeBindings?.[side],port=side==='producer'?p:c;
    if(s?.bindingRef!==port.bindingRef)blocked.push(`IMPLEMENTATION_NOT_BOUND:${side}`);
    if(!b||b.valid!==true||b.bindingRef!==port.bindingRef||b.ownerId!==port.owner||!present(b.expectedRevision)||!present(b.currentRevision)||b.currentRevision!==b.expectedRevision)blocked.push(`BINDING_NOT_CURRENT:${side}`);
  }
  const r=resourceState;
  if(['borrow','lease'].includes(a.ownership?.mode)) {
    const b=activeBindings?.artifact;
    if(!b||b.artifactRef!==a.artifactId||b.ownerId!==a.ownership.ownerId||b.valid!==true||b.leaseCurrent!==true)blocked.push('ARTIFACT_LIFETIME_NOT_CURRENT');
  }
  if(!r || r.status!=='available' || typeof r.ownerId!=='string' || ![r.requiredBytes,r.budgetBytes,r.occupiedBytes].every(finiteInt) || r.requiredBytes>r.budgetBytes-r.occupiedBytes)blocked.push('RESOURCE_NOT_READY');
  const failed=scopeResults.some(s=>s.result==='fail')||r?.status==='failed';
  return {contractVersion:CONTRACT,decisionId:`edge:${p.bindingRef??'?'}:${c.bindingRef??'?'}:${a.artifactId??'?'}`,
    producerBindingRef:p.bindingRef??'unresolved:producer',consumerBindingRef:c.bindingRef??'unresolved:consumer',contractRefs,
    adapterRefs:adapter?[adapter.adapterId]:[],compatibility,checks,reasons,
    adapterSelections:adapter?[{adapterId:adapter.adapterId,version:adapter.version,sourceRef:adapter.sourceRef,owner:adapter.owner,rules:adapter.rules,profiles:adapter.profiles,evidenceRefs:adapter.evidenceRefs??[]}]:[],
    roles:implementationState??null,implementationState:implementationState??null,validation:scopeResults,
    readiness:{state:failed?'failed':blocked.length?'blocked':'ready',reasons:blocked},
    unresolvedRefs:unknowns.map(x=>`${x.owner}:${x.fieldPath}`),
    ...(norm?{referenceTrace:{...norm.trace,...(phase!==undefined?{phase,pendingScopeRefs:scopeResults.filter(x=>x.pending).map(x=>x.scope),generationReady:false}:{}),evidenceRefs:scopeResults.flatMap(x=>x.evidenceRefs),validation:scopeResults.map(x=>({...x,result:norm.trace.classificationMapping.validation[x.result]})),readiness:norm.trace.classificationMapping.readiness[failed?'failed':blocked.length?'blocked':'ready']}}:{})};
}
