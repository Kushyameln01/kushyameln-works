#!/usr/bin/env python3
"""Fetch the adopted management checkout and serve its existing operation UI."""
import argparse
import functools
import http.server
import pathlib
import subprocess
import sys
import urllib.parse

MANAGEMENT_SHA = '2b26ee70e9e1925622a59459ccd18bd94ec7e33d'
REPOSITORY = 'https://github.com/Kushyameln01/kushyameln-works.git'


def git(root, *args, check=True):
    return subprocess.run(['git', '-C', str(root), *args], check=check,
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def prepare(cache, supplied):
    if supplied:
        root = supplied.resolve()
    else:
        cache = cache.resolve()
        cache.mkdir(parents=True, exist_ok=True)
        root = cache / ('management-' + MANAGEMENT_SHA[:8])
        if not root.exists():
            local = pathlib.Path(__file__).resolve().parents[2]
            if git(local, 'rev-parse', '--git-dir', check=False).returncode == 0:
                objects = local
            else:
                objects = cache / 'sources.git'
                if not objects.exists():
                    subprocess.run(['git', 'init', '--bare', str(objects)], check=True,
                                   stdout=subprocess.DEVNULL)
            if git(objects, 'cat-file', '-e', MANAGEMENT_SHA + '^{commit}', check=False).returncode:
                print('Fetching adopted management source ' + MANAGEMENT_SHA, flush=True)
                git(objects, 'fetch', '--no-tags', REPOSITORY, MANAGEMENT_SHA)
            git(objects, 'worktree', 'add', '--detach', str(root), MANAGEMENT_SHA)
    actual = git(root, 'rev-parse', 'HEAD').stdout.strip()
    if actual != MANAGEMENT_SHA:
        raise ValueError('Manager checkout must be fixed at ' + MANAGEMENT_SHA)
    if git(root, 'diff', '--quiet', 'HEAD', '--', 'docs', check=False).returncode:
        raise ValueError('Manager docs/runtime have local changes; use a clean checkout')
    if git(root, 'diff', '--cached', '--quiet', 'HEAD', '--', 'docs', check=False).returncode:
        raise ValueError('Manager docs/runtime have staged changes; use a clean checkout')
    docs = root / 'docs'
    if not (docs / 'ai-connection/modules/index.html').is_file():
        raise ValueError('Adopted management UI is missing')
    return root, docs


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.wasm': 'application/wasm'}

    def send_head(self):
        if urllib.parse.urlsplit(self.path).path in ('/ai-connection/modules/', '/ai-connection/modules/index.html'):
            overlay = pathlib.Path(__file__).with_name('adopted-candidate-index.html')
            stream = overlay.open('rb')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(overlay.stat().st_size))
            self.end_headers()
            return stream
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=pathlib.Path, default=pathlib.Path('/tmp/works-lora-candidate'))
    parser.add_argument('--manager-root', type=pathlib.Path,
                        help='Use an existing clean checkout at the fixed SHA')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    root, docs = prepare(args.cache, args.manager_root)
    print('Management: ' + MANAGEMENT_SHA, flush=True)
    print('Checkout: ' + str(root), flush=True)
    if args.prepare_only:
        return
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port),
                functools.partial(Handler, directory=str(docs)))
    print('http://127.0.0.1:' + str(server.server_port) + '/ai-connection/modules/', flush=True)
    print('Use one thread. Select local model Files and only the required LoRA pair/side. Stop with Ctrl-C.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        # Git stderr can include credential-bearing URLs from local configuration.
        # The fixed public URL is used above; keep subprocess diagnostics concise.
        print('Candidate startup failed: ' + (str(exc) if not isinstance(exc, subprocess.CalledProcessError)
                                             else 'Git command failed (exit ' + str(exc.returncode) + ')'), file=sys.stderr)
        sys.exit(1)
