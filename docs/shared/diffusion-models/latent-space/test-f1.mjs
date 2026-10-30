import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {runF1Cases} from './test-f1-cases.mjs';
import * as metadataCodec from '../../../../development/ai-connection/e6/source/g1c-tensor.mjs';
const result=await runF1Cases(async name=>new Uint8Array(await readFile(new URL(name,import.meta.url))),{metadataCodec});
await mkdir(new URL('./work/',import.meta.url),{recursive:true});
await writeFile(new URL('./work/f1-node-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
