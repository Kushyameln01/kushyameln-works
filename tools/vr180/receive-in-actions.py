#!/usr/bin/env python3
"""Private fresh-job recovery. Runtime download and public REST identity stay distinct."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
r = load('segmented_receiver', Path(__file__).with_name('receive-segmented-artifact.py'))
c = load('cloud_evidence', Path(__file__).with_name('cloud-validate.py'))
SMALL = ('service-8mib', 'single-128mib')
MEDIA = 'p5-receiver-calibration32'
LONG = ('p5-5gb', 'p5-10gb')
ENABLED = SMALL + (MEDIA,) + LONG
DEADLINE_SECONDS = {'p5-5gb': 2700, 'p5-10gb': 3600}
SENDER_FILES = ['action.yml', 'main.cjs', 'transfer.cjs', 'sdk-worker.cjs',
                'package.json', 'package-lock.json', 'sdk-provenance.json']


class ReceiverCancelled(BaseException):
    """Bypasses codec helpers that aggregate ordinary Exceptions as quality errors."""


def stop_group(process):
    # Called for cancellation and timeout; never leave a detached SDK writer.
    try: os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError: pass
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        process.wait(timeout=5)


def install_cancellation():
    previous = {}; interrupted = False
    def cancel(signum, frame):
        nonlocal interrupted
        if interrupted: return
        interrupted = True
        raise ReceiverCancelled('RECEIVER_CANCELLED')
    for sig in (signal.SIGTERM, signal.SIGINT):
        previous[sig] = signal.signal(sig, cancel)
    return lambda: [signal.signal(sig, handler) for sig, handler in previous.items()]


def validate_receipt(receipt, profile, env):
    r.need(profile in ENABLED and receipt['profile'] == profile, 'ENABLED_PROFILE_REQUIRED')
    is_media = profile not in SMALL
    is_long = profile in LONG
    expected = {'repository': env['GITHUB_REPOSITORY'], 'commit': env['GITHUB_SHA'],
                'ref': env['GITHUB_REF'], 'runId': env['GITHUB_RUN_ID'],
                'runAttempt': int(env['GITHUB_RUN_ATTEMPT']),
                'job': 'p5-long-producer' if is_long else 'p5-receiver-calibration' if is_media else 'segmented-artifact-probe'}
    r.need(receipt['identity'] == expected and expected['repository'] == 'Kushyameln01/kushyameln-works'
           and env['GITHUB_JOB'] == ('p5-long-receiver' if is_long else 'p5-calibration-receiver' if is_media else 'segmented-artifact-receiver')
           and re.fullmatch(r'[0-9a-f]{40}', expected['commit'])
           and re.fullmatch(r'[0-9]+', expected['runId'])
           and expected['ref'].startswith('refs/heads/codex/vr180-plan-'), 'PRODUCER_IDENTITY')
    r.need(receipt['schema'] == 'vr180-segmented-transfer-v1'
           and receipt['status'] == 'COMPLETE_MANIFEST_UPLOADED', 'PRODUCER_INCOMPLETE')
    a = receipt['completion']['artifact']
    name = f"vr180-seg-{profile}-{expected['runId']}-{expected['runAttempt']}-{expected['job']}-complete"
    r.need(a['name'] == name and r.integer(a['id'], 1, 2**53-1)
           and r.integer(a['sizeBytes'], 22, 1024*1024)
           and re.fullmatch(r'sha256:[0-9a-f]{64}', a['digest'])
           and r.integer(receipt['completion']['bytes'], 1, 256*1024)
           and r.HEX.fullmatch(receipt['completion']['sha256']), 'COMPLETION_RECEIPT_BOUND')
    return expected


def recover_bundle(manifest, receipt, metadata, stage, evidence, deadline, downloads, helper):
    b = manifest['evidenceBundle']; a = b['artifact']
    r.need(a['id'] != receipt['completion']['artifact']['id'] and manifest['metadataArtifactCount'] == 1
           and receipt['metadataArtifactCount'] == 1 and receipt['artifactCount'] == receipt['partCount']+2,
           'METADATA_ARTIFACT_COUNT_IDENTITY')
    row = r.artifact_metadata(metadata, a['name'], manifest['identity'])
    r.need(row['id'] == a['id'] and row['size_in_bytes'] == a['sizeBytes'] and row['digest'] == a['digest'], 'BUNDLE_SERVICE_METADATA')
    path, proof = download(a, stage, deadline); downloads.append(proof)
    archive, archive_proof = r.verified_archive(path, row, 'evidence.bin', 8*r.MIB, deadline)
    bundle = stage/'producer-evidence.tar.gz'
    with archive:
        r.need(archive.getinfo('evidence.bin').file_size == b['bytes'], 'BUNDLE_ENTRY_SIZE')
        with archive.open('evidence.bin') as source, bundle.open('xb') as target:
            r.copy_payload(source, target, deadline); target.flush(); os.fsync(target.fileno())
    size, sha = r.hash_file(bundle, deadline)
    r.need(size == b['bytes'] and sha == b['sha256'], 'BUNDLE_EXTRACTED_HASH')
    path.unlink()
    quality, verified = helper.unpack_bundle(bundle, manifest, evidence/'producer', deadline)
    r.write_json(evidence/'producer-bundle-verification.json', {**verified, **archive_proof, 'zipCrcCheckedByFullRead': True})
    bundle.unlink()
    return quality


def exact_sources(paths, commit):
    r.need(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, timeout=10).decode().strip() == commit,
           'RECEIVER_CHECKOUT_MISMATCH')
    result = {}
    for name in sorted(set(paths)):
        p = ROOT/name
        r.need(p.is_file() and not p.is_symlink() and p.stat().st_size <= 1024*1024, 'SOURCE_FILE_BOUND')
        raw = p.read_bytes()
        committed = subprocess.check_output(['git', 'show', commit+':'+name], cwd=ROOT, timeout=10)
        r.need(raw == committed, 'RECEIVER_SOURCE_DIFFERS_FROM_COMMIT')
        result[name] = hashlib.sha256(raw).hexdigest()
    return result


def public_metadata(identity, deadline, opener=urllib.request.urlopen):
    """Unauthenticated public REST metadata, never synthesized from SDK rows."""
    rows = []; total = None
    for page in range(1, 4):
        r.check_deadline(deadline)
        url = f"https://api.github.com/repos/Kushyameln01/kushyameln-works/actions/runs/{identity['runId']}/artifacts?per_page=100&page={page}"
        request = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vr180-private-recovery'})
        with opener(request, timeout=min(30, max(1, deadline-time.time()))) as response:
            raw = response.read(4*r.MIB+1)
        r.need(len(raw) <= 4*r.MIB, 'REST_METADATA_BOUND')
        obj = json.loads(raw)
        r.need(r.integer(obj['total_count'], 1, 300) and isinstance(obj['artifacts'], list)
               and len(obj['artifacts']) <= 100, 'REST_ARTIFACT_COUNT')
        if total is None: total = obj['total_count']
        r.need(total == obj['total_count'], 'REST_ARTIFACT_SET_CHANGED')
        rows.extend(obj['artifacts'])
        if len(rows) >= total: break
    r.need(len(rows) == total and len({a['id'] for a in rows}) == total, 'REST_PAGINATION_INCOMPLETE')
    r.check_deadline(deadline)
    return {'total_count': total, 'artifacts': rows}


def download(artifact, directory, deadline):
    r.check_deadline(deadline)
    request_path = directory/'request.json'; output = directory/'part.zip'
    r.need(not output.exists(), 'PART_PATH_OCCUPIED')
    r.write_json(request_path, {'expected': artifact})
    started = time.time()
    # Adapter logs are bounded/safe. A process group ensures timeout cannot leave
    # its SDK child writing after the caller records a failure.
    with (directory/'adapter-stdout.json').open('w+b') as stdout:
        process = subprocess.Popen(['node', str(ROOT/'development/vr180/artifact-receive-action/main.cjs'),
                    '--request', str(request_path), '--output', str(output)],
                    stdout=stdout, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            process.wait(timeout=min(130, max(.01, deadline-time.time())))
        except BaseException as error:
            stop_group(process)
            if isinstance(error, subprocess.TimeoutExpired): raise ValueError('ADAPTER_DEADLINE') from None
            raise
        r.need(process.returncode == 0, 'ADAPTER_FAILED')
        stdout.seek(0); raw = stdout.read(16385)
    r.need(len(raw) <= 16384, 'ADAPTER_RECEIPT_BOUND')
    receipt = json.loads(raw)
    r.check_deadline(deadline)
    return output, {'elapsedSeconds': time.time()-started, 'receipt': receipt}


def recover(receipt, profile, out, env=os.environ):
    identity = validate_receipt(receipt, profile, env)
    is_media = profile not in SMALL
    is_long = profile in LONG
    r.need(not out.exists() and not out.is_symlink()
           and out.parent.resolve() == Path(env['RUNNER_TEMP']).resolve(), 'NEW_RUNNER_TEMP_DIRECTORY')
    out.mkdir(); evidence = out/'evidence'; evidence.mkdir(); stage = out/'stage'; stage.mkdir()
    report = {'schema': 'vr180-independent-actions-recovery-v1',
        'runId': identity['runId']+'-receiver-'+str(identity['runAttempt']),
        'status': 'BLOCKED', 'profile': profile, 'producerIdentity': identity,
        'receiverJob': env['GITHUB_JOB'], 'checkoutCommit': identity['commit'],
        'hostKind': 'Separate fresh GitHub Actions job, not the Codex local filesystem',
        'fullMediaValidation': 'PENDING' if is_media else 'NOT_APPLICABLE_SYNTHETIC_BYTES', 'startedUnix': time.time()}
    deadline = time.time()+DEADLINE_SECONDS.get(profile, 1200); downloads = []
    try:
        own = ['tools/vr180/receive-in-actions.py', 'tools/vr180/receive-segmented-artifact.py',
               'tools/vr180/cloud-validate.py', '.github/workflows/vr180-candidate-validation.yml']
        own += [p.relative_to(ROOT).as_posix() for p in (ROOT/'development/vr180/artifact-receive-action').iterdir()
                if p.is_file() and p.suffix in ('.cjs', '.json', '.yml')]
        if is_media:
            own += ['tools/vr180/receive-media-evidence.py', 'tools/vr180/verify-conversion-large.py',
                    'tools/vr180/verify-metadata.py', 'tools/vr180/record-ffmpeg-toolchain.py',
                    'development/vr180/p5-calibration-prototype/probe-calibration.py',
                    'tools/vr180/probe-output-index.py', 'tools/vr180/probe-indexed-conversion.py']
        if is_long:
            own += ['tools/vr180/receive-long-media-evidence.py',
                    'development/vr180/p5-long-prototype/probe-long.py',
                    'development/vr180/p5-long-prototype/oracle.py',
                    'development/vr180/p5-long-prototype/streaming.py',
                    'development/vr180/p5-long-prototype/evidence-bundle.py',
                    'development/vr180/p5-long-prototype/frame.mjs',
                    'development/vr180/p5-long-prototype/profile.mjs',
                    'development/vr180/p5-long-prototype/worker.mjs',
                    'development/vr180/p5-long-prototype/frame-provenance.json',
                    'development/vr180/p5-calibration-prototype/frame.mjs',
                    'tools/vr180/probe-persistent-storage.py']
        source_hashes = exact_sources(own, identity['commit']); report['sourceSHA256'] = source_hashes
        if is_media:
            media_helper = load('media_receiver', Path(__file__).with_name('receive-media-evidence.py'))
            common_helper = media_helper
            if is_long:
                media_helper = load('long_media_receiver', Path(__file__).with_name('receive-long-media-evidence.py'))
            cal, oracle, dependencies = common_helper.prepare_oracle(Path(env['RUNNER_TEMP'])/'vr180-receiver-oracle.json', evidence)
            r.write_json(evidence/'receiver-oracle-dependencies.json', dependencies)
        r.write_json(evidence/'producer-receipt.json', receipt)
        metadata = public_metadata(identity, deadline); r.write_json(evidence/'service-metadata.json', metadata)
        a = receipt['completion']['artifact']
        r.artifact_metadata(metadata, a['name'], identity)
        report.update(phase='completion-download', activeArtifactId=a['id'])
        archive, proof = download(a, stage, deadline); downloads.append(proof)
        recovery = out/'media'
        r.initialize(archive, metadata, identity, receipt, recovery); archive.unlink()
        # Restrict the already validated receiver's overall deadline to this job's envelope.
        state = r.read_json(recovery/'recovery.json'); state['deadlineUnix'] = deadline
        r.write_json(recovery/'recovery.json', state, deadline)
        manifest = r.read_json(recovery/'completion.json', 256*1024)
        producer_paths = ['development/vr180/artifact-transfer-action/'+n for n in SENDER_FILES]
        producer_paths += ([media_helper.PRODUCER] if is_long else [media_helper.PREPARE, media_helper.CALIBRATION] if is_media else ['tools/vr180/probe-segmented-transfer.py'])
        producer_hashes = exact_sources(producer_paths, identity['commit'])
        r.need(manifest['provenance']['sourceHashes'] == producer_hashes, 'PRODUCER_SOURCE_CLOSURE')
        if is_media:
            media_helper.validate_generator(manifest, producer_hashes)
            report.update(phase='producer-evidence-download', activeArtifactId=manifest['evidenceBundle']['artifact']['id'])
            quality = recover_bundle(manifest, receipt, metadata, stage, evidence, deadline, downloads, common_helper)
            report['producerMediaVerification'] = media_helper.validate_original_records(evidence/'producer', manifest, exact_sources)
        r.write_json(evidence/'completion.json', manifest)
        for f in manifest['files']:
            for part in f['parts']:
                a = part['artifact']; r.artifact_metadata(metadata, a['name'], identity)
                report.update(phase='part-download', activeArtifactId=a['id'], activeFileId=f['id'], activePartIndex=part['index'])
                archive, proof = download(a, stage, deadline); downloads.append(proof)
                report['phase'] = 'part-verify-and-append'
                r.receive_part(recovery, archive, metadata, f['id'], part['index']); archive.unlink()
        report['phase'] = 'whole-readback' if is_media else 'whole-readback-and-independent-formula'
        result = r.finalize(recovery)
        r.write_json(evidence/'recovery.json', result)
        r.write_json(evidence/'downloads.json', downloads)
        if is_media:
            report['phase'] = 'independent-complete-media-inspection'
            report['receiverMediaVerification'] = media_helper.verify_media(recovery, evidence, deadline, cal, oracle, result['wholeFiles'], manifest) if is_long else media_helper.verify_media(recovery, evidence, deadline, cal, oracle, result['wholeFiles'])
            media_pass = quality['mediaVerdict'] == 'PASS' and report['receiverMediaVerification']['status'] == 'PASS'
            report['fullMediaValidation'] = 'PASS' if media_pass else 'FAIL_COMPLETE_SCAN'
        r.need(exact_sources(own, identity['commit']) == source_hashes, 'RECEIVER_SOURCE_CHANGED')
        r.check_deadline(deadline)
        report.update(status=('PASS_COMPLETE_MEDIA' if media_pass else 'COMPLETE_MEDIA_FAIL') if is_media else 'PASS_BYTES_ONLY',
                      phase='complete', activeArtifactId=None, completedUnix=time.time(),
                      recoveredBytes=sum(f['bytes'] for f in result['wholeFiles']),
                      independentComparedBytes=None if is_media else sum(f['independentGeneratorComparedBytes'] for f in result['wholeFiles']),
                      dataArtifacts=manifest['partCount'], downloadArtifacts=len(downloads),
                      metadataOrigin='Unauthenticated GitHub public REST API',
                      bytesOrigin='Same-run ordinary action runtime SDK internal raw ZIP adapter',
                      mediaRetainedUntilRunnerEnds=True, publicCapabilityChanged=False)
    except (Exception, ReceiverCancelled) as error:
        report.update(status='FAIL', completedUnix=time.time(), errorType=type(error).__name__,
                      reason=str(error) if re.fullmatch(r'[A-Z0-9_]{1,100}', str(error)) else 'RECEIVER_FAILED')
        for name in ('recovery.json', 'completion.json'):
            path = out/'media'/name
            if path.is_file() and not path.is_symlink() and path.stat().st_size <= r.MIB:
                r.write_json(evidence/name, r.read_json(path))
        r.write_json(evidence/'downloads.json', downloads)
    r.write_json(evidence/'run.json', report)
    emitted = c.emit_evidence(evidence, report)
    return report, emitted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt-json', required=True); parser.add_argument('--profile', choices=ENABLED, required=True)
    parser.add_argument('--output', type=Path, required=True); args = parser.parse_args()
    r.need(len(args.receipt_json.encode()) <= 16*1024, 'RECEIPT_ARGUMENT_BOUND')
    restore = install_cancellation()
    try: report, emitted = recover(json.loads(args.receipt_json), args.profile, args.output)
    finally: restore()
    return 0 if emitted and report['status'] in ('PASS_BYTES_ONLY', 'PASS_COMPLETE_MEDIA', 'COMPLETE_MEDIA_FAIL') else 1


if __name__ == '__main__':
    try: raise SystemExit(main())
    except (Exception, ReceiverCancelled) as error:
        print(json.dumps({'status': 'FAIL', 'reason': 'RECEIVER_SETUP_FAILED', 'errorType': type(error).__name__}))
        raise SystemExit(1)
