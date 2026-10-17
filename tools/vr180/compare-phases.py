#!/usr/bin/env python3
"""Paired, fully recovered small direct-save trials; not a speed benchmark claim."""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import traceback
import urllib.request

spec = importlib.util.spec_from_file_location('cloud', Path(__file__).with_name('cloud-validate.py'))
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)

BASELINE = '4a8cae149c75800e7cffa3da202b50d5a0b0d54a'
BASELINE_BUILD = 'vr180-b6-save1'
CONDITIONS = ('new-context', 'new-page-same-context', 'same-page')


def sequence(repetition):
    return ('baseline', 'candidate') if repetition % 2 == 0 else ('candidate', 'baseline')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    baseline, out = args.baseline.resolve(), args.output.resolve()
    cloud.require(not out.exists() and not out.is_relative_to(cloud.ROOT), 'Use a new output directory outside checkout')
    out.mkdir(parents=True)
    result = {'schema': 'vr180-phase-comparison-v1', 'runId': os.environ.get('GITHUB_RUN_ID', 'unknown') + '-phases-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
              'status': 'BLOCKED', 'baselineCommit': BASELINE, 'browserTrials': [],
              'conditions': CONDITIONS, 'repetitions': 3, 'pairOrder': [sequence(i) for i in range(3)],
              'scope': 'small TB360 direct OPFS backend only; public origin, OS picker, large files, target VR playback and UI-copy performance not verified',
              'cacheState': 'new contexts then retained context/page; request interception enabled; HTTP cache hits unmeasured; not labelled cold/warm',
              'speedImprovementClaimed': False, 'independentVerificationDeferred': True,
              'browserSandboxRequired': True, 'pagesByteCheck': 'NOT_APPLICABLE_UNPUBLISHED_CANDIDATE'}
    candidate_docs, candidate_build = cloud.DOCS, cloud.BUILD
    servers, contexts = {}, {}
    started = time.monotonic()
    def deadline(*_args):
        raise cloud.Deadline('Phase comparison deadline reached')
    signal.signal(signal.SIGALRM, deadline)
    signal.signal(signal.SIGTERM, deadline)
    signal.alarm(660)
    try:
        cloud.require(os.environ.get('GITHUB_REPOSITORY') == 'Kushyameln01/kushyameln-works', 'Repository differs')
        source = cloud.source_check(out, candidate=True)
        result['checkoutCommit'] = source['checkoutCommit']
        cloud.preflight(out, defer_verification=True)
        head = subprocess.check_output(['git', '-C', str(baseline), 'rev-parse', 'HEAD'], text=True).strip()
        dirty = subprocess.check_output(['git', '-C', str(baseline), 'status', '--porcelain', '--untracked-files=no'], text=True)
        cloud.require(head == BASELINE and not dirty, 'Baseline checkout differs or is dirty')
        docs = {'baseline': baseline / 'docs', 'candidate': candidate_docs}
        builds = {'baseline': BASELINE_BUILD, 'candidate': candidate_build}
        inventory = {}
        for variant in docs:
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(cloud.Handler, directory=str(docs[variant])))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            servers[variant] = server
            origin = f'http://127.0.0.1:{server.server_port}'
            entries = []
            for name in (*cloud.PUBLIC_PATHS, 'shared/media-basic/vendor/mediabunny.mjs'):
                path = docs[variant] / name
                with urllib.request.urlopen(origin + '/' + name, timeout=5) as response:
                    body = response.read()
                cloud.require(hashlib.sha256(body).hexdigest() == cloud.digest(path), 'HTTP source differs: ' + name)
                entries.append({'name': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
            inventory[variant] = {'commit': BASELINE if variant == 'baseline' else source['checkoutCommit'],
                                  'build': builds[variant], 'origin': origin, 'files': entries}
        cloud.write(out / 'paired-source-inventory.json', inventory)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, chromium_sandbox=True, timeout=30000)
            result['browserVersion'] = browser.version
            try:
                for repetition in range(3):
                    pages = {}
                    for variant in docs:
                        context = browser.new_context(accept_downloads=True)
                        contexts[variant] = context
                        origin = inventory[variant]['origin']
                        context.route('**/*', lambda route, allowed=origin: route.continue_() if route.request.url.startswith(allowed + '/') else route.abort())
                        pages[variant] = context.new_page()
                    for condition in CONDITIONS:
                        if condition == 'new-page-same-context':
                            for variant in docs:
                                pages[variant].close()
                                pages[variant] = contexts[variant].new_page()
                        for variant in sequence(repetition):
                            # The same receipt validator checks each build against its own fixed source.
                            cloud.DOCS, cloud.BUILD = docs[variant], builds[variant]
                            name = f'{repetition + 1}-{condition}-{variant}'
                            trial = cloud.run_direct_output_probe(contexts[variant], inventory[variant]['origin'], out,
                                result['runId'], defer_verification=True, scenario=name,
                                borrowed_page=pages[variant], navigate=condition != 'same-page')
                            trial.update(variant=variant, condition=condition, repetition=repetition + 1,
                                         sourceCommit=inventory[variant]['commit'], cacheState=result['cacheState'])
                            cloud.write(out / name / 'trial.json', trial)
                            result['browserTrials'].append(trial)
                            cloud.require(trial['status'] == cloud.RECOVERED and trial['downloadRecovered'], 'Trial failed: ' + name)
                    for context in contexts.values():
                        context.close()
                    contexts.clear()
                result['status'] = cloud.RECOVERED
            finally:
                for context in contexts.values():
                    context.close()
                browser.close()
    except Exception as error:
        result.update(status='FAIL' if result['browserTrials'] else 'BLOCKED', error=str(error))
        (out / 'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        cloud.DOCS, cloud.BUILD = candidate_docs, candidate_build
        signal.alarm(0)
        for server in servers.values():
            server.shutdown()
            server.server_close()
        result['wallSeconds'] = time.monotonic() - started
        cloud.write(out / 'run.json', result)
        transported = cloud.emit_evidence(out, result)
    return 0 if transported and result['status'] == cloud.RECOVERED else 1


if __name__ == '__main__':
    raise SystemExit(main())
