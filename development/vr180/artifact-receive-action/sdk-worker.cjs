'use strict';
const fs = require('node:fs');
const { promisify } = require('node:util');
const { createRequire } = require('node:module');
const path = require('node:path');
const { downloadRaw, safeCode } = require('./raw.cjs');
function installedSdk() {
  const requireFixed = createRequire(path.resolve(__dirname, '../artifact-transfer-action/package.json'));
  const root = path.dirname(requireFixed.resolve('@actions/artifact/package.json'));
  return {
    ...requireFixed(path.join(root, 'lib/internal/shared/artifact-twirp-client.js')),
    ...requireFixed(path.join(root, 'lib/internal/shared/util.js')),
    Int64Value: requireFixed(path.join(root, 'lib/generated/index.js')).Int64Value,
    createHttpClient: () => new (requireFixed('@actions/http-client').HttpClient)(
      'vr180-private-raw-artifact/1', [], { allowRedirects: true, allowRedirectDowngrade: false,
        maxRedirects: 3, socketTimeout: 30000, keepAlive: false }),
  };
}
if (require.main === module) process.once('message', async request => {
  const write = promisify(fs.write), sync = promisify(fs.fsync), stat = promisify(fs.fstat);
  let result, error;
  try {
    result = await downloadRaw({ expected: request.expected, deadline: performance.now() + request.timeoutMs,
      sdk: installedSdk(), writer: { write: (...args) => write(4, ...args), sync: () => sync(4), stat: () => stat(4) } });
  } catch (e) { error = safeCode(e); }
  try { await promisify(fs.close)(4); } catch { error = 'OUTPUT_CHANGED'; }
  process.send(error ? { type: 'failure', code: error } : { type: 'result', receipt: { ...result, childDescriptorClosed: true } },
    () => process.exit(error ? 1 : 0));
});
module.exports = { installedSdk };
