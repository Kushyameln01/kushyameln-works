#!/usr/bin/env python3
"""Observe the fixed owner-provided current-input-link joint runner, unchanged."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import traceback
from accept_still import ProcessSampler
from process_lifecycle import ProcessOwnership, cleanup_complete

ROOT = Path(__file__).resolve().parents[3]
MANAGER = '8849891f19124df31847bd691503c2491278eaa8'

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ('manager-root', 'diffusion-root', 'native-root', 'bundle', 'resource-state', 'output'):
        p.add_argument('--' + key, required=True, type=Path)
    a = p.parse_args()
    for key in vars(a):
        setattr(a, key, getattr(a, key).resolve())
    a.output.mkdir(parents=True, exist_ok=False)
    execution = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    expected = subprocess.check_output(['git', 'show', execution + ':tools/inference/vae/observe_management_joint.py'], cwd=ROOT)
    if expected != Path(__file__).read_bytes():
        raise ValueError('Observer must match its fixed execution source')
    if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=a.manager_root, text=True).strip() != MANAGER:
        raise ValueError('Use the fixed884 manager checkout; no future source relabeling')
    result = {'passed': False, 'observerSourceCommit': execution, 'observerSha256': hashlib.sha256(expected).hexdigest(),
              'managementExecutionSource': MANAGER, 'previousRunScope': '5537/60d retained unchanged',
              'newBoundary': 'currentInputLink/jointTraceId/fixed Git closure through real decode and E4 publication',
              'newTextInference': False, 'newExport': False, 'referenceRecomputed': False,
              'generationReady': False, 'stages': []}
    owner = ProcessOwnership().start(); sampler = ProcessSampler(os.getpid()); sampler.start(); started = time.monotonic()
    try:
        for scenario in ('decode', 'cancel-recover'):
            sampler.phase = scenario
            cmd = ['node', str(a.manager_root / 'tools/ai-connection/run-joint-rect-management.mjs'),
                   '--diffusion-root', str(a.diffusion_root), '--native-root', str(a.native_root),
                   '--bundle-root', str(a.bundle), '--reference', str(ROOT / 'development/inference/e6/fixtures/png-roundtrip.f32'),
                   '--manager-commit', MANAGER, '--resource-state', str(a.resource_state),
                   '--scenario', scenario, '--out', str(a.output / scenario)]
            t = time.monotonic(); child = subprocess.run(cmd, cwd=a.manager_root, capture_output=True, text=True, timeout=300)
            result['stages'].append({'scenario': scenario, 'command': cmd, 'exitCode': child.returncode,
                                     'wallSeconds': time.monotonic()-t, 'stdout': child.stdout, 'stderr': child.stderr})
            if child.returncode:
                raise RuntimeError(child.stderr[-2000:] + child.stdout[-1000:])
            data = json.loads((a.output / scenario / 'result.json').read_bytes())
            if data['status'] != 'PASS' or not data['actualNumericalAccepted'] or not data['freshVaeDecode'] or not data['sourceCheckpoint']['allMatched']:
                raise AssertionError('New current-input-link boundary was not actually accepted')
            if data['currentInputLink']['inputPayloadSha256'] != '71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063':
                raise AssertionError('Same restored mean identity changed')
        result['passed'] = True
    except Exception as error:
        result['failure'] = {'message': str(error), 'traceback': traceback.format_exc()}
    finally:
        sampler.phase = 'cleanup'; result['processOwnership'] = proof = owner.finish(timeout_seconds=5)
        sampler.stop(); result['measurements'] = sampler.report(); result['wallSeconds'] = time.monotonic()-started
        if not cleanup_complete(proof['liveAfterClose'], proof['zombiesAfterClose'], proof['errors']): result['passed'] = False
        (a.output / 'observer-result.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: result.get(k) for k in ('passed', 'wallSeconds', 'failure')}))
    return 0 if result['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
