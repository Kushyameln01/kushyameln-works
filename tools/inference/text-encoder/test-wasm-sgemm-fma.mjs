import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import wabtFactory from '/workspace/work/inference/hike-kernel/toolchain/node_modules/wabt/index.js';

const path=new URL('./wasm-sgemm-fma.mjs',import.meta.url);
assert.ok(existsSync(path),'Private SGEMM folded-WAT lowering is missing');
const {lowerSgemmWat}=await import(path);
const wabt=await wabtFactory();
const fixture=`(module
 (func (export "left") (param f32 f32 f32) (result f32)
  (f32x4.extract_lane 0 (f32x4.add (f32x4.mul (f32x4.splat (local.get 0)) (f32x4.splat (local.get 1))) (f32x4.splat (local.get 2)))))
 (func (export "right") (param f32 f32 f32) (result f32)
  (f32x4.extract_lane 0 (f32x4.add (f32x4.splat (local.get 2)) (f32x4.mul (f32x4.splat (local.get 0)) (f32x4.splat (local.get 1))))))
 (func (export "alpha") (param f32 f32 f32 f32 f32 f32 f32 f32 f32) (result f32) (local v128)
  (local.set 9 (f32x4.splat (local.get 8)))
  (f32x4.extract_lane 0 (f32x4.add (f32x4.mul (f32x4.splat (local.get 0)) (local.get 9)) (f32x4.splat (local.get 1)))))
)`;
async function compile(wat){const module=wabt.parseWat('sgemm-operator-test.wat',wat,{simd:true,relaxed_simd:true});try{module.validate();return(await WebAssembly.instantiate(module.toBinary({}).buffer)).instance.exports;}finally{module.destroy();}}
const transformed=lowerSgemmWat(fixture),original=await compile(fixture),candidate=await compile(transformed.wat);
assert.equal(transformed.fusions,2,'Alpha multiplication outside K accumulation must remain separate');
for(const name of ['left','right']){
 assert.equal(candidate[name](2,3,5),11,'FMA operand order must be a*b+c');
 assert.equal(original[name](1+2**-23,1-2**-23,-1),0);
 assert.equal(candidate[name](1+2**-23,1-2**-23,-1),-(2**-46),'Host relaxed_madd must actually fuse in this diagnostic host');
}
const args=[1+2**-23,-1,0,0,0,0,0,0,1-2**-23];
assert.equal(original.alpha(...args),0);assert.equal(candidate.alpha(...args),0,'Final alpha/C addition must not be fused');

// The result must preserve the evaluation of C before a right-hand product.
// Both examples use exact integers: any mismatch is semantic, not F32 rounding.
const sideEffects=`(module
 (func (export "captureBeforeOverwrite") (param f32 f32 f32) (result f32) (local v128)
  (local.set 3 (f32x4.splat (local.get 2)))
  (f32x4.extract_lane 0 (f32x4.add (local.get 3) (f32x4.mul (local.tee 3 (f32x4.splat (local.get 0))) (f32x4.splat (local.get 1))))))
 (func (export "writeBeforeProductRead") (param f32 f32 f32) (result f32) (local v128)
  (local.set 3 (f32x4.splat (local.get 0)))
  (f32x4.extract_lane 0 (f32x4.add (local.tee 3 (f32x4.splat (local.get 2))) (f32x4.mul (local.get 3) (f32x4.splat (local.get 1))))))
 (func (export "branchBeforeProduct") (param f32 f32 f32) (result f32)
  (f32x4.extract_lane 0 (block (result v128)
   (drop (f32x4.add (br 0 (f32x4.splat (local.get 2))) (f32x4.mul (f32x4.splat (local.get 0)) (f32x4.splat (local.get 1)))))
   (f32x4.splat (f32.const 99)))))
)`;
const sideOriginal=await compile(sideEffects),sideCandidate=await compile(lowerSgemmWat(sideEffects).wat);
const sideResults=Object.fromEntries(['captureBeforeOverwrite','writeBeforeProductRead','branchBeforeProduct'].map(name=>[name,{original:sideOriginal[name](2,3,5),candidate:sideCandidate[name](2,3,5)}]));

// Reuse the exact public vendor's two opaque bodies. No model is loaded and no
// profile is exported. Small exact-dyadic matrices independently verify both
// Zero/Add and the one/two-row, K-tail and N-tail branches of the actual kernels.
const vendor=await readFile(new URL('../../../docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm',import.meta.url));
assert.equal(createHash('sha256').update(vendor).digest('hex'),'be0e129949062ad50290ef94683fac8be5bb6156f709e030b7a5f1661a2f6c17');
function decode(at){let value=0,shift=0;for(;;){const byte=vendor[at++];value+=(byte&127)*2**shift;if(byte<128)return[value,at];shift+=7;}}
function encode(value){const out=[];while(value>127){out.push(value%128|128);value=Math.floor(value/128);}out.push(value);return Uint8Array.from(out);}
function field(kind,payload){return Buffer.concat([Buffer.from([kind]),encode(payload.length),payload]);}
const bodies=[];
for(let at=8;at<vendor.length;){const kind=vendor[at], [size,start]=decode(at+1),end=start+size;if(kind===10){let[count,pos]=decode(start);for(let index=0;index<count;index++){const[n,begin]=decode(pos);if(index===1365-99||index===1946-99)bodies.push(vendor.subarray(begin,begin+n));pos=begin+n;}}at=end;}
assert.deepEqual(bodies.map(body=>createHash('sha256').update(body).digest('hex')),['f7728808b5f87253962b9f639f830459c0961fbc2cd2f8463534e97ae5a7e534','9e72cc3a5fb5a445d440bf86c3de4b8bb338ee3773f763c730af6227034c8f08']);
const exports=Buffer.concat([Buffer.from([3]),...[[Buffer.from('memory'),2,0],[Buffer.from('zero'),0,0],[Buffer.from('add'),0,1]].map(([name,kind,index])=>Buffer.concat([encode(name.length),name,Buffer.from([kind,index])]))]);
const raw=Buffer.concat([Buffer.from([0,97,115,109,1,0,0,0]),field(1,Buffer.from([1,96,9,127,127,127,127,127,127,127,127,125,1,127])),field(3,Buffer.from([2,0,0])),field(5,Buffer.from([1,0,1])),field(7,exports),field(10,Buffer.concat([Buffer.from([2]),...bodies.flatMap(body=>[encode(body.length),body])]))]);
const baseline=(await WebAssembly.instantiate(raw)).instance.exports;
const parsed=wabt.readWasm(new Uint8Array(raw),{readDebugNames:false});let actualCandidate;
try{actualCandidate=await compile(lowerSgemmWat(parsed.toText({foldExprs:true})).wat);}finally{parsed.destroy();}
function execute(kernel,{m,n,k,add,alpha}){
 const lda=k+3,ldc=n+5,aOffset=16,bOffset=Math.ceil((aOffset+m*lda+16)/4)*4,bSize=Math.ceil(n/16)*k*16,cOffset=bOffset+bSize+16,total=cOffset+m*ldc+16;
 if(total*4>kernel.memory.buffer.byteLength)kernel.memory.grow(Math.ceil((total*4-kernel.memory.buffer.byteLength)/65536));
 const memory=new Float32Array(kernel.memory.buffer);memory.fill(0,0,total);
 const av=(row,column)=>(row*3+column*5)%7-3,bv=(row,column)=>(row*7+column*3)%9-4,cv=(row,column)=>(row+column)%5-2;
 for(let row=0;row<m;row++)for(let q=0;q<k;q++)memory[aOffset+row*lda+q]=av(row,q);
 let at=bOffset;for(let column=0;column<n;column+=16)for(let q=0;q<k;q++)for(let lane=0;lane<16;lane++)memory[at++]=column+lane<n?bv(q,column+lane):0;
 const expected=new Float32Array(m*ldc).fill(13);memory.fill(13,cOffset,cOffset+m*ldc);
 for(let row=0;row<m;row++)for(let column=0;column<n;column++){
  memory[cOffset+row*ldc+column]=cv(row,column);let sum=0;for(let q=0;q<k;q++)sum+=av(row,q)*bv(q,column);
  expected[row*ldc+column]=add?sum*alpha+cv(row,column):sum*alpha;
 }
 for(let row=0;row<m;){const taken=kernel[add?'add':'zero']((aOffset+row*lda)*4,bOffset*4,(cOffset+row*ldc)*4,k,m-row,n,lda,ldc,alpha);assert.ok(taken===1||taken===2);row+=taken;}
 return{actual:new Float32Array(memory.subarray(cOffset,cOffset+m*ldc)),expected};
}
let cases=0,failedCases=0,maximumError=0;const firstFailures=[];
for(const m of [1,2,3,5])for(const n of [1,2,3,4,7,8,12,15,16,17,20,31,32,33])for(const k of [1,2,3,4,7,8,17,31,64,129])for(const alpha of [1,.5,2,-1])for(const add of [false,true]){
 const input={m,n,k,alpha,add},strict=execute(baseline,input),fused=execute(actualCandidate,input);cases++;
 assert.deepEqual(strict.actual,strict.expected,'Independent packing/oracle must first match the unchanged strict kernel: '+JSON.stringify(input));
 let error=0;for(let i=0;i<fused.actual.length;i++)error=Math.max(error,Math.abs(fused.actual[i]-fused.expected[i]));
 if(error){failedCases++;maximumError=Math.max(maximumError,error);if(firstFailures.length<4)firstFailures.push({...input,maxAbs:error});}
}
console.log(JSON.stringify({scope:'NN0 exact-dyadic Zero/Add SGEMM semantic verification',sideResults,cases,failedCases,maximumError,firstFailures}));
assert.equal(sideResults.captureBeforeOverwrite.candidate,11,'C must be captured before A overwrites the same local');
assert.equal(sideResults.writeBeforeProductRead.candidate,20,'C side effects must precede product reads');
assert.equal(sideResults.branchBeforeProduct.candidate,5,'Unsafe branch-depth operands must retain the original expression');
assert.equal(failedCases,0,'FMA must preserve exact-dyadic SGEMM semantics across all tested branches');
console.log('PASS private SGEMM FMA operand/evaluation order, strict cancellation, alpha exclusion and kernel sweep (NN0)');
