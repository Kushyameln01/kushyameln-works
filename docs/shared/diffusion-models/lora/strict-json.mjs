// Validate object keys before JSON.parse discards duplicate occurrences.
export function parseStrictJson(text,{maxDepth=32}={}) {
 if(typeof text!=='string'||!Number.isSafeInteger(maxDepth)||maxDepth<1)throw TypeError('Invalid strict JSON input');
 let at=0;
 const bad=message=>{throw new SyntaxError(message+' at '+at);};
 const space=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]))at++;};
 function string(){
  if(text[at]!=='"')bad('Expected JSON string');
  const begin=at++;
  while(at<text.length){const c=text[at++];if(c==='"')return JSON.parse(text.slice(begin,at));if(c==='\\')at++;}
  bad('Unterminated JSON string');
 }
 function value(depth){
  space();const c=text[at];
  if(c==='{'||c==='['){
   if(depth>=maxDepth)bad('JSON depth exceeds '+maxDepth);
   at++;space();const close=c==='{'?'}':']';
   if(text[at]===close){at++;return;}
   const keys=new Set();
   while(at<text.length){
    if(c==='{'){
     space();const key=string();if(keys.has(key))bad('Duplicate JSON key');keys.add(key);
     space();if(text[at++]!==':')bad('Expected JSON colon');
    }
    value(depth+1);space();
    if(text[at]===close){at++;return;}
    if(text[at++]!==',')bad('Expected JSON delimiter');
   }
   bad('Unterminated JSON container');
  }
  if(c==='"'){string();return;}
  const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
  if(!match)bad('Invalid JSON value');at+=match[0].length;
 }
 value(0);space();if(at!==text.length)bad('Trailing JSON data');
 return JSON.parse(text);
}
