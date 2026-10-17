'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { runTransfer, validateIdentity } = require('./transfer.cjs');

function assert(ok, message) { if (!ok) throw new Error(message); }
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const OWN_FILES = ['action.yml', 'main.cjs', 'transfer.cjs', 'sdk-worker.cjs',
  'package.json', 'package-lock.json', 'sdk-provenance.json'];
async function checkedInputs(env) {
  const identity = { repository: env.GITHUB_REPOSITORY, commit: env.GITHUB_SHA, ref: env.GITHUB_REF,
    runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT), job: env.GITHUB_JOB };
  validateIdentity(identity);
  const workspace = await fs.realpath(env.GITHUB_WORKSPACE);
  const root = await fs.realpath(env.RUNNER_TEMP);
  const manifestPath = path.resolve(env['INPUT_SOURCE-MANIFEST'] || '');
  const outputDirectory = path.resolve(env['INPUT_OUTPUT-DIRECTORY'] || '');
  const sourceParent = await fs.realpath(path.dirname(manifestPath));
  const outParent = await fs.realpath(path.dirname(outputDirectory));
  assert(sourceParent.startsWith(root + path.sep) && (outParent === root || outParent.startsWith(root + path.sep)), 'INPUTS_REQUIRE_RUNNER_TEMP');
  assert(path.isAbsolute(env['INPUT_SOURCE-MANIFEST'] || '') && path.isAbsolute(env['INPUT_OUTPUT-DIRECTORY'] || ''), 'INPUTS_REQUIRE_ABSOLUTE_PATHS');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, timeout: 10000, maxBuffer: 1024 }).toString().trim();
  assert(head === identity.commit, 'CHECKOUT_COMMIT_MISMATCH');
  const sourceHashes = {};
  const files = [...OWN_FILES.map(name => path.join(__dirname, name)), path.join(workspace, 'tools/vr180/probe-segmented-transfer.py')];
  for (const file of files) {
    const relative = path.relative(workspace, file).split(path.sep).join('/');
    assert(!relative.startsWith('../'), 'ACTION_OUTSIDE_CHECKOUT');
    const data = await fs.readFile(file);
    const committed = execFileSync('git', ['show', head + ':' + relative], { cwd: workspace, timeout: 10000, maxBuffer: 1024 * 1024 });
    assert(data.equals(committed), 'ACTION_SOURCE_DIFFERS_FROM_COMMIT');
    sourceHashes[relative] = hash(data);
  }
  const provenance = JSON.parse(await fs.readFile(path.join(__dirname, 'sdk-provenance.json'), 'utf8'));
  const installed = JSON.parse(await fs.readFile(path.join(__dirname, 'node_modules/@actions/artifact/package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(__dirname, 'package-lock.json'), 'utf8'));
  assert(installed.version === '2.3.2' && lock.packages['node_modules/@actions/artifact'].version === '2.3.2'
    && lock.packages['node_modules/@actions/artifact'].integrity === provenance.sdkArchiveIntegrity, 'SDK_VERSION_INTEGRITY');
  assert(env.ACTIONS_RUNTIME_TOKEN && env.ACTIONS_RESULTS_URL, 'ACTION_RUNTIME_CAPABILITY_ABSENT');
  const verifyProvenance = async () => {
    for (const [relative, sha] of Object.entries(sourceHashes)) assert(hash(await fs.readFile(path.join(workspace, relative))) === sha, 'ACTION_SOURCE_CHANGED_DURING_TRANSFER');
  };
  return { manifestPath, outputDirectory, identity, verifyProvenance, provenance: { ...provenance,
    declaredActionRuntime: 'node20', observedNodeVersion: process.version, platform: process.platform,
    arch: process.arch, sourceHashes, installedSdkVersion: installed.version,
    generatorScriptSHA256: sourceHashes['tools/vr180/probe-segmented-transfer.py'],
    dependencyInstallation: 'npm ci --ignore-scripts --omit=dev from checked fixed lock; no floating install',
    noCredentialsRecorded: true } };
}
async function main() {
  const args = await checkedInputs(process.env);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  let result;
  try { result = await runTransfer({ ...args, signal: controller.signal }); }
  finally { process.off('SIGTERM', cancel); process.off('SIGINT', cancel); }
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT,
    `completion-artifact-id=${result.completion.artifact.id}\ncompletion-artifact-name=${result.completion.artifact.name}\ncompletion-artifact-digest=${result.completion.artifact.digest}\n`);
}
if (require.main === module) main().catch(error => {
  console.error(/^[-A-Z0-9_]+$/.test(error.message || '') ? error.message : 'BOUNDED_ARTIFACT_TRANSFER_FAILED');
  process.exitCode = 1;
});
module.exports = { checkedInputs, OWN_FILES };
