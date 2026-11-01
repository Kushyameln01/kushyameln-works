#!/usr/bin/env python3
"""Sequential real-browser normal owner API acceptance using existing references.

Requires a committed source SHA. Does not export graphs, generate references,
rehash original model/graph files in preflight, or implement management adapters.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import traceback
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / 'vae'))
sys.path.insert(0, str(HERE / 'text-encoder'))
from process_lifecycle import ProcessOwnership, cleanup_complete
from accept_still import ProcessSampler
from plain_checks import unpack_tensor, compare_values, validate_gate


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('vae-bundle', 'vae-references', 'text-bundle', 'text-source', 'text-reference', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--browser', default=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium'))
    parser.add_argument('--timeout-seconds', type=int, default=1800)
    parser.add_argument('--preflight-only', action='store_true',
                        help='Check actual browser source/file/configuration bindings without inference or Workers')
    args = parser.parse_args()
    for name in ('vae_bundle', 'vae_references', 'text_bundle', 'text_source', 'text_reference', 'output'):
        setattr(args, name, getattr(args, name).resolve())
    if not args.browser:
        raise ValueError('An existing real Chromium executable is required')
    if args.output.exists() or args.output.is_relative_to(ROOT / 'docs'):
        raise ValueError('A fresh private output directory outside docs/ is required')
    args.output.mkdir(parents=True)
    started = time.monotonic()
    report = {'passed': False, 'scope': 'Default normal Text/VAE owner API, reused diagnostic profiles and references only',
              'executionSourceSha': args.execution_source_sha, 'newExports': 0, 'newOracleRuns': 0,
              'preflightOnly': args.preflight_only,
              'neuralExecutionOrder': [] if args.preflight_only else ['Rect cancel at actual run', 'Rect recovery encode', 'Rect mean decode',
                                                                     'one full plain Hello world', 'Text cancel during first graph hash'],
              'httpRequests': [], 'blockedRequests': [], 'httpErrors': [], 'requestFailures': [],
              'pageErrors': [], 'consoleErrors': [], 'progress': [], 'serverErrors': []}
    owner = browser = context = server = server_thread = sampler = None
    served = {}
    try:
        vae_manifest = json.loads((args.vae_bundle / 'manifest.json').read_text())
        text_manifest = json.loads((args.text_bundle / 'manifest.json').read_text())
        plain_input = json.loads((args.text_reference / 'plain-input.json').read_text())
        oracle = json.loads((args.text_reference / 'reference-results.json').read_text())
        rect_reference = json.loads((args.vae_references / 'reference-report.json').read_text())
        if vae_manifest['profile']['videoShape'] != [1, 3, 1, 16, 32] or vae_manifest['profile']['latentShape'] != [1, 16, 1, 2, 4]:
            raise ValueError('Existing accepted Rect full NCTHW shapes required')
        if plain_input['text'] != 'Hello world' or not oracle['passed'] or oracle['oracleUsesOnnxOrHike'] is not False:
            raise ValueError('Existing independent plain Hello world oracle required')
        if oracle['input'].get('oracleUsesFull512Positions') is not True:
            raise ValueError('Existing oracle must cover all512 positions')
        if sha(args.text_bundle / 'manifest.json') != plain_input['manifestSha256']:
            raise ValueError('Text manifest differs from the selected independent reference')
        validate_gate(text_manifest['numericGate'])
        if args.text_source.stat().st_size != text_manifest['modelBytes']:
            raise ValueError('Original Text source byte length mismatch')
        reference_paths = {'plain-reference.f32': args.text_reference / 'plain-reference.f32'}
        expected_hashes = {'plain-reference.f32': oracle['reference']['sha256']}
        for name in ('png-unit', 'png-mean', 'png-roundtrip'):
            record = rect_reference['references'][name]
            reference_paths[name + '.f32'] = args.vae_references / record['file']
            expected_hashes[name + '.f32'] = record['sha256']
        references = {}
        for name, path in reference_paths.items():
            actual = sha(path)
            if actual != expected_hashes[name]:
                raise ValueError('Reused reference identity mismatch: ' + name)
            references[name] = {'path': str(path), 'bytes': path.stat().st_size, 'sha256': actual}
        report['reusedReferences'] = references
        report['referenceExecutionSourceSha'] = plain_input.get('executionSourceSha')
        report['manifests'] = {name: {'path': str(path), 'sha256': sha(path)} for name, path in
                               [('vae', args.vae_bundle / 'manifest.json'), ('text', args.text_bundle / 'manifest.json')]}
        vae_selected = [args.vae_bundle / 'manifest.json', *(args.vae_bundle / record['file'] for record in vae_manifest['assets'].values())]
        text_selected = [args.text_bundle / 'manifest.json', *(args.text_bundle / record['path'] for record in text_manifest['blocks']),
                         args.text_bundle / text_manifest['embedding']['rowHashes']['path'], args.text_bundle / text_manifest['finalNorm']['path'],
                         args.text_bundle / text_manifest['tokenizer']['path']]
        for paths in (vae_selected, text_selected):
            if len({path.name for path in paths}) != len(paths) or not all(path.is_file() for path in paths):
                raise ValueError('Selected local bundle files missing or basenames collide')

        def source_bytes(path):
            path = path.resolve()
            relative = path.relative_to(ROOT).as_posix()
            raw = path.read_bytes()
            stamp = (path.stat().st_size, path.stat().st_mtime_ns)
            if relative not in served:
                fixed = subprocess.run(['git', 'show', args.execution_source_sha + ':' + relative], cwd=ROOT,
                                       check=True, capture_output=True).stdout
                if raw != fixed:
                    raise ValueError('Executed source differs from committed source: ' + relative)
                served[relative] = {'path': relative, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                                    'executionSourceSha': args.execution_source_sha, '_stamp': stamp}
            elif served[relative]['_stamp'] != stamp:
                raise ValueError('Executed source changed during acceptance: ' + relative)
            return raw

        for path in (Path(__file__), HERE / 'owner-normal-browser.mjs', HERE / 'owner-normal-worker.mjs',
                     HERE / 'vae/process_lifecycle.py', HERE / 'vae/accept_still.py', HERE / 'text-encoder/plain_checks.py'):
            source_bytes(path)

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                try:
                    requested = unquote(urlsplit(self.path).path)
                    if requested == '/':
                        raw = b'<!doctype html><input id="vae-bundle" type="file" multiple><input id="text-bundle" type="file" multiple><input id="text-source" type="file"><script type="module" src="/owner-normal/owner-normal-browser.mjs"></script>'
                        kind = 'text/html'
                    elif requested == '/favicon.ico':
                        self.send_response(204)
                        self.end_headers()
                        return
                    elif requested.startswith('/owner-normal/'):
                        name = requested.removeprefix('/owner-normal/')
                        if name not in ('owner-normal-browser.mjs', 'owner-normal-worker.mjs'):
                            self.send_error(404)
                            return
                        raw, kind = source_bytes(HERE / name), 'text/javascript'
                    elif requested.startswith('/references/') and requested.removeprefix('/references/') in reference_paths:
                        raw = reference_paths[requested.removeprefix('/references/')].read_bytes()
                        kind = 'application/octet-stream'
                    elif requested.startswith('/shared/'):
                        path = (ROOT / 'docs' / requested.lstrip('/')).resolve()
                        if not path.is_relative_to(ROOT / 'docs/shared') or path.suffix not in ('.mjs', '.wasm'):
                            self.send_error(404)
                            return
                        raw = source_bytes(path)
                        kind = 'application/wasm' if path.suffix == '.wasm' else 'text/javascript'
                    else:
                        self.send_error(404)
                        return
                    self.send_response(200)
                    self.send_header('Content-Type', kind)
                    self.send_header('Content-Length', str(len(raw)))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(raw)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                except Exception as error:
                    report['serverErrors'].append(str(error))
                    self.send_error(500, str(error))

        owner = ProcessOwnership().start()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright, ExitStack() as monitor_cleanup:
            browser = playwright.chromium.launch(executable_path=args.browser, headless=True,
                                                 args=['--no-sandbox', '--disable-dev-shm-usage'])
            report['browserVersion'] = browser.version
            cdp = browser.new_browser_cdp_session()
            browser_pid = next(int(record['id']) for record in cdp.send('SystemInfo.getProcessInfo')['processInfo'] if record['type'] == 'browser')
            cdp.detach()
            sampler = ProcessSampler(browser_pid)
            sampler.start()
            monitor_cleanup.callback(sampler.stop)  # Runs before Playwright closes the browser on exceptions.
            context = browser.new_context(accept_downloads=True, service_workers='block')

            def route(request_route):
                request = request_route.request
                record = {'method': request.method, 'url': request.url}
                report['httpRequests'].append(record)
                if request.method == 'GET' and request.url.startswith(origin + '/'):
                    request_route.continue_()
                else:
                    report['blockedRequests'].append(record)
                    request_route.abort()

            context.route('**/*', route)
            page = context.new_page()
            page.set_default_timeout(args.timeout_seconds * 1000)
            page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            page.on('requestfailed', lambda request: report['requestFailures'].append({'url': request.url, 'failure': request.failure}))
            page.on('response', lambda response: report['httpErrors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)

            def console(message):
                if message.type == 'error':
                    report['consoleErrors'].append(message.text)
                if message.text.startswith('owner-normal-progress:'):
                    event = json.loads(message.text.removeprefix('owner-normal-progress:'))
                    report['progress'].append(event)
                    sampler.phase = event['phase']
                    print(json.dumps(event), flush=True)

            page.on('console', console)
            page.goto(origin + '/', wait_until='networkidle')
            page.wait_for_function('typeof runOwnerNormal === "function"')
            page.set_input_files('#vae-bundle', [str(path) for path in vae_selected])
            page.set_input_files('#text-bundle', [str(path) for path in text_selected])
            page.set_input_files('#text-source', str(args.text_source))
            spec = {'plainInput': plain_input, 'rectInputSha256': '46305e1cecc1c97a6d90bde022d5495cde6537c8e17a6e4d905dd3ba25a1a34a',
                    'vaeGate': {'atol': 2e-5, 'rtol': 2e-5, 'maxAbs': 2e-5},
                    'textGate': {'atol': .001, 'rtol': .001, 'maxAbs': .001}}
            if args.preflight_only:
                sampler.phase = 'preflight-configure-capabilities'
                report['native'] = page.evaluate('''async () => {
                    const {createInferenceAPI}=await import('/shared/inference/api.mjs');
                    const check=(ok,message)=>{if(!ok)throw Error(message);};
                    const read=async selector=>{
                        const files=new Map(Array.from(document.querySelector(selector).files,file=>[file.name,file]));
                        return {manifest:JSON.parse(await files.get('manifest.json').text()),files};
                    };
                    let workersCreated=0;
                    const api=createInferenceAPI({workerFactory:()=>{workersCreated++;throw Error('Preflight must not dispatch a Worker');}});
                    const result={passed:false,newNeuralRuns:0};
                    try {
                        const vae=await read('#vae-bundle'),text=await read('#text-bundle');
                        const source=document.querySelector('#text-source').files[0];
                        check(source instanceof File&&source.size===text.manifest.modelBytes,'Selected original Text File binding');
                        text.files.set(text.manifest.embedding.sourceFile,source);
                        result.vaeConfigured=api.vae.configure(vae);
                        const input={dtype:'float32',layout:'NCTHW',shape:[...vae.manifest.profile.videoShape],meaning:'rgb-unit'};
                        result.vae=api.vae.capabilities({operation:'encode',input});
                        check(result.vae.support?.supported===true,'Configured Rect descriptor support');
                        check(result.vae.runtime?.encode?.verified===false&&result.vae.runtime?.decode?.verified===false,'No graph execution verification during preflight');
                        result.unsupported81=api.vae.capabilities({operation:'encode',input:{...input,shape:[1,3,81,480,832]}});
                        check(result.unsupported81.support?.supported===false,'Unsupported81 descriptor rejection');
                        result.textConfigured=api.textEncoder.configure(text);
                        result.text=api.textEncoder.capabilities({operation:'encode',input:{text:'Hello world'}});
                        check(result.text.support?.supported===true,'Configured plain Text support');
                        check(result.text.output.normalization==='umt5-final-rmsnorm-f32-v1','Text marker declaration');
                        check(workersCreated===0,'No preflight Worker creation');
                        result.selectedFiles={vae:vae.files.size,text:text.files.size,textSourceBytes:source.size};
                        result.passed=true;
                    } finally {api.dispose();result.workersCreated=workersCreated;result.disposedState=api.state;}
                    check(result.disposedState.status==='disposed','Preflight owner disposal');
                    return result;
                }''')
                report['newNeuralRuns'] = 0
            else:
                downloads = []
                page.on('download', lambda download: downloads.append(download))
                report['native'] = page.evaluate('spec=>runOwnerNormal(spec)', spec)
                if not report['native']['passed']:
                    raise AssertionError(report['native'].get('error'))
                deadline = time.monotonic() + 5
                while not downloads and time.monotonic() < deadline:
                    page.wait_for_timeout(50)
                if len(downloads) != 1:
                    raise AssertionError('Exactly one normal Text conditioning download required')
                output = args.output / 'normal-conditioning.wktensor'
                downloads[0].save_as(str(output))
                meta, values = unpack_tensor(output.read_bytes())
                import numpy as np
                reference = np.fromfile(reference_paths['plain-reference.f32'], dtype='<f4').reshape(1, 512, 4096)
                report['savedTextComparison'] = compare_values(values, reference, np.array(plain_input['attentionMask'], dtype=np.uint8))
                if (not report['savedTextComparison']['passed'] or meta.get('normalization') != 'umt5-final-rmsnorm-f32-v1'
                        or meta.get('modelSha256') != text_manifest['modelSha256'] or meta.get('tokenizerSha256') != text_manifest['tokenizer']['sha256']
                        or meta.get('attentionMask') != plain_input['attentionMask']):
                    raise AssertionError('Saved Text payload/marker/model/Tokenizer/mask mismatch')
                report['savedText'] = {'file': output.name, 'bytes': output.stat().st_size, 'sha256': sha(output), 'metadata': meta}
            if not report['native']['passed']:
                raise AssertionError(report['native'].get('error'))
            report['passed'] = True
            sampler.stop()
            context.close()
            context = None
            browser.close()
            browser = None
    except Exception as error:
        report['failure'] = {'name': type(error).__name__, 'message': str(error), 'traceback': traceback.format_exc()}
        report['passed'] = False
    finally:
        if sampler is not None:
            sampler.stop()
        if context is not None:
            try:
                context.close()
            except Exception as error:
                report.setdefault('closeErrors', []).append(str(error))
        if browser is not None:
            try:
                browser.close()
            except Exception as error:
                report.setdefault('closeErrors', []).append(str(error))
        if server is not None:
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=5)
            report['localServerClosed'] = not server_thread.is_alive()
        if owner is not None:
            report['processOwnership'] = cleanup = owner.finish(timeout_seconds=5)
            if not cleanup_complete(cleanup['liveAfterClose'], cleanup['zombiesAfterClose'], cleanup['errors']):
                report['passed'] = False
        if sampler is not None:
            resources = sampler.report()
            live, zombies = sampler.remaining()
            resources.update(liveAfterClose=live, zombiesAfterClose=zombies,
                             wallSeconds=time.monotonic() - started,
                             scope='100ms sampled RSS/PSS of the owned browser tree; RSS sums may count shared pages more than once; not an exact device peak')
            write_json(args.output / 'resource-measurements.json', resources)
            report['resources'] = {key: resources[key] for key in ('intervalSeconds', 'phases', 'liveAfterClose', 'zombiesAfterClose', 'wallSeconds', 'scope')}
            if live or zombies or resources['errors']:
                report['passed'] = False
        if any(report.get(name) for name in ('pageErrors', 'consoleErrors', 'blockedRequests', 'httpErrors', 'requestFailures', 'serverErrors', 'closeErrors')):
            report['passed'] = False
        if server is not None and not report.get('localServerClosed'):
            report['passed'] = False
        report['servedSources'] = [{key: value for key, value in record.items() if key != '_stamp'} for record in served.values()]
        report['wallSeconds'] = time.monotonic() - started
        write_json(args.output / 'browser-results.json', report)
    print(json.dumps({'passed': report['passed'], 'failure': report.get('failure'), 'output': str(args.output),
                      'savedTextComparison': report.get('savedTextComparison'), 'wallSeconds': report['wallSeconds'],
                      **({'newNeuralRuns': 0} if args.preflight_only else {})}, ensure_ascii=False), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
