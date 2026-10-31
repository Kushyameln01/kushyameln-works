/** Finite comparison bindings, not a compatibility or numerical evaluator.
 * Only compatibility.mjs decides outcomes. Native declarations and manager
 * receipts are explicit sidecars; reference JSON prose is never executable. */
import {isVerifiedReferenceSet} from './reference-loader.mjs';

const list=v=>Array.isArray(v)?v:[],present=v=>v!==undefined&&v!==null;
const text=v=>typeof v==='string'&&v.length>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const source=v=>text(v?.repository)&&/^[a-f0-9]{40}$/.test(v?.commit)&&text(v?.path);
const SUPPORTED=new Set(['N-IDENTITY','N-SHAPE','N-NUMERIC','N-NORMALIZATION','N-LOADER','N-MAPPING','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT','N-LEGACY','N-GENERATION','N-EXTENSION']);
const CHECKERS={'N-TRANSACTION':['queue.mjs','snapshot.mjs'],'N-ARTIFACT':['package.mjs'],'N-EVIDENCE':['owner-validation']};

export function compileNormBindings(context,input){
 const checks=[],scopes=[],readiness=[],trace={schemaVersion:'works-norm-trace/0.1-draft.1',appliedNormIds:[],profileRefs:[],sourceRefs:[],evidenceRefs:[],delegations:[],classificationMapping:{validation:{pass:'PASS',fail:'FAIL','not-verified':'NOT_VERIFIED'},readiness:{ready:'READY',blocked:'BLOCKED',failed:'FAILED'}}};
 const add=(normId,fieldPath,expected,observed,extra={})=>checks.push({criterion:'manager-norm',normId,fieldPath,expected,observed,unknown:!present(observed),code:`${normId}_MISMATCH`,...extra});
 const missing=(normId,path,reason)=>add(normId,path,true,undefined,{message:reason});
 const requireScope=(normId,scope,constraints=[],available=true)=>scopes.push({normId,scope,constraints,available,
  duePhase:['N-TRANSACTION','N-ARTIFACT'].includes(normId)?'published':'validated',
  declarationReady:['N-NUMERIC','N-NORMALIZATION'].includes(normId)?available:true});
 if(!isVerifiedReferenceSet(context?.referenceSet)){
  missing('N-IDENTITY','/referenceContext/referenceSet','A successfully byte-verified ReferenceSet is required');return {checks,scopes,readiness,trace};
 }
 const set=context.referenceSet,cat=set.catalog;
 Object.assign(trace,{catalogSha256:set.catalogSha256,documentVersion:cat.documentVersion,sourceRuntimeIntegrated:cat.runtimeIntegrated,integrityReceipts:set.integrityReceipts});
 if(context.phase!==undefined&&!['declaration','validated','published'].includes(context.phase))missing('N-EXTENSION','/referenceContext/phase','Unknown required execution phase');
 if(!Array.isArray(context.normIds)||context.normIds.length===0)missing('N-EXTENSION','/referenceContext/normIds','Applicable norms must be explicit');
 const ids=[...new Set(list(context.normIds))];
 for(const id of ids){if(!SUPPORTED.has(id)||!set.normRecords.has(id))missing(id,'/referenceContext/normIds',`Required norm ${String(id)} has no finite implementation/reference`);else trace.appliedNormIds.push(id);}
 const applies=id=>trace.appliedNormIds.includes(id);
 const selected=[];
 for(const [i,binding] of list(context.profileBindings).entries()){
  const record=set.profileRecords.get(binding?.recordId),side=binding?.side;
  if(!record||!['producer','consumer'].includes(side)){missing('N-SHAPE',`/referenceContext/profileBindings/${i}`,'Explicit known profile record and producer/consumer side required');continue;}
  selected.push({record,binding,side,declaration:context.nativeDeclarations?.[side]??{}});
  trace.profileRefs.push(record.recordId);trace.sourceRefs.push(...list(record.sourceRefs));
 }
 if((applies('N-SHAPE')||applies('N-NORMALIZATION')||applies('N-LOADER')||applies('N-NUMERIC'))&&!selected.length)missing('N-EXTENSION','/referenceContext/profileBindings','Applicable native profile bindings are required; gate absence alone is a different condition');
 if(applies('N-IDENTITY')){
  const adoption=list(cat.managementAdoptionSets).find(x=>x.adoptionSetId===context.adoptionSetId);
  // New candidates are explicitly registered outside the historical catalog.
  // Full pins are checked by the owning native adapter before it can execute.
  const candidate=context.candidateSet;
  const validCandidate=candidate?.schemaVersion==='works-candidate-set/0.1-draft.1'&&candidate?.status==='candidate'&&text(candidate.candidateSetId)&&source(candidate.sourceRef)&&Array.isArray(candidate.modules)&&candidate.modules.length>0&&candidate.modules.every(m=>text(m?.module)&&source(m?.sourceRef)&&(!m.kernel||hash(m.kernel.sha256)&&Number.isSafeInteger(m.kernel.byteLength)&&m.kernel.byteLength>0));
  if(!adoption&&!validCandidate)missing('N-IDENTITY','/referenceContext/adoptionSetId','A fixed adopted set or separately registered candidate is required');
  trace.adoptionSetId=adoption?.adoptionSetId??null;trace.candidateSetId=validCandidate?candidate.candidateSetId:null;
  if(!list(context.identityBindings).length)missing('N-IDENTITY','/referenceContext/identityBindings','Loaded source/build receipts are explicit inputs');
  for(const side of ['producer','consumer'])if(list(context.identityBindings).filter(b=>b?.side===side).length!==1)missing('N-IDENTITY',`/referenceContext/identityBindings/${side}`,'Bind each compared side exactly once to its selected module/source; a valid producer cannot authorize an omitted consumer');
  for(const [i,b] of list(context.identityBindings).entries()){
   const port=b?.side==='producer'?input.producerPort:b?.side==='consumer'?input.consumerPort:null;
   const candidateModule=validCandidate?candidate.modules.find(m=>m.module===b?.module):null;
   const commit=adoption?.[`${b?.module}Commit`]??candidateModule?.sourceRef.commit;
   const kernel=b?.module==='lora'?adoption?.loraKernel??candidateModule?.kernel:candidateModule?.kernel;
   const path=`/referenceContext/identityBindings/${i}`;
   add('N-IDENTITY',`${path}/loadedSourceRef/commit`,commit,b?.loadedSourceRef?.commit,{unknown:!commit||!present(b?.loadedSourceRef?.commit)});
   add('N-IDENTITY',`/${b?.side}Port/sourceRef`,b?.loadedSourceRef,port?.sourceRef,{unknown:!source(b?.loadedSourceRef)||!port});
   if(candidateModule)add('N-IDENTITY',`${path}/loadedSourceRef`,candidateModule.sourceRef,b?.loadedSourceRef);
   if(kernel){add('N-IDENTITY',`${path}/kernelDigest`,kernel.sha256,b?.kernelDigest);add('N-IDENTITY',`${path}/byteLength`,kernel.byteLength,b?.byteLength);}
  }
 }
 for(const {record:r,binding:b,side,declaration:d} of selected){
  const v=r.requiredDeclarations??{},base=`/referenceContext/nativeDeclarations/${side}`,rep=b.representation;
  const before=checks.length;
  if(applies('N-SHAPE')&&(r.recordId.startsWith('SHAPE-'))){
   const shape=rep==='raw-latent'?v.rawLatentShape:['rgb','rgb-input-unit','rgb-decoder-raw'].includes(rep)?v.rgbShape:rep==='text-plain'?v.plainTextOutputShape:rep==='text-ids'?d.shape:undefined;
   if(!shape){missing('N-SHAPE','/referenceContext/profileBindings','Known representation is required');continue;}
   if(rep==='text-ids')add('N-SHAPE',`${base}/shape`,true,Array.isArray(shape)&&shape.length===3&&shape[0]===1&&Number.isInteger(shape[1])&&shape[1]>=1&&shape[1]<=512&&shape[2]===4096);
   const meaning=rep==='raw-latent'?v.rawLatentMeaning:rep?.startsWith('text-')?v.meaning:rep==='rgb-input-unit'?'rgb-unit':rep==='rgb-decoder-raw'?'raw-decoder-rgb':['rgb-unit','raw-decoder-rgb'].includes(d.meaning)?d.meaning:undefined;
   for(const [field,expected,actual] of [['shape',shape,input.artifact?.tensor?.shape],['dtype',v.dtype,input.artifact?.tensor?.dtype],['axes',v.layout?.split(''),input.artifact?.tensor?.axes],['nativeMeaning',meaning,input.artifact?.tensor?.nativeMeaning]])add('N-SHAPE',`/tensor/${field}`,expected,actual,{unknown:!present(expected)||!present(actual)});
   if(r.nativeProfileId!==null)add('N-SHAPE',`${base}/nativeProfileId`,r.nativeProfileId,d.nativeProfileId);
   add('N-SHAPE',`${base}/modelSha256`,v.vaeModelSha256??v.modelSha256,d.modelSha256);
   if(v.tokenizerSha256)add('N-SHAPE',`${base}/tokenizerSha256`,v.tokenizerSha256,d.tokenizerSha256);
  }
  if(applies('N-NORMALIZATION')&&r.recordId.startsWith('NORM-WAN21-MEAN-')){
   for(const [field,expected] of Object.entries({nativeProfileId:r.nativeProfileId,normalizationRuleId:v.normalizationRuleId,kernelABI:v.kernelABI,modelSha256:v.modelSha256}))add('N-NORMALIZATION',`${base}/${field}`,expected,d[field]);
   const meaning=rep==='normalized-mean'?v.meaningAfter:rep==='raw-latent'?v.meaningBefore:undefined;
   add('N-NORMALIZATION','/tensor/nativeMeaning',meaning,input.artifact?.tensor?.nativeMeaning,{unknown:!meaning});
   add('N-NORMALIZATION','/tensor/shape',v.shape,input.artifact?.tensor?.shape);
   add('N-NORMALIZATION','/tensor/dtype',v.dtype,input.artifact?.tensor?.dtype);
   if(rep==='normalized-mean')add('N-NORMALIZATION',`${base}/normalizationState`,'normalized',d.normalizationState);
   if(rep==='raw-latent'&&present(d.normalizationState))add('N-NORMALIZATION',`${base}/normalizationState`,'restored',d.normalizationState);
  }
  if(applies('N-LOADER')&&r.recordId==='LOAD-COMFY-LINEAR-DIFF'){
   add('N-LOADER',`${base}/loaderPolicyId`,v.loaderPolicyId,d.loaderPolicyId);
   for(const field of ['baseDtype','outputDtype','layout'])add('N-LOADER',`${base}/${field}`,v[field],d[field]);
   for(const [field,allowed] of [['variant',v.variants],['sourceDtype',v.sourceDtypes],['targetRank',v.supportedTargetRanks]])add('N-LOADER',`${base}/${field}`,true,list(allowed).includes(d[field]),{unknown:!present(d[field])});
   add('N-LOADER',`${base}/strength`,true,typeof d.strength==='number'&&Number.isFinite(d.strength),{unknown:!present(d.strength)});
  }
  if(applies('N-LOADER')&&r.recordId==='LOAD-LOCAL-SAFETENSORS'){
   add('N-LOADER',`${base}/inputKind`,true,['local-file','local-blob','injected-local-source'].includes(d.inputKind),{unknown:!present(d.inputKind)});
   add('N-LOADER',`${base}/sourceHash`,true,hash(d.sourceHash),{unknown:!present(d.sourceHash)});
  }
  if(applies('N-LOADER')&&r.recordId==='LOAD-FP8-BASE'){
   add('N-LOADER',`${base}/nativeProfileId`,r.nativeProfileId,d.nativeProfileId);
   add('N-LOADER',`${base}/outputForLoRA`,v.outputForLoRA,d.outputForLoRA);
   add('N-LOADER',`${base}/executionRecordRef`,v.executionRecordRef,d.executionRecordRef);
   add('N-LOADER',`${base}/sourceProfileExplicit`,true,d.sourceProfileExplicit);
  }
  if(applies('N-LOADER')&&r.recordId==='LOAD-V1-FULL-ONLY'){
   for(const [field,expected] of Object.entries({coverage:v.requiredCoverage,bindingKind:v.requiredBinding,evidenceLevel:v.evidenceLevel}))add('N-LOADER',`${base}/${field}`,expected,d[field]);
  }
  if(applies('N-NUMERIC')&&r.recordId.startsWith('EXEC-')){
   if(r.nativeProfileId!==null)add('N-NUMERIC',`${base}/nativeProfileId`,r.nativeProfileId,d.nativeProfileId);
   const fields={
    'EXEC-BERNINI-Q16-F32':['weightShape','biasShape','activationShape','outputShape','fullWeightShape','originalTarget','bindings','coverage','graphSHA256'],
    'EXEC-FP8-SCALAR-F32':['storageDtype','computeDtype','scaleStorageDtype','scaleScope','quantizationConfigExactUtf8','quantizationConfigBytes'],
    'EXEC-BERNINI-SIMPLE6-SHIFT5':['sourceComfyCommit','shift','timesteps','multiplier','steps','splitStep','sigmaBoundaryCount','tableIndices'],
    'EXEC-ATTENTION-Q16-ONEHEAD':['descriptorSchemaVersion','inputSourceSchema','precisionProfile','scope','queryShape','keyCountRange','logicalTileMax','sourceSpaces']
   }[r.recordId];
   if(!fields)missing('N-NUMERIC',base,'Unknown required numeric profile binding');
   for(const field of fields??[])add('N-NUMERIC',`${base}/${field}`,v[field],d[field]);
  }
  // Some documented profiles have no concrete binding in this revision. They
  // remain dependent-edge UNVERIFIED instead of accepting a familiar ID alone.
  if(checks.length===before&&['N-SHAPE','N-NORMALIZATION','N-LOADER'].some(applies))missing('N-EXTENSION','/referenceContext/profileBindings',`No applicable finite declaration binding for ${r.recordId}`);
 }
 if(applies('N-NUMERIC')||applies('N-NORMALIZATION')){
  if(!list(context.numericRequirements).length)requireScope(applies('N-NUMERIC')?'N-NUMERIC':'N-NORMALIZATION',applies('N-NUMERIC')?'norm:N-NUMERIC':'norm:N-NORMALIZATION',[],false);
  for(const [index,r] of list(context.numericRequirements).entries()){
   if(typeof r?.scope==='string'&&r.scope.startsWith('norm:'))add('N-NUMERIC',`/referenceContext/numericRequirements/${index}/scope`,false,true,{unknown:false,code:'RESERVED_NUMERICAL_SCOPE',message:'Owner numerical evidence cannot occupy a reserved norm scope or defer validation until publication'});
   const gate=r?.gateRef,ref=r?.referenceRef;
   const known=(applies('N-NUMERIC')&&list(set.normRecords.get('N-NUMERIC')?.profileRefs).includes(r?.recordId)||applies('N-NORMALIZATION')&&list(set.normRecords.get('N-NORMALIZATION')?.profileRefs).includes(r?.recordId))&&set.profileRecords.has(r?.recordId);
   if(!known)missing('N-NUMERIC','/referenceContext/numericRequirements/recordId','Unknown required numeric profile');
   const record=set.profileRecords.get(r?.recordId),nativeBinding=selected.find(s=>s.record.recordId===r?.recordId);
   if(known&&!nativeBinding)missing('N-NUMERIC','/referenceContext/profileBindings','Required native execution declarations are missing, rather than only their numerical receipt');
   // A numeric receipt must be about an explicitly selected native profile.
   // Catalog record IDs are never treated as native profile IDs.
   const port=nativeBinding?.side==='producer'?input.producerPort:input.consumerPort;
   const sameOwner=source(r?.ownerSourceRef)&&r.ownerSourceRef.repository===port?.sourceRef?.repository&&r.ownerSourceRef.commit===port?.sourceRef?.commit&&list(record?.sourceRefs).some(s=>s.repository===r.ownerSourceRef.repository&&s.commit===r.ownerSourceRef.commit);
   const available=known&&!!nativeBinding&&text(r?.scope)&&sameOwner&&hash(r?.kernelDigest)&&r.kernelDigest===nativeBinding.declaration.kernelDigest&&source(gate?.sourceRef)&&hash(gate?.sha256)&&text(gate?.gateId)&&source(ref?.sourceRef)&&hash(ref?.sha256)&&
    (!record.nativeProfileId||nativeBinding.declaration.nativeProfileId===record.nativeProfileId);
   // The predeclared owner's gate is an identity. Arithmetic/comparison is done
   // by that owner, never by this binding or the manager.
   const constraints=[['/normBinding/catalogSha256',set.catalogSha256],...['scope','recordId','gateRef','referenceRef','ownerSourceRef','kernelDigest'].map(k=>[`/normBinding/${k}`,r?.[k]])];
   requireScope('N-NUMERIC',text(r?.scope)?r.scope:'norm:N-NUMERIC',constraints,available);
  }
 }
 if(applies('N-MAPPING')){
  const d=context.mapping??{},m=cat.mappingAuthority;
  for(const [f,e] of Object.entries({ownerRole:m.ownerRole,factory:m.factory,adapterVersion:m.adapterVersion,duplicateMappingAllowed:false}))add('N-MAPPING',`/referenceContext/mapping/${f}`,e,d[f]);
  add('N-MAPPING','/referenceContext/mapping/regressionOnly',false,d.regressionOnly);
  for(const field of ['nativeRegistryHash','connectionRegistryHash'])add('N-MAPPING',`/referenceContext/mapping/${field}`,true,hash(d[field]),{unknown:!present(d[field])});
  for(const field of ['selectionRegion','fullShape','sourceHash'])if(!present(d[field]))missing('N-MAPPING',`/referenceContext/mapping/${field}`,'Explicit owner registry identity, source and selected region required');
  for(const field of ['nativeRegistryHash','connectionRegistryHash'])add('N-MAPPING',`/referenceContext/mapping/ownerBinding/${field}`,d[field],d.ownerBinding?.[field]);
  for(const field of ['selectionRegion','fullShape','sourceHash'])add('N-MAPPING',`/referenceContext/mapping/planBinding/${field}`,d[field],d.planBinding?.[field]);
 }
 for(const normId of ['N-TRANSACTION','N-ARTIFACT','N-EVIDENCE'])if(applies(normId)){
  const d=context.delegations?.[normId],scope=`norm:${normId}`;
  const currentTarget=normId==='N-TRANSACTION'?context.managerState?.target:normId==='N-ARTIFACT'?{artifactRef:input.artifact?.artifactId,profileRef:input.artifact?.profileRef}:context.evidenceTarget;
  const targetFields=normId==='N-TRANSACTION'?[d?.checker==='queue.mjs'?'requestId':'snapshotId','managerSessionId','managerRevision','resourceBinding','localRevisionBindings']:normId==='N-ARTIFACT'?['artifactRef','profileRef']:['artifactRef','profileRef','coverage','scope','baseKind','referenceId'];
  let available=CHECKERS[normId].includes(d?.checker)&&text(d?.receiptRef)&&targetFields.every(f=>present(currentTarget?.[f])&&present(d?.target?.[f]));
  // Use the already checked package/snapshot/queue result, with this edge's
  // current target. No independent transaction, digest or retry engine exists.
  const currentConstraints=targetFields.map(f=>[`/delegation/target/${f}`,currentTarget?.[f]]);
  currentConstraints.push(['/evidenceId',d?.receiptRef]);
  if(normId==='N-ARTIFACT'){
   const receipt=d?.receipt;
   available=available&&receipt?.packageVersion==='works-artifact-package/1.0-draft.1'&&text(receipt.packageId)&&receipt.manifestPath==='manifest.json'&&hash(receipt.manifestSha256)&&Number.isSafeInteger(receipt.manifestByteLength)&&receipt.manifestByteLength>0;
   currentConstraints.push(['/packageReceipt',receipt]);
  }
  if(normId==='N-EVIDENCE')for(const field of ['coverage','scope','baseKind','referenceId'])currentConstraints.push([`/inputConditions/${field}`,currentTarget?.[field]]);
  requireScope(normId,scope,[['/delegation/checker',d?.checker],['/delegation/receiptRef',d?.receiptRef],['/delegation/target',d?.target],...currentConstraints,['/normBinding/catalogSha256',set.catalogSha256]],available);
  trace.delegations.push({normId,checker:d?.checker??null,receiptRef:d?.receiptRef??null,scope,checkingOwner:'existing manager/owner checker'});
 }
 if(applies('N-LEGACY')){
  const d=context.legacy??{};
  for(const [f,e] of Object.entries({bindingKind:'actual-initializer',coverage:'FULL',evidenceLevel:'legacy-boolean'}))add('N-LEGACY',`/referenceContext/legacy/${f}`,e,d[f]);
 }
 if(applies('N-GENERATION')){
  const d=context.generation;
  // Dynamic admission remains distinct from contract compatibility.
  for(const [field,expected] of [['nativeReadiness','READY'],['coverage','FULL'],['scope','full-model-session'],['fullSessionEvidence',true],['resourceBudgetEvidence',true]])readiness.push({normId:'N-GENERATION',fieldPath:`/referenceContext/generation/${field}`,expected,observed:d?.[field]});
 }
 if(applies('N-EXTENSION'))for(const feature of list(context.requiredFeatures))missing('N-EXTENSION','/referenceContext/requiredFeatures',`Unknown required feature ${String(feature)}`);
 return {checks,scopes,readiness,trace};
}
