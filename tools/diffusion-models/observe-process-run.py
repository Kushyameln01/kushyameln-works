"""Start a command behind a gate and observe its process tree before exec.

RSS sums include duplicated shared pages. PSS is best effort. Cgroup and /tmp
tmpfs usage are shared observations, never memory attributed to this command.
No environment or raw process command line is saved.
"""
import argparse
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


GATE = "import os,sys;fd=int(sys.argv[1]);token=os.read(fd,1);os.close(fd);token==b'G' or sys.exit(125);os.execvp(sys.argv[2],sys.argv[2:])"


def read_integer(path):
    try:
        value = path.read_text().strip()
        return int(value) if value.isdigit() else value
    except OSError:
        return None


def mapping(path):
    try:
        return {key: int(value) for key, value in (line.split() for line in path.read_text().splitlines())}
    except (OSError, ValueError):
        return None


def shared_memory():
    directory = Path('/sys/fs/cgroup')
    stat = mapping(directory / 'memory.stat')
    names = ['anon', 'file', 'shmem', 'file_mapped', 'file_dirty', 'file_writeback', 'inactive_file', 'active_file', 'kernel', 'pagetables', 'slab', 'sock']
    values = {name: read_integer(directory / name) for name in ['memory.current', 'memory.peak', 'memory.max', 'memory.swap.current']}
    values['memory.stat'] = {name: stat.get(name) for name in names} if stat is not None else None
    values['memory.events'] = mapping(directory / 'memory.events')
    values['memory.events.local'] = mapping(directory / 'memory.events.local')
    try:
        fs = os.statvfs('/tmp')
        values['tmpFilesystem'] = {'capacityBytes': fs.f_blocks * fs.f_frsize, 'availableBytes': fs.f_bavail * fs.f_frsize, 'usedBytes': (fs.f_blocks - fs.f_bfree) * fs.f_frsize}
    except OSError:
        values['tmpFilesystem'] = None
    return values


def role(pid, name):
    """Only the derived label is retained; command bytes are never returned."""
    try:
        with Path(f'/proc/{pid}/cmdline').open('rb') as source:
            command = source.read(8192).lower()
    except OSError:
        command = b''
    lowered = name.lower()
    if 'chrom' in lowered:
        if b'--type=renderer' in command:
            return 'chromium-renderer-worker-not-separable'
        if b'--type=gpu-process' in command:
            return 'chromium-gpu-process'
        if b'--type=utility' in command:
            return 'chromium-utility'
        if b'crashpad' in command:
            return 'chromium-crash-handler'
        return 'chromium-browser-or-helper'
    if 'python' in lowered:
        if b'multiprocessing.spawn' in command:
            return 'python-spawn-child-oracle-not-proven-by-role'
        return 'python-command-or-helper'
    if 'node' in lowered:
        return 'node-or-browser-driver'
    return 'other-command-child'


def process_table():
    records = {}
    for path in Path('/proc').glob('[0-9]*/status'):
        try:
            pid = int(path.parent.name)
            fields = dict(line.split(':', 1) for line in path.read_text().splitlines() if ':' in line)
            stat = (path.parent / 'stat').read_text()
            tail = stat[stat.rfind(')') + 2:].split()
            records[pid] = {'pid': pid, 'parentPid': int(fields['PPid']), 'name': fields.get('Name', '').strip(), 'state': tail[0], 'startTicks': int(tail[19]), 'rssBytes': int(fields.get('VmRSS', '0 kB').split()[0]) * 1024}
        except (OSError, ValueError, KeyError, IndexError):
            continue
    return records


def process_sample(root, known):
    records = process_table()
    selected = {pid for pid, ticks in known.items() if pid in records and records[pid]['startTicks'] == ticks}
    if root in records and root not in known:
        selected.add(root)
    while True:
        children = {pid for pid, record in records.items() if record['parentPid'] in selected}
        added = children - selected
        if not added:
            break
        selected |= added
    output = []
    for pid in sorted(selected):
        record = records[pid]
        known[pid] = record['startTicks']
        pss = None
        try:
            fields = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines() if ':' in line)
            pss = int(fields['Pss'].split()[0]) * 1024
        except (OSError, ValueError, KeyError):
            pass
        output.append({**record, 'pssBytes': pss, 'roleHeuristic': 'command-root' if pid == root else role(pid, record['name'])})
    readable = sum(row['pssBytes'] is not None for row in output)
    roles = {}
    for row in output:
        entry = roles.setdefault(row['roleHeuristic'], {'processCount': 0, 'rssSumBytes': 0, 'pssSumBytes': 0, 'pssReadableProcesses': 0})
        entry['processCount'] += 1
        entry['rssSumBytes'] += row['rssBytes']
        if row['pssBytes'] is not None:
            entry['pssSumBytes'] += row['pssBytes']
            entry['pssReadableProcesses'] += 1
    for entry in roles.values():
        if not entry['pssReadableProcesses']:
            entry['pssSumBytes'] = None
    return {'processCount': len(output), 'rootPresent': root in selected, 'rssSumBytes': sum(row['rssBytes'] for row in output), 'pssSumBytes': sum(row['pssBytes'] or 0 for row in output) if readable else None, 'pssReadableProcesses': readable, 'pssComplete': readable == len(output) and bool(output), 'byRoleHeuristic': roles, 'processes': output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--interval', type=float, default=0.5)
    parser.add_argument('--post-cleanup-seconds', type=float, default=1.0)
    parser.add_argument('--max-observations', type=int, default=10000)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or not 0.05 <= args.interval <= 60 or not 0 <= args.post_cleanup_seconds <= 10 or not 2 <= args.max_observations <= 10000:
        parser.error('Command required; interval 0.05..60, cleanup 0..10, observations 2..10000')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Reserve output before executing anything, never overwrite an old receipt.
    destination = args.output.open('x')
    start_wall, started = time.time(), time.monotonic()
    baseline_shared = shared_memory()
    read_fd, write_fd = os.pipe()
    child = None
    rows, known = deque(maxlen=args.max_observations - 1), {}
    total = 0
    rss_peak, pss_peak = 0, None
    peak_time = {'rss': None, 'pss': None}
    before_release = None
    error = None
    interrupted = None
    original_handlers = {}

    def receive_signal(number, _frame):
        nonlocal interrupted
        interrupted = number
        if child is not None and child.poll() is None:
            try:
                child.send_signal(number)
            except ProcessLookupError:
                pass

    def sample(phase):
        nonlocal total, rss_peak, pss_peak
        value = {'elapsedSeconds': time.monotonic() - started, 'phase': phase, **process_sample(child.pid, known), 'sharedCgroup': shared_memory()}
        total += 1
        if value['rssSumBytes'] > rss_peak:
            rss_peak, peak_time['rss'] = value['rssSumBytes'], value['elapsedSeconds']
        if value['pssSumBytes'] is not None and (pss_peak is None or value['pssSumBytes'] > pss_peak):
            pss_peak, peak_time['pss'] = value['pssSumBytes'], value['elapsedSeconds']
        return value

    try:
        for number in [signal.SIGINT, signal.SIGTERM]:
            original_handlers[number] = signal.signal(number, receive_signal)
        child = subprocess.Popen([sys.executable, '-c', GATE, str(read_fd), *command], pass_fds=(read_fd,))
        os.close(read_fd)
        read_fd = None
        before_release = sample('before-command-exec-gate-closed')
        os.write(write_fd, b'G')
        os.close(write_fd)
        write_fd = None
        while True:
            rows.append(sample('running' if child.poll() is None else 'command-exited'))
            if child.poll() is not None:
                break
            time.sleep(args.interval)
        deadline = time.monotonic() + args.post_cleanup_seconds
        while time.monotonic() < deadline:
            time.sleep(min(args.interval, max(0, deadline - time.monotonic())))
            rows.append(sample('post-command-cleanup-observation'))
    except BaseException as failure:
        error = {'name': type(failure).__name__, 'message': str(failure)[:2000]}
    finally:
        for descriptor in [read_fd, write_fd]:
            if descriptor is not None:
                os.close(descriptor)
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        for number, handler in original_handlers.items():
            signal.signal(number, handler)
        result = {'schemaVersion': 'bernini-gated-process-tree-observation/1', 'monitorSourceSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'startedEpochSeconds': start_wall, 'durationSeconds': time.monotonic() - started, 'rootPid': child.pid if child else None, 'commandExecutableBasename': Path(command[0]).name, 'childExitCode': child.returncode if child else None, 'signalReceived': interrupted, 'error': error, 'gateInstalledBeforeCommandExec': before_release is not None, 'sampleIntervalSeconds': args.interval, 'postCleanupObservationSeconds': args.post_cleanup_seconds, 'totalSamples': total, 'retainedSamples': len(rows) + (before_release is not None), 'omittedMiddleSamples': max(0, total - len(rows) - (before_release is not None)), 'observedPeakRssSumBytes': rss_peak, 'observedPeakPssSumBytes': pss_peak, 'peakElapsedSeconds': peak_time, 'sharedCgroupBeforeChildLaunch': baseline_shared, 'beforeCommandExec': before_release, 'observations': list(rows), 'scope': {'start': 'before child launch; first child tree sample while exec gate remains closed', 'end': 'command exit plus configured post-cleanup interval; known surviving descendants remain sampled', 'rss': 'sum duplicates shared pages; sampled peaks can miss spikes', 'pss': 'best effort /proc smaps_rollup; null and completeness flags mark inaccessible scopes; excludes unmapped file cache', 'roles': 'heuristics only; a DedicatedWorker/WASM/ORT allocator cannot be separated from its Chromium renderer process here', 'sharedCgroup': 'shared with all workloads; memory.peak is historical; memory.stat file already includes shmem, so do not add them', 'tmpFilesystem': 'shared /tmp filesystem occupancy, not private tensor bytes or command-owned memory', 'notObserved': ['unsampled transient peaks', 'native allocator suballocations', 'other process trees', 'memory after retained surviving descendants stop being observed']}}
        json.dump(result, destination, indent=2, allow_nan=False)
        destination.write('\n')
        destination.close()
    print(json.dumps({'output': str(args.output), 'childExitCode': result['childExitCode'], 'gateInstalledBeforeCommandExec': result['gateInstalledBeforeCommandExec'], 'observedPeakRssSumBytes': rss_peak, 'observedPeakPssSumBytes': pss_peak, 'totalSamples': total, 'error': error}), flush=True)
    return 1 if error else (child.returncode if child and child.returncode >= 0 else 128 + (-child.returncode if child else 0))


if __name__ == '__main__':
    sys.exit(main())
