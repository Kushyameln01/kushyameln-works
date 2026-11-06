"""Prepare the frozen controlled fixture and relink existing reference sources.

No model download, model hash, graph execution, numeric implementation, or
contract freeze is provided by this helper. Reference execution remains an
explicit forwarded run command in the original independent reference module.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
TOOLS = ROOT / 'tools/diffusion-models'
COMFY_COMMIT = 'b5a432157de6b8884f81104cd02926adf4d597e4'
UPSTREAM_KEYS = (
    'comfy/model_sampling.py', 'comfy/samplers.py',
    'comfy/k_diffusion/sampling.py', 'comfy/latent_formats.py',
    'comfy/ldm/wan/model.py',
)
MAX_SOURCE_BYTES = 1024 * 1024
CAPTURE_PROFILE = 'retained-plus-lf-v1'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixed_contracts():
    full = json.loads((HERE / 'reference/contract.json').read_text())
    sampler = json.loads((HERE / 'sampler-reference/contract.json').read_text())
    require(full['fixtureSHA256'] == sampler['fixtureSHA256'], 'Fixed fixture identities disagree')
    require(full['gateMayNotBeRelaxedAfterComparison'] is True and sampler['gateMayNotBeRelaxedAfterComparison'] is True, 'Frozen gates required')
    return full, sampler


def verify_generators():
    _, sampler = fixed_contracts()
    records = []
    for relative in ('tools/diffusion-models/standalone-reference.py', 'tools/diffusion-models/standalone-sampler-reference.py'):
        path = ROOT / relative
        raw = path.read_bytes()
        require(digest(raw) == sampler['sourceSHA256'][relative], 'Reference generator differs from the frozen contract: ' + relative)
        records.append({'path': relative, 'bytes': len(raw), 'sha256': digest(raw)})
    return records


def source_entries():
    _, sampler = fixed_contracts()
    manifest = json.loads((ROOT / 'development/ai-connection/a0/core-source-manifest.json').read_text())
    by_path = {item['path']: item for item in manifest['sources']}
    capture_manifest = json.loads((HERE / 'RAW-SOURCE-CAPTURES.json').read_text())
    require(capture_manifest['profileId'] == CAPTURE_PROFILE and capture_manifest['suffixHex'] == '0a' and capture_manifest['appendedBytes'] == 1, 'Exact audited single-LF capture format required')
    require(capture_manifest['repository'] == 'Comfy-Org/ComfyUI' and capture_manifest['commit'] == COMFY_COMMIT, 'Pinned raw/capture provenance required')
    captures = {item['path']: item for item in capture_manifest['sources']}
    entries = []
    for key in UPSTREAM_KEYS:
        item = by_path[key]
        expected_url = f'https://raw.githubusercontent.com/Comfy-Org/ComfyUI/{COMFY_COMMIT}/{key}'
        require(item['repository'] == 'Comfy-Org/ComfyUI' and item['commit'] == COMFY_COMMIT and item['rawURL'] == expected_url, 'Pinned upstream URL required: ' + key)
        require(item['sha256'] == sampler['sourceSHA256'][key], 'Upstream manifest and frozen contract disagree: ' + key)
        require(0 < item['bytes'] <= MAX_SOURCE_BYTES, 'Small upstream source extent required')
        audited = captures[key]
        require(audited['url'] == expected_url and audited['capture'] == {field: item[field] for field in ('bytes', 'sha256', 'gitBlobSHA1')}, 'Audited capture and legacy manifest disagree: ' + key)
        require(audited['raw']['bytes'] + 1 == item['bytes'] and audited['actualRetainedBytesEqualRawPlusSuffix'] is True and audited['astEqual'] is True, 'Exact observed legacy capture relation required')
        entries.append({'path': key, 'bytes': item['bytes'], 'sha256': item['sha256'], 'gitBlobSHA1': item['gitBlobSHA1'], 'url': expected_url, 'raw': audited['raw']})
    return entries


def cache_path(cache, entry):
    cache = Path(cache).resolve()
    result = (cache / entry['path']).resolve()
    require(result.is_relative_to(cache), 'Upstream cache path escaped its directory')
    return result


def verify_source(path, entry):
    require(path.is_file() and path.stat().st_size == entry['bytes'], 'Missing or wrong-length cached upstream source: ' + str(path))
    with path.open('rb') as stream:
        raw = stream.read(entry['bytes'] + 1)
    require(len(raw) == entry['bytes'] and digest(raw) == entry['sha256'], 'Cached upstream source hash differs: ' + str(path))
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    require(blob == entry['gitBlobSHA1'], 'Cached source object identity differs: ' + str(path))
    return {'path': entry['path'], 'cachePath': str(path), 'bytes': len(raw), 'sha256': digest(raw), 'gitBlobSHA1': blob}


def verified_cache(cache, fetch=False, capture_profile=None):
    cache = Path(cache).resolve()
    require(not cache.is_relative_to(ROOT), 'Use an upstream cache outside this checkout')
    require(not fetch or capture_profile == CAPTURE_PROFILE, '--fetch-sources requires explicit --capture-profile retained-plus-lf-v1; no silent byte conversion is performed')
    entries = source_entries()
    records = []
    for entry in entries:
        path = cache_path(cache, entry)
        raw_path = cache_path(cache, {'path': 'raw/' + entry['path']})
        raw_entry = {'path': entry['path'], **entry['raw']}
        raw_downloaded = False
        capture_materialized = False
        if fetch and not raw_path.exists():
            request = urllib.request.Request(entry['url'], headers={'User-Agent': 'Kushyameln-Works-reproduction'})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read(MAX_SOURCE_BYTES + 1)
            require(len(raw) == raw_entry['bytes'] and digest(raw) == raw_entry['sha256'], 'Downloaded raw upstream identity differs: ' + entry['path'])
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            # Existing cache content is never replaced, including a dangling link.
            descriptor = os.open(raw_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(raw)
            raw_downloaded = True
        raw_record = verify_source(raw_path, raw_entry) if raw_path.exists() else None
        if not path.exists():
            require(fetch, 'Retained capture is not cached; use the explicit fetch/capture options or place its exact bytes at ' + str(path))
            with raw_path.open('rb') as stream:
                raw = stream.read(raw_entry['bytes'] + 1)
            require(len(raw) == raw_entry['bytes'] and digest(raw) == raw_entry['sha256'], 'Raw cache changed before capture materialization')
            capture = raw + b'\n'
            require(len(capture) == entry['bytes'] and digest(capture) == entry['sha256'], 'Explicit single-LF capture does not match the frozen source')
            path.parent.mkdir(parents=True, exist_ok=True)
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(capture)
            capture_materialized = True
        record = verify_source(path, entry)
        if raw_record is not None:
            with raw_path.open('rb') as stream:
                raw = stream.read(raw_entry['bytes'] + 1)
            with path.open('rb') as stream:
                capture = stream.read(entry['bytes'] + 1)
            require(capture == raw + b'\n', 'Cached raw and retained source relation changed')
        records.append({**record, 'identityRole': 'retained-reference-capture', 'captureProfile': CAPTURE_PROFILE, 'rawIdentity': entry['raw'], 'rawCachePath': str(raw_path) if raw_record else None, 'rawVerifiedInThisCache': raw_record is not None, 'rawDownloadedThisCall': raw_downloaded, 'captureMaterializedThisCall': capture_materialized})
    return records


def reference_module(kind, cache):
    verify_generators()
    records = verified_cache(cache)
    paths = {item['path']: Path(item['cachePath']) for item in records}
    file_name = 'standalone-reference.py' if kind == 'full40' else 'standalone-sampler-reference.py'
    module = load_module('portable_independent_' + kind, TOOLS / file_name)
    if kind == 'full40':
        module.CORE = paths['comfy/ldm/wan/model.py']
    else:
        module.SOURCES = paths
        module.REF.CORE = paths['comfy/ldm/wan/model.py']
    return module, records


def fixture_bytes():
    verify_generators()
    reference = load_module('portable_controlled_fixture', TOOLS / 'standalone-reference.py')
    fixture = reference.controlled_fixture()
    raw = (json.dumps(fixture, separators=(',', ':'), allow_nan=False) + '\n').encode()
    full, sampler = fixed_contracts()
    require(len(raw) == full['fixtureBytes'] == sampler['fixtureBytes'] and digest(raw) == full['fixtureSHA256'], 'Controlled generator no longer reproduces the frozen fixture')
    return reference, fixture, raw


def prepare(args):
    sources = verified_cache(args.upstream_dir, args.fetch_sources, args.capture_profile)
    reference, fixture, raw = fixture_bytes()
    # Reuse the browser runner's actual-checkout and dedicated-private-dir rules.
    browser = load_module('portable_browser_paths', ROOT / 'docs/shared/diffusion-models/execution/model-candidate-browser.py')
    path = browser.private_path(args.private_dir / 'input.json', 'Prepared fixture')
    browser.private_parent(path, create=True)
    created = not path.exists()
    if created:
        written = reference.private_write(path, fixture)
        require(written == raw, 'Existing private writer changed the serialized fixture')
    else:
        require(path.is_file() and path.stat().st_size == len(raw) and path.read_bytes() == raw, 'An existing different fixture will not be overwritten')
    require(stat.S_IMODE(path.stat().st_mode) == 0o600 and path.stat().st_uid == os.getuid(), 'Prepared fixture must be owned by this user with mode0600')
    print(json.dumps({'fixturePath': str(path), 'fixtureBytes': len(raw), 'fixtureSHA256': digest(raw), 'fixtureCreated': created, 'captureProfileSelection': args.capture_profile, 'upstreamSources': sources, 'referenceGenerators': verify_generators(), 'scope': {'controlledN5L3Only': True, 'neuralInferenceExecuted': False, 'contractsRewritten': False, 'required81FrameWorkflowVerified': False, 'publicLoadPredictSample': 'NOT_READY'}}, indent=2))


def forward_reference(args):
    arguments = args.arguments[1:] if args.arguments[:1] == ['--'] else args.arguments
    require(arguments and arguments[0] in ('run', 'compare'), 'Forward only an explicit run or compare command; reproduction does not refreeze contracts')
    module, _ = reference_module(args.kind, args.upstream_dir)
    previous = sys.argv
    try:
        sys.argv = [str(module.__file__), *arguments]
        module.main()
    finally:
        sys.argv = previous


def self_test(args):
    before = {path: path.read_bytes() for path in (HERE / 'reference/contract.json', HERE / 'sampler-reference/contract.json')}
    entries = source_entries()
    _, _, raw = fixture_bytes()
    checks = ['five audited raw/capture manifest entries agree with frozen identities', 'both fixed reference generator hashes agree', 'controlled fixture byte count and SHA-256 agree']
    if args.upstream_dir is not None:
        module, records = reference_module('sample', args.upstream_dir)
        _, contract = fixed_contracts()
        require(module.source_hashes() == contract['sourceSHA256'], 'Path relinking changed independent source identities')
        require(module.REF.CORE == Path(args.upstream_dir).resolve() / 'comfy/ldm/wan/model.py', 'Full40 core path was not relinked')
        checks += ['five actual cached retained-capture byte counts and hashes agree', 'relinked original reference source hashes match the frozen contract', 'nested full40 core path uses the verified cache']
        raw_pairs = [record for record in records if record['rawCachePath'] is not None]
        for record in raw_pairs:
            source_raw = Path(record['rawCachePath']).read_bytes()
            capture = Path(record['cachePath']).read_bytes()
            require(capture == source_raw + b'\n' and ast.dump(ast.parse(source_raw.decode()), include_attributes=False) == ast.dump(ast.parse(capture.decode()), include_attributes=False), 'Raw/capture byte or AST relation changed')
        if raw_pairs:
            require(len(raw_pairs) == len(UPSTREAM_KEYS), 'Complete raw/capture audit pairs required')
            checks.append('all five cached raw/capture pairs differ by exactly one LF and have equal ASTs')
    require(all(path.read_bytes() == value for path, value in before.items()), 'A reproduction check changed a frozen contract')
    checks.append('both frozen contracts remain byte-identical')
    print(json.dumps({'passed': True, 'checks': checks, 'sourceCount': len(entries), 'fixtureBytes': len(raw), 'fixtureSHA256': digest(raw), 'neuralInferenceExecuted': False, 'contractsRewritten': False}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare_parser = sub.add_parser('prepare', help='Prepare the fixed fixture and five verified small upstream sources; no NN')
    prepare_parser.add_argument('--private-dir', type=Path, required=True)
    prepare_parser.add_argument('--upstream-dir', type=Path, required=True)
    prepare_parser.add_argument('--fetch-sources', action='store_true')
    prepare_parser.add_argument('--capture-profile', choices=(CAPTURE_PROFILE,))
    prepare_parser.set_defaults(function=prepare)
    reference_parser = sub.add_parser('reference', help='Relink verified public source paths and forward an explicit independent run/compare')
    reference_parser.add_argument('--kind', choices=('full40', 'sample'), required=True)
    reference_parser.add_argument('--upstream-dir', type=Path, required=True)
    reference_parser.add_argument('arguments', nargs=argparse.REMAINDER)
    reference_parser.set_defaults(function=forward_reference)
    check_parser = sub.add_parser('self-test', help='Small hash/path tests only; no model data or graph execution')
    check_parser.add_argument('--upstream-dir', type=Path)
    check_parser.set_defaults(function=self_test)
    args = parser.parse_args()
    args.function(args)


if __name__ == '__main__':
    main()
