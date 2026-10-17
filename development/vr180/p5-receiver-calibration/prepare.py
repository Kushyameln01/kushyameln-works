#!/usr/bin/env python3
"""Wrap a fresh, unchanged 32/32 Mbps calibration for the separate receiver."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tarfile
import time

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = 'development/vr180/p5-receiver-calibration/prepare.py'
PRODUCER = 'development/vr180/p5-calibration-prototype/probe-calibration.py'
PROFILE = 'p5-receiver-calibration32'
JOB = 'p5-receiver-calibration'
MIB = 1024**2
BLOCK = MIB
FILE_CAP = 80*MIB
PAIR_CAP = 120*MIB
RAW_CAP = 16*MIB
BUNDLE_CAP = 8*MIB
JSON_CAP = 4*MIB
QUALITY_CAP = 64*1024
MAX_FILES = 256
ORIGINAL_SOURCES = sorted({
    PRODUCER,
    'development/vr180/p5-calibration-prototype/frame.mjs',
    'development/vr180/p5-calibration-prototype/worker.mjs',
    'development/vr180/indexed-transform-prototype/transform.mjs',
    'development/vr180/input-index-prototype/input-index.mjs',
    'development/vr180/input-index-prototype/presentation-index.mjs',
    'development/vr180/output-index-prototype/output-index.mjs',
    'development/vr180/output-index-prototype/mp4-output-inspect.mjs',
    'development/vr180/index-prototype/index-store.mjs',
    'development/vr180/index-prototype/job-owner.mjs',
    'docs/shared/vr180/geometry.mjs', 'docs/shared/vr180/file-output.mjs',
    'docs/shared/vr180/sha256.mjs', 'docs/shared/vr180/mp4.mjs',
    'tools/vr180/probe-output-index.py', 'tools/vr180/probe-indexed-conversion.py',
    'tools/vr180/cloud-validate.py', 'tools/vr180/verify-conversion-large.py',
    'tools/vr180/verify-metadata.py',
})
REQUIRED = {
    'source-inventory.json', 'environment.json', 'oracle-toolchain.json',
    'fork-build-result.json', 'private-source-inventory.json',
    'browser-observations.json', 'independent-verification.json',
    'packet-statistics.json', 'run.json', 'manifest.json',
}
REQUIRED_SCANS = ['input-video-frames', 'output-video-frames', 'input-packets',
                  'output-packets', 'expected-rgb', 'actual-rgb', 'input-hash', 'output-hash']


def require(ok, message):
    if not ok:
        raise ValueError(message)


def check_deadline(deadline):
    require(time.monotonic() < deadline, 'WRAPPER_DEADLINE')


def safe_relative(name):
    require(isinstance(name, str) and 0 < len(name) <= 240
            and all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*', p)
                    for p in name.split('/')), 'UNSAFE_RELATIVE_PATH')
    return name


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False)+'\n').encode()


def regular(path):
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode), 'REGULAR_FILE_REQUIRED:'+str(path))
    return s


def stamp(s):
    return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns


def read_bounded(path, cap=JSON_CAP):
    before = regular(path)
    require(before.st_size <= cap, 'METADATA_FILE_BOUND')
    with path.open('rb') as stream:
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'OPEN_FILE_CHANGED')
        raw = stream.read(cap+1)
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'READ_FILE_CHANGED')
    require(len(raw) == before.st_size and stamp(regular(path)) == stamp(before), 'READ_FILE_CHANGED')
    return raw


def parsed(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda v: (_ for _ in ()).throw(ValueError('NONFINITE_JSON')))


def no_secrets(raw):
    # Refuse the whole bundle; never silently redact or alter original evidence.
    text = raw.decode('utf-8', 'strict')
    require(not re.search(r'(?i)(?:[?&](?:sig|signature|token|access_token|x-amz-signature|x-goog-signature)=|'
                          r'authorization\s*[:=]\s*["\s]*(?:bearer|basic)\s|'
                          r'github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]{20,}|'
                          r'-----BEGIN [A-Z ]*PRIVATE KEY-----)', text), 'CREDENTIAL_OR_SIGNED_URL_IN_EVIDENCE')


def source_identity(env=os.environ):
    value = {key: env.get(name, '') for key, name in [
        ('repository', 'GITHUB_REPOSITORY'), ('commit', 'GITHUB_SHA'),
        ('ref', 'GITHUB_REF'), ('runId', 'GITHUB_RUN_ID'), ('job', 'GITHUB_JOB')]}
    value['runAttempt'] = int(env.get('GITHUB_RUN_ATTEMPT', '0'))
    require(value['repository'] == 'Kushyameln01/kushyameln-works' and value['job'] == JOB, 'WRAPPER_REPOSITORY_JOB')
    for key, pattern in [('commit', r'[0-9a-f]{40}'), ('ref', r'refs/heads/codex/vr180-plan-[A-Za-z0-9._/-]+'),
                         ('runId', r'[1-9][0-9]{0,19}')]:
        require(re.fullmatch(pattern, value[key]), 'WRAPPER_IDENTITY_'+key)
    require(1 <= value['runAttempt'] <= 50, 'WRAPPER_ATTEMPT')
    return value


def source_hashes(identity):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT, timeout=15)
    require(git('rev-parse', 'HEAD').decode().strip() == identity['commit'], 'WRAPPER_HEAD_DIFFERS')
    result = {}
    for name in [*ORIGINAL_SOURCES, SCRIPT]:
        raw = read_bounded(ROOT/name, 8*MIB)
        require(raw == git('show', 'HEAD:'+name), 'WRAPPER_SOURCE_NOT_HEAD:'+name)
        result[name] = sha(raw)
    return result


def load_calibration():
    spec = importlib.util.spec_from_file_location('receiver_fixed_calibration', ROOT/PRODUCER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def evidence_inventory(directory):
    require(directory.is_dir() and not directory.is_symlink(), 'EVIDENCE_DIRECTORY')
    files = {}
    for parent, dirs, names in os.walk(directory, followlinks=False):
        for name in dirs:
            path = Path(parent)/name
            require(not path.is_symlink(), 'EVIDENCE_DIRECTORY_SYMLINK')
            safe_relative(path.relative_to(directory).as_posix())
        for name in names:
            path = Path(parent)/name
            relative = safe_relative(path.relative_to(directory).as_posix())
            require(relative in REQUIRED or re.fullmatch(
                r'(?:oracle-logs|input-packet-stats|output-packet-stats)/[a-z0-9-]+\.stderr\.log', relative),
                'UNEXPECTED_EVIDENCE_FILE:'+relative)
            raw = read_bounded(path)
            no_secrets(raw)
            files[relative] = raw
            require(len(files) <= MAX_FILES-4 and sum(map(len, files.values())) <= RAW_CAP-QUALITY_CAP, 'EVIDENCE_INVENTORY_BOUND')
    require(REQUIRED <= files.keys(), 'MISSING_EVIDENCE_FILE')
    manifest = parsed(files['manifest.json'])
    require(manifest.get('schema') == 'vr180-evidence-manifest-v1'
            and manifest.get('manifestExcludesItself') is True, 'ORIGINAL_EVIDENCE_MANIFEST')
    expected = sorted([{'name': n, 'bytes': len(b), 'sha256': sha(b)} for n, b in files.items()
                       if n != 'manifest.json'], key=lambda v: v['name'])
    require(manifest.get('files') == expected, 'ORIGINAL_EVIDENCE_INVENTORY_DIFFERS')
    return files


def validate_calibration(original, media_manifest, identity, sources, calibration):
    report = parsed(original['run.json'])
    observed = parsed(original['browser-observations.json'])
    verified = parsed(original['independent-verification.json'])
    packets = parsed(original['packet-statistics.json'])
    expected_run = f"{identity['runId']}-p5-32-32-{identity['runAttempt']}"
    expected_sources = {n: sources[n] for n in ORIGINAL_SOURCES}
    require(report.get('schema') == 'vr180-p5-ten-second-calibration-v1'
            and report.get('status') == 'READY_FOR_ARTIFACT_RECOVERY', 'CALIBRATION_NOT_READY')
    for item in [report, media_manifest]:
        require(item.get('runId') == expected_run and item.get('checkoutCommit') == identity['commit']
                and item.get('case') == '32-32', 'CALIBRATION_RUN_COMMIT_CASE')
    require(parsed(original['manifest.json']).get('runId') == expected_run, 'ORIGINAL_MANIFEST_RUN')
    require(all(parsed(original[name]).get('checkoutCommit') == identity['commit']
                for name in ('source-inventory.json', 'private-source-inventory.json')), 'SOURCE_INVENTORY_COMMIT')
    require(parsed(original['environment.json']).get('status') == 'READY', 'ORIGINAL_ENVIRONMENT_NOT_READY')
    build = parsed(original['fork-build-result.json'])
    require(build.get('status') == 'PASS' and build.get('variant') == 'combined-input-output'
            and build.get('baseline', {}).get('status') == 'PASS'
            and build['baseline'].get('comparison', {}).get('identical') is True, 'ORIGINAL_BUILD_GATE')
    require(report.get('sourceHashesBefore') == expected_sources == report.get('sourceHashesAfter'), 'CALIBRATION_SOURCE_CLOSURE')
    require(report.get('harnessSHA256') == sources[PRODUCER]
            and report.get('sharedHarnessSHA256') == sources['tools/vr180/cloud-validate.py'], 'CALIBRATION_HARNESS_HASH')
    require(report.get('frames') == 300 and report.get('fps') == 30 and report.get('seconds') == 10
            and report.get('silent') is True and report.get('publicProfileChanged') is False, 'CALIBRATION_FIXED_PROFILE')
    require(report.get('completeCloudMedia') is True and report.get('mediaArtifactReady') is True
            and report.get('pageErrors') == [] and report.get('cleanup', {}).get('status') == 'REMOVED'
            and report['cleanup'].get('heldLocks') == 0, 'CALIBRATION_NATIVE_OR_CLEANUP_INCOMPLETE')
    require(report.get('mediaManifest') == media_manifest and report.get('packetStatistics') == packets,
            'CALIBRATION_REPORT_DISAGREES')
    require(observed.get('status') == 'READY_FOR_DOWNLOAD' and observed.get('caseName') == '32-32'
            and observed.get('frames') == 300 and observed.get('fps') == 30
            and observed.get('seconds') == 10 and observed.get('silent') is True
            and observed.get('heldLocks') == 0 and observed.get('unhandledCount') == 0
            and not observed.get('unhandledErrors'), 'NATIVE_OBSERVATION_INCOMPLETE')
    generation = observed.get('generation', {})
    cleanup = observed.get('conversionCleanup', {})
    require(generation.get('frames') == 300 and generation.get('packets') == 300
            and generation.get('cleanup', {}).get('directoryRemoved') is True
            and generation['cleanup'].get('indexReservedBytes') == 0
            and cleanup.get('inputDirectoryRemoved') is True and cleanup.get('outputDirectoryRemoved') is True
            and cleanup.get('metrics', {}).get('indexReservedAfterCleanup') == 0, 'INDEX_CLEANUP_INCOMPLETE')
    require(report.get('browserMetrics') == {'generation': generation, 'conversion': observed.get('conversion')},
            'BROWSER_METRICS_DIFFERS')
    require(media_manifest.get('schema') == 'vr180-calibration-media-artifact-v1'
            and media_manifest.get('completeScan') is True and verified.get('completeScan') is True
            and verified.get('mode') == 'convert'
            and verified.get('settings') == {'layout': 'sbs', 'fov': 180, 'eyeSize': 512}, 'FULL_SCAN_REQUIRED')
    require(all(verified.get('scans', {}).get(n, {}).get('endReached') is True for n in REQUIRED_SCANS), 'FULL_SCAN_EOF_REQUIRED')
    require(all(packets.get(side, {}).get('completeScan') is True
                and packets[side].get('scans', {}).get('video-packets', {}).get('endReached') is True
                for side in ('input', 'output')), 'PACKET_SCAN_EOF_REQUIRED')
    require(verified.get('status') in ('PASS', 'FAIL')
            and media_manifest.get('independentVerification') == report.get('independentVerification') == verified['status']
            and media_manifest.get('verifierSHA256') == verified.get('verifierSHA256') == sources['tools/vr180/verify-conversion-large.py'],
            'VERIFIER_STATUS_OR_SOURCE_DIFFERS')
    verdict = calibration.calibration_verdict(verified, packets)
    require(verdict == report.get('calibrationVerdict') == media_manifest.get('calibrationVerdict'), 'QUALITY_VERDICT_DISAGREES')
    files = media_manifest.get('files')
    require(isinstance(files, list) and len(files) == 2 and observed.get('files') == files, 'MEDIA_DESCRIPTOR_COUNT_OR_BROWSER_DIFFERS')
    for side, entry in zip(('input', 'output'), files):
        require(entry.get('name') == side+'.mp4' and type(entry.get('bytes')) is int
                and 0 < entry['bytes'] <= FILE_CAP and re.fullmatch(r'[0-9a-f]{64}', entry.get('sha256', '')), 'MEDIA_DESCRIPTOR')
        require(verified.get(side+'Bytes') == entry['bytes'] and verified.get(side+'SHA256') == entry['sha256'], 'VERIFIER_MEDIA_DIFFERS')
    require(sum(f['bytes'] for f in files) <= PAIR_CAP, 'MEDIA_PAIR_BOUND')
    saved = observed.get('conversion', {}).get('saved', {})
    require(saved.get('committed') is True and saved.get('bytes') == files[1]['bytes']
            and saved.get('sha256') == files[1]['sha256'], 'OUTPUT_NOT_COMMITTED_OR_DIFFERS')
    require(generation.get('sha256') == files[0]['sha256'], 'GENERATOR_INPUT_DIFFERS')
    return report, verdict, [{'id': side, **entry} for side, entry in zip(('input', 'output'), files)]


class Publications:
    """Remove only files created by this invocation, never an unknown replacement."""
    def __init__(self):
        self.entries = []

    def open(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        stream = path.open('xb')
        s = os.fstat(stream.fileno())
        self.entries.append((path, s.st_dev, s.st_ino))
        return stream

    def write(self, path, raw):
        with self.open(path) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())

    def rollback(self):
        held = []
        for path, device, inode in reversed(self.entries):
            try:
                s = path.lstat()
                if stat.S_ISREG(s.st_mode) and (s.st_dev, s.st_ino) == (device, inode):
                    path.unlink()
                else:
                    held.append({'path': str(path), 'reason': 'UNKNOWN_REPLACEMENT'})
            except FileNotFoundError:
                pass
            except Exception as error:
                held.append({'path': str(path), 'reason': 'CLEANUP_FAILED',
                             'error': (type(error).__name__+': '+str(error))[:512]})
        return {'status': 'HOLD' if held else 'CLEANED', 'attempted': len(self.entries), 'held': held}


def hash_file(path, cap, deadline):
    before = regular(path)
    require(0 < before.st_size <= cap, 'FILE_BOUND')
    digest = hashlib.sha256()
    count = 0
    with path.open('rb') as stream:
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'HASH_OPEN_CHANGED')
        while True:
            check_deadline(deadline)
            block = stream.read(BLOCK)
            if not block:
                break
            count += len(block)
            require(count <= cap, 'FILE_BOUND')
            digest.update(block)
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'HASH_FILE_CHANGED')
    require(count == before.st_size and stamp(regular(path)) == stamp(before), 'HASH_FILE_CHANGED')
    return {'bytes': count, 'sha256': digest.hexdigest()}


def copy_media(source, destination, expected, publications, deadline):
    before = regular(source)
    require(before.st_size == expected['bytes'] and before.st_size <= FILE_CAP, 'MEDIA_SIZE_DIFFERS')
    digest = hashlib.sha256()
    count = 0
    with source.open('rb') as stream, publications.open(destination) as target:
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'MEDIA_OPEN_CHANGED')
        while True:
            check_deadline(deadline)
            block = stream.read(BLOCK)
            if not block:
                break
            count += len(block)
            require(count <= expected['bytes'], 'MEDIA_GREW')
            target.write(block)
            digest.update(block)
        target.flush()
        os.fsync(target.fileno())
        require(stamp(os.fstat(stream.fileno())) == stamp(before), 'MEDIA_CHANGED')
    require(stamp(regular(source)) == stamp(before) and count == expected['bytes']
            and digest.hexdigest() == expected['sha256'], 'MEDIA_COPY_HASH_DIFFERS')
    require(hash_file(destination, FILE_CAP, deadline) == {k: expected[k] for k in ('bytes', 'sha256')}, 'MEDIA_REREAD_DIFFERS')


class BoundedSink:
    def __init__(self, stream, limit):
        self.stream, self.limit, self.count = stream, limit, 0

    def write(self, raw):
        self.count += len(raw)
        require(self.count <= self.limit, 'BUNDLE_COMPRESSED_BOUND')
        return self.stream.write(raw)

    def flush(self):
        return self.stream.flush()


def make_bundle(meta, path, refs, quality_raw, publications, deadline):
    inventory = {entry['path']: entry for entry in refs}
    inventory['quality-evidence.json'] = {'bytes': len(quality_raw), 'sha256': sha(quality_raw)}
    require(len(inventory) <= MAX_FILES and sum(e['bytes'] for e in inventory.values()) <= RAW_CAP, 'BUNDLE_RAW_BOUND')
    with publications.open(path) as target:
        with gzip.GzipFile(filename='', fileobj=BoundedSink(target, BUNDLE_CAP), mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w|', format=tarfile.USTAR_FORMAT) as archive:
                for name, expected in sorted(inventory.items()):
                    check_deadline(deadline)
                    raw = read_bounded(meta/name)
                    require(len(raw) == expected['bytes'] and sha(raw) == expected['sha256'], 'BUNDLE_SOURCE_DIFFERS')
                    info = tarfile.TarInfo(name)
                    info.size = len(raw)
                    with (meta/name).open('rb') as stream:
                        archive.addfile(info, stream)
        target.flush()
        os.fsync(target.fileno())
    # Reopen the complete archive and verify every raw byte; no extraction.
    seen = set()
    with tarfile.open(path, 'r|gz') as archive:
        for member in archive:
            check_deadline(deadline)
            require(member.isfile() and member.name in inventory and member.name not in seen, 'BUNDLE_ENTRY_DIFFERS')
            expected = inventory[member.name]
            require(member.size == expected['bytes'], 'BUNDLE_ENTRY_SIZE')
            stream = archive.extractfile(member)
            raw = stream.read(JSON_CAP+1)
            require(len(raw) == member.size and sha(raw) == expected['sha256'], 'BUNDLE_ENTRY_HASH')
            seen.add(member.name)
    require(seen == inventory.keys(), 'BUNDLE_ENTRY_SET')
    return {'name': path.name, **hash_file(path, BUNDLE_CAP, deadline)}


def prepare(calibration_output, out, identity, sources, calibration, *, recheck_sources, deadline):
    """Internal builder. CLI establishes HEAD identity and source closure first."""
    require(not out.exists() and not out.is_symlink(), 'OUTPUT_EXISTS')
    require(calibration_output.is_dir() and not calibration_output.is_symlink(), 'CALIBRATION_DIRECTORY')
    source_media = calibration_output/'media'
    require(source_media.is_dir() and not source_media.is_symlink(), 'MEDIA_DIRECTORY')
    require({p.name for p in source_media.iterdir()} == {'input.mp4', 'output.mp4', 'media-manifest.json'}, 'UNEXPECTED_MEDIA_ENTRY')
    original = evidence_inventory(calibration_output/'evidence')
    manifest_raw = read_bounded(source_media/'media-manifest.json')
    no_secrets(manifest_raw)
    report, verdict, files = validate_calibration(original, parsed(manifest_raw), identity, sources, calibration)
    check_deadline(deadline)
    out.mkdir()
    meta, media = out/'evidence', out/'media'
    meta.mkdir()
    media.mkdir()
    publications = Publications()
    try:
        for entry in files:
            copy_media(source_media/entry['name'], media/entry['name'], entry, publications, deadline)
        for name, raw in sorted(original.items()):
            publications.write(meta/'calibration'/name, raw)
        publications.write(meta/'calibration-media-manifest.json', manifest_raw)
        require(recheck_sources() == sources, 'WRAPPER_SOURCES_CHANGED')
        provenance = {
            'schema': 'vr180-receiver-calibration-wrapper-provenance-v1', 'identity': identity,
            'sourceSHA256': sources[SCRIPT], 'producerSHA256': sources[PRODUCER],
            'sourceHashes': sources, 'sourceHashesAfter': sources,
            'producerReportRunId': report['runId'], 'originalReportsCopiedWithoutChanges': True,
            'originalJobFieldPresent': False,
            'jobBindingBasis': 'Fixed workflow runs unchanged calibration then this wrapper in the same job. Original report has no GITHUB_JOB field; it independently binds run/attempt/commit/case.',
        }
        provenance_raw = json_bytes(provenance)
        publications.write(meta/'wrapper-provenance.json', provenance_raw)
        expected_raw = {'calibration/'+name: raw for name, raw in original.items()}
        expected_raw.update({'calibration-media-manifest.json': manifest_raw,
                             'wrapper-provenance.json': provenance_raw})
        actual = set()
        for parent, directories, names in os.walk(meta, followlinks=False):
            for name in directories:
                require(not (Path(parent)/name).is_symlink(), 'WRAPPER_METADATA_DIRECTORY_SYMLINK')
            for name in names:
                actual.add((Path(parent)/name).relative_to(meta).as_posix())
        require(actual == expected_raw.keys(), 'WRAPPER_UNKNOWN_OR_MISSING_METADATA')
        refs = []
        for name, raw in sorted(expected_raw.items()):
            require(read_bounded(meta/name) == raw, 'WRAPPER_COPIED_METADATA_CHANGED')
            refs.append({'path': safe_relative(name), 'bytes': len(raw), 'sha256': sha(raw)})
        require(0 < len(refs) <= MAX_FILES-1, 'QUALITY_REFERENCE_BOUND')
        quality = {'schema': 'vr180-p5-long-quality-evidence-v1', 'profile': PROFILE, 'identity': identity,
                   'sourceSHA256': sources[SCRIPT], 'files': files, 'mediaVerdict': verdict,
                   'completeScan': True, 'evidence': refs, 'hostRecovery': 'PENDING',
                   'independentHostValidation': 'PENDING', 'qualitySource': 'Unchanged full calibration oracle; no rerun or inferred PASS in wrapper'}
        quality_raw = json_bytes(quality)
        require(len(quality_raw) <= QUALITY_CAP, 'QUALITY_JSON_BOUND')
        publications.write(meta/'quality-evidence.json', quality_raw)
        publications.write(media/'quality-evidence.json', quality_raw)
        bundle = make_bundle(meta, media/'producer-evidence.tar.gz', refs, quality_raw, publications, deadline)
        check_deadline(deadline)
        require(recheck_sources() == sources, 'WRAPPER_SOURCES_CHANGED')
        manifest = {'schema': 'vr180-segmented-source-v1', 'status': 'GENERATED_AND_REREAD',
                    'identity': identity, 'profile': PROFILE, 'partBytes': 128*MIB,
                    'totalBytes': sum(e['bytes'] for e in files), 'files': files, 'sourceSHA256': sources[SCRIPT],
                    'generator': {'algorithm': 'vr180-fixed300-sbs180-webcodecs-calibration-v1',
                        'seed': 0x1802026, 'width': 1024, 'height': 512, 'fps': 30, 'frames': 300, 'silent': True,
                        'inputRequestedBitrate': 32000000, 'outputRequestedBitrate': 32000000,
                        'eventFrameIndices': [29, 30, 31], 'producerPath': PRODUCER,
                        'producerSHA256': sources[PRODUCER], 'producerReportRunId': report['runId']},
                    'qualityEvidence': {'name': 'quality-evidence.json', 'bytes': len(quality_raw), 'sha256': sha(quality_raw),
                                        'status': verdict, 'completeScan': True}, 'evidenceBundle': bundle}
        publications.write(media/'source-manifest.json', json_bytes(manifest))
        check_deadline(deadline)
        return manifest
    except BaseException as error:
        cleanup = publications.rollback()
        error.wrapperCleanup = cleanup
        if cleanup['held']:
            error.add_note(f"Wrapper cleanup HOLD: {len(cleanup['held'])} entries retained; primary error preserved")
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--calibration-output', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    started = time.monotonic()
    try:
        identity = source_identity()
        temporary = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
        # Check before resolving so a symlink cannot be accepted as a fresh path.
        require(not args.output.is_symlink() and not args.calibration_output.is_symlink(), 'OUTPUT_OR_INPUT_SYMLINK')
        out = args.output.resolve()
        original = args.calibration_output.resolve(strict=True)
        require(out.is_relative_to(temporary) and original.is_relative_to(temporary)
                and not out.is_relative_to(ROOT) and not original.is_relative_to(ROOT)
                and not out.is_relative_to(original) and not original.is_relative_to(out), 'USE_SEPARATE_RUNNER_TEMP_DIRECTORIES')
        sources = source_hashes(identity)
        calibration = load_calibration()
        manifest = prepare(original, out, identity, sources, calibration,
                           recheck_sources=lambda: source_hashes(identity), deadline=started+180)
        print(json.dumps({'status': 'READY_FOR_SEGMENTED_TRANSFER', 'profile': PROFILE,
                          'identity': identity, 'mediaVerdict': manifest['qualityEvidence']['status'],
                          'completeScan': True, 'elapsedSeconds': time.monotonic()-started}))
        return 0
    except Exception as error:
        cleanup = getattr(error, 'wrapperCleanup', None)
        if cleanup:
            cleanup = {**cleanup, 'heldCount': len(cleanup['held']), 'held': cleanup['held'][:8],
                       'detailsTruncated': len(cleanup['held']) > 8}
        print(json.dumps({'status': 'FAIL', 'profile': PROFILE, 'error': type(error).__name__+': '+str(error),
                          'completeScan': False, 'mediaArtifactReady': False, 'cleanup': cleanup}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
