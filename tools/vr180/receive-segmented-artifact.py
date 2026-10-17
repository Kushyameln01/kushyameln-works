#!/usr/bin/env python3
"""Bounded, sequential recovery of privately tested segmented artifacts.

No credentials or networking: connector downloads are supplied one ZIP at a time.
Byte recovery PASS is separate from media quality. Partial output never has PASS.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import time
import zipfile

MIB = 1024**2
HEX = re.compile(r'^[0-9a-f]{64}$')
PROFILES = {
    'service-8mib': {'part': 8*MIB, 'files': [('payload-a', 'payload-a.bin', 60*MIB), ('payload-b', 'payload-b.bin', 60*MIB)]},
    'single-128mib': {'part': 128*MIB, 'files': [('payload-a', 'payload-a.bin', 128*MIB)]},
    'p5-receiver-calibration32': {'part': 128*MIB, 'files': [('input', 'input.mp4', 80*MIB), ('output', 'output.mp4', 80*MIB)]},
    # Workflow gates require separate receiver short-media acceptance first.

    'p5-5gb': {'part': 128*MIB, 'files': [('input', 'input.mp4', 5_100_000_000), ('output', 'output.mp4', 5_200_000_000)]},
    'p5-10gb': {'part': 128*MIB, 'files': [('input', 'input.mp4', 10_100_000_000), ('output', 'output.mp4', 10_200_000_000)]},
}


def need(condition, reason):
    if not condition:
        raise ValueError(reason)


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def check_deadline(deadline):
    if deadline is not None:
        need(time.time() < deadline, 'RECEIVER_DEADLINE')


def read_json(path, limit=MIB):
    need(path.is_file() and not path.is_symlink() and path.stat().st_size <= limit, 'JSON_FILE_BOUND')
    return json.loads(path.read_bytes())


def write_json(path, value, deadline=None):
    temporary = path.with_name(path.name + '.new')
    created = None
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            created = os.fstat(stream.fileno())
            json.dump(value, stream, indent=2); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        check_deadline(deadline); os.replace(temporary, path)
    except BaseException:
        if created is not None and temporary.exists():
            current = temporary.lstat()
            if (current.st_dev,current.st_ino) == (created.st_dev,created.st_ino):
                temporary.unlink()
        raise


def hash_file(path, deadline=None):
    need(path.is_file() and not path.is_symlink(), 'REGULAR_FILE_REQUIRED')
    h = hashlib.sha256(); size = 0
    with path.open('rb') as stream:
        while block := stream.read(MIB):
            check_deadline(deadline)
            size += len(block); h.update(block)
    check_deadline(deadline)
    return size, h.hexdigest()


def copy_payload(source, dest, deadline):
    while block := source.read(MIB):
        check_deadline(deadline); dest.write(block)
    check_deadline(deadline)


def prefix(manifest):
    i = manifest['identity']
    return f"vr180-seg-{manifest['profile']}-{i['runId']}-{i['runAttempt']}-{i['job']}"


def validate_manifest(m, identity):
    need(m['schema'] == 'vr180-segmented-transfer-v1' and m['status'] == 'COMPLETE', 'MANIFEST_NOT_COMPLETE')
    need(m['identity'] == identity and identity['repository'] == 'Kushyameln01/kushyameln-works'
         and re.fullmatch(r'[0-9a-f]{40}', identity['commit'])
         and identity['ref'].startswith('refs/heads/codex/vr180-plan-')
         and re.fullmatch(r'[0-9]+', str(identity['runId']))
         and re.fullmatch(r'[1-9][0-9]*', str(identity['runAttempt']))
         and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', identity['job']), 'IDENTITY')
    need(m['profile'] in PROFILES, 'PROFILE')
    p = PROFILES[m['profile']]
    if m['profile'] in ('service-8mib', 'single-128mib'):
        need(m['generator'] == {'seed': 'vr180-public-segmented-transfer-2026-10-17',
             'algorithm': 'SHAKE256(seed+NUL+fileId+NUL+decimal-byte-offset)-1MiB-blocks-v1',
             'blockBytes': MIB}, 'GENERATOR_CONTRACT')
    need(m['partBytes'] == p['part'] and HEX.fullmatch(m['sourceManifestSHA256']), 'PART_CONTRACT')
    need(type(m['files']) is list and len(m['files']) == len(p['files']), 'FILE_COUNT')
    total = parts = 0; artifact_ids = set()
    for f, (fid, name, cap) in zip(m['files'], p['files']):
        need(f['id'] == fid and f['name'] == name and integer(f['bytes'], 1, cap)
             and HEX.fullmatch(f['sha256']), 'FILE_CONTRACT')
        if m['profile'] in ('service-8mib', 'single-128mib'):
            need(f['bytes'] == cap, 'PROBE_EXACT_SIZE')
        count = (f['bytes'] + p['part'] - 1)//p['part']
        need(f['partCount'] == count and type(f['parts']) is list and len(f['parts']) == count, 'PART_COUNT')
        offset = 0
        for n, part in enumerate(f['parts']):
            size = min(p['part'], f['bytes'] - offset); a = part['artifact']
            need(part['index'] == n and part['offset'] == offset and part['length'] == size
                 and HEX.fullmatch(part['sha256']), 'PART_CONTIGUITY')
            need(integer(a['id'], 1, 2**53-1) and a['id'] not in artifact_ids
                 and a['name'] == f'{prefix(m)}-{fid}-{n:05d}'
                 and integer(a['sizeBytes'], 22, size+MIB)
                 and re.fullmatch(r'sha256:[0-9a-f]{64}', a['digest']), 'ARTIFACT_CONTRACT')
            artifact_ids.add(a['id']); offset += size
        total += f['bytes']; parts += count
    need(m['totalBytes'] == total and m['partCount'] == parts and 1 <= parts <= 200, 'TOTALS')
    if m['profile'] == 'p5-receiver-calibration32':
        need(total <= 120*MIB and parts == 2, 'CALIBRATION_PAIR_BOUND')
    return m


def artifact_metadata(record, name, identity):
    rows = record.get('artifacts') if isinstance(record, dict) else None
    if rows is None:
        rows = [record]
    found = [a for a in rows if a.get('name') == name]
    need(len(found) == 1, 'UNIQUE_ARTIFACT')
    a = found[0]; run = a['workflow_run']
    need(not a['expired'] and str(run['id']) == str(identity['runId'])
         and run['head_sha'] == identity['commit']
         and run['head_branch'] == identity['ref'].removeprefix('refs/heads/'), 'ARTIFACT_IDENTITY')
    return a


def zip_preflight(path, cap):
    size = path.stat().st_size
    need(22 <= size <= cap+MIB, 'ZIP_SIZE_BOUND')
    with path.open('rb') as stream:
        length = min(size, 22+65535); stream.seek(size-length); tail = stream.read(length)
        at = tail.rfind(b'PK\x05\x06'); need(at >= 0 and len(tail)-at >= 22, 'EOCD')
        _, disk, cd_disk, disk_count, count, cd_size, cd_at, comment = struct.unpack_from('<4sHHHHIIH', tail, at)
        need(disk == cd_disk == 0 and comment <= 256 and at+22+comment == len(tail), 'EOCD_FIELDS')
        end = size-length+at; boundary = end
        if end >= 20:
            stream.seek(end-20); locator = stream.read(20)
            if locator[:4] == b'PK\x06\x07':
                _, zdisk, zat, disks = struct.unpack('<4sIQI', locator)
                need(zdisk == 0 and disks == 1 and zat+56 == end-20, 'ZIP64_LOCATOR')
                stream.seek(zat); raw = stream.read(56); need(len(raw) == 56, 'ZIP64_LENGTH')
                z = struct.unpack('<4sQHHIIQQQQ', raw)
                need(z[0] == b'PK\x06\x06' and z[1] == 44 and z[3] <= 45 and z[4] == z[5] == 0, 'ZIP64_EOCD')
                need(disk_count in (z[6],65535) and count in (z[7],65535)
                     and cd_size in (z[8],0xffffffff) and cd_at in (z[9],0xffffffff), 'ZIP64_CONSISTENCY')
                disk_count, count, cd_size, cd_at = z[6:10]; boundary = zat
        need(disk_count == count == 1 and 46 <= cd_size <= 4096 and cd_at+cd_size == boundary, 'CENTRAL_DIRECTORY_BOUND')


def verified_archive(path, metadata, name, cap, deadline=None):
    size, sha = hash_file(path, deadline)
    need(size == metadata['size_in_bytes'] and metadata['digest'] == 'sha256:'+sha, 'ARCHIVE_DIGEST')
    zip_preflight(path, cap)
    archive = zipfile.ZipFile(path)
    try:
        entries = archive.infolist()
        need(len(entries) == 1 and entries[0].filename == name, 'ZIP_SINGLE_KNOWN_ENTRY')
        e = entries[0]
        need(not e.is_dir() and not e.flag_bits & 1 and not stat.S_ISLNK(e.external_attr>>16)
             and e.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
             and 0 < e.file_size <= cap and e.compress_size <= e.file_size+MIB, 'ZIP_ENTRY_BOUND')
        return archive, {'archiveBytes': size, 'archiveSHA256': sha, 'artifactId': metadata['id']}
    except BaseException:
        archive.close(); raise


def initialize(archive_path, metadata_record, identity, receipt, out):
    need(not out.exists() and not out.is_symlink(), 'OUTPUT_MUST_BE_NEW')
    # Receipt is independently recovered from the cloud job's bounded evidence log.
    need(receipt['schema'] == 'vr180-segmented-transfer-v1'
         and receipt['status'] == 'COMPLETE_MANIFEST_UPLOADED'
         and receipt['identity'] == identity and receipt['profile'] in PROFILES, 'RECEIPT_IDENTITY')
    expected_name = f"vr180-seg-{receipt['profile']}-{identity['runId']}-{identity['runAttempt']}-{identity['job']}-complete"
    metadata = artifact_metadata(metadata_record, expected_name, identity)
    ra = receipt['completion']['artifact']
    need(ra['id'] == metadata['id'] and ra['name'] == expected_name
         and ra['digest'] == metadata['digest'] and ra['sizeBytes'] == metadata['size_in_bytes'], 'COMPLETION_RECEIPT')
    archive, proof = verified_archive(archive_path, metadata, 'completion.json', 256*1024)
    with archive:
        raw = archive.read('completion.json')
    need(len(raw) == receipt['completion']['bytes']
         and hashlib.sha256(raw).hexdigest() == receipt['completion']['sha256'], 'COMPLETION_CONTENT_HASH')
    m = validate_manifest(json.loads(raw), identity)
    need(m['profile'] == receipt['profile'] and m['totalBytes'] == receipt['totalBytes']
         and m['partCount'] == receipt['partCount'], 'RECEIPT_PROFILE')
    required = m['totalBytes'] + 2*128*MIB + 32*MIB + 2*1024*MIB
    free = shutil.disk_usage(out.parent).free
    need(free >= required, 'RECEIVER_CAPACITY')
    state = {'schema': 'vr180-segmented-recovery-v1', 'status': 'PARTIAL', 'manifestSHA256': hashlib.sha256(raw).hexdigest(),
             'identity': identity, 'profile': m['profile'], 'completionArtifact': proof,
             'startedUnix': time.time(), 'deadlineUnix': time.time()+7200,
             'capacity': {'requiredBytes': required, 'freeBytes': free},
             'files': [{'id': f['id'], 'name': f['name'], 'receivedBytes': 0, 'nextIndex': 0} for f in m['files']], 'parts': []}
    out.mkdir(); created = []
    try:
        for name, content in [('completion.json',raw)]+[(f['name'],b'') for f in state['files']]:
            target = out/name
            with target.open('xb') as stream:
                info = os.fstat(stream.fileno()); created.append((target,info.st_dev,info.st_ino))
                stream.write(content); stream.flush(); os.fsync(stream.fileno())
        write_json(out/'recovery.json', state)
    except BaseException as error:
        try:
            for target,dev,ino in reversed(created):
                current = target.lstat(); need((current.st_dev,current.st_ino) == (dev,ino), 'INIT_CLEANUP_OWNER_CHANGED')
                target.unlink()
            out.rmdir()  # Never recursively delete an unexpected entry.
        except Exception as cleanup:
            error.add_note('Initialization cleanup retained owned partial output: '+str(cleanup))
        raise
    return state


def load_state(out):
    need(out.is_dir() and not out.is_symlink(), 'OWNED_OUTPUT_DIRECTORY')
    state = read_json(out/'recovery.json', MIB)
    need(time.time() < state['deadlineUnix'], 'RECEIVER_DEADLINE')
    manifest_path = out/'completion.json'
    need(manifest_path.is_file() and not manifest_path.is_symlink()
         and manifest_path.stat().st_size <= 256*1024, 'MANIFEST_BOUND')
    raw = manifest_path.read_bytes()
    need(hashlib.sha256(raw).hexdigest() == state['manifestSHA256'], 'SAVED_MANIFEST_CHANGED')
    m = validate_manifest(json.loads(raw), state['identity'])
    need(state['status'] == 'PARTIAL' and state['profile'] == m['profile'], 'PARTIAL_STATE_REQUIRED')
    return state, m


def receive_part(out, archive_path, metadata_record, file_id, index):
    state, m = load_state(out)
    f = next(x for x in m['files'] if x['id'] == file_id)
    row = next(x for x in state['files'] if x['id'] == file_id)
    need(integer(index, 0, len(f['parts'])-1) and row['nextIndex'] == index, 'SEQUENTIAL_PART_REQUIRED')
    part = f['parts'][index]; a = part['artifact']
    metadata = artifact_metadata(metadata_record, a['name'], m['identity'])
    need(a['id'] == metadata['id'] and a['sizeBytes'] == metadata['size_in_bytes']
         and a['digest'] == metadata['digest'], 'PART_ARTIFACT_RECEIPT')
    target = out/f['name']; need(target.is_file() and not target.is_symlink()
        and target.stat().st_size == part['offset'] == row['receivedBytes'], 'PART_OUTPUT_OFFSET')
    deadline = state['deadlineUnix']
    archive, proof = verified_archive(archive_path, metadata, 'chunk.bin', part['length'], deadline)
    # Verify CRC/raw bytes before appending; never accept a corrupted part prefix.
    h = hashlib.sha256(); count = 0
    with archive:
        need(archive.getinfo('chunk.bin').file_size == part['length'], 'PART_ENTRY_LENGTH')
        with archive.open('chunk.bin') as source:
            while block := source.read(MIB):
                check_deadline(deadline)
                count += len(block); need(count <= part['length'], 'PART_LENGTH'); h.update(block)
        need(count == part['length'] and h.hexdigest() == part['sha256'], 'PART_RAW_SHA256')
        owner = target.stat()
        try:
            with archive.open('chunk.bin') as source, target.open('ab') as dest:
                copy_payload(source, dest, deadline); dest.flush(); os.fsync(dest.fileno())
            need(target.stat().st_size == part['offset']+count, 'APPENDED_SIZE')
            row['receivedBytes'] += count; row['nextIndex'] += 1
            state['parts'].append({'fileId': file_id, 'index': index, 'offset': part['offset'], 'length': count,
                                   'sha256': h.hexdigest(), 'crcCheckedByFullRead': True, **proof})
            write_json(out/'recovery.json', state, deadline)
        except BaseException as error:
            try:
                current = target.lstat()
                need((current.st_dev,current.st_ino) == (owner.st_dev,owner.st_ino)
                     and part['offset'] <= current.st_size <= part['offset']+count, 'ROLLBACK_OWNER_OR_SIZE_CHANGED')
                with target.open('r+b') as dest:
                    dest.truncate(part['offset']); dest.flush(); os.fsync(dest.fileno())
            except Exception as rollback:
                error.add_note('Part append rollback failed; recovery must remain incomplete: '+str(rollback))
            raise
    return {'fileId': file_id, 'nextIndex': row['nextIndex'], 'receivedBytes': row['receivedBytes'], 'status': 'PARTIAL'}


def finalize(out):
    state, m = load_state(out); proofs = []
    for f, row in zip(m['files'], state['files']):
        need(row['id'] == f['id'] and row['receivedBytes'] == f['bytes'] and row['nextIndex'] == f['partCount'], 'INCOMPLETE_FILE')
        size, sha = hash_file(out/f['name'], state['deadlineUnix'])
        need(size == f['bytes'] and sha == f['sha256'], 'WHOLE_FILE_READBACK_SHA256')
        proof = {'id': f['id'], 'name': f['name'], 'bytes': size, 'sha256': sha}
        if m['profile'] in ('service-8mib', 'single-128mib'):
            offset = 0
            with (out/f['name']).open('rb') as stream:
                while block := stream.read(MIB):
                    check_deadline(state['deadlineUnix'])
                    seed = 'vr180-public-segmented-transfer-2026-10-17\0'+f['id']+'\0'+str(offset)
                    expected = hashlib.shake_256(seed.encode('ascii')).digest(len(block))
                    need(block == expected, 'INDEPENDENT_GENERATOR_BYTES'); offset += len(block)
            need(offset == size, 'GENERATOR_EOF'); proof['independentGeneratorComparedBytes'] = offset
        proofs.append(proof)
    need(len(state['parts']) == m['partCount'], 'INCOMPLETE_PARTS')
    state.update(status='PASS', completedUnix=time.time(), wholeFiles=proofs,
                 scope='Complete byte recovery; independent media quality remains separate and unassessed')
    write_json(out/'recovery.json', state, state['deadlineUnix'])
    return state


def main():
    p = argparse.ArgumentParser(description=__doc__); sub = p.add_subparsers(dest='operation', required=True)
    for operation in ('init', 'part', 'finalize'):
        q = sub.add_parser(operation); q.add_argument('--output', type=Path, required=True)
        if operation != 'finalize':
            q.add_argument('--archive', type=Path, required=True); q.add_argument('--metadata', type=Path, required=True)
        if operation == 'init':
            q.add_argument('--identity', type=Path, required=True); q.add_argument('--receipt', type=Path, required=True)
        if operation == 'part':
            q.add_argument('--file-id', required=True); q.add_argument('--index', type=int, required=True)
    a = p.parse_args()
    if a.operation == 'init':
        result = initialize(a.archive, read_json(a.metadata, 4*MIB), read_json(a.identity, 4096), read_json(a.receipt, MIB), a.output)
    elif a.operation == 'part':
        result = receive_part(a.output, a.archive, read_json(a.metadata, 4*MIB), a.file_id, a.index)
    else:
        result = finalize(a.output)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
