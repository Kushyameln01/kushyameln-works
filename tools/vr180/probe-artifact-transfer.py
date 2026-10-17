#!/usr/bin/env python3
"""Bounded synthetic Actions artifact transport probe; no browser/media claims.

generate writes actual public synthetic bytes in bounded blocks. verify reads
the complete downloaded ZIP, reconstructs every payload byte, rereads the full
result, and binds it to separately fetched GitHub artifact metadata. Neither
command uploads, deletes remote artifacts, or changes account settings.
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
import stat
import struct
import subprocess
import sys
import time
import zipfile

MIB = 1024 * 1024
SIZES = {64: 64 * MIB, 128: 128 * MIB}
BLOCK_BYTES = MIB
CHUNK_BYTES = 8 * MIB
MANIFEST_LIMIT = 64 * 1024
ARCHIVE_OVERHEAD_LIMIT = 2 * MIB
CENTRAL_DIRECTORY_LIMIT = 32 * 1024
ZIP_NAME_LIMIT = 64
ZIP_EXTRA_LIMIT = 512
ZIP_ENTRY_COMMENT_LIMIT = 256
ZIP_ARCHIVE_COMMENT_LIMIT = 1024
HEADROOM = 128 * MIB
TIME_LIMIT = 300
REPOSITORY = 'Kushyameln01/kushyameln-works'
SCRIPT_PATH = 'tools/vr180/probe-artifact-transfer.py'
SCHEMA = 'vr180-artifact-transfer-v1'
SEED = 'vr180-public-synthetic-artifact-transfer-2026-10-17'
ALGORITHM = 'SHAKE256(seed+NUL+decimal-offset)-1MiB-blocks-v1'
ACTION_COMMIT = 'ea165f8d65b6e75b540449e92b4886f43607fa02'
NOT_VERIFIED = ['browser input/output', 'OS file-save dialog', 'media conversion',
                'VR playback', 'media performance', '5-10GB capacity',
                'immediate remote artifact deletion', 'account billing usage']


class Blocked(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise ValueError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def check_time(deadline):
    if time.monotonic() > deadline:
        raise Blocked('TRANSFER_TIME_LIMIT_EXCEEDED')


def hash_file(path, deadline):
    digest, count = hashlib.sha256(), 0
    with path.open('rb') as stream:
        while True:
            check_time(deadline)
            block = stream.read(BLOCK_BYTES)
            if not block:
                break
            digest.update(block)
            count += len(block)
            del block
    return count, digest.hexdigest()


def write_json(path, value):
    data = (json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True) + '\n').encode()
    require(len(data) <= MANIFEST_LIMIT, 'JSON_RECORD_TOO_LARGE')
    with path.open('xb') as stream:
        stream.write(data)


def read_json(path):
    require(path.is_file() and not path.is_symlink(), 'JSON_RECORD_NOT_REGULAR')
    require(path.stat().st_size <= MANIFEST_LIMIT, 'JSON_RECORD_TOO_LARGE')
    return json.loads(path.read_text(encoding='utf-8'))


def block_at(offset, length):
    require(offset % BLOCK_BYTES == 0 and 0 < length <= BLOCK_BYTES, 'INVALID_GENERATOR_BLOCK')
    return hashlib.shake_256((SEED + '\0' + str(offset)).encode('ascii')).digest(length)


def artifact_name(size_mib, run_id, attempt):
    return f'vr180-transfer-{size_mib}mib-{run_id}-{attempt}'


def validate_identity(identity):
    require(identity['repository'] == REPOSITORY, 'REPOSITORY_MISMATCH')
    require(re.fullmatch(r'[0-9a-f]{40}', identity['commit']) is not None, 'INVALID_COMMIT')
    require(identity['ref'].startswith('refs/heads/codex/vr180-plan-'), 'CANDIDATE_BRANCH_REQUIRED')
    require(re.fullmatch(r'[1-9][0-9]*', identity['runId']) is not None, 'INVALID_RUN_ID')
    require(type(identity['runAttempt']) is int and 1 <= identity['runAttempt'] <= 50,
            'INVALID_RUN_ATTEMPT')


def source_identity():
    identity = {'repository': os.environ.get('GITHUB_REPOSITORY', ''),
                'commit': os.environ.get('GITHUB_SHA', ''), 'ref': os.environ.get('GITHUB_REF', ''),
                'runId': os.environ.get('GITHUB_RUN_ID', ''),
                'runAttempt': int(os.environ.get('GITHUB_RUN_ATTEMPT', '0')),
                'job': os.environ.get('GITHUB_JOB', '')}
    validate_identity(identity)
    root = Path(__file__).resolve().parents[2]
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, timeout=10).decode().strip()
    require(head == identity['commit'], 'CHECKOUT_COMMIT_MISMATCH')
    pinned = subprocess.check_output(['git', 'show', head + ':' + SCRIPT_PATH], cwd=root, timeout=10)
    current = Path(__file__).read_bytes()
    require(pinned == current, 'PROBE_SCRIPT_DIFFERS_FROM_COMMIT')
    identity['scriptSHA256'] = hashlib.sha256(current).hexdigest()
    return identity


def disk_preflight(path, total, role):
    # Reserve source, chunks, archive and recovered copies even though this
    # generator does not materialize a second complete source file.
    budget = {'sourceCopyBytes': total, 'chunkPayloadBytes': total,
              'archiveCopyBytes': total + ARCHIVE_OVERHEAD_LIMIT,
              'reconstructedCopyBytes': total, 'headroomBytes': HEADROOM}
    required = sum(budget.values())
    anchor = path.resolve()
    while not anchor.exists():
        anchor = anchor.parent
    free = shutil.disk_usage(anchor).free
    record = {'role': role, 'checkedAt': now(), 'path': str(anchor), 'freeBytes': free,
              'requiredAdditionalFreeBytes': required, 'budget': budget,
              'reservationGuaranteed': False}
    if free < required:
        raise Blocked(f'INSUFFICIENT_DISK: free={free}, required={required}')
    return record


def write_chunks(directory, total, deadline):
    chunks, generated_hash = [], hashlib.sha256()
    for index, offset in enumerate(range(0, total, CHUNK_BYTES)):
        name = f'chunk-{index:05d}.bin'
        length = min(CHUNK_BYTES, total - offset)
        chunk_hash = hashlib.sha256()
        with (directory / name).open('xb') as stream:
            for local in range(0, length, BLOCK_BYTES):
                check_time(deadline)
                block = block_at(offset + local, min(BLOCK_BYTES, length - local))
                require(stream.write(block) == len(block), 'SHORT_FILE_WRITE')
                generated_hash.update(block)
                chunk_hash.update(block)
                del block
            stream.flush()
            os.fsync(stream.fileno())
        chunks.append({'index': index, 'name': name, 'offset': offset, 'length': length,
                       'sha256': chunk_hash.hexdigest()})
    # Hash actual disk bytes again; a seed or intended-write hash is insufficient.
    disk_hash, read_bytes = hashlib.sha256(), 0
    for chunk in chunks:
        chunk_hash = hashlib.sha256()
        with (directory / chunk['name']).open('rb') as stream:
            while True:
                check_time(deadline)
                block = stream.read(BLOCK_BYTES)
                if not block:
                    break
                disk_hash.update(block)
                chunk_hash.update(block)
                read_bytes += len(block)
                del block
        require(chunk_hash.hexdigest() == chunk['sha256'], 'GENERATOR_DISK_CHUNK_MISMATCH')
    require(read_bytes == total and disk_hash.hexdigest() == generated_hash.hexdigest(),
            'GENERATOR_DISK_FULL_MISMATCH')
    return chunks, generated_hash.hexdigest(), disk_hash.hexdigest()


def generate(args):
    started, deadline = now(), time.monotonic() + TIME_LIMIT
    total = SIZES[args.size_mib]
    identity = source_identity()
    output = args.output.resolve()
    require(not output.exists(), 'OUTPUT_ALREADY_EXISTS')
    runner_temp = Path(os.environ.get('RUNNER_TEMP', '/__missing_runner_temp__')).resolve()
    require(runner_temp.is_dir() and output.is_relative_to(runner_temp), 'OUTPUT_MUST_BE_UNDER_RUNNER_TEMP')
    disk = disk_preflight(output, total, 'generator')
    output.mkdir(parents=True)
    chunks, generated_hash, actual_hash = write_chunks(output, total, deadline)
    manifest = {'schema': SCHEMA, 'trialId': artifact_name(args.size_mib, identity['runId'], identity['runAttempt']),
                'scope': 'synthetic-byte-transport-only', 'source': identity,
                'startedAt': started, 'finishedAt': now(), 'sizeMiB': args.size_mib,
                'generator': {'algorithm': ALGORITHM, 'seed': SEED, 'blockBytes': BLOCK_BYTES},
                'inputKind': 'generated-stream-not-a-media-file', 'inputBytes': total,
                'inputSHA256': generated_hash, 'outputBytes': total, 'outputSHA256': actual_hash,
                'chunks': chunks, 'chunkBytes': CHUNK_BYTES, 'actualDiskBytesReread': total,
                'artifact': {'name': artifact_name(args.size_mib, identity['runId'], identity['runAttempt']),
                             'retentionDays': 1, 'compressionLevel': 0,
                             'uploadAction': 'actions/upload-artifact@' + ACTION_COMMIT,
                             'maxArchiveBytes': total + ARCHIVE_OVERHEAD_LIMIT},
                'limits': {'payloadBytes': total, 'timeSeconds': TIME_LIMIT,
                           'generatorPayloadBufferBytes': BLOCK_BYTES},
                'diskPreflight': disk, 'notVerified': NOT_VERIFIED,
                'status': 'GENERATED_AND_DISK_REREAD', 'remoteRecoveryVerified': False}
    write_json(output / 'manifest.json', manifest)
    check_time(deadline)
    print(json.dumps({'status': manifest['status'], 'artifactName': manifest['artifact']['name'],
                      'payloadBytes': total, 'outputSHA256': actual_hash, 'output': str(output)}))


def validate_manifest(manifest, args):
    total = SIZES[args.size_mib]
    require(manifest['schema'] == SCHEMA and manifest['scope'] == 'synthetic-byte-transport-only', 'SCHEMA_MISMATCH')
    source = manifest['source']
    validate_identity(source)
    expected = {'runId': args.run_id, 'runAttempt': args.run_attempt, 'commit': args.commit, 'ref': args.ref}
    require(all(source[key] == value for key, value in expected.items()), 'REQUESTED_PROVENANCE_MISMATCH')
    require(re.fullmatch(r'[0-9a-f]{64}', source['scriptSHA256']) is not None, 'INVALID_SCRIPT_HASH')
    require(manifest['sizeMiB'] == args.size_mib and manifest['inputBytes'] == total
            and manifest['outputBytes'] == total and manifest['actualDiskBytesReread'] == total, 'PAYLOAD_SIZE_MISMATCH')
    require(manifest['generator'] == {'algorithm': ALGORITHM, 'seed': SEED, 'blockBytes': BLOCK_BYTES}, 'GENERATOR_MISMATCH')
    require(manifest['inputSHA256'] == manifest['outputSHA256']
            and re.fullmatch(r'[0-9a-f]{64}', manifest['outputSHA256']) is not None, 'INVALID_FULL_HASH')
    expected_name = artifact_name(args.size_mib, args.run_id, args.run_attempt)
    require(manifest['trialId'] == expected_name and manifest['artifact'] == {
        'name': expected_name, 'retentionDays': 1, 'compressionLevel': 0,
        'uploadAction': 'actions/upload-artifact@' + ACTION_COMMIT,
        'maxArchiveBytes': total + ARCHIVE_OVERHEAD_LIMIT}, 'ARTIFACT_CONTRACT_MISMATCH')
    require(manifest['chunkBytes'] == CHUNK_BYTES and len(manifest['chunks']) == (total + CHUNK_BYTES - 1) // CHUNK_BYTES,
            'CHUNK_COUNT_MISMATCH')
    for index, chunk in enumerate(manifest['chunks']):
        offset = index * CHUNK_BYTES
        require(chunk['index'] == index and chunk['name'] == f'chunk-{index:05d}.bin'
                and chunk['offset'] == offset and chunk['length'] == min(CHUNK_BYTES, total - offset)
                and re.fullmatch(r'[0-9a-f]{64}', chunk['sha256']) is not None, 'CHUNK_SEQUENCE_MISMATCH')
    return total


def artifact_metadata(record, expected_name):
    if 'artifacts' in record:
        matches = [item for item in record['artifacts'] if item.get('name') == expected_name]
        require(len(matches) == 1, 'ARTIFACT_METADATA_MISSING_OR_DUPLICATE')
        record = matches[0]
    require(record['name'] == expected_name and record.get('expired') is False, 'ARTIFACT_NAME_OR_EXPIRY_MISMATCH')
    require(type(record['id']) is int and record['id'] > 0, 'INVALID_ARTIFACT_ID')
    created = datetime.fromisoformat(record['created_at'].replace('Z', '+00:00'))
    expires = datetime.fromisoformat(record['expires_at'].replace('Z', '+00:00'))
    lifetime = (expires - created).total_seconds()
    require(0 < lifetime <= 86460, 'ARTIFACT_RETENTION_EXCEEDS_ONE_DAY_TOLERANCE')
    return record


def zip_structure_preflight(path, total, deadline):
    """Bound ZIP metadata before ZipFile can allocate its central-directory list.

    Supports the fixed ZIP64 EOCD/locator form even for a small archive. Individual
    entries are at most 8 MiB, so ZIP64 central-entry size/offset sentinels are not
    needed; ZIP64 local size extras are allowed within the same metadata bound.
    """
    size = path.stat().st_size
    count = (total + CHUNK_BYTES - 1) // CHUNK_BYTES + 1
    expected = {'manifest.json': None} | {
        f'chunk-{index:05d}.bin': min(CHUNK_BYTES, total - index * CHUNK_BYTES)
        for index in range(count - 1)}
    with path.open('rb') as stream:
        check_time(deadline)
        tail_size = min(size, 22 + 65535)
        stream.seek(size - tail_size)
        tail = stream.read(tail_size)
        position = tail.rfind(b'PK\x05\x06')
        require(position >= 0 and len(tail) - position >= 22, 'ZIP_EOCD_MISSING')
        fields = struct.unpack_from('<4sHHHHIIH', tail, position)
        _, disk, cd_disk, disk_count, entry_count, cd_size, cd_offset, comment_size = fields
        require(comment_size <= ZIP_ARCHIVE_COMMENT_LIMIT
                and position + 22 + comment_size == len(tail), 'ZIP_EOCD_COMMENT_OR_TRAILER_INVALID')
        eocd_offset = size - tail_size + position
        require(disk == cd_disk == 0, 'ZIP_MULTIDISK_UNSUPPORTED')
        boundary, zip64 = eocd_offset, False
        if eocd_offset >= 20:
            stream.seek(eocd_offset - 20)
            locator = stream.read(20)
            if locator[:4] == b'PK\x06\x07':
                zip64 = True
                _, zip64_disk, zip64_offset, disks = struct.unpack('<4sIQI', locator)
                require(zip64_disk == 0 and disks == 1 and zip64_offset + 56 == eocd_offset - 20,
                        'ZIP64_LOCATOR_INVALID')
                stream.seek(zip64_offset)
                record = stream.read(56)
                require(len(record) == 56, 'ZIP64_EOCD_TRUNCATED')
                z = struct.unpack('<4sQHHIIQQQQ', record)
                require(z[0] == b'PK\x06\x06' and z[1] == 44 and z[3] <= 45
                        and z[4] == z[5] == 0, 'ZIP64_EOCD_UNSUPPORTED')
                require(disk_count in (z[6], 0xffff) and entry_count in (z[7], 0xffff)
                        and cd_size in (z[8], 0xffffffff) and cd_offset in (z[9], 0xffffffff),
                        'ZIP64_CLASSIC_EOCD_MISMATCH')
                disk_count, entry_count, cd_size, cd_offset = z[6:10]
                boundary = zip64_offset
        require(disk_count == entry_count == count, 'ZIP_ENTRY_COUNT_PRELIMIT')
        require(count * 46 <= cd_size <= CENTRAL_DIRECTORY_LIMIT, 'ZIP_CENTRAL_DIRECTORY_PRELIMIT')
        require(0 <= cd_offset < boundary and cd_offset + cd_size == boundary,
                'ZIP_CENTRAL_DIRECTORY_EXTENT_INVALID')
        # Read only the bounded central directory, never the payload here.
        stream.seek(cd_offset)
        central = stream.read(cd_size)
        require(len(central) == cd_size, 'ZIP_CENTRAL_DIRECTORY_TRUNCATED')
        at, seen, extents = 0, set(), []
        for _ in range(count):
            check_time(deadline)
            require(at + 46 <= len(central), 'ZIP_CENTRAL_HEADER_TRUNCATED')
            h = struct.unpack_from('<4s6H3I5H2I', central, at)
            require(h[0] == b'PK\x01\x02' and h[2] <= 45 and h[13] == 0,
                    'ZIP_CENTRAL_HEADER_INVALID')
            compressed, expanded = h[8], h[9]
            name_size, extra_size, entry_comment = h[10:13]
            offset = h[16]
            require(0 < name_size <= ZIP_NAME_LIMIT and extra_size <= ZIP_EXTRA_LIMIT
                    and entry_comment <= ZIP_ENTRY_COMMENT_LIMIT, 'ZIP_ENTRY_METADATA_PRELIMIT')
            end = at + 46 + name_size + extra_size + entry_comment
            require(end <= len(central), 'ZIP_CENTRAL_ENTRY_TRUNCATED')
            name_bytes = central[at + 46:at + 46 + name_size]
            name = name_bytes.decode('ascii')
            require(name in expected and name not in seen, 'ZIP_ENTRY_SET_PRECHECK')
            seen.add(name)
            expected_size = expected[name]
            require((0 < expanded <= MANIFEST_LIMIT if expected_size is None else expanded == expected_size)
                    and compressed <= expanded + MIB and offset < cd_offset,
                    'ZIP_ENTRY_SIZE_OR_OFFSET_PRELIMIT')
            stream.seek(offset)
            local = stream.read(30)
            require(len(local) == 30 and local[:4] == b'PK\x03\x04', 'ZIP_LOCAL_HEADER_INVALID')
            local_name, local_extra = struct.unpack_from('<HH', local, 26)
            require(local_name == name_size and local_extra <= ZIP_EXTRA_LIMIT, 'ZIP_LOCAL_METADATA_PRELIMIT')
            require(stream.read(local_name) == name_bytes, 'ZIP_LOCAL_NAME_MISMATCH')
            payload_start = offset + 30 + local_name + local_extra
            require(payload_start + compressed <= cd_offset, 'ZIP_LOCAL_EXTENT_INVALID')
            extents.append((offset, payload_start + compressed))
            at = end
        require(at == len(central) and seen == set(expected), 'ZIP_CENTRAL_DIRECTORY_COUNT_MISMATCH')
        extents.sort()
        require(extents[0][0] == 0 and all(a[1] <= b[0] for a, b in zip(extents, extents[1:])),
                'ZIP_PREFIX_OR_OVERLAPPING_ENTRY')
    return {'entryCount': count, 'centralDirectoryBytes': cd_size, 'centralDirectoryOffset': cd_offset,
            'zip64EOCD': zip64, 'archiveCommentBytes': comment_size,
            'centralDirectoryLimitBytes': CENTRAL_DIRECTORY_LIMIT, 'checkedBeforeZipFile': True}


def verify(args):
    started, deadline = now(), time.monotonic() + TIME_LIMIT
    total = SIZES[args.size_mib]
    require(args.archive.is_file() and not args.archive.is_symlink(), 'ARCHIVE_NOT_REGULAR')
    require(total <= args.archive.stat().st_size <= total + ARCHIVE_OVERHEAD_LIMIT, 'ARCHIVE_SIZE_OUTSIDE_BOUND')
    output = args.output.resolve()
    require(not output.exists(), 'OUTPUT_ALREADY_EXISTS')
    disk = disk_preflight(output, total, 'receiver')
    expected_name = artifact_name(args.size_mib, args.run_id, args.run_attempt)
    metadata = artifact_metadata(read_json(args.metadata), expected_name)
    run = metadata['workflow_run']
    require(str(run['id']) == args.run_id and run['head_sha'] == args.commit
            and 'refs/heads/' + run['head_branch'] == args.ref, 'GITHUB_RUN_PROVENANCE_MISMATCH')
    archive_bytes, archive_sha = hash_file(args.archive, deadline)
    require(metadata['size_in_bytes'] == archive_bytes and metadata['digest'] == 'sha256:' + archive_sha,
            'GITHUB_ARCHIVE_DIGEST_MISMATCH')
    zip_structure = zip_structure_preflight(args.archive, total, deadline)
    output.mkdir(parents=True)
    partial = output / 'reconstructed.bin.partial'
    try:
        with zipfile.ZipFile(args.archive) as archive:
            entries = archive.infolist()
            require(len(entries) == zip_structure['entryCount'], 'ZIP_POSTPARSE_ENTRY_COUNT_MISMATCH')
            names = [entry.filename for entry in entries]
            require(len(names) == len(set(names)) and names.count('manifest.json') == 1, 'ZIP_DUPLICATE_OR_MISSING_ENTRY')
            for entry in entries:
                mode = entry.external_attr >> 16
                require(not entry.is_dir() and not stat.S_ISLNK(mode) and not (entry.flag_bits & 1), 'ZIP_UNSUPPORTED_ENTRY')
                # archiver may represent zlib level 0 as DEFLATE stored blocks
                # (ZIP method 8), rather than ZIP method 0. The pinned workflow
                # input establishes level 0; the ZIP header cannot prove it.
                require(entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'ZIP_UNSUPPORTED_COMPRESSION')
            manifest_info = archive.getinfo('manifest.json')
            require(manifest_info.file_size <= MANIFEST_LIMIT, 'MANIFEST_TOO_LARGE')
            manifest_raw = archive.read('manifest.json')  # Also checks this entry's CRC.
            manifest = json.loads(manifest_raw)
            validate_manifest(manifest, args)
            require(set(names) == {'manifest.json'} | {c['name'] for c in manifest['chunks']}, 'ZIP_ENTRY_SET_MISMATCH')
            whole, recovered, checked = hashlib.sha256(), 0, []
            with partial.open('xb') as sink:
                for chunk in manifest['chunks']:
                    info = archive.getinfo(chunk['name'])
                    require(info.file_size == chunk['length'], 'ZIP_CHUNK_SIZE_MISMATCH')
                    chunk_hash, consumed = hashlib.sha256(), 0
                    with archive.open(info) as stream:
                        while consumed < chunk['length']:
                            check_time(deadline)
                            block = stream.read(min(BLOCK_BYTES, chunk['length'] - consumed))
                            require(bool(block), 'ZIP_TRUNCATED_CHUNK')
                            require(len(block) == min(BLOCK_BYTES, chunk['length'] - consumed), 'ZIP_SHORT_BLOCK')
                            require(block == block_at(recovered, len(block)), 'RECOVERED_SYNTHETIC_BYTES_MISMATCH')
                            require(sink.write(block) == len(block), 'RECEIVER_SHORT_WRITE')
                            consumed += len(block)
                            recovered += len(block)
                            chunk_hash.update(block)
                            whole.update(block)
                        require(stream.read(1) == b'', 'ZIP_EXTRA_CHUNK_BYTES')  # Full EOF/CRC, not a sample.
                    require(chunk_hash.hexdigest() == chunk['sha256'], 'RECOVERED_CHUNK_HASH_MISMATCH')
                    checked.append(dict(chunk, recoveredBytes=consumed, crcChecked=True))
                sink.flush()
                os.fsync(sink.fileno())
            require(recovered == total and whole.hexdigest() == manifest['outputSHA256'], 'RECOVERED_FULL_HASH_MISMATCH')
        reread_bytes, reread_sha = hash_file(partial, deadline)
        require(reread_bytes == total and reread_sha == manifest['outputSHA256'], 'RECEIVER_DISK_REREAD_MISMATCH')
        check_time(deadline)
        partial.rename(output / 'reconstructed.bin')
        with (output / 'manifest.json').open('xb') as stream:
            stream.write(manifest_raw)
        report = {'schema': 'vr180-artifact-recovery-v1', 'status': 'PASS', 'scope': 'synthetic-byte-transport-only',
                  'startedAt': started, 'finishedAt': now(), 'source': manifest['source'],
                  'trialId': manifest['trialId'], 'artifact': metadata,
                  'archiveBytes': archive_bytes, 'archiveSHA256': archive_sha,
                  'zipStructurePreflight': zip_structure,
                  'manifestSHA256': hashlib.sha256(manifest_raw).hexdigest(),
                  'inputBytes': manifest['inputBytes'], 'inputSHA256': manifest['inputSHA256'],
                  'outputBytes': total, 'outputSHA256': manifest['outputSHA256'],
                  'receiverBytesReadFromZIP': recovered, 'receiverDiskBytesReread': reread_bytes,
                  'receiverSHA256': reread_sha, 'missingChunks': [], 'duplicateChunks': [],
                  'allPayloadBytesIndependentlyCompared': True, 'chunks': checked,
                  'diskPreflight': disk, 'notVerified': NOT_VERIFIED}
        write_json(output / 'recovery.json', report)
        print(json.dumps({'status': 'PASS', 'scope': report['scope'], 'artifactId': metadata['id'],
                          'recoveredBytes': reread_bytes, 'sha256': reread_sha, 'report': str(output / 'recovery.json')}))
    except BaseException:
        # Only this invocation's incomplete local reconstruction is removed.
        partial.unlink(missing_ok=True)
        raise


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest='command', required=True)
    gen = commands.add_parser('generate')
    receive = commands.add_parser('verify')
    for command in (gen, receive):
        command.add_argument('--size-mib', type=int, choices=sorted(SIZES), required=True)
        command.add_argument('--output', type=Path, required=True)
    receive.add_argument('--archive', type=Path, required=True)
    receive.add_argument('--metadata', type=Path, required=True)
    receive.add_argument('--run-id', required=True)
    receive.add_argument('--run-attempt', type=int, required=True)
    receive.add_argument('--commit', required=True)
    receive.add_argument('--ref', required=True)
    return result


def main():
    args = parser().parse_args()
    try:
        (generate if args.command == 'generate' else verify)(args)
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED' if isinstance(error, Blocked) else 'FAIL',
                          'scope': 'synthetic-byte-transport-only', 'remoteRecoveryVerified': False,
                          'error': f'{type(error).__name__}: {error}'[:2000]}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
