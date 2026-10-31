#!/usr/bin/env python3
"""Decode one owner-restored F1 mean through the actual VAE UI, once."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import threading
import time
import traceback
from urllib.parse import unquote, urlsplit

import numpy as np
from playwright.sync_api import sync_playwright
from accept_still import REPO, WORKER_TRACKING, ProcessSampler, compare_download
from process_lifecycle import ProcessOwnership, cleanup_complete

MODEL = '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
LATENT_SHAPE = [1, 16, 1, 2, 2]
RGB_SHAPE = [1, 3, 1, 16, 16]
GATE = {'atol': 2e-5, 'rtol': 2e-5, 'maxAbs': 2e-5}
REFERENCE_SHA = 'cf5ff2bf37ac4c27ec892d143bc1be1bb1a86462e4116ab03510bd6c05095849'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_input(path):
    raw = path.read_bytes()
    if len(raw) < 12 or raw[:8] != b'WKTSR001':
        raise ValueError('Input must be a Works tensor')
    length = int.from_bytes(raw[8:12], 'little')
    if not 0 < length <= 65536 or 12 + length > len(raw):
        raise ValueError('Invalid input header length')
    header = json.loads(raw[12:12 + length].decode('utf-8'))
    payload = raw[12 + length:]
    expected = {'schemaVersion': 1, 'dtype': 'float32', 'layout': 'NCTHW',
                'shape': LATENT_SHAPE, 'meaning': 'raw-posterior-mean',
                'modelSha256': MODEL, 'byteOrder': 'little', 'byteLength': 256}
    if any(header.get(key) != value for key, value in expected.items()):
        raise ValueError('Input must retain the exact F1 raw-mean profile/model')
    if len(payload) != 256 or hashlib.sha256(payload).hexdigest() != header.get('dataSha256'):
        raise ValueError('Input payload identity mismatch')
    if not np.isfinite(np.frombuffer(payload, dtype='<f4')).all():
        raise ValueError('Nonfinite input mean')
    if 'normalization' in header or 'latentContract' in header:
        raise ValueError('Restored posterior mean cannot carry a sample/normalized contract')
    return {'bytes': len(raw), 'fileSha256': digest(path),
            'payloadSha256': header['dataSha256'], 'header': header,
            'contextScope': 'Diagnostic declaration copied as supplied; not original-asset authentication'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('bundle', 'input', 'reference', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    for name in ('bundle', 'input', 'reference', 'output'):
        setattr(args, name, getattr(args, name).resolve())
    if 'docs' in args.output.parts:
        raise ValueError('Private evidence must remain outside docs/')
    args.output.mkdir(parents=True, exist_ok=False)
    result = {'passed': False, 'scope': 'One real F1 raw-mean decode of owner-restored64 via product UI',
              'comparisonGate': GATE, 'generatedSampleInference': False,
              'textInference': False, 'encodeInference': False, 'referenceRecomputed': False,
              'pageErrors': [], 'consoleErrors': [], 'requests': [], 'requestFailures': [],
              'httpErrors': [], 'closeErrors': []}
    phase = 'input-validation'
    server = browser = context = page = playwright = sampler = owner = None
    started = time.monotonic()
    try:
        result['input'] = validate_input(args.input)
        manifest_path = args.bundle / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        if (manifest.get('model', {}).get('sha256') != MODEL
                or manifest.get('profile', {}).get('latentShape') != LATENT_SHAPE
                or manifest['profile']['videoShape'] != RGB_SHAPE):
            raise ValueError('Only the original private F1 bundle may be used')
        if args.reference.stat().st_size != 768 * 4 or digest(args.reference) != REFERENCE_SHA:
            raise ValueError('Reference differs from the fixed original PNG mean roundtrip golden')
        result.update(profileId=manifest['profile']['id'], manifestSha256=digest(manifest_path),
                      reference={'file': args.reference.name, 'bytes': 3072,
                                 'sha256': REFERENCE_SHA, 'elements': 768})
        owner = ProcessOwnership().start()  # Before the Playwright driver and Chromium.

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                path = (REPO / 'docs' / unquote(urlsplit(self.path).path).lstrip('/')).resolve()
                if not path.is_relative_to((REPO / 'docs').resolve()):
                    self.send_error(403)
                    return
                if path.is_dir():
                    path = path / 'index.html'
                if not path.is_file():
                    self.send_error(404)
                    return
                kind = {'.mjs': 'text/javascript', '.wasm': 'application/wasm'}.get(path.suffix)
                self.send_response(200)
                self.send_header('Content-Type', kind or mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
                self.send_header('Content-Length', str(path.stat().st_size))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                try:
                    with path.open('rb') as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b''):
                            self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
        phase = 'browser-launch'
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                             args=['--no-sandbox', '--disable-dev-shm-usage'])
        result['browserVersion'] = browser.version
        cdp = browser.new_browser_cdp_session()
        processes = cdp.send('SystemInfo.getProcessInfo')['processInfo']
        browser_pid = next(int(p['id']) for p in processes if p['type'] == 'browser')
        cdp.detach()
        sampler = ProcessSampler(browser_pid)
        sampler.start()
        context = browser.new_context(accept_downloads=True, service_workers='block')
        context.add_init_script(WORKER_TRACKING)
        page = context.new_page()
        page.set_default_timeout(240000)
        page.on('pageerror', lambda error: result['pageErrors'].append(str(error)))
        page.on('console', lambda message: result['consoleErrors'].append(message.text)
                if message.type == 'error' else None)
        page.on('request', lambda request: result['requests'].append(
            {'url': request.url, 'method': request.method, 'phase': sampler.phase}))
        page.on('response', lambda response: result['httpErrors'].append(
            {'url': response.url, 'status': response.status}) if response.status >= 400 else None)
        page.on('requestfailed', lambda request: result['requestFailures'].append(
            {'url': request.url, 'failure': request.failure}))
        page.route('**/*', lambda route: route.continue_()
                   if route.request.method == 'GET' and route.request.url.startswith(origin + '/')
                   else route.abort())
        page.goto(origin + '/vae/')
        phase = sampler.phase = 'select-existing-f1-bundle-and-restored-mean'
        page.locator('#bundle').set_input_files(str(args.bundle))
        page.wait_for_function("document.querySelector('#model-info').textContent.includes('1フレーム / 16×16')")
        page.locator('#operation').select_option('decode')
        page.locator('#tensor-input').set_input_files(str(args.input))
        page.wait_for_function("document.querySelector('#input-info').textContent.includes('raw-posterior-mean')")
        phase = sampler.phase = 'one-restored64-raw-decode'
        inference_started = time.monotonic()
        page.locator('#run').click()
        page.wait_for_function("!document.querySelector('#save').disabled || !document.querySelector('#run').disabled")
        if page.locator('#save').is_disabled():
            raise RuntimeError('Product VAE decode failed: ' + page.locator('#status').inner_text())
        result['inferenceWallSeconds'] = time.monotonic() - inference_started
        evidence = json.loads(page.locator('#evidence').text_content())
        result['evidence'] = evidence
        if (evidence.get('operation') != 'decode' or evidence.get('hikeCalls') != 17
                or evidence.get('normalizationApplied') is not False
                or evidence.get('inputMeaning') != 'raw-posterior-mean'
                or evidence.get('inputModelSha256') != MODEL):
            raise AssertionError('Decode evidence differs from the unchanged raw/Hike contract')
        phase = sampler.phase = 'download-and-full768-comparison'
        with page.expect_download() as download:
            page.locator('#save').click()
        output = args.output / 'restore64-rgb.wktensor'
        download.value.save_as(str(output))
        result['numeric'] = compare_download(output, args.reference, RGB_SHAPE,
                                             'raw-decoder-rgb', MODEL, GATE)
        if result['numeric']['header'].get('context') != result['input']['header'].get('context'):
            raise AssertionError('Output context differs from the supplied diagnostic declaration')
        result['contextReadback'] = {'preserved': True,
                                    'input': result['input']['header'].get('context'),
                                    'output': result['numeric']['header'].get('context'),
                                    'scope': 'Equal owned declarations recovered from separate input/output files'}
        # Exercise the unchanged product's saved-tensor loader; no second inference.
        page.locator('#tensor-input').set_input_files(str(output))
        page.wait_for_function("document.querySelector('#input-info').textContent.includes('raw-decoder-rgb')")
        result['savedFileReadback'] = True
        result['workerTracking'] = page.evaluate('({...globalThis.__workerTracking})')
        if result['workerTracking'] != {'created': 1, 'terminated': 1, 'live': 0}:
            raise AssertionError('Exactly one owned inference Worker must be closed')
        if (result['pageErrors'] or result['consoleErrors'] or result['httpErrors']
                or result['requestFailures'] or any(r['method'] != 'GET' or not r['url'].startswith(origin + '/')
                                                     for r in result['requests'])):
            raise AssertionError('Unexpected page/console/network activity')
        result['networkScope'] = 'Local GET only; existing model bundle and tensors selected via actual File inputs'
        result['passed'] = True
    except Exception as error:
        result['failure'] = {'phase': phase, 'type': type(error).__name__,
                             'message': str(error), 'traceback': traceback.format_exc()}
    finally:
        if page is not None and not page.is_closed():
            try:
                result.setdefault('workerTracking', page.evaluate('({...globalThis.__workerTracking})'))
            except Exception as error:
                result['workerTrackingUnavailable'] = str(error)
        if sampler is not None:
            sampler.phase = 'close-owned-browser-and-driver'
        for name, resource in (('context', context), ('browser', browser)):
            if resource is not None:
                try:
                    resource.close()
                except Exception as error:
                    result['closeErrors'].append({'resource': name, 'error': str(error)})
        if playwright is not None:
            try:
                playwright.stop()
            except Exception as error:
                result['closeErrors'].append({'resource': 'playwright-driver', 'error': str(error)})
        if sampler is not None:
            sampler.stop()
        if owner is not None:
            ownership = owner.finish(timeout_seconds=5)
            result['processOwnership'] = ownership
            if not cleanup_complete(ownership['liveAfterClose'], ownership['zombiesAfterClose'], ownership['errors']):
                result['passed'] = False
        if sampler is not None:
            live, zombies = sampler.remaining()
            resources = sampler.report()
            resources.update(liveProcessesAfterClose=live, zombieProcessesAfterClose=zombies,
                             allObservedPidsGone=not live and not zombies)
            resource_path = args.output / 'resource-measurements.json'
            resource_path.write_text(json.dumps(resources, indent=2) + '\n')
            result['resources'] = {'file': resource_path.name, 'sha256': digest(resource_path),
                                   'liveProcessesAfterClose': live, 'zombieProcessesAfterClose': zombies}
            if live or zombies:
                result['passed'] = False
        if server is not None:
            server.shutdown()
            server.server_close()
        if 'failure' in result or result['closeErrors']:
            result['passed'] = False
        result['wallSeconds'] = time.monotonic() - started
        (args.output / 'acceptance-results.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps({'passed': result['passed'], 'output': str(args.output),
                          'failure': result.get('failure'), 'wallSeconds': result['wallSeconds']}, indent=2))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
