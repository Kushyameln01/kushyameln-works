import {applyDefaultValueRules,applyExpressionBoolRules,applyExpressionSyncRules} from './default-value-rules.mjs?v=vrcft5-rules-1';
import {lookupVrcft5ParameterRange} from './vrcft5-ranges.mjs';

export const EXPRESSION_REGISTRATION_RULES=Object.freeze([
 {id:'aap-internal',domain:'expression',prefixes:Object.freeze(['Decode/','Function/','Proxy/','Smooth/']),action:'exclude'},
 {id:'smooth-function-local',domain:'expression',prefix:'Smooth/',suffix:'_Function',action:'retain-or-add',networkSynced:false},
 {id:'binary-zero-excluded',domain:'expression',suffix:'0',action:'exclude'},
 {id:'nonnegative-negative-excluded',domain:'expression',suffix:'Negative',condition:'documented range has no negative values',action:'exclude'},
 {id:'unknown-negative-preserved',domain:'expression',suffix:'Negative',condition:'range is undocumented',action:'preserve'},
 {id:'eyelid-binary-default',domain:'expression',canonicalBases:Object.freeze(['v2/EyeLidLeft','v2/EyeLidRight']),defaults:Object.freeze({'1':0,'2':0,'4':1,'8':1})},
].map(Object.freeze));
export const VRCFT5_REGISTRATION_RANGE_POLICY=Object.freeze({id:'vrcft5-negative-registration-v2',suffix:'Negative',nonnegative:'exclude',signed:'Binary Bool and sync ON',unknown:'preserve input',authority:'user'});
export const isSmoothFunctionControl=name=>name.startsWith('Smooth/')&&name.endsWith('_Function');

/** Expression-only policy. Classify before Bool validation, conflicts or bit counting. */
export function applyVrcft5ExpressionRules(input,{sourceId=null}={}){
 if(!Array.isArray(input))throw TypeError('Expected Expression rows.');
 const rows=[],issues=[],sources=[],defaultChanges=[],boolChanges=[],syncChanges=[],exclusions=[],changes=[],rangeMatches=[],rangeUnmatched=[],rangeChanges=[];
 function omit(original,ruleId,detail={}){
  const record={domain:'expression',sourceId,name:original.name,ruleId,action:'exclude',before:{...original},after:null,...detail};
  exclusions.push(record);sources.push({sourceId,name:original.name,original:{...original},normalized:null,action:'exclude',ruleId});return record;
 }
 for(const original of input){
  const name=original.name,smooth=isSmoothFunctionControl(name);
  if(!smooth&&EXPRESSION_REGISTRATION_RULES[0].prefixes.some(prefix=>name.startsWith(prefix))){omit(original,'aap-internal');continue;}
  if(name.endsWith('0')){omit(original,'binary-zero-excluded');continue;}
  if(name.endsWith('Negative')){
   const baseName=name.slice(0,-'Negative'.length),lookup=lookupVrcft5ParameterRange(baseName);
   if(!lookup){
    rangeUnmatched.push({domain:'expression',sourceId,name,baseName,reason:'undocumented_or_unsupported_name'});
    const row={...original};rows.push(row);sources.push({sourceId,name,original:{...original},normalized:row,action:'preserve',ruleId:'unknown-negative-preserved'});continue;
   }
   const {canonicalName,matchMode,range}=lookup,exclude=range.min>=0;
   rangeMatches.push({domain:'expression',sourceId,name,baseName,canonicalName,matchMode,range,registration:exclude?'exclude':'retain'});
   if(exclude){rangeChanges.push(omit(original,'nonnegative-negative-excluded',{baseName,canonicalName,matchMode,range}));continue;}
  }
  if(smooth){
   const row={...original,networkSynced:false};
   if(original.networkSynced!==false)changes.push({domain:'expression',sourceId,name,ruleId:'smooth-function-local',action:'normalize',before:{networkSynced:original.networkSynced},after:{networkSynced:false}});
   rows.push(row);sources.push({sourceId,name,original:{...original},normalized:row,action:'retain'});continue;
  }
  const normalized=applyDefaultValueRules([original],{domain:'expression',sourceId});defaultChanges.push(...normalized.changes);let row=normalized.rows[0];
  const suffix=name.at(-1),eye=['1','2','4','8'].includes(suffix)?lookupVrcft5ParameterRange(name.slice(0,-1)):null;
  if(eye&&EXPRESSION_REGISTRATION_RULES[5].canonicalBases.includes(eye.canonicalName)){
   const defaultValue=EXPRESSION_REGISTRATION_RULES[5].defaults[suffix];
   if(row.defaultValue!==defaultValue)changes.push({domain:'expression',sourceId,name,ruleId:'eyelid-binary-default',canonicalName:eye.canonicalName,matchMode:eye.matchMode,action:'normalize',before:{defaultValue:row.defaultValue},after:{defaultValue}});
   row={...row,defaultValue};
  }
  const typed=applyExpressionBoolRules([row],{sourceId});boolChanges.push(...typed.changes);issues.push(...typed.issues);
  const synced=applyExpressionSyncRules(typed.rows,{sourceId});syncChanges.push(...synced.changes);row=synced.rows[0];
  rows.push(row);sources.push({sourceId,name,original:{...original},normalized:row,action:'retain'});
 }
 return {rows,issues,sources,defaultChanges,boolChanges,syncChanges,exclusions,changes,rangeMatches,rangeUnmatched,rangeChanges};
}

/** Add only the explicitly requested user Smooth controls, using their selected Animator definitions. */
export function addMissingSmoothExpressionControls(input,controllers){
 const rows=input.map(row=>({...row})),names=new Set(rows.map(row=>row.name)),changes=[],sources=[],issues=[];
 for(const controller of controllers)for(const parameter of controller.parameters??[]){
  if(!isSmoothFunctionControl(parameter.name)||names.has(parameter.name))continue;
  if(!['Float','Int','Bool'].includes(parameter.type)){
   issues.push({severity:'error',code:'smooth_expression_type',message:`${parameter.name}: ${parameter.type} cannot be registered as an Expression Smooth control.`,sourceId:controller.id,name:parameter.name,type:parameter.type});continue;
  }
  const row={name:parameter.name,type:parameter.type,defaultValue:parameter.defaultValue,saved:false,networkSynced:false};rows.push(row);names.add(row.name);
  changes.push({domain:'expression',sourceId:controller.id,name:row.name,ruleId:'smooth-function-local',action:'add',before:null,after:{...row},sourceDomain:'animator'});
  sources.push({sourceId:controller.id,name:row.name,original:null,normalized:{...row},action:'add',ruleId:'smooth-function-local',sourceDomain:'animator'});
 }
 return {rows,changes,sources,issues};
}
