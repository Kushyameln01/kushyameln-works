import {readFile,writeFile} from 'node:fs/promises';
import {runRectCases} from './test-rect-cases.mjs';
import * as metadataCodec from '../../../../development/ai-connection/e6/source/g1c-tensor.mjs';
const read=async name=>new Uint8Array(await readFile(name.startsWith('fixture/')?new URL('../../../../development/ai-connection/e6/received-7e091/'+name.slice(8),import.meta.url):new URL(name,import.meta.url)));
const result=await runRectCases(read,{metadataCodec});
await writeFile(new URL('../../../../development/ai-connection/e6/rect-node-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
