#!/usr/bin/env python3
"""Run the fixed management P2 packet against the owner's existing Rect assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import traceback

from accept_still import ProcessSampler
from process_lifecycle import ProcessOwnership, cleanup_complete

ROOT = Path(__file__).resolve().parents[3]
MANAGER = '60d16b64d6020d3d20239f087f8add91268dcaad'
NATIVE = '855f435120f08eb9e818e51281fc26f0e2633829'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def tracked_source(path, commit):
    relative = str(path.relative_to(ROOT))
    original = subprocess.check_output(['git', 'show', f'{commit}:{relative}'], cwd=ROOT)
    current = path.read_bytes()
    if original != current:
        raise ValueError(f'Executable source is not the fixed commit: {relative}')
    return {'path': relative, 'commit': commit, 'bytes': len(current), 'sha256': sha(current)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('manager-root', 'diffusion-root', 'native-root', 'bundle', 'resource-state', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    for name in vars(args):
        setattr(args, name, getattr(args, name).resolve())
    if args.output.is_relative_to(ROOT / 'docs'):
        raise ValueError('Evidence is not a public product asset')
    args.output.mkdir(parents=True, exist_ok=False)
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    source_proof = [tracked_source(Path(__file__).resolve(), commit),
                    tracked_source(ROOT / 'tools/inference/vae/prepare_joint_rect.mjs', commit),
                    tracked_source(ROOT / 'tools/inference/vae/process_lifecycle.py', commit),
                    tracked_source(ROOT / 'tools/inference/vae/accept_still.py', commit),
                    tracked_source(ROOT / 'development/inference/p2-p3-acceptance/P2-SOURCES.json', commit)]
    resource = json.loads(args.resource_state.read_bytes())
    if resource.get('status') != 'available' or not 0 < resource.get('requiredBytes', 0) <= resource.get('budgetBytes', 0):
        raise ValueError('Explicit model resource budget required; no metadata-only fallback')
    report = {'passed': False, 'scope': 'Fixed management norm-required Rect mean diagnostic joint run',
              'executionSourceCommit': commit, 'harnessSource': source_proof,
              'managerCommit': MANAGER, 'nativeCommit': NATIVE,
              'resourceState': resource, 'stages': [], 'generationReady': False,
              'generatedSampleAccepted': False, 'newExportCalls': 0, 'newEncodeCalls': 0,
              'referenceRecomputed': False, 'sourceAuthenticityChecks': []}
    owner = ProcessOwnership().start()
    sampler = ProcessSampler(os.getpid())
    sampler.start()
    started = time.monotonic()
    reference = ROOT / 'development/inference/e6/fixtures/png-roundtrip.f32'
    common = ['--native-root', str(args.native_root), '--bundle-root', str(args.bundle),
              '--input', str(args.output / 'prepare/restored.wktensor'),
              '--reference', str(reference), '--manager-commit', MANAGER,
              '--resource-state', str(args.resource_state)]
    commands = [
        ('prepare', ['node', str(ROOT / 'tools/inference/vae/prepare_joint_rect.mjs'),
                     '--manager-root', str(args.manager_root), '--diffusion-root', str(args.diffusion_root),
                     '--output', str(args.output / 'prepare')]),
        ('decode', ['node', str(args.manager_root / 'tools/ai-connection/run-norm-required-rect.mjs'),
                    *common, '--scenario', 'decode', '--out', str(args.output / 'decode')]),
        ('cancel-recover', ['node', str(args.manager_root / 'tools/ai-connection/run-norm-required-rect.mjs'),
                            *common, '--scenario', 'cancel-recover', '--out', str(args.output / 'cancel-recover')]),
    ]

    def interrupted(_signum, _frame):
        raise RuntimeError('Joint Rect harness interrupted; owned children will be cleaned up')

    signal.signal(signal.SIGTERM, interrupted)
    try:
        for phase, command in commands:
            sampler.phase = phase
            phase_started = time.monotonic()
            child = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=300)
            record = {'phase': phase, 'command': command, 'exitCode': child.returncode,
                      'wallSeconds': time.monotonic() - phase_started,
                      'stdout': child.stdout, 'stderr': child.stderr}
            report['stages'].append(record)
            if child.returncode:
                raise RuntimeError(f'{phase} failed: {child.stderr[-2000:]} {child.stdout[-1000:]}')
            result_path = args.output / phase / ('prepare-result.json' if phase == 'prepare' else 'result.json')
            result = json.loads(result_path.read_bytes())
            if phase == 'prepare':
                if not result['passed'] or result['storeEntriesAfter']:
                    raise AssertionError('Adopted marker/owner restore preflight failed')
                report['markerReadback'] = result['steps'][0]
                continue
            if result['status'] != 'PASS' or not result.get('modelInference'):
                raise AssertionError(f'New actual management decode not accepted: {phase}/{result.get("status")}')
            if result['inputIdentity']['sha256'] != 'dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612':
                raise AssertionError('Same required restored mean was not used')
            if result['manifestIdentity']['sha256'] != '450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a':
                raise AssertionError('Selected Rect profile manifest differs')
            # Verify the manager's working-tree source receipts against actual
            # fixed Git objects, retaining its explicit commit:null field.
            proof = []
            for entry in result['managementSource']['sourceReceipts']:
                original = subprocess.check_output(['git', 'show', f'{MANAGER}:{entry["path"]}'], cwd=ROOT)
                if len(original) != entry['byteLength'] or sha(original) != entry['sha256']:
                    raise AssertionError('Manager served source is not its fixed commit: ' + entry['path'])
                proof.append({'path': entry['path'], 'sha256': entry['sha256'], 'fixedGitBytesMatched': True})
            report['sourceAuthenticityChecks'].append({'phase': phase, 'commit': MANAGER, 'files': proof})
            if result['workerResources']['live'] or result['workerResources']['created'] != result['workerResources']['closed']:
                raise AssertionError('Actual Worker closure barrier failed')
        report['passed'] = True
        report['newSuccessfulDecodeCalls'] = 2
        report['cancelledNativeJobs'] = 1
    except Exception as error:
        report['failure'] = {'message': str(error), 'traceback': traceback.format_exc()}
    finally:
        sampler.phase = 'cleanup'
        ownership = owner.finish(timeout_seconds=5)
        report['processOwnership'] = ownership
        sampler.stop()
        measurements = sampler.report()
        report['measurements'] = measurements
        if not cleanup_complete(ownership['liveAfterClose'], ownership['zombiesAfterClose'], ownership['errors']):
            report['passed'] = False
        peaks = [p['sampledPeakSumRssBytes'] for p in measurements['phases'].values()]
        report['sampledPeakProcessTreeRssBytes'] = max(peaks, default=0)
        report['resourceBudgetExceeded'] = report['sampledPeakProcessTreeRssBytes'] > resource['budgetBytes']
        if report['resourceBudgetExceeded']:
            report['passed'] = False
        report['wallSeconds'] = time.monotonic() - started
        (args.output / 'joint-result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report.get(k) for k in ('passed', 'wallSeconds', 'sampledPeakProcessTreeRssBytes', 'failure')}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
