// Read-only serialized rules. Unknown SDK/version semantics never become guessed type constraints.
export const TEXT_RULES_VERSION='unity-text-rules/1';
export const EXPRESSION_SCHEMA=Object.freeze({kind:'vrchat-expression',scriptGuid:'67cc4cb7839cd3741b63733d5adf0442',scriptFileId:'-1506855854',profile:'known-five-field-parameters/1'});
const animatorTypes=Object.freeze({'1':'Float','3':'Int','4':'Bool','9':'Trigger'});
const expressionTypes=Object.freeze({'0':'Int','1':'Float','2':'Bool'});
const conditions=Object.freeze({'1':['Bool','Trigger'],'2':['Bool'],'3':['Float','Int'],'4':['Float','Int'],'6':['Int'],'7':['Int']});
const map=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const pointerPart=v=>String(v).replaceAll('~','~0').replaceAll('/','~1');
const conditionBasis='https://docs.unity3d.com/ScriptReference/Animations.AnimatorCondition.html';
const blendBasis='https://docs.unity3d.com/2022.3/Documentation/Manual/BlendTrees.html';

export function referenceRole(classId,property){
 if(classId==='91'&&/^\/m_AnimatorLayers\/\d+\/m_StateMachine$/.test(property))return 'animator-owner';
 if(classId==='1107'&&(/^\/m_ChildStates\/\d+\/m_State$/.test(property)||/^\/m_ChildStateMachines\/\d+\/m_StateMachine$/.test(property)||/^\/(?:m_AnyStateTransitions|m_EntryTransitions)\/\d+$/.test(property)))return 'animator-owner';
 if(classId==='1102'&&(property==='/m_Motion'||/^\/m_Transitions\/\d+$/.test(property)))return 'animator-owner';
 if(classId==='206'&&/^\/m_Childs\/\d+\/m_Motion$/.test(property))return 'animator-owner';
 return 'reference';
}

export function deriveParameterRules(object){
 const p=object.properties,parameters=[],parameterUses=[],issues=[];
 const source=path=>object.propertySources[path]??object.source;
 const issue=(code,message,path)=>issues.push({code,message,source:source(path),propertyPath:path});
 const validName=(name,path)=>{if(typeof name!=='string'||!name||name.length>1024||/[\u0000-\u001f\u007f]/.test(name)){issue('PARAMETER_NAME_UNSUPPORTED','A parameter name is missing or outside the supported text contract',path);return false;}return true;};
 const use=(name,path,allowedTypes,rule,ruleBasis)=>{if(validName(name,path))parameterUses.push({domain:'animator',unowned:true,name,allowedTypes:[...allowedTypes],rule,property:path,source:source(path),...(ruleBasis?{ruleBasis}:{})});};
 const records=(value,path)=>{if(!Array.isArray(value)){issue('PARAMETER_LIST_UNAVAILABLE','The expected serialized sequence is unavailable',path);return null;}return value;};
 if(object.classId==='91'){
  const rows=records(p.m_AnimatorParameters,'/m_AnimatorParameters');
  for(const [i,row]of (rows??[]).entries()){
   const path=`/m_AnimatorParameters/${i}`;
   if(!map(row)){issue('PARAMETER_DECLARATION_UNSUPPORTED','The declaration is not a mapping',path);continue;}
   if(!validName(row.m_Name,path+'/m_Name'))continue;
   const type=typeof row.m_Type==='string'&&own(animatorTypes,row.m_Type)?animatorTypes[row.m_Type]:'Unknown';
   if(type==='Unknown')issue('PARAMETER_TYPE_UNKNOWN','Unknown serialized Animator parameter type',path+'/m_Type');
   parameters.push({domain:'animator',name:row.m_Name,type,property:path+'/m_Name',source:source(path),serializedType:typeof row.m_Type==='string'?row.m_Type:null});
  }
 }else if(object.classId==='1101'||object.classId==='1109'){
  const rows=records(p.m_Conditions,'/m_Conditions');
  for(const [i,row]of (rows??[]).entries()){
   const path=`/m_Conditions/${i}`;
   if(!map(row)){issue('CONDITION_UNSUPPORTED','A transition condition is not a mapping',path);continue;}
   const mode=typeof row.m_ConditionMode==='string'?row.m_ConditionMode:'unknown',allowed=own(conditions,mode)?conditions[mode]:[];
   if(!allowed.length)issue('CONDITION_MODE_UNKNOWN','Unknown transition condition mode; no type constraint asserted',path+'/m_ConditionMode');
   use(row.m_ConditionEvent,path+'/m_ConditionEvent',allowed,`unity.transition-condition.${mode}`,conditionBasis);
  }
 }else if(object.classId==='206'){
  const mode=p.m_BlendType,known=['0','1','2','3','4'].includes(mode);
  if(!known)issue('BLEND_TYPE_UNKNOWN','Unknown BlendTree mode; no type constraint asserted','/m_BlendType');
  if(mode==='4'){
   const rows=records(p.m_Childs,'/m_Childs');
   for(const [i,row]of (rows??[]).entries())if(map(row))use(row.m_DirectBlendParameter,`/m_Childs/${i}/m_DirectBlendParameter`,['Float'],'unity.blendtree.direct-weight',blendBasis);else issue('BLEND_CHILD_UNSUPPORTED','A BlendTree child is not a mapping',`/m_Childs/${i}`);
  }else{
   use(p.m_BlendParameter,'/m_BlendParameter',known?['Float']:[],'unity.blendtree.axis-x',blendBasis);
   if(mode!=='0'&&(known||own(p,'m_BlendParameterY')))use(p.m_BlendParameterY,'/m_BlendParameterY',known?['Float']:[],'unity.blendtree.axis-y',blendBasis);
  }
 }else if(object.classId==='1102'){
  for(const part of ['Speed','CycleOffset','Mirror','Time']){
   const active=p[`m_${part}ParameterActive`],path=`/m_${part}Parameter`;
   if(active===undefined||active==='0')continue;
   if(active!=='1'){issue('STATE_PARAMETER_ACTIVE_UNKNOWN','Unknown active flag; no type constraint asserted',path+'Active');continue;}
   issue('STATE_PARAMETER_RULE_UNVERIFIED',`${part} usage is recorded; its target-version type rule is not yet verified`,path);
   use(p[`m_${part}Parameter`],path,[],`unity.state.${part.toLowerCase()}.unverified`);
  }
 }else if(object.classId==='114'&&own(p,'parameters')){
  const script=p.m_Script;
  if(!map(script)||typeof script.guid!=='string'||script.guid.toLowerCase()!==EXPRESSION_SCHEMA.scriptGuid||script.fileID!==EXPRESSION_SCHEMA.scriptFileId||script.type!=='3'){
   issue('EXPRESSION_SCHEMA_UNRECOGNIZED','A parameters field alone does not identify the VRChat Expression schema','/m_Script');
  }else{
   const rows=records(p.parameters,'/parameters'),allowedFields=new Set(['name','valueType','saved','defaultValue','networkSynced']);
   for(const [i,row]of (rows??[]).entries()){
    const path=`/parameters/${i}`;
    if(!map(row)||Object.keys(row).length!==allowedFields.size||Object.keys(row).some(k=>!allowedFields.has(k))){issue('EXPRESSION_SCHEMA_UNSUPPORTED','The row does not match the verified five-field Expression profile',path);continue;}
    if(!validName(row.name,path+'/name'))continue;
    if(!['0','1'].includes(row.saved)||!['0','1'].includes(row.networkSynced)||typeof row.defaultValue!=='string'||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(row.defaultValue)||!Number.isFinite(Number(row.defaultValue))){issue('EXPRESSION_SETTINGS_UNSUPPORTED','Expression flags/default are not supported serialized values',path);continue;}
    const type=typeof row.valueType==='string'&&own(expressionTypes,row.valueType)?expressionTypes[row.valueType]:'Unknown';
    if(type==='Unknown')issue('PARAMETER_TYPE_UNKNOWN','Unknown serialized Expression parameter type',path+'/valueType');
    parameters.push({domain:'vrchat-expression',name:row.name,type,property:path+'/name',source:source(path),schemaIdentity:{...EXPRESSION_SCHEMA},serializedType:typeof row.valueType==='string'?row.valueType:null,defaultValue:row.defaultValue,saved:row.saved==='1',networkSynced:row.networkSynced==='1'});
   }
  }
 }
 if(object.classId==='1107'&&p.m_StateMachineTransitions&&Object.keys(p.m_StateMachineTransitions).length)issue('OWNER_LAYOUT_UNSUPPORTED','Nonempty StateMachineTransitions ownership layout is not yet verified','/m_StateMachineTransitions');
 return {parameters,parameterUses,issues};
}

export const jsonPointerPart=pointerPart;
