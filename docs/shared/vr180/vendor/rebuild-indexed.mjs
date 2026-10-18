#!/usr/bin/env node
// Offline rebuild from this distribution's source, supplements, patches and lock.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {copyFile, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('../'));
};
const options = {
  entryPoints: ['src/index.ts'], bundle: true, logLevel: 'info', target: 'es2021',
  logOverride: {'import-is-undefined': 'silent'},
  banner: {js: `/*!
 * Copyright (c) 2026-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */`},
  legalComments: 'none', format: 'esm', minify: true, outfile: 'dist/bundles/mediabunny.min.mjs',
};
const report = {schemaVersion: 1, status: 'FAIL', networkAttempted: false, distributionFilesWritten: false,
  nodeVersion: process.version, platform: process.platform, arch: process.arch};
let out, work, esbuild;
try {
  const args = process.argv.slice(2), parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--esbuild-dir', '--output-dir'].includes(args[i]) || !args[i + 1] || parsed[args[i]]) throw Error('INVALID_BUILD_ARGUMENTS');
    parsed[args[i]] = path.resolve(args[i + 1]);
  }
  if (!parsed['--esbuild-dir'] || !parsed['--output-dir']) throw Error('USAGE: --esbuild-dir <installed esbuild package> --output-dir <new directory outside distribution>');
  const requested = parsed['--output-dir'];
  const target = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  if (within(await realpath(path.join(here, '..')), target)) throw Error('OUTPUT_MUST_BE_OUTSIDE_DISTRIBUTION');
  await mkdir(target); out = target; // Exclusive ownership: never reuse or erase a previous build.
  const proof = JSON.parse(await readFile(path.join(here, 'provenance.json'), 'utf8'));
  if (proof.version !== '1.61.5' || proof.upstreamCommit !== '0664a57bf2f40e5c4efa176c75ebf1d60df69eb8'
      || proof.toolchain.esbuildVersion !== '0.25.1') throw Error('BUILD_PROVENANCE_CHANGED');
  for (const [name, record] of Object.entries(proof.files)) {
    const full = path.resolve(here, name);
    if (!within(here, full)) throw Error('BUILD_SOURCE_PATH_INVALID');
    const bytes = await readFile(full);
    if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) throw Error('BUILD_SOURCE_HASH_MISMATCH: ' + name);
  }
  const esbuildDir = await realpath(parsed['--esbuild-dir']);
  const installed = JSON.parse(await readFile(path.join(esbuildDir, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(here, proof.toolchain.lock), 'utf8'));
  if (installed.name !== 'esbuild' || installed.version !== '0.25.1'
      || lock.packages['node_modules/esbuild'].version !== '0.25.1') throw Error('EXACT_ESBUILD_VERSION_REQUIRED');
  const require = createRequire(path.join(esbuildDir, 'package.json'));
  esbuild = require(path.join(esbuildDir, 'lib/main.js'));
  if (esbuild.version !== '0.25.1') throw Error('ESBUILD_API_VERSION_MISMATCH');
  work = path.join(out, 'work'); await mkdir(work);
  execFileSync('tar', ['-xzf', path.join(here, proof.sourceArchive.path), '--directory', work,
    '--strip-components=1', '--no-same-owner', '--no-same-permissions', 'package/src', 'package/package.json', 'package/LICENSE']);
  await mkdir(path.join(work, 'shared'));
  for (const item of proof.sourceSupplement) {
    if (!within(work, path.resolve(work, item.path))) throw Error('SUPPLEMENT_PATH_INVALID');
    await copyFile(path.join(here, 'source-supplement', item.path), path.join(work, item.path));
  }
  async function build() {
    const context = await esbuild.context({...options, absWorkingDir: work});
    try { await context.rebuild(); } finally { await context.dispose(); }
    return readFile(path.join(work, options.outfile));
  }
  const baseline = await build();
  if (sha(baseline) !== proof.unmodifiedBundleSha256) throw Error('UNMODIFIED_BASELINE_REBUILD_MISMATCH');
  for (const patch of proof.patches) {
    for (const [name, hashes] of Object.entries(patch.files)) {
      if (!within(work, path.resolve(work, name)) || sha(await readFile(path.join(work, name))) !== hashes.originalSha256) throw Error('PATCH_ORIGINAL_MISMATCH');
    }
    execFileSync('git', ['apply', '--check', path.join(here, patch.path)], {cwd: work});
    execFileSync('git', ['apply', path.join(here, patch.path)], {cwd: work});
    for (const [name, hashes] of Object.entries(patch.files)) {
      if (sha(await readFile(path.join(work, name))) !== hashes.patchedSha256) throw Error('PATCHED_SOURCE_MISMATCH');
    }
  }
  const rebuilt = await build();
  if (rebuilt.length !== proof.bundle.bytes || sha(rebuilt) !== proof.bundle.sha256) throw Error('COMBINED_REBUILD_MISMATCH');
  await writeFile(path.join(out, proof.bundle.path), rebuilt, {flag: 'wx'});
  Object.assign(report, {status: 'PASS', upstreamCommit: proof.upstreamCommit, buildOptions: options,
    esbuildVersion: esbuild.version, unmodifiedBundleSha256: sha(baseline),
    bundleBytes: rebuilt.length, bundleSha256: sha(rebuilt), sourceHashesVerified: Object.keys(proof.files).length});
} catch (error) {
  report.error = String(error?.stack ?? error); process.exitCode = 1;
} finally {
  esbuild?.stop();
  if (work) { await rm(work, {recursive: true, force: true}); report.ownedBuildWorkspaceRemoved = true; }
  if (out) await writeFile(path.join(out, 'rebuild-result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
process.stdout.write(JSON.stringify(report) + '\n');
