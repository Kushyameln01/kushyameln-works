#!/usr/bin/env python3
"""Run the bounded Rect candidate trace, with one real existing-profile decode."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import traceback
from process_lifecycle import ProcessOwnership, cleanup_complete

ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('manager-root', 'diffusion-root', 'bundle', 'output'):
        parser.add_argument('--' + key, required=True, type=Path)
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.output.exists():
        raise ValueError('A fresh private output directory is required')
    if args.output.is_relative_to(ROOT / 'docs'):
        raise ValueError('Do not write candidate evidence into the published docs tree')
    owner = ProcessOwnership().start()
    start = time.monotonic()
    report = {'passed': False, 'scope': 'Candidate mean diagnostic, management P1 adoption BLOCKED',
              'newExportCalls': 0, 'newEncodeCalls': 0, 'referenceRecomputed': False,
              'generatedSampleAccepted': False, 'stages': []}
    common = ['--manager-root', str(args.manager_root.resolve()), '--diffusion-root', str(args.diffusion_root.resolve()),
              '--output', str(args.output)]
    commands = [
        ['node', str(ROOT / 'tools/inference/vae/p2_rect_trace.mjs'), '--phase', 'prepare', *common],
        [sys.executable, str(ROOT / 'tools/inference/vae/check_restored_mean.py'),
         '--profile', 'wan21-raw-f32-1x16x32', '--bundle', str(args.bundle.resolve()),
         '--input', str(args.output / 'restored.wktensor'),
         '--reference', str(ROOT / 'development/inference/e6/fixtures/png-roundtrip.f32'),
         '--output', str(args.output / 'browser')],
        ['node', str(ROOT / 'tools/inference/vae/p2_rect_trace.mjs'), '--phase', 'finish', *common],
    ]
    try:
        for index, command in enumerate(commands):
            stage_start = time.monotonic()
            result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
            stage = {'index': index, 'command': command, 'exitCode': result.returncode,
                     'wallSeconds': time.monotonic() - stage_start,
                     'stdout': result.stdout, 'stderr': result.stderr}
            report['stages'].append(stage)
            if result.returncode:
                raise RuntimeError(f'Stage {index} failed: {result.stderr[-2000:]} {result.stdout[-1000:]}')
        trace_path = args.output / 'trace.json'
        trace = json.loads(trace_path.read_text())
        if not trace.get('candidateDiagnosticPassed') or trace.get('fullP2AdoptionAccepted'):
            raise AssertionError('Candidate diagnostic/adoption scope mismatch')
        report.update(passed=True, traceSha256=hashlib.sha256(trace_path.read_bytes()).hexdigest(),
                      fullP2AdoptionAccepted=False, newVaeDecodeCalls=1)
    except Exception as error:
        report['failure'] = {'message': str(error), 'traceback': traceback.format_exc()}
    finally:
        report['processOwnership'] = ownership = owner.finish(timeout_seconds=5)
        if not cleanup_complete(ownership['liveAfterClose'], ownership['zombiesAfterClose'], ownership['errors']):
            report['passed'] = False
        report['wallSeconds'] = time.monotonic() - start
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / 'pipeline-results.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'passed': report['passed'], 'wallSeconds': report['wallSeconds'],
                          'failure': report.get('failure'), 'fullP2AdoptionAccepted': False}, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
