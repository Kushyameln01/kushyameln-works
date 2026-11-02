"""Observe one process tree; cgroup memory is shared and never attributed to it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time


def processes(root):
    records = {}
    for path in Path('/proc').glob('[0-9]*/status'):
        try:
            fields = dict(line.split(':', 1) for line in path.read_text().splitlines() if ':' in line)
            records[int(path.parent.name)] = {
                'parent': int(fields['PPid']),
                'rssBytes': int(fields.get('VmRSS', '0 kB').split()[0]) * 1024,
            }
        except (OSError, ValueError, KeyError):
            continue
    selected = {root}
    while True:
        found = {pid for pid, value in records.items() if value['parent'] in selected}
        if found <= selected:
            break
        selected |= found
    total_pss, readable = 0, 0
    for pid in selected:
        try:
            fields = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines() if ':' in line)
            total_pss += int(fields['Pss'].split()[0]) * 1024
            readable += 1
        except (OSError, ValueError, KeyError):
            pass
    return {
        'processCount': len(selected & records.keys()),
        'rssSumBytes': sum(records[pid]['rssBytes'] for pid in selected if pid in records),
        'pssSumBytes': total_pss if readable else None,
        'pssReadableProcesses': readable,
        'rootAlive': root in records,
    }


def cgroup():
    values = {}
    for name in ('memory.current', 'memory.peak', 'memory.max'):
        try:
            value = Path('/sys/fs/cgroup', name).read_text().strip()
            values[name] = int(value) if value.isdigit() else value
        except OSError:
            values[name] = None
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--interval', type=float, default=1.0)
    args = parser.parse_args()
    if args.pid < 1 or args.interval < 0.1:
        parser.error('Positive PID and interval >=0.1 required')
    started = time.time()
    rows = []
    while True:
        row = {'elapsedSeconds': time.time() - started, **processes(args.pid), 'sharedCgroup': cgroup()}
        rows.append(row)
        if not row['rootAlive']:
            break
        time.sleep(args.interval)
    result = {
        'schemaVersion': 'bernini-process-tree-observation/1',
        'monitorSourceSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'rootPid': args.pid, 'startedEpochSeconds': started,
        'scope': 'Observed interval only; may start after prefix. RSS sums duplicate shared pages. PSS excludes file page cache. Cgroup is shared with other workloads; memory.peak is historical, not this run peak.',
        'sampleIntervalSeconds': args.interval,
        'observedPeakRssSumBytes': max(row['rssSumBytes'] for row in rows),
        'observedPeakPssSumBytes': max((row['pssSumBytes'] for row in rows if row['pssSumBytes'] is not None), default=None),
        'observations': rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps({key: result[key] for key in ('observedPeakRssSumBytes', 'observedPeakPssSumBytes')}))


if __name__ == '__main__':
    main()
