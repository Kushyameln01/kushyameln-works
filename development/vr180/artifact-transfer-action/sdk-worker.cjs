'use strict';
// This child deliberately emits no SDK logs or credential-bearing errors.
// Its inherited runtime token is provided by the normal JavaScript action host.
process.once('message', async request => {
  try {
    const { DefaultArtifactClient } = require('@actions/artifact');
    const sdk = new DefaultArtifactClient();
    const result = await sdk.uploadArtifact(request.name, [request.file], request.rootDirectory,
      { compressionLevel: 0, retentionDays: 1 });
    process.send({ type: 'result', receipt: { id: result.id, size: result.size, digest: result.digest } }, () => process.exit(0));
  } catch { process.exit(1); }
});
