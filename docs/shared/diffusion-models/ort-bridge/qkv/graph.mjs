// Fixed N16 x hidden5120 -> output-row tile16. All weights are runtime inputs.
const cat=(...xs)=>{const out=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let o=0;for(const x of xs){out.set(x,o);o+=x.length;}return out;};
function vint(n){const b=[];do{const x=n%128;n=Math.floor(n/128);b.push(x+(n?128:0));}while(n);return Uint8Array.from(b);}
const integer=(f,n)=>cat(vint(f*8),vint(n));
const message=(f,b)=>cat(vint(f*8+2),vint(b.length),b);
const text=(f,s)=>message(f,new TextEncoder().encode(s));
function info(name,shape){const dimensions=cat(...shape.map(n=>message(1,integer(1,n))));const tensorType=message(1,cat(integer(1,1),message(2,dimensions)));return cat(text(1,name),message(2,tensorType));}
export function createQkvProjectionGraph(){
 const transB=cat(text(1,'transB'),integer(3,1),integer(20,2));
 const node=cat(text(1,'x'),text(1,'weight'),text(2,'projection'),text(3,'n16-hidden5120-row16'),text(4,'Gemm'),message(5,transB));
 const graph=cat(message(1,node),text(2,'actual-weight-qkv-selected-token-diagnostic'),message(11,info('x',[16,5120])),message(11,info('weight',[16,5120])),message(12,info('projection',[16,16])));
 return cat(integer(1,8),text(2,'KushyamelnWorks-bounded-qkv'),message(7,graph),message(8,integer(2,17)));
}
