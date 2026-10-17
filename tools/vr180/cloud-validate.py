#!/usr/bin/env python3
"""Check published bytes, then exercise a checked-out cloud copy in sandboxed Chrome.

Only public synthetic fixtures are used. The UI supplies both the
MP4 and its original receipt. The fixed independent verifiers inspect the saved
bytes unless explicitly deferred to the evidence receiver. Nothing here
publishes a site, installs Chrome/FFmpeg, changes a codec,
or falls back to disabling the browser sandbox.

Evidence transport is deliberately Actions logs, without artifacts or caches.
To recover: select one VR180_EVIDENCE_BEGIN/END block, concatenate CHUNK payloads
in numeric order, base64-decode, check the archive bytes/SHA-256 in BEGIN, then
inspect/extract the gzip tar. manifest.json lists every other member's size and
SHA-256. BEGIN/END completeness and all hashes must be checked before accepting
recovery. A missing END or EVIDENCE_ERROR is not successful recovery.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import functools
import gzip
import hashlib
import http.server
import importlib.metadata
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import threading
import time
import traceback
import urllib.error
import urllib.request

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs'
CHROME = Path('/usr/bin/google-chrome')
PAGES = 'https://kushyameln01.github.io/kushyameln-works/'
BUILD = 'vr180-b7-phases1'
RECOVERED = 'RECOVERED_PENDING_VERIFICATION'
INITIAL_IMPLEMENTATION_COMMIT = 'e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60'
LIMIT = 8 * 1024 * 1024
CHUNK_CHARS = 4096
VERIFIERS = {
    'verify-metadata.py': 'c80f0c59c6df30720481c7da6a46676d3bbc4757d079485c2598d3e0814a6d96',
    'verify-conversion.py': '8e13537f5c74f8207f670eb898b082a1962ae35e0db10a6ffeddb7be4c695f64',
}
FIXTURES = {
    'stereo180-sbs': '4c5b2725f625ea6f30f3f69afaa28644b8f954d60d5964bff712778ebdc86e83',
    'stereo360-tb': '72179961c99648647bb3d50940941e9694de41102f5f59d5e77807e1ad207bb9',
    'stereo180-4k-2s-sbs': '50624d8850a380ad759a712a7cae9f5f767a966271ca8a671b433c6146895db0',
    'stereo180-4k-12s-sbs': '97bb3a4335514436374b35c202275dde2cfca27f8f7cec3a224fd77c8ede6582',
}
PUBLIC_PATHS = (
    'vr180-studio/index.html', 'vr180-studio/app.mjs',
    'shared/vr180/client.mjs', 'shared/vr180/geometry.mjs',
    'shared/vr180/mp4.mjs', 'shared/vr180/operations.mjs',
    'shared/vr180/transform.mjs', 'shared/vr180/worker.mjs',
    'shared/vr180/file-output.mjs', 'shared/vr180/sha256.mjs',
    'shared/vr180/mux-capture.mjs', 'shared/vr180/save-record.mjs',
)


class Blocked(RuntimeError):
    """A required environment/source precondition is not available."""


class Deadline(RuntimeError):
    pass


class NotCanceled(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def command(args, timeout=20):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    require(result.returncode == 0, f'{args[0]} failed ({result.returncode}): {result.stderr}')
    return result.stdout.strip()


def validate_source_ref(ref, *, candidate=False):
    if candidate:
        require(isinstance(ref, str) and re.fullmatch(r'refs/heads/codex/vr180-plan-[a-zA-Z0-9-]+', ref),
                'Candidate validation requires the explicit codex/vr180-plan-* branch')
    else:
        require(ref == 'refs/heads/main', 'Expected main checkout')


def source_check(out, *, candidate=False):
    commit = command(['git', 'rev-parse', 'HEAD'])
    require(re.fullmatch(r'[0-9a-f]{40}', commit), 'Invalid checkout commit')
    require(commit == os.environ.get('GITHUB_SHA'), 'Checkout differs from GITHUB_SHA')
    validate_source_ref(os.environ.get('GITHUB_REF'), candidate=candidate)
    require(not command(['git', 'status', '--porcelain', '--untracked-files=no']), 'Tracked checkout is dirty')
    for name, expected in VERIFIERS.items():
        require(digest(ROOT / 'tools/vr180' / name) == expected, f'Fixed verifier differs: {name}')
    fixtures = {}
    for name, expected in FIXTURES.items():
        path = DOCS / 'vr180-studio/fixtures' / f'{name}.mp4'
        require(digest(path) == expected, f'Fixed synthetic input differs: {name}')
        fixtures[name] = {'bytes': path.stat().st_size, 'sha256': expected, 'source': 'public synthetic; not user media'}
    files = []
    for path in sorted(DOCS.rglob('*')):
        require(not path.is_symlink(), f'Symlink in cloud copy: {path.relative_to(DOCS)}')
        if path.is_file():
            files.append({'name': path.relative_to(DOCS).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest(path)})
    report = {'checkoutCommit': commit, 'historicalInitialImplementationCommit': INITIAL_IMPLEMENTATION_COMMIT,
              'build': BUILD, 'fixtures': fixtures, 'fixedVerifierSHA256': VERIFIERS,
              'cloudCopySource': 'this exact checkout docs/; HTTP loopback only',
              'sourceScope': 'unpublished-candidate' if candidate else 'production-main', 'files': files}
    write(out / 'source-inventory.json', report)
    return report


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def wait_for_pages(out, commit):
    """The public deployment check is independent of browser/media success."""
    opener = urllib.request.build_opener(NoRedirect())
    deadline = time.monotonic() + 300
    report = {'status': 'WAITING', 'scope': 'public static bytes only; no browser/media test',
              'checkoutCommit': commit, 'startedAt': now(), 'timeoutSeconds': 300, 'attempts': []}
    attempt = 0
    try:
        while time.monotonic() < deadline:
            attempt += 1
            observations = []
            for rel in PUBLIC_PATHS:
                if time.monotonic() >= deadline:
                    break
                path = DOCS / rel
                item = {'path': rel, 'expectedBytes': path.stat().st_size, 'expectedSHA256': digest(path)}
                request = urllib.request.Request(
                    f'{PAGES}{rel}?vr180-check={commit}-{attempt}',
                    headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity', 'User-Agent': 'VR180-cloud-validation/1'})
                try:
                    with opener.open(request, timeout=min(10, max(.1, deadline - time.monotonic()))) as response:
                        body = response.read(item['expectedBytes'] + 1)
                        item.update(httpStatus=response.status, bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
                    item['matched'] = item['bytes'] == item['expectedBytes'] and item['sha256'] == item['expectedSHA256']
                except Exception as error:
                    item.update(matched=False, error=f'{type(error).__name__}: {error}')
                observations.append(item)
            report['attempts'].append({'number': attempt, 'at': now(), 'files': observations})
            if len(observations) == len(PUBLIC_PATHS) and all(item['matched'] for item in observations):
                report['status'] = 'PASS'
                return report
            write(out / 'pages-byte-check.json', report)
            time.sleep(min(5, max(0, deadline - time.monotonic())))
        raise Blocked('Published Pages bytes did not match this checkout within 300 seconds; cloud browser trial not started')
    finally:
        report['finishedAt'] = now()
        if report['status'] == 'WAITING':
            report['status'] = 'BLOCKED'
        write(out / 'pages-byte-check.json', report)


def preflight(out, defer_verification=False):
    report = {'python': sys.version, 'uid': os.getuid(), 'sandboxRequired': True,
              'chromePath': str(CHROME), 'chromeExecutable': CHROME.is_file() and os.access(CHROME, os.X_OK),
              'ffmpegPath': shutil.which('ffmpeg'), 'ffprobePath': shutil.which('ffprobe'),
              'dependencySetupSucceeded': os.environ.get('VR180_DEPENDENCIES_READY') == 'true',
              'independentVerificationDeferred': defer_verification}
    try:
        report['numpyVersion'] = importlib.metadata.version('numpy')
    except importlib.metadata.PackageNotFoundError:
        report['numpyVersion'] = None
    try:
        if sys.version_info[:2] != (3, 12):
            raise Blocked('Python 3.12 is required')
        if report['uid'] == 0:
            raise Blocked('A non-root runner user is required; no privilege changes are attempted')
        if not report['chromeExecutable']:
            raise Blocked('Preinstalled /usr/bin/google-chrome is unavailable; no browser installation or fallback')
        if not defer_verification and (not report['ffmpegPath'] or not report['ffprobePath']):
            raise Blocked('Preinstalled FFmpeg/ffprobe unavailable; no codec installation')
        if not report['dependencySetupSucceeded']:
            raise Blocked('Pinned Python dependency setup did not succeed')
        report['playwrightVersion'] = importlib.metadata.version('playwright')
        require(report['playwrightVersion'] == '1.62.0', 'Unexpected Playwright version')
        if not defer_verification:
            require(report['numpyVersion'] == '2.3.3', 'Unexpected NumPy version')
        report['chromeVersion'] = command([str(CHROME), '--version'])
        report['ffmpegVersion'] = command(['ffmpeg', '-version']).splitlines()[0] if report['ffmpegPath'] and not defer_verification else None
        report['ffprobeVersion'] = command(['ffprobe', '-version']).splitlines()[0] if report['ffprobePath'] and not defer_verification else None
        report['status'] = 'READY'
    except Exception as error:
        report.update(status='BLOCKED', error=str(error))
        raise
    finally:
        write(out / 'environment.json', report)
    return report


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


# This small, separate Worker observes APIs and an OPFS write/read/remove cycle.
# The application's exact H.264 capability results are kept in its raw receipt.
# No production module, codec, or application settings are rewritten by this probe.
API_PROBE = r"""async () => {
  const names = ['Worker', 'VideoDecoder', 'VideoEncoder', 'OffscreenCanvas', 'WritableStream'];
  const result = {userAgent: navigator.userAgent, isSecureContext,
    windowApis: Object.fromEntries(names.map(name => [name, typeof globalThis[name]])),
    worker: null, codecNote: 'Exact input/output H.264 support is reported by the application receipt, not inferred from API presence.'};
  if (typeof Worker !== 'function') return result;
  const code = `self.onmessage = async () => {
    const names = ['VideoDecoder', 'VideoEncoder', 'OffscreenCanvas', 'WritableStream'];
    const r = {probeReceived: true, isSecureContext,
      apis: Object.fromEntries(names.map(name => [name, typeof globalThis[name]])),
      getDirectory: typeof navigator.storage?.getDirectory,
      opfsRoundTrip: false, opfsCleanup: false};
    let root, name;
    try {
      root = await navigator.storage.getDirectory();
      name = 'vr180-capability-' + crypto.randomUUID();
      const file = await root.getFileHandle(name, {create: true});
      const stream = await file.createWritable();
      await stream.write(new Uint8Array([18, 0, 7])); await stream.close();
      const bytes = new Uint8Array(await (await file.getFile()).arrayBuffer());
      r.opfsRoundTrip = bytes.length === 3 && bytes[0] === 18 && bytes[1] === 0 && bytes[2] === 7;
    } catch (error) { r.error = String(error); }
    finally {
      if (root && name) {
        try { await root.removeEntry(name); r.opfsCleanup = true; }
        catch (error) { r.cleanupError = String(error); }
      }
    }
    self.postMessage(r);
  };`;
  const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
  let worker;
  try {
    result.worker = await new Promise(resolve => {
      const timer = setTimeout(() => resolve({probeReceived: false, error: 'Worker probe timed out'}), 8000);
      worker = new Worker(url);
      worker.onmessage = ({data}) => { clearTimeout(timer); resolve(data); };
      worker.onerror = e => { clearTimeout(timer); resolve({probeReceived: false, error: e.message}); };
      worker.postMessage('probe');
    });
  } finally { worker?.terminate(); URL.revokeObjectURL(url); }
  return result;
}"""


# Followup-only observation: forward the original this, arguments, return value
# and exception unchanged. Do not copy Blob bytes or modify message/settings.
# This is harness evidence, never an application-generated cancellation receipt.
WORKER_POST_OBSERVER = r"""(() => {
  globalThis.__vr180HarnessWorkerPosts = [];
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(...args) {
    const returned = Reflect.apply(original, this, args);
    try {
      const m = args[0];
      if (m?.type === 'run') globalThis.__vr180HarnessWorkerPosts.push({
        at: performance.now(), operationId: m.operationId, inputRevision: m.inputRevision,
        inputName: m.file?.name, inputBytes: m.file?.size,
        settings: {mode: m.settings?.mode, layout: m.settings?.layout, fov: m.settings?.fov,
          eyeSize: m.settings?.eyeSize, bitrate: m.settings?.bitrate}
      });
    } catch (_) { /* The observer cannot change the original call's outcome. */ }
    return returned;
  };
})();"""

OPFS_JOBS = r"""async () => {
  const root = await navigator.storage.getDirectory();
  try {
    const jobs = await root.getDirectoryHandle('vr180-jobs');
    const entries = [];
    for await (const [name, handle] of jobs.entries()) entries.push({name, kind: handle.kind});
    return entries;
  } catch (error) { if (error.name === 'NotFoundError') return []; throw error; }
}"""


# Independent backend exercise: import the unchanged production save function
# and pass a real OPFS handle. This never replaces showSaveFilePicker or claims
# to test its OS dialog, an external destination, or the application's save UI.
FILE_OUTPUT_PROBE = r"""async ({fixtureURL, expectedBytes, expectedSHA256}) => {
  const record = {status: 'STARTED', userAgent: navigator.userAgent, isSecureContext,
    scope: 'Production save backend with a real OPFS FileSystemFileHandle; separate from application UI trials',
    osSaveDialogTested: false, externalDestinationTested: false, savePickerOverridden: false,
    positionRewriteTested: false, cleanup: {status: 'NOT_RUN'}};
  const state = globalThis.__vr180FileOutputProbe = {record, root: null, directoryName: null, created: false, url: null};
  const originalPicker = globalThis.showSaveFilePicker;
  const require = (ok, text) => { if (!ok) throw Error(text); };
  const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    b => b.toString(16).padStart(2, '0')).join('');
  try {
    const {saveBlobToFile} = await import('/shared/vr180/file-output.mjs');
    const response = await fetch(fixtureURL, {cache: 'no-store'});
    require(response.ok, 'PROBE_FIXTURE_UNAVAILABLE');
    const source = await response.blob();
    require(source.size === expectedBytes && source.size <= 2 * 1024 * 1024, 'PROBE_INPUT_SIZE');
    const inputBytes = new Uint8Array(await source.arrayBuffer());
    const inputHash = await sha256(inputBytes);
    require(inputHash === expectedSHA256, 'PROBE_FIXTURE_HASH');
    record.input = {bytes: source.size, sha256: inputHash, source: 'public synthetic stereo180-sbs fixture'};
    state.root = await navigator.storage.getDirectory();
    state.directoryName = 'vr180-file-output-probe-' + crypto.randomUUID();
    // Never adopt or clean a preexisting directory, even if the random name collides.
    try {
      await state.root.getDirectoryHandle(state.directoryName);
      throw Error('PROBE_DIRECTORY_ALREADY_EXISTS');
    } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    const dir = await state.root.getDirectoryHandle(state.directoryName, {create: true});
    state.created = true;
    record.opfsDirectory = state.directoryName;
    const handle = await dir.getFileHandle('saved.mp4', {create: true});
    require(handle.kind === 'file' && (await handle.getFile()).size === 0, 'PROBE_TARGET_NOT_EMPTY');
    const progress = record.saveProgress = [];
    const saved = await saveBlobToFile(source, handle, {expectedSha256: inputHash,
      onProgress: item => progress.push(item)});
    record.productionResult = {bytes: saved.bytes, sha256: saved.sha256, committed: saved.committed, hashMatched: saved.hashMatched};
    const actual = await handle.getFile(); // A new read through the actual OPFS handle.
    require(actual.size === source.size, 'PROBE_SAVED_SIZE');
    const actualBytes = new Uint8Array(await actual.arrayBuffer());
    record.saved = {bytes: actual.size, webCryptoSHA256: await sha256(actualBytes),
      rawBytesEqual: actualBytes.length === inputBytes.length && actualBytes.every((b, i) => b === inputBytes[i])};
    require(saved.committed && saved.hashMatched && saved.sha256 === inputHash
      && record.saved.webCryptoSHA256 === inputHash && record.saved.rawBytesEqual, 'PROBE_SAVED_BYTES');
    state.url = URL.createObjectURL(actual);

    const abortHandle = await dir.getFileHandle('uncommitted.bin', {create: true});
    const abortSource = new Blob([new Uint8Array(2 * 1024 * 1024).fill(7)]);
    const controller = new AbortController();
    const cancellation = record.cancellation = {inputBytes: abortSource.size,
      beforeBytes: (await abortHandle.getFile()).size, abortRequested: false, progress: []};
    require(cancellation.beforeBytes === 0, 'PROBE_ABORT_TARGET_NOT_EMPTY');
    try {
      await saveBlobToFile(abortSource, abortHandle, {signal: controller.signal,
        onProgress: item => {
          cancellation.progress.push(item);
          if (item.phase === 'write' && item.bytes >= 1024 * 1024 && !controller.signal.aborted) {
            cancellation.abortRequested = true; controller.abort();
          }
        }});
      throw Error('PROBE_ABORT_WAS_NOT_OBSERVED');
    } catch (error) {
      cancellation.error = {name: error.name, message: error.message,
        saveWriteCommitted: error.saveWriteCommitted ?? null, cleanupError: error.cleanupError ?? null};
      require(error.name === 'AbortError' && error.saveWriteCommitted === false && !error.cleanupError,
        'PROBE_ABORT_DID_NOT_ROLL_BACK: ' + error.message);
    }
    cancellation.afterBytes = (await abortHandle.getFile()).size;
    require(cancellation.abortRequested && cancellation.afterBytes === 0, 'PROBE_ABORT_LEFT_COMMITTED_BYTES');
    cancellation.status = 'ABORTED_EMPTY_FILE_OBSERVED';
    require(globalThis.showSaveFilePicker === originalPicker, 'PROBE_SAVE_PICKER_CHANGED');
    record.status = 'READY_FOR_DOWNLOAD';
  } catch (error) { record.status = 'FAIL'; record.error = {name: error.name, message: error.message}; }
  return record;
}"""

FILE_OUTPUT_CLEANUP = r"""async () => {
  const state = globalThis.__vr180FileOutputProbe;
  if (!state) return {status: 'NOT_CREATED'};
  if (state.url) { URL.revokeObjectURL(state.url); state.url = null; }
  if (!state.created) return (state.record.cleanup = {status: 'NOT_CREATED'});
  try {
    await state.root.removeEntry(state.directoryName, {recursive: true});
    try {
      await state.root.getDirectoryHandle(state.directoryName);
      throw Error('PROBE_DIRECTORY_REMAINS');
    } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    state.created = false;
    return (state.record.cleanup = {status: 'REMOVED', directory: state.directoryName, absenceObserved: true});
  } catch (error) {
    return (state.record.cleanup = {status: 'FAIL', directory: state.directoryName, error: String(error)});
  }
}"""


# This calls the production client/Worker, passing a real empty OPFS handle.
# It does not substitute a picker, a Worker, a file handle, or a product API.
DIRECT_OUTPUT_PROBE = r"""async ({fixtureURL, sourceName, settings, expectedBytes, expectedSHA256,
  cancelFirst, cancelAfterWrite, maxOutputBytes}) => {
  const record = {status: 'STARTED', userAgent: navigator.userAgent, isSecureContext,
    scope: 'Production StereoClient and Worker direct-output backend; actual OPFS handle, not OS picker/application UI',
    osSaveDialogTested: false, externalDestinationTested: false, savePickerOverridden: false,
    mediaOperationCount: 0, events: [], cancelAfterWrite, maxOutputBytes, cleanup: {status: 'NOT_RUN'}};
  const state = globalThis.__vr180DirectOutputProbe = {record, client: null, root: null,
    directoryName: null, created: false, urls: {}, receipts: {}};
  const originalPicker = globalThis.showSaveFilePicker;
  const require = (ok, message) => { if (!ok) throw Error(message); };
  const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    b => b.toString(16).padStart(2, '0')).join('');
  let cancelRequested = false, cancelPromise = null, cancelMode = cancelFirst;
  try {
    const {StereoClient} = await import('/shared/vr180/client.mjs');
    const response = await fetch(fixtureURL, {cache: 'no-store'});
    require(response.ok, 'DIRECT_FIXTURE_UNAVAILABLE');
    const source = new File([await response.blob()], sourceName + '.mp4', {type: 'video/mp4'});
    require(source.size === expectedBytes && source.size <= 2 * 1024 * 1024, 'DIRECT_FIXTURE_SIZE');
    const inputHash = await sha256(await source.arrayBuffer());
    require(inputHash === expectedSHA256, 'DIRECT_FIXTURE_HASH');
    record.input = {bytes: source.size, sha256: inputHash, source: 'public synthetic ' + sourceName};
    state.root = await navigator.storage.getDirectory();
    state.directoryName = 'vr180-direct-output-probe-' + crypto.randomUUID();
    try {
      await state.root.getDirectoryHandle(state.directoryName);
      throw Error('DIRECT_DIRECTORY_ALREADY_EXISTS');
    } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    const dir = await state.root.getDirectoryHandle(state.directoryName, {create: true});
    state.created = true;
    record.opfsDirectory = state.directoryName;
    const handle = await dir.getFileHandle('direct.mp4', {create: true});
    record.targetBeforeBytes = (await handle.getFile()).size;
    require(handle.kind === 'file' && record.targetBeforeBytes === 0, 'DIRECT_TARGET_NOT_EMPTY');
    state.client = new StereoClient({onEvent: event => {
      const observed = {type: event.type, at: performance.now(), operationId: event.operationId,
        inputRevision: event.inputRevision, progress: event.progress ?? null, error: event.error ?? null};
      record.events.push(observed);
      if (event.diagnostics) state.receipts.failure = event.diagnostics;
      if (cancelMode && !cancelRequested && event.type === 'progress' && event.progress?.phase === 'convert'
        && (!cancelAfterWrite || event.progress.outputBytes > 0)) {
        cancelRequested = true;
        record.cancellation.trigger = observed;
        record.cancellation.requestedAt = performance.now();
        cancelPromise = state.client.cancel().then(() => ({status: 'ACKNOWLEDGED'}),
          error => ({status: 'FAIL', name: error.name, message: error.message}));
      }
    }});
    const run = () => { record.mediaOperationCount++; return state.client.run(source, settings, {outputHandle: handle}); };
    if (cancelFirst) {
      const cancellation = record.cancellation = {status: 'STARTED', sameHandleRetry: true, sameInputRetry: true};
      const stopped = await run().then(result => ({resolved: true, result}), error => ({resolved: false, error}));
      cancellation.requested = cancelRequested;
      if (stopped.resolved) {
        state.receipts.failure = stopped.result.receipt;
        cancellation.status = 'OBSERVED_NOT_CANCELED';
        throw Error('DIRECT_CANCEL_NOT_OBSERVED');
      }
      if (stopped.error.diagnostics) state.receipts.canceled = stopped.error.diagnostics;
      cancellation.error = {name: stopped.error.name, message: stopped.error.message};
      cancellation.ack = cancelPromise ? await cancelPromise : null;
      require(cancelRequested && stopped.error.name === 'AbortError'
        && cancellation.ack?.status === 'ACKNOWLEDGED', 'DIRECT_CANCEL_FAILED');
      require(!cancelAfterWrite || cancellation.trigger?.progress?.outputBytes > 0,
        'DIRECT_CANCEL_BEFORE_WRITE_NOT_ACCEPTED');
      const receipt = state.receipts.canceled;
      require(receipt?.status === 'canceled' && receipt.cleanup?.status === 'complete'
        && receipt.output === null && receipt.saveWriteCommitted === false && receipt.saveCompleted === false,
        'DIRECT_CANCEL_RECEIPT_CONTRACT');
      cancellation.identity = {operationId: receipt.operationId, inputRevision: receipt.inputRevision};
      cancellation.afterBytes = (await handle.getFile()).size;
      cancellation.cleanupPending = state.client.cleanupPending;
      require(cancellation.afterBytes === 0 && !cancellation.cleanupPending, 'DIRECT_CANCEL_TARGET_NOT_EMPTY');
      await state.client.dispose();
      cancellation.disposeCompleted = true;
      cancellation.status = 'CANCELED_EMPTY_FILE_OBSERVED';
      cancelMode = false;
    }
    const result = await run();
    state.receipts.receipt = result.receipt; // Preserve the production receipt without edits.
    const receipt = result.receipt;
    record.resultIsFile = result.blob instanceof File;
    require(record.resultIsFile && receipt?.status === 'saved' && receipt.saveWriteCommitted === true
      && receipt.saveCompleted === true && receipt.directSave?.status === 'verified'
      && receipt.directSave.saveWriteCommitted === true && receipt.directSave.saveCompleted === true
      && receipt.directSave.wholeFileHashCompared === false && receipt.directSave.metadataHashMatched === true,
      'DIRECT_SAVED_RECEIPT_CONTRACT');
    const actual = await handle.getFile();
    require(actual.size > 0 && actual.size <= maxOutputBytes, 'DIRECT_PROBE_OUTPUT_SIZE_LIMIT');
    const actualBytes = new Uint8Array(await actual.arrayBuffer());
    const returnedBytes = new Uint8Array(await result.blob.arrayBuffer());
    record.saved = {bytes: actual.size, webCryptoSHA256: await sha256(actualBytes),
      returnedBytes: result.blob.size, returnedWebCryptoSHA256: await sha256(returnedBytes),
      rawBytesEqual: actualBytes.length === returnedBytes.length && actualBytes.every((b, i) => b === returnedBytes[i]),
      comparisonBasis: 'Post-commit fresh OPFS read vs returned File vs receipt; not a pre-commit whole-file expected hash'};
    require(record.saved.rawBytesEqual && record.saved.webCryptoSHA256 === record.saved.returnedWebCryptoSHA256
      && receipt.output.bytes === actual.size && receipt.savedSize === actual.size
      && receipt.output.sha256 === record.saved.webCryptoSHA256 && receipt.savedSha256 === record.saved.webCryptoSHA256,
      'DIRECT_SAVED_BYTES_DIFFER');
    if (cancelFirst) {
      const previous = record.cancellation.identity;
      require(receipt.operationId !== previous.operationId && receipt.inputRevision === previous.inputRevision + 1,
        'DIRECT_RETRY_IDENTITY');
      record.recoveryLink = {previousOperationId: previous.operationId, previousInputRevision: previous.inputRevision,
        operationId: receipt.operationId, inputRevision: receipt.inputRevision, sameClient: true, sameHandle: true,
        sameInput: true, inputGeneration: 1};
    }
    state.urls.output = URL.createObjectURL(actual);
    require(globalThis.showSaveFilePicker === originalPicker, 'DIRECT_PICKER_CHANGED');
    record.status = 'READY_FOR_DOWNLOAD';
  } catch (error) {
    if (error.diagnostics) state.receipts.failure = error.diagnostics;
    record.status = record.cancellation?.status === 'OBSERVED_NOT_CANCELED' ? 'OBSERVED_NOT_CANCELED' : 'FAIL';
    record.error = {name: error.name, message: error.message};
  }
  return record;
}"""

DIRECT_OUTPUT_CLEANUP = r"""async () => {
  const state = globalThis.__vr180DirectOutputProbe;
  if (!state) return {status: 'NOT_CREATED'};
  try {
    await state.client?.dispose();
    if (state.client?.cleanupPending) throw Error('DIRECT_CLEANUP_PENDING');
    for (const url of Object.values(state.urls)) URL.revokeObjectURL(url);
    state.urls = {};
    if (!state.created) return (state.record.cleanup = {status: 'NOT_CREATED', clientDisposed: true});
    await state.root.removeEntry(state.directoryName, {recursive: true});
    try {
      await state.root.getDirectoryHandle(state.directoryName);
      throw Error('DIRECT_DIRECTORY_REMAINS');
    } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    state.created = false;
    return (state.record.cleanup = {status: 'REMOVED', clientDisposed: true, directory: state.directoryName, absenceObserved: true});
  } catch (error) {
    return (state.record.cleanup = {status: 'FAIL', directory: state.directoryName, error: String(error)});
  }
}"""


# Structural fixtures only: production parser/tagger, native Chrome Blobs, and
# independent bounded reads. Zero sample bytes are not decodable H.264 media.
RANGE_PROBE = r"""async ({kind, fixtureURL, expectedSHA256}) => {
  const record = {kind, status: 'STARTED', userAgent: navigator.userAgent, isSecureContext,
    scope: 'Native-browser container structure and bounded reads only; not a real large video or a decode/encode trial',
    nativeBlobUsed: true, productionApisReplaced: false, downloaded: false, fullFileHashComputed: false,
    inputFullyRecovered: false, outputFullyRecovered: false, realVideoTested: false,
    notVerified: ['5-10GB real video processing', 'full large-file recovery', 'H.264 decoding', 'VR playback', 'large-file memory peak']};
  const require = (ok, message) => { if (!ok) throw Error(message); };
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const nativeSlice = Blob.prototype.slice, nativeArrayBuffer = Blob.prototype.arrayBuffer;
  const slice = (blob, start = 0, end = blob.size) => Reflect.apply(nativeSlice, blob, [start, end]);
  const read = async (blob, start, length) => {
    require(length <= 65536 && start >= 0 && start + length <= blob.size, 'HARNESS_RANGE_BOUND');
    const part = slice(blob, start, start + length);
    require(part instanceof Blob && part.size === length, 'NATIVE_SLICE_SIZE_MISMATCH');
    const bytes = new Uint8Array(await Reflect.apply(nativeArrayBuffer, part, []));
    require(bytes.length === length, 'NATIVE_READ_SIZE_MISMATCH'); return bytes;
  };
  const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
  const u64 = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; };
  const box = (type, ...parts) => {
    const payload = parts.reduce((n, p) => n + (p.size ?? p.byteLength), 0);
    const extended = payload + 8 > 0xffffffff;
    const size = payload + (extended ? 16 : 8);
    const value = new Blob([u32(extended ? 1 : size), encoder.encode(type), ...(extended ? [u64(size)] : []), ...parts]);
    require(value.size === size, 'NATIVE_BLOB_SIZE_MISMATCH'); return value;
  };
  const full = (type, ...parts) => box(type, u32(0), ...parts);
  async function children(blob, start = 0, end = blob.size) {
    const list = [];
    while (start < end) {
      require(list.length < 100 && end - start >= 8, 'HARNESS_BOX_COUNT_OR_BOUNDS');
      const h = await read(blob, start, 8), d = new DataView(h.buffer), type = decoder.decode(h.subarray(4));
      let size = d.getUint32(0), header = 8;
      if (size === 1) { size = Number(new DataView((await read(blob, start + 8, 8)).buffer).getBigUint64(0)); header = 16; }
      require(Number.isSafeInteger(size) && size >= header && start + size <= end, 'HARNESS_BOX_SIZE');
      list.push({type, start, end: start + size, payload: start + header, header}); start += size;
    }
    return list;
  }
  async function find(blob, path) {
    let list = await children(blob), node;
    for (let i = 0; i < path.length; i++) {
      node = list.find(n => n.type === path[i]); require(node, 'HARNESS_MISSING_' + path[i]);
      if (i < path.length - 1) list = await children(blob, node.payload, node.end);
    }
    return node;
  }
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    x => x.toString(16).padStart(2, '0')).join('');
  const stats = record.parserReads = {calls: 0, bytes: 0, maximumBytes: 0, wholeBlobReadAttempts: 0, slices: 0};
  let cancelOnTableRead = null;
  function observe(blob) {
    require(blob instanceof Blob, 'PARSER_INPUT_IS_NOT_NATIVE_BLOB');
    Object.defineProperty(blob, 'arrayBuffer', {value() { stats.wholeBlobReadAttempts++; throw Error('WHOLE_BLOB_READ_FORBIDDEN'); }});
    Object.defineProperty(blob, 'slice', {value(...args) {
      const part = Reflect.apply(nativeSlice, this, args); stats.slices++;
      require(part instanceof Blob, 'SLICE_IS_NOT_NATIVE_BLOB');
      Object.defineProperty(part, 'arrayBuffer', {value() {
        stats.calls++; stats.bytes += part.size; stats.maximumBytes = Math.max(stats.maximumBytes, part.size);
        require(part.size <= 65536, 'PARSER_READ_EXCEEDS_64K');
        if (cancelOnTableRead && part.size === 65536) { const request = cancelOnTableRead; cancelOnTableRead = null; request.at = args[0]; setTimeout(() => request.controller.abort(), 0); }
        return Reflect.apply(nativeArrayBuffer, part, []);
      }});
      return part;
    }});
    return blob;
  }
  const controller = new AbortController();
  const started = performance.now();
  const timeout = setTimeout(() => { record.resourceDeadlineReached = true; controller.abort(); }, 120000);
  try {
    const {inspectMp4, tagMp4} = await import('/shared/vr180/mp4.mjs');
    const response = await fetch(fixtureURL, {cache: 'no-store'}); require(response.ok, 'BASE_FIXTURE_UNAVAILABLE');
    const base = await response.blob(); require(base.size <= 1024 * 1024, 'BASE_FIXTURE_TOO_LARGE');
    require(await digest(new Uint8Array(await Reflect.apply(nativeArrayBuffer, base, []))) === expectedSHA256, 'BASE_FIXTURE_HASH');
    record.baseFixtureSHA256 = expectedSHA256;
    const top = await children(base), movie = top.find(n => n.type === 'moov'), ft = top.find(n => n.type === 'ftyp');
    require(movie && ft, 'BASE_MOVIE_MISSING');
    const movieChildren = await children(base, movie.payload, movie.end);
    let video;
    for (const track of movieChildren.filter(n => n.type === 'trak')) {
      const mdia = (await children(base, track.payload, track.end)).find(n => n.type === 'mdia');
      const handler = (await children(base, mdia.payload, mdia.end)).find(n => n.type === 'hdlr');
      if (decoder.decode(await read(base, handler.payload + 8, 4)) === 'vide') video = track;
    }
    require(video, 'BASE_VIDEO_MISSING');
    const samples = kind === 'large-stsz' ? 4194305 : 1;
    const ftyp = slice(base, ft.start, ft.end);
    const originalStsd = await find(base, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd']);
    // The known fixture's video track is first; fail rather than adopt an audio stsd.
    const entries = await children(base, originalStsd.payload + 8, originalStsd.end);
    require(entries.length === 1 && entries[0].type === 'avc1', 'BASE_FIRST_TRACK_NOT_AVC1');
    const tableParts = [];
    if (kind === 'large-stsz') {
      const page = new Uint8Array(65536), d = new DataView(page.buffer);
      for (let i = 0; i < page.length; i += 4) d.setUint32(i, 1);
      const nativePage = new Blob([page]);
      for (let remaining = samples * 4; remaining > 0; remaining -= Math.min(remaining, page.length))
        tableParts.push(slice(nativePage, 0, Math.min(remaining, page.length)));
    }
    const stsz = kind === 'large-stsz' ? full('stsz', u32(0), u32(samples), ...tableParts) : full('stsz', u32(1), u32(samples));
    const timing = full('stts', u32(1), u32(samples), u32(1));
    const chunks = full('stsc', u32(1), u32(1), u32(samples), u32(1));
    const mdat = box('mdat', kind === 'large-offset' ? Uint8Array.of(167) : new Uint8Array(samples));
    const headerCopy = async node => {
      const b = await read(base, node.start, node.end - node.start), d = new DataView(b.buffer);
      require(b[node.header] === 0, 'BASE_HEADER_VERSION');
      if (node.type === 'tkhd') d.setUint32(node.header + 20, samples);
      else { d.setUint32(node.header + 12, 1000); d.setUint32(node.header + 16, samples); }
      return new Blob([b]);
    };
    async function buildTrack(node, stbl) {
      if (node.type === 'edts') return null;
      if (node.type === 'tkhd' || node.type === 'mdhd') return headerCopy(node);
      if (node.type === 'stbl') return stbl;
      if (!['trak', 'mdia', 'minf'].includes(node.type)) return slice(base, node.start, node.end);
      const parts = await Promise.all((await children(base, node.payload, node.end)).map(n => buildTrack(n, stbl)));
      return box(node.type, ...parts.filter(Boolean));
    }
    const mvhd = await headerCopy(movieChildren.find(n => n.type === 'mvhd'));
    let hugeFree = null;
    if (kind === 'large-offset') {
      const zeroMiB = new Blob([new Uint8Array(1024 * 1024)]);
      hugeFree = box('free', ...Array(4096).fill(zeroMiB));
      record.logicalPadding = {bytes: hugeFree.size, construction: '4096 references to one native 1MiB zero Blob, plus extended box header', wholePaddingRead: false};
    }
    async function buildMovie(offset) {
      const offsets = kind === 'large-offset' ? full('co64', u32(1), u64(offset)) : full('stco', u32(1), u32(offset));
      const stbl = box('stbl', slice(base, originalStsd.start, originalStsd.end), timing, chunks, stsz, offsets);
      return box('moov', mvhd, await buildTrack(video, stbl), ...(hugeFree ? [hugeFree] : []));
    }
    let moov = await buildMovie(kind === 'large-stsz' ? ftyp.size + 8 : 0);
    if (kind === 'large-offset') moov = await buildMovie(ftyp.size + moov.size + 8);
    const input = observe(new Blob(kind === 'large-stsz' ? [ftyp, mdat, moov] : [ftyp, moov, mdat], {type: 'video/mp4'}));
    record.inputLogicalBytes = input.size; record.inputMoovBytes = moov.size;
    require(kind === 'large-stsz' ? moov.size > 16 * 1024 * 1024 : input.size > 2 ** 32, 'STRUCTURAL_BOUNDARY_NOT_REACHED');
    const before = await inspectMp4(input, {signal: controller.signal});
    record.before = before;
    require(before.sampleCounts.video === samples && before.sampleCounts.audio === 0 && before.sampleCounts.total === samples, 'INPUT_SAMPLE_COUNTS');
    require(before.containerMetadataBytes === moov.size, 'INPUT_METADATA_SIZE');
    const output = observe(await tagMp4(input, {layout: 'sbs', signal: controller.signal}));
    record.outputLogicalBytes = output.size;
    const after = await inspectMp4(output, {signal: controller.signal}); record.after = after;
    require(after.sampleCounts.video === samples && after.sampleCounts.audio === 0 && after.sampleCounts.total === samples, 'OUTPUT_SAMPLE_COUNTS');
    require(after.stereoMode === 2 && after.projection === 'equi' && after.bounds.top === 0 && after.bounds.bottom === 0
      && after.bounds.left === 0x40000000 && after.bounds.right === 0x40000000 && after.pose.every(n => n === 0), 'TAG_METADATA');
    const oldMovie = await find(input, ['moov']), newMovie = await find(output, ['moov']);
    require(newMovie.start === input.size, 'TAG_NOT_APPENDED');
    require(after.containerMetadataBytes === newMovie.end - newMovie.start, 'OUTPUT_METADATA_SIZE');
    require(decoder.decode(await read(output, oldMovie.start + 4, 4)) === 'free', 'OLD_MOOV_NOT_FREE');
    const sourceMedia = await find(input, ['mdat']), savedMedia = await find(output, ['mdat']);
    require(sourceMedia.start === savedMedia.start && sourceMedia.end === savedMedia.end, 'MDAT_POSITION_CHANGED');
    async function compareRange(label, leftAt, rightAt, bytes) {
      const hashes = [], otherHashes = [];
      for (let at = 0; at < bytes; at += 65536) {
        if (controller.signal.aborted) throw new DOMException('Probe deadline', 'AbortError');
        const n = Math.min(65536, bytes - at);
        hashes.push(await digest(await read(input, leftAt + at, n)));
        otherHashes.push(await digest(await read(output, rightAt + at, n)));
        require(hashes.at(-1) === otherHashes.at(-1), 'PRESERVED_RANGE_MISMATCH_' + label);
      }
      return {label, inputOffset: leftAt, outputOffset: rightAt, bytes, chunkBytes: 65536, chunks: hashes.length,
        inputSHA256PerChunk: hashes, outputSHA256PerChunk: otherHashes, allChunksMatched: true};
    }
    record.preservedRanges = [await compareRange('mdat payload', sourceMedia.payload, savedMedia.payload, sourceMedia.end - sourceMedia.payload)];
    for (const type of ['stsz', 'stts', 'stsc', kind === 'large-offset' ? 'co64' : 'stco']) {
      const path = ['moov', 'trak', 'mdia', 'minf', 'stbl', type], a = await find(input, path), b = await find(output, path);
      require(a.end - a.start === b.end - b.start, 'TABLE_SIZE_CHANGED_' + type);
      record.preservedRanges.push(await compareRange(type, a.start, b.start, a.end - a.start));
    }
    if (kind === 'large-offset') {
      require(newMovie.header === 16 && newMovie.end - newMovie.start > 2 ** 32, 'OUTPUT_PARENT_LARGESIZE');
      const co64 = await find(output, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'co64']);
      const offset = Number(new DataView((await read(output, co64.payload + 8, 8)).buffer).getBigUint64(0));
      require(offset === sourceMedia.payload && offset > 2 ** 32, 'CO64_OFFSET_NOT_PRESERVED');
      require((await read(input, offset, 1))[0] === 167 && (await read(output, offset, 1))[0] === 167, 'NATIVE_TAIL_SLICE');
      record.largeOffset = {offset, outputMoovHeaderBytes: newMovie.header, outputMoovBytes: newMovie.end - newMovie.start,
        tailSliceBytes: 1, expectedTailByte: 167, tailSliceMatched: true, paddingHashComputed: false};
    }
    if (kind === 'large-stsz') {
      const request = {controller: new AbortController(), at: null}; cancelOnTableRead = request;
      let stopped = false;
      try { await inspectMp4(input, {signal: request.controller.signal}); }
      catch (error) { require(error.name === 'AbortError', 'WRONG_TABLE_CANCEL_ERROR'); stopped = true; }
      cancelOnTableRead = null;
      require(stopped && request.at !== null, 'TABLE_CANCEL_NOT_OBSERVED');
      record.tableCancellation = {status: 'PASS', requestedAfterReadAt: request.at, readBytes: 65536, observedError: 'AbortError'};
    }
    require(stats.wholeBlobReadAttempts === 0 && stats.maximumBytes <= 65536, 'UNBOUNDED_PRODUCTION_READ');
    record.status = 'PASS';
  } catch (error) {
    record.status = record.resourceDeadlineReached || ['QuotaExceededError', 'NotReadableError'].includes(error.name)
      || /out of memory|allocation failed/i.test(error.message) ? 'BLOCKED' : 'FAIL';
    record.error = {name: error.name, message: error.message};
  } finally { clearTimeout(timeout); record.wallMilliseconds = performance.now() - started; }
  return record;
}"""


def select_input(page, fixture):
    page.locator('#file').set_input_files(str(fixture))
    page.wait_for_function("document.querySelector('#status').textContent.includes('左右配置と視野角を確認して')")


def configure(page, mode, layout, fov, eye_size=256):
    for selector, value in [('#layout', layout), ('#fov', str(fov)), ('#mode', mode)]:
        page.locator(selector).select_option(value)
        page.wait_for_function("document.querySelector('#cancel').disabled")
    if mode == 'convert':
        page.locator('#size').select_option(str(eye_size))
        page.wait_for_function("document.querySelector('#cancel').disabled")
    page.locator('#confirmed').check()
    page.wait_for_function("document.querySelector('#cancel').disabled && !document.querySelector('#run').disabled")


def start_operation(page, record):
    page.locator('#run').click()
    record['mediaOperationStarted'] = True
    record['mediaOperationCount'] = record.get('mediaOperationCount', 0) + 1


def last_post(page, revision=2):
    page.wait_for_function("revision => globalThis.__vr180HarnessWorkerPosts.at(-1)?.inputRevision === revision", arg=revision)
    observation = page.evaluate("globalThis.__vr180HarnessWorkerPosts.at(-1)")
    require(observation and observation['settings']['mode'] != 'inspect', 'No media Worker post observed')
    return observation


def recovery_prelude(page, trial, record, scenario, fixture):
    """Perform the first attempt, keeping this page alive for the later recovery."""
    require(page.evaluate(OPFS_JOBS) == [], 'Preexisting OPFS jobs would confound recovery evidence')
    if scenario == 'cancel-retry':
        first_input = DOCS / 'vr180-studio/fixtures/stereo180-4k-12s-sbs.mp4'
        shutil.copyfile(first_input, trial / 'cancel-input.mp4')
        select_input(page, first_input)
        configure(page, 'convert', 'sbs', 180, 2048)
        start_operation(page, record)
        previous = {'kind': 'cancel', 'inputGeneration': 1, 'inputSHA256': digest(first_input),
                    'workerPost': last_post(page), 'status': 'RUNNING'}
        record['previousAttempt'] = previous
        require(previous['workerPost']['inputRevision'] == 2, 'Unexpected cancellation input revision')
        require(previous['workerPost']['inputName'] == first_input.name and previous['workerPost']['inputBytes'] == first_input.stat().st_size, 'Cancellation input differs from the observed Worker post')
        require(previous['workerPost']['settings'] == {'mode': 'convert', 'layout': 'sbs', 'fov': 180, 'eyeSize': 2048, 'bitrate': 25165824}, 'Cancellation conversion settings differ')
        page.wait_for_function("document.querySelector('#cancel').disabled || (document.querySelector('#progress').value > 0 && document.querySelector('#progress').value < 1)", timeout=120000)
        progress = page.evaluate("({busy: !document.querySelector('#cancel').disabled, value: document.querySelector('#progress').value, status: document.querySelector('#status').textContent})")
        previous['progressBeforeCancel'] = progress
        if not progress['busy'] or not 0 < progress['value'] < 1:
            if page.locator('#receipt').is_enabled():
                early = download_receipt(page, trial / 'receipt-before-cancel-opportunity.json')
                if early.get('status') == 'failed':
                    previous['status'] = 'FAIL'
                    raise RuntimeError('Application failed before cancellation: ' + json.dumps(early.get('error')))
            previous['status'] = 'OBSERVED_NOT_CANCELED'
            raise NotCanceled('No incomplete positive progress was available for cancellation')
        previous['opfsJobsBeforeCancel'] = page.evaluate(OPFS_JOBS)
        require(previous['opfsJobsBeforeCancel'] == [{'name': previous['workerPost']['operationId'], 'kind': 'directory'}], 'OPFS job differs from observed operationId')
        try:
            page.locator('#cancel').click(timeout=1000)
        except Exception as error:
            previous['status'] = 'OBSERVED_NOT_CANCELED'
            raise NotCanceled(f'Cancellation click could not be delivered: {error}') from error
        page.wait_for_function("document.querySelector('#cancel').disabled && !document.querySelector('#run').disabled", timeout=15000)
        previous['statusAfterCancel'] = page.locator('#status').inner_text()
        if '取り消しました' not in previous['statusAfterCancel']:
            if page.locator('#receipt').is_enabled():
                ended = download_receipt(page, trial / 'receipt-after-cancel-request.json')
                if ended.get('status') == 'failed':
                    previous['status'] = 'FAIL'
                    raise RuntimeError('Application failed during cancellation attempt: ' + json.dumps(ended.get('error')))
            previous['status'] = 'OBSERVED_NOT_CANCELED'
            raise NotCanceled('Completion/failure was observed instead of the cancellation acknowledgement')
        # wait_for_function treats a returned Promise as truthy before its value
        # resolves. Poll evaluate instead, so each OPFS enumeration is awaited.
        cleanup_started = time.monotonic()
        previous['cleanupObservations'] = []
        while True:
            remaining_jobs = page.evaluate(OPFS_JOBS)
            previous['cleanupObservations'].append({'elapsedMs': (time.monotonic() - cleanup_started) * 1000,
                                                    'jobs': remaining_jobs})
            if not remaining_jobs:
                break
            require(time.monotonic() - cleanup_started < 15, 'Cancellation OPFS cleanup did not finish within 15 seconds')
            page.wait_for_timeout(100)
        previous.update(status='CANCELED_OBSERVED', opfsJobsAfterCancel=remaining_jobs,
                        runEnabled=page.locator('#run').is_enabled(),
                        applicationCancellationReceipt='receipt-canceled.json',
                        receiptNote='The unmodified application cancellation receipt is separate from this external OPFS/UI observation.')
        canceled = download_receipt(page, trial / 'receipt-canceled.json')
        require(canceled.get('build') == BUILD and canceled.get('status') == 'canceled', 'Expected cancellation receipt was not recovered')
        require((canceled.get('operationId'), canceled.get('inputRevision')) ==
                (previous['workerPost']['operationId'], previous['workerPost']['inputRevision']), 'Cancellation receipt identity differs')
        require(canceled.get('output') is None and canceled.get('cleanup', {}).get('status') == 'complete', 'Canceled operation did not report complete cleanup without output')
        require(previous['opfsJobsAfterCancel'] == [] and previous['runEnabled'], 'Cancellation cleanup or retry readiness failed')
        record.update(inputGeneration=2, expectedInputRevision=4,
                      recoveryScenario='Cancel 4K 12s conversion, then replace it with the small 180-degree input on the same page and run metadata-only copy; not a retry of the canceled input')
        select_input(page, fixture)
    else:
        select_input(page, fixture)
        configure(page, 'copy', 'tb', 360)
        start_operation(page, record)
        observed = last_post(page)
        page.wait_for_function("document.querySelector('#cancel').disabled && !document.querySelector('#receipt').disabled", timeout=15000)
        failure = download_receipt(page, trial / 'receipt-expected-failure.json')
        require(failure.get('status') == 'failed' and failure.get('error', {}).get('message') == 'COPY_REQUIRES_180_DEGREES', 'Expected 360-degree copy rejection was not observed')
        require(failure.get('output') is None, 'Rejected operation unexpectedly produced an output')
        rejected = {'inputSHA256': digest(fixture), 'expectedInputRevision': 2,
                    'expectedSettings': {'mode': 'copy', 'layout': 'tb', 'fov': 360}}
        validate_receipt(failure, rejected, fixture, 'copy', expect_input_hash=False)
        require((failure['operationId'], failure['inputRevision']) == (observed['operationId'], observed['inputRevision']), 'Failure receipt differs from observed Worker operation')
        record['previousAttempt'] = {'kind': 'expected-failure', 'status': 'EXPECTED_FAILURE_OBSERVED',
                                     'inputGeneration': 1, 'inputSHA256': digest(fixture),
                                     'workerPost': observed, 'receipt': 'receipt-expected-failure.json',
                                     'error': failure['error'], 'inputHashNote': 'Validation rejects before the application computes its input hash.'}
        record['expectedInputRevision'] = 3


def check_recovery_budget(out, trial, announced_bytes):
    require(isinstance(announced_bytes, int) and announced_bytes > 0, 'Invalid prepared output size')
    existing = sum(path.stat().st_size for path in out.rglob('*') if path.is_file())
    # Conservative uncompressed/base64 bound leaves room for screenshots, final
    # reports and tar/chunk overhead. Do not change output settings to fit it.
    projected = ((existing + announced_bytes + 384 * 1024) * 4 + 2) // 3 + 64 * 1024
    budget = {'existingEvidenceBytes': existing, 'announcedOutputBytes': announced_bytes,
              'conservativeLogBytes': projected, 'limitBytes': LIMIT,
              'scope': 'capacity of this evidence recovery route; not a user input/output limit',
              'status': 'READY' if projected <= LIMIT else 'CAPACITY_BLOCKED'}
    write(trial / 'recovery-budget.json', budget)
    require(projected <= LIMIT, 'EVIDENCE_RECOVERY_CAPACITY: prepared MP4 exceeds this log recovery route budget; not downloaded; previous evidence retained')


def download_receipt(page, path):
    details = page.locator('details.card')
    if details.get_attribute('open') is None:
        details.locator('summary').click(timeout=5000)
    require(page.locator('#receipt').is_enabled(), 'No downloadable application receipt')
    with page.expect_download(timeout=10000) as event:
        page.locator('#receipt').click(timeout=5000)
    event.value.save_as(str(path))
    require(event.value.failure() is None, 'Receipt download failed')
    return json.loads(path.read_text(encoding='utf-8'))


def validate_save_history(raw):
    """Admit schema 2 facts independently of the production summary getters."""
    require(raw.get('schemaVersion') == 2, 'Expected save schema 2')
    attempts = raw.get('saveAttempts')
    require(isinstance(attempts, list), 'Missing save attempts')
    ids, committed, unknown, verified = set(), False, False, None
    expected = raw.get('output')
    for attempt in attempts:
        identity = attempt.get('id')
        require(isinstance(identity, str) and identity and identity not in ids, 'Invalid/duplicate save attempt ID')
        ids.add(identity)
        require(attempt.get('resultOperationId') == raw.get('operationId') and attempt.get('inputRevision') == raw.get('inputRevision'), 'Save attempt identity differs')
        require(attempt.get('kind') in ('direct', 'prepared-copy', 'download-request'), 'Invalid save kind')
        require(attempt.get('commitState') in ('not-started', 'pending', 'committed', 'aborted', 'unknown'), 'Invalid commit state')
        require(attempt.get('verificationState') in ('not-run', 'running', 'passed', 'failed', 'canceled'), 'Invalid verification state')
        committed |= attempt['commitState'] == 'committed'
        unknown |= attempt['commitState'] == 'unknown'
        if attempt['verificationState'] == 'passed':
            require(attempt['commitState'] == 'committed' and expected is not None, 'Verified save lacks committed output')
            require(attempt.get('bytes') == expected.get('bytes') and attempt.get('sha256') == expected.get('sha256'), 'Saved attempt differs from generated result')
            if attempt['kind'] == 'direct':
                require(attempt.get('wholeFileHashCompared') is False and attempt.get('metadataHashMatched') is True, 'Direct hash semantics differ')
            else:
                require(attempt['kind'] == 'prepared-copy' and attempt.get('wholeFileHashCompared') is True, 'Prepared-copy verification is missing')
            verified = attempt
    require(raw.get('saveWriteCommitted') is (True if committed else None if unknown else False), 'Commit summary differs from history')
    require(raw.get('saveCompleted') is bool(verified), 'Verification summary differs from history')
    require(raw.get('savedSize') == (verified.get('bytes') if verified else None), 'Saved size summary differs')
    require(raw.get('savedSha256') == (verified.get('sha256') if verified else None), 'Saved hash summary differs')


def validate_receipt(raw, record, fixture, mode, expect_input_hash=True):
    require(raw['build'] == BUILD, 'Wrong application build')
    validate_save_history(raw)
    require(isinstance(raw.get('operationId'), str) and re.fullmatch(r'[0-9a-f-]{36}', raw['operationId']), 'Missing operation ID')
    require(raw.get('inputRevision') == record.get('expectedInputRevision', 2), 'Unexpected input revision')
    require(raw['input']['sha256'] == (record['inputSHA256'] if expect_input_hash else None), 'Receipt input hash differs')
    require(raw['input']['bytes'] == fixture.stat().st_size, 'Receipt input size differs')
    settings = raw['settings']
    require(settings['mode'] == mode and settings['confirmed'] is True, 'Wrong mode/confirmation')
    expected = record['expectedSettings']
    require(settings['layout'] == expected['layout'], 'Wrong source eye layout')
    require(settings['fov'] == expected['fov'], 'Wrong source field of view')
    if mode == 'convert':
        require(settings['eyeSize'] == expected['eyeSize'] and settings['bitrate'] == expected['bitrate'], 'Wrong conversion size/bitrate')
        if raw.get('metrics'):
            require(raw['metrics']['jobId'] == raw['operationId'], 'Metric jobId differs from receipt operationId')
    record.update(operationId=raw['operationId'], inputRevision=raw['inputRevision'], receiptIdentityVerified=True)


def independent_check(trial, fixture, output, mode):
    if mode == 'copy':
        verifier = 'verify-metadata.py'
        args = ['--input', str(fixture), '--output', str(output), '--layout', 'sbs',
                '--report', str(trial / 'metadata-verification.json')]
    else:
        verifier = 'verify-conversion.py'
        args = [str(fixture), str(output), '--layout', 'tb', '--fov', '360', '--eye-size', '256',
                '--report', str(trial / 'conversion-verification.json')]
    argv = [sys.executable, str(ROOT / 'tools/vr180' / verifier), *args]
    write(trial / 'verifier-command.json', {'argv': argv, 'scriptSHA256': VERIFIERS[verifier]})
    result = subprocess.run(argv, capture_output=True, text=True, timeout=90)
    (trial / 'verifier.stdout.txt').write_text(result.stdout, encoding='utf-8')
    (trial / 'verifier.stderr.txt').write_text(result.stderr, encoding='utf-8')
    write(trial / 'verifier-exit.json', {'returncode': result.returncode})
    require(result.returncode == 0, f'Independent {verifier} failed ({result.returncode})')
    if mode == 'convert':
        spec = importlib.util.spec_from_file_location('independent_metadata', ROOT / 'tools/vr180/verify-metadata.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        reader = module.Reader(output)
        try:
            data = module.verify_metadata(reader, module.exactly(reader.boxes(), 'moov'), 'sbs')
        finally:
            reader.close()
        write(trial / 'spherical-metadata-verification.json', {
            'status': 'PASS', 'verifierSHA256': VERIFIERS['verify-metadata.py'],
            'outputSHA256': digest(output), 'metadata': data})


def run_trial(context, origin, out, name, mode, run_id, defer_verification=False, scenario=None, eye_size=256):
    trial = out / (scenario or name)
    trial.mkdir()
    fixture = DOCS / 'vr180-studio/fixtures' / f'{name}.mp4'
    shutil.copyfile(fixture, trial / 'input.mp4')
    layout, fov = ('sbs' if name.endswith('sbs') else 'tb'), (360 if '360' in name else 180)
    record = {'trialId': f'{run_id}-{scenario or name}', 'fixture': name, 'mode': mode, 'scenario': scenario,
              'inputSHA256': digest(fixture), 'inputBytes': fixture.stat().st_size,
              'inputGeneration': 1, 'expectedInputRevision': 2, 'startedAt': now(), 'status': 'STARTED',
              'expectedSettings': {'mode': mode, 'layout': layout, 'fov': fov, 'eyeSize': eye_size,
                                   'bitrate': min(40000000, max(2000000, eye_size ** 2 * 6))},
              'mediaOperationStarted': False, 'downloadRecovered': False, 'independentVerificationPassed': False,
              'scope': 'synthetic cloud-copy UI test; VR player, real footage, usability and speed improvements untested'}
    if mode == 'copy':
        record['expectedSettings'].pop('eyeSize')
        record['expectedSettings'].pop('bitrate')
    page = context.new_page()
    page.set_default_timeout(15000)
    errors, workers = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('worker', lambda worker: workers.append({'url': worker.url, 'observedAt': now()}))
    start = time.monotonic()
    try:
        page.goto(origin + '/vr180-studio/', wait_until='networkidle')
        api = page.evaluate(API_PROBE)
        write(trial / 'browser-capabilities.json', api)
        record['browserUserAgent'] = api['userAgent']
        if scenario:
            record['samePageRecovery'] = True
            recovery_prelude(page, trial, record, scenario, fixture)
        else:
            select_input(page, fixture)
        configure(page, mode, layout, fov, eye_size)
        start_operation(page, record)
        page.wait_for_function("document.querySelector('#cancel').disabled && !document.querySelector('#receipt').disabled", timeout=180000 if '4k' in name else 120000)
        raw = download_receipt(page, trial / 'receipt-pre-download.json')
        record['receiptStatus'] = raw.get('status')
        record['codecCapabilities'] = raw.get('capabilities') or (raw.get('metrics') or {}).get('capabilities')
        validate_receipt(raw, record, fixture, mode)
        require(raw['status'] == 'prepared', 'Application failure: ' + json.dumps(raw.get('error'), ensure_ascii=False))
        if scenario:
            current = last_post(page, record['expectedInputRevision'])
            previous = record['previousAttempt']['workerPost']
            require(raw['operationId'] == current['operationId'] != previous['operationId'], 'Retry operation IDs were not distinct/consistent')
            record['recoveryLink'] = {'previousOperationId': previous['operationId'], 'previousInputRevision': previous['inputRevision'],
                                      'operationId': raw['operationId'], 'inputRevision': raw['inputRevision'],
                                      'previousInputGeneration': 1, 'inputGeneration': record['inputGeneration'],
                                      'samePage': True, 'workerPost': current}
        check_recovery_budget(out, trial, raw['output']['bytes'])
        with page.expect_download(timeout=15000) as event:
            page.locator('#download').click()
        suggested = event.value.suggested_filename
        require(Path(suggested).name == suggested and suggested.endswith('.mp4'), 'Unsafe/unexpected output filename')
        output = trial / suggested
        event.value.save_as(str(output))
        require(event.value.failure() is None, 'Media download failed')
        require(output.stat().st_size == raw['output']['bytes'], 'Downloaded output size differs')
        require(digest(output) == raw['output']['sha256'], 'Downloaded output hash differs')
        final = download_receipt(page, trial / 'receipt.json')
        validate_receipt(final, record, fixture, mode)
        require((final['operationId'], final['inputRevision'], final['output']) ==
                (raw['operationId'], raw['inputRevision'], raw['output']), 'Receipt identity/output changed during download')
        require(final.get('downloadRequestedAt'), 'Download request absent from final receipt')
        record.update(outputFile=output.name, outputSHA256=digest(output), outputBytes=output.stat().st_size,
                      downloadRecovered=True, browserDownloadRecoveredAt=now())
        require(any(w['url'] == origin + '/shared/vr180/worker.mjs' for w in workers), 'Application Worker was not observed')
        if defer_verification:
            record.update(status=RECOVERED, verifierDeferred='Explicit CLI request: run fixed independent verifiers on recovered bytes in the evidence receiver environment')
        else:
            independent_check(trial, fixture, output, mode)
            record.update(status='PASS', independentVerificationPassed=True)
    except (Exception, KeyboardInterrupt) as error:
        record.update(status='OBSERVED_NOT_CANCELED' if isinstance(error, NotCanceled) else 'FAIL', error=f'{type(error).__name__}: {error}')
        (trial / 'failure-traceback.txt').write_text(traceback.format_exc(), encoding='utf-8')
        try:
            failure = download_receipt(page, trial / 'receipt-on-failure.json')
            record['failureReceiptRecovered'] = True
            record['failureReceiptIdentity'] = {key: failure.get(key) for key in ('operationId', 'inputRevision', 'status')}
            record['codecCapabilities'] = failure.get('capabilities') or (failure.get('metrics') or {}).get('capabilities')
        except Exception as recovery_error:
            record.update(failureReceiptRecovered=False, failureReceiptError=str(recovery_error))
    finally:
        record.update(wallSeconds=time.monotonic() - start, pageErrors=errors, workers=workers, finishedAt=now())
        try:
            posts = page.evaluate('globalThis.__vr180HarnessWorkerPosts ?? null')
            if posts is not None:
                write(trial / 'worker-post-observations.json', {'observerSHA256': hashlib.sha256(WORKER_POST_OBSERVER.encode()).hexdigest(),
                      'scope': 'External harness observation; not an application receipt', 'posts': posts})
        except Exception as error:
            record['observerCaptureError'] = str(error)
        for filename, action in [
            ('page.jpg', lambda: page.screenshot(path=str(trial / 'page.jpg'), type='jpeg', quality=65, full_page=True, timeout=5000)),
            ('diagnostics.txt', lambda: (trial / 'diagnostics.txt').write_text(page.locator('#diagnostics').inner_text(timeout=3000), encoding='utf-8')),
            ('ui-status.txt', lambda: (trial / 'ui-status.txt').write_text(page.locator('#status').inner_text(timeout=3000), encoding='utf-8')),
        ]:
            try:
                action()
            except Exception as error:
                record.setdefault('captureErrors', []).append({'file': filename, 'error': str(error)})
        # Receipts are unmodified. Actual recovery/verification is in this sidecar.
        write(trial / 'trial.json', record)
        try:
            if page.locator('#clear').is_visible() and page.locator('#clear').is_enabled():
                page.locator('#clear').click(timeout=5000)
                page.wait_for_function("document.querySelector('#cancel').disabled", timeout=5000)
        except Exception as error:
            record['cleanupError'] = str(error)
        try:
            page.close()
        except Exception as error:
            record['pageCloseError'] = str(error)
        write(trial / 'trial.json', record)
    return record


def run_file_output_probe(context, origin, out, run_id):
    """Recover the real saved bytes; report backend evidence separately from UI."""
    trial = out / 'file-output-probe'
    trial.mkdir()
    fixture = DOCS / 'vr180-studio/fixtures/stereo180-sbs.mp4'
    record = {'trialId': f'{run_id}-file-output-probe', 'build': BUILD, 'status': 'STARTED', 'startedAt': now(),
              'scope': 'Independent production-save-backend OPFS test; not application save UI or OS dialog coverage',
              'downloadRecovered': False, 'rawBytesVerified': False,
              'inputBytes': fixture.stat().st_size, 'inputSHA256': digest(fixture),
              'probeSHA256': hashlib.sha256(FILE_OUTPUT_PROBE.encode()).hexdigest(),
              'cleanupProbeSHA256': hashlib.sha256(FILE_OUTPUT_CLEANUP.encode()).hexdigest(),
              'productionModuleSHA256': {name: digest(DOCS / 'shared/vr180' / name)
                                         for name in ('file-output.mjs', 'sha256.mjs')},
              'notVerified': ['OS save dialog', 'external save destination', 'application save UI',
                              'position rewriting', 'large-file memory/performance']}
    page = context.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        shutil.copyfile(fixture, trial / 'input.mp4')
        check_recovery_budget(out, trial, record['inputBytes'])
        page.goto(origin + '/vr180-studio/', wait_until='networkidle')
        observed = page.evaluate(FILE_OUTPUT_PROBE, {'fixtureURL': origin + '/vr180-studio/fixtures/stereo180-sbs.mp4',
                                'expectedBytes': record['inputBytes'], 'expectedSHA256': record['inputSHA256']})
        write(trial / 'backend-observations.json', observed)
        record['browserUserAgent'] = observed['userAgent']
        require(observed['status'] == 'READY_FOR_DOWNLOAD', 'File-output backend failed: ' + json.dumps(observed.get('error')))
        check_recovery_budget(out, trial, observed['saved']['bytes'])
        with page.expect_download(timeout=15000) as event:
            page.evaluate("""() => {
              const state = globalThis.__vr180FileOutputProbe;
              if (!state?.url) throw Error('No saved OPFS file URL');
              const a = document.createElement('a'); a.href = state.url;
              a.download = 'saved-opfs.mp4'; a.click();
            }""")
        require(event.value.suggested_filename == 'saved-opfs.mp4', 'Unexpected backend download filename')
        output = trial / 'saved-opfs.mp4'
        event.value.save_as(str(output))
        require(event.value.failure() is None, 'Backend MP4 download failed')
        require(output.stat().st_size == record['inputBytes'], 'Recovered backend bytes differ in size')
        require(digest(output) == record['inputSHA256'], 'Recovered backend hash differs')
        require(output.read_bytes() == fixture.read_bytes(), 'Recovered backend raw bytes differ')
        record.update(status='PASS', outputFile=output.name, outputBytes=output.stat().st_size,
                      outputSHA256=digest(output), downloadRecovered=True, rawBytesVerified=True,
                      verificationMethod='Python compares complete recovered bytes and hashlib SHA-256 against fixed synthetic fixture',
                      browserDownloadRecoveredAt=now())
    except (Exception, KeyboardInterrupt) as error:
        record.update(status='FAIL', error=f'{type(error).__name__}: {error}')
        (trial / 'failure-traceback.txt').write_text(traceback.format_exc(), encoding='utf-8')
    finally:
        try:
            cleanup = page.evaluate(FILE_OUTPUT_CLEANUP)
            record['cleanup'] = cleanup
            write(trial / 'cleanup-observations.json', cleanup)
            observed = page.evaluate('globalThis.__vr180FileOutputProbe?.record ?? null')
            if observed is not None:
                write(trial / 'backend-observations.json', observed)
            require(cleanup['status'] == 'REMOVED' or record['status'] != 'PASS', 'Backend probe cleanup was not confirmed')
            require(cleanup['status'] != 'FAIL', 'Backend probe directory cleanup failed')
        except Exception as error:
            record.update(status='FAIL', cleanupError=str(error))
        record.update(pageErrors=errors, finishedAt=now())
        try:
            page.close()
        except Exception as error:
            record['pageCloseError'] = str(error)
        write(trial / 'trial.json', record)
    return record


def download_direct_file(page, key, path, receipt=False):
    """Download a real saved File or serialize an unchanged Worker receipt."""
    with page.expect_download(timeout=15000) as event:
        page.evaluate("""({key, filename, receipt}) => {
          const state = globalThis.__vr180DirectOutputProbe;
          if (receipt) {
            if (!state?.receipts[key]) throw Error('DIRECT_RECEIPT_MISSING');
            state.urls[key] ??= URL.createObjectURL(new Blob([JSON.stringify(state.receipts[key], null, 2)],
              {type: 'application/json'}));
          }
          if (!state?.urls[key]) throw Error('DIRECT_DOWNLOAD_MISSING');
          const a = document.createElement('a'); a.href = state.urls[key]; a.download = filename; a.click();
        }""", {'key': key, 'filename': path.name, 'receipt': receipt})
    require(event.value.suggested_filename == path.name, 'Unexpected direct-backend download filename')
    event.value.save_as(str(path))
    require(event.value.failure() is None, 'Direct-backend download failed')
    return json.loads(path.read_text(encoding='utf-8')) if receipt else None


def validate_direct_receipt(raw, record, fixture, observed):
    validate_receipt(raw, record, fixture, 'convert')
    saved, direct = observed['saved'], raw.get('directSave', {})
    require(raw.get('status') == 'saved' and raw.get('saveWriteCommitted') is True
            and raw.get('saveCompleted') is True, 'Direct output was not committed/saved')
    require(direct.get('status') == 'verified' and direct.get('saveWriteCommitted') is True
            and direct.get('saveCompleted') is True and direct.get('metadataHashMatched') is True
            and direct.get('wholeFileHashCompared') is False, 'Direct receipt verification contract differs')
    require(observed.get('resultIsFile') is True and saved.get('rawBytesEqual') is True
            and raw['output']['bytes'] == raw.get('savedSize') == saved['bytes'] == saved['returnedBytes']
            and raw['output']['sha256'] == raw.get('savedSha256') == saved['webCryptoSHA256']
            == saved['returnedWebCryptoSHA256'], 'Direct receipt/fresh OPFS/returned File differ')
    if record.get('requireMultipleMuxWrites'):
        writes = direct.get('capture', {}).get('muxWrites')
        require(type(writes) is int and writes > 1, 'Direct-scale output did not prove multiple mux writes')
        require(raw.get('metrics', {}).get('videoFrames') == record['expectedVideoFrames'],
                'Direct-scale output frame count differs')
        record['observedMuxWrites'] = writes


def validate_direct_cancellation(observed, cancel_after_write=False):
    cancellation = observed.get('cancellation', {})
    trigger = cancellation.get('trigger', {})
    progress = trigger.get('progress') or {}
    require(cancellation.get('status') == 'CANCELED_EMPTY_FILE_OBSERVED'
            and cancellation.get('requested') is True and cancellation.get('afterBytes') == 0
            and cancellation.get('cleanupPending') is False and cancellation.get('disposeCompleted') is True
            and cancellation.get('ack', {}).get('status') == 'ACKNOWLEDGED'
            and cancellation.get('error', {}).get('name') == 'AbortError', 'Direct cancellation was not completed')
    require(trigger.get('type') == 'progress' and progress.get('phase') == 'convert',
            'Direct cancellation did not follow conversion progress')
    if cancel_after_write:
        written = progress.get('outputBytes')
        require(type(written) is int and written > 0, 'No actual write was observed before cancellation')


def run_direct_output_probe(context, origin, out, run_id, defer_verification=False, cancel_first=False,
                            name='stereo360-tb', settings=None, scenario=None, cancel_after_write=False,
                            max_output_bytes=2 * 1024 * 1024, borrowed_page=None, navigate=True):
    scenario = scenario or ('direct-cancel-retry' if cancel_first else 'direct-output-probe')
    trial = out / scenario
    trial.mkdir()
    fixture = DOCS / 'vr180-studio/fixtures' / f'{name}.mp4'
    settings = dict(settings or {'mode': 'convert', 'layout': 'tb', 'fov': 360, 'eyeSize': 256, 'bitrate': 2000000})
    settings['confirmed'] = True
    record = {'trialId': f'{run_id}-{scenario}', 'build': BUILD, 'fixture': name,
              'mode': 'convert', 'scenario': scenario, 'startedAt': now(), 'status': 'STARTED',
              'inputSHA256': digest(fixture), 'inputBytes': fixture.stat().st_size, 'inputGeneration': 1,
              'expectedInputRevision': 2 if cancel_first else 1,
              'expectedSettings': {key: value for key, value in settings.items() if key != 'confirmed'},
              'cancelAfterWrite': cancel_after_write, 'requireMultipleMuxWrites': cancel_after_write,
              'maxOutputBytes': max_output_bytes, 'expectedVideoFrames': 360 if name == 'stereo180-4k-12s-sbs' else None,
              'mediaOperationStarted': False, 'mediaOperationCount': 0, 'downloadRecovered': False,
              'independentVerificationPassed': False,
              'scope': 'Independent production-client/Worker direct-save backend with a real OPFS handle; not application UI',
              'receiptOrigin': 'Unmodified production Worker receipt, serialized and downloaded by the harness',
              'probeSHA256': hashlib.sha256(DIRECT_OUTPUT_PROBE.encode()).hexdigest(),
              'cleanupProbeSHA256': hashlib.sha256(DIRECT_OUTPUT_CLEANUP.encode()).hexdigest(),
              'notVerified': ['OS save dialog', 'external save destination', 'application save UI',
                              '5-10GB real video/full-file recovery', 'VR playback', 'real footage quality']}
    page = borrowed_page if borrowed_page is not None else context.new_page()
    page.set_default_timeout(15000)
    errors, workers = [], []
    on_error = lambda error: errors.append(str(error))
    on_worker = lambda worker: workers.append({'url': worker.url, 'observedAt': now()})
    page.on('pageerror', on_error)
    page.on('worker', on_worker)
    observed = {}
    recovered_receipts = set()
    start = time.monotonic()
    try:
        require(not cancel_after_write or cancel_first, 'Cancel-after-write requires a cancellation attempt')
        require(settings['eyeSize'] <= 512 or defer_verification, 'Direct scale output requires deferred streaming verification')
        require(name in FIXTURES and record['inputSHA256'] == FIXTURES[name], 'Direct fixture is not fixed')
        require(record['inputBytes'] <= 2 * 1024 * 1024, 'Direct fixture exceeds this probe input limit')
        shutil.copyfile(fixture, trial / 'input.mp4')
        check_recovery_budget(out, trial, record['inputBytes'])
        if navigate:
            page.goto(origin + '/vr180-studio/', wait_until='networkidle')
        else:
            require(page.url == origin + '/vr180-studio/', 'Borrowed page origin changed')
        api = page.evaluate(API_PROBE)
        write(trial / 'browser-capabilities.json', api)
        record['browserUserAgent'] = api['userAgent']
        launch = "args => { globalThis.__vr180DirectResult = null; (" + DIRECT_OUTPUT_PROBE + ")(args).then(r => { globalThis.__vr180DirectResult = r; }, e => { globalThis.__vr180DirectResult = {status: 'FAIL', error: {name: e.name, message: e.message}}; }); }"
        page.evaluate(launch, {'fixtureURL': origin + '/vr180-studio/fixtures/' + name + '.mp4',
                              'sourceName': name, 'settings': settings, 'maxOutputBytes': max_output_bytes,
                              'expectedBytes': record['inputBytes'], 'expectedSHA256': record['inputSHA256'],
                              'cancelFirst': cancel_first, 'cancelAfterWrite': cancel_after_write})
        page.wait_for_function('globalThis.__vr180DirectResult !== null', timeout=300000 if cancel_after_write else 180000)
        observed = page.evaluate('globalThis.__vr180DirectResult')
        write(trial / 'backend-observations.json', observed)
        require(observed['status'] == 'READY_FOR_DOWNLOAD', 'Direct backend failed: ' + json.dumps(observed.get('error')))
        raw = download_direct_file(page, 'receipt', trial / 'receipt.json', receipt=True)
        recovered_receipts.add('receipt')
        validate_direct_receipt(raw, record, fixture, observed)
        record['receiptStatus'] = raw['status']
        record['codecCapabilities'] = raw.get('capabilities') or (raw.get('metrics') or {}).get('capabilities')
        if cancel_first:
            validate_direct_cancellation(observed, cancel_after_write)
            canceled = download_direct_file(page, 'canceled', trial / 'receipt-canceled.json', receipt=True)
            recovered_receipts.add('canceled')
            previous = {'inputSHA256': record['inputSHA256'], 'expectedInputRevision': 1,
                        'expectedSettings': record['expectedSettings']}
            validate_receipt(canceled, previous, fixture, 'convert')
            require(canceled.get('status') == 'canceled' and canceled.get('output') is None
                    and canceled.get('cleanup', {}).get('status') == 'complete'
                    and canceled.get('saveWriteCommitted') is False and canceled.get('saveCompleted') is False,
                    'Direct cancellation receipt is incomplete')
            require(canceled['operationId'] != raw['operationId'] and raw['inputRevision'] == canceled['inputRevision'] + 1,
                    'Direct cancellation/retry identities differ')
            trigger = observed['cancellation']['trigger']
            require((trigger['operationId'], trigger['inputRevision']) == (canceled['operationId'], canceled['inputRevision']),
                    'Cancellation progress belongs to a different operation')
            record.update(previousAttempt={'kind': 'direct-cancel', 'status': observed['cancellation']['status'],
                          'operationId': canceled['operationId'], 'inputRevision': canceled['inputRevision'],
                          'receipt': 'receipt-canceled.json', 'sameInput': True, 'sameHandle': True,
                          'triggerProgress': trigger['progress'], 'cancelAfterWrite': cancel_after_write},
                          recoveryLink=observed['recoveryLink'])
        check_recovery_budget(out, trial, raw['output']['bytes'])
        output = trial / 'direct-opfs.mp4'
        download_direct_file(page, 'output', output)
        require(output.stat().st_size == raw['output']['bytes'], 'Recovered direct file size differs')
        require(digest(output) == raw['output']['sha256'], 'Recovered direct file hash differs')
        require(any(w['url'] == origin + '/shared/vr180/worker.mjs' for w in workers), 'Production Worker not observed')
        record.update(outputFile=output.name, outputBytes=output.stat().st_size, outputSHA256=digest(output),
                      downloadRecovered=True, browserDownloadRecoveredAt=now(),
                      postCommitWholeFileComparison='Fresh OPFS File, Worker-returned File, raw receipt and complete downloaded MP4 agree')
        if defer_verification:
            record.update(status=RECOVERED, verifierDeferred='Explicit CLI request: independently verify recovered direct-output MP4 in the evidence receiver')
        else:
            independent_check(trial, fixture, output, 'convert')
            record.update(status='PASS', independentVerificationPassed=True)
    except (Exception, KeyboardInterrupt) as error:
        record.update(status='OBSERVED_NOT_CANCELED' if observed.get('status') == 'OBSERVED_NOT_CANCELED' else 'FAIL',
                      error=f'{type(error).__name__}: {error}')
        (trial / 'failure-traceback.txt').write_text(traceback.format_exc(), encoding='utf-8')
    finally:
        # Recover original success/failure/cancel records even when a later check
        # failed. The sidecar, never the receipt, states download/verification.
        try:
            keys = page.evaluate('Object.keys(globalThis.__vr180DirectOutputProbe?.receipts ?? {})')
            for key in keys:
                if key not in recovered_receipts:
                    require(key in ('receipt', 'canceled', 'failure'), 'Unexpected direct receipt key')
                    filename = 'receipt.json' if key == 'receipt' else f'receipt-{key}.json'
                    download_direct_file(page, key, trial / filename, receipt=True)
                    recovered_receipts.add(key)
        except Exception as error:
            record['receiptRecoveryError'] = str(error)
            record['status'] = 'FAIL'
        try:
            cleanup = page.evaluate(DIRECT_OUTPUT_CLEANUP)
            record['cleanup'] = cleanup
            write(trial / 'cleanup-observations.json', cleanup)
            observed = page.evaluate('globalThis.__vr180DirectOutputProbe?.record ?? null') or observed
            write(trial / 'backend-observations.json', observed)
            require(cleanup['status'] != 'FAIL', 'Direct backend cleanup failed')
            require(cleanup['status'] == 'REMOVED' or record['status'] not in ('PASS', RECOVERED), 'Direct cleanup not confirmed')
        except Exception as error:
            record.update(status='FAIL', cleanupError=str(error))
        record.update(mediaOperationCount=observed.get('mediaOperationCount', 0),
                      mediaOperationStarted=observed.get('mediaOperationCount', 0) > 0,
                      recoveredReceipts=sorted(recovered_receipts), pageErrors=errors, workers=workers,
                      wallSeconds=time.monotonic() - start, finishedAt=now())
        try:
            page.remove_listener('pageerror', on_error)
            page.remove_listener('worker', on_worker)
            if borrowed_page is None:
                page.close()
        except Exception as error:
            record['pageCloseError'] = str(error)
        write(trial / 'trial.json', record)
    return record


def run_range_probe(context, origin, out, run_id):
    """Observe native-Blob structure; never download/hash an entire large Blob."""
    trial = out / 'range-probe'
    trial.mkdir()
    report = {'trialId': f'{run_id}-range-probe', 'build': BUILD, 'requested': True,
              'status': 'STARTED', 'startedAt': now(), 'cases': [],
              'scope': 'Separate structural parser test; not a large real video or full-file recovery',
              'probeSHA256': hashlib.sha256(RANGE_PROBE.encode()).hexdigest(),
              'parserModuleSHA256': digest(DOCS / 'shared/vr180/mp4.mjs'),
              'largeFilesDownloaded': False, 'wholeLargeFileHashesComputed': False}
    for kind in ('large-stsz', 'large-offset'):
        observed = {'kind': kind, 'status': 'STARTED'}
        page = None
        try:
            page = context.new_page()
            page.set_default_timeout(15000)
            page.goto(origin + '/vr180-studio/', wait_until='networkidle')
            # Run in the page with a bounded wait. A resource/crash failure is a
            # separate BLOCKED structural case, never a failed/accepted UI output.
            launch = "args => { globalThis.__vr180RangeResult = null; (" + RANGE_PROBE + ")(args).then(r => { globalThis.__vr180RangeResult = r; }, e => { globalThis.__vr180RangeResult = {kind: args.kind, status: 'FAIL', error: {name: e.name, message: e.message}}; }); }"
            page.evaluate(launch, {'kind': kind, 'fixtureURL': origin + '/vr180-studio/fixtures/stereo180-sbs.mp4',
                                  'expectedSHA256': FIXTURES['stereo180-sbs']})
            page.wait_for_function('globalThis.__vr180RangeResult !== null', timeout=135000)
            observed = page.evaluate('globalThis.__vr180RangeResult')
        except (Exception, KeyboardInterrupt) as error:
            observed.update(status='BLOCKED', error={'name': type(error).__name__, 'message': str(error)},
                            limitation='Browser execution/resource availability was not established for this structural case')
        finally:
            if page is not None:
                try:
                    page.close()
                except Exception as error:
                    observed['pageCloseError'] = str(error)
            write(trial / f'{kind}.json', observed)
            report['cases'].append(observed)
        if observed['status'] != 'PASS':
            break
    report.update(status='PASS' if len(report['cases']) == 2 and all(c['status'] == 'PASS' for c in report['cases'])
                  else report['cases'][-1]['status'], finishedAt=now())
    write(trial / 'trial.json', report)
    return report


def emit_evidence(out, result):
    """Emit all evidence or an explicit bounded transport failure, never truncation."""
    files = []
    for path in sorted(out.rglob('*')):
        if path.is_file() and path.name != 'manifest.json':
            require(not path.is_symlink(), 'Evidence must not contain symlinks')
            files.append({'name': path.relative_to(out).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest(path)})
    manifest = {'schema': 'vr180-evidence-manifest-v1', 'runId': result['runId'],
                'manifestExcludesItself': True, 'files': files}
    write(out / 'manifest.json', manifest)
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as archive:
            for name in [f['name'] for f in files] + ['manifest.json']:
                path = out / name
                info = archive.gettarinfo(str(path), arcname=name)
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                info.mtime = 0
                with path.open('rb') as stream:
                    archive.addfile(info, stream)
    payload = buffer.getvalue()
    encoded = base64.b64encode(payload).decode('ascii')
    chunks = [encoded[i:i + CHUNK_CHARS] for i in range(0, len(encoded), CHUNK_CHARS)]
    header = {'schema': 'vr180-log-transport-v1', 'runId': result['runId'], 'status': result['status'],
              'archiveFormat': 'tar+gzip', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(),
              'base64Bytes': len(encoded), 'chunkChars': CHUNK_CHARS, 'chunks': len(chunks),
              'manifestSHA256': digest(out / 'manifest.json'), 'complete': True}
    lines = ['VR180_EVIDENCE_MANIFEST ' + json.dumps(manifest, separators=(',', ':')),
             'VR180_EVIDENCE_BEGIN ' + json.dumps(header, separators=(',', ':'))]
    lines += [f'VR180_EVIDENCE_CHUNK {i:06d}/{len(chunks):06d} {chunk}' for i, chunk in enumerate(chunks, 1)]
    lines += ['VR180_EVIDENCE_END ' + json.dumps({'runId': result['runId'], 'sha256': header['sha256'], 'chunks': len(chunks)})]
    wire_bytes = sum(len(line.encode('utf-8')) + 1 for line in lines)
    raw_bytes = sum(f['bytes'] for f in files) + (out / 'manifest.json').stat().st_size
    if raw_bytes > LIMIT or wire_bytes > LIMIT - 4096:
        failure = {'status': 'FAIL', 'complete': False, 'reason': 'EVIDENCE_LIMIT_EXCEEDED',
                   'limitBytes': LIMIT, 'rawFileBytes': raw_bytes, 'wouldEmitBytes': wire_bytes,
                   'archiveBytes': len(payload), 'archiveSHA256': header['sha256'],
                   'manifestSHA256': header['manifestSHA256'], 'runId': result['runId'],
                   'note': 'No payload emitted; MP4/receipt recovery cannot be claimed from this run.'}
        result.update(status='FAIL', evidenceTransport=failure)
        write(out / 'run.json', result)
        print('VR180_EVIDENCE_ERROR ' + json.dumps(failure), flush=True)
        return False
    for line in lines:
        print(line, flush=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New evidence directory outside the checkout')
    parser.add_argument('--suite', choices=['small', 'followup', 'scale12', 'recovery', 'direct-scale12'], default='small',
                        help='Followup requires independent verification of the small suite on the same product sources before this separate run')
    parser.add_argument('--defer-independent-verification', action='store_true',
                        help='Recover outputs; report verification pending until independent verifiers run in the receiving environment')
    parser.add_argument('--candidate', action='store_true',
                        help='Explicit scoped candidate branch; no public Pages equivalence or deployment is claimed')
    parser.add_argument('--file-output-probe', action='store_true',
                        help='After both small UI outputs are recovered, separately exercise production file saving with real OPFS handles')
    parser.add_argument('--range-probe', action='store_true',
                        help='After both small UI outputs are recovered, separately inspect/tag native-Blob structural boundary fixtures; no full large-file download')
    parser.add_argument('--direct-output-probe', action='store_true',
                        help='After both small UI outputs are recovered, separately test Worker direct OPFS conversion and cancellation/retry; recover MP4 and original receipts')
    args = parser.parse_args()
    out = args.output.resolve()
    require(not out.is_relative_to(ROOT), 'Evidence must be outside the checkout')
    out.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'vr180-cloud-validation-v1', 'suite': args.suite, 'status': 'BLOCKED', 'startedAt': now(),
              'runId': f"{os.environ.get('GITHUB_RUN_ID', 'missing')}-{os.environ.get('GITHUB_RUN_ATTEMPT', 'missing')}",
              'github': {key: os.environ.get(key) for key in ('GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')},
              'browserSandboxRequired': True, 'browserTrials': [], 'pagesByteCheck': 'NOT_RUN',
              'sourceScope': 'unpublished-candidate' if args.candidate else 'production-main',
              'fileOutputProbe': {'requested': args.file_output_probe, 'status': 'NOT_RUN'},
              'rangeProbe': {'requested': args.range_probe, 'status': 'NOT_RUN'},
              'directOutputProbe': {'requested': args.direct_output_probe or args.suite == 'direct-scale12',
                                    'status': 'NOT_RUN', 'cases': []},
              'independentVerificationDeferred': args.defer_independent_verification, 'independentVerificationPassed': False,
              'notVerified': ['VR player/headset compatibility', 'real footage quality', 'novice usability',
                              'speed improvement', 'cancel/retry behavior', '4K scale', 'product completion',
                              'OS save dialog', 'external save destination', 'application save UI',
                              '5-10GB real video processing and full-file recovery']}
    server = browser = context = None
    started = time.monotonic()
    def deadline(_signum, _frame):
        raise Deadline('Cloud validation deadline/interruption reached; remaining trials stopped')
    signal.signal(signal.SIGALRM, deadline)
    signal.signal(signal.SIGTERM, deadline)
    signal.alarm(660)
    try:
        if os.environ.get('GITHUB_REPOSITORY') != 'Kushyameln01/kushyameln-works':
            raise Blocked('This harness is scoped to Kushyameln01/kushyameln-works')
        if (args.file_output_probe or args.range_probe or args.direct_output_probe) and args.suite != 'small':
            raise Blocked('Backend/range probes require this run to complete both small UI trials first')
        if args.suite in ('followup', 'scale12', 'recovery', 'direct-scale12'):
            require(args.defer_independent_verification, 'Followup requires explicit deferred independent verification; the fixed small pixel oracle is bounded to 512px/eye and 120 frames')
            prerequisite_path = ROOT / 'development/vr180/evidence/2026-10-17-b5-small.json'
            if not prerequisite_path.is_file():
                raise Blocked('This b5 build requires independently verified b5-small evidence; earlier build results are not reusable')
            prerequisite = json.loads(prerequisite_path.read_text())
            require(prerequisite['status'] == 'PASS' and prerequisite['build'] == BUILD, 'Small-suite regression has not passed for this build')
            require(set(PUBLIC_PATHS).issubset(prerequisite['sourceFiles']), 'Incomplete small-suite source provenance')
            for path, expected in prerequisite['sourceFiles'].items():
                require(digest(DOCS / path) == expected, f'Product source changed after small-suite verification: {path}')
            result['smallSuitePrerequisite'] = {'runId': prerequisite['runId'], 'checkoutCommit': prerequisite['checkoutCommit'],
                'basis': 'Recovered small outputs independently verified PASS; all recorded product-module hashes match this checkout'}
            result['workerPostObserver'] = {'enabled': args.suite in ('followup', 'recovery'), 'sha256': hashlib.sha256(WORKER_POST_OBSERVER.encode()).hexdigest(),
                                           'scope': 'Forwards original Worker.postMessage this/args/return/exception; observes only IDs/settings/file metadata'}
        source = source_check(out, candidate=args.candidate)
        result['checkoutCommit'] = source['checkoutCommit']
        if args.candidate:
            result['pagesByteCheck'] = 'NOT_APPLICABLE_UNPUBLISHED_CANDIDATE'
            write(out / 'pages-byte-check.json', {'status': result['pagesByteCheck'],
                'checkoutCommit': source['checkoutCommit'], 'note': 'Candidate is served only inside the cloud runner; public delivery is not tested.'})
        else:
            wait_for_pages(out, source['checkoutCommit'])
            result['pagesByteCheck'] = 'PASS'
        preflight(out, args.defer_independent_verification)
        from playwright.sync_api import sync_playwright
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(DOCS)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
        result['cloudCopyOrigin'] = origin
        with urllib.request.urlopen(origin + '/vr180-studio/app.mjs', timeout=5) as response:
            require(hashlib.sha256(response.read()).hexdigest() == digest(DOCS / 'vr180-studio/app.mjs'), 'Loopback source differs')
        with sync_playwright() as p:
            # Mandatory sandbox, preinstalled Chrome only. No launch-flag fallback.
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, chromium_sandbox=True, timeout=30000)
            result['browserVersion'] = browser.version
            context = browser.new_context(accept_downloads=True)
            if args.suite in ('followup', 'recovery'):
                context.add_init_script(WORKER_POST_OBSERVER)
            blocked_requests = []
            def local_only(route):
                url = route.request.url
                if url.startswith(origin + '/'):
                    route.continue_()
                else:
                    blocked_requests.append(url)
                    route.abort()
            context.route('**/*', local_only)
            try:
                completed_status = RECOVERED if args.defer_independent_verification else 'PASS'
                cases = [('stereo180-sbs', 'copy', None, 256), ('stereo360-tb', 'convert', None, 256)] if args.suite == 'small' else [
                    ('stereo180-sbs', 'copy', 'cancel-retry', 256),
                    ('stereo360-tb', 'convert', 'failure-retry', 256),
                    ('stereo180-4k-2s-sbs', 'convert', None, 2048),
                    ('stereo180-4k-12s-sbs', 'convert', None, 2048)]
                if args.suite == 'scale12':
                    cases = [('stereo180-4k-12s-sbs', 'convert', None, 2048)]
                if args.suite == 'recovery':
                    cases = cases[:2]
                if args.suite == 'direct-scale12':
                    cases = [('stereo180-4k-12s-sbs', 'convert', 'direct-scale12', 2048)]
                for name, mode, scenario, eye_size in cases:
                    if args.suite == 'direct-scale12':
                        trial = run_direct_output_probe(context, origin, out, result['runId'],
                            defer_verification=args.defer_independent_verification, cancel_first=True,
                            name=name, scenario=scenario, cancel_after_write=True, max_output_bytes=6 * 1024 * 1024,
                            settings={'mode': 'convert', 'layout': 'sbs', 'fov': 180, 'eyeSize': 2048, 'bitrate': 25165824})
                        result['directOutputProbe'].update(status=trial['status'], cases=[{'scenario': scenario, 'status': trial['status']}])
                    else:
                        trial = run_trial(context, origin, out, name, mode, result['runId'], args.defer_independent_verification, scenario, eye_size)
                    result['browserTrials'].append(trial)
                    if trial['status'] != completed_status:
                        break
                result['status'] = completed_status if len(result['browserTrials']) == len(cases) and all(t['status'] == completed_status for t in result['browserTrials']) else result['browserTrials'][-1]['status']
                result['mediaTrialsStatus'] = result['status']
                if args.file_output_probe:
                    if result['status'] == completed_status and len(result['browserTrials']) == 2 and all(t['downloadRecovered'] for t in result['browserTrials']):
                        result['fileOutputProbe'] = run_file_output_probe(context, origin, out, result['runId'])
                        if result['fileOutputProbe']['status'] != 'PASS':
                            result['status'] = 'FAIL'
                    else:
                        result['fileOutputProbe']['reason'] = 'Both same-run small UI trials did not complete output/receipt recovery and hash checks'
                if args.range_probe:
                    if result['status'] == completed_status and len(result['browserTrials']) == 2 and all(t['downloadRecovered'] for t in result['browserTrials']):
                        result['rangeProbe'] = run_range_probe(context, origin, out, result['runId'])
                        if result['rangeProbe']['status'] != 'PASS':
                            result['status'] = result['rangeProbe']['status']
                    else:
                        result['rangeProbe']['reason'] = 'Required same-run small recovery or preceding requested probe did not complete'
                if args.direct_output_probe:
                    if result['status'] == completed_status and len(result['browserTrials']) == 2 and all(t['downloadRecovered'] for t in result['browserTrials']):
                        for cancel_first in (False, True):
                            trial = run_direct_output_probe(context, origin, out, result['runId'],
                                                            args.defer_independent_verification, cancel_first)
                            result['browserTrials'].append(trial)
                            result['directOutputProbe']['cases'].append({'scenario': trial['scenario'], 'status': trial['status']})
                            if trial['status'] != completed_status:
                                result['status'] = trial['status']
                                break
                        result['directOutputProbe']['status'] = result['status']
                    else:
                        result['directOutputProbe']['reason'] = 'Required same-run small recovery or preceding requested probe did not complete'
                result['independentVerificationPassed'] = result['status'] == 'PASS'
                result['blockedBrowserRequests'] = blocked_requests
            finally:
                context.close()
                context = None
                browser.close()
                browser = None
    except (Exception, KeyboardInterrupt) as error:
        result['error'] = f'{type(error).__name__}: {error}'
        result['status'] = 'FAIL' if result['browserTrials'] else 'BLOCKED'
        if (out / 'pages-byte-check.json').exists():
            result['pagesByteCheck'] = json.loads((out / 'pages-byte-check.json').read_text(encoding='utf-8'))['status']
        (out / 'failure-traceback.txt').write_text(traceback.format_exc(), encoding='utf-8')
    finally:
        signal.alarm(0)
        if server:
            server.shutdown()
            server.server_close()
        result.update(finishedAt=now(), wallSeconds=time.monotonic() - started,
                      executedMediaTrials=sum(t.get('mediaOperationCount', int(t['mediaOperationStarted'])) for t in result['browserTrials']))
        write(out / 'run.json', result)
        try:
            complete = emit_evidence(out, result)
        except Exception as error:
            result['status'] = 'FAIL'
            complete = False
            print('VR180_EVIDENCE_ERROR ' + json.dumps({'complete': False, 'runId': result['runId'], 'error': str(error)}), flush=True)
        print('VR180_RUN_SUMMARY ' + json.dumps({'status': result['status'], 'runId': result['runId'],
              'pagesByteCheck': result['pagesByteCheck'], 'executedMediaTrials': result['executedMediaTrials'],
              'completeEvidenceEmitted': complete, 'error': result.get('error')}), flush=True)
    return 0 if result['status'] in ('PASS', RECOVERED) and complete else 1


if __name__ == '__main__':
    raise SystemExit(main())
