#!/usr/bin/env python3
"""P2 Diffusion-owned Rect boundary through fixed manager code and real WASM.

No VAE graph is downloaded or run. The VAE's recorded real mean is fetched from
its fixed Git object; a Python struct-f32 oracle is fixed before browser work.
"""
import argparse, hashlib, http.server, json, struct, subprocess, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
VAE = '855f435120f08eb9e818e51281fc26f0e2633829'
MANAGER = '28596717182e48aeb23c719c51b6e593edf4e496'
SOURCE = 'development/inference/e6/fixtures/'
PROFILE = 'wan21-raw-f32-1x16x32'
sha = lambda b: hashlib.sha256(b).hexdigest()

def git(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)

def source_record(commit, path, data):
    return {'commit': commit, 'path': path, 'bytes': len(data), 'sha256': sha(data),
            'gitBlob': subprocess.check_output(['git', 'rev-parse', commit + ':' + path], cwd=ROOT, text=True).strip()}

def main():
    driver_sha256 = sha(Path(__file__).read_bytes())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--diffusion-commit', help='Baseline only: serve that immutable owner tree instead of the current tree')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    raw = git(VAE, SOURCE + 'png-mean.wktensor')
    manifest = git(VAE, SOURCE + 'bundle-manifest.json')
    assert raw[:8] == b'WKTSR001'
    size = struct.unpack('<I', raw[8:12])[0]
    header = json.loads(raw[12:12 + size]); payload = raw[12 + size:]
    assert header['shape'] == [1, 16, 1, 2, 4] and len(payload) == 512
    assert header['meaning'] == 'raw-posterior-mean' and sha(payload) == header['dataSha256']
    assert json.loads(manifest)['profile']['id'] == PROFILE
    # Reuse the existing real128 independent proof only when payload bytes agree.
    previous = json.loads((ROOT / 'development/ai-connection/e6/reference-received.json').read_text())
    old = next(r for r in previous['outputs'] if r['profile'] == PROFILE)
    values = list(struct.unpack('<128f', payload))
    assert values == old['raw']
    f32 = lambda x: struct.unpack('<f', struct.pack('<f', x))[0]
    means = list(map(f32, [-.7571, -.7089, -.9113, .1075, -.1745, .9653, -.1517, 1.5508, .4134, -.0715, .5517, -.3632, -.1922, -.9497, .2503, -.2921]))
    stds = list(map(f32, [2.8184, 1.4541, 2.3275, 2.6558, 1.2196, 1.7708, 2.6052, 2.0743, 3.2687, 2.1526, 2.8652, 1.5579, 1.6382, 1.1253, 2.8251, 1.916]))
    normalized = [f32(f32(f32(x - means[i // 8]) * f32(1)) / stds[i // 8]) for i, x in enumerate(values)]
    restored = [f32(f32(f32(x * stds[i // 8]) / f32(1)) + means[i // 8]) for i, x in enumerate(normalized)]
    assert normalized == old['normalized'] and restored == old['restored']
    assert sha(struct.pack('<128f', *normalized)) == old['normalizedSHA256']
    assert sha(struct.pack('<128f', *restored)) == old['restoredSHA256']
    reference = {'profileId': PROFILE, 'raw': values, 'normalized': normalized, 'restored': restored,
                 'roundTripMaxAbs': 2e-6, 'perValueGate': 'exact independent struct-f32',
                 'referenceReuse': 'same raw payload as the previous received real128 fixture',
                 'source': source_record(VAE, SOURCE + 'png-mean.wktensor', raw),
                 'manifest': source_record(VAE, SOURCE + 'bundle-manifest.json', manifest),
                 'rawPayloadSha256': sha(payload)}
    (out / 'reference.json').write_text(json.dumps(reference, indent=2) + '\n')
    records = []; cache = {}; requested = {}
    manager_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', MANAGER, 'docs/shared/ai-connection'], cwd=ROOT, text=True).splitlines()
    manager_paths = {p.removeprefix('docs/shared/ai-connection/'): p for p in manager_paths}

    def load(path):
        if path in cache: return cache[path]
        if path == '/p2': data = b'<!doctype html><meta charset="utf-8">'
        elif path == '/p2-cases.mjs': data = (ROOT / 'tools/diffusion-models/p2-rect-cases.mjs').read_bytes()
        elif path == '/fixture/mean.wktensor': data = raw
        elif path == '/peer-vae/tensor.mjs':
            p = 'docs/shared/inference/tensor.mjs'; data = git(VAE, p); records.append(source_record(VAE, p, data))
        elif path.startswith('/peer-manager/') and path[14:] in manager_paths:
            p = manager_paths[path[14:]]; data = git(MANAGER, p); records.append(source_record(MANAGER, p, data))
        elif path.startswith('/owner/shared/'):
            p = 'docs/shared/' + path.removeprefix('/owner/shared/')
            if not (p.startswith('docs/shared/diffusion-models/') or p in ['docs/shared/inference/tensor.mjs', 'docs/shared/vr180/sha256.mjs']): raise FileNotFoundError(path)
            if '..' in Path(p).parts: raise FileNotFoundError(path)
            data = git(args.diffusion_commit, p) if args.diffusion_commit else (ROOT / p).read_bytes()
        else: raise FileNotFoundError(path)
        cache[path] = data
        return data

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_GET(self):
            path = urlsplit(self.path).path
            try: data = load(path)
            except (FileNotFoundError, subprocess.CalledProcessError): self.send_error(404); return
            requested[path] = {'bytes': len(data), 'sha256': sha(data)}
            self.send_response(200)
            self.send_header('Content-Type', 'application/wasm' if path.endswith('.wasm') else 'text/javascript' if path.endswith('.mjs') else 'text/html' if path == '/p2' else 'application/octet-stream')
            self.end_headers(); self.wfile.write(data)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page(); errors = []; blocked = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                origin = 'http://127.0.0.1:' + str(server.server_port)
                def route(r):
                    if r.request.url.startswith(origin + '/'): r.continue_()
                    else: blocked.append(r.request.url); r.abort()
                page.route('**/*', route); page.goto(origin + '/p2')
                result = page.evaluate("""async reference => { try {
                    const m = await import('/p2-cases.mjs'); return await m.runP2Rect(reference);
                } catch(e) { return {passed:false,error:String(e.stack||e)}; }}""", reference)
                artifact_files = result.pop('packageFiles', [])
                import base64
                for record in artifact_files:
                    p = out / 'package' / record['path']; p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(base64.b64decode(record['base64'], validate=True))
                owner_base = args.diffusion_commit or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
                owner_deltas = []
                for path, rec in requested.items():
                    if not path.startswith('/owner/shared/'): continue
                    source_path = 'docs/shared/' + path.removeprefix('/owner/shared/')
                    try: original = git(owner_base, source_path)
                    except subprocess.CalledProcessError: owner_deltas.append(source_path); continue
                    if sha(original) != rec['sha256']: owner_deltas.append(source_path)
                report = {'browser': browser.version, 'pageErrors': errors, 'blockedRequests': blocked,
                          'scope': 'P2 Diffusion real Rect mean through explicit-input manager adapter/queue/capture/package and live Worker/Port; not P1 adoption/UI/VAE fresh decode',
                          'managerCommit': MANAGER, 'vaeCommit': VAE, 'diffusionBaselineCommit': args.diffusion_commit,
                          'diffusionSource': {'mode': 'fixed-git' if args.diffusion_commit else 'captured-worktree-bytes', 'baseCommit': owner_base, 'servedOwnerPathsDifferingFromBase': owner_deltas},
                          'harnessSourceSha256': {'driver': driver_sha256, 'cases': requested.get('/p2-cases.mjs', {}).get('sha256')},
                          'sourceRecords': records, 'actualServedBytes': requested, **result}
                (out / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
                receipt = {'schemaVersion': 1, 'owner': 'diffusion_models', 'candidateOnly': True,
                           'planVersion': '1.0-draft.1', 'referenceCatalogCommit': '6dae9a6fac3e9ad29ea941f22211edbe4aa894ad',
                           'passed': report.get('passed', False), 'profileId': PROFILE, 'values': 128,
                           'nativeBuildId': report.get('nativeBuildId'), 'diffusionSource': report['diffusionSource'],
                           'managerCommit': MANAGER, 'vaeCommit': VAE,
                           'cases': len(report.get('cases', [])), 'sourceMeanSha256': sha(raw), 'rawPayloadSha256': sha(payload),
                           'predeclaredGate': {'perValue': 'exact independent struct-f32', 'roundTripMaxAbs': 2e-6},
                           'maxRoundTripAbs': report.get('roundTripMaxAbs'),
                           'harnessSourceSha256': report['harnessSourceSha256'], 'cleanup': report.get('cleanup'),
                           'scope': report['scope'], 'managerCatalogRuntimeAdoption': False, 'managerUIAccepted': False,
                           'vaeFreshDecodeExecuted': False, 'generatedSampleAccepted': False}
                (out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
                print(json.dumps({'passed': report.get('passed'), 'error': report.get('error'), 'cases': len(report.get('cases', [])), 'output': str(out)}))
                assert report.get('passed') and not errors and not blocked
            finally: browser.close()
    finally: server.shutdown(); server.server_close()

if __name__ == '__main__': main()
