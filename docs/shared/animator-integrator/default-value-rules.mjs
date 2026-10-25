// Default/type rules use exact names. Independent Expression suffix rules are defined below.
export const DEFAULT_VALUE_RULES=Object.freeze([
 {name:'AlwaysOne',type:'Float',defaultValue:1,ensureAnimator:true,ensureExpression:true},
 {name:'v2/EyeLidLeft',type:'Float',defaultValue:0.75},
 {name:'v2/EyeLidRight',type:'Float',defaultValue:0.75},
 {name:'v2/EyeLid',type:'Float',defaultValue:0.75},
].map(Object.freeze));
/** Pure normalization. Existing flags/fields survive; only explicitly ensured rules add rows. */
export function applyDefaultValueRules(rows,{domain,sourceId=null,ensure=false}={}){
 if(!['animator','expression'].includes(domain)||!Array.isArray(rows))throw TypeError('Expected rows and animator/expression domain.');
 const changes=[],normalized=rows.map(row=>{
  const rule=DEFAULT_VALUE_RULES.find(r=>r.name===row.name);if(!rule)return {...row};
  const after={...row,type:rule.type,defaultValue:rule.defaultValue};
  if(row.type!==after.type||row.defaultValue!==after.defaultValue)changes.push({domain,sourceId,name:row.name,rule:{name:rule.name,type:rule.type,defaultValue:rule.defaultValue},before:{type:row.type,defaultValue:row.defaultValue},after:{type:after.type,defaultValue:after.defaultValue},action:'normalize'});
  return after;
 });
 if(ensure)for(const rule of DEFAULT_VALUE_RULES)if(rule[domain==='animator'?'ensureAnimator':'ensureExpression']&&!normalized.some(p=>p.name===rule.name)){
  const row={name:rule.name,type:rule.type,defaultValue:rule.defaultValue,...(domain==='expression'?{saved:false,networkSynced:false}:{})};normalized.push(row);changes.push({domain,sourceId,name:row.name,rule:{name:rule.name,type:rule.type,defaultValue:rule.defaultValue},before:null,after:{...row},action:'add'});
 }
 return {rows:normalized,changes};
}

// Expression-only synchronization rules are independent of default/type rules.
export const EXPRESSION_SYNC_RULES=Object.freeze([
 {id:'ascii-digit-suffix',domain:'expression',suffixes:Object.freeze(['0','1','2','3','4','5','6','7','8','9']),networkSynced:true},
 {id:'Negative-suffix',domain:'expression',suffixes:Object.freeze(['Negative']),networkSynced:true},
].map(Object.freeze));
/** One shared condition for Binary synchronization and Expression Bool registration. */
export function findBinaryParameterSuffixRule(name){
 return EXPRESSION_SYNC_RULES.find(rule=>rule.suffixes.some(suffix=>name.endsWith(suffix)))??null;
}
export const EXPRESSION_BOOL_RULES=Object.freeze([
 {id:'binary-suffix-bool',domain:'expression',type:'Bool',condition:'same BinaryParameters suffix rule'},
].map(Object.freeze));
/** Only Expression types change. Preserve numeric defaults; reject values Bool cannot represent. */
export function applyExpressionBoolRules(rows,{sourceId=null}={}){
 if(!Array.isArray(rows))throw TypeError('Expected Expression rows.');
 const changes=[],issues=[],normalized=rows.map(row=>{
  const suffixRule=findBinaryParameterSuffixRule(row.name);if(!suffixRule)return {...row};
  const rule=EXPRESSION_BOOL_RULES[0];
  if(row.type!==rule.type)changes.push({domain:'expression',sourceId,name:row.name,ruleId:rule.id,suffixRuleId:suffixRule.id,before:{type:row.type},after:{type:rule.type},action:'normalize'});
  if(row.defaultValue!==0&&row.defaultValue!==1)issues.push({severity:'error',code:'binary_bool_default',message:`${row.name}: Binary Bool registration requires numeric default 0 or 1; received ${row.defaultValue}.`,sourceId,name:row.name,defaultValue:row.defaultValue});
  return {...row,type:rule.type};
 });
 return {rows:normalized,changes,issues};
}
/** Pure suffix normalization. No additions or changes to Saved, type, defaults or other fields. */
export function applyExpressionSyncRules(rows,{sourceId=null}={}){
 if(!Array.isArray(rows))throw TypeError('Expected Expression rows.');
 const changes=[],normalized=rows.map(row=>{
  const rule=findBinaryParameterSuffixRule(row.name);
  if(!rule||row.networkSynced===rule.networkSynced)return {...row};
  changes.push({domain:'expression',sourceId,name:row.name,rule,before:{networkSynced:row.networkSynced},after:{networkSynced:rule.networkSynced},action:'normalize'});
  return {...row,networkSynced:rule.networkSynced};
 });
 return {rows:normalized,changes};
}
