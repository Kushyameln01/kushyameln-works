'use strict';
// Narrow private adaptation of @actions/artifact 2.3.2 downloadArtifactInternal.
// Upstream MIT notice is retained in LICENSE.sdk.md; see sdk-download.patch.
const crypto = require('node:crypto');
const MAX_ZIP = 130 * 1024 * 1024;
const MAX_CHUNK = 1024 * 1024;
const CODES = new Set(['REQUEST_INVALID', 'ARTIFACT_NOT_UNIQUE', 'ARTIFACT_METADATA_MISMATCH',
  'ARTIFACT_RUN_MISMATCH', 'SIGNED_URL_INVALID', 'HTTP_STATUS', 'HTTP_LENGTH', 'HTTP_ENCODING',
  'ZIP_SIZE_LIMIT', 'ZIP_CHUNK_LIMIT', 'ZIP_TRUNCATED', 'ZIP_HASH_MISMATCH', 'ZIP_SHORT_WRITE',
  'DOWNLOAD_CANCELLED', 'DOWNLOAD_DEADLINE', 'DOWNLOAD_IDLE', 'OUTPUT_CHANGED', 'SDK_UNAVAILABLE',
  'DOWNLOAD_FAILED', 'OUTPUT_CLEANUP_FAILED']);
function need(ok, code) { if (!ok) throw new Error(code); }
function safeCode(error) { return CODES.has(error?.message) ? error.message : 'DOWNLOAD_FAILED'; }
function validateExpected(e) {
  need(e && Number.isSafeInteger(e.id) && e.id > 0 && typeof e.name === 'string'
    && /^vr180-seg-[A-Za-z0-9_-]{1,220}$/.test(e.name)
    && Number.isSafeInteger(e.sizeBytes) && e.sizeBytes >= 22 && e.sizeBytes <= MAX_ZIP
    && typeof e.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(e.digest), 'REQUEST_INVALID');
  return { id: e.id, name: e.name, sizeBytes: e.sizeBytes, digest: e.digest };
}
function selectArtifact(artifacts, expected, backendIds) {
  need(Array.isArray(artifacts) && artifacts.length === 1, 'ARTIFACT_NOT_UNIQUE');
  const a = artifacts[0], digest = a?.digest?.value;
  const normalized = typeof digest === 'string' ? 'sha256:' + digest.replace(/^sha256:/, '') : '';
  need(a && a.databaseId === String(expected.id) && a.name === expected.name
    && a.size === String(expected.sizeBytes) && normalized === expected.digest, 'ARTIFACT_METADATA_MISMATCH');
  need(typeof backendIds.workflowRunBackendId === 'string' && backendIds.workflowRunBackendId.length > 0
    && a.workflowRunBackendId === backendIds.workflowRunBackendId
    && typeof a.workflowJobRunBackendId === 'string' && a.workflowJobRunBackendId.length > 0
    && a.workflowJobRunBackendId.length <= 128, 'ARTIFACT_RUN_MISMATCH');
  return a;
}
function check(deadline, signal) {
  need(!signal?.aborted, 'DOWNLOAD_CANCELLED');
  need(performance.now() < deadline, 'DOWNLOAD_DEADLINE');
}
async function downloadRaw({ expected, writer, sdk, deadline, signal, idleMs = 30000 }) {
  expected = validateExpected(expected); check(deadline, signal);
  const backendIds = sdk.getBackendIdsFromToken();
  const client = sdk.internalArtifactTwirpClient();
  // This is the SDK's normal current-run request, not REST/findBy/PAT access.
  const listed = await client.ListArtifacts({ ...backendIds,
    idFilter: sdk.Int64Value.create({ value: String(expected.id) }) });
  check(deadline, signal);
  const a = selectArtifact(listed.artifacts, expected, backendIds);
  const signed = await client.GetSignedArtifactURL({ workflowRunBackendId: a.workflowRunBackendId,
    workflowJobRunBackendId: a.workflowJobRunBackendId, name: a.name });
  check(deadline, signal);
  need(typeof signed.signedUrl === 'string' && signed.signedUrl.length <= 16384, 'SIGNED_URL_INVALID');
  let url;
  try { url = new URL(signed.signedUrl); } catch { throw new Error('SIGNED_URL_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'SIGNED_URL_INVALID');
  const http = sdk.createHttpClient();
  let response, timer, idle = false;
  const abort = () => response?.message.destroy(new Error('DOWNLOAD_CANCELLED'));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    response = await http.get(url.href); check(deadline, signal);
    const stream = response.message;
    need(stream.statusCode === 200, 'HTTP_STATUS');
    const headers = stream.headers || {};
    need(headers['content-length'] === undefined || headers['content-length'] === String(expected.sizeBytes), 'HTTP_LENGTH');
    need(headers['content-encoding'] === undefined || headers['content-encoding'] === 'identity', 'HTTP_ENCODING');
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => {
      idle = true; stream.destroy(new Error('DOWNLOAD_IDLE'));
    }, idleMs); };
    reset();
    let bytes = 0; const sha = crypto.createHash('sha256');
    for await (const chunk of stream) {
      reset(); check(deadline, signal);
      need(Buffer.isBuffer(chunk) && chunk.length <= MAX_CHUNK, 'ZIP_CHUNK_LIMIT');
      need(bytes + chunk.length <= expected.sizeBytes, 'ZIP_SIZE_LIMIT');
      let offset = 0;
      while (offset < chunk.length) {
        check(deadline, signal);
        const result = await writer.write(chunk, offset, chunk.length - offset, bytes + offset);
        need(Number.isInteger(result.bytesWritten) && result.bytesWritten > 0
          && result.bytesWritten <= chunk.length - offset, 'ZIP_SHORT_WRITE');
        offset += result.bytesWritten;
      }
      sha.update(chunk); bytes += chunk.length;
    }
    clearTimeout(timer); check(deadline, signal);
    need(bytes === expected.sizeBytes, 'ZIP_TRUNCATED');
    const digest = 'sha256:' + sha.digest('hex'); need(digest === expected.digest, 'ZIP_HASH_MISMATCH');
    await writer.sync(); check(deadline, signal);
    need((await writer.stat()).size === bytes, 'OUTPUT_CHANGED');
    return { schema: 'vr180-same-run-raw-artifact-v1', status: 'RAW_ZIP_VERIFIED',
      artifact: expected, bytes, digest, fsynced: true,
      metadata: { source: '@actions/artifact@2.3.2 ListArtifacts(idFilter)',
        scope: 'current-workflow-run-runtime-token', id: expected.id, name: expected.name,
        sizeBytes: expected.sizeBytes, digest: expected.digest,
        backendRunMatched: true, producerJobBackendObserved: true,
        restWorkflowRunVerified: false },
      zipStructureVerified: false, rawStreamBufferLimitBytes: MAX_CHUNK,
      processRssBoundedByBuffer: false };
  } catch (error) { throw new Error(idle ? 'DOWNLOAD_IDLE' : safeCode(error)); }
  finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    response?.message.destroy(); http.dispose?.();
  }
}
module.exports = { MAX_ZIP, MAX_CHUNK, safeCode, validateExpected, selectArtifact, downloadRaw };
