import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const runner=new URL('./run-managed-local-files.mjs',import.meta.url);
const run=(...args)=>spawnSync(process.execPath,[runner.pathname,...args],{encoding:'utf8'});
test('local File runner documents explicit legacy and snapshot-candidate scenarios',()=>{const r=run('--help');assert.equal(r.status,0);assert.match(r.stdout,/--scenario/);assert.match(r.stdout,/legacy/);assert.match(r.stdout,/snapshot-candidate/);});
test('unknown browser scenario rejects before original File or source access',()=>{const r=run('--scenario','invented');assert.notEqual(r.status,0);assert.match(r.stderr,/Unknown scenario/);});
test('snapshot-candidate is recognized while explicit original source flags remain mandatory',()=>{const r=run('--scenario','snapshot-candidate');assert.notEqual(r.status,0);assert.match(r.stderr,/Missing --lora-root/);assert.doesNotMatch(r.stderr,/Unknown argument/);});
test('omitting scenario retains legacy argument-validation behavior',()=>{const r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Missing --lora-root/);assert.doesNotMatch(r.stderr,/Unknown scenario/);});
