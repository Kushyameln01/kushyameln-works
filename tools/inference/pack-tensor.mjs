import fs from 'node:fs';import {encodeTensor} from '../../docs/shared/inference/tensor.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,list)=>i%2?a:[...a,[v.replace(/^--/,''),list[i+1]]],[]));
if(!args.input||!args.output||!args.shape||!args.meaning)throw Error('Use --input input.f32 --output output.wktensor --shape 1,3,5,16,16 --meaning raw-decoder-rgb [--layout NCTHW]');
const b=fs.readFileSync(args.input);if(b.byteLength%4)throw Error('Input must be little-endian f32');const bytes=new Uint8Array(b).slice();
const tensor={dtype:'float32',shape:args.shape.split(',').map(Number),layout:args.layout??'NCTHW',meaning:args.meaning,data:new Float32Array(bytes.buffer)};
fs.writeFileSync(args.output,await encodeTensor(tensor));console.log(args.output);
