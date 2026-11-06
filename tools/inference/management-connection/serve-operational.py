#!/usr/bin/env python3
"""Loopback host for the ordinary Text/VAE operator candidate.

Serves public code and explicit saved inputs. Models/graphs remain browser File
selections: the host lists their paths/sizes for the validating Codex but never
serves, copies, exports or hashes their payloads.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
MANAGER = 'e1661e561dfb1a4f20544ff48bc375175b5981d1'
TEXT_MANIFEST = 'development/inference/management-20261104/text/source-ordered-fp32/manifest.json'
TEXT_SHA = '420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405'
PUBLIC_TYPES = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json'}
FIXTURES = [
    ('text-long-l512', '保持済み実Text L512出力', 'text_hidden_states', 'development/inference/management-20261104/text/plain-long-accepted/plain-long-eos512.wktensor'),
    ('vae-rect-mean', '保持済みVAE posterior mean・Rect', 'raw-posterior-mean', 'development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/restored-mean/native.wktensor'),
    ('vae-rgb', '保持済みRGB tensor・Rect', 'raw-decoder-rgb', 'development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/received-rgb/native.wktensor'),
    ('normalized-mean', '保持済みnormalized mean（復元はDiffusion所有）', 'wan21-normalized-posterior-mean:v1', 'development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/normalized-mean/native.wktensor'),
]
REAL_RAW_HASHES = {
    'c9fb6541b92ff5ea3b81b4decd4b29073aace11b5b9794810d826b34e5be7dd4',
    'cf7ef51123233101efc0191bfd48338008cfae703c828d3ba4fc684d27521c2d',
}


def git_bytes(root, sha, path):
    try:
        return subprocess.check_output(['git', 'show', sha + ':' + path], cwd=root, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as error:
        raise FileNotFoundError(path) from error


def relative_path(value):
    p = PurePosixPath(value)
    if not value or p.is_absolute() or '..' in p.parts or '.' in p.parts or p.as_posix() != value or '\\' in value or '\0' in value:
        raise FileNotFoundError(value)
    return p


def bound_asset(bundle, record, *, original=None):
    name = record.get('path', record.get('file'))
    relative_path(name)
    path = Path(original).resolve() if original else (Path(bundle) / name).resolve()
    if not original and not path.is_relative_to(Path(bundle).resolve()):
        raise ValueError('Asset outside selected bundle: ' + name)
    size = path.stat().st_size
    if size != record['bytes']:
        raise ValueError('Asset size mismatch: ' + name)
    return {'path': name, 'localPath': str(path), 'bytes': size, 'declaredSha256': record.get('sha256'), 'payloadHashed': False, 'role': 'source' if original else 'prepared'}


class CandidateSite:
    def __init__(self, root, *, source_sha=None, text_bundle=None, text_source=None, vae_bundle=None, raw_sample=None):
        self.root, self.source_sha = Path(root).resolve(), source_sha
        if source_sha is not None and not re.fullmatch('[0-9a-f]{40}', source_sha):
            raise ValueError('Full --source-sha required')
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=self.root, text=True).strip()
        self.text_bytes = self.repo(TEXT_MANIFEST)
        if hashlib.sha256(self.text_bytes).hexdigest() != TEXT_SHA:
            raise ValueError('Corrected Text manifest identity differs')
        self.vae_bytes = None
        self.inputs = {}
        self.config = {
            'apiVersion': 'works-ai-1',
            'sourceRef': {'repository': 'Kushyameln01/kushyameln-works', 'commit': source_sha or head, 'path': 'docs/shared/inference/api.mjs'},
            'workingTreeSource': source_sha is None,
            'managementCommit': MANAGER,
            'textManifestUrl': '/assets/text-manifest.json', 'textManifestSha256': TEXT_SHA,
            'retainedAssets': {'text': [], 'vae': []}, 'fixtures': [],
            'realRawSampleAvailable': False, 'generationReady': False,
        }
        if text_bundle:
            if not text_source:
                raise ValueError('--text-source is required with --text-bundle')
            manifest = json.loads(self.text_bytes)
            selected = [*manifest['blocks'], manifest['finalNorm'], manifest['embedding']['rowHashes'], manifest['tokenizer']]
            self.config['retainedAssets']['text'] = [bound_asset(text_bundle, record) for record in selected]
            embedding = manifest['embedding']
            self.config['retainedAssets']['text'].append(bound_asset(text_bundle, {'path': embedding['sourceFile'], 'bytes': embedding['sourceBytes'], 'sha256': manifest['modelSha256']}, original=text_source))
        if vae_bundle:
            self.vae_bytes = (Path(vae_bundle) / 'manifest.json').read_bytes()
            manifest = json.loads(self.vae_bytes)
            self.config['retainedAssets']['vae'] = [bound_asset(vae_bundle, record) for record in manifest['assets'].values()]
            self.config['vaeManifestUrl'] = '/assets/vae-manifest.json'
        for name, label, kind, path in FIXTURES:
            if (self.root / path).is_file():
                self.add_input(name, label, kind, self.root / path, repository_path=path)
        if raw_sample:
            raw = Path(raw_sample).resolve()
            digest = hashlib.sha256(raw.read_bytes()).hexdigest()
            known = digest in REAL_RAW_HASHES
            self.add_input('received-raw', 'Diffusion保持済み実raw sample' if known else '持込tensor（来歴は原本に保持）', 'raw-generated-sample' if known else 'caller-supplied-tensor', raw)
            self.config['realRawSampleAvailable'] = known
        if source_sha:
            for path in ['docs/inference-owner/index.html', 'docs/inference-owner/app.mjs', 'docs/shared/inference/operational-owner.mjs']:
                self.repo(path)

    def add_input(self, name, label, kind, path, *, repository_path=None):
        body = self.repo(repository_path) if repository_path and self.source_sha else path.read_bytes()
        self.inputs[name] = (path, repository_path)
        self.config['fixtures'].append({'id': name, 'label': label, 'kind': kind, 'url': '/fixtures/' + name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'repositoryPath': repository_path})

    def repo(self, path, *, manager=False):
        relative_path(path)
        if manager or self.source_sha:
            return git_bytes(self.root, MANAGER if manager else self.source_sha, path)
        resolved = (self.root / path).resolve()
        if not resolved.is_relative_to(self.root):
            raise FileNotFoundError(path)
        return resolved.read_bytes()

    def content(self, requested):
        path = unquote(urlsplit(requested).path)
        if '\\' in path or '\0' in path or '..' in path.split('/'):
            raise FileNotFoundError(path)
        if path == '/candidate-config.json':
            return json.dumps(self.config, ensure_ascii=False).encode(), 'application/json; charset=utf-8'
        if path == '/assets/text-manifest.json':
            return self.text_bytes, 'application/json'
        if path == '/assets/vae-manifest.json' and self.vae_bytes:
            return self.vae_bytes, 'application/json'
        if path == '/works-style.css':
            return self.repo('docs/style.css'), 'text/css'
        if path == '/favicon.svg':
            return self.repo('docs/favicon.svg'), 'image/svg+xml'
        if path.startswith('/fixtures/'):
            selected = self.inputs.get(path[len('/fixtures/'):])
            if not selected:
                raise FileNotFoundError(path)
            local, repository_path = selected
            body = self.repo(repository_path) if repository_path and self.source_sha else local.read_bytes()
            return body, 'application/octet-stream'
        route = {'/': 'index.html', '/index.html': 'index.html', '/app.mjs': 'app.mjs', '/style.css': 'style.css'}.get(path)
        if route:
            return self.repo('docs/inference-owner/' + route), PUBLIC_TYPES[Path(route).suffix]
        manager = path.startswith('/manager/docs/shared/')
        if manager:
            relative = path[len('/manager/'):]
        elif path.startswith('/shared/'):
            relative = 'docs' + path
        else:
            raise FileNotFoundError(path)
        relative_path(relative)
        suffix = Path(relative).suffix
        if suffix not in PUBLIC_TYPES:
            raise FileNotFoundError(path)
        return self.repo(relative, manager=manager), PUBLIC_TYPES[suffix]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--source-sha', help='Immutable commit; public code is read directly from Git')
    parser.add_argument('--text-bundle', type=Path)
    parser.add_argument('--text-source', type=Path)
    parser.add_argument('--vae-bundle', type=Path)
    parser.add_argument('--raw-sample', type=Path, help='Existing restored raw WKT; never generates/restores a sample')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--state-file', type=Path, help='Write URL/PID/config for the validating Codex')
    args = parser.parse_args()
    if args.source_sha:
        local = Path(__file__).resolve().read_bytes()
        fixed = git_bytes(args.root, args.source_sha, Path(__file__).resolve().relative_to(args.root.resolve()).as_posix())
        if local != fixed:
            raise ValueError('Host bytes differ from --source-sha')
    # Ensure the fixed management source is acquired, without downloading models.
    git_bytes(args.root, MANAGER, 'docs/shared/ai-connection/adapters/text-vae.mjs')
    site = CandidateSite(args.root, source_sha=args.source_sha, text_bundle=args.text_bundle, text_source=args.text_source, vae_bundle=args.vae_bundle, raw_sample=args.raw_sample)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            try:
                body, mime = site.content(self.path)
            except (FileNotFoundError, ValueError):
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, format, *values):
            if values and str(values[1] if len(values) > 1 else '').startswith(('4', '5')):
                super().log_message(format, *values)

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    state = {'pid': os.getpid(), 'url': 'http://127.0.0.1:' + str(server.server_port), 'sourceSha': args.source_sha, 'config': site.config, 'scope': 'Unpublished operational candidate; models remain local File grants'}
    if args.state_file:
        args.state_file.parent.mkdir(parents=True, exist_ok=True)
        args.state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'pid': state['pid'], 'url': state['url'], 'sourceSha': args.source_sha, 'realRawSampleAvailable': site.config['realRawSampleAvailable']}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
