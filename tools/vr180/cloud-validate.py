#!/usr/bin/env python3
"""Check published bytes, then exercise a checked-out cloud copy in sandboxed Chrome.

Only the two small, public synthetic fixtures are used. The UI supplies both the
MP4 and its original receipt. The fixed independent verifiers inspect the saved
bytes. Nothing here publishes a site, installs Chrome/FFmpeg, changes a codec,
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
BUILD = 'vr180-b1-diag1'
CANDIDATE_COMMIT = 'e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60'
LIMIT = 8 * 1024 * 1024
CHUNK_CHARS = 4096
VERIFIERS = {
    'verify-metadata.py': 'c80f0c59c6df30720481c7da6a46676d3bbc4757d079485c2598d3e0814a6d96',
    'verify-conversion.py': '8e13537f5c74f8207f670eb898b082a1962ae35e0db10a6ffeddb7be4c695f64',
}
FIXTURES = {
    'stereo180-sbs': '4c5b2725f625ea6f30f3f69afaa28644b8f954d60d5964bff712778ebdc86e83',
    'stereo360-tb': '72179961c99648647bb3d50940941e9694de41102f5f59d5e77807e1ad207bb9',
}
PUBLIC_PATHS = (
    'vr180-studio/index.html', 'vr180-studio/app.mjs',
    'shared/vr180/client.mjs', 'shared/vr180/geometry.mjs',
    'shared/vr180/mp4.mjs', 'shared/vr180/operations.mjs',
    'shared/vr180/transform.mjs', 'shared/vr180/worker.mjs',
)


class Blocked(RuntimeError):
    """A required environment/source precondition is not available."""


class Deadline(RuntimeError):
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


def source_check(out):
    commit = command(['git', 'rev-parse', 'HEAD'])
    require(re.fullmatch(r'[0-9a-f]{40}', commit), 'Invalid checkout commit')
    require(commit == os.environ.get('GITHUB_SHA'), 'Checkout differs from GITHUB_SHA')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Expected main checkout')
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
    report = {'checkoutCommit': commit, 'candidateCodeBaseline': CANDIDATE_COMMIT,
              'build': BUILD, 'fixtures': fixtures, 'fixedVerifierSHA256': VERIFIERS,
              'cloudCopySource': 'this main checkout docs/; HTTP loopback only', 'files': files}
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


def preflight(out):
    report = {'python': sys.version, 'uid': os.getuid(), 'sandboxRequired': True,
              'chromePath': str(CHROME), 'chromeExecutable': CHROME.is_file() and os.access(CHROME, os.X_OK),
              'ffmpegPath': shutil.which('ffmpeg'), 'ffprobePath': shutil.which('ffprobe'),
              'dependencySetupSucceeded': os.environ.get('VR180_DEPENDENCIES_READY') == 'true'}
    try:
        if sys.version_info[:2] != (3, 12):
            raise Blocked('Python 3.12 is required')
        if report['uid'] == 0:
            raise Blocked('A non-root runner user is required; no privilege changes are attempted')
        if not report['chromeExecutable']:
            raise Blocked('Preinstalled /usr/bin/google-chrome is unavailable; no browser installation or fallback')
        if not report['ffmpegPath'] or not report['ffprobePath']:
            raise Blocked('Preinstalled FFmpeg/ffprobe unavailable; no codec installation')
        if not report['dependencySetupSucceeded']:
            raise Blocked('Pinned Python dependency setup did not succeed')
        report['playwrightVersion'] = importlib.metadata.version('playwright')
        report['numpyVersion'] = importlib.metadata.version('numpy')
        require(report['playwrightVersion'] == '1.62.0', 'Unexpected Playwright version')
        require(report['numpyVersion'] == '2.3.3', 'Unexpected NumPy version')
        report['chromeVersion'] = command([str(CHROME), '--version'])
        report['ffmpegVersion'] = command(['ffmpeg', '-version']).splitlines()[0]
        report['ffprobeVersion'] = command(['ffprobe', '-version']).splitlines()[0]
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


def validate_receipt(raw, record, fixture, mode):
    require(raw['build'] == BUILD, 'Wrong application build')
    require(isinstance(raw.get('operationId'), str) and re.fullmatch(r'[0-9a-f-]{36}', raw['operationId']), 'Missing operation ID')
    # A fresh page runs inspect at revision 1, then the one media operation at 2.
    require(raw.get('inputRevision') == 2, 'Unexpected input revision for this fresh page')
    require(raw['input']['sha256'] == record['inputSHA256'], 'Receipt input hash differs')
    require(raw['input']['bytes'] == fixture.stat().st_size, 'Receipt input size differs')
    settings = raw['settings']
    require(settings['mode'] == mode and settings['confirmed'] is True, 'Wrong mode/confirmation')
    require(settings['layout'] == ('sbs' if mode == 'copy' else 'tb'), 'Wrong source eye layout')
    require(settings['fov'] == (180 if mode == 'copy' else 360), 'Wrong source field of view')
    if mode == 'convert':
        require(settings['eyeSize'] == 256 and settings['bitrate'] == 2000000, 'Wrong conversion size/bitrate')
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


def run_trial(context, origin, out, name, mode, run_id):
    trial = out / name
    trial.mkdir()
    fixture = DOCS / 'vr180-studio/fixtures' / f'{name}.mp4'
    shutil.copyfile(fixture, trial / 'input.mp4')
    record = {'trialId': f'{run_id}-{name}', 'fixture': name, 'mode': mode,
              'inputSHA256': digest(fixture), 'inputBytes': fixture.stat().st_size,
              'inputGeneration': 1, 'startedAt': now(), 'status': 'STARTED',
              'mediaOperationStarted': False, 'downloadRecovered': False, 'independentVerificationPassed': False,
              'scope': 'synthetic cloud-copy UI test; VR player, real footage, usability and speed improvements untested'}
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
        page.locator('#file').set_input_files(str(fixture))
        page.wait_for_function("document.querySelector('#status').textContent.includes('左右配置と視野角を確認して')")
        for selector, value in [('#layout', 'sbs' if mode == 'copy' else 'tb'),
                                ('#fov', '180' if mode == 'copy' else '360'), ('#mode', mode)]:
            page.locator(selector).select_option(value)
            page.wait_for_function("document.querySelector('#cancel').disabled")
        if mode == 'convert':
            page.locator('#size').select_option('256')
            page.wait_for_function("document.querySelector('#cancel').disabled")
        page.locator('#confirmed').check()
        page.wait_for_function("document.querySelector('#cancel').disabled && !document.querySelector('#run').disabled")
        page.locator('#run').click()
        record['mediaOperationStarted'] = True
        page.wait_for_function("document.querySelector('#cancel').disabled && !document.querySelector('#receipt').disabled", timeout=120000)
        raw = download_receipt(page, trial / 'receipt-pre-download.json')
        record['receiptStatus'] = raw.get('status')
        record['codecCapabilities'] = raw.get('capabilities') or (raw.get('metrics') or {}).get('capabilities')
        validate_receipt(raw, record, fixture, mode)
        require(raw['status'] == 'prepared', 'Application failure: ' + json.dumps(raw.get('error'), ensure_ascii=False))
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
        independent_check(trial, fixture, output, mode)
        require(any(w['url'] == origin + '/shared/vr180/worker.mjs' for w in workers), 'Application Worker was not observed')
        record.update(status='PASS', independentVerificationPassed=True)
    except (Exception, KeyboardInterrupt) as error:
        record.update(status='FAIL', error=f'{type(error).__name__}: {error}')
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
    args = parser.parse_args()
    out = args.output.resolve()
    require(not out.is_relative_to(ROOT), 'Evidence must be outside the checkout')
    out.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'vr180-cloud-validation-v1', 'status': 'BLOCKED', 'startedAt': now(),
              'runId': f"{os.environ.get('GITHUB_RUN_ID', 'missing')}-{os.environ.get('GITHUB_RUN_ATTEMPT', 'missing')}",
              'github': {key: os.environ.get(key) for key in ('GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')},
              'browserSandboxRequired': True, 'browserTrials': [], 'pagesByteCheck': 'NOT_RUN',
              'notVerified': ['VR player/headset compatibility', 'real footage quality', 'novice usability',
                              'speed improvement', 'cancel/retry behavior', '4K scale', 'product completion']}
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
        source = source_check(out)
        result['checkoutCommit'] = source['checkoutCommit']
        wait_for_pages(out, source['checkoutCommit'])
        result['pagesByteCheck'] = 'PASS'
        preflight(out)
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
                for name, mode in [('stereo180-sbs', 'copy'), ('stereo360-tb', 'convert')]:
                    trial = run_trial(context, origin, out, name, mode, result['runId'])
                    result['browserTrials'].append(trial)
                    if trial['status'] != 'PASS':
                        break
                result['status'] = 'PASS' if len(result['browserTrials']) == 2 and all(t['status'] == 'PASS' for t in result['browserTrials']) else 'FAIL'
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
                      executedMediaTrials=sum(t['mediaOperationStarted'] for t in result['browserTrials']))
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
    return 0 if result['status'] == 'PASS' and complete else 1


if __name__ == '__main__':
    raise SystemExit(main())
