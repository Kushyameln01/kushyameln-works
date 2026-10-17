#!/usr/bin/env python3
"""Private long-media receiver checks; no network, publication or large trial.

Integration notes: the driver owns 45/60-minute total receiver deadlines,
full artifact recovery and its fixed source/HEAD checks. This helper limits the
fresh oracle to a shared 15/25-minute phase within that remaining deadline.
Reuse common prepare_oracle/unpack_bundle, but use the long scalar packet/event
oracle, never the calibration's fixed-300 verdict. Complete quality FAIL is a
returned result; an incomplete scan, changed source or hash mismatch raises.
Native FFmpeg RSS, VR playback, AAC/60fps and public acceptance remain separate.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[2]
PRODUCER = 'development/vr180/p5-long-prototype/probe-long.py'
BUNDLE_SOURCE = 'development/vr180/p5-long-prototype/evidence-bundle.py'
CALIBRATION = 'development/vr180/p5-calibration-prototype/probe-calibration.py'
MIB = 1024**2
PROFILES = {
    'p5-5gb': {'target': 5_000_000_000, 'caps': (5_100_000_000, 5_200_000_000),
               'receiverSeconds': 2700, 'oracleSeconds': 900},
    'p5-10gb': {'target': 10_000_000_000, 'caps': (10_100_000_000, 10_200_000_000),
                'receiverSeconds': 3600, 'oracleSeconds': 1500},
}
# The driver adds these exact 19 paths to its HEAD-bound before/after closure.
# Producer source closure is checked separately in full; it is not cut to 19.
RECEIVER_SOURCES = (
    'tools/vr180/receive-long-media-evidence.py', 'tools/vr180/receive-media-evidence.py',
    'tools/vr180/verify-conversion-large.py', 'tools/vr180/verify-metadata.py',
    'tools/vr180/record-ffmpeg-toolchain.py', 'tools/vr180/cloud-validate.py',
    'tools/vr180/probe-output-index.py', 'tools/vr180/probe-indexed-conversion.py',
    'tools/vr180/probe-persistent-storage.py', PRODUCER, BUNDLE_SOURCE,
    'development/vr180/p5-long-prototype/oracle.py',
    'development/vr180/p5-long-prototype/streaming.py',
    'development/vr180/p5-long-prototype/frame.mjs',
    'development/vr180/p5-long-prototype/profile.mjs',
    'development/vr180/p5-long-prototype/worker.mjs',
    'development/vr180/p5-long-prototype/frame-provenance.json', CALIBRATION,
    'development/vr180/p5-calibration-prototype/frame.mjs',
)
REQUIRED_RECORDS = frozenset({'browser-observations.json', 'browser-lifecycle.json',
    'runner-transfer.json', 'private-source-inventory.json', 'fork-build-result.json',
    'oracle-toolchain.json', 'independent-verification.json', 'packet-statistics.json',
    'source-provenance.json', 'producer-record.json'})


def need(value, code):
    if not value: raise ValueError(code)


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module


def long_module():
    return load('fresh_receiver_long_producer_contract', ROOT/PRODUCER)


def common_module():
    return load('fresh_receiver_common_evidence', ROOT/'tools/vr180/receive-media-evidence.py')


def remaining(deadline):
    value = deadline-time.time(); need(value > 0, 'LONG_RECEIVER_DEADLINE'); return value


def read_record(directory, name):
    path = directory/name
    need(path.is_file() and not path.is_symlink() and path.stat().st_size <= MIB, 'LONG_RECORD_BOUND')
    with path.open('rb') as stream: raw = stream.read(MIB+1)
    need(len(raw) <= MIB, 'LONG_RECORD_BOUND')
    return json.loads(raw)


def file_rows(files):
    need(type(files) is list and len(files) == 2, 'LONG_FILE_COUNT')
    return [{k: row[k] for k in ('id', 'name', 'bytes', 'sha256')} for row in files]


def validate_generator(manifest, source_hashes):
    profile_id = manifest['profile']; need(profile_id in PROFILES, 'LONG_PROFILE')
    p = PROFILES[profile_id]; identity = manifest['identity']; g = manifest['generator']
    need(identity['repository'] == 'Kushyameln01/kushyameln-works'
         and identity['job'] == 'p5-long-producer' and re.fullmatch(r'[0-9a-f]{40}', identity['commit'])
         and re.fullmatch(r'refs/heads/codex/vr180-plan-[A-Za-z0-9._/-]+', identity['ref'])
         and re.fullmatch(r'[1-9][0-9]{0,19}', identity['runId'])
         and integer(identity['runAttempt'], 1, 50), 'LONG_IDENTITY_JOB')
    expected = {'algorithm': 'vr180-long-xorshift32-sbs180-webcodecs-v1', 'seed': 0x1802026,
        'width': 1024, 'height': 512, 'fps': 30, 'silent': True,
        'inputRequestedBitrate': 32000000, 'outputRequestedBitrate': 32000000,
        'eventPeriodFrames': 300, 'eventFrameOffsets': [29, 30, 31], 'maxFrames': 100000,
        'targetPayloadBytes': p['target']}
    need(all(type(g.get(k)) is type(v) and g[k] == v for k, v in expected.items())
         and integer(g.get('frames'), 1, 100000), 'LONG_GENERATOR')
    provenance = manifest['provenance']
    need(provenance['generatorScriptPath'] == PRODUCER
         and provenance['generatorScriptSHA256'] == source_hashes[PRODUCER], 'LONG_PRODUCER_SOURCE')
    files = file_rows(manifest['files']); count = 0
    for i, side in enumerate(('input', 'output')):
        row = files[i]
        need(row['id'] == side and row['name'] == side+'.mp4' and integer(row['bytes'], 1, p['caps'][i])
             and re.fullmatch(r'[0-9a-f]{64}', row['sha256']), 'LONG_MEDIA_BOUNDS')
        count += (row['bytes']+128*MIB-1)//(128*MIB)
    need(manifest['partBytes'] == 128*MIB and manifest['totalBytes'] == sum(f['bytes'] for f in files)
         and manifest['partCount'] == count <= 200, 'LONG_PART_BOUNDS')
    b = manifest['evidenceBundle']; a = b['artifact']
    prefix = f"vr180-seg-{profile_id}-{identity['runId']}-{identity['runAttempt']}-{identity['job']}"
    used = {part['artifact']['id'] for f in manifest['files'] for part in f['parts']}
    need(b['name'] == 'producer-evidence.tar.gz' and integer(b['bytes'], 1, 8*MIB)
         and re.fullmatch(r'[0-9a-f]{64}', b['sha256']) and a['name'] == prefix+'-evidence'
         and integer(a['id'], 1, 2**53-1) and a['id'] not in used
         and integer(a['sizeBytes'], 22, b['bytes']+MIB)
         and re.fullmatch(r'sha256:[0-9a-f]{64}', a['digest']), 'LONG_EVIDENCE_BUNDLE')
    return p


def unpack_bundle(path, manifest, output, deadline):
    need(manifest['profile'] in PROFILES, 'LONG_PROFILE')
    return common_module().unpack_bundle(path, manifest, output, deadline)


def prepare_oracle(toolchain, evidence):
    # Common code verifies Ubuntu exact package, actual executable PATH/hash,
    # raw toolchain manifest, NumPy 2.3.3 and imported independent verifier.
    return common_module().prepare_oracle(toolchain, evidence)


def producer_sources(module):
    need(module.BUNDLE_SOURCE_PATH == BUNDLE_SOURCE, 'LONG_BUNDLE_SOURCE_PATH')
    return sorted(set(module.SOURCE_FILES + [PRODUCER, BUNDLE_SOURCE,
        'development/vr180/p5-long-prototype/streaming.py',
        'development/vr180/p5-long-prototype/oracle.py',
        'development/vr180/p5-long-prototype/frame-provenance.json', CALIBRATION,
        'tools/vr180/probe-persistent-storage.py', 'tools/vr180/probe-indexed-conversion.py',
        'tools/vr180/probe-output-index.py', 'tools/vr180/cloud-validate.py',
        'tools/vr180/verify-conversion-large.py', 'tools/vr180/verify-metadata.py']))


def reconstructed_source_manifest(manifest):
    """Reproduce the fixed producer's exact noncircular source serialization."""
    value = {'schema': 'vr180-segmented-source-v1', 'status': 'GENERATED_AND_REREAD',
        'identity': manifest['identity'], 'profile': manifest['profile'], 'partBytes': manifest['partBytes'],
        'totalBytes': manifest['totalBytes'], 'files': file_rows(manifest['files']),
        'sourceSHA256': manifest['provenance']['generatorScriptSHA256'], 'generator': manifest['generator'],
        'qualityEvidence': manifest['qualityEvidence'],
        'evidenceBundle': {k: manifest['evidenceBundle'][k] for k in ('name', 'bytes', 'sha256')}}
    return (json.dumps(value, indent=2, sort_keys=True)+'\n').encode()


def validate_original_records(directory, manifest, exact_sources):
    identity = manifest['identity']; profile = PROFILES[manifest['profile']]; frames = manifest['generator']['frames']
    files = file_rows(manifest['files']); module = long_module()
    quality = read_record(directory, 'quality-evidence.json')
    raw_quality = (directory/'quality-evidence.json').read_bytes(); qd = manifest['qualityEvidence']
    need(0 < len(raw_quality) == qd['bytes'] <= 65536 and hashlib.sha256(raw_quality).hexdigest() == qd['sha256']
         and quality['identity'] == identity and quality['profile'] == manifest['profile']
         and quality['completeScan'] is True and file_rows(quality['files']) == files, 'LONG_ORIGINAL_QUALITY_BINDING')
    names = {ref['path'] for ref in quality['evidence']}
    need(0 < len(names) == len(quality['evidence']) <= 255, 'LONG_ORIGINAL_REFERENCE_COUNT')
    need(REQUIRED_RECORDS <= names, 'LONG_REQUIRED_ORIGINAL_RECORDS')
    for name in names:
        need(name in REQUIRED_RECORDS or name in {'source-inventory.json', 'environment.json'}
             or re.fullmatch(r'(oracle-logs|input-packet-stats|output-packet-stats)/[a-z0-9-]+\.stderr\.log', name),
             'LONG_UNKNOWN_ORIGINAL_RECORD')
    for ref in quality['evidence']:
        p = directory/ref['path']
        need(p.is_file() and not p.is_symlink() and integer(ref['bytes'], 0, 8*MIB)
             and p.stat().st_size == ref['bytes'], 'LONG_ORIGINAL_REFERENCE_BYTES')
        sha = hashlib.sha256(); size = 0
        with p.open('rb') as stream:
            while chunk := stream.read(65536):
                size += len(chunk); need(size <= ref['bytes'], 'LONG_ORIGINAL_REFERENCE_BYTES'); sha.update(chunk)
        need(size == ref['bytes'] and sha.hexdigest() == ref['sha256'], 'LONG_ORIGINAL_REFERENCE_HASH')
    record = read_record(directory, 'producer-record.json')
    need(record['schema'] == 'vr180-p5-long-producer-record-v1'
         and record['status'] == 'FULL_MEDIA_AND_SCAN_COMPLETED' and record['identity'] == identity
         and record['runId'] == f"{identity['runId']}-{manifest['profile']}-{identity['runAttempt']}"
         and record['profile'] == manifest['profile'] and record['frames'] == frames
         and file_rows(record['files']) == files and record['completeScan'] is True
         and record['sourceSHA256'] == quality['sourceSHA256'] == manifest['provenance']['generatorScriptSHA256'],
         'LONG_ORIGINAL_IDENTITY_MEDIA')
    source_raw = (directory/'source-provenance.json').read_bytes()
    need(record['sourceProvenance'] == {'path': 'source-provenance.json', 'bytes': len(source_raw),
         'sha256': hashlib.sha256(source_raw).hexdigest()}, 'LONG_ORIGINAL_SOURCE_REFERENCE')
    sources = json.loads(source_raw); allowed = producer_sources(module)
    need(sources['identity'] == identity and set(sources['before']) == set(allowed)
         and sources['after'] == sources['before'] == exact_sources(allowed, identity['commit']), 'LONG_ORIGINAL_SOURCE_CLOSURE')
    need(sources['before'][PRODUCER] == record['sourceSHA256'], 'LONG_ORIGINAL_SCRIPT_HASH')
    need(hashlib.sha256(reconstructed_source_manifest(manifest)).hexdigest() == manifest['sourceManifestSHA256'],
         'LONG_SOURCE_MANIFEST_HASH')
    observed = read_record(directory, 'browser-observations.json'); generated = observed['generation']
    need(observed['schema'] == 'vr180-p5-long-browser-v1' and observed['profile'] == manifest['profile']
         and observed['status'] == 'READY_FOR_RUNNER_TRANSFER' and file_rows(observed['files']) == files
         and generated['frames'] == generated['packets'] == frames and generated['fps'] == 30
         and generated['requestedBitrate'] == 32000000 and generated['sha256'] == files[0]['sha256']
         and generated['bytes'] == files[0]['bytes'] and generated['packetTimestampsStrictlyIncreasing'] is True
         and integer(generated['payloadBytes'], profile['target'], files[0]['bytes'])
         and integer(generated['maxPacketBytes'], 1, 4*MIB), 'LONG_ORIGINAL_GENERATION')
    need(observed['indexDirectoriesRemoved'] is True and observed['ownerRecordsRemoved'] is True
         and observed['heldLocks'] == 0 and observed['indexReservedAfterCleanup'] == 0
         and observed.get('unhandledCount', 0) == 0 and not observed.get('unhandledErrors')
         and not observed.get('cleanupError') and not observed.get('cleanupFailureObserved'), 'LONG_ORIGINAL_INDEX_CLEANUP')
    life = read_record(directory, 'browser-lifecycle.json')
    need(life['browserClosed'] is True and life['namespaceCleanup']['status'] == 'REMOVED'
         and life['profileCleanup']['status'] == 'REMOVED', 'LONG_ORIGINAL_BROWSER_CLEANUP')
    transfer = read_record(directory, 'runner-transfer.json')
    need(transfer['browser']['status'] == 'PASS' and file_rows(transfer['files']) == files, 'LONG_ORIGINAL_TRANSFER')
    for row in transfer['files']:
        need(row['fsynced'] is True and row['closed'] is True and row['rereadBytes'] == row['bytes']
             and row['rereadSHA256'] == row['sha256'], 'LONG_ORIGINAL_TRANSFER_READBACK')
    build = read_record(directory, 'fork-build-result.json')
    need(build['status'] == 'PASS' and build['baseline']['status'] == 'PASS'
         and build['baseline']['comparison']['identical'] is True and build['variant'] == 'combined-input-output'
         and build['bundleSha256'] == sources['bundleSHA256'], 'LONG_ORIGINAL_FORK_BUILD')
    inventory = read_record(directory, 'private-source-inventory.json')
    rows = inventory['files']; routes = {r['route']: r for r in rows}
    need(inventory['checkoutCommit'] == identity['commit'] and len(routes) == len(rows)
         and set(routes) == {'/', '/fork.mjs'} | {'/'+name for name in module.SOURCE_FILES}
         and routes['/fork.mjs']['sha256'] == build['bundleSha256'], 'LONG_ORIGINAL_SERVED_SOURCE_SET')
    for name in module.SOURCE_FILES:
        need(routes['/'+name]['sha256'] == sources['before'][name], 'LONG_ORIGINAL_SERVED_SOURCE_HASH')
    stats = read_record(directory, 'packet-statistics.json'); verified = read_record(directory, 'independent-verification.json')
    need(verified['completeScan'] is True and all(stats[s]['completeScan'] is True for s in ('input', 'output')),
         'LONG_ORIGINAL_SCAN_INCOMPLETE')
    for f in files:
        need(verified[f['id']+'Bytes'] == f['bytes'] and verified[f['id']+'SHA256'] == f['sha256'], 'LONG_ORIGINAL_ORACLE_HASH')
    need(stats['input']['payloadBytes'] == generated['payloadBytes'], 'LONG_ORIGINAL_PAYLOAD')
    verdict = module.long_oracle.long_verdict(verified, stats, frames, profile['target'])
    acceptance = quality['acceptance']
    need(record['mediaVerdict'] == quality['mediaVerdict'] == manifest['qualityEvidence']['status'] == verdict['status']
         and acceptance['mediaVerdict'] == verdict['status'] and acceptance['completeScan'] is True
         and acceptance['actualInputPayloadBytes'] == stats['input']['payloadBytes']
         and acceptance['targetPayloadBytes'] == profile['target'] and acceptance['actualOutputBytes'] == files[1]['bytes']
         and acceptance['outputExceeds4GiB'] is (files[1]['bytes'] > 2**32)
         and acceptance['expectedEvents'] == verdict['expectedEvents'], 'LONG_ORIGINAL_QUALITY_VERDICT')
    return {'status': verdict['status'], 'completeScan': True, 'runId': record['runId'],
        'producerJob': identity['job'], 'frames': frames, 'originalRecordsVerified': len(names),
        'fixedSourceFiles': len(allowed), 'originalSourceManifestSHA256Matched': True,
        'originalQualityPreserved': True, 'finalRunJsonIncluded': False,
        'recordScope': 'Noncircular full-media-and-scan producer snapshot; final run.json remains outside bundle.'}


def source_snapshot():
    values = {}
    for name in RECEIVER_SOURCES:
        p = ROOT/name; need(p.is_file() and not p.is_symlink() and p.stat().st_size <= MIB, 'LONG_RECEIVER_SOURCE_BOUND')
        values[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    return values


def check_media_files(media, files):
    for row in files:
        p = media/row['name']
        need(p.is_file() and not p.is_symlink() and p.stat().st_size == row['bytes'], 'LONG_RECOVERED_FILE_SIZE')


def verify_media(media, evidence, deadline, cal, oracle, expected_files, manifest):
    del cal  # common toolchain/dependency preparation is reused, fixed-300 verdict is not
    profile = PROFILES[manifest['profile']]; frames = manifest['generator']['frames']
    files = file_rows(expected_files)
    need(files == file_rows(manifest['files']), 'LONG_RECOVERED_FILE_BINDING')
    check_media_files(media, files)
    before = source_snapshot(); module = long_module()
    phase_deadline = min(deadline, time.time()+profile['oracleSeconds']); remaining(phase_deadline)
    verified = None; stats = {}
    try:
        # Count/size/CFR packet admission first, then decode every frame. Both
        # scans share one phase deadline, rather than each receiving 15/25 min.
        monotonic_deadline = time.monotonic()+remaining(phase_deadline)
        for i, side in enumerate(('input', 'output')):
            stats[side] = module.packet_statistics(oracle, media/(side+'.mp4'), evidence/(side+'-receiver-packet-stats'),
                monotonic_deadline, frames, profile['caps'][i], side == 'input')
            remaining(phase_deadline)
        (evidence/'receiver-packet-statistics.json').write_text(json.dumps(stats, indent=2)+'\n')
        need(all(stats[s]['completeScan'] is True for s in stats), 'LONG_RECEIVER_PACKET_SCAN_INCOMPLETE')
        verified = oracle.verify_files(media/'input.mp4', media/'output.mp4', layout='sbs', fov=180,
            eye_size=512, mode='convert', timeout=remaining(phase_deadline), log_dir=evidence/'receiver-oracle-logs')
        (evidence/'receiver-independent-verification.json').write_text(json.dumps(verified, indent=2)+'\n')
        remaining(phase_deadline); need(verified['completeScan'] is True, 'LONG_RECEIVER_SCAN_INCOMPLETE')
        for row in files:
            side = row['id']
            need(verified[side+'Bytes'] == row['bytes'] and verified[side+'SHA256'] == row['sha256'], 'LONG_ORACLE_RECOVERED_HASH')
        verdict = module.long_oracle.long_verdict(verified, stats, frames, profile['target'])
        psnr = verified.get('eyePSNRdB', [])
        quality_pass = verdict['status'] == 'PASS' and len(psnr) == 2 and all(
            type(x) in (int, float) and not math.isnan(x) and x >= 30 for x in psnr)
        capacity_pass = stats['input']['payloadBytes'] >= profile['target'] and files[1]['bytes'] > 2**32
        after = source_snapshot(); need(before == after, 'LONG_RECEIVER_SOURCE_CHANGED'); remaining(phase_deadline)
        result = {'status': 'PASS' if quality_pass and capacity_pass else 'FAIL', 'completeScan': True,
            'qualityVerdict': 'PASS' if quality_pass else 'FAIL', 'capacityVerdict': 'PASS' if capacity_pass else 'FAIL',
            'producerQualityVerdict': manifest['qualityEvidence']['status'], 'frames': verified['frames'],
            'decodedFramesCompared': verified['decodedFramesCompared'], 'packetCounts': {s: stats[s]['packets'] for s in stats},
            'actualInputPayloadBytes': stats['input']['payloadBytes'], 'targetInputPayloadBytes': profile['target'],
            'actualOutputBytes': files[1]['bytes'], 'outputExceeds4GiB': files[1]['bytes'] > 2**32,
            'eyePSNRdB': psnr, 'maxPtsErrorSeconds': verified.get('maxPtsErrorSeconds'),
            'expectedEvents': verdict['expectedEvents'], 'vrMetadata': verified.get('vrMetadata'),
            'recoveredMediaBytesAndHashesMatched': True, 'allStreamsScannedToEnd': True,
            'sourceHashesBefore': before, 'sourceHashesAfter': after, 'fixedReceiverSourceFiles': len(before),
            'oraclePhaseLimitSeconds': profile['oracleSeconds'], 'overallReceiverLimitSeconds': profile['receiverSeconds'],
            'scope': 'Full recovered silent 30fps synthetic media; not AAC/60fps, real-camera or VR-player acceptance.'}
        (evidence/'receiver-long-verdict.json').write_text(json.dumps(result, indent=2)+'\n')
        remaining(phase_deadline); return result
    except BaseException as error:
        (evidence/'receiver-long-verdict.json').write_text(json.dumps({'status': 'FAIL_INCOMPLETE_VALIDATION',
            'completeScan': False, 'fullMediaVerdictIssued': False, 'errorType': type(error).__name__,
            'reason': str(error)[:512], 'packetSidesCompleted': sorted(stats),
            'oracleReportedCompleteScan': bool(verified and verified.get('completeScan'))}, indent=2)+'\n')
        raise
