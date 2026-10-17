"""Bounded, raw-only evidence archive for the private long producer."""
from __future__ import annotations

import gzip
import hashlib
import io
import os
from pathlib import Path
import re
import stat
import tarfile
import time

MIB = 1024**2
FILE_CAP = 4*MIB
RAW_CAP = 16*MIB
COMPRESSED_CAP = 8*MIB
TAR_CAP = 17*MIB
MAX_ENTRIES = 256
QUALITY_CAP = 65536
ROOT_NAMES = {'browser-observations.json', 'browser-lifecycle.json', 'runner-transfer.json',
              'private-source-inventory.json', 'fork-build-result.json', 'oracle-toolchain.json',
              'independent-verification.json', 'packet-statistics.json', 'source-provenance.json'}
OPTIONAL_ROOT_NAMES = {'source-inventory.json', 'environment.json'}
LOG_DIRS = {'oracle-logs', 'input-packet-stats', 'output-packet-stats'}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def check(deadline):
    if time.monotonic() >= deadline:
        raise TimeoutError('LONG_EVIDENCE_DEADLINE')


def safe_path(name):
    require(isinstance(name, str) and 0 < len(name) <= 240
            and all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*', part)
                    for part in name.split('/')), 'LONG_EVIDENCE_UNSAFE_PATH')
    return name


def stamp(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def regular(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), 'LONG_EVIDENCE_SYMLINK_OR_NONREGULAR')
    return info


def read_raw(path, deadline, cap=FILE_CAP):
    check(deadline)
    before = regular(path)
    require(0 <= before.st_size <= cap, 'LONG_EVIDENCE_FILE_BOUND')
    with path.open('rb') as stream:
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'LONG_EVIDENCE_OPEN_CHANGED')
        raw = stream.read(cap+1)
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'LONG_EVIDENCE_READ_CHANGED')
    require(len(raw) == before.st_size and stamp(regular(path)) == stamp(before), 'LONG_EVIDENCE_READ_CHANGED')
    check(deadline)
    return raw


def descriptor(name, raw):
    return {'path': safe_path(name), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def reject_secrets(raw):
    text = raw.decode('utf-8', 'strict')
    require(not re.search(r'(?i)(?:[?&](?:sig|signature|token|access_token|x-amz-signature|x-goog-signature)=|'
                          r'authorization\s*[:=]\s*["\s]*(?:bearer|basic)\s|'
                          r'github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]{20,}|'
                          r'-----BEGIN [A-Z ]*PRIVATE KEY-----)', text), 'LONG_EVIDENCE_CREDENTIAL_OR_SIGNED_URL')


def collect_references(meta, deadline):
    """Snapshot only named original records; include all zero-byte diagnostics."""
    require(meta.is_dir() and not meta.is_symlink(), 'LONG_EVIDENCE_DIRECTORY')
    refs = []
    total = 0
    for parent, directories, names in os.walk(meta, followlinks=False):
        check(deadline)
        for name in directories:
            path = Path(parent)/name
            relative = path.relative_to(meta).as_posix()
            require(not path.is_symlink() and relative in LOG_DIRS, 'LONG_EVIDENCE_UNKNOWN_DIRECTORY_OR_SYMLINK')
        for name in sorted(names):
            path = Path(parent)/name
            relative = safe_path(path.relative_to(meta).as_posix())
            parts = relative.split('/')
            allowed = relative in ROOT_NAMES|OPTIONAL_ROOT_NAMES or (len(parts) == 2
                and parts[0] in LOG_DIRS and re.fullmatch(r'[a-z0-9-]+\.stderr\.log', parts[1]))
            require(allowed, 'LONG_EVIDENCE_UNKNOWN_FILE:'+relative)
            raw = read_raw(path, deadline)
            reject_secrets(raw)
            refs.append(descriptor(relative, raw))
            total += len(raw)
            # Reserve one producer-record and the quality file before publication.
            require(len(refs) <= MAX_ENTRIES-2 and total <= RAW_CAP-2*QUALITY_CAP, 'LONG_EVIDENCE_REFERENCE_BOUND')
    require(ROOT_NAMES <= {r['path'] for r in refs}, 'QUALITY_REFERENCE_SET')
    return sorted(refs, key=lambda item: item['path'])


class BoundedWriter:
    def __init__(self, stream, limit):
        self.stream, self.limit, self.count = stream, limit, 0

    def write(self, raw):
        self.count += len(raw)
        require(self.count <= self.limit, 'LONG_EVIDENCE_ARCHIVE_BOUND')
        require(self.stream.write(raw) == len(raw), 'LONG_EVIDENCE_SHORT_WRITE')
        return len(raw)

    def flush(self):
        self.stream.flush()


def create_bundle(meta, destination, refs, quality_raw, publications, deadline):
    require(len(quality_raw) <= QUALITY_CAP and len(refs) <= MAX_ENTRIES-1, 'LONG_EVIDENCE_ENTRY_BOUND')
    expected = {r['path']: r for r in refs}
    require(len(expected) == len(refs) and 'quality-evidence.json' not in expected, 'LONG_EVIDENCE_DUPLICATE_REFERENCE')
    expected['quality-evidence.json'] = descriptor('quality-evidence.json', quality_raw)
    require(sum(r['bytes'] for r in expected.values()) <= RAW_CAP, 'LONG_EVIDENCE_RAW_BOUND')
    actual = set()
    for parent, directories, names in os.walk(meta, followlinks=False):
        for name in directories:
            path = Path(parent)/name
            require(not path.is_symlink() and path.relative_to(meta).as_posix() in LOG_DIRS, 'LONG_EVIDENCE_UNKNOWN_DIRECTORY_OR_SYMLINK')
        for name in names:
            actual.add(safe_path((Path(parent)/name).relative_to(meta).as_posix()))
    require(actual == expected.keys(), 'LONG_EVIDENCE_REFERENCE_SET_CHANGED')
    check(deadline)
    with destination.open('xb') as target:
        info = os.fstat(target.fileno())
        publications.append({'path': destination, 'identity': (info.st_dev, info.st_ino), 'removed': False})
        with gzip.GzipFile(filename='', fileobj=BoundedWriter(target, COMPRESSED_CAP), mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=BoundedWriter(gz, TAR_CAP), mode='w|', format=tarfile.USTAR_FORMAT) as archive:
                for name, entry in sorted(expected.items()):
                    raw = read_raw(meta/name, deadline)
                    require(descriptor(name, raw) == entry, 'LONG_EVIDENCE_SOURCE_CHANGED')
                    reject_secrets(raw)
                    info = tarfile.TarInfo(name)
                    info.size = len(raw)
                    # One bounded immutable metadata record is fed to tar, not a media file.
                    archive.addfile(info, io.BytesIO(raw))
        target.flush()
        os.fsync(target.fileno())
    check(deadline)
    # Full compressed reread plus full raw-member reread, without extraction.
    before = regular(destination)
    require(0 < before.st_size <= COMPRESSED_CAP, 'LONG_EVIDENCE_COMPRESSED_BOUND')
    digest = hashlib.sha256()
    count = 0
    with destination.open('rb') as stream:
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'LONG_EVIDENCE_BUNDLE_OPEN_CHANGED')
        while True:
            check(deadline)
            block = stream.read(MIB)
            if not block:
                break
            count += len(block)
            require(count <= COMPRESSED_CAP, 'LONG_EVIDENCE_COMPRESSED_BOUND')
            digest.update(block)
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'LONG_EVIDENCE_BUNDLE_CHANGED')
    require(count == before.st_size, 'LONG_EVIDENCE_BUNDLE_SIZE')
    seen = set()
    with tarfile.open(destination, 'r|gz') as archive:
        for member in archive:
            check(deadline)
            require(member.isfile() and member.name in expected and member.name not in seen, 'LONG_EVIDENCE_ARCHIVE_ENTRY')
            entry = expected[member.name]
            require(member.size == entry['bytes'] and member.size <= FILE_CAP, 'LONG_EVIDENCE_ARCHIVE_SIZE')
            with archive.extractfile(member) as stream:
                raw = stream.read(FILE_CAP+1)
            require(descriptor(member.name, raw) == entry, 'LONG_EVIDENCE_ARCHIVE_HASH')
            seen.add(member.name)
    require(seen == expected.keys() and stamp(regular(destination)) == stamp(before), 'LONG_EVIDENCE_ARCHIVE_SET_OR_CHANGED')
    check(deadline)
    return {'name': destination.name, 'bytes': count, 'sha256': digest.hexdigest()}
