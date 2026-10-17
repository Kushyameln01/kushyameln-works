#!/usr/bin/env node
// Rebuild the unmodified Mediabunny core only. Never writes a product file.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { constants, copyFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INPUTS = path.join(REPO, 'development/vr180/build-inputs');
const VENDOR = path.join(REPO, 'docs/shared/media-basic/vendor');
const VERSION = '0.25.1';
const COMMIT = '0664a57bf2f40e5c4efa176c75ebf1d60df69eb8';
const ARCHIVE_SHA = '95c03a00ca69a7d5ed9805e424349ffeb0cdecbe8cabd0e17749a39e8117802f';
const BUNDLE_SHA = '5c3514965f106dd165cc6474979ba302ef85d8c84935a0ad3ea5202ccedfe51b';
const LICENSE_SHA = '3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04';
const RECOVERED_BLOBS = {
  'tsconfig.json': '128e38ff54dc18936ba52e39454d35003d7b5357',
  'shared/tsconfig.json': '8e005134c0e7cbe5dd80a6ee1d2c90c6bb2b266d',
  'shared/aac-misc.ts': 'e1ecaf7c33126ff60cf94e92ccc375c3c2893f5e',
  'shared/ac3-misc.ts': 'fa3145fee2c3a75509443a73a8d4ea1172610a23',
  'shared/bitstream.ts': '7baa2b276645325c7527ced643f225f94aa9ed50',
  'shared/mp3-misc.ts': '6ff3a8c8b3dc403571d984a9e2c126a0f58bfb26',
};
const BANNER = `/*!
 * Copyright (c) 2026-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */`;

// Exact core ESM options from scripts/bundle.ts at COMMIT, lines 16-34,
// 46-49, 70-75 and 92-100. The installed vendor is the minified ESM variant.
export const CORE_OPTIONS = Object.freeze({
  entryPoints: ['src/index.ts'],
  bundle: true,
  logLevel: 'info',
  target: 'es2021',
  logOverride: { 'import-is-undefined': 'silent' },
  banner: { js: BANNER },
  legalComments: 'none',
  format: 'esm',
  minify: true,
  outfile: 'dist/bundles/mediabunny.min.mjs',
});

const sha256 = data => createHash('sha256').update(data).digest('hex');
const blobSha = data => createHash('sha1')
  .update(`blob ${data.length}\0`).update(data).digest('hex');
const json = data => JSON.stringify(data, null, 2) + '\n';
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('../'));
};

class CheckError extends Error {
  constructor(message, status = 'FAIL') { super(message); this.status = status; }
}

export function summarizeDifference(reference, rebuilt) {
  const common = Math.min(reference.length, rebuilt.length);
  let first = 0;
  while (first < common && reference[first] === rebuilt[first]) first++;
  const equal = first === common && reference.length === rebuilt.length;
  let suffix = 0;
  while (suffix < common - first
    && reference[reference.length - 1 - suffix] === rebuilt[rebuilt.length - 1 - suffix]) suffix++;
  let differentAlignedBytes = 0;
  for (let i = first; i < common; i++) if (reference[i] !== rebuilt[i]) differentAlignedBytes++;
  const location = bytes => {
    const prefix = bytes.subarray(0, first);
    let line = 1;
    for (const byte of prefix) if (byte === 10) line++;
    return { line, contextStartByte: Math.max(0, first - 48),
      context: bytes.subarray(Math.max(0, first - 48), first + 112).toString('utf8') };
  };
  return {
    identical: equal,
    referenceBytes: reference.length,
    rebuiltBytes: rebuilt.length,
    referenceSha256: sha256(reference),
    rebuiltSha256: sha256(rebuilt),
    firstDifferentByte: equal ? null : first,
    equalPrefixBytes: first,
    equalSuffixBytes: equal ? reference.length : suffix,
    differentAlignedBytes,
    trailingLengthDifference: rebuilt.length - reference.length,
    firstDifferenceContext: equal ? null : { reference: location(reference), rebuilt: location(rebuilt) },
    interpretation: equal ? 'Byte-for-byte identity.' : 'Byte difference only; no semantic equivalence claimed.',
  };
}

async function checkedFile(file, expectedSha256) {
  const bytes = await readFile(file);
  const actual = sha256(bytes);
  if (actual !== expectedSha256) throw new CheckError(`SHA-256 mismatch: ${file}`);
  return bytes;
}

function parseArguments(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--esbuild-dir', '--output-dir'].includes(key) || !argv[i + 1] || result[key]) {
      throw new CheckError('Usage: rebuild-vendor-core.mjs --esbuild-dir <installed package> --output-dir <new directory outside repo>', 'BLOCKED');
    }
    result[key] = path.resolve(argv[i + 1]);
  }
  if (!result['--esbuild-dir'] || !result['--output-dir']) {
    throw new CheckError('Both --esbuild-dir and --output-dir are required.', 'BLOCKED');
  }
  return result;
}

export async function run(argv) {
  const report = { schemaVersion: 1, status: 'BLOCKED', phase: 'arguments',
    startedAt: new Date().toISOString(), upstreamCommit: COMMIT,
    packageVersion: '1.61.5', nodeVersion: process.version,
    platform: process.platform, arch: process.arch, networkAttempted: false,
    buildAttempted: false, productFilesWritten: false };
  let outputDir;
  let workDir;
  let esbuild;
  try {
    const args = parseArguments(argv);
    const requestedOutput = args['--output-dir'];
    // Resolve the existing parent so a symlink cannot redirect output into docs.
    outputDir = path.join(await realpath(path.dirname(requestedOutput)), path.basename(requestedOutput));
    if (within(await realpath(REPO), outputDir)) {
      outputDir = undefined;
      throw new CheckError('Output must be outside the repository.', 'BLOCKED');
    }
    const target = outputDir;
    outputDir = undefined;
    await mkdir(target); // Refuse any existing directory; never overwrite a prior run.
    outputDir = target;
    report.outputDirectory = outputDir;

    report.phase = 'input-integrity';
    const archivePath = path.join(VENDOR, 'mediabunny-1.61.5-source.tgz');
    const archive = await checkedFile(archivePath, ARCHIVE_SHA);
    const reference = await checkedFile(path.join(VENDOR, 'mediabunny.mjs'), BUNDLE_SHA);
    await checkedFile(path.join(VENDOR, 'mediabunny-LICENSE'), LICENSE_SHA);
    report.sourceArchive = { bytes: archive.length, sha256: ARCHIVE_SHA };
    report.referenceBundle = { bytes: reference.length, sha256: BUNDLE_SHA };
    report.licenseSha256 = LICENSE_SHA;
    const recovered = [];
    for (const [file, expected] of Object.entries(RECOVERED_BLOBS)) {
      const bytes = await readFile(path.join(INPUTS, 'mediabunny-1.61.5', file));
      if (blobSha(bytes) !== expected) throw new CheckError(`Recovered source Git blob mismatch: ${file}`);
      recovered.push({ path: file, gitBlobSha: expected, sha256: sha256(bytes), bytes: bytes.length });
    }
    report.recoveredSources = recovered;
    report.provenanceSha256 = sha256(await readFile(path.join(INPUTS, 'provenance.json')));

    report.phase = 'toolchain';
    if (process.platform !== 'linux' || process.arch !== 'x64') {
      throw new CheckError('This reproducibility gate currently supports Linux x64 only.', 'BLOCKED');
    }
    if (process.env.ESBUILD_BINARY_PATH) {
      throw new CheckError('ESBUILD_BINARY_PATH must be unset; binary substitution is not allowed.', 'BLOCKED');
    }
    const esbuildDir = await realpath(args['--esbuild-dir']);
    const packageJsonPath = path.join(esbuildDir, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    report.esbuild = { directory: esbuildDir, packageVersion: packageJson.version, requiredVersion: VERSION };
    if (packageJson.name !== 'esbuild' || packageJson.version !== VERSION) {
      throw new CheckError(`Exact esbuild ${VERSION} required; found ${packageJson.name}@${packageJson.version}.`, 'BLOCKED');
    }
    if (path.basename(esbuildDir) !== 'esbuild' || path.basename(path.dirname(esbuildDir)) !== 'node_modules') {
      throw new CheckError('Use the isolated npm prefix/node_modules/esbuild install described in build-inputs/README.md.', 'BLOCKED');
    }
    const prefix = path.resolve(esbuildDir, '../..');
    const locked = await readFile(path.join(INPUTS, 'toolchain/package-lock.json'));
    const installedLock = await readFile(path.join(prefix, 'package-lock.json'));
    if (!locked.equals(installedLock)) throw new CheckError('Installed prefix lock differs from the fixed toolchain lock.', 'BLOCKED');
    report.esbuild.lockSha256 = sha256(locked);
    const require = createRequire(packageJsonPath);
    const binaryPath = await realpath(require.resolve('@esbuild/linux-x64/bin/esbuild'));
    if (!within(await realpath(path.join(prefix, 'node_modules')), binaryPath)) {
      throw new CheckError('Native esbuild binary resolved outside the isolated prefix.', 'BLOCKED');
    }
    const nativePackage = JSON.parse(await readFile(path.resolve(path.dirname(binaryPath), '../package.json'), 'utf8'));
    if (nativePackage.version !== VERSION) throw new CheckError('Native esbuild package version mismatch.', 'BLOCKED');
    const binaryVersion = execFileSync(binaryPath, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
    report.esbuild.binaryVersion = binaryVersion;
    report.esbuild.binarySha256 = sha256(await readFile(binaryPath));
    if (binaryVersion !== VERSION) throw new CheckError('Native esbuild executable version mismatch.', 'BLOCKED');
    esbuild = require(path.join(esbuildDir, 'lib/main.js'));
    report.esbuild.apiVersion = esbuild.version;
    if (esbuild.version !== VERSION) throw new CheckError('esbuild API version mismatch.', 'BLOCKED');

    report.phase = 'extract';
    workDir = path.join(outputDir, 'work');
    await mkdir(workDir);
    // The tar is verified above before extraction; only core source/package/license
    // are extracted. No archive script is executed, and no installed vendor changes.
    execFileSync('tar', ['-xzf', archivePath, '--directory', workDir,
      '--strip-components=1', '--no-same-owner', '--no-same-permissions',
      'package/src', 'package/package.json', 'package/LICENSE'], { timeout: 30000 });
    await checkedFile(path.join(workDir, 'LICENSE'), LICENSE_SHA);
    await mkdir(path.join(workDir, 'shared'));
    for (const file of Object.keys(RECOVERED_BLOBS)) {
      await copyFile(path.join(INPUTS, 'mediabunny-1.61.5', file), path.join(workDir, file), constants.COPYFILE_EXCL);
    }

    report.phase = 'build';
    report.buildAttempted = true;
    report.buildOptions = CORE_OPTIONS;
    const context = await esbuild.context({ ...CORE_OPTIONS, absWorkingDir: workDir });
    try { await context.rebuild(); } finally { await context.dispose(); }

    report.phase = 'compare';
    const rebuiltPath = path.join(workDir, CORE_OPTIONS.outfile);
    const rebuilt = await readFile(rebuiltPath);
    report.comparison = summarizeDifference(reference, rebuilt);
    await copyFile(rebuiltPath, path.join(outputDir, 'mediabunny-rebuilt.mjs'), constants.COPYFILE_EXCL);
    if (!report.comparison.identical || report.comparison.rebuiltSha256 !== BUNDLE_SHA) {
      throw new CheckError('Rebuilt bundle is not byte-for-byte identical to the pinned distribution.');
    }
    report.status = 'PASS';
    report.phase = 'complete';
  } catch (error) {
    const unavailablePrerequisite = ['arguments', 'input-integrity', 'toolchain'].includes(report.phase)
      && ['ENOENT', 'EACCES', 'ENOTDIR'].includes(error.code);
    report.status = error.status ?? (unavailablePrerequisite || report.phase === 'toolchain' ? 'BLOCKED' : 'FAIL');
    report.error = { name: error.name, message: String(error.message).slice(0, 2000) };
  } finally {
    if (esbuild) esbuild.stop();
    if (workDir) {
      try { await rm(workDir, { recursive: true, force: true }); report.workspaceRemoved = true; }
      catch (error) { report.status = 'FAIL'; report.cleanupError = String(error.message); }
    }
  }
  report.finishedAt = new Date().toISOString();
  if (outputDir) {
    try { await writeFile(path.join(outputDir, 'rebuild-result.json'), json(report), { flag: 'wx' }); }
    catch (error) { report.status = 'FAIL'; report.reportWriteError = String(error.message); }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await run(process.argv.slice(2));
  process.stdout.write(json(report));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'BLOCKED' ? 2 : 1;
}
