// A fixed partial Q-projection graph. Weights are runtime tensors from Hike,
// never embedded/copied from the 15GB models into public assets.
const cat=(...xs)=>{const out=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let offset=0;for(const x of xs){out.set(x,offset);offset+=x.length;}return out;};
function varint(n){const bytes=[];do{let b=n%128;n=Math.floor(n/128);bytes.push(b+(n?128:0));}while(n);return Uint8Array.from(bytes);}
const integer=(field,n)=>cat(varint(field*8),varint(n));
const message=(field,bytes)=>cat(varint(field*8+2),varint(bytes.length),bytes);
const text=(field,s)=>message(field,new TextEncoder().encode(s));
function tensorInfo(name,shape){
 const dims=cat(...shape.map(n=>message(1,integer(1,n))));
 const type=message(1,cat(integer(1,1),message(2,dims))); // TensorType.FLOAT
 return cat(text(1,name),message(2,type));
}
export function createProjectionGraph(){
 const transB=cat(text(1,'transB'),integer(3,1),integer(20,2)); // AttributeProto.INT
 const node=cat(text(1,'x'),text(1,'weight'),text(2,'projection'),text(3,'partial-q-linear'),text(4,'Gemm'),message(5,transB));
 const graph=cat(message(1,node),text(2,'bounded-real-weight-q-projection'),message(11,tensorInfo('x',[1,5120])),message(11,tensorInfo('weight',[16,5120])),message(12,tensorInfo('projection',[1,16])));
 return cat(integer(1,8),text(2,'KushyamelnWorks-partial-operator'),message(7,graph),message(8,integer(2,17)));
}
