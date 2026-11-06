"""Recover saved Bernini inputs from fixed Git bytes; never run inference.

The original owner CLI remains the single source for controlled latent values
and workflow shapes. This tool restores its exact saved Text packet and format
adapter, then invokes only prepare/prepare-small. Hash checks here are recovery
and diagnostic identities, not ordinary Diffusion API admission requirements.
No implicit fetch, model read, Text export, browser, or numerical oracle run.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
OWNER_COMMIT = 'ffeeeedb6b57d182a977c3ac02c042ce235fc87a'
PACKET_COMMIT = 'f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48'
PACKET_PATH = 'development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor'
PACKET_BLOB = '79f2e153d32846b6a9ed154aaf63b5d35112abae'
PACKET_BYTES = 8390054
PACKET_SHA = '90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9'
NATIVE_BYTES = 8604657
NATIVE_SHA = '9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8'
PAYLOAD_SHA = '107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7'
MASK_SHA = '19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62'
OLD_N5_SHA = 'a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c'
OLD_N5_BYTES = 162181
FIXED_PACKET = Path('/tmp/text-packet-receipt-20261102/source') / PACKET_PATH
FIXED_NATIVE = Path('/tmp/p4-real-text-l512/inputs/real-text-l512-native.json')
HELPER = 'development/ai-connection/p4-real-text-l512/reference/prepare-input.py'
OWNER_CLI = 'tools/diffusion-models/production-reference.py'
CONTRACT_DIR = 'development/ai-connection/d1-d4-production-20261102/input-contract'
SOURCE_PATHS = [
    HELPER, OWNER_CLI, 'tools/diffusion-models/standalone-reference.py',
    'docs/shared/ai-connection/workflow-shapes.mjs',
    'development/ai-connection/original81-profile-comparison-20261102/bernini_rv2v_basic.json',
    CONTRACT_DIR + '/full-declared-case.json',
    CONTRACT_DIR + '/small-real-l512-case.json',
]
CASES = {
    'full': ('prepare', Path('/tmp/d1-d4-production-73947-inputs'), 'full-declared-case.json'),
    'small': ('prepare-small', Path('/tmp/d1-d4-real-l512-n5-inputs'), 'small-real-l512-case.json'),
}
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def identity(path):
    path = Path(path)
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}


def private_directory(path):
    path = Path(path).absolute()
    require(path.is_relative_to('/tmp') and path != Path('/tmp'), 'Dedicated private /tmp directory required')
    for item in [path, *path.parents]:
        require(not item.is_symlink(), 'Private path cannot contain a symlink')
        marker = item / '.git'
        require(not (marker.is_file() or marker.is_dir() and (marker / 'HEAD').exists()),
                'Private data cannot be in a Git checkout')
    missing = []
    cursor = path
    while not cursor.exists():
        missing.append(cursor)
        cursor = cursor.parent
    for item in reversed(missing):
        item.mkdir(mode=0o700)
    require(path.is_dir() and path.stat().st_uid == os.getuid() and path.stat().st_mode & 0o777 == 0o700,
            'Private destination must be owned mode0700')
    return path


def save_exact(path, raw):
    """Idempotent for identical owned files; never overwrite conflicting bytes."""
    path = Path(path)
    private_directory(path.parent)
    require(not path.is_symlink(), 'Private file cannot be a symlink')
    if path.exists():
        require(path.is_file() and path.stat().st_uid == os.getuid() and path.stat().st_mode & 0o777 == 0o600,
                'Existing private file must be owned mode0600')
        require(path.read_bytes() == raw, 'Conflicting existing private file: ' + str(path))
    else:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(raw)
    return identity(path)


def git_asset(repo, commit, path, expected_blob=None):
    """Only exact locally available Git objects; never consult report values."""
    result = subprocess.run(['git', '-C', str(repo), 'rev-parse', commit + ':' + path],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    require(result.returncode == 0, 'Missing fixed Git source ' + commit + ':' + path + '; acquire that object explicitly')
    blob = result.stdout.decode().strip()
    require(len(blob) == 40 and (expected_blob is None or blob == expected_blob), 'Fixed Git blob mismatch')
    raw = subprocess.check_output(['git', '-C', str(repo), 'cat-file', 'blob', blob])
    return raw, {'commit': commit, 'path': path, 'blob': blob, 'bytes': len(raw), 'sha256': sha(raw)}


def rebase_paths(value, current, original):
    if isinstance(value, dict):
        return {key: rebase_paths(item, current, original) for key, item in value.items()}
    if isinstance(value, list):
        return [rebase_paths(item, current, original) for item in value]
    if isinstance(value, str) and (value == str(current) or value.startswith(str(current) + '/')):
        return str(original) + value[len(str(current)):]
    return value


def verify_case(directory, expected):
    """Validate every saved byte and canonical original manifest serialization."""
    directory = Path(directory)
    actual_path = directory / 'inputs.json'
    manifest = json.loads(actual_path.read_bytes())
    original = Path(expected['privateManifest']['path']).parent
    rebased = rebase_paths(manifest, directory, original)
    serialized = (json.dumps(rebased, indent=2, allow_nan=False) + '\n').encode()
    require(len(serialized) == expected['privateManifest']['bytes'] and
            sha(serialized) == expected['privateManifest']['sha256'], 'Restored manifest differs from fixed saved manifest')
    assets = []
    for item in [*manifest['tensors'], manifest['initialEmptyTarget']]:
        path = Path(item['path'])
        require(path.parent == directory and not path.is_symlink(), 'Saved tensor path escapes its case directory')
        actual = identity(path)
        require(actual['bytes'] == item['bytes'] and actual['sha256'] == item['sha256'], 'Saved latent byte identity mismatch')
        assets.append(actual)
    for key, digest, size in [('payloadPath', PAYLOAD_SHA, 8388608), ('maskPath', MASK_SHA, 512)]:
        path = Path(manifest['conditioning'][key])
        require(path.parent == directory and not path.is_symlink(), 'Saved conditioning path escapes its case directory')
        actual = identity(path)
        require(actual['sha256'] == digest and actual['bytes'] == size, 'Saved conditioning byte identity mismatch')
        assets.append(actual)
    return {'profileId': manifest['profileId'], 'totalTokens': manifest['canonicalShape']['concatenation']['totalTokens'],
            'manifest': identity(actual_path), 'originalManifest': expected['privateManifest'],
            'exactOriginalManifestBytes': actual_path.read_bytes() == serialized,
            'equivalentAfterDeclaredPathRebase': True, 'assets': assets,
            'producerVerified': False, 'originalWorkflowReplay': False, 'numericalModelExecution': False}


def recover(args):
    root = private_directory(args.private_root)
    source_root = private_directory(root / 'fixed-owner-source')
    sources = []
    for path in SOURCE_PATHS:
        raw, source = git_asset(args.repo, OWNER_COMMIT, path)
        save_exact(source_root / path, raw)
        sources.append(source)
    packet, packet_source = git_asset(args.repo, PACKET_COMMIT, PACKET_PATH, PACKET_BLOB)
    require(len(packet) == PACKET_BYTES and sha(packet) == PACKET_SHA, 'Exact saved Text packet required')
    spec = importlib.util.spec_from_file_location('frozen_saved_text_format_adapter', source_root / HELPER)
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    data, mask, metadata, header = adapter.decode_packet(packet)
    require(sha(data.tobytes()) == PAYLOAD_SHA and sha(mask.tobytes()) == MASK_SHA, 'Saved Text F32/mask bit identity mismatch')
    native = (json.dumps(adapter.native_input(data, metadata, header, packet), separators=(',', ':'), allow_nan=False) + '\n').encode()
    require(len(native) == NATIVE_BYTES and sha(native) == NATIVE_SHA, 'Restored native Text serialization differs from saved identity')
    restored = {'packet': save_exact(FIXED_PACKET, packet), 'nativeJSON': save_exact(FIXED_NATIVE, native)}
    if args.retained_n5 and Path(args.retained_n5).exists():
        raw = Path(args.retained_n5).read_bytes()
        require(len(raw) == OLD_N5_BYTES and sha(raw) == OLD_N5_SHA, 'Retained N5/L3 saved artifact identity mismatch')
        restored['oldN5L3'] = save_exact(root / 'old-n5-l3-input.json', raw)
        restored['oldN5L3']['sourcePath'] = str(args.retained_n5)
    else:
        restored['oldN5L3'] = {'status': 'NOT_ACQUIRED', 'requiredForRealL512Preparation': False,
                               'expectedBytes': OLD_N5_BYTES, 'expectedSHA256': OLD_N5_SHA}
    cases = {}
    if not args.skip_prepare:
        for name, (command, default_dir, filename) in CASES.items():
            directory = Path(getattr(args, name + '_dir') or default_dir).absolute()
            private_directory(directory)
            expected = json.loads((source_root / CONTRACT_DIR / filename).read_bytes())
            if not (directory / 'inputs.json').exists():
                require(not any(directory.iterdir()), 'Case destination must be fresh or a complete verified saved case')
                subprocess.run([sys.executable, str(source_root / OWNER_CLI), command,
                                '--private-dir', str(directory), '--text', str(FIXED_NATIVE),
                                '--receipt', str(root / (name + '-preparation.json'))], check=True,
                               env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
            cases[name] = verify_case(directory, expected)
    receipt = {'schemaVersion': 'bernini-saved-input-recovery/1', 'ownerExecutionSource': OWNER_COMMIT,
               'packetSource': packet_source, 'sourceAssets': sources, 'restored': restored, 'cases': cases,
               'restoration': 'exact Git packet plus unchanged frozen format adapter; unchanged owner prepare CLI',
               'normalization': {'declaration': 'umt5-final-rmsnorm-f32-v1', 'numericTransform': False,
                                 'owner': OWNER_CLI + ':verified_text'},
               'modelsOpened': False, 'numericalInferenceExecuted': False, 'newTextExport': False,
               'originalWorkflowReplay': False}
    save_exact(root / 'recovery-receipt.json', (json.dumps(receipt, indent=2) + '\n').encode())
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT, help='Git checkout containing both fixed objects; no implicit fetch')
    parser.add_argument('--private-root', type=Path, default=Path('/tmp/bernini-input-recovery-20261104'))
    parser.add_argument('--full-dir', type=Path, help='Default preserves old absolute manifest identity; override records path rebase')
    parser.add_argument('--small-dir', type=Path, help='Default preserves old absolute manifest identity; override records path rebase')
    parser.add_argument('--retained-n5', type=Path, default=Path('/workspace/work/diffusion-private-hidden/standalone-n5-l3-input.json'))
    parser.add_argument('--skip-prepare', action='store_true', help='Only restore exact saved Text and optional old N5; no controlled latent preparation')
    args = parser.parse_args()
    result = recover(args)
    print(json.dumps({'recovered': True, 'receipt': str(args.private_root / 'recovery-receipt.json'),
                      'cases': {key: {'tokens': value['totalTokens'], 'exactOriginalManifestBytes': value['exactOriginalManifestBytes']} for key, value in result['cases'].items()},
                      'numericalInferenceExecuted': False}))


if __name__ == '__main__':
    main()
