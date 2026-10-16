import {fileId,guid,safePath} from './model.mjs';
import {parseUnityScalar} from '../ft/unity-text.mjs';
import {deriveParameterRules,referenceRole,jsonPointerPart,TEXT_RULES_VERSION} from './rules.mjs';

export const TEXT_PARSER_VERSION='unity-text-subset/1';
export const TEXT_LIMITS=Object.freeze({maxTextBytes:4*1024*1024,maxCodeUnits:4*1024*1024,maxLines:262144,maxNodes:262144,maxDocuments:65536,maxDepth:64,maxPath:1024});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const roots=Object.freeze({'1':'GameObject','4':'Transform','74':'AnimationClip','91':'AnimatorController','95':'Animator','114':'MonoBehaviour','206':'BlendTree','1101':'AnimatorStateTransition','1102':'AnimatorState','1107':'AnimatorStateMachine','1109':'AnimatorTransition','221':'AnimatorOverrideController'});
class SyntaxIssue extends Error{constructor(code,message,start,end,related=[]){super(message);this.code=code;this.start=start;this.end=end;this.related=related;}}
const fault=(code,message,start,end=start+1,related=[])=>{throw new SyntaxIssue(code,message,start,end,related);};
const limit=code=>{throw new RangeError(code);};
const unsupportedPrefix=v=>/^[&*!|>@`?:]/.test(v);

function textContext(text){
 if(typeof text!=='string')throw TypeError('TEXT_STRING_REQUIRED');
 if(text.length>TEXT_LIMITS.maxCodeUnits)limit('TEXT_CODE_UNIT_LIMIT');
 if(new TextEncoder().encode(text).byteLength>TEXT_LIMITS.maxTextBytes)limit('TEXT_BYTE_LIMIT');
 const lines=[],starts=[0];let at=0;
 while(at<text.length){
  if(lines.length>=TEXT_LIMITS.maxLines)limit('TEXT_LINE_LIMIT');
  const newline=text.indexOf('\n',at),next=newline<0?text.length:newline+1;
  let end=newline<0?text.length:newline;if(end>at&&text[end-1]==='\r')end--;
  const raw=text.slice(at,end),bom=at===0&&raw.startsWith('\uFEFF')?1:0,indent=/^ */.exec(raw.slice(bom))[0].length;
  lines.push({start:at,end,next,contentStart:at+bom+indent,indent,content:raw.slice(bom+indent)});
  if(newline>=0)starts.push(next);at=next;
 }
 const locate=offset=>{let lo=0,hi=starts.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(starts[mid]<=offset)lo=mid;else hi=mid;}return {line:lo+1,column:offset-starts[lo]+1};};
 const source=(start,end)=>{const a=locate(start),b=locate(end);return {start,end,line:a.line,column:a.column,endLine:b.line,endColumn:b.column};};
 const issue=e=>({code:e.code,message:e.message,source:source(e.start,e.end),...(e.related.length?{relatedSources:e.related.map(r=>source(r.start,r.end))}:{})});
 return {text,lines,source,issue,nodes:0};
}

// A bounded parser, not a YAML round-trip editor. Every accepted scalar stays a string.
function parseSubset(context,start,end,issues){
 const {text,source}=context;
 const lines=[];let first=0,stop=context.lines.length;
 while(first<stop){const middle=(first+stop)>>1;if(context.lines[middle].start<start)first=middle+1;else stop=middle;}
 for(let i=first;i<context.lines.length&&context.lines[i].start<end;i++){const l=context.lines[i];if(l.content.trim()&&!l.content.startsWith('#'))lines.push(l);}
 let at=0,duplicate=false;
 const checkDepth=depth=>{if(depth>TEXT_LIMITS.maxDepth)limit('YAML_DEPTH_LIMIT');};
 const node=(kind,value,begin,finish)=>{if(++context.nodes>TEXT_LIMITS.maxNodes)limit('YAML_NODE_LIMIT');return {kind,value,start:begin,end:finish};};
 const scalar=(value,begin,finish)=>node('scalar',value,begin,finish);
 const problem=(code,message,begin,finish=begin+1)=>fault(code,message,begin,Math.min(finish,end));
 const keyValue=(raw,begin,finish)=>{
  if(!raw||unsupportedPrefix(raw)||raw==='<<')problem('YAML_KEY_UNSUPPORTED','Unsupported alias, tag, merge or complex mapping key',begin,finish);
  let key;try{key=parseUnityScalar(raw);}catch(e){problem('YAML_KEY_UNSUPPORTED',e.message,begin,finish);}
  if(!key||key.length>TEXT_LIMITS.maxPath)limit('YAML_KEY_LIMIT');
  if(['__proto__','prototype','constructor'].includes(key))problem('YAML_KEY_UNSUPPORTED','Reserved mapping key is outside this subset',begin,finish);
  return key;
 };
 const add=(mapping,key,keyStart,keyEnd,value)=>{
  // Maps retain entries internally so duplicate keys cannot turn into last-wins values.
  const prior=mapping.keys.get(key);
  if(prior){duplicate=true;issues.push({code:'YAML_DUPLICATE_KEY',message:`Duplicate mapping key: ${key}`,source:source(keyStart,keyEnd),relatedSources:[source(prior.start,prior.end)]});}
  else mapping.keys.set(key,{start:keyStart,end:keyEnd});
  if(++context.nodes>TEXT_LIMITS.maxNodes)limit('YAML_NODE_LIMIT');
  mapping.value.push({key,keyStart,keyEnd,node:value});mapping.end=Math.max(mapping.end,value.end);
 };
 const mapping=begin=>({...node('map',[],begin,begin),keys:new Map()});
 function quoted(begin){
  const quote=text[begin];let cursor=begin+1;
  while(cursor<end){
   const c=text[cursor];if(c==='\n'||c==='\r')problem('YAML_MULTILINE_QUOTE_UNSUPPORTED','Multiline quoted scalars are outside this subset',begin,cursor);
   if(c==='\\'&&quote==='"'){cursor+=2;continue;}
   if(c===quote){if(quote==="'"&&text[cursor+1]==="'"){cursor+=2;continue;}cursor++;let value;try{value=parseUnityScalar(text.slice(begin,cursor));}catch(e){problem('YAML_SCALAR_UNSUPPORTED',e.message,begin,cursor);}return scalar(value,begin,cursor);}
   cursor++;
  }
  problem('YAML_UNCLOSED_QUOTE','Quoted scalar is not closed',begin,end);
 }
 function ws(cursor){
  while(cursor<end){if(/[ \t\r\n]/.test(text[cursor])){cursor++;continue;}if(text[cursor]==='#'){while(cursor<end&&text[cursor]!=='\n')cursor++;continue;}break;}return cursor;
 }
 function flow(begin,depth){
  checkDepth(depth);const open=text[begin],close=open==='{'?'}':']';let cursor=ws(begin+1);
  const result=open==='{'?mapping(begin):node('seq',[],begin,begin);
  if(text[cursor]===close){result.end=cursor+1;return result;}
  while(cursor<end){
   if(open==='{'){
    const keyStart=cursor;let keyEnd,key;
    if(text[cursor]==='"'||text[cursor]==="'"){const k=quoted(cursor);keyEnd=k.end;key=keyValue(text.slice(cursor,k.end),cursor,k.end);cursor=ws(k.end);}
    else{while(cursor<end&&text[cursor]!==':'&&!/[\n\r,\[\]{}#]/.test(text[cursor]))cursor++;keyEnd=cursor;const raw=text.slice(keyStart,keyEnd).trim();key=keyValue(raw,keyStart,keyEnd);}
    if(text[cursor]!==':')problem('YAML_FLOW_MAPPING_UNSUPPORTED','A flow mapping key needs a colon',keyStart,cursor);
    cursor=ws(cursor+1);const v=flowValue(cursor,depth+1);add(result,key,keyStart,keyEnd,v);cursor=ws(v.end);
   }else{const v=flowValue(cursor,depth+1);result.value.push(v);result.end=v.end;cursor=ws(v.end);}
   if(text[cursor]===close){result.end=cursor+1;return result;}
   if(text[cursor]!==',')problem('YAML_FLOW_UNSUPPORTED','Expected a flow comma or closing delimiter',cursor);
   cursor=ws(cursor+1);
   if(text[cursor]===close)problem('YAML_FLOW_TRAILING_COMMA_UNSUPPORTED','Trailing flow commas are outside this subset',cursor);
  }
  problem('YAML_UNCLOSED_FLOW','Flow collection is not closed',begin,end);
 }
 function flowValue(begin,depth){
  checkDepth(depth);const c=text[begin];
  if(c==='{'||c==='[')return flow(begin,depth);
  if(c==='"'||c==="'")return quoted(begin);
  let cursor=begin;while(cursor<end&&!/[,\]}\r\n]/.test(text[cursor])&&!(text[cursor]==='#'&&(cursor===begin||/\s/.test(text[cursor-1]))))cursor++;
  const raw=text.slice(begin,cursor).trim();
  if(!raw)problem('YAML_FLOW_VALUE_UNSUPPORTED','Empty flow values are outside this subset',begin,cursor+1);
  if(unsupportedPrefix(raw)||/[\[{}]/.test(raw)||/:\s/.test(raw))problem('YAML_SCALAR_UNSUPPORTED','Unsupported flow scalar syntax',begin,cursor);
  return scalar(parseUnityScalar(raw),begin,cursor);
 }
 function field(line,contentStart=line.contentStart){
  const raw=text.slice(contentStart,line.end);let colon=-1,cursor=contentStart;
  if(raw.startsWith('"')||raw.startsWith("'")){const k=quoted(contentStart);cursor=k.end;while(cursor<line.end&&/[ \t]/.test(text[cursor]))cursor++;if(text[cursor]===':')colon=cursor;}
  else for(;cursor<line.end;cursor++)if(text[cursor]===':'&&(cursor+1===line.end||/[ \t]/.test(text[cursor+1]))){colon=cursor;break;}
  if(colon<0)return null;
  const key=keyValue(text.slice(contentStart,colon).trim(),contentStart,colon);
  return {key,keyStart:contentStart,keyEnd:colon,valueStart:colon+1};
 }
 const sequence=line=>text[line.contentStart]==='-'&&(line.contentStart+1===line.end||/[ \t]/.test(text[line.contentStart+1]));
 function inlineValue(line,valueStart,depth){
  checkDepth(depth);let begin=valueStart;while(begin<line.end&&/[ \t]/.test(text[begin]))begin++;
  if(begin===line.end||text[begin]==='#')return null;
  const c=text[begin];let result;
  if(c==='{'||c==='[')result=flow(begin,depth);
  else if(c==='"'||c==="'")result=quoted(begin);
  else{
   const raw=text.slice(begin,line.end);
   if(unsupportedPrefix(raw)||/^-(?:\s|$)/.test(raw)||/:\s/.test(raw))problem('YAML_SCALAR_UNSUPPORTED','Unsupported alias, tag, block scalar or plain scalar syntax',begin,line.end);
   result=scalar(parseUnityScalar(raw),begin,line.end);
  }
  if(c==='{'||c==='['||c==='"'||c==="'"){
   let cursor=result.end;while(cursor<end&&text[cursor]!=='\n'&&text[cursor]!=='\r'&&/[ \t]/.test(text[cursor]))cursor++;
   if(cursor<end&&!/[\r\n#]/.test(text[cursor]))problem('YAML_TRAILING_CONTENT','Unexpected text after a complete value',cursor);
  }
  while(at<lines.length&&lines[at].start<result.end)at++;
  return result;
 }
 function child(line,valueStart,parentIndent,depth){
  const direct=inlineValue(line,valueStart,depth);if(direct)return direct;
  const next=lines[at];if(next&&(next.indent>parentIndent||(next.indent===parentIndent&&sequence(next))))return block(next.indent,depth);
  return scalar('',valueStart,line.end);
 }
 function addField(result,line,f,indent,depth){const value=child(line,f.valueStart,indent,depth+1);add(result,f.key,f.keyStart,f.keyEnd,value);}
 function block(indent,depth){
  checkDepth(depth);const first=lines[at];if(!first)problem('YAML_EMPTY_DOCUMENT','Expected a YAML value',start,end);
  const isSequence=sequence(first),result=isSequence?node('seq',[],first.contentStart,first.end):mapping(first.contentStart);
  while(at<lines.length&&lines[at].indent===indent){
   const line=lines[at];
   if(line.content.startsWith('\t')||line.content.startsWith('%')||line.content==='...'||/^---/.test(line.content))problem('YAML_UNSUPPORTED_LINE','Unsupported indentation, directive or document marker',line.contentStart,line.end);
   if(isSequence){
    if(!sequence(line))break;
    at++;let begin=line.contentStart+1;while(begin<line.end&&/[ \t]/.test(text[begin]))begin++;
    if(begin===line.end||text[begin]==='#')result.value.push(child(line,begin,indent,depth+1));
    else if(text[begin]!=='{'&&text[begin]!=='['&&field(line,begin)){
     if(begin!==line.contentStart+2)problem('YAML_SEQUENCE_INDENTATION_UNSUPPORTED','Inline item mappings need one space after the sequence dash',line.contentStart,begin);
     const item=mapping(begin),f=field(line,begin);addField(item,line,f,indent+2,depth+1);
     while(at<lines.length&&lines[at].indent===indent+2&&!sequence(lines[at])){const more=lines[at++],entry=field(more);if(!entry)problem('YAML_MAPPING_UNSUPPORTED','Expected an item mapping field',more.contentStart,more.end);addField(item,more,entry,indent+2,depth+1);}
     result.value.push(item);
    }else result.value.push(inlineValue(line,begin,depth+1));
    result.end=result.value.at(-1).end;
   }else{
    if(sequence(line))break;
    at++;const f=field(line);if(!f)problem('YAML_MAPPING_UNSUPPORTED','Expected a mapping field',line.contentStart,line.end);addField(result,line,f,indent,depth);
   }
   if(at<lines.length&&lines[at].indent>indent)problem('YAML_INDENTATION_UNSUPPORTED','Unsupported continuation or indentation',lines[at].contentStart,lines[at].end);
  }
  return result;
 }
 for(const line of lines)if(line.content.startsWith('\t'))problem('YAML_TAB_INDENTATION','Tabs cannot indent YAML in this subset',line.contentStart,line.end);
 if(!lines.length)problem('YAML_EMPTY_DOCUMENT','No YAML mapping was supplied',start,end);
 if(lines[0].indent!==0)problem('YAML_ROOT_INDENTATION','Root mapping must start at column one',lines[0].contentStart,lines[0].end);
 const ast=block(0,0);if(at!==lines.length)problem('YAML_TRAILING_CONTENT','Document was not fully consumed',lines[at].contentStart,lines[at].end);
 return {ast,duplicate};
}

function materialize(ast,context){
 const positions=Object.create(null);
 function visit(node,path){
  if(path.length>TEXT_LIMITS.maxPath)limit('YAML_POINTER_LIMIT');
  positions[path]=context.source(node.start,node.end);
  if(node.kind==='scalar')return node.value;
  if(node.kind==='seq')return node.value.map((n,i)=>visit(n,path+'/'+i));
  const result=Object.create(null);for(const entry of node.value)result[entry.key]=visit(entry.node,path+'/'+jsonPointerPart(entry.key));return result;
 }
 return {value:visit(ast,''),positions};
}

function referencesFrom(ast,context,classId,issues){
 const result=[];
 function visit(n,path){
  if(path.length>TEXT_LIMITS.maxPath)limit('YAML_POINTER_LIMIT');
  if(n.kind==='seq'){n.value.forEach((child,i)=>visit(child,path+'/'+i));return;}
  if(n.kind!=='map')return;
  const values=new Map(n.value.map(e=>[e.key,e.node]));
  if(!values.has('fileID')&&values.has('guid')&&[...values.keys()].every(k=>['guid','type'].includes(k))){issues.push({code:'REFERENCE_SYNTAX_UNSUPPORTED',message:'GUID-only mapping cannot establish a Unity object reference without fileID',source:context.source(n.start,n.end),propertyPath:path});return;}
  if(values.has('fileID')){
   const source=context.source(n.start,n.end),bad=message=>issues.push({code:'REFERENCE_SYNTAX_UNSUPPORTED',message,source,propertyPath:path});
   if([...values.keys()].some(k=>!['fileID','guid','type'].includes(k))||[...values.values()].some(v=>v.kind!=='scalar')){bad('Object-reference-like mapping has unsupported fields');return;}
   try{
    const id=fileId(values.get('fileID').value),g=values.get('guid')?.value,type=values.get('type')?.value;
    if(g!==undefined){guid(g);if(type===undefined||!/^(?:0|[1-9][0-9]*)$/.test(type))throw Error('External reference requires a numeric type');}
    else if(type!==undefined)throw Error('Reference type without GUID');
    result.push({property:path,fileId:id,...(g!==undefined?{guid:g.toLowerCase(),type}:{}),source,role:referenceRole(classId,path)});
   }catch(e){bad(e.message);}
   return;
  }
  for(const entry of n.value)visit(entry.node,path+'/'+jsonPointerPart(entry.key));
 }
 visit(ast,'');return result;
}

function metadata(context,path){
 const issues=[];let parsed;
 try{parsed=parseSubset(context,0,context.text.length,issues);}catch(e){if(!(e instanceof SyntaxIssue))throw e;issues.push(context.issue(e));}
 const result={path,objects:[],coverage:'partial',issues,parserVersion:TEXT_PARSER_VERSION};
 if(!parsed||parsed.duplicate||parsed.ast.kind!=='map'){result.reason='Metadata syntax is unsupported or ambiguous';result.rawText=context.text;return result;}
 const {value,positions}=materialize(parsed.ast,context);let metaGuid;
 try{metaGuid=guid(value.guid);}catch{issues.push({code:'META_GUID_INVALID',message:'Metadata requires one 32-digit GUID',source:positions['/guid']??context.source(0,context.text.length),propertyPath:'/guid'});}
 if(value.fileFormatVersion!=='2')issues.push({code:'META_VERSION_UNVERIFIED',message:'Only fileFormatVersion 2 has a verified metadata identity contract',source:positions['/fileFormatVersion']??context.source(0,context.text.length),propertyPath:'/fileFormatVersion'});
 if(value.folderAsset!==undefined&&!['yes','no'].includes(value.folderAsset))issues.push({code:'META_FOLDER_FLAG_UNSUPPORTED',message:'Unsupported folderAsset flag',source:positions['/folderAsset'],propertyPath:'/folderAsset'});
 if(metaGuid&&!issues.length)result.meta={guid:metaGuid,folderAsset:value.folderAsset==='yes',properties:value,propertySources:positions};
 if(issues.length){result.reason='Metadata identity is not fully verified';result.rawText=context.text;}else result.coverage='meta-only';
 return result;
}

export function parseUnityFile({path,text}={}){
 safePath(path);const context=textContext(text),issues=[],objects=[],unparsedDocuments=[];
 const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.exec(text);
 if(controls)return {path,objects,coverage:'opaque',reason:'Unsupported text encoding/control character',issues:[{code:'TEXT_CHARACTER_UNSUPPORTED',message:'Invalid control character or Unicode scalar',source:context.source(controls.index,controls.index+controls[0].length)}],parserVersion:TEXT_PARSER_VERSION};
 if(/\.meta$/i.test(path))return metadata(context,path);
 const headers=context.lines.filter(l=>l.indent===0&&l.content.startsWith('---'));
 if(headers.length>TEXT_LIMITS.maxDocuments)limit('UNITY_DOCUMENT_LIMIT');
 if(!headers.length)return {path,objects,coverage:'opaque',reason:'No Unity serialized document header',issues:[{code:'UNITY_HEADER_MISSING',message:'Expected a Unity !u! document header',source:context.source(0,text.length)}],rawText:text,parserVersion:TEXT_PARSER_VERSION};
 let preambleValid=true;const directives=new Set();
 for(const line of context.lines){if(line.start>=headers[0].start)break;if(!line.content.trim()||line.content.startsWith('#'))continue;
  if(line.indent===0&&['%YAML 1.1','%TAG !u! tag:unity3d.com,2011:'].includes(line.content)&&!directives.has(line.content)){directives.add(line.content);continue;}
  preambleValid=false;issues.push({code:'UNITY_PREAMBLE_UNSUPPORTED',message:'Unexpected or repeated Unity preamble directive',source:context.source(line.contentStart,line.end)});
 }
 if(!preambleValid)unparsedDocuments.push({source:context.source(0,headers[0].start),rawText:text.slice(0,headers[0].start),reason:'Unsupported Unity preamble'});
 const ids=new Map();
 for(let i=0;i<headers.length;i++){
  const header=headers[i],end=headers[i+1]?.start??text.length,source=context.source(header.start,end),match=/^--- !u!([0-9]+) &(-?(?:0|[1-9][0-9]*))(?: stripped)?$/.exec(header.content);
  if(!match){issues.push({code:'UNITY_HEADER_INVALID',message:'Malformed Unity document header',source:context.source(header.start,header.end)});unparsedDocuments.push({source,rawText:text.slice(header.start,end),reason:'Malformed Unity document header'});continue;}
  const classId=match[1];if(classId.length>32)limit('UNITY_CLASS_ID_LIMIT');let id;try{id=fileId(match[2],{zero:false});}catch(e){issues.push({code:'UNITY_FILE_ID_INVALID',message:e.message,source:context.source(header.start,header.end)});unparsedDocuments.push({source,rawText:text.slice(header.start,end),reason:e.message});continue;}
  const object={fileId:id,classId,rootType:null,properties:Object.create(null),propertySources:Object.create(null),references:[],parameters:[],parameterUses:[],source,coverage:'partial'};
  objects.push(object);const same=ids.get(id)??[];same.push(object);ids.set(id,same);
  const localIssues=[];let parsed;
  try{parsed=parseSubset(context,header.next,end,localIssues);}catch(e){if(!(e instanceof SyntaxIssue))throw e;localIssues.push(context.issue(e));}
  if(parsed&&!parsed.duplicate){
   if(parsed.ast.kind!=='map'||parsed.ast.value.length!==1||parsed.ast.value[0].node.kind!=='map')localIssues.push({code:'UNITY_ROOT_UNSUPPORTED',message:'A Unity document needs exactly one mapping root',source});
   else{
    const entry=parsed.ast.value[0];object.rootType=entry.key;
    if(own(roots,classId)&&roots[classId]!==entry.key)localIssues.push({code:'UNITY_CLASS_ROOT_MISMATCH',message:'Unity classID and root name disagree',source});
    else{
     const data=materialize(entry.node,context);object.properties=data.value;object.propertySources=data.positions;
     if(preambleValid){object.references=referencesFrom(entry.node,context,classId,localIssues);const rules=deriveParameterRules(object);object.parameters=rules.parameters;object.parameterUses=rules.parameterUses;localIssues.push(...rules.issues);object.ruleSetVersion=TEXT_RULES_VERSION;object.coverage=localIssues.length?'partial':'serialized';}
    }
   }
  }
  if(!parsed||parsed.duplicate||!preambleValid||localIssues.some(x=>x.code==='UNITY_ROOT_UNSUPPORTED'||x.code==='UNITY_CLASS_ROOT_MISMATCH')){object.rawText=text.slice(header.start,end);object.references=[];object.parameters=[];object.parameterUses=[];}
  issues.push(...localIssues);
 }
 for(const entries of ids.values())if(entries.length>1){const first=entries[0];for(const o of entries){o.coverage='partial';o.references=[];o.parameters=[];o.parameterUses=[];}issues.push({code:'DUPLICATE_DOCUMENT_FILE_ID',message:`Duplicate document fileID: ${first.fileId}`,source:first.source,relatedSources:entries.slice(1).map(o=>o.source)});}
 const coverage=issues.length||objects.some(o=>o.coverage!=='serialized')?'partial':'serialized';
 return {path,objects,coverage,...(coverage==='partial'?{reason:'Some document syntax, identity or rule semantics are unresolved'}:{}),issues,unparsedDocuments,parserVersion:TEXT_PARSER_VERSION};
}
