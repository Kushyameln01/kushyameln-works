import {buildIndex,canonical,TYPES,ANALYZER_VERSION,RULES_VERSION,sourcePosition} from './model.mjs';
const builtin=g=>/^0{16}[def]0{15}$/i.test(g??'');
export function analyzeSnapshot(input,kernel){
 const index=buildIndex(input),{nodes,assetMap,guidMap}=index,findings=[...index.findings],references=[],targets=[],targetSources=new Map();
 for(const n of nodes)for(const r of n.references??[]){
  const reference={source:{...n.source,...sourcePosition(r.source),property:r.property},assetId:n.assetId,fileId:r.fileId,guid:r.guid??null,property:r.property,state:null,targetIndex:null};
  if(r.fileId==='0')reference.state='null';
  else if(builtin(r.guid))reference.state='builtin-unverified';
  else{
   const candidates=r.guid?guidMap.get(r.guid.toLowerCase()):assetMap.get(n.assetId);
   if(!candidates?.length)reference.state='external-unprovided';
   else if(candidates.length!==1)reference.state='ambiguous';
   else {const file=candidates[0],found=file.nodes.get(r.fileId)??[];
    if(found.length>1)reference.state='ambiguous';
    else if(found.length===1){reference.state='resolved';reference.targetIndex=found[0].index;reference.target={path:file.path,assetId:file.assetId,fileId:r.fileId};targets.push(found[0].index);const refs=targetSources.get(found[0].index)??[];refs.push(reference.source);targetSources.set(found[0].index,refs);}
    else if(file.coverage==='opaque'||file.coverage==='partial')reference.state='unparsed-target';
    else reference.state=r.guid?'missing-target-object':'missing-local';
   }
  }
  references.push(reference);
  if(!['null','resolved'].includes(reference.state))findings.push({code:reference.state==='missing-local'||reference.state==='missing-target-object'?'MISSING_REFERENCE':'REFERENCE_UNRESOLVED',category:'reference',severity:reference.state.startsWith('missing-')?'error':'warning',confidence:reference.state.startsWith('missing-')?'confirmed':'unverified',...reference});
 }
 const counts=kernel.incoming(Int32Array.from(targets),nodes.length);
 const shared=[];for(const n of nodes)if(counts[n.index]>1)shared.push({assetId:n.assetId,fileId:n.fileId,path:n.file.path,incoming:counts[n.index],sources:targetSources.get(n.index)??[]});
 const declarations=[],declarationMap=new Map(),checks=[],actual=[],allowed=[];
 for(const n of nodes)for(const p of n.parameters??[]){const d={...p,scope:n.key,source:n.source};declarations.push(d);const key=JSON.stringify([n.key,p.name]);const matches=declarationMap.get(key)??[];matches.push(d);declarationMap.set(key,matches);}
 for(const declarations of declarationMap.values())if(declarations.length>1)findings.push({code:'PARAMETER_DUPLICATE_DECLARATION',category:'parameter',severity:'warning',confidence:'confirmed',name:declarations[0].name,scope:declarations[0].scope,declarations});
 for(const n of nodes)for(const u of n.parameterUses??[]){
  const scope=u.scopeFileId?`${n.assetId}:${u.scopeFileId}`:n.key;const declarationsInScope=declarationMap.get(JSON.stringify([scope,u.name]))??[];
  const type=declarationsInScope.length===1?declarationsInScope[0].type:'Unknown';
  actual.push(TYPES[type]);allowed.push(u.allowedTypes.reduce((m,t)=>m|(1<<TYPES[t]),0));checks.push({name:u.name,declared:type,required:u.allowedTypes,rule:u.rule??'supplied-rule',scope,source:{...n.source,...sourcePosition(u.source)},declarationCount:declarationsInScope.length});
 }
 const verdicts=kernel.types(Int32Array.from(actual),Int32Array.from(allowed));
 for(let i=0;i<checks.length;i++){checks[i].verdict=['unknown','compatible','incompatible'][verdicts[i]];if(verdicts[i]!==1)findings.push({code:verdicts[i]===2?'PARAMETER_TYPE_CONSTRAINT':checks[i].declarationCount>1?'PARAMETER_AMBIGUOUS':'PARAMETER_UNRESOLVED',category:'parameter',severity:verdicts[i]===2?'error':'warning',confidence:verdicts[i]===2?'confirmed':'unverified',...checks[i]});}
 const coverage={files:input.files.length,objects:nodes.length,opaqueFiles:input.files.filter(f=>f.coverage==='opaque').map(f=>f.path),partialFiles:input.files.filter(f=>f.coverage==='partial').map(f=>({path:f.path,reason:f.reason??'unsupported syntax'})),source:(!input.files.length||input.files.some(f=>!f.coverage||f.coverage==='structured-input'))?'caller-supplied schema':'serialized-input',unresolvedReferences:references.filter(r=>!['null','resolved'].includes(r.state)).length,unknownParameterChecks:checks.filter(c=>c.verdict==='unknown').length};
 return {kind:'unity-analysis',schemaVersion:1,analyzerVersion:ANALYZER_VERSION,ruleSetVersion:RULES_VERSION,snapshotId:input.snapshotId??'snapshot',files:input.files.map(f=>({path:f.path,guid:f.guid??null,contentHash:f.contentHash??null,contentHashProvenance:'caller-provided; not independently verified at structured-input boundary',coverage:f.coverage??'structured-input',reason:f.reason??null})),coverage,references,parameters:{declarations,checks},shared,findings,completeness:{totalCount:findings.length,returnedCount:findings.length,truncated:false},counts:{files:input.files.length,objects:nodes.length,references:references.length,shared:shared.length,findings:findings.length}};
}
export function compareSnapshots(before,after,kernel){
 const b=buildIndex(before),a=buildIndex(after),changes=[],ambiguous=[];const byKey=index=>{const m=new Map();for(const n of index.nodes){const v=m.get(n.key)??[];v.push(n);m.set(n.key,v);}return m;};const bm=byKey(b),am=byKey(a),pairs=[],bv=[],av=[],intern=new Map();let next=1;const id=v=>{const s=canonical(v);if(!intern.has(s))intern.set(s,next++);return intern.get(s);};
 for(const key of new Set([...bm.keys(),...am.keys()])){const bs=bm.get(key)??[],as=am.get(key)??[];if(bs.length>1||as.length>1){ambiguous.push({key,beforeCount:bs.length,afterCount:as.length});continue;}const bn=bs[0],an=as[0];if(!bn||!an){changes.push({kind:bn?'object-removed':'object-added',identity:key,source:(bn??an).source,matching:'exact-guid-fileID-or-provisional-input-path',before:bn?.properties??null,after:an?.properties??null});continue;}
  const domains=[['property',bn.properties??{},an.properties??{}],['metadata',{classId:bn.classId},{classId:an.classId}],['references',{references:bn.references??[]},{references:an.references??[]}],['parameters',{declarations:bn.parameters??[],uses:bn.parameterUses??[]},{declarations:an.parameters??[],uses:an.parameterUses??[]}]];
  for(const [domain,bp,ap]of domains)for(const property of new Set([...Object.keys(bp),...Object.keys(ap)])){const presentB=Object.hasOwn(bp,property),presentA=Object.hasOwn(ap,property);pairs.push({domain,kind:!presentB?'property-added':!presentA?'property-removed':'property-changed',identity:key,property,before:presentB?bp[property]:null,after:presentA?ap[property]:null,beforePresent:presentB,afterPresent:presentA,source:an.source,matching:an.file.guid?'exact-guid-fileID':'provisional-input-path-fileID'});bv.push(presentB?id(bp[property]):0);av.push(presentA?id(ap[property]):0);}
 }
 const diffs=kernel.diff(Int32Array.from(bv),Int32Array.from(av));for(let i=0;i<diffs.length;i++)if(diffs[i])changes.push(pairs[i]);
 const fileChanges=[];for(const f of before.files){const other=after.files.filter(x=>f.guid?x.guid===f.guid:x.path===f.path);if(other.length===1&&f.contentHash&&other[0].contentHash&&f.contentHash!==other[0].contentHash)fileChanges.push({pathBefore:f.path,pathAfter:other[0].path,beforeHash:f.contentHash,afterHash:other[0].contentHash,kind:'raw-bytes-changed'});}
 return {kind:'unity-diff',changes,ambiguous,fileChanges,completeness:{totalCount:changes.length,returnedCount:changes.length,truncated:false},identityPolicy:'GUID/fileID exact; missing GUID uses explicit provisional input path; no heuristic remapping'};
}
