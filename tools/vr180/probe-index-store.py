#!/usr/bin/env python3
"""Small, non-public IndexStore probe in sandboxed cloud Chrome.

Only this harness and the exact candidate prototype are served on loopback.
The browser uses native OPFS, SyncAccessHandle and Web Locks in two dedicated
Workers. A flushed snapshot is fully downloaded and independently checked by
Python. This does not exercise a muxer, large media, public Pages, or an OS
picker. Missing capabilities/snapshot access are BLOCKED, never substituted.
"""
from __future__ import annotations

import argparse
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import signal
import struct
import threading
import time
import traceback
import urllib.request

spec = importlib.util.spec_from_file_location('cloud', Path(__file__).with_name('cloud-validate.py'))
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)

COUNT = 10000
WIDTH = 24
PATCHES = (0, 2730, 5461, 8192, COUNT - 1)
MODULE = 'development/vr180/index-prototype/index-store.mjs'
HTML = b'<!doctype html><meta charset="utf-8"><title>Private IndexStore probe</title><p>Candidate prototype validation</p>'

WORKER = r"""import {createIndexStore, createIndexBudget, INDEX_PAGE_BYTES} from '/index-store.mjs';
const schema = {version: 1, recordBytes: 24, endianness: 'little'};
const count = 10000, patches = new Set([0, 2730, 5461, 8192, 9999]);
const require = (ok, message) => { if (!ok) throw Error(message); };
const describe = e => ({name: e.name, message: String(e.message).slice(0, 1000), status: e.status ?? null});
let store, budget, root, args;
function record(index, patched) {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(index) * 1000003n + 17n + (patched ? 4294967296n : 0n), true);
  view.setBigInt64(8, BigInt(index) * 1001n - 9000n - (patched ? 333n : 0n), true);
  view.setUint32(16, 1000 + index % 7 + (patched ? 11 : 0), true);
  view.setUint32(20, (index % 2) + (patched ? 2147483648 : 0), true);
  return bytes;
}
function checkRecord(bytes, index) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), patched = patches.has(index);
  require(v.getBigUint64(0, true) === BigInt(index) * 1000003n + 17n + (patched ? 4294967296n : 0n), 'OFFSET_FIELD_' + index);
  require(v.getBigInt64(8, true) === BigInt(index) * 1001n - 9000n - (patched ? 333n : 0n), 'PTS_FIELD_' + index);
  require(v.getUint32(16, true) === 1000 + index % 7 + (patched ? 11 : 0), 'DURATION_FIELD_' + index);
  require(v.getUint32(20, true) === (index % 2) + (patched ? 2147483648 : 0), 'FLAGS_FIELD_' + index);
}
async function absent(directory, name) {
  try { await directory.getDirectoryHandle(name); return false; }
  catch (error) { if (error.name === 'NotFoundError') return true; throw error; }
}
async function lockHeld() {
  const state = await navigator.locks.query();
  return state.held.filter(x => x.name === 'vr180:index-store:job:' + args.jobId).length;
}
async function owner(message) {
  args = message;
  const capabilities = {secureContext: isSecureContext, dedicatedWorker: typeof document === 'undefined',
    opfs: typeof navigator.storage?.getDirectory === 'function', locks: typeof navigator.locks?.request === 'function' && typeof navigator.locks?.query === 'function'};
  require(capabilities.secureContext && capabilities.opfs && capabilities.locks, 'INDEX_NATIVE_CAPABILITY_UNAVAILABLE');
  const originRoot = await navigator.storage.getDirectory();
  require(await absent(originRoot, args.namespace), 'HARNESS_NAMESPACE_ALREADY_EXISTS');
  root = await originRoot.getDirectoryHandle(args.namespace, {create: true});
  budget = createIndexBudget();
  store = await createIndexStore({root, jobId: args.jobId, schema, budget});
  for (let index = 0; index < count; index++) require(await store.appendRecord(record(index, false)) === index, 'APPEND_INDEX');
  for (const index of patches) await store.patchRecord(index, record(index, true));
  let visited = 0;
  await store.iterate((bytes, index) => { require(index === visited++, 'ITERATION_ORDER'); checkRecord(bytes, index); });
  require(visited === count, 'ITERATION_COUNT');
  const page = new Uint8Array(INDEX_PAGE_BYTES);
  const pageBytes = await store.readPage(1, page);
  require(pageBytes === INDEX_PAGE_BYTES, 'FULL_PAGE_SIZE');
  // Independent byte expectations also cover partial records at page edges.
  let expectedRecord, expectedIndex = -1;
  for (let at = 0; at < pageBytes; at++) {
    const position = INDEX_PAGE_BYTES + at, index = Math.floor(position / 24);
    if (index !== expectedIndex) { expectedIndex = index; expectedRecord = record(index, patches.has(index)); }
    require(page[at] === expectedRecord[position % 24], 'PAGE_BYTE_' + position);
  }
  const sealed = await store.seal({expectedCount: count});
  require(sealed.extent === count * 24, 'SEALED_EXTENT');
  let rejected = false;
  try { await store.appendRecord(record(count, false)); }
  catch (error) { rejected = error.message === 'INDEX_SEALED'; }
  require(rejected, 'SEALED_MUTATION_NOT_REJECTED');
  await store.flush();
  const snapshot = {status: 'NOT VERIFIED', method: 'FileSystemFileHandle.getFile after native SyncAccessHandle.flush; writer still owned', bytes: null};
  let buffer = null;
  try {
    const directory = await root.getDirectoryHandle(args.jobId);
    const file = await (await directory.getFileHandle('records.bin')).getFile();
    buffer = await file.arrayBuffer(); // Bounded 240,000 B, before dispose/deletion.
    require(file.size === count * 24 && buffer.byteLength === file.size, 'SNAPSHOT_SIZE');
    snapshot.status = 'AVAILABLE'; snapshot.bytes = file.size;
  } catch (error) { snapshot.error = describe(error); buffer = null; }
  const metrics = store.metrics;
  require(metrics.readCalls > 0 && metrics.writeCalls > 0 && metrics.flushes >= 2, 'NATIVE_IO_NOT_OBSERVED');
  require(await lockHeld() === 1, 'OWNER_LEASE_NOT_HELD');
  self.postMessage({type: 'ready', capabilities, schema, count, patches: [...patches], sealed,
    snapshot, metrics, pageBytes, visited, buffer}, buffer ? [buffer] : []);
}
async function contender(message) {
  const originRoot = await navigator.storage.getDirectory();
  const directory = await originRoot.getDirectoryHandle(message.namespace), localBudget = createIndexBudget();
  let extra = null, rejection = null;
  try { extra = await createIndexStore({root: directory, jobId: message.jobId, schema, budget: localBudget}); }
  catch (error) { rejection = describe(error); }
  if (extra) await extra.dispose();
  const survivor = !(await absent(directory, message.jobId));
  require(rejection?.status === 'BLOCKED' && rejection.message.startsWith('INDEX_JOB_LOCK_BUSY'), 'COMPETING_OWNER_NOT_REJECTED');
  require(survivor && localBudget.usedBytes === 0, 'LOSER_DISTURBED_OWNER');
  self.postMessage({type: 'contender', status: 'EXPECTED_LOCK_CONTENTION', rejection,
    ownerDirectoryStillPresent: survivor, reservedBytes: localBudget.usedBytes});
}
async function finish() {
  require(store && await lockHeld() === 1, 'OWNER_LOST_LEASE');
  let verifiedAfterContention = 0;
  await store.iterate((bytes, index) => { checkRecord(bytes, index); verifiedAfterContention++; });
  require(verifiedAfterContention === count, 'OWNER_CONTENT_CHANGED');
  const cancel = new AbortController();
  let visitedBeforeCancel = 0, canceled = false;
  try { await store.iterate(() => { if (++visitedBeforeCancel === 257) cancel.abort(); }, {signal: cancel.signal}); }
  catch (error) { canceled = error.name === 'AbortError'; }
  require(canceled && visitedBeforeCancel === 257, 'ITERATION_CANCEL_NOT_OBSERVED');
  const beforeDispose = store.metrics;
  require(beforeDispose.state === 'failed', 'CANCELED_STORE_NOT_FAILED');
  await store.abort();
  const disposed = store.metrics;
  require(disposed.state === 'disposed' && disposed.internalBufferBytes === 0 && budget.usedBytes === 0, 'STORE_RESOURCES_RETAINED');
  require(await absent(root, args.jobId) && await lockHeld() === 0, 'DISPOSE_DID_NOT_REMOVE_OWN_JOB_OR_LEASE');
  // Reacquisition also verifies that an old SyncAccessHandle/lease is not held.
  const retry = await createIndexStore({root, jobId: args.jobId, schema, budget});
  await retry.appendRecord(record(0, true)); await retry.flush(); await retry.dispose();
  require(await absent(root, args.jobId) && await lockHeld() === 0 && budget.usedBytes === 0, 'REUSE_CLEANUP_FAILED');
  self.postMessage({type: 'finished', verifiedAfterContention, cancellation: {observed: canceled, visitedBeforeCancel},
    beforeDispose, disposed, reused: true, reuseDisposed: retry.metrics, jobAbsent: true, leaseReleased: true,
    nativeCloseEvidence: 'dispose returned, job deletion succeeded, and the same job/lease was acquired and disposed again',
    wholeBrowserMemoryVerified: false});
}
self.onmessage = ({data}) => {
  const run = data.role === 'owner' ? owner(data) : data.role === 'contender' ? contender(data) : data.role === 'finish' ? finish() : Promise.reject(Error('UNKNOWN_PROBE_COMMAND'));
  run.catch(error => self.postMessage({type: 'error', error: describe(error), metrics: store?.metrics ?? null}));
};
"""

PAGE_PROBE = r"""async () => {
  const state = globalThis.__indexStoreProbe = {workers: [], url: null, namespace: 'vr180-index-probe-' + crypto.randomUUID(),
    jobId: 'records-' + crypto.randomUUID(), record: {status: 'STARTED', browserUserAgent: navigator.userAgent}};
  const require = (ok, message) => { if (!ok) throw Error(message); };
  function call(worker, command, expected) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => done(Error('PROBE_WORKER_TIMEOUT')), 120000);
      const done = (error, value) => { clearTimeout(timeout); worker.removeEventListener('message', message); worker.removeEventListener('error', failed); error ? reject(error) : resolve(value); };
      const message = event => event.data.type === 'error' ? done(Object.assign(Error(event.data.error.message), {observation: event.data}))
        : event.data.type === expected ? done(null, event.data) : done(Error('UNEXPECTED_WORKER_RESPONSE'));
      const failed = event => done(Error(event.message || 'WORKER_ERROR'));
      worker.addEventListener('message', message); worker.addEventListener('error', failed); worker.postMessage(command);
    });
  }
  try {
    const owner = new Worker('/probe-worker.mjs', {type: 'module'}); state.workers.push(owner);
    const ready = await call(owner, {role: 'owner', namespace: state.namespace, jobId: state.jobId}, 'ready');
    const buffer = ready.buffer; delete ready.buffer; state.record.owner = ready;
    if (buffer) {
      require(buffer.byteLength === 240000, 'BROWSER_SNAPSHOT_LENGTH');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), x => x.toString(16).padStart(2, '0')).join('');
      state.record.snapshot = {bytes: buffer.byteLength, sha256: hash, recovered: false};
      state.url = URL.createObjectURL(new Blob([buffer], {type: 'application/octet-stream'}));
    }
    const other = new Worker('/probe-worker.mjs', {type: 'module'}); state.workers.push(other);
    state.record.contention = await call(other, {role: 'contender', namespace: state.namespace, jobId: state.jobId}, 'contender');
    other.terminate();
    state.record.finish = await call(owner, {role: 'finish'}, 'finished'); owner.terminate();
    state.record.status = ready.snapshot.status === 'AVAILABLE' ? 'READY_FOR_DOWNLOAD' : 'BLOCKED';
    if (state.record.status === 'BLOCKED') state.record.reason = 'Flush/getFile snapshot capability NOT VERIFIED';
  } catch (error) {
    const nativeError = error.observation?.error;
    state.record.status = nativeError?.status === 'BLOCKED' || ['NotAllowedError', 'SecurityError', 'NotSupportedError'].includes(nativeError?.name)
      || /UNAVAILABLE|not supported|not allowed|NotAllowed/i.test(error.message) ? 'BLOCKED' : 'FAIL';
    state.record.error = {name: error.name, message: error.message, observation: error.observation ?? null};
  }
  return state.record;
}"""

PAGE_CLEANUP = r"""async () => {
  const state = globalThis.__indexStoreProbe;
  if (!state) return {status: 'NOT_CREATED'};
  for (const worker of state.workers) worker.terminate();
  if (state.url) { URL.revokeObjectURL(state.url); state.url = null; }
  if (typeof navigator.locks?.request !== 'function' || typeof navigator.storage?.getDirectory !== 'function') return {status: 'NOT VERIFIED'};
  return navigator.locks.request('vr180:index-store:job:' + state.jobId, {mode: 'exclusive', ifAvailable: true}, async lock => {
    if (!lock) return {status: 'NOT VERIFIED', reason: 'Owner lease still held; no deletion attempted'};
    const root = await navigator.storage.getDirectory();
    try { await root.getDirectoryHandle(state.namespace); }
    catch (error) { if (error.name === 'NotFoundError') return {status: 'NOT_CREATED'}; throw error; }
    await root.removeEntry(state.namespace, {recursive: true});
    try { await root.getDirectoryHandle(state.namespace); throw Error('HARNESS_DIRECTORY_REMAINS'); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
    return {status: 'REMOVED', absenceObserved: true, scope: 'only this randomly named harness namespace'};
  });
}"""


def verify_records(path, expected_hash):
    """Independent struct/formula oracle; no JavaScript implementation imported."""
    cloud.require(path.stat().st_size == COUNT * WIDTH, 'Recovered index size differs')
    cloud.require(cloud.digest(path) == expected_hash, 'Recovered index hash differs from browser snapshot')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for index in range(COUNT):
            raw = stream.read(WIDTH)
            cloud.require(len(raw) == WIDTH, 'Incomplete recovered record')
            patched = index in PATCHES
            expected = (index * 1000003 + 17 + (2**32 if patched else 0),
                        index * 1001 - 9000 - (333 if patched else 0),
                        1000 + index % 7 + (11 if patched else 0),
                        index % 2 + (2**31 if patched else 0))
            cloud.require(struct.unpack('<QqII', raw) == expected, f'Recovered record {index} differs')
            digest.update(raw)
        cloud.require(stream.read(1) == b'', 'Trailing recovered bytes')
    return {'status': 'PASS', 'records': COUNT, 'recordBytes': WIDTH, 'bytes': COUNT * WIDTH,
            'sha256': digest.hexdigest(), 'patchIndices': list(PATCHES), 'allRecordsVerified': True,
            'method': 'Python little-endian struct unpack plus independent integer formulas; complete sequential file read'}


def start_server(module_bytes):
    content = {'/': (HTML, 'text/html; charset=utf-8'),
               '/probe-worker.mjs': (WORKER.encode(), 'text/javascript; charset=utf-8'),
               '/index-store.mjs': (module_bytes, 'text/javascript; charset=utf-8')}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            item = content.get(self.path)
            if item is None:
                self.send_error(404)
                return
            body, mime = item
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    out = args.output.resolve()
    cloud.require(not out.exists() and not out.is_relative_to(cloud.ROOT), 'Use a new output directory outside checkout')
    out.mkdir(parents=True)
    report = {'schema': 'vr180-index-store-cloud-probe-v1',
              'runId': os.environ.get('GITHUB_RUN_ID', 'unknown') + '-index-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
              'status': 'BLOCKED', 'prototypeOnly': True, 'productIntegrationTested': False,
              'scope': 'Native dedicated-Worker OPFS/SyncAccessHandle/Web Locks, 10000 fixed-width records (240000 bytes)',
              'notVerified': ['mux/demux fork', 'sample-proportional retention removal', '5/10 GB media',
                              'whole-browser/native memory', 'OS picker', 'public deployment', 'abnormal disk/quota I/O'],
              'mediaOperationCount': 0, 'inputIsPublicSynthetic': True, 'fullSnapshotRecovered': False,
              'pageErrors': [], 'workers': [], 'cleanup': {'status': 'NOT_RUN'}}
    server = None
    started = time.monotonic()

    def deadline(*_args):
        raise cloud.Deadline('IndexStore probe deadline reached')

    signal.signal(signal.SIGALRM, deadline)
    signal.signal(signal.SIGTERM, deadline)
    signal.alarm(300)
    try:
        cloud.require(os.environ.get('GITHUB_REPOSITORY') == 'Kushyameln01/kushyameln-works', 'Repository differs')
        source = cloud.source_check(out, candidate=True)
        report['checkoutCommit'] = source['checkoutCommit']
        cloud.preflight(out, defer_verification=True)
        # Require committed inputs, not an untracked local substitute.
        cloud.command(['git', 'ls-files', '--error-unmatch', MODULE, str(Path(__file__).resolve().relative_to(cloud.ROOT))])
        module_path = cloud.ROOT / MODULE
        cloud.require(not module_path.is_symlink(), 'Prototype source must not be a symlink')
        module_bytes = module_path.read_bytes()
        report['prototypeSource'] = {'path': MODULE, 'sha256': hashlib.sha256(module_bytes).hexdigest(), 'bytes': len(module_bytes)}
        report['harnessSHA256'] = cloud.digest(Path(__file__))
        report['sharedHarnessSHA256'] = cloud.digest(Path(cloud.__file__))
        server, content = start_server(module_bytes)
        origin = f'http://127.0.0.1:{server.server_port}'
        inventory = []
        for route, (expected, _mime) in content.items():
            with urllib.request.urlopen(origin + route, timeout=5) as response:
                served = response.read(len(expected) + 1)
            cloud.require(served == expected, 'Loopback source mismatch')
            inventory.append({'route': route, 'bytes': len(served), 'sha256': hashlib.sha256(served).hexdigest()})
        report['origin'] = origin
        cloud.write(out / 'private-source-inventory.json', {'checkoutCommit': source['checkoutCommit'], 'files': inventory,
                                                         'scope': 'Only these three exact routes; no repository directory serving'})
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=str(cloud.CHROME), headless=True,
                                        chromium_sandbox=True, timeout=30000)
            report['browserVersion'] = browser.version
            try:
                context = browser.new_context(accept_downloads=True)
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
                page = context.new_page()
                page.set_default_timeout(15000)
                page.on('pageerror', lambda error: report['pageErrors'].append(str(error)[:1000]))
                page.on('worker', lambda worker: report['workers'].append(worker.url))
                try:
                    page.goto(origin + '/', wait_until='networkidle')
                    page.evaluate('() => { globalThis.__indexProbeResult = null; (' + PAGE_PROBE + ')().then(r => { globalThis.__indexProbeResult = r; }, e => { globalThis.__indexProbeResult = {status:"FAIL", error:String(e)}; }); }')
                    page.wait_for_function('globalThis.__indexProbeResult !== null', timeout=240000)
                    observed = page.evaluate('globalThis.__indexProbeResult')
                    cloud.write(out / 'browser-observations.json', observed)
                    report['browserStatus'] = observed['status']
                    if observed['status'] == 'BLOCKED':
                        raise cloud.Blocked(observed.get('reason') or str(observed.get('error')))
                    cloud.require(observed['status'] == 'READY_FOR_DOWNLOAD', 'IndexStore native probe failed: ' + str(observed.get('error')))
                    cloud.require(len(report['workers']) == 2 and all(url == origin + '/probe-worker.mjs' for url in report['workers']), 'Expected two dedicated Workers')
                    announced = observed['snapshot']['bytes']
                    cloud.check_recovery_budget(out, out, announced)
                    with page.expect_download(timeout=15000) as download:
                        page.evaluate('() => { const a=document.createElement("a"); a.href=globalThis.__indexStoreProbe.url; a.download="records.bin"; a.click(); }')
                    recovered = out / 'records.bin'
                    download.value.save_as(str(recovered))
                    report['independentVerification'] = verify_records(recovered, observed['snapshot']['sha256'])
                    report['fullSnapshotRecovered'] = True
                    cloud.require(not report['pageErrors'], 'Unexpected page error')
                    report['status'] = 'PASS'
                finally:
                    try:
                        report['cleanup'] = page.evaluate(PAGE_CLEANUP)
                        if report['cleanup']['status'] not in ('REMOVED', 'NOT_CREATED'):
                            report['status'] = 'BLOCKED'
                    except Exception as error:
                        report['cleanup'] = {'status': 'NOT VERIFIED', 'error': str(error)}
                        report['status'] = 'BLOCKED'
                    context.close()
            finally:
                browser.close()
    except Exception as error:
        report.update(status='BLOCKED' if isinstance(error, (cloud.Blocked, cloud.Deadline)) else 'FAIL',
                      error=f'{type(error).__name__}: {error}')
        (out / 'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if server:
            server.shutdown()
            server.server_close()
        report['elapsedSeconds'] = time.monotonic() - started
        cloud.write(out / 'run.json', report)
        transported = cloud.emit_evidence(out, report)
    return 0 if transported and report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
