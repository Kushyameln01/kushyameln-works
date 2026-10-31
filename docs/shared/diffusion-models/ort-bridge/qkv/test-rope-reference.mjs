// Explicit private oracle input. Results contain metadata/errors only, no arrays.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createQkvRope} from './rope.mjs';
const [path,output]=process.argv.slice(2);if(!path||!output)throw Error('Usage: node test-rope-reference.mjs /private/reference.json /path/to/metadata-result.json');
const raw=await readFile(path),ref=JSON.parse(raw);if(ref.schemaVersion!=='bernini-p4-reference/0.1')throw Error('Independent oracle schema mismatch');
const positions=new Float32Array(48),sourceIds=new Int32Array(16);if(ref.coords.length!==16)throw Error('Exact16 oracle positions required');
for(let row=0;row<16;row++){const c=ref.coords[row];positions.set([c.t,c.h,c.w],row*3);sourceIds[row]=c.sourceId;}
const sha=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function compare(actual,expected,gate){let maxAbsolute=0,failed=0;for(let i=0;i<actual.length;i++){const diff=Math.abs(actual[i]-expected[i]);maxAbsolute=Math.max(maxAbsolute,diff);if(!Number.isFinite(diff)||diff>gate.absolute+gate.relative*Math.abs(expected[i]))failed++;}return {elements:actual.length,failed,maxAbsolute,gate};}
const rope=await createQkvRope({wasmBytes:await readFile(new URL('./kernel.wasm',import.meta.url))});
let result;
try{
 const matrix=rope.matrix({positions,sourceIds}),expectedMatrix=Float32Array.from(ref.expected.matrices),matrixComparison=compare(matrix,expectedMatrix,ref.gates.ropeMatrix),applyComparisons={};
 if(expectedMatrix.length!==4096)throw Error('Oracle matrix shape mismatch');
 for(const id of ['q','k']){const full=ref.expected.norm[id];if(full.length!==81920)throw Error('Oracle full5120 norm shape mismatch');const selected=new Float32Array(2048);for(let row=0;row<16;row++)selected.set(full.slice(row*5120,row*5120+128),row*128);const value=rope.apply({values:selected,matrices:matrix}),expected=Float32Array.from(ref.expected[id]);if(expected.length!==2048)throw Error('Oracle selected head shape mismatch');applyComparisons[id]={...compare(value,expected,ref.gates.ropeApply),outputSHA256:sha(value),expectedSHA256:sha(expected)};}
 result={passed:matrixComparison.failed===0&&Object.values(applyComparisons).every(x=>x.failed===0),scope:'Hike RoPE matrix/application versus independent Python NumPy oracle; apply inputs are oracle full-width norm arrays, not actual runtime QKV',referenceSHA256:createHash('sha256').update(raw).digest('hex'),matrix:{...matrixComparison,outputSHA256:sha(matrix),expectedSHA256:sha(expectedMatrix)},apply:applyComparisons,stats:rope.stats(),productionQKVVerified:false,P5:'BLOCKED'};
}finally{rope.dispose();}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,matrixMaxAbs:result.matrix.maxAbsolute,qMaxAbs:result.apply.q.maxAbsolute,kMaxAbs:result.apply.k.maxAbsolute}));if(!result.passed)process.exitCode=1;
