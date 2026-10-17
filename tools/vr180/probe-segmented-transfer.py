#!/usr/bin/env python3
"""Create bounded public synthetic inputs for the private official-SDK transport trial.

This command only writes new owned local files. It neither uploads nor changes
workflow/account settings. The receiver must check actual recovered bytes using
the documented formula; an intended-byte hash alone is not transport evidence.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

MIB = 1024 * 1024
BLOCK_BYTES = MIB
MANIFEST_MAX = 256 * 1024
SEED = 'vr180-public-segmented-transfer-2026-10-17'
ALGORITHM = 'SHAKE256(seed+NUL+fileId+NUL+decimal-byte-offset)-1MiB-blocks-v1'
REPOSITORY = 'Kushyameln01/kushyameln-works'
SCRIPT_PATH = 'tools/vr180/probe-segmented-transfer.py'
PROFILES = {'service-8mib': {'sizes': [60 * MIB, 60 * MIB], 'partBytes': 8 * MIB},
            'single-128mib': {'sizes': [128 * MIB], 'partBytes': 128 * MIB}}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def check_time(deadline):
    require(time.monotonic() < deadline, 'PROBE_DEADLINE')


def block_at(file_id, offset, length):
    require(file_id in ('payload-a', 'payload-b') and offset >= 0
            and offset % BLOCK_BYTES == 0 and 0 < length <= BLOCK_BYTES, 'GENERATOR_BLOCK')
    return hashlib.shake_256((SEED + '\0' + file_id + '\0' + str(offset)).encode('ascii')).digest(length)


def hash_file(path, deadline):
    count, sha = 0, hashlib.sha256()
    with path.open('rb') as stream:
        while True:
            check_time(deadline)
            block = stream.read(BLOCK_BYTES)
            if not block:
                break
            count += len(block)
            sha.update(block)
    return count, sha.hexdigest()


def write_payload(directory, file_id, total, deadline):
    path, sha = directory / (file_id + '.bin'), hashlib.sha256()
    with path.open('xb') as stream:
        for offset in range(0, total, BLOCK_BYTES):
            check_time(deadline)
            block = block_at(file_id, offset, min(BLOCK_BYTES, total - offset))
            require(stream.write(block) == len(block), 'SHORT_WRITE')
            sha.update(block)
        stream.flush()
        os.fsync(stream.fileno())
    observed_count, observed_hash = hash_file(path, deadline)
    require(observed_count == total and observed_hash == sha.hexdigest(), 'GENERATED_FILE_REREAD')
    return {'id': file_id, 'name': path.name, 'bytes': total, 'sha256': observed_hash}


def source_identity():
    identity = {'repository': os.environ.get('GITHUB_REPOSITORY', ''),
                'commit': os.environ.get('GITHUB_SHA', ''), 'ref': os.environ.get('GITHUB_REF', ''),
                'runId': os.environ.get('GITHUB_RUN_ID', ''),
                'runAttempt': int(os.environ.get('GITHUB_RUN_ATTEMPT', '0')),
                'job': os.environ.get('GITHUB_JOB', '')}
    require(identity['repository'] == REPOSITORY, 'REPOSITORY')
    require(re.fullmatch(r'[0-9a-f]{40}', identity['commit']), 'COMMIT')
    require(re.fullmatch(r'refs/heads/codex/vr180-plan-[A-Za-z0-9._/-]+', identity['ref']), 'BRANCH')
    require(re.fullmatch(r'[1-9][0-9]{0,19}', identity['runId']), 'RUN')
    require(1 <= identity['runAttempt'] <= 50, 'ATTEMPT')
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,40}', identity['job']), 'JOB')
    root = Path(__file__).resolve().parents[2]
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, timeout=10).decode().strip()
    require(head == identity['commit'], 'CHECKOUT_COMMIT')
    committed = subprocess.check_output(['git', 'show', head + ':' + SCRIPT_PATH], cwd=root, timeout=10)
    source = Path(__file__).read_bytes()
    require(source == committed, 'PROBE_SOURCE_DIFFERS_FROM_COMMIT')
    return identity, hashlib.sha256(source).hexdigest()


def generate(profile_name, output_dir, identity, script_hash):
    profile = PROFILES[profile_name]
    started, deadline = time.monotonic(), time.monotonic() + 300
    total = sum(profile['sizes'])
    # Source originals + conservative copies/archives, two part slots, headroom.
    required = 3 * total + 2 * profile['partBytes'] + 512 * MIB
    free = shutil.disk_usage(output_dir.parent).free
    require(free >= required, 'PROBE_DISK_LOW')
    output_dir.mkdir(mode=0o700, exist_ok=False)
    files = []
    for index, size in enumerate(profile['sizes']):
        files.append(write_payload(output_dir, ('payload-a', 'payload-b')[index], size, deadline))
    record = {'schema': 'vr180-segmented-source-v1', 'status': 'GENERATED_AND_REREAD',
              'identity': identity, 'profile': profile_name, 'partBytes': profile['partBytes'],
              'totalBytes': total, 'files': files,
              'generator': {'seed': SEED, 'algorithm': ALGORITHM, 'blockBytes': BLOCK_BYTES},
              'sourceSHA256': script_hash, 'createdAt': datetime.now(timezone.utc).isoformat(),
              'elapsedSeconds': time.monotonic() - started,
              'disk': {'freeBytesBefore': free, 'requiredAdditionalFreeBytes': required,
                       'reservationGuaranteed': False},
              'notVerified': ['artifact upload/download', 'browser/media processing',
                              '5/10GB media capacity', 'OS save dialog', 'VR playback']}
    data = (json.dumps(record, indent=2, sort_keys=True) + '\n').encode('utf8')
    require(len(data) <= MANIFEST_MAX, 'MANIFEST_BOUND')
    with (output_dir / 'source-manifest.json').open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', choices=PROFILES, required=True)
    parser.add_argument('--output-directory', type=Path, required=True)
    args = parser.parse_args()
    identity, script_hash = source_identity()
    temporary_root = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    output = args.output_directory
    require(output.is_absolute(), 'ABSOLUTE_OUTPUT_REQUIRED')
    parent = output.parent.resolve(strict=True)
    require(parent == temporary_root or temporary_root in parent.parents, 'OUTPUT_REQUIRES_RUNNER_TEMP')
    record = generate(args.profile, parent / output.name, identity, script_hash)
    print(json.dumps({'status': record['status'], 'profile': record['profile'],
                      'totalBytes': record['totalBytes'], 'files': len(record['files']),
                      'manifest': str(parent / output.name / 'source-manifest.json')}))


if __name__ == '__main__':
    main()
