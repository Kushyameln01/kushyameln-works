export async function createHike(bytes,{capacity=65536}={}){
 if(!Number.isInteger(capacity)||capacity<1||capacity>1048576)throw RangeError('Hike workspace capacity');
 const module=await WebAssembly.compile(bytes);const imports=WebAssembly.Module.imports(module);
 if(imports.length!==1||imports[0].module!=='env'||imports[0].name!=='sqrt'||imports[0].kind!=='function')throw TypeError('Unexpected Hike imports');
 // This is the fixed compiler runtime's standard math primitive, not a RMSNorm fallback.
 let instance=await WebAssembly.instantiate(module,{env:{sqrt:Math.sqrt}}),memory=instance.exports.memory;
 for(const name of ['Affine','MatMul','Divide','RMSNorm'])if(typeof instance.exports[name]!=='function')throw Error('Missing Hike '+name);
 const start=memory.buffer.byteLength,p=[start,start+capacity*4,start+capacity*8];memory.grow(Math.ceil(capacity*12/65536));let live=true,calls=0;
 function alive(){if(!live)throw Error('Hike disposed');}
 function tensor(x){alive();if(!(x instanceof Float32Array)||x.buffer===memory.buffer)throw TypeError('Expected caller-owned Float32Array');new Uint8Array(x.buffer,0,0);for(const v of x)if(!Number.isFinite(v))throw RangeError('Nonfinite tensor');}
 function scalar(x){if(typeof x!=='number'||!Number.isFinite(x)||!Number.isFinite(Math.fround(x)))throw TypeError('Expected finite f32');return Math.fround(x);}
 function result(x){for(const v of x)if(!Number.isFinite(v))throw Error('Nonfinite Hike output');calls++;return x;}
 function pointwise(name,x,coeffs){tensor(x);const y=new Float32Array(x.length);for(let i=0;i<x.length;i+=capacity){const n=Math.min(capacity,x.length-i);new Float32Array(memory.buffer,p[0],n).set(x.subarray(i,i+n));if(instance.exports[name](p[0],n,...coeffs,p[2],capacity)!==n)throw Error('Hike rejected '+name);y.set(new Float32Array(memory.buffer,p[2],n),i);}return result(y);}
 const api={
  stats(){alive();return{capacity,arenaBytes:capacity*12,memoryBytes:memory.buffer.byteLength,calls};},
  affine(x,scale,shift){return pointwise('Affine',x,[scalar(scale),scalar(shift)]);},
  divide(x,divisor){divisor=scalar(divisor);if(divisor===0)throw RangeError('Divide by zero');return pointwise('Divide',x,[divisor]);},
  matmul(a,b,m,k,n){
   tensor(a);tensor(b);for(const dim of [m,k,n])if(!Number.isSafeInteger(dim)||dim<1)throw RangeError('Matrix dimensions');
   if(!Number.isSafeInteger(m*n)||a.length!==m*k||b.length!==k*n||m*k>capacity)throw RangeError('Matrix shape/workspace');
   const width=Math.min(Math.floor(capacity/k),Math.floor(capacity/m));if(width<1)throw RangeError('Matrix workspace');
   const out=new Float32Array(m*n);new Float32Array(memory.buffer,p[0],a.length).set(a);
   for(let column=0;column<n;column+=width){const take=Math.min(width,n-column),right=new Float32Array(memory.buffer,p[1],k*take);
    for(let row=0;row<k;row++)right.set(b.subarray(row*n+column,row*n+column+take),row*take);
    if(instance.exports.MatMul(p[0],p[1],m,k,take,p[2],capacity)!==m*take)throw Error('Hike MatMul failed');
    const y=new Float32Array(memory.buffer,p[2],m*take);for(let row=0;row<m;row++)out.set(y.subarray(row*take,(row+1)*take),row*n+column);
   }return result(out);
  },
  rmsNorm(x,weight,rows,columns,epsilon=1e-6){
   tensor(x);tensor(weight);for(const dim of [rows,columns])if(!Number.isSafeInteger(dim)||dim<1)throw RangeError('RMSNorm dimensions');
   epsilon=scalar(epsilon);if(epsilon<=0||rows*columns!==x.length||weight.length!==columns||columns>capacity)throw RangeError('RMSNorm shape/workspace');
   const out=new Float32Array(x.length),step=Math.floor(capacity/columns);new Float32Array(memory.buffer,p[1],columns).set(weight);
   for(let row=0;row<rows;row+=step){const count=Math.min(step,rows-row);new Float32Array(memory.buffer,p[0],count*columns).set(x.subarray(row*columns,(row+count)*columns));
    if(instance.exports.RMSNorm(p[0],p[1],count,columns,epsilon,p[2],capacity)!==count*columns)throw Error('Hike RMSNorm failed');
    out.set(new Float32Array(memory.buffer,p[2],count*columns),row*columns);
   }return result(out);
  },dispose(){live=false;instance=null;memory=null;}
 };return api;
}
