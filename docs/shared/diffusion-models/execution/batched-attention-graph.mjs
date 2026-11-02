// Dependency-free ONNX protobuf, opset 17. Q and K retain exact logical tails.
const cat=(...parts)=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;};
function varint(n){const bytes=[];do{const value=n%128;n=Math.floor(n/128);bytes.push(value+(n?128:0));}while(n);return Uint8Array.from(bytes);}
const integer=(field,n)=>cat(varint(field*8),varint(n));
const message=(field,bytes)=>cat(varint(field*8+2),varint(bytes.length),bytes);
const text=(field,value)=>message(field,new TextEncoder().encode(value));
const attrInt=(name,value)=>cat(text(1,name),integer(3,value),integer(20,2));
const attrInts=(name,values)=>cat(text(1,name),...values.map(value=>integer(8,value)),integer(20,7));
function info(name,shape){const dims=cat(...shape.map(n=>message(1,typeof n==='number'?integer(1,n):text(2,n))));return cat(text(1,name),message(2,message(1,cat(integer(1,1),message(2,dims)))));}
function node(name,op,inputs,outputs,attrs=[]){return cat(...inputs.map(value=>text(1,value)),...outputs.map(value=>text(2,value)),text(3,name),text(4,op),...attrs.map(value=>message(5,value)));}
function tensor(name,shape,type,bytes){return cat(...shape.map(n=>integer(1,n)),integer(2,type),text(8,name),message(9,bytes));}
export const BATCHED_ATTENTION_SCALE=Math.fround(1/Math.sqrt(128));

export function createBatchedAttentionGraph(){
 const scale=new Uint8Array(4);new DataView(scale.buffer).setFloat32(0,BATCHED_ATTENTION_SCALE,true);
 const axes=new Uint8Array(8);new DataView(axes.buffer).setBigInt64(0,2n,true);
 const nodes=[
  node('head-key-transpose','Transpose',['k'],['kt'],[attrInts('perm',[0,2,1])]),
  node('all-head-query-key','MatMul',['q','kt'],['rawScores']),
  node('f32-scaled-scores','Mul',['rawScores','scale'],['scores']),
  node('tile-row-max','ReduceMax',['scores'],['tileMax'],[attrInts('axes',[2]),attrInt('keepdims',0)]),
  node('global-row-max','Max',['previousMax','tileMax'],['max']),
  node('max-broadcast','Unsqueeze',['max','lastAxis'],['maxColumn']),
  node('center-scores','Sub',['scores','maxColumn'],['centered']),
  node('stable-probabilities','Exp',['centered'],['probabilities']),
  node('rescale-shift','Sub',['previousMax','max'],['shift']),
  node('rescale-alpha','Exp',['shift'],['alpha']),
  node('rescale-denominator','Mul',['previousDenominator','alpha'],['oldDenominator']),
  node('tile-denominator','ReduceSum',['probabilities','lastAxis'],['tileDenominator'],[attrInt('keepdims',0)]),
  node('global-denominator','Add',['oldDenominator','tileDenominator'],['denominator']),
  node('all-head-context','MatMul',['probabilities','v'],['tileContext']),
  node('alpha-broadcast','Unsqueeze',['alpha','lastAxis'],['alphaColumn']),
  node('rescale-context','Mul',['previousContext','alphaColumn'],['oldContext']),
  node('global-context','Add',['oldContext','tileContext'],['context'])
 ];
 const inputs=[['q',[40,'Q',128]],['k',[40,'K',128]],['v',[40,'K',128]],['previousMax',[40,'Q']],['previousDenominator',[40,'Q']],['previousContext',[40,'Q',128]]];
 const outputs=[['max',[40,'Q']],['denominator',[40,'Q']],['context',[40,'Q',128]]];
 const graph=cat(...nodes.map(value=>message(1,value)),text(2,'bounded-h40-q128-k256-d128-f32-online-attention'),message(5,tensor('scale',[1],1,scale)),message(5,tensor('lastAxis',[1],7,axes)),...inputs.map(value=>message(11,info(...value))),...outputs.map(value=>message(12,info(...value))));
 return cat(integer(1,8),text(2,'KushyamelnWorks-batched-f32-attention'),message(7,graph),message(8,integer(2,17)));
}
