#!/usr/bin/env node
// Private fork only. First require exact reproduction of the unchanged vendor.
import {run, CORE_OPTIONS} from './rebuild-vendor-core.mjs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, copyFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), baseline = await run(args);
if (baseline.status !== 'PASS') { process.stdout.write(JSON.stringify(baseline) + '\n'); process.exitCode = baseline.status === 'BLOCKED' ? 2 : 1; }
else {
  const out = baseline.outputDirectory, work = path.join(out, 'fork-work'), inputs = path.join(repo, 'development/vr180/build-inputs');
  const prototype = path.join(repo, 'development/vr180/output-index-prototype');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const report = {schemaVersion: 1, status: 'FAIL', baseline, publicFilesWritten: false, version: 'private-output-index-1'};
  let esbuild;
  try {
    await mkdir(work);
    execFileSync('tar', ['-xzf', path.join(repo, 'docs/shared/media-basic/vendor/mediabunny-1.61.5-source.tgz'), '--directory', work,
      '--strip-components=1', '--no-same-owner', '--no-same-permissions', 'package/src', 'package/package.json', 'package/LICENSE']);
    await mkdir(path.join(work, 'shared'));
    const provenance = JSON.parse(await readFile(path.join(inputs, 'provenance.json'), 'utf8'));
    for (const entry of provenance.recoveredFiles) await copyFile(path.join(inputs, 'mediabunny-1.61.5', entry.path), path.join(work, entry.path));
    const patch = await readFile(path.join(prototype, 'mediabunny-output-index.patch'));
    const proof = JSON.parse(await readFile(path.join(prototype, 'patch-provenance.json'), 'utf8'));
    if (sha(patch) !== proof.patchSha256) throw Error('PATCH_HASH_MISMATCH');
    for (const [name, hashes] of Object.entries(proof.files)) if (sha(await readFile(path.join(work, name))) !== hashes.originalSha256) throw Error('ORIGINAL_SOURCE_MISMATCH');
    execFileSync('git', ['apply', '--check', path.join(prototype, 'mediabunny-output-index.patch')], {cwd: work});
    execFileSync('git', ['apply', path.join(prototype, 'mediabunny-output-index.patch')], {cwd: work});
    for (const [name, hashes] of Object.entries(proof.files)) if (sha(await readFile(path.join(work, name))) !== hashes.patchedSha256) throw Error('PATCHED_SOURCE_MISMATCH');
    const require = createRequire(path.join(baseline.esbuild.directory, 'package.json')); esbuild = require(path.join(baseline.esbuild.directory, 'lib/main.js'));
    const context = await esbuild.context({...CORE_OPTIONS, absWorkingDir: work});
    try { await context.rebuild(); } finally { await context.dispose(); }
    const bundle = await readFile(path.join(work, CORE_OPTIONS.outfile));
    await writeFile(path.join(out, 'mediabunny-output-index.mjs'), bundle, {flag: 'wx'});
    Object.assign(report, {status: 'PASS', patch: proof, bundleBytes: bundle.length, bundleSha256: sha(bundle),
      controllerSha256: sha(await readFile(path.join(prototype, 'output-index.mjs'))), buildOptions: CORE_OPTIONS});
    report.runtimeFiles = {};
    for (const relative of ['index-prototype/index-store.mjs', 'index-prototype/job-owner.mjs', 'output-index-prototype/mp4-output-inspect.mjs']) {
      report.runtimeFiles[relative] = sha(await readFile(path.join(repo, 'development/vr180', relative)));
    }
  } catch (error) { report.error = error.stack; }
  finally { esbuild?.stop(); await rm(work, {recursive: true, force: true}); }
  await writeFile(path.join(out, 'fork-build-result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  process.stdout.write(JSON.stringify(report) + '\n'); if (report.status !== 'PASS') process.exitCode = 1;
}
