#!/usr/bin/env python3
"""Generate a narrow private adapter from hash-bound public pixel conversion."""
from pathlib import Path
import hashlib,json,difflib
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'docs/shared/vr180/transform.mjs'
WORKER=ROOT/'docs/shared/vr180/worker.mjs'
HERE=Path(__file__).resolve().parent
s=original=BASE.read_text();worker=WORKER.read_text()
EXPECTED_TRANSFORM='7bd8ade1cc5983d173760266f65062a20468d7dc9acaa7b8a8117aa97b8dc6c3'
EXPECTED_WORKER='54104a2eb521461a02576988b646f6d6c7ac4b5cfd712e0a57902bdda428604c'
if hashlib.sha256(original.encode()).hexdigest()!=EXPECTED_TRANSFORM or hashlib.sha256(worker.encode()).hexdigest()!=EXPECTED_WORKER:
 raise RuntimeError('Fixed public transform/worker source changed; re-review before regeneration')
def change(old,new):
 global s
 if s.count(old)!=1:raise RuntimeError(f'Expected one exact context: {old[:100]}')
 s=s.replace(old,new)
start=s.index('import {');end=s.index('\nconst MAX_SAMPLES')
s='''// Private indexed pixel-conversion prototype; generated from the public transform.
// No public worker, vendor bundle, input admission, or supported limit is changed.
import { buildStereoGeometry } from '../../../docs/shared/vr180/geometry.mjs';
import { createFileOutput } from '../../../docs/shared/vr180/file-output.mjs';
import { inspectMp4 } from '../../../docs/shared/vr180/mp4.mjs';
import { inspectMp4 as inspectOutputMp4 } from '../output-index-prototype/mp4-output-inspect.mjs';
import { sha256Blob } from '../../../docs/shared/vr180/sha256.mjs';
import { createIndexBudget } from '../index-prototype/index-store.mjs';
import { createInputIndex } from '../input-index-prototype/input-index.mjs';
import { createOutputIndex, PROFILE } from '../output-index-prototype/output-index.mjs';
'''+s[end:]
s=s.replace("const OPFS_ROOT = 'vr180-jobs';", "const MAX_METADATA_BYTES = 16 * 1024 ** 2;")
change('  const capture = createMuxCapture(), logicalWriter = output.stream.getWriter();', '  const logicalWriter = output.stream.getWriter();')
change('      capture.write({position, data}); // Capture only acknowledged writes, including header rewrites.\n','')
change('    output, stream, onMoov: capture.onMoov,', '    output, stream,')
change('      const {source, metrics} = capture.finish(status.extent);\n      return {output, source, metrics};','      return {output, extent: status.extent};')
# Keep the public Worker\'s admission checks verbatim, but make mode explicit.
validate=worker[worker.index('function validate(info, s) {'):worker.index('\n// Tests exercise')]
validate=validate.replace('function validate(info, s)', 'export function validateIndexedAdmission(info, s)').replace('MAX_CONVERSION_SAMPLES','MAX_SAMPLES').replace('MAX_CONVERSION_METADATA_BYTES','MAX_METADATA_BYTES')
validate=validate.replace("  if (!s.confirmed)", "  if (s.mode !== 'convert') throw Error('INDEXED_CONVERT_MODE_REQUIRED');\n  if (!s.confirmed)")
pos=s.index('/**\n * b1 pixel route.')
end=s.index('export async function convertStereo',pos)
s=s[:pos]+validate+'\n\nexport const inspectSavedOutput = (file, options) => inspectOutputMp4(file, options);\n\n/** Private direct-file pixel route. One supplied combined-fork module owns every media class. */\n'+s[end:]
change('  signal, onProgress, onMetrics, jobId, onCleanup, outputHandle, onOutputCreated,', '  signal, onProgress, onMetrics, jobId, onCleanup, outputHandle, onOutputCreated, fork, indexRoot,')
change('  const started = performance.now();', '''  const started = performance.now();
  const {Input, BlobSource, MP4, VideoSampleSink, EncodedPacketSink, CanvasSource,
    EncodedAudioPacketSource, Output, Mp4OutputFormat, StreamTarget, Quality, canEncodeVideo} = fork ?? {};
  if (![Input, BlobSource, VideoSampleSink, EncodedPacketSink, CanvasSource, EncodedAudioPacketSource,
    Output, Mp4OutputFormat, StreamTarget, Quality, canEncodeVideo].every(value => typeof value === 'function') || !MP4) {
    throw Error('ONE_COMBINED_FORK_MODULE_REQUIRED');
  }
  if (!outputHandle?.getFile || !outputHandle?.createWritable || !indexRoot?.getDirectoryHandle) {
    throw Error('INDEXED_ROUTE_REQUIRES_OUTPUT_HANDLE_AND_INDEX_ROOT');
  }''')
change("!/^[A-Za-z0-9_-]{1,96}$/.test(id)", "!/^[A-Za-z0-9_-]{1,60}$/.test(id)")
change("jobId must contain 1–96 letters, numbers, underscores or hyphens.", "Private jobId must contain 1–60 letters, numbers, underscores or hyphens.")
start=s.index('  if ((!outputHandle && !globalThis.navigator')
end=s.index('\n\n  const metrics',start)
s=s[:start]+'''  if (!globalThis.OffscreenCanvas || !globalThis.VideoEncoder || !globalThis.VideoDecoder || !globalThis.WritableStream) {
    throw new Error('This route requires OffscreenCanvas, WebCodecs and WritableStream.');
  }
  const admission = await inspectMp4(file, {signal});
  validateIndexedAdmission(admission, settings);
  checkAbort();
  const budget = createIndexBudget();
'''+s[end:]
change("containerMetadataGrowth: 'O(total samples); media buffers are streamed'", "containerMetadataGrowth: 'private bounded disk input/output indices; unchanged public sample/metadata/output limits'")
change("outputBackend: outputHandle ? 'direct-file' : 'opfs',\n    opfsDirectory: outputHandle ? null : `${OPFS_ROOT}/${id}`,", "outputBackend: 'private-indexed-direct-file', opfsDirectory: null, admission,\n    indexSortBytes: {input: 4 * 1024 ** 2 - PROFILE.sortReservedBytes, output: PROFILE.sortReservedBytes},\n    indexBudgetBytes: 8 * 1024 ** 2, inputIndex: null, outputIndex: null,")
change('  let input, output, canvas, storageWriter, root, temporaryDirectory, opfsHandle, directDestination, directOutput;', '  let input, output, canvas, directDestination, directOutput, inputIndex, outputIndex, result, failure;\n  const pendingCleanup = [];')
change('  let temporaryCreated = false;\n  let storageClosed = false;\n', '')
change('  let succeeded = false;\n', '')
change('    succeeded = true;\n', '')
start=s.index('  const removeTemporary = async () => {');end=s.index('  // Register before acquiring resources',start)
s=s[:start]+'''  const cleanupResources = async () => {
    const errors = [];
    metrics.inputIndexBeforeCleanup ??= inputIndex?.metrics ?? null;
    metrics.outputIndexBeforeCleanup ??= outputIndex?.metrics ?? null;
    try { if (heldSample) { heldSample.close(); heldSample = null; } } catch (error) { errors.push(error); }
    try { input?.dispose(); } catch (error) { error.requiresWorkerTermination = true; errors.push(error); }
    // A failed codec cancel must not skip abort/owned index cleanup. It remains
    // an explicit Worker-termination requirement, never a claim that codecs closed.
    try { await cleanupConversionResources({cancelOutput,
      abortWriter: async () => { if (directOutput) await directOutput.abort(); },
      removeTemporary: async () => {},
    }); } catch (error) { errors.push(error); }
    for (const cleanup of [...pendingCleanup]) {
      try { await cleanup(); pendingCleanup.splice(pendingCleanup.indexOf(cleanup), 1); } catch (error) { errors.push(error); }
    }
    for (const controller of [outputIndex, inputIndex]) {
      try { await controller?.dispose(); } catch (error) { errors.push(error); }
    }
    metrics.inputIndex = inputIndex?.metrics ?? null; metrics.outputIndex = outputIndex?.metrics ?? null;
    metrics.indexReservedAfterCleanup = budget.usedBytes;
    if (errors.length) throw Object.assign(new Error(errors.map(error => error.message).join('; ')),
      {requiresWorkerTermination: errors.some(error => error.requiresWorkerTermination), causes: errors});
  };
  const acquire = async factory => {
    try { return await factory(); }
    catch (error) { if (error.retryCleanup) pendingCleanup.push(error.retryCleanup); throw error; }
  };
'''+s[end:]
change("    input = new Input({ source: new BlobSource(file, { maxCacheSize: CACHE_BYTES }), formats: [MP4] });\n    const tracks = await input.getTracks();", """    input = new Input({ source: new BlobSource(file, { maxCacheSize: CACHE_BYTES, useStreamReader: false }), formats: [MP4] });
    inputIndex = await acquire(() => createInputIndex({source: file, root: indexRoot, jobId: `${id}-in`,
      budget, signal, sortBytes: 4 * 1024 ** 2 - PROFILE.sortReservedBytes}));
    input._vr180InputIndex = inputIndex; // Must precede the first getTracks/readMetadata.
    const tracks = await input.getTracks();""")
start=s.index('    let writable;');end=s.index('    output.addVideoTrack(videoSource);',start)
s=s[:start]+'''    outputIndex = await acquire(() => createOutputIndex({root: indexRoot, jobId: `${id}-out`, budget, signal, layout: 'sbs'}));
    directDestination = await createDirectMuxDestination(outputHandle, {
      signal, onWrite: extent => { metrics.outputBytes = extent; },
      onOutputCreated: acquired => { directOutput = acquired; onOutputCreated?.(acquired); },
    });
    const format = new Mp4OutputFormat({fastStart: false}); format._options.vr180Index = outputIndex;
    output = new Output({format,
      target: new StreamTarget(directDestination.stream, {chunked: true, chunkSize: WRITE_CHUNK_BYTES}),
    });
'''+s[end:]
start=s.index('    let resultFile, direct;');end=s.index('    metrics.outputPreparationMs',start)
s=s[:start]+'''    const direct = directDestination.finish();
    metrics.outputBytes = direct.extent;
    if (!metrics.outputBytes || metrics.outputBytes > MAX_OUTPUT_BYTES) throw Error('The finalized output size is invalid.');
    const indexed = outputIndex.metrics;
    if (!indexed.metadataClosed || !indexed.verification || indexed.sampleCount !== metrics.totalSamples
      || indexed.verification.sampleCounts.total !== metrics.totalSamples) throw Error('INDEXED_METADATA_NOT_VERIFIED');
    const offset = indexed.moovPosition, metadataBytes = indexed.moovBytes;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(metadataBytes) || metadataBytes <= 0
      || offset + metadataBytes !== metrics.outputBytes
      || metadataBytes > MAX_METADATA_BYTES) throw Error('INDEXED_METADATA_EXTENT_INVALID');
    const expectedMetadataHash = await sha256Blob(outputIndex.metadataSource.slice(offset, metrics.outputBytes), {signal});
    checkAbort();
    const saved = await direct.output.commit({expectedBytes: metrics.outputBytes});
    checkAbort();
    const actualMetadataHash = await sha256Blob(saved.file.slice(offset), {signal});
    if (actualMetadataHash !== expectedMetadataHash) throw Error('INDEXED_SAVED_METADATA_HASH_MISMATCH');
    const savedInfo = await inspectSavedOutput(saved.file, {signal});
    if (savedInfo.stereoMode !== 2 || savedInfo.projection !== 'equi' || savedInfo.width !== geometry.width
      || savedInfo.height !== geometry.height || savedInfo.sampleCounts.total !== metrics.totalSamples) {
      throw Error('INDEXED_SAVED_OUTPUT_INVALID');
    }
    metrics.metadataPatched = true;
    metrics.inputIndex = inputIndex.metrics; metrics.outputIndex = outputIndex.metrics;
'''+s[end:]
change("    metrics.status = 'converted-awaiting-metadata';", "    metrics.status = 'saved-and-verified';")
change('      requiresMetadataPatch: true, opfsDirectory: metrics.opfsDirectory,','      requiresMetadataPatch: false, opfsDirectory: null,')
change('    return { ...(direct ? {direct} : {file: resultFile}), cleanup: cleanupResources, metrics: { ...metrics }, info };', '''    result = {file: saved.file, saved, cleanup: cleanupResources, metrics, info, savedInfo,
      verification: {wholeFileHashCompared: false, savedFileSHA256: saved.sha256, metadataHashMatched: true,
        expectedMetadataHash, metadataOffset: offset, metadataBytes, savedWriteCommitted: true}};
    return result;''')
change("    const failure = signal?.aborted", "    failure = signal?.aborted")
start=s.index("  } finally {\n    signal?.removeEventListener('abort', onAbort);")
s=s[:start]+'''  } finally {
    signal?.removeEventListener('abort', onAbort);
    const releaseErrors = [];
    try { await cleanupResources(); } catch (error) { releaseErrors.push(error); }
    try { await videoIterator?.return(); } catch { /* Input disposal cancels the decoder. */ }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    metrics.totalMs = performance.now() - started;
    if (releaseErrors.length) {
      metrics.cleanupError = releaseErrors.map(error => error.message).join('; ');
      const cleanupFailure = failure ?? Error('INDEXED_CLEANUP_FAILED: ' + metrics.cleanupError);
      cleanupFailure.cleanupError = metrics.cleanupError; cleanupFailure.retryCleanup = cleanupResources;
      cleanupFailure.requiresWorkerTermination = releaseErrors.some(error => error.requiresWorkerTermination);
      if (!failure) Object.defineProperty(cleanupFailure, 'saveOutputState', {enumerable: true,
        get: () => directOutput?.status ?? {state: 'not-started', writerAcquired: false, committed: false}});
      cleanupFailure.saveWriteCommitted = directOutput?.status.committed === true;
      if (!failure) throw cleanupFailure;
    }
    try { publishMetrics(); } catch (error) { metrics.metricsCallbackError = String(error?.message ?? error); }
  }
}
'''
# Pin unchanged substantive calculation sections independently of the integration patch.
def section(text,start,end):return text[text.index(start):text.index(end,text.index(start))]
aac_start='export function createAacPacketCopier';aac_end='\n}\n'
loop_start='    const addAudioPacket = async () => {';loop_end='    const prepareStarted = performance.now();'
assert section(s,aac_start,aac_end)==section(original,aac_start,aac_end)
assert section(s,loop_start,loop_end)==section(original,loop_start,loop_end)
path=HERE/'transform.mjs';path.write_text(s)
patch=''.join(difflib.unified_diff(original.splitlines(True),s.splitlines(True),fromfile='a/docs/shared/vr180/transform.mjs',tofile='b/development/vr180/indexed-transform-prototype/transform.mjs'))
(HERE/'transform.patch').write_text(patch)
sha=lambda value:hashlib.sha256(value.encode()).hexdigest()
(HERE/'provenance.json').write_text(json.dumps({'source':'docs/shared/vr180/transform.mjs','sourceSHA256':sha(original),'workerAdmissionSource':'docs/shared/vr180/worker.mjs','workerSHA256':sha(worker),'privateSHA256':sha(s),'patchSHA256':sha(patch),'unchangedAACCopierSHA256':sha(section(s,aac_start,aac_end)),'unchangedGeometryCanvasWebCodecsLoopSHA256':sha(section(s,loop_start,loop_end)),'publicModified':False,'inputParser':'unchanged public mp4.mjs before any index acquisition; private cslg input acceptance is not enabled','savedOutputParser':'existing output-only mp4-output-inspect.mjs with verified cslg contract; not used for input admission','library':'one combined fork passed in options.fork; no bundled vendor import'},indent=2)+'\n')
