import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
assert.ok(fs.existsSync(new URL('../euler-kernel.mjs',import.meta.url)), 'Hike Euler host not implemented');
import {runCases} from './cases.mjs';
const bytes=fs.readFileSync(new URL('../kernel/euler.wasm',import.meta.url));
const evidence={runtime:process.version,wasmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),...await runCases(bytes)};
fs.writeFileSync(new URL('../node-results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
