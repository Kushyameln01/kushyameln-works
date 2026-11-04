import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
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
console.log('PASS private SGEMM FMA operand order, strict cancellation and alpha exclusion (NN0)');
