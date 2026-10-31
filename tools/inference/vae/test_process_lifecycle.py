"""Real subprocess checks; prctl is used only inside each disposable helper."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
import process_lifecycle as lifecycle

ROOT = Path(__file__).resolve().parent
MODULE = ROOT / 'process_lifecycle.py'

HELPER = r'''
import json, os, subprocess, sys, time
from process_lifecycle import ProcessOwnership
case = sys.argv[1]
if case == 'initial':
    initial = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(10)'])
owner = ProcessOwnership()
owner.start()
if case == 'orphan':
    child = subprocess.Popen([sys.executable, '-c',
        'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(.65)"]);print(p.pid,flush=True);time.sleep(.25)'],
        stdout=subprocess.PIPE, text=True)
    grandchild_pid = int(child.stdout.readline())
    time.sleep(.35)
elif case in ('normal', 'initial'):
    child = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(.2)'])
    time.sleep(.35)
else:
    child = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(10)'])
    time.sleep(.15)
report = owner.finish(timeout_seconds=.08 if case == 'live' else 2)
report['caseChildPid'] = child.pid
if case == 'orphan':
    report['caseGrandchildPid'] = grandchild_pid
    child.stdout.close()
if case == 'initial':
    report['caseInitialPid'] = initial.pid
    report['initialStillAlive'] = initial.poll() is None
    initial.terminate(); initial.wait()
if case == 'live':
    report['childStillAlive'] = child.poll() is None
    child.terminate()
child.wait()
print(json.dumps(report))
'''


class ProcessLifecycleTests(unittest.TestCase):
    def test_historical_measured_zombies_do_not_mean_complete_cleanup(self):
        self.assertTrue(callable(getattr(lifecycle, 'cleanup_complete', None)),
                        'Explicit live/zombie/error completion gate is missing')
        prior = Path(__file__).resolve().parents[3] / 'development/inference/vae-v1/resource-measurements.json'
        record = json.loads(prior.read_text())
        self.assertEqual(record['liveProcessesAfterClose'], [])
        self.assertTrue(record['zombieProcessesAfterClose'])
        self.assertFalse(lifecycle.cleanup_complete(record['liveProcessesAfterClose'],
                                                  record['zombieProcessesAfterClose'], record['errors']))

    def test_real_reaped_child_has_complete_cleanup(self):
        self.assertTrue(callable(getattr(lifecycle, 'cleanup_complete', None)),
                        'Explicit live/zombie/error completion gate is missing')
        report = self.run_case('normal')
        self.assertTrue(lifecycle.cleanup_complete(report['liveAfterClose'],
                                                 report['zombiesAfterClose'], report['errors']))

    def run_case(self, case):
        self.assertTrue(MODULE.exists(), 'ProcessOwnership implementation is missing')
        result = subprocess.run([sys.executable, '-c', HELPER, case], cwd=ROOT,
                                capture_output=True, text=True, timeout=8)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_reaps_observed_normal_child_after_it_exits(self):
        report = self.run_case('normal')
        self.assertIn(report['caseChildPid'], [p['pid'] for p in report['observedChildren']])
        self.assertIn(report['caseChildPid'], [p['pid'] for p in report['reapedChildren']])
        self.assertEqual(report['liveAfterClose'], [])
        self.assertEqual(report['zombiesAfterClose'], [])
        self.assertEqual(report['errors'], [])

    @unittest.skipUnless(sys.platform.startswith('linux'), 'Linux subreaper check')
    def test_reaps_owned_orphan_grandchild_under_local_subreaper(self):
        report = self.run_case('orphan')
        self.assertTrue(report['subreaper'])
        reaped = {p['pid'] for p in report['reapedChildren']}
        self.assertIn(report['caseChildPid'], reaped)
        self.assertIn(report['caseGrandchildPid'], reaped)
        self.assertEqual(report['zombiesAfterClose'], [])
        self.assertEqual(report['liveAfterClose'], [])

    def test_excludes_initial_descendants_and_does_not_reap_them(self):
        report = self.run_case('initial')
        self.assertTrue(report['initialStillAlive'])
        self.assertIn(report['caseInitialPid'], [p['pid'] for p in report['initialDescendants']])
        self.assertNotIn(report['caseInitialPid'], [p['pid'] for p in report['observedChildren']])
        self.assertNotIn(report['caseInitialPid'], [p['pid'] for p in report['reapedChildren']])

    def test_reports_live_child_without_killing_it(self):
        report = self.run_case('live')
        self.assertTrue(report['childStillAlive'])
        self.assertIn(report['caseChildPid'], [p['pid'] for p in report['liveAfterClose']])
        self.assertEqual(report['zombiesAfterClose'], [])
        self.assertEqual(report['scope']['signalsSent'], 0)
        self.assertIn('sample', report['scope']['method'])


if __name__ == '__main__':
    unittest.main()
