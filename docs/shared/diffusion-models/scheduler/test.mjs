import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
assert.ok(fs.existsSync(path.join(root,'build/scheduler.wasm')),'Hike scheduler/CONST implementation missing');
const {runCases}=await import('./test-cases.mjs');
const result=await runCases(async p=>new Uint8Array(fs.readFileSync(path.join(root,p))));
fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work/node-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
