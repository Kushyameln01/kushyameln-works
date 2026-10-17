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
const rawArgs = process.argv.slice(2), combined = rawArgs.includes('--combined');
const args = rawArgs.filter(value => value !== '--combined'), baseline = await run(args);
if (baseline.status !== 'PASS') { process.stdout.write(JSON.stringify(baseline) + '\n'); process.exitCode = baseline.status === 'BLOCKED' ? 2 : 1; }
else {
  const out = baseline.outputDirectory, work = path.join(out, 'fork-work'), inputs = path.join(repo, 'development/vr180/build-inputs');
  const prototype = path.join(repo, 'development/vr180/input-index-prototype');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const report = {schemaVersion: 1, status: 'FAIL', baseline, publicFilesWritten: false, version: 'private-input-index-1',
    variant: combined ? 'combined-input-output' : 'input-only', patches: []};
  let esbuild;
  try {
    await mkdir(work);
    execFileSync('tar', ['-xzf', path.join(repo, 'docs/shared/media-basic/vendor/mediabunny-1.61.5-source.tgz'), '--directory', work,
      '--strip-components=1', '--no-same-owner', '--no-same-permissions', 'package/src', 'package/package.json', 'package/LICENSE']);
    await mkdir(path.join(work, 'shared'));
    const provenance = JSON.parse(await readFile(path.join(inputs, 'provenance.json'), 'utf8'));
    for (const entry of provenance.recoveredFiles) await copyFile(path.join(inputs, 'mediabunny-1.61.5', entry.path), path.join(work, entry.path));
    for (const kind of combined ? ['output', 'input'] : ['input']) {
      const directory = path.join(repo, `development/vr180/${kind}-index-prototype`), file = path.join(directory, `mediabunny-${kind}-index.patch`);
      const patch = await readFile(file), proof = JSON.parse(await readFile(path.join(directory, 'patch-provenance.json'), 'utf8'));
      if (sha(patch) !== proof.patchSha256) throw Error('PATCH_HASH_MISMATCH');
      for (const [name, hashes] of Object.entries(proof.files)) if (sha(await readFile(path.join(work, name))) !== hashes.originalSha256) throw Error('ORIGINAL_SOURCE_MISMATCH');
      execFileSync('git', ['apply', '--check', file], {cwd: work}); execFileSync('git', ['apply', file], {cwd: work});
      for (const [name, hashes] of Object.entries(proof.files)) if (sha(await readFile(path.join(work, name))) !== hashes.patchedSha256) throw Error('PATCHED_SOURCE_MISMATCH');
      report.patches.push({kind, ...proof});
    }
    const require = createRequire(path.join(baseline.esbuild.directory, 'package.json')); esbuild = require(path.join(baseline.esbuild.directory, 'lib/main.js'));
    const context = await esbuild.context({...CORE_OPTIONS, absWorkingDir: work});
    try { await context.rebuild(); } finally { await context.dispose(); }
    const bundle = await readFile(path.join(work, CORE_OPTIONS.outfile));
    const bundleName = combined ? 'mediabunny-input-output-index.mjs' : 'mediabunny-input-index.mjs';
    await writeFile(path.join(out, bundleName), bundle, {flag: 'wx'});
    Object.assign(report, {status: 'PASS', bundleName, bundleBytes: bundle.length, bundleSha256: sha(bundle),
      controllerSha256: sha(await readFile(path.join(prototype, 'input-index.mjs'))),
      presentationSha256: sha(await readFile(path.join(prototype, 'presentation-index.mjs'))), buildOptions: CORE_OPTIONS});
    report.runtimeFiles = {};
    report.publicInputParserSha256 = sha(await readFile(path.join(repo, 'docs/shared/vr180/mp4.mjs')));
    for (const relative of ['index-prototype/index-store.mjs', 'index-prototype/job-owner.mjs', 'output-index-prototype/mp4-output-inspect.mjs',
      ...(combined ? ['output-index-prototype/output-index.mjs'] : [])]) {
      report.runtimeFiles[relative] = sha(await readFile(path.join(repo, 'development/vr180', relative)));
    }
  } catch (error) { report.error = error.stack; }
  finally { esbuild?.stop(); await rm(work, {recursive: true, force: true}); }
  await writeFile(path.join(out, 'fork-build-result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  process.stdout.write(JSON.stringify(report) + '\n'); if (report.status !== 'PASS') process.exitCode = 1;
}
