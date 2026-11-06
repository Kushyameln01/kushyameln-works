"""Opt-in bounded public-ORT diagnostic. Do not run until the original trial ends."""
import argparse
import base64
import datetime
import hashlib
import http.server
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'tools/diffusion-models/'
SOURCE_PATHS = [PREFIX + name for name in [
    'resident-ort-attention-timing.py', 'resident-ort-attention-timing-core.mjs',
    'resident-ort-attention-timing-factory.mjs', 'resident-ort-attention-timing-browser.mjs',
]] + ['docs/shared/diffusion-models/execution/batched-attention-graph.mjs',
      'docs/shared/diffusion-models/execution/wasm-memory-observer.mjs',
      'docs/shared/inference/vendor/ort.wasm.min.mjs',
      'docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs',
      'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm']
PINNED = {
    'docs/shared/inference/vendor/ort.wasm.min.mjs': 'd5a6d7bc8ee587648fb3742dde8c0094d17cbd3822a68bbec8ddfcd4f2adb88e',
    'docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs': '5687566b1bc1c8cf628d76c2ddb16b2a3b81a7997273d4666564880495088e57',
    'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm': 'be0e129949062ad50290ef94683fac8be5bb6156f709e030b7a5f1661a2f6c17',
}

def capture_sources(root=ROOT):
    snapshot = {name: (root / name).read_bytes() for name in SOURCE_PATHS}
    for name, expected in PINNED.items():
        if hashlib.sha256(snapshot[name]).hexdigest() != expected:
            raise ValueError('Pinned vendor hash mismatch: ' + name)
    return snapshot

def compare_case_outputs(baseline, wrapped):
    left, right = baseline['outputs'], wrapped['outputs']
    if not left or len(left) != len(right):
        raise ValueError('Output tile count mismatch')
    comparisons = []
    for a, b in zip(left, right):
        for key in ['kind', 'index', 'keyStart', 'inputSHA256']:
            if a[key] != b[key]:
                raise ValueError('Baseline/wrapped fixture/order mismatch: ' + key)
        if set(a['values']) != {'max', 'denominator', 'context'} or set(b['values']) != set(a['values']):
            raise ValueError('Unexpected output names')
        for name in ['max', 'denominator', 'context']:
            decoded = []
            for record in [a['values'][name], b['values'][name]]:
                raw = base64.b64decode(record['base64'], validate=True)
                if len(raw) != record['bytes'] or hashlib.sha256(raw).hexdigest() != record['sha256']:
                    raise ValueError('Output transport length/digest mismatch')
                decoded.append(raw)
            x, y = decoded
            first = next((i for i, (xx, yy) in enumerate(zip(x, y)) if xx != yy), None)
            if first is None and len(x) != len(y):
                first = min(len(x), len(y))
            comparisons.append({'kind': a['kind'], 'index': a['index'], 'keyStart': a['keyStart'],
                                'output': name, 'equal': x == y, 'firstMismatchByte': first,
                                'expectedBytes': len(x), 'actualBytes': len(y),
                                'bytesCompared': min(len(x), len(y)) if first is None else min(first + 1, len(x), len(y))})
    return {'equal': all(x['equal'] for x in comparisons),
            'bytesCompared': sum(x['bytesCompared'] for x in comparisons),
            'method': 'Direct decoded byte equality for every F32 output, including warmup; SHA-256 also validates transport.',
            'comparisons': comparisons}

def write_new_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')

def run_browser_child(args):
    # Deliberately lazy: admission/unit/static work never imports Playwright.
    from playwright.sync_api import sync_playwright
    result = None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True,
                                             args=['--disable-dev-shm-usage'])
        try:
            page = browser.new_page()
            page.goto(args.url, timeout=30000)
            result = page.evaluate('''async options => {
                try { return await (await import('/tools/diffusion-models/resident-ort-attention-timing-browser.mjs')).runTimingCase(options); }
                catch (error) { return {passed:false, error:String(error.stack || error)}; }
            }''', {'threads': args.threads, 'tiles': args.tiles, 'mode': args.internal_case})
            result['chromiumVersion'] = browser.version
        finally:
            browser.close()
    result['browserProcessCloseReturned'] = True
    print(json.dumps(result, separators=(',', ':')))
    return 0

def bounded_case(args, url, mode):
    command = [sys.executable, str(Path(__file__).resolve()), '--execute-after-original-trial',
               '--threads', str(args.threads), '--tiles', str(args.tiles), '--internal-case', mode,
               '--url', url, '--chromium', args.chromium]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=120)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            stdout, stderr = process.communicate()
        return {'mode': mode, 'passed': False, 'timeoutSeconds': 120,
                'processGroupSignalsSent': True, 'browserCloseUnconfirmed': True,
                'stderrTail': stderr[-4000:]}
    if process.returncode:
        return {'mode': mode, 'passed': False, 'exitCode': process.returncode,
                'stderrTail': stderr[-4000:]}
    result = json.loads(stdout)
    result['childExitCode'] = process.returncode
    result['stderrTail'] = stderr[-4000:]
    return result

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--threads', type=int, choices=[1, 4], required=True)
    parser.add_argument('--tiles', type=int, default=3)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--execute-after-original-trial', action='store_true',
                        help='Explicitly acknowledge the original long trial has ended before native work.')
    parser.add_argument('--internal-case', choices=['baseline', 'wrapped'], help=argparse.SUPPRESS)
    parser.add_argument('--url', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if not args.execute_after_original_trial:
        parser.error('Native/browser execution disabled: wait for original trial termination and explicitly pass --execute-after-original-trial')
    if not 1 <= args.tiles <= 4:
        parser.error('--tiles must be 1..4 (plus exactly one warmup tile)')
    if args.internal_case:
        if not args.url:
            parser.error('Internal case requires URL')
        return run_browser_child(args)
    if args.output is None:
        parser.error('--output is required')
    if args.output.exists():
        raise FileExistsError(args.output)
    snapshot = capture_sources()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass
        def do_GET(self):
            path = self.path.split('?', 1)[0]
            if path in ['/plain', '/isolated']:
                body, mime = b'<!doctype html><meta charset="utf-8"><title>Bounded ORT diagnostic</title>', 'text/html'
            elif path.startswith('/') and path[1:] in snapshot:
                body = snapshot[path[1:]]
                mime = 'application/wasm' if path.endswith('.wasm') else 'text/javascript'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            if path != '/plain':
                self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
                self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
                self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            self.end_headers()
            self.wfile.write(body)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        endpoint = '/plain' if args.threads == 1 else '/isolated'
        url = f'http://127.0.0.1:{server.server_port}{endpoint}'
        for mode in ['baseline', 'wrapped']:
            results.append(bounded_case(args, url, mode))
            if not results[-1].get('passed'):
                break
    finally:
        server.shutdown()
        server.server_close()
    unchanged = all((ROOT / name).read_bytes() == value for name, value in snapshot.items())
    comparison = None
    comparison_error = None
    if len(results) == 2 and all(x.get('passed') for x in results):
        try:
            if any(len(x['outputs']) != args.tiles + 1 for x in results):
                raise ValueError('Expected one warmup output plus every measured tile')
            comparison = compare_case_outputs(*results)
            if results[0]['graphSHA256'] != results[1]['graphSHA256']:
                raise ValueError('Built graph bytes differ')
        except (KeyError, ValueError) as error:
            comparison_error = str(error)
    for case in results:
        for output in case.get('outputs', []):
            for value in output['values'].values():
                value.pop('base64', None)
    report = {'schemaVersion': 'resident-ort-attention-timing/1',
              'recordedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'sourceSHA256': {name: hashlib.sha256(value).hexdigest() for name, value in snapshot.items()},
              'sourceBytes': {name: len(value) for name, value in snapshot.items()},
              'sourcesServedFromCapturedBytes': True, 'sourceBytesUnchangedDuringRun': unchanged,
              'scope': 'Bounded synthetic public ORT attention operator diagnostic only; no model weights, original shape, resident K/V implementation, speedup or production acceptance.',
              'acceptedProduction': False, 'speedupClaim': False, 'modelPayloadBytesRead': 0,
              'threadsRequested': args.threads, 'casesRunSequentiallyInFreshBrowserProcesses': True,
              'baseline': 'Same pinned vendor and existing canonical graph, trace capture enabled, original factory URL; no native wrapper.',
              'wrapped': 'Same graph/vendor/fixtures/profile, one factory call returns identical module object; transparent synchronous _OrtRun wrapper.',
              'comparison': comparison, 'comparisonError': comparison_error, 'results': results,
              'passed': bool(unchanged and comparison and comparison['equal'] and not comparison_error)}
    write_new_report(args.output, report)
    print(json.dumps({'passed': report['passed'], 'output': str(args.output), 'cases': len(results)}))
    return 0 if report['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
