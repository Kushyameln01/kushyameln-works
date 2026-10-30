import fs from 'node:fs';
import crypto from 'node:crypto';
import {createProjectionGraph} from './graph.mjs';
const bytes=createProjectionGraph();
fs.writeFileSync(new URL('./projection.onnx',import.meta.url),bytes);
const record={scope:'partial 16x5120 q projection; weights supplied as runtime inputs; not full model export',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),irVersion:8,opset:17,provider:'wasm',inputs:{x:{dtype:'float32',shape:[1,5120]},weight:{dtype:'float32',shape:[16,5120]}},output:{name:'projection',dtype:'float32',shape:[1,16]},node:'Gemm transB=1, no bias; Hike dequant and bias surround this graph'};
fs.writeFileSync(new URL('./projection-manifest.json',import.meta.url),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));
