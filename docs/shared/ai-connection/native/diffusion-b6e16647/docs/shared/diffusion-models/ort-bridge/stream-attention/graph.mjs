// Exact logical K dimension: the last56 keys remain56, never zero-padded64.
const cat=(...xs)=>{const r=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let at=0;for(const x of xs){r.set(x,at);at+=x.length;}return r;};
function vi(n){const r=[];do{const x=n%128;n=Math.floor(n/128);r.push(x+(n?128:0));}while(n);return Uint8Array.from(r);}
const integer=(f,n)=>cat(vi(f*8),vi(n));
const message=(f,b)=>cat(vi(f*8+2),vi(b.length),b);
const text=(f,s)=>message(f,new TextEncoder().encode(s));
const attrInt=(name,n)=>cat(text(1,name),integer(3,n),integer(20,2));
const attrInts=(name,ns)=>cat(text(1,name),...ns.map(n=>integer(8,n)),integer(20,7));
function info(name,shape){const dims=cat(...shape.map(n=>message(1,typeof n==='number'?integer(1,n):text(2,n))));return cat(text(1,name),message(2,message(1,cat(integer(1,1),message(2,dims)))));}
function node(name,op,inputs,outputs,attrs=[]){return cat(...inputs.map(x=>text(1,x)),...outputs.map(x=>text(2,x)),text(3,name),text(4,op),...attrs.map(a=>message(5,a)));}
function tensor(name,shape,type,bytes){return cat(...shape.map(n=>integer(1,n)),integer(2,type),text(8,name),message(9,bytes));}
export const ATTENTION_SCALE=Math.fround(1/Math.sqrt(128));
export function createStreamAttentionGraph(){
 const scale=new Uint8Array(4);new DataView(scale.buffer).setFloat32(0,ATTENTION_SCALE,true);
 const axes=new Uint8Array(8);new DataView(axes.buffer).setBigInt64(0,1n,true);
 const nodes=[node('key-transpose','Transpose',['k'],['kt'],[attrInts('perm',[1,0])]),node('query-key','MatMul',['q','kt'],['rawScores']),node('scaled-score','Mul',['rawScores','scale'],['scores']),node('tile-row-max','ReduceMax',['scores'],['tileMax'],[attrInts('axes',[1]),attrInt('keepdims',0)]),node('global-row-max','Max',['prevMax','tileMax'],['newMax']),node('row-max-column','Unsqueeze',['newMax','axes'],['maxColumn']),node('center-score','Sub',['scores','maxColumn'],['centered']),node('stable-exp','Exp',['centered'],['weights']),node('rescale-shift','Sub',['prevMax','newMax'],['shift']),node('stable-alpha','Exp',['shift'],['alpha'])];
 const graph=cat(...nodes.map(n=>message(1,n)),text(2,'one-head-global-stream-attention-score-exp'),message(5,tensor('scale',[1],1,scale)),message(5,tensor('axes',[1],7,axes)),message(11,info('q',[16,128])),message(11,info('k',['K',128])),message(11,info('prevMax',[16])),message(12,info('weights',[16,'K'])),message(12,info('newMax',[16])),message(12,info('alpha',[16])));
 return cat(integer(1,8),text(2,'KushyamelnWorks-streamed-boundary'),message(7,graph),message(8,integer(2,17)));
}
