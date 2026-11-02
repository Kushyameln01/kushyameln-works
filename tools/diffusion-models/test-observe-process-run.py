"""Bounded no-model check for gate, exit propagation and observation lifetime."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    script = Path(__file__).with_name('observe-process-run.py')
    with tempfile.TemporaryDirectory(prefix='observe-process-selftest-') as directory:
        receipt = Path(directory) / 'receipt.json'
        child = "import time; a=bytearray(2*1024*1024); time.sleep(.2); raise SystemExit(7)"
        run = subprocess.run([sys.executable, str(script), '--output', str(receipt), '--interval', '.05', '--post-cleanup-seconds', '.1', '--max-observations', '4', '--', sys.executable, '-c', child], capture_output=True, text=True)
        result = json.loads(receipt.read_text())
        assert run.returncode == 7 and result['childExitCode'] == 7
        assert result['gateInstalledBeforeCommandExec']
        assert result['beforeCommandExec']['phase'] == 'before-command-exec-gate-closed'
        assert result['beforeCommandExec']['rootPresent']
        assert result['observations'][-1]['phase'] == 'post-command-cleanup-observation'
        assert result['observedPeakRssSumBytes'] > 0
        assert result['totalSamples'] >= result['retainedSamples'] and result['retainedSamples'] <= 4
        assert 'sharedCgroupBeforeChildLaunch' in result and result['error'] is None
        assert all('roleHeuristic' in process for row in result['observations'] for process in row['processes'])
        assert 'bytearray' not in receipt.read_text() and 'cmdline' not in receipt.read_text()
        rejected = subprocess.run([sys.executable, str(script), '--output', str(receipt), '--', sys.executable, '-c', 'raise SystemExit(0)'], capture_output=True)
        assert rejected.returncode != 0 and json.loads(receipt.read_text()) == result
    print(json.dumps({'passed': True, 'checks': 10, 'modelExecution': False}))


if __name__ == '__main__':
    main()
