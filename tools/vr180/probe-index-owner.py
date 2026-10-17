#!/usr/bin/env python3
"""Private native OPFS owner cleanup across Worker termination, reload and tabs.

No codec/transform, media output, storage quota, process crash or public deployment
is qualified by this probe. It requires committed source, native Web Locks and
sandboxed cloud Chrome, with no in-memory or no-sandbox fallback.
"""
from __future__ import annotations
import argparse
import hashlib
import http.server
import importlib.util
import os
from pathlib import Path
import signal
import threading
import time
import traceback
import urllib.request
import uuid

spec = importlib.util.spec_from_file_location('cloud', Path(__file__).with_name('cloud-validate.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
SOURCES = [
    'development/vr180/index-prototype/job-owner.mjs',
    'development/vr180/index-prototype/index-store.mjs',
    'development/vr180/input-index-prototype/input-index.mjs',
    'development/vr180/input-index-prototype/presentation-index.mjs',
    'development/vr180/output-index-prototype/output-index.mjs',
    'development/vr180/output-index-prototype/mp4-output-inspect.mjs',
    'docs/shared/vr180/mp4.mjs',
]
HTML = b'<!doctype html><meta charset="utf-8"><title>Private index ownership probe</title>'
WORKER = r"""import {cleanupAbandonedIndexJob} from '/development/vr180/index-prototype/job-owner.mjs';
import {createIndexBudget} from '/development/vr180/index-prototype/index-store.mjs';
import {createInputIndex} from '/development/vr180/input-index-prototype/input-index.mjs';
import {createOutputIndex} from '/development/vr180/output-index-prototype/output-index.mjs';
const need = (v, message) => { if (!v) throw Error(message); };
const describe = e => ({name: e.name, message: e.message, status: e.status ?? null, retryCleanup: !!e.retryCleanup});
const witness = Uint8Array.from({length: 256}, (_, i) => (i * 19 + 7) % 256);
const hex = b => [...b].map(n => n.toString(16).padStart(2, '0')).join('');
const hash = async b => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));
let controller, budget, handle, info, ownRoot;
function observedDirectory(real, calls, prefix = '') {
  return {entries: () => real.entries(), getFileHandle: (...args) => real.getFileHandle(...args),
    async getDirectoryHandle(name, options) { return observedDirectory(await real.getDirectoryHandle(name, options), calls, prefix + name + '/'); },
    async removeEntry(name, options) { calls.push(prefix + name); return real.removeEntry(name, options); }};
}
async function rootFor(namespace) {
  need(isSecureContext && navigator.storage?.getDirectory && navigator.locks?.request && navigator.locks?.query,
    'NATIVE_CAPABILITIES_UNAVAILABLE');
  return (await navigator.storage.getDirectory()).getDirectoryHandle(namespace);
}
async function check() {
  need(controller && handle, 'OWNER_NOT_READY');
  const bytes = new Uint8Array(256); let at = 0;
  while (at < bytes.length) { const n = handle.read(bytes.subarray(at), {at}); need(n > 0, 'WITNESS_READ_PROGRESS'); at += n; }
  need(bytes.every((n, i) => n === witness[i]), 'LIVE_WITNESS_CHANGED');
  const locks = await navigator.locks.query();
  need(locks.held.some(lock => lock.name === 'vr180:index-job:' + info.jobId), 'LIVE_OWNER_LEASE_LOST');
  const directory = await ownRoot.getDirectoryHandle(info.jobId);
  const ownerFile = await (await directory.getFileHandle('owner.bin')).getFile();
  need(ownerFile.size === 256, 'OWNER_RECORD_SIZE');
  const record = new Uint8Array(await ownerFile.arrayBuffer());
  return {owner: controller.owner, witnessSHA256: await hash(bytes), ownerRecordSHA256: await hash(record), ownerRecordHex: hex(record),
    budgetReservedBytes: budget.usedBytes, leaseHeld: true, witnessBytes: bytes.length};
}
async function start(args) {
  need(!controller, 'ALREADY_STARTED'); info = args; ownRoot = await rootFor(args.namespace); budget = createIndexBudget();
  controller = await (args.kind === 'input' ? createInputIndex : createOutputIndex)({root: ownRoot,
    jobId: args.jobId, ownerToken: args.ownerToken, budget, source: new Blob([new Uint8Array(1)])});
  try {
    const directory = await ownRoot.getDirectoryHandle(args.jobId);
    handle = await (await directory.getFileHandle('live-witness.bin', {create: true})).createSyncAccessHandle();
    for (let at = 0; at < witness.length;) { const n = handle.write(witness.subarray(at), {at}); need(n > 0, 'WITNESS_WRITE_PROGRESS'); at += n; }
    handle.flush(); return await check();
  } catch (error) {
    try { if (handle) { handle.close(); handle = null; } } finally { await controller.dispose(); } throw error;
  }
}
async function finish() {
  const before = await check();
  try { handle.close(); handle = null; } finally { await controller.dispose(); }
  need(budget.usedBytes === 0, 'OWNER_BUDGET_RETAINED');
  return {before, budgetReservedBytes: budget.usedBytes, disposed: controller.metrics.disposed};
}
async function recover(args) {
  const calls = [], b = createIndexBudget(), real = await rootFor(args.namespace);
  const root = observedDirectory(real, calls);
  try {
    const result = await cleanupAbandonedIndexJob({...args, root, budget: b});
    need(b.usedBytes === 0, 'RECOVERY_BUDGET_RETAINED');
    return {ok: true, result, removeCalls: calls, budgetReservedBytes: b.usedBytes};
  } catch (error) {
    // Unexpected partial cleanup is still owned. Try the explicit same-owner
    // retry before this one-shot worker exits, but retain the original failure.
    let retry = null;
    if (error.retryCleanup) { try { await error.retryCleanup(); retry = 'completed'; } catch (e) { retry = describe(e); } }
    return {ok: false, error: describe(error), retry, removeCalls: calls, budgetReservedBytes: b.usedBytes};
  }
}
async function contend(args) {
  const calls = [], b = createIndexBudget(), root = observedDirectory(await rootFor(args.namespace), calls);
  let extra;
  try {
    extra = await (args.kind === 'input' ? createInputIndex : createOutputIndex)({...args, root, budget: b, source: new Blob([new Uint8Array(1)])});
    await extra.dispose(); return {ok: true, unexpectedAcquisition: true, removeCalls: calls, budgetReservedBytes: b.usedBytes};
  } catch (error) { return {ok: false, error: describe(error), removeCalls: calls, budgetReservedBytes: b.usedBytes}; }
}
self.onmessage = ({data}) => {
  const action = data.action === 'start' ? start(data) : data.action === 'check' ? check()
    : data.action === 'finish' ? finish() : data.action === 'recover' ? recover(data)
    : data.action === 'contend' ? contend(data) : Promise.reject(Error('UNKNOWN_COMMAND'));
  Promise.resolve(action).then(result => self.postMessage({ok: true, result}), error => self.postMessage({ok: false, error: describe(error)}));
};
"""
PAGE_INIT = r"""() => {
  globalThis.__owners = new Map();
  globalThis.__call = (worker, args) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(Error('WORKER_TIMEOUT')), 20000);
    const done = (error, value) => { clearTimeout(timer); worker.removeEventListener('message', message); worker.removeEventListener('error', failed); error ? reject(error) : resolve(value); };
    const message = event => event.data.ok ? done(null, event.data.result) : done(Error(JSON.stringify(event.data.error)));
    const failed = event => done(Error(event.message || 'WORKER_FAILED'));
    worker.addEventListener('message', message); worker.addEventListener('error', failed); worker.postMessage(args);
  });
  globalThis.__start = async args => { const worker = new Worker('/probe-worker.mjs', {type: 'module'}); __owners.set(args.jobId, worker); return __call(worker, {...args, action: 'start'}); };
  globalThis.__owner = (id, action) => __call(__owners.get(id), {action});
  globalThis.__once = async args => { const worker = new Worker('/probe-worker.mjs', {type: 'module'}); try { return await __call(worker, args); } finally { worker.terminate(); } };
  globalThis.__kill = id => { __owners.get(id).terminate(); __owners.delete(id); };
}"""


def server_for():
    content = {'/': (HTML, 'text/html'), '/probe-worker.mjs': (WORKER.encode(), 'text/javascript')}
    for name in SOURCES:
        path = c.ROOT / name
        c.require(not path.is_symlink(), 'Symlink source refused')
        content['/' + name] = (path.read_bytes(), 'text/javascript')

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

        def log_message(self, *_):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, content


def run_native(context, origin, report):
    namespace = 'vr180-owner-probe-' + uuid.uuid4().hex
    report['namespace'] = namespace
    tickets = []
    pages = []
    errors = report['pageErrors'] = []

    def page():
        p = context.new_page()
        pages.append(p)
        p.set_default_timeout(20000)
        p.on('pageerror', lambda error: errors.append(str(error)))
        p.goto(origin + '/', wait_until='networkidle')
        p.evaluate(PAGE_INIT)
        return p

    def identity(kind, label):
        value = {'namespace': namespace, 'kind': kind, 'jobId': label + '-' + uuid.uuid4().hex,
                 'ownerToken': uuid.uuid4().hex}
        tickets.append(value)
        return value

    def once(p, action, value):
        return p.evaluate('args => __once(args)', {**value, 'action': action})

    def absent_lease(p, value):
        p.wait_for_function('async name => !(await navigator.locks.query()).held.some(l => l.name === name)',
                            arg='vr180:index-job:' + value['jobId'], timeout=15000)

    def refuse(value, message):
        c.require(not value['ok'] and value['error']['status'] == 'BLOCKED' and message in value['error']['message'], 'Expected refusal: ' + str(value))
        c.require(value['removeCalls'] == [] and value['budgetReservedBytes'] == 0, 'Refusal touched job or retained resources')

    def recovered(p, value):
        absent_lease(p, value)
        row = once(p, 'recover', value)
        c.require(row['ok'] and row['result']['status'] == 'removed' and row['budgetReservedBytes'] == 0, 'Recovery failed: ' + str(row))
        c.require(all(path == value['jobId'] or path.startswith(value['jobId'] + '/') for path in row['removeCalls']), 'Cross-job removal')
        return row

    try:
        a, b = page(), page()
        a.evaluate('async name => { const root=await navigator.storage.getDirectory(); try { await root.getDirectoryHandle(name); throw Error("NAMESPACE_EXISTS"); } catch(e) { if(e.name!=="NotFoundError")throw e; } await root.getDirectoryHandle(name,{create:true}); }', namespace)
        live = identity('output', 'other-live')
        live_before = b.evaluate('args => __start(args)', live)
        killed = identity('input', 'worker-kill')
        before = a.evaluate('args => __start(args)', killed)
        active = once(b, 'recover', killed)
        refuse(active, 'LOCK_BUSY')
        collision = once(b, 'contend', {**killed, 'kind': 'output'})
        refuse(collision, 'LOCK_BUSY')
        c.require(a.evaluate('id => __owner(id,"check")', killed['jobId']) == before, 'Active job changed after contention')
        a.evaluate('id => __kill(id)', killed['jobId'])
        absent_lease(b, killed)
        wrong = once(b, 'recover', {**killed, 'ownerToken': '0' * 32})
        refuse(wrong, 'RECORD_MISMATCH')
        report['workerTermination'] = {'ownerBefore': before, 'liveCleanupRefused': active, 'crossRoleCreateRefused': collision,
                                       'wrongTokenRefusedAfterTermination': wrong, 'cleanup': recovered(b, killed)}
        # Same ID can now be created by a new owner, not adopted while nonempty.
        replacement = {**killed, 'ownerToken': uuid.uuid4().hex}
        tickets.append(replacement)
        replacement_before = a.evaluate('args => __start(args)', replacement)
        replacement_done = a.evaluate('id => __owner(id,"finish")', replacement['jobId'])
        a.evaluate('id => __kill(id)', replacement['jobId'])
        report['reacquisition'] = {'before': replacement_before, 'after': replacement_done}
        reload_job = identity('input', 'reload')
        reload_before = a.evaluate('args => __start(args)', reload_job)
        a.reload(wait_until='networkidle')
        a.evaluate(PAGE_INIT)
        report['reload'] = {'ownerBefore': reload_before, 'cleanup': recovered(b, reload_job)}
        close_job = identity('output', 'page-close')
        close_before = a.evaluate('args => __start(args)', close_job)
        a.close()
        report['pageClose'] = {'ownerBefore': close_before, 'cleanup': recovered(b, close_job)}
        live_after = b.evaluate('id => __owner(id,"check")', live['jobId'])
        c.require(live_after == live_before, 'Other live job changed during cleanup')
        done = b.evaluate('id => __owner(id,"finish")', live['jobId'])
        c.require(done['disposed'] and done['budgetReservedBytes'] == 0, 'Normal disposal failed')
        b.evaluate('id => __kill(id)', live['jobId'])
        report['otherLiveJob'] = {'before': live_before, 'afterAllRecoveries': live_after, 'normalDispose': done}
        verified = []
        for row in [before, replacement_before, reload_before, close_before, live_before]:
            raw = bytes.fromhex(row['ownerRecordHex'])
            owner = row['owner']
            expected = bytearray(256)
            expected[:16] = b'VR180IDXOWNER001'
            expected[16:20] = (1).to_bytes(4, 'little')
            expected[20] = {'input': 1, 'output': 2}[owner['kind']]
            expected[21] = len(owner['jobId'])
            expected[24:40] = bytes.fromhex(owner['ownerToken'])
            job = owner['jobId'].encode('ascii')
            expected[40:40 + len(job)] = job
            c.require(raw == expected and owner['schema'] == 1 and owner['format'] == 'vr180-private-index-owner', 'Independent owner record mismatch')
            c.require(hashlib.sha256(raw).hexdigest() == row['ownerRecordSHA256'], 'Recovered owner hash mismatch')
            c.require(hashlib.sha256(bytes((i * 19 + 7) % 256 for i in range(256))).hexdigest() == row['witnessSHA256'], 'Independent witness mismatch')
            verified.append({'jobId': owner['jobId'], 'recordBytes': len(raw), 'sha256': row['ownerRecordSHA256']})
        report['independentOwnerRecords'] = {'status': 'PASS', 'records': verified, 'method': 'All 256 recovered bytes against Python format/identity oracle; complete witness hash'}
        c.require(not errors, 'Unexpected page errors')
    finally:
        # No recursive namespace sweep. Terminate our pages, then ask the same
        # exact-ticket recovery API about every known job. Unknown leftovers block.
        for p in pages:
            if not p.is_closed():
                p.close()
        cleanup_page = page()
        cleanup = []
        try:
            for value in {ticket['jobId']: ticket for ticket in tickets}.values():
                absent_lease(cleanup_page, value)
                row = once(cleanup_page, 'recover', value)
                cleanup.append({'jobId': value['jobId'], 'result': row})
                c.require(row['ok'], 'Final explicit cleanup refused: ' + str(row))
            final = cleanup_page.evaluate('async name => {const root=await navigator.storage.getDirectory(); const dir=await root.getDirectoryHandle(name); let remaining=0; for await(const entry of dir.entries())remaining++; if(remaining)throw Error("UNKNOWN_RESIDUAL_JOB"); await root.removeEntry(name); return {namespaceAbsent:true, remainingJobs:remaining};}', namespace)
            report['finalCleanup'] = {'status': 'PASS', 'jobs': cleanup, **final}
        finally:
            cleanup_page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    out = args.output.resolve()
    c.require(not out.exists() and not out.is_relative_to(c.ROOT), 'Use new output directory outside checkout')
    out.mkdir(parents=True)
    report = {'schema': 'vr180-index-owner-native-v1', 'status': 'BLOCKED',
              'runId': os.environ.get('GITHUB_RUN_ID', 'local') + '-index-owner-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
              'scope': 'Native OPFS controller owner records, live SyncAccessHandle, Worker.terminate, page reload/close and two same-origin tabs',
              'notVerified': ['OS/browser process crash', 'power loss durability', 'transform resume', 'external writer rollback',
                              'codec conversion', 'large media', 'whole-browser memory', 'public deployment'],
              'prototypeOnly': True, 'publicFilesWritten': False}
    started = time.monotonic()
    server = None

    def deadline(*_):
        raise c.Deadline('Index owner probe deadline')

    signal.signal(signal.SIGALRM, deadline)
    signal.signal(signal.SIGTERM, deadline)
    signal.alarm(240)
    try:
        c.require(os.environ.get('GITHUB_REPOSITORY') == 'Kushyameln01/kushyameln-works', 'Repository differs')
        source = c.source_check(out, candidate=True)
        report['checkoutCommit'] = source['checkoutCommit']
        c.preflight(out, defer_verification=True)
        c.command(['git', 'ls-files', '--error-unmatch', *SOURCES, str(Path(__file__).relative_to(c.ROOT))])
        report['harnessSHA256'] = c.digest(Path(__file__))
        report['sharedHarnessSHA256'] = c.digest(Path(c.__file__))
        server, content = server_for()
        origin = f'http://127.0.0.1:{server.server_port}'
        inventory = []
        for route, (expected, _) in content.items():
            with urllib.request.urlopen(origin + route, timeout=5) as response:
                actual = response.read(len(expected) + 1)
            c.require(actual == expected, 'Served source mismatch')
            inventory.append({'route': route, 'bytes': len(actual), 'sha256': hashlib.sha256(actual).hexdigest()})
        c.write(out / 'private-source-inventory.json', {'checkoutCommit': source['checkoutCommit'], 'files': inventory})
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=str(c.CHROME), headless=True, chromium_sandbox=True, timeout=30000)
            report['browserVersion'] = browser.version
            try:
                context = browser.new_context()
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
                try:
                    run_native(context, origin, report)
                finally:
                    context.close()
            finally:
                browser.close()
        report['status'] = 'PASS'
    except Exception as error:
        report.update(status='BLOCKED' if isinstance(error, (c.Blocked, c.Deadline)) else 'FAIL', error=f'{type(error).__name__}: {error}')
        (out / 'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if server:
            server.shutdown()
            server.server_close()
        report['elapsedSeconds'] = time.monotonic() - started
        c.write(out / 'run.json', report)
        transported = c.emit_evidence(out, report)
    return 0 if transported and report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
