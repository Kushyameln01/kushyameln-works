// Exact names only. Add explicit rules here; no case, prefix or suffix inference.
export const DEFAULT_VALUE_RULES=Object.freeze([
 {name:'AlwaysOne',type:'Float',defaultValue:1,ensureAnimator:true,ensureExpression:true},
 {name:'EyeLidLeft',type:'Float',defaultValue:0.75},
 {name:'EyeLidRight',type:'Float',defaultValue:0.75},
 {name:'EyeLid',type:'Float',defaultValue:0.75},
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
