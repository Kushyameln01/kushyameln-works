#!/usr/bin/env python3
"""Strict bounded producer records and independent whole-media calibration checks."""
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import tarfile
import time

ROOT = Path(__file__).resolve().parents[2]
PROFILE = 'p5-receiver-calibration32'
PREPARE = 'development/vr180/p5-receiver-calibration/prepare.py'
CALIBRATION = 'development/vr180/p5-calibration-prototype/probe-calibration.py'
MIB = 1024**2


def need(value, code):
    if not value: raise ValueError(code)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value


def check_time(deadline):
    need(time.time() < deadline, 'MEDIA_RECEIVER_DEADLINE')


def validate_generator(manifest, source_hashes):
    need(manifest['profile'] == PROFILE and manifest['identity']['job'] == 'p5-receiver-calibration', 'CALIBRATION_PROFILE_JOB')
    g = manifest['generator']; identity = manifest['identity']
    expected = {'algorithm': 'vr180-fixed300-sbs180-webcodecs-calibration-v1', 'seed': 0x1802026,
        'width': 1024, 'height': 512, 'fps': 30, 'frames': 300, 'silent': True,
        'inputRequestedBitrate': 32000000, 'outputRequestedBitrate': 32000000,
        'eventFrameIndices': [29, 30, 31], 'producerPath': CALIBRATION,
        'producerSHA256': source_hashes[CALIBRATION],
        'producerReportRunId': f"{identity['runId']}-p5-32-32-{identity['runAttempt']}"}
    need(all(g.get(k) == v for k, v in expected.items()), 'CALIBRATION_GENERATOR')
    need(manifest['provenance']['generatorScriptPath'] == PREPARE
         and manifest['provenance']['generatorScriptSHA256'] == source_hashes[PREPARE], 'CALIBRATION_WRAPPER_SOURCE')
    need(manifest['totalBytes'] <= 120*MIB and manifest['partCount'] == 2, 'CALIBRATION_MEDIA_BOUNDS')
    b = manifest['evidenceBundle']; a = b['artifact']
    prefix = f"vr180-seg-{PROFILE}-{identity['runId']}-{identity['runAttempt']}-{identity['job']}"
    used = {p['artifact']['id'] for f in manifest['files'] for p in f['parts']}
    need(b['name'] == 'producer-evidence.tar.gz' and type(b['bytes']) is int and 0 < b['bytes'] <= 8*MIB
         and re.fullmatch(r'[0-9a-f]{64}', b['sha256']) and a['name'] == prefix+'-evidence'
         and type(a['id']) is int and a['id'] > 0 and a['id'] not in used
         and type(a['sizeBytes']) is int and 22 <= a['sizeBytes'] <= b['bytes']+MIB
         and re.fullmatch(r'sha256:[0-9a-f]{64}', a['digest']), 'CALIBRATION_EVIDENCE_BUNDLE')


def unpack_bundle(path, manifest, output, deadline):
    check_time(deadline); b = manifest['evidenceBundle']
    need(path.is_file() and not path.is_symlink() and path.stat().st_size == b['bytes'] <= 8*MIB, 'BUNDLE_SIZE')
    raw = path.read_bytes(); need(hashlib.sha256(raw).hexdigest() == b['sha256'], 'BUNDLE_RAW_SHA256')
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as zipped:
        tar_bytes = zipped.read(17*MIB+1)
    need(len(tar_bytes) <= 17*MIB, 'BUNDLE_EXPANDED_LIMIT')
    members = {}; payload_bytes = 0
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode='r:') as archive:
        for entry in archive:
            check_time(deadline)
            name = entry.name
            need(len(members) < 256 and name not in members and len(name) <= 240
                 and all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*', p) for p in name.split('/'))
                 and entry.isfile() and not entry.issparse() and 0 <= entry.size <= 8*MIB, 'BUNDLE_ENTRY_BOUND')
            with archive.extractfile(entry) as stream: content = stream.read(entry.size+1)
            need(len(content) == entry.size, 'BUNDLE_SHORT_ENTRY'); members[name] = content
            payload_bytes += len(content); need(payload_bytes <= 16*MIB, 'BUNDLE_PAYLOAD_LIMIT')
    qd = manifest['qualityEvidence']; qraw = members.get('quality-evidence.json', b'')
    need(qd['name'] == 'quality-evidence.json' and 0 < len(qraw) == qd['bytes'] <= 65536
         and hashlib.sha256(qraw).hexdigest() == qd['sha256'], 'QUALITY_RAW_BYTES')
    q = json.loads(qraw)
    need(q['schema'] == 'vr180-p5-long-quality-evidence-v1' and q['profile'] == PROFILE
         and q['identity'] == manifest['identity'] and q['sourceSHA256'] == manifest['provenance']['generatorScriptSHA256']
         and q['completeScan'] is True and q['mediaVerdict'] in ('PASS', 'FAIL')
         and q['mediaVerdict'] == qd['status'] and qd['completeScan'] is True, 'QUALITY_IDENTITY_STATUS')
    fields = ('id', 'name', 'bytes', 'sha256')
    need([{k: f[k] for k in fields} for f in q['files']] == [{k: f[k] for k in fields} for f in manifest['files']], 'QUALITY_MEDIA_BINDING')
    refs = q['evidence']; need(type(refs) is list and 0 < len(refs) <= 255, 'QUALITY_REF_COUNT')
    names = set()
    for ref in refs:
        name = ref['path']; need(name not in names and name in members and name != 'quality-evidence.json', 'QUALITY_REF_SET')
        content = members[name]
        need(type(ref['bytes']) is int and len(content) == ref['bytes']
             and hashlib.sha256(content).hexdigest() == ref['sha256'], 'QUALITY_REF_BYTES')
        names.add(name)
    need(set(members) == names | {'quality-evidence.json'}, 'BUNDLE_UNREFERENCED_ENTRY')
    need(not output.exists(), 'NEW_PRODUCER_EVIDENCE_DIRECTORY')
    output.mkdir()
    for name, content in members.items():
        check_time(deadline); target = output/name; target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream: stream.write(content)
        need(target.read_bytes() == content, 'PRODUCER_RECORD_READBACK')
    return q, {'rawBytes': len(raw), 'rawSHA256': b['sha256'], 'expandedTarBytes': len(tar_bytes),
               'entryCount': len(members), 'allReferencesVerified': True, 'qualitySHA256': qd['sha256']}


def validate_original_records(directory, manifest, exact_sources):
    def read(name): return json.loads((directory/'calibration'/name).read_bytes())
    report = read('run.json'); original_manifest = read('manifest.json'); identity = manifest['identity']
    need(report['runId'] == manifest['generator']['producerReportRunId']
         and report['checkoutCommit'] == identity['commit'] and report['case'] == '32-32'
         and report['status'] == 'READY_FOR_ARTIFACT_RECOVERY' and report['completeCloudMedia'] is True
         and report['mediaArtifactReady'] is True and report['cleanup']['status'] == 'REMOVED', 'ORIGINAL_CALIBRATION_IDENTITY')
    need(original_manifest['runId'] == report['runId'], 'ORIGINAL_MANIFEST_IDENTITY')
    original_media = report['mediaManifest']
    need(json.loads((directory/'calibration-media-manifest.json').read_bytes()) == original_media, 'ORIGINAL_MEDIA_MANIFEST_COPY')
    expected_files = [{k: f[k] for k in ('name', 'bytes', 'sha256')} for f in manifest['files']]
    need(original_media['runId'] == report['runId'] and original_media['checkoutCommit'] == identity['commit']
         and original_media['case'] == '32-32' and original_media['completeScan'] is True
         and original_media['files'] == expected_files, 'ORIGINAL_MEDIA_BINDING')
    seen = set()
    for entry in original_manifest['files']:
        name = entry['name']
        need(type(name) is str and len(name) <= 240 and name not in seen
             and all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*', p) for p in name.split('/')), 'ORIGINAL_FILE_PATH')
        p = directory/'calibration'/name
        need(p.is_file() and not p.is_symlink() and p.stat().st_size == entry['bytes']
             and hashlib.sha256(p.read_bytes()).hexdigest() == entry['sha256'], 'ORIGINAL_MANIFEST_FILE')
        seen.add(name)
    actual = {p.relative_to(directory/'calibration').as_posix() for p in (directory/'calibration').rglob('*') if p.is_file()}
    need(actual == seen | {'manifest.json'}, 'ORIGINAL_EVIDENCE_FILE_SET')
    hashes = report['sourceHashesBefore']
    cal = load('receiver_calibration_contract', ROOT/CALIBRATION)
    allowed = sorted(set(cal.indexed.SOURCES + ['development/vr180/index-prototype/job-owner.mjs',
         'development/vr180/p5-calibration-prototype/frame.mjs', 'development/vr180/p5-calibration-prototype/worker.mjs',
         CALIBRATION, 'tools/vr180/probe-output-index.py', 'tools/vr180/probe-indexed-conversion.py',
         'tools/vr180/cloud-validate.py', 'tools/vr180/verify-conversion-large.py', 'tools/vr180/verify-metadata.py']))
    need(set(hashes) == set(allowed) and report['sourceHashesAfter'] == hashes
         and exact_sources(allowed, identity['commit']) == hashes, 'ORIGINAL_SOURCE_CLOSURE')
    wrapper = json.loads((directory/'wrapper-provenance.json').read_bytes())
    closure = exact_sources(allowed+[PREPARE], identity['commit'])
    need(wrapper['identity'] == identity and wrapper['sourceHashes'] == closure
         and wrapper['sourceHashesAfter'] == closure and wrapper['sourceSHA256'] == closure[PREPARE]
         and wrapper['producerSHA256'] == closure[CALIBRATION]
         and wrapper['producerReportRunId'] == report['runId'], 'WRAPPER_SOURCE_CLOSURE')
    stats = read('packet-statistics.json'); verified = read('independent-verification.json')
    need(verified['completeScan'] is True and all(stats[side]['completeScan'] for side in ('input', 'output')),
         'ORIGINAL_SCAN_INCOMPLETE')
    verdict = cal.calibration_verdict(verified, stats)
    need(report['calibrationVerdict'] == verdict == manifest['qualityEvidence']['status'], 'ORIGINAL_QUALITY_VERDICT')
    return {'status': verdict, 'completeScan': True, 'runId': report['runId'],
            'originalFilesVerified': len(seen), 'fixedSourceFiles': len(hashes),
            'jobBinding': 'Original report has no job field; fixed same-job workflow sequence provides job binding.'}


def prepare_oracle(toolchain, evidence):
    cal = load('receiver_calibration_oracle', ROOT/CALIBRATION)
    proof = cal.require_toolchain(toolchain, evidence/'receiver-toolchain.json')
    need(proof['packageVersion'] == '7:6.1.1-3ubuntu5', 'RECEIVER_ORACLE_PACKAGE')
    oracle, dependencies = cal.require_oracle_dependencies()
    return cal, oracle, {'toolchain': proof, 'dependencies': dependencies}


def verify_media(media, evidence, deadline, cal, oracle, expected_files):
    check_time(deadline)
    verified = oracle.verify_files(media/'input.mp4', media/'output.mp4', layout='sbs', fov=180,
        eye_size=512, mode='convert', timeout=min(180, deadline-time.time()), log_dir=evidence/'receiver-oracle-logs')
    (evidence/'receiver-independent-verification.json').write_text(json.dumps(verified, indent=2)+'\n')
    need(verified['completeScan'] is True, 'RECEIVER_MEDIA_SCAN_INCOMPLETE')
    for file in expected_files:
        side = file['id']; need(side in ('input', 'output'), 'RECEIVER_MEDIA_ID')
        need(verified[side+'Bytes'] == file['bytes'] and verified[side+'SHA256'] == file['sha256'], 'ORACLE_RECOVERED_MEDIA_BINDING')
    stats = {}
    for side in ('input', 'output'):
        check_time(deadline); stats[side] = cal.packet_statistics(oracle, media/(side+'.mp4'), evidence/(side+'-receiver-packet-stats'))
        check_time(deadline)
    (evidence/'receiver-packet-statistics.json').write_text(json.dumps(stats, indent=2)+'\n')
    need(all(stats[side]['completeScan'] for side in stats), 'RECEIVER_PACKET_SCAN_INCOMPLETE')
    verdict = cal.calibration_verdict(verified, stats)
    return {'status': verdict, 'completeScan': True, 'frames': verified['frames'],
            'decodedFramesCompared': verified['decodedFramesCompared'], 'packetCounts': {s: stats[s]['packets'] for s in stats},
            'recoveredMediaBytesAndHashesMatched': True,
            'allStreamsScannedToEnd': True, 'scope': 'Actual complete short media on fresh receiver; not a long-profile or VR-player acceptance.'}
