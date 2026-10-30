import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
assert.ok(fs.existsSync(path.join(root,'build/latent-space.wasm')),'Hike latent-space numerical implementation missing');
const {runCases}=await import('./test-cases.mjs');const result=await runCases(async name=>new Uint8Array(fs.readFileSync(path.join(root,name))));
fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work/node-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
