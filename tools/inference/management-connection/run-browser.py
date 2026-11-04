#!/usr/bin/env python3
"""Actual fixed management source -> native browser API -> durable workspace.

No export, oracle generation, full generation or LoRA operation. Independent
references and gates below are development checks, never normal API inputs.
"""
import argparse
import copy
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'vae'))
from process_lifecycle import ProcessOwnership, cleanup_complete
from accept_still import ProcessSampler

MANAGER = 'e1661e561dfb1a4f20544ff48bc375175b5981d1'
DIFFUSION = 'ffeeeedb6b57d182a977c3ac02c042ce235fc87a'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def validate_text_manifest_mapping(*, selected_raw, original_raw, plain, oracle):
    """Bind a runtime graph selection to unchanged independent oracle records.

    Only block attentionLowering may be added. No original input/manifest/gate
    or oracle file is rewritten to make the selected runtime look identical.
    """
    selected, original = json.loads(selected_raw), json.loads(original_raw)
    original_sha, selected_sha = digest(original_raw), digest(selected_raw)
    if plain['manifestSha256'] != original_sha:
        raise ValueError('Independent input does not bind the original manifest SHA')
    stripped = copy.deepcopy(selected)
    added = []
    for index, block in enumerate(stripped['blocks']):
        if 'attentionLowering' in block:
            added.append(index)
            del block['attentionLowering']
    if stripped != original:
        raise ValueError('Only added blocks[*].attentionLowering may differ from the original manifest')
    if not oracle.get('passed') or oracle.get('oracleUsesOnnxOrHike') is not False:
        raise ValueError('A passed independent oracle is required for development comparison')
    if oracle.get('input') != plain:
        raise ValueError('Development comparison must keep the unchanged oracle input record')
    if plain.get('oracleUsesFull512Positions') is not True or plain.get('text') != 'Hello world':
        raise ValueError('Existing independent all-position Hello world input required')
    if (plain['modelSha256'] != selected['modelSha256'] or
            plain['tokenizerSha256'] != selected['tokenizer']['sha256'] or
            selected['modelSha256'] != original['modelSha256'] or
            selected['tokenizer'] != original['tokenizer']):
        raise ValueError('Selected model and Tokenizer must equal the original independent binding')
    if selected['numericGate'] != original['numericGate'] or selected['numericGate'] != oracle.get('gate'):
        raise ValueError('Selected, original and independent comparison gate must remain identical')
    if oracle.get('manifest', {}).get('sha256') != original_sha:
        raise ValueError('Independent oracle does not identify the original manifest')
    gate = selected['numericGate']
    if gate.get('maxAbsError') != .001 or gate.get('rtol') != .001 or gate.get('registeredBeforeComparison') is not True:
        raise ValueError('Original predeclared Text numeric gate required')
    return {'originalSha256': original_sha, 'selectedSha256': selected_sha,
            'onlyAddedBlockAttentionLowering': True, 'addedAttentionLoweringBlocks': added,
            'modelSha256': selected['modelSha256'], 'tokenizerSha256': selected['tokenizer']['sha256'],
            'gate': copy.deepcopy(gate), 'originalInputUnchanged': True,
            'independentReferenceUnchanged': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', choices=('rect', 'text', 'both'), default='rect')
    for name in ('sources-root', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--execution-source-sha', required=True)
    for name in ('vae-bundle', 'generated-input', 'text-bundle', 'text-source', 'text-reference', 'text-original-manifest'):
        parser.add_argument('--' + name, type=Path)
    parser.add_argument('--text-cancel-stage', choices=('sdpa-execution-graph-hash',),
                        help='Observe native execution-graph hash progress, cancel, then recover with the selected plain run')
    parser.add_argument('--browser', default=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium'))
    parser.add_argument('--timeout-seconds', type=int, default=1800)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    for name, value in vars(args).items():
        if isinstance(value, Path):
            setattr(args, name, value.resolve())
    if not args.browser or args.output.exists() or args.output.is_relative_to(ROOT / 'docs'):
        raise ValueError('Existing Chromium and fresh private output required')
    args.output.mkdir(parents=True)
    started = time.monotonic()
    report = {'passed': False, 'scope': args.scope, 'executionSourceSha': args.execution_source_sha,
              'managementSourceSha': MANAGER, 'diffusionSourceSha': DIFFUSION,
              'preflightOnly': args.preflight_only, 'newExports': 0, 'newOracleRuns': 0,
              'generatedProductionAccepted': False, 'generationReady': False,
              'servedSources': [], 'progress': [], 'httpErrors': [], 'pageErrors': [],
              'consoleErrors': [], 'blockedRequests': [], 'downloads': []}
    server = thread = owner = sampler = browser = context = None
    served = {}
    try:
        fixed_sources = {}
        for module, commit in [('management', MANAGER), ('diffusion', DIFFUSION)]:
            root = args.sources_root / module
            receipt = json.loads((root / 'ACQUISITION.json').read_text())
            if receipt['commit'] != commit:
                raise ValueError('Wrong fixed source: ' + module)
            for record in receipt['files']:
                fixed_sources[(module, record['path'])] = record
            report.setdefault('sourceAcquisition', {})[module] = receipt

        inputs = {}
        vae_selected = text_selected = []
        spec = {'scope': args.scope, 'executionSourceSha': args.execution_source_sha,
                'managementSourceSha': MANAGER, 'diffusionSourceSha': DIFFUSION,
                'preflightOnly': args.preflight_only,
                'vaeGate': {'atol': 2e-5, 'rtol': 2e-5, 'maxAbs': 2e-5},
                'textGate': {'atol': .001, 'rtol': .001, 'maxAbs': .001}}
        if args.scope in ('rect', 'both'):
            if not args.vae_bundle or not args.generated_input:
                raise ValueError('Rect requires --vae-bundle and --generated-input')
            manifest = json.loads((args.vae_bundle / 'manifest.json').read_text())
            if manifest['profile']['videoShape'] != [1, 3, 1, 16, 32] or manifest['profile']['latentShape'] != [1, 16, 1, 2, 4]:
                raise ValueError('Existing exact Rect bundle required')
            vae_selected = [args.vae_bundle / 'manifest.json', *(args.vae_bundle / item['file'] for item in manifest['assets'].values())]
            for item in manifest['assets'].values():
                if (args.vae_bundle / item['file']).stat().st_size != item['bytes']:
                    raise ValueError('Rect asset size differs from manifest')
            inputs['generated.wktensor'] = args.generated_input
            inputs['mean.wktensor'] = ROOT / 'development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/restored-mean/native.wktensor'
            for name in ('png-unit', 'png-mean', 'png-roundtrip'):
                inputs[name + '.f32'] = ROOT / ('development/inference/e6/fixtures/' + name + '.f32')
        if args.scope in ('text', 'both'):
            if not all((args.text_bundle, args.text_source, args.text_reference)):
                raise ValueError('Text requires its local bundle/source and existing independent reference directory')
            manifest_raw = (args.text_bundle / 'manifest.json').read_bytes()
            manifest = json.loads(manifest_raw)
            plain = json.loads((args.text_reference / 'plain-input.json').read_text())
            oracle_raw = (args.text_reference / 'reference-results.json').read_bytes()
            oracle = json.loads(oracle_raw)
            original_path = args.text_original_manifest or args.text_bundle / 'manifest.json'
            mapping = validate_text_manifest_mapping(selected_raw=manifest_raw, original_raw=original_path.read_bytes(),
                                                     plain=plain, oracle=oracle)
            mapping['originalPath'] = str(original_path)
            mapping['selectedPath'] = str(args.text_bundle / 'manifest.json')
            mapping['oracleReportSha256'] = digest(oracle_raw)
            reference_path = args.text_reference / 'plain-reference.f32'
            reference_raw = reference_path.read_bytes()
            if len(reference_raw) != oracle['reference']['bytes'] or digest(reference_raw) != oracle['reference']['sha256']:
                raise ValueError('Unchanged independent Text reference bytes/SHA mismatch')
            mapping['reference'] = {'path': str(reference_path), 'bytes': len(reference_raw), 'sha256': digest(reference_raw)}
            if args.text_cancel_stage and not mapping['addedAttentionLoweringBlocks']:
                raise ValueError('Execution-hash cancellation needs a selected attentionLowering recipe')
            if args.text_source.stat().st_size != manifest['modelBytes']:
                raise ValueError('Text original model file size mismatch')
            spec['plainInput'] = plain
            spec['textManifestMapping'] = mapping
            spec['textCancelStage'] = args.text_cancel_stage
            report['textManifestMapping'] = mapping
            spec['textGate'] = {'atol': mapping['gate']['maxAbsError'], 'rtol': mapping['gate']['rtol'],
                                'maxAbs': mapping['gate']['maxAbsError']}
            inputs['plain-reference.f32'] = reference_path
            text_selected = [args.text_bundle / 'manifest.json', *(args.text_bundle / a['path'] for a in manifest['blocks']),
                             args.text_bundle / manifest['finalNorm']['path'], args.text_bundle / manifest['embedding']['rowHashes']['path'],
                             args.text_bundle / manifest['tokenizer']['path']]
        for path in [*inputs.values(), *vae_selected, *text_selected]:
            if not path.is_file():
                raise ValueError('Required existing input missing: ' + str(path))
        report['inputAcquisition'] = [{'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path.read_bytes())} for path in inputs.values()]

        def source_bytes(module, relative):
            if module == 'owner':
                path = ROOT / relative
                fixed = subprocess.check_output(['git', 'show', args.execution_source_sha + ':' + relative], cwd=ROOT)
            else:
                path = args.sources_root / module / relative
                item = fixed_sources.get((module, relative))
                if not item:
                    raise ValueError('Source not in acquired closure: ' + relative)
                fixed = subprocess.check_output(['git', 'show', (MANAGER if module == 'management' else DIFFUSION) + ':' + relative], cwd=ROOT)
            raw = path.read_bytes()
            if raw != fixed:
                raise ValueError('Executed source differs from fixed commit: ' + relative)
            served[(module, relative)] = {'module': module, 'path': relative, 'bytes': len(raw), 'sha256': digest(raw),
                                         'commit': args.execution_source_sha if module == 'owner' else MANAGER if module == 'management' else DIFFUSION}
            return raw

        for path in (Path(__file__), HERE / 'browser.mjs', ROOT / 'docs/shared/inference/management-adapter.mjs', HERE.parent / 'owner-normal-worker.mjs'):
            source_bytes('owner', path.relative_to(ROOT).as_posix())

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                try:
                    requested = unquote(urlsplit(self.path).path)
                    if '..' in requested.split('/'):
                        raise ValueError('Unsafe request path')
                    kind = 'text/javascript'
                    if requested == '/':
                        raw = b'<!doctype html><input id="vae-bundle" type="file" multiple><input id="text-bundle" type="file" multiple><input id="text-source" type="file"><script type="module" src="/tools/browser.mjs"></script>'
                        kind = 'text/html'
                    elif requested == '/favicon.ico':
                        self.send_response(204)
                        self.end_headers()
                        return
                    elif requested == '/tools/browser.mjs':
                        raw = source_bytes('owner', 'tools/inference/management-connection/browser.mjs')
                    elif requested == '/observer/owner-normal-worker.mjs':
                        raw = source_bytes('owner', 'tools/inference/owner-normal-worker.mjs')
                    elif requested.startswith('/shared/'):
                        raw = source_bytes('owner', 'docs' + requested)
                    elif requested.startswith('/manager/'):
                        raw = source_bytes('management', requested.removeprefix('/manager/'))
                    elif requested.startswith('/diffusion/'):
                        raw = source_bytes('diffusion', requested.removeprefix('/diffusion/'))
                    elif requested.startswith('/inputs/') and requested.removeprefix('/inputs/') in inputs:
                        raw = inputs[requested.removeprefix('/inputs/')].read_bytes()
                        kind = 'application/octet-stream'
                    else:
                        self.send_error(404)
                        return
                    if requested.endswith('.wasm'):
                        kind = 'application/wasm'
                    self.send_response(200)
                    self.send_header('Content-Type', kind)
                    self.send_header('Content-Length', str(len(raw)))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(raw)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                except Exception as exc:
                    report.setdefault('serverErrors', []).append(str(exc))
                    self.send_error(500, str(exc))

        owner = ProcessOwnership().start()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = 'http://127.0.0.1:' + str(server.server_port)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.browser, headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            cdp = browser.new_browser_cdp_session()
            browser_pid = next(int(p['id']) for p in cdp.send('SystemInfo.getProcessInfo')['processInfo'] if p['type'] == 'browser')
            cdp.detach()
            sampler = ProcessSampler(browser_pid)
            sampler.start()
            context = browser.new_context(accept_downloads=True, service_workers='block')

            def route(request):
                if request.request.method == 'GET' and request.request.url.startswith(origin + '/'):
                    request.continue_()
                else:
                    report['blockedRequests'].append(request.request.url)
                    request.abort()

            context.route('**/*', route)
            page = context.new_page()
            page.set_default_timeout(args.timeout_seconds * 1000)
            page.on('pageerror', lambda exc: report['pageErrors'].append(str(exc)))
            page.on('response', lambda response: report['httpErrors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)

            def console(message):
                if message.type == 'error':
                    report['consoleErrors'].append(message.text)
                if message.text.startswith('management-connection-progress:'):
                    event = json.loads(message.text.split(':', 1)[1])
                    report['progress'].append(event)
                    sampler.phase = event['phase']
                    print(json.dumps(event), flush=True)

            page.on('console', console)
            page.goto(origin + '/', wait_until='networkidle')
            page.wait_for_function('typeof runManagementConnection === "function"')
            if vae_selected:
                page.set_input_files('#vae-bundle', [str(p) for p in vae_selected])
            if text_selected:
                page.set_input_files('#text-bundle', [str(p) for p in text_selected])
                page.set_input_files('#text-source', str(args.text_source))
            downloads = []
            page.on('download', lambda download: downloads.append(download))
            report['native'] = page.evaluate('spec=>runManagementConnection(spec)', spec)
            if not report['native']['passed']:
                raise AssertionError(report['native'].get('failure'))
            expected_downloads = 0 if args.preflight_only else (6 if vae_selected else 0) + (4 if text_selected else 0)
            deadline = time.monotonic() + 5
            while len(downloads) < expected_downloads and time.monotonic() < deadline:
                page.wait_for_timeout(50)
            if len(downloads) != expected_downloads:
                raise AssertionError('Missing native tensor or management package downloads')
            for item in downloads:
                destination = args.output / item.suggested_filename
                item.save_as(str(destination))
                report['downloads'].append({'path': destination.name, 'bytes': destination.stat().st_size, 'sha256': digest(destination.read_bytes())})
            report['passed'] = True
            sampler.stop()
            context.close()
            context = None
            browser.close()
            browser = None
    except Exception as exc:
        report['failure'] = {'name': type(exc).__name__, 'message': str(exc), 'traceback': traceback.format_exc()}
    finally:
        if sampler:
            sampler.stop()
        for resource in (context, browser):
            if resource:
                try:
                    resource.close()
                except Exception as exc:
                    report.setdefault('closeErrors', []).append(str(exc))
        if server:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            report['serverClosed'] = not thread.is_alive()
        if owner:
            cleanup = owner.finish(timeout_seconds=5)
            report['processOwnership'] = cleanup
            if not cleanup_complete(cleanup['liveAfterClose'], cleanup['zombiesAfterClose'], cleanup['errors']):
                report['passed'] = False
        if sampler:
            report['resources'] = sampler.report()
            live, zombies = sampler.remaining()
            report['resources'].update(liveAfterClose=live, zombiesAfterClose=zombies)
            if live or zombies or report['resources']['errors']:
                report['passed'] = False
        if any(report.get(key) for key in ('httpErrors', 'pageErrors', 'consoleErrors', 'blockedRequests', 'serverErrors', 'closeErrors')):
            report['passed'] = False
        report['servedSources'] = list(served.values())
        report['wallSeconds'] = time.monotonic() - started
        (args.output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report.get(k) for k in ('passed', 'failure', 'scope', 'preflightOnly', 'wallSeconds')}, ensure_ascii=False), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
