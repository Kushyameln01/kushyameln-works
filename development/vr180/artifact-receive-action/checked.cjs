'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const OWN = ['action.yml', 'action.cjs', 'main.cjs', 'raw.cjs', 'sdk-worker.cjs', 'checked.cjs',
  'provenance.json', 'sdk-download.patch', 'LICENSE.sdk.md'];
function need(ok, code) { if (!ok) throw new Error(code); }
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function runnerContext(env) {
  need(env.GITHUB_REPOSITORY === 'Kushyameln01/kushyameln-works'
    && /^[0-9a-f]{40}$/.test(env.GITHUB_SHA)
    && /^refs\/heads\/codex\/vr180-plan-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF)
    && /^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID)
    && /^[1-9][0-9]?$/.test(env.GITHUB_RUN_ATTEMPT)
    && /^[A-Za-z0-9_-]{1,60}$/.test(env.GITHUB_JOB), 'RUNNER_CONTEXT_INVALID');
  return { repository: env.GITHUB_REPOSITORY, commit: env.GITHUB_SHA, ref: env.GITHUB_REF,
    runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT), job: env.GITHUB_JOB };
}
async function readJson(file, maximum = 16384) {
  const st = await fs.lstat(file);
  need(st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= maximum, 'REQUEST_FILE_BOUND');
  const h = await fs.open(file, 'r');
  try {
    const opened = await h.stat(); need(opened.dev === st.dev && opened.ino === st.ino && opened.size === st.size, 'REQUEST_CHANGED');
    const data = Buffer.allocUnsafe(maximum + 1); let total = 0;
    while (total < data.length) {
      const { bytesRead } = await h.read(data, total, data.length - total, total);
      if (!bytesRead) break; total += bytesRead;
    }
    need(total === st.size, 'REQUEST_CHANGED');
    return JSON.parse(data.subarray(0, total).toString('utf8'));
  } finally { await h.close(); }
}
async function checkedEnvironment(env, { includeReceiver = false } = {}) {
  const context = runnerContext(env);
  need(env.ACTIONS_RUNTIME_TOKEN && env.ACTIONS_RESULTS_URL, 'ACTION_RUNTIME_CAPABILITY_ABSENT');
  const workspace = await fs.realpath(env.GITHUB_WORKSPACE), temp = await fs.realpath(env.RUNNER_TEMP);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, timeout: 10000, maxBuffer: 1024 }).toString().trim();
  need(head === context.commit, 'CHECKOUT_COMMIT_MISMATCH');
  const sender = path.resolve(__dirname, '../artifact-transfer-action');
  const files = [...OWN.map(f => path.join(__dirname, f)), ...['package.json', 'package-lock.json', 'sdk-provenance.json'].map(f => path.join(sender, f))];
  if (includeReceiver) files.push(path.join(workspace, 'tools/vr180/receive-in-actions.py'));
  const sourceHashes = {};
  for (const file of files) {
    const relative = path.relative(workspace, file).split(path.sep).join('/');
    need(!relative.startsWith('../'), 'SOURCE_OUTSIDE_CHECKOUT');
    const st = await fs.lstat(file); need(st.isFile() && !st.isSymbolicLink() && st.size <= 1024 * 1024, 'SOURCE_FILE_BOUND');
    const data = await fs.readFile(file);
    const committed = execFileSync('git', ['show', head + ':' + relative], { cwd: workspace, timeout: 10000, maxBuffer: 1024 * 1024 });
    need(data.equals(committed), 'SOURCE_DIFFERS_FROM_COMMIT'); sourceHashes[relative] = hash(data);
  }
  const provenance = await readJson(path.join(__dirname, 'provenance.json'));
  need(hash(await fs.readFile(path.join(sender, 'package-lock.json'))) === provenance.sharedLockSHA256
    && hash(await fs.readFile(path.join(__dirname, 'raw.cjs'))) === provenance.adaptation.targetSHA256
    && hash(await fs.readFile(path.join(__dirname, 'sdk-download.patch'))) === provenance.adaptation.patchSHA256,
    'ADAPTER_PROVENANCE_HASH_MISMATCH');
  const sdkRoot = path.join(sender, 'node_modules/@actions/artifact');
  const installed = await readJson(path.join(sdkRoot, 'package.json'));
  const lock = await readJson(path.join(sender, 'package-lock.json'), 256 * 1024);
  need(installed.version === '2.3.2' && lock.packages['node_modules/@actions/artifact'].version === '2.3.2'
    && lock.packages['node_modules/@actions/artifact'].integrity === provenance.sdkArchiveIntegrity, 'SDK_VERSION_INTEGRITY');
  for (const [relative, expected] of Object.entries(provenance.installedSourceSHA256))
    need(hash(await fs.readFile(path.join(sdkRoot, relative))) === expected, 'SDK_SOURCE_HASH_MISMATCH');
  const verify = async () => {
    for (const [relative, expected] of Object.entries(sourceHashes))
      need(hash(await fs.readFile(path.join(workspace, relative))) === expected, 'SOURCE_CHANGED_DURING_DOWNLOAD');
  };
  return { workspace, temp, context, verify, provenance: { sourceHashes, sdkVersion: installed.version,
    declaredActionRuntime: 'node20', observedNodeVersion: process.version,
    adapterSchema: provenance.schema, installedSourceSHA256: provenance.installedSourceSHA256 } };
}
module.exports = { OWN, need, hash, runnerContext, readJson, checkedEnvironment };
