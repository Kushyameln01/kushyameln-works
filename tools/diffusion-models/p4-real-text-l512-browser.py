"""Separate strict real L512 diagnostic; unchanged P4 runtime and numerical gates.

Private native JSON/model files enter Chromium through local File inputs only.
All25 F32 outputs leave through bounded private binding chunks under /tmp.
Numerical acceptance is a separate independent reference command.
"""
import argparse
import base64
import hashlib
import http.server
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = 'tools/diffusion-models/p4-real-text-l512-browser.py'
RUNNER = 'docs/shared/diffusion-models/diagnostics/p4-real-text-l512/run.mjs'
NATIVE_SHA256 = '9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8'
NATIVE_BYTES = 8604657
PREPARE = 'development/ai-connection/p4-real-text-l512/reference/prepare-input.py'
DEFAULT_INPUT = Path('/tmp/p4-real-text-l512/inputs/real-text-l512-native.json')
DEFAULT_PACKET = Path('/tmp/text-packet-receipt-20261102/source/development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor')


def module_path(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COMMON = module_path(Path(__file__).with_name('p4-cross-ffn-browser.py'), 'p4_cross_browser_real_l512')
sha = COMMON.sha


def shapes():
    return {name: [512 if n == 'L' else n for n in shape]
            for name, shape in COMMON.module_at('p4-cross-ffn-reference').ARRAY_SHAPES.items()}


def load_native_input(path, packet_path=DEFAULT_PACKET):
    """Exact native file plus original WKT/header/payload, before Chromium."""
    raw = Path(path).read_bytes()
    if len(raw) != NATIVE_BYTES or sha(raw) != NATIVE_SHA256:
        raise ValueError('Frozen native Text file SHA256/length mismatch')
    prepare = module_path(ROOT / PREPARE, 'p4_real_l512_prepare')
    packet = Path(packet_path).read_bytes()
    if len(packet) != 8390054 or sha(packet) != prepare.PACKET_SHA256:
        raise ValueError('Original real L512 WKT identity mismatch')
    data, mask, metadata, header = prepare.decode_packet(packet)
    native = json.loads(raw, object_pairs_hook=prepare.unique_object)
    wanted = prepare.native_input(data, metadata, header, packet)
    if native != wanted or COMMON.f32_bytes(native['data']) != data.tobytes():
        raise ValueError('Native input changed original F32 bits/metadata/header/mask')
    if native.get('modelSha256') != prepare.MODEL_SHA256 or native.get('tokenizerSha256') != prepare.TOKENIZER_SHA256 or native.get('producer', {}).get('sourceCommit') != prepare.TEXT_PRODUCER_COMMIT:
        raise ValueError('Frozen native model/tokenizer/producer identity mismatch')
    return {'nativeTextArtifactSHA256': NATIVE_SHA256,
            'conditioningDataSHA256': sha(data.tobytes()),
            'conditioningMaskSHA256': sha(mask.tobytes())}


class PrivateBinarySink:
    """Strict per-array offsets and limits; never interprets F32 as JSON numbers."""
    def __init__(self, directory):
        self.directory = Path(directory)
        if not self.directory.is_absolute() or not self.directory.resolve().is_relative_to(Path('/tmp')):
            raise ValueError('Private binary outputs must use an absolute /tmp path')
        self.directory.mkdir(parents=True, exist_ok=False, mode=0o700)
        self.directory.chmod(0o700)
        self.expected_shapes = shapes()
        self.entries = {}
        self.chunk_count = 0
        self.raw_bytes = 0
        self.base64_characters = 0
        self.decode_write_seconds = 0.

    def write(self, chunk):
        began = time.monotonic()
        if not isinstance(chunk, dict) or set(chunk) != {'name', 'offset', 'byteLength', 'base64'} or chunk['name'] not in self.expected_shapes:
            raise ValueError('Registered private output chunk required')
        name = chunk['name']
        maximum = math.prod(self.expected_shapes[name]) * 4
        if type(chunk['offset']) is not int or type(chunk['byteLength']) is not int or not 0 < chunk['byteLength'] <= 262144 or chunk['offset'] % 4 or chunk['byteLength'] % 4 or not isinstance(chunk['base64'], str) or len(chunk['base64']) > 349528:
            raise ValueError('Bounded aligned private output chunk required')
        raw = base64.b64decode(chunk['base64'], validate=True)
        if len(raw) != chunk['byteLength'] or chunk['offset'] + len(raw) > maximum:
            raise ValueError('Private output extent mismatch')
        entry = self.entries.get(name)
        if entry is None:
            if chunk['offset'] != 0:
                raise ValueError('Private output first offset must be zero')
            fd = os.open(self.directory / (name + '.f32'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            entry = self.entries[name] = {'file': os.fdopen(fd, 'wb'), 'bytes': 0, 'hash': hashlib.sha256()}
        if entry['bytes'] != chunk['offset'] or entry['file'].closed:
            raise ValueError('Private output chunk order/duplicate mismatch')
        entry['file'].write(raw)
        entry['hash'].update(raw)
        entry['bytes'] += len(raw)
        if entry['bytes'] == maximum:
            entry['file'].close()
        self.chunk_count += 1
        self.raw_bytes += len(raw)
        self.base64_characters += len(chunk['base64'])
        self.decode_write_seconds += time.monotonic() - began

    def finish(self, manifest_text, identities):
        manifest = json.loads(manifest_text)
        if manifest.get('schemaVersion') != 'bernini-p4-real-text-l512-runtime/0.1' or set(self.entries) != set(self.expected_shapes) or set(identities) != set(self.expected_shapes) or manifest.get('outputIdentities') != identities or set(manifest.get('arrays', {})) != set(self.expected_shapes):
            raise ValueError('All25 private output descriptors/native identities required')
        evidence_hashes = manifest.get('evidence', {}).get('outputHashes', {})
        if set(evidence_hashes) != {name + 'SHA256' for name in self.expected_shapes}:
            raise ValueError('All25 native evidence output hashes required')
        for name, shape in self.expected_shapes.items():
            entry, identity = self.entries[name], identities[name]
            size, digest = math.prod(shape) * 4, entry['hash'].hexdigest()
            if not entry['file'].closed or entry['bytes'] != size or identity != {'shape': shape, 'elements': math.prod(shape), 'bytes': size, 'sha256': digest} or evidence_hashes[name + 'SHA256'] != digest or manifest['arrays'][name] != {'path': name + '.f32', 'shape': shape, 'dtype': 'float32', 'sha256': digest, 'bytes': size}:
                raise ValueError('Private output native bits/shape mismatch: ' + name)
            disk_hash = hashlib.sha256()
            with (self.directory / (name + '.f32')).open('rb') as saved:
                while block := saved.read(262144):
                    disk_hash.update(block)
            if (self.directory / (name + '.f32')).stat().st_size != size or disk_hash.hexdigest() != digest:
                raise ValueError('Private output file bits differ from native identity: ' + name)
        raw = COMMON.private_write(self.directory / 'manifest.json', manifest_text)
        return {'passed': True, 'verifiedOutputCount': 25, 'strictNativeOutputBits': True,
                'signedZeroPreservedByBinaryTransport': True, 'manifestSHA256': sha(raw),
                'chunkCount': self.chunk_count, 'rawBytes': self.raw_bytes,
                'base64Characters': self.base64_characters,
                'decodeWriteMs': self.decode_write_seconds * 1000}

    def close(self):
        for entry in self.entries.values():
            entry['file'].close()


def source_inventory():
    inventory = COMMON.source_inventory()
    for name in (SCRIPT, PREPARE, 'development/ai-connection/p4-real-text-l512/reference/run-reference.py'):
        path = ROOT / name
        if path.exists():
            inventory[name] = sha(path.read_bytes())
    return inventory


def verify_execution_source(commit, inventory):
    """An actual run must use already committed executable sources."""
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if commit != head or len(commit) != 40:
        raise ValueError('Execution source commit must equal current committed HEAD')
    names = sorted(inventory)
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', *names], cwd=ROOT, text=True).splitlines())
    if tracked != set(names) or subprocess.run(['git', 'diff', '--quiet', commit, '--', *names], cwd=ROOT).returncode:
        raise ValueError('Execution sources must be tracked and unchanged from fixed commit')
    return {'commit': commit, 'workingTreeSourcesMatchCommit': True,
            'inventorySHA256': sha(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode()),
            'verifiedBeforeNativeConstruction': True}


def verify_composed_freeze(path, side, bindings, source_commit):
    """Frozen full composed identities must exist before the first native owner."""
    reference = COMMON.module_at('p4-cross-ffn-reference')
    plan = reference.load_plan()
    raw = Path(path).read_bytes()
    freeze = json.loads(raw, object_pairs_hook=reference.unique_object)
    if freeze.get('schemaVersion') != 'bernini-p4-l512-pre-runtime-reference-freeze/0.1' or freeze.get('candidatePlanSHA256') != reference.PLAN_SHA256 or freeze.get('sourceCommit') != source_commit or set(freeze.get('cases', {})) != {'HIGH', 'LOW'}:
        raise ValueError('Fixed pre-runtime composed reference freeze required')
    case = freeze['cases'][side]
    if not isinstance(case, dict) or not isinstance(case.get('manifestPath'), str) or not Path(case['manifestPath']).is_absolute():
        raise ValueError('Absolute private composed reference manifest required')
    manifest_raw = Path(case['manifestPath']).read_bytes()
    if sha(manifest_raw) != case.get('manifestSHA256'):
        raise ValueError('Pre-runtime composed manifest SHA256 mismatch')
    manifest = json.loads(manifest_raw, object_pairs_hook=reference.unique_object)
    if manifest.get('schemaVersion') != 'bernini-p4-real-text-l512-reference-arrays/0.1' or manifest.get('mode') != 'COMPOSED_BEFORE_RUNTIME' or manifest.get('side') != side or manifest.get('candidatePlanSHA256') != reference.PLAN_SHA256 or manifest.get('inputBindings') != bindings or manifest.get('gates') != plan['gates'] or manifest.get('independentOracleSHA256') != sha((ROOT / 'tools/diffusion-models/p4-cross-ffn-reference.py').read_bytes()) or manifest.get('transportGeneratorSHA256') != sha((ROOT / 'development/ai-connection/p4-real-text-l512/reference/run-reference.py').read_bytes()):
        raise ValueError('Pre-runtime composed reference mode/side/plan/input/gates mismatch')
    identities = manifest.get('outputIdentities')
    if not isinstance(identities, dict) or set(identities) != set(shapes()):
        raise ValueError('Pre-runtime composed reference requires all25 identities')
    for name, shape in shapes().items():
        identity = identities[name]
        digest = identity.get('sha256') if isinstance(identity, dict) else None
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest) or identity != {'shape': shape, 'elements': math.prod(shape), 'bytes': math.prod(shape) * 4, 'sha256': digest}:
            raise ValueError('Pre-runtime composed output identity shape/hash mismatch: ' + name)
    return {'freezeSHA256': sha(raw), 'manifestSHA256': sha(manifest_raw),
            'mode': 'COMPOSED_BEFORE_RUNTIME', 'verifiedBeforeNativeConstruction': True,
            'verifiedOutputCount': 25, 'gates': plan['gates'],
            'scope': 'Independent composed all25 identities existed before this runtime; numerical acceptance remains pending.'}


class MemorySampler:
    """Owned Chromium descendants plus whole-environment cgroup observations."""
    def __init__(self, interval=.1):
        import psutil
        self.psutil = psutil
        self.interval = interval
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.sample_lock = threading.Lock()
        self.summary = {'sampleCount': 0, 'firstElapsedMs': None, 'lastElapsedMs': None,
                        'rssPeakProcessSumBytes': None, 'pssPeakProcessSumBytes': None,
                        'cgroupCurrentObservedPeakBytes': None, 'cgroupHistoricalPeakBytes': None,
                        'cgroupLimitBytes': None, 'maxSamplingGapMs': 0., 'sampleWallMs': 0.}
        self.grouped = {}
        self.events = []
        self.phase = 'browser-launch'
        self.errors = {}
        self.thread = None
        self.began = time.monotonic()

    def read_error(self, label):
        self.errors[label] = self.errors.get(label, 0) + 1

    def sample(self):
        # Serialize the timer and boundary samples; aggregate online, bounded by
        # the fixed operator/head phase count instead of retaining every sample.
        with self.sample_lock:
            began = time.monotonic()
            rss, pss, count = 0, 0, 0
            try:
                processes = self.psutil.Process(os.getpid()).children(recursive=True)
            except self.psutil.Error as error:
                self.read_error('children:' + type(error).__name__)
                processes = []
            for process in processes:
                try:
                    if not any(word in process.name().lower() for word in ('chromium', 'chrome_crashpad')):
                        continue
                    info = process.memory_full_info()
                    rss += info.rss
                    pss += info.pss
                    count += 1
                except self.psutil.Error as error:
                    self.read_error('process:' + type(error).__name__)
            cgroup = {}
            for name in ('memory.current', 'memory.peak', 'memory.max'):
                try:
                    value = Path('/sys/fs/cgroup', name).read_text().strip()
                    cgroup[name] = int(value) if value != 'max' else None
                except (OSError, ValueError) as error:
                    self.read_error(name + ':' + type(error).__name__)
                    cgroup[name] = None
            elapsed = (time.monotonic() - self.began) * 1000
            values = {'rssPeakProcessSumBytes': rss if count else None,
                      'pssPeakProcessSumBytes': pss if count else None,
                      'cgroupCurrentObservedPeakBytes': cgroup['memory.current'],
                      'cgroupHistoricalPeakBytes': cgroup['memory.peak'],
                      'cgroupLimitBytes': cgroup['memory.max']}
            with self.lock:
                phase = self.grouped.setdefault(self.phase, {'sampleCount': 0, 'firstElapsedMs': elapsed, 'lastElapsedMs': elapsed})
                if self.summary['lastElapsedMs'] is not None:
                    self.summary['maxSamplingGapMs'] = max(self.summary['maxSamplingGapMs'], elapsed - self.summary['lastElapsedMs'])
                self.summary['sampleWallMs'] += (time.monotonic() - began) * 1000
                if self.summary['firstElapsedMs'] is None:
                    self.summary['firstElapsedMs'] = elapsed
                for target in (self.summary, phase):
                    target['sampleCount'] += 1
                    target['lastElapsedMs'] = elapsed
                    for key, value in values.items():
                        if value is not None:
                            target[key] = max(target.get(key) or 0, value)

    def phase_event(self, event):
        if not isinstance(event, dict) or set(event) != {'phase', 'atMs'} or not isinstance(event['phase'], str) or len(event['phase']) > 160:
            raise ValueError('Public bounded phase event required')
        self.phase = event['phase']
        self.events.append({'phase': self.phase, 'elapsedMs': (time.monotonic() - self.began) * 1000,
                            'browserAtMs': event['atMs']})
        self.sample()
        print(json.dumps({'phase': self.phase, 'elapsedSeconds': round(time.monotonic() - self.began, 2)}), flush=True)

    def start(self):
        self.sample()
        def loop():
            while not self.stop.wait(self.interval):
                self.sample()
        self.thread = threading.Thread(target=loop, daemon=True)
        self.thread.start()

    def finish(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=2)
        self.sample()
        return {**self.summary, 'intervalTargetMs': self.interval * 1000,
                'phaseMeasurements': self.grouped, 'events': self.events,
                'readErrors': self.errors, 'onlineAggregation': True,
                'scope': 'Sampled owned Chromium process sums include harness/File/ORT/Hike; RSS counts shared pages repeatedly. PSS apportions shared pages. Cgroup includes the entire environment and memory.peak predates this run. Sampling can miss short peaks; neither is allocator usage or full-pipeline peak.'}


def public_projection(result):
    additions = {key: result[key] for key in ('browserMemory', 'sourceExecution', 'preRuntimeReference', 'priorSavedTailGuard') if key in result}
    projected = COMMON.public_projection(result)
    # Reuse its recursive private-field guard for the additional public objects.
    for key, value in additions.items():
        COMMON.public_projection({'evidence': value})
        projected[key] = value
    return projected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--side', choices=('HIGH', 'LOW'), action='append')
    parser.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--saved-dir', type=Path, default=COMMON.SAVED)
    parser.add_argument('--native-input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--packet', type=Path, default=DEFAULT_PACKET)
    parser.add_argument('--private-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'development/ai-connection/p4-real-text-l512/integration')
    parser.add_argument('--source-commit')
    parser.add_argument('--composed-freeze', type=Path)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    sides = args.side or ['HIGH', 'LOW']
    if len(set(sides)) != len(sides):
        parser.error('Each side may occur only once')
    native_binding = load_native_input(args.native_input, args.packet)
    reference = COMMON.module_at('p4-cross-ffn-reference')
    reference.load_plan()
    old = COMMON.module_at('tail-browser')
    inputs = []
    for side in sides:
        payload, guard = COMMON.load_saved_inputs(side, args.saved_dir)
        old_payload, anchors = old.load_tail_inputs(side, COMMON.OLD_PRIVATE)
        if payload['trustedInputs'] != old_payload['trustedInputs']:
            raise ValueError('Saved trusted input anchors mismatch')
        guard['oldE4Package'] = COMMON.verify_old_packages(side, payload)
        guard['priorProducerGuardSHA256'] = sha(json.dumps(anchors, sort_keys=True, separators=(',', ':')).encode())
        payload.update(candidatePlanSHA256=reference.PLAN_SHA256,
                       inputBindings={'savedArtifactSHA256': guard['savedArtifactSHA256'], **native_binding})
        # Historical numerical outputs are independently checked above, then dropped.
        del payload['oldOutputs']
        model = args.model_dir / reference.MODELS[side][0]
        if model.stat().st_size != 15574833216:
            raise ValueError('Original side model size mismatch')
        inputs.append((side, model, payload, guard))
    if args.validate_only:
        print(json.dumps({'passed': True, 'sides': sides, 'nativeTextArtifactSHA256': NATIVE_SHA256,
                          'browserConstructed': False, 'modelWeightsOpened': False,
                          'prefixRecomputed': False, 'oldTailNumericalRerun': False}))
        return
    if not args.source_commit:
        parser.error('Actual execution requires --source-commit after code/input/reference freeze')
    if not args.composed_freeze:
        parser.error('Actual execution requires --composed-freeze created before runtime')
    if not args.private_dir.is_absolute() or not args.private_dir.resolve().is_relative_to(Path('/tmp')):
        parser.error('Private output directory must be an absolute /tmp path')
    inventory = source_inventory()
    source_execution = verify_execution_source(args.source_commit, inventory)
    composed_proofs = {side: verify_composed_freeze(args.composed_freeze, side, payload['inputBindings'], args.source_commit)
                       for side, model, payload, guard in inputs}
    from playwright.sync_api import sync_playwright
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), COMMON.handler_for(ROOT / 'docs'))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            for side, model, payload, guard in inputs:
                output_path = args.output_dir / (side.lower() + '-browser.json')
                if output_path.exists():
                    raise FileExistsError('Use new public receipt paths')
                sink = PrivateBinarySink(args.private_dir / (side.lower() + '-runtime'))
                payload['modules'] = [{'role': role, 'sha256': inventory[path]} for role, path in (
                    ('ORT', 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'),
                    ('Hike.decode', 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm'),
                    ('Hike.stream-attention', 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm'),
                    ('Hike.p4-cross-ffn', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm'))]
                sampler = MemorySampler()
                requests, errors = [], []
                started = time.monotonic()
                sampler.start()
                browser, failure = None, None
                try:
                    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
                    page = browser.new_page()
                    page.set_default_timeout(3600000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: requests.append(request.url))
                    page.expose_binding('__writeP4Output', lambda source, chunk: sink.write(chunk))
                    page.expose_binding('__p4Phase', lambda source, event: sampler.phase_event(event))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.set_content('<input type=file id=model><input type=file id=native>')
                    page.locator('#model').set_input_files(str(model))
                    page.locator('#native').set_input_files(str(args.native_input))
                    result = page.evaluate("""async text=>{const p=JSON.parse(text),names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],originals=names.map(k=>WebAssembly[k]);p.nativeInputText=await document.querySelector('#native').files[0].text();const m=await import('/shared/diffusion-models/diagnostics/p4-real-text-l512/run.mjs');const result=await m.runP4RealTextL512(document.querySelector('#model').files[0],p,{writeOutput:globalThis.__writeP4Output,phaseEvent:globalThis.__p4Phase});if(!names.every((k,i)=>WebAssembly[k]===originals[i]))throw Error('Observer not restored');result.observerRestoredAfterRun=true;return result;}""", COMMON.encode_browser_payload(payload))
                    manifest_text = result.pop('privateManifestText')
                    result['boundaries']['privateArtifactNativeBits'] = sink.finish(manifest_text, result['outputIdentities'])
                    result['privateArtifactSHA256'] = result['boundaries']['privateArtifactNativeBits']['manifestSHA256']
                    result['sourceExecution'] = source_execution
                    result['preRuntimeReference'] = composed_proofs[side]
                    executed = {url.split('/', 3)[-1].split('?', 1)[0] for url in requests if url.split('?', 1)[0].endswith(('.mjs', '.js', '.wasm'))}
                    sources = {name: inventory[name] for name in (SCRIPT, PREPARE, 'tools/diffusion-models/p4-cross-ffn-browser.py', 'tools/diffusion-models/p4-cross-ffn-reference.py')}
                    for path in executed:
                        key = 'docs/' + path
                        if key not in inventory or sha((ROOT / key).read_bytes()) != inventory[key]:
                            raise ValueError('Unanchored or changed execution source: ' + key)
                        sources[key] = inventory[key]
                    verify_execution_source(args.source_commit, inventory)
                    if errors or any('.safetensors' in url or 'native.json' in url or '.wktensor' in url or '/tmp/' in url for url in requests) or not result['passed']:
                        raise ValueError('Real L512 browser/private file isolation failed')
                    result['sourceSHA256'] = sources
                    result['priorSavedTailGuard'] = guard
                except BaseException as error:
                    failure = {'schemaVersion': 'bernini-p4-real-text-l512-failure/0.1',
                               'side': side, 'passed': False, 'errorType': type(error).__name__,
                               'sourceExecution': source_execution, 'lastPhase': sampler.phase}
                    raise
                finally:
                    try:
                        if browser is not None:
                            browser.close()
                    finally:
                        sink.close()
                        measurement = sampler.finish()
                        if failure is not None:
                            failure['browserMemory'] = measurement
                            COMMON.private_write(args.private_dir / (side.lower() + '-failure.json'), failure)
                result['browserMemory'] = measurement
                result = public_projection(result)
                result['browser'] = {'version': browser.version, 'pageErrorCount': len(errors), 'modelHTTPRequests': 0,
                                     'nativeInputHTTPRequests': 0, 'wallSeconds': time.monotonic() - started,
                                     'closedBeforeNextSide': True, 'disconnected': not browser.is_connected()}
                digest = COMMON.write_public(output_path, result)
                print(json.dumps({'side': side, 'passed': True, 'numericalAccepted': False,
                                  'privateArtifactSHA256': result['privateArtifactSHA256'],
                                  'receiptSHA256': digest, 'output': str(output_path)}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
