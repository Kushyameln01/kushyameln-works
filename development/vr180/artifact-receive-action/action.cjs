'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { need, checkedEnvironment } = require('./checked.cjs');
const PROFILES = Object.freeze(['service-8mib', 'single-128mib', 'p5-receiver-calibration32', 'p5-5gb', 'p5-10gb']);
function validateInputs(env) {
  const raw = env['INPUT_RECEIPT-JSON'], profile = env.INPUT_PROFILE;
  need(typeof raw === 'string' && Buffer.byteLength(raw) > 0 && Buffer.byteLength(raw) <= 16384
    && PROFILES.includes(profile), 'ACTION_INPUT_INVALID');
  const value = JSON.parse(raw); need(value && typeof value === 'object' && !Array.isArray(value), 'ACTION_INPUT_INVALID');
  return { raw, profile };
}
async function action() {
  const input = validateInputs(process.env), checked = await checkedEnvironment(process.env, { includeReceiver: true });
  const { runId, runAttempt, job } = checked.context;
  const output = path.join(checked.temp, `vr180-receive-${runId}-${runAttempt}-${job}`);
  const exists = await fs.lstat(output).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  need(!exists, 'RECEIVER_DESTINATION_EXISTS');
  const child = spawn('python3', [path.join(checked.workspace, 'tools/vr180/receive-in-actions.py'),
    '--receipt-json', input.raw, '--profile', input.profile, '--output', output],
    { cwd: checked.workspace, env: process.env, stdio: 'inherit' });
  const abort = () => child.kill('SIGTERM');
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  try {
    await new Promise((resolve, reject) => {
      child.on('error', () => reject(new Error('RECEIVER_START_FAILED')));
      child.on('close', code => code === 0 ? resolve() : reject(new Error('RECEIVER_FAILED')));
    });
    await checked.verify();
  } finally { process.off('SIGTERM', abort); process.off('SIGINT', abort); }
}
if (require.main === module) action().catch(() => { console.error('PRIVATE_RECEIVER_FAILED'); process.exitCode = 1; });
module.exports = { PROFILES, validateInputs, action };
