'use strict';
// Local descriptor-lifecycle fixture only. Never selected by production code.
const fs = require('node:fs');
process.once('message', ({ expected }) => {
  const bytes = Buffer.alloc(expected.sizeBytes, 7);
  fs.writeSync(4, bytes, 0, bytes.length, 0); fs.fsyncSync(4); fs.closeSync(4);
  process.send({ type: 'result', receipt: { status: 'RAW_ZIP_VERIFIED', bytes: bytes.length,
    digest: expected.digest, fsynced: true, childDescriptorClosed: true } }, () => process.exit(0));
});
