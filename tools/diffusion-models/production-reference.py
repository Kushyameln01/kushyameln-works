"""Independent bounded-chunk Bernini reference; never imports the native runtime.

Input preparation uses the shared JavaScript shape owner. Numerical operations
reuse the separately frozen NumPy reference and original safetensors reader.
The oracle accepts native output chunks only for comparison, never as inputs to
reference computations. No large allocation/model MatMul occurs at import time.
"""
import argparse
import copy
from collections import OrderedDict
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEV = ROOT / 'development/ai-connection/d1-d4-production-20261102'
SPEC = importlib.util.spec_from_file_location('independent_bounded_reference', HERE / 'standalone-reference.py')
REF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REF)
np = REF.np
GATE = {'abs': 0.01, 'rel': 0.001}
PROFILE = 'bernini-declared-target81-source81-ref3-848-l512-f32-chunks-v1'
CORE = ROOT / 'development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py'
REAL_TEXT = Path('/tmp/p4-real-text-l512/inputs/real-text-l512-native.json')
REAL_PACKET = Path('/tmp/text-packet-receipt-20261102/source/development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor')
REAL_TEXT_SHA = '9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8'
REAL_PAYLOAD_SHA = '107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7'
REAL_MASK_SHA = '19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62'
REAL_PACKET_SHA = '90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9'
MODEL_SPACE = 'bernini-generated-model-latent:v1'
MEAN_SPACE = 'wan21-normalized-posterior-mean:v1'
NORMALIZATION = 'wan21-comfy-f32-v1'
TEXT_NORMALIZATION = 'umt5-final-rmsnorm-f32-v1'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def file_sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for raw in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(raw)
    return digest.hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_bytes(), object_pairs_hook=REF.unique_object)


def write_json(path, value, *, exclusive=False, mode=0o644):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC), mode)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(value, output, indent=2, allow_nan=False)
        output.write('\n')


def private_directory(path):
    path = Path(path).resolve()
    require(path.is_relative_to('/tmp') and path != Path('/tmp'), 'Dedicated private /tmp directory required')
    for parent in [path, *path.parents]:
        marker = parent / '.git'
        require(not (marker.is_file() or marker.is_dir() and (marker / 'HEAD').exists()), 'Private data cannot be in a Git checkout')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(path.stat().st_uid == os.getuid() and path.stat().st_mode & 0o777 == 0o700, 'Private directory must be owned mode0700')
    return path


def canonical_shapes(request):
    script = "import {deriveWorkflowShapes} from './docs/shared/ai-connection/workflow-shapes.mjs';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(deriveWorkflowShapes(JSON.parse(s))));"
    result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(request).encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, check=True)
    return json.loads(result.stdout)


def declared_request():
    semantics = {role: {'meaning': MODEL_SPACE if role == 'target-latent' else MEAN_SPACE, 'normalization': NORMALIZATION} for role in ['target-latent', 'source-latent', 'reference-latent', 'context-latent']}
    return {
        'ruleId': 'bernini-ca69274-b5a4321-wan21-shapes-v1',
        'target': {'batch': 1, 'frames': 81, 'height': 480, 'width': 832},
        'refMaxSize': 848,
        'geometry': {'rgbChannels': 3, 'latentChannels': 16, 'temporalCompression': 4, 'spatialCompression': [8, 8], 'temporalRule': 'first-then-groups-floor', 'patchSize': [1, 2, 2], 'hiddenSize': 5120, 'dtype': 'float32', 'concatOrder': 'target-first', 'paddingMode': 'none'},
        'semantics': semantics,
        'media': {'sourceVideo': {'state': 'present', 'rgb': {'frames': 81, 'height': 480, 'width': 832}, 'provenance': {'kind': 'explicit-controlled-geometry-not-original-media'}}, 'referenceVideo': {'state': 'absent'}, 'slots': [{'slotIndex': i, 'wired': {'state': 'present', 'rgb': {'frames': 1, 'height': 848, 'width': 848}, 'provenance': {'kind': 'explicit-controlled-geometry-not-original-media'}}, 'editor': {'state': 'absent'}} for i in range(3)]},
    }


def original_unknown_shapes():
    workflow_path = ROOT / 'development/ai-connection/original81-profile-comparison-20261102/bernini_rv2v_basic.json'
    script = "import fs from'node:fs';import{parseBerniniWorkflowShapeRequest,deriveWorkflowShapes}from'./docs/shared/ai-connection/workflow-shapes.mjs';let o=JSON.parse(fs.readFileSync(0,'utf8'));const r=parseBerniniWorkflowShapeRequest({workflow:o.workflow,geometry:o.geometry});r.semantics=o.semantics;process.stdout.write(JSON.stringify({request:r,derived:deriveWorkflowShapes(r)}));"
    declaration = declared_request()
    result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps({'workflow': read_json(workflow_path), 'geometry': declaration['geometry'], 'semantics': declaration['semantics']}).encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, check=True)
    return {'workflowPath': str(workflow_path.relative_to(ROOT)), 'workflowSHA256': file_sha(workflow_path), 'status': 'BLOCKED_INPUT_METADATA', **json.loads(result.stdout), 'originalMxfp8Equivalence': 'UNCONFIRMED_NOT_COMPLETION_GATE', 'completionBaseline': 'retained scaled-FP8 model bytes, fixed scale decode and staged F32 native operators versus independent reference', 'unknowns': ['actual decoded source F is not proved by cap81', 'mode4 wired/editor dispatch unresolved', 'original reference image dimensions/content unavailable', 'original mxfp8 model bytes/compute profile differ in name from retained scaled FP8 and are unverified', 'original prompt differs from retained real Hello-world packet']}


def verified_text(path=REAL_TEXT):
    path = Path(path)
    raw = path.read_bytes()
    require(sha(raw) == REAL_TEXT_SHA, 'Exact retained real Text JSON artifact required')
    text = json.loads(raw, object_pairs_hook=REF.unique_object)
    require(text['shape'] == [1, 512, 4096] and text['dtype'] == 'float32' and text['layout'] == 'BLC' and text['meaning'] == 'text_hidden_states', 'Full512 BLC native Text required')
    data = np.asarray(text['data'], dtype='<f4').reshape(512, 4096)
    mask = np.asarray(text['attentionMask'], dtype='u1')
    require(mask.shape == (512,) and bool(np.all((mask == 0) | (mask == 1))) and int(mask.sum()) == 3, 'Original binary512 mask required')
    require(np.isfinite(data).all() and bool(np.all(data[mask == 0] == 0)), 'Finite and original zeroed masked rows required')
    require(sha(data.tobytes()) == REAL_PAYLOAD_SHA and sha(mask.tobytes()) == REAL_MASK_SHA, 'Payload/mask bit identity required')
    require(text['modelSha256'] == REF.TEXT_MODEL and text['tokenizerSha256'] == REF.TOKENIZER, 'Original Text model/tokenizer required')
    packet = REAL_PACKET.read_bytes()
    require(sha(packet) == REAL_PACKET_SHA and packet[:8] == b'WKTSR001', 'Exact retained real Text packet required')
    header_bytes = struct.unpack('<I', packet[8:12])[0]
    require(1 <= header_bytes <= 65536, 'Canonical tensor header extent required')
    header = json.loads(packet[12:12 + header_bytes], object_pairs_hook=REF.unique_object)
    require(header['schemaVersion'] == 1 and header['byteOrder'] == 'little' and header['byteLength'] == data.nbytes and len(packet) == 12 + header_bytes + data.nbytes, 'Canonical packet extent required')
    require(packet[12 + header_bytes:] == data.tobytes(), 'Native JSON payload must exactly preserve real tensor packet bytes')
    require(all(header[key] == text[key] for key in ['shape', 'dtype', 'layout', 'meaning', 'attentionMask', 'modelSha256', 'tokenizerSha256']) and header['dataSha256'] == REAL_PAYLOAD_SHA, 'Native packet metadata identity required')
    # Existing Text producer source uses actual encoder.final_layer_norm Hike
    # RMSNorm. The legacy packet predates the later normalization metadata tag.
    # This is an explicit metadata lifting, never another numerical operation.
    metadata = {key: value for key, value in text.items() if key != 'data'}
    metadata['normalization'] = TEXT_NORMALIZATION
    return data, mask, metadata, {'nativeJSON': str(path), 'nativeJSONBytes': len(raw), 'nativeJSONSHA256': sha(raw), 'payloadSHA256': REAL_PAYLOAD_SHA, 'maskSHA256': REAL_MASK_SHA, 'packet': text['sourcePacket'], 'retainedPacketVerification': {'path': str(REAL_PACKET), 'bytes': len(packet), 'sha256': sha(packet), 'headerBytes': header_bytes, 'headerSHA256': sha(packet[12:12 + header_bytes]), 'payloadBitIdentity': True}, 'producer': text.get('producer'), 'actualPrompt': 'Hello world', 'all512RowsPreserved': True, 'activeMaskEntries': 3, 'normalizationMetadataConversion': {'kind': 'metadata-declaration-only', 'from': 'legacy packet without top-level normalization tag', 'to': TEXT_NORMALIZATION, 'numericTransform': False, 'payloadAndMaskUnchanged': True, 'producerOperation': 'actual encoder.final_layer_norm via Hike RMSNorm', 'sourcePath': 'docs/shared/inference/text-encoder.mjs', 'sourceLine': 101}}


def dyadic_file(path, elements, *, multiplier, addend, modulus=257, center=128, denominator=256, zero=False):
    digest = hashlib.sha256()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        for start in range(0, elements, 16384):
            count = min(16384, elements - start)
            data = np.zeros(count, dtype='<f4') if zero else (((np.arange(start, start + count, dtype=np.int64) * multiplier + addend) % modulus - center).astype('<f4') / np.float32(denominator))
            raw = data.tobytes()
            output.write(raw)
            digest.update(raw)
    return {'path': str(path), 'bytes': elements * 4, 'sha256': digest.hexdigest(), 'formula': 'explicit zero model-latent augmentation0' if zero else f'F32(((i*{multiplier}+{addend})%{modulus}-{center})/{denominator})', 'seededRng': False, 'producerVerified': False}


def prepare(args):
    directory = private_directory(args.private_dir)
    request = declared_request()
    derived = canonical_shapes(request)
    require(derived['concatenation']['totalTokens'] == 73947 and derived['orderedContexts']['complete'], 'Exact declared full-context total required')
    requirements = {item['requirementId']: item for item in derived['requirements']}
    ids = ['target.latent', *[entry['contextKey'] + '.latent' for entry in derived['orderedContexts']['entries']]]
    items = []
    for index, key in enumerate(ids):
        requirement = requirements[key]
        shape = requirement['shape']
        name = 'noise.f32' if index == 0 else f'context-{index}.f32'
        payload = dyadic_file(directory / name, math.prod(shape), multiplier=31 + index * 12, addend=19 + index * 17)
        items.append({'requirementId': key, 'dtype': 'float32', 'layout': 'NCTHW', 'shape': shape, 'meaning': requirement['meaning'], 'normalization': requirement['normalization'], 'producerVerified': False, **payload})
    initial = dyadic_file(directory / 'initial-empty-model-latent.f32', math.prod(items[0]['shape']), multiplier=0, addend=0, zero=True)
    text, mask, metadata, text_identity = verified_text(args.text)
    for path, raw in [(directory / 'conditioning.f32', text.tobytes()), (directory / 'attention-mask.u8', mask.tobytes())]:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(raw)
    conditioning = {'metadata': metadata, 'payloadPath': str(directory / 'conditioning.f32'), 'maskPath': str(directory / 'attention-mask.u8'), **text_identity}
    manifest = {'schemaVersion': 'bernini-production-chunk-input/1', 'profileId': PROFILE, 'caseClass': 'explicit-controlled-full-geometry-real-text512-not-original-workflow-replay', 'producerVerified': False, 'shapeRequest': request, 'canonicalShape': derived, 'tensors': items, 'initialEmptyTarget': initial, 'explicitNoise': items[0], 'predictTarget': 'At sigma1/high timestep1000 the fixed CONST initial noise mix equals explicitNoise; stored target tensor is that model input, not raw posterior mean.', 'conditioning': conditioning, 'negative': {'kind': 'explicit separate snapshot of same retained real packet at CFG1; not original workflow negative', 'numericalEvaluation': 'skipped-CFG1'}, 'side': 'HIGH', 'timestep': 1000.0, 'schedule': 'Euler/simple6/shift5/split3; sigma1 first HIGH input', 'gate': GATE, 'originalWorkflow': original_unknown_shapes(), 'readiness': {'generationReady': False, 'originalWorkflowInputsVerified': False, 'originalMxfp8Equivalence': 'UNCONFIRMED_NOT_COMPLETION_GATE'}}
    write_json(directory / 'inputs.json', manifest, exclusive=True, mode=0o600)
    public = {key: value for key, value in manifest.items() if key not in ('conditioning', 'tensors')}
    public['tensors'] = [{key: value for key, value in item.items() if key != 'data'} for item in items]
    public['conditioning'] = text_identity
    public['privateManifest'] = {'path': str(directory / 'inputs.json'), 'bytes': (directory / 'inputs.json').stat().st_size, 'sha256': file_sha(directory / 'inputs.json')}
    public['referenceNumericSource'] = {'path': 'tools/diffusion-models/standalone-reference.py', 'sha256': file_sha(HERE / 'standalone-reference.py')}
    public['canonicalShapeSource'] = {'path': 'docs/shared/ai-connection/workflow-shapes.mjs', 'sha256': file_sha(ROOT / 'docs/shared/ai-connection/workflow-shapes.mjs')}
    write_json(args.receipt, public)
    print(json.dumps({'prepared': True, 'tokens': derived['concatenation']['totalTokens'], 'targetShape': items[0]['shape'], 'contexts': len(items) - 1, 'textRows': 512, 'originalWorkflowReplay': False, 'numericalModelExecution': False, 'manifest': str(directory / 'inputs.json')}))


def prepare_small(args):
    """New N5/L512 case, not reused L3 numerical evidence or truncated L512."""
    directory = private_directory(args.private_dir)
    fixture = REF.controlled_fixture()
    request = fixture['shapeRequest']
    derived = canonical_shapes(request)
    require(derived['concatenation']['totalTokens'] == 5, 'Unchanged controlled N5 geometry required')
    noise = np.asarray(fixture['construction']['explicitNoise'], dtype='<f4')
    items = []
    for index, tensor in enumerate(fixture['tensors']):
        data = noise if index == 0 else np.asarray(tensor['data'], dtype='<f4')
        path = directory / ('noise.f32' if index == 0 else f'context-{index}.f32')
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data.tobytes())
        items.append({key: value for key, value in tensor.items() if key != 'data'} | {'layout': 'NCTHW', 'path': str(path), 'bytes': data.nbytes, 'sha256': sha(data.tobytes()), 'producerVerified': False})
    initial = dyadic_file(directory / 'initial-empty-model-latent.f32', 128, multiplier=0, addend=0, zero=True)
    text, mask, metadata, text_identity = verified_text(args.text)
    for path, raw in [(directory / 'conditioning.f32', text.tobytes()), (directory / 'attention-mask.u8', mask.tobytes())]:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(raw)
    manifest = {'schemaVersion': 'bernini-production-chunk-input/1', 'profileId': 'bernini-small-n5-real-l512-f32-chunks-v1', 'caseClass': 'controlled-n5-with-real512-text-not-original-workflow-replay', 'producerVerified': False, 'shapeRequest': request, 'canonicalShape': derived, 'tensors': items, 'initialEmptyTarget': initial, 'explicitNoise': items[0], 'conditioning': {'metadata': metadata, 'payloadPath': str(directory / 'conditioning.f32'), 'maskPath': str(directory / 'attention-mask.u8'), **text_identity}, 'negative': {'kind': 'explicit separate copy of same real packet, CFG1 unused; not original negative'}, 'side': 'HIGH', 'timestep': 1000.0, 'gate': GATE, 'readiness': {'generationReady': False, 'originalWorkflowInputsVerified': False, 'originalMxfp8Equivalence': 'UNCONFIRMED_NOT_COMPLETION_GATE'}, 'inputConstruction': {'retainedN5FixtureSHA256': 'a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c', 'changesFromOldCase': ['Text is the complete retained real L512 packet, not controlled L3', 'First predict input is explicit sigma1 noise; sampler target is separate zero initial latent'], 'oldL3NumericalEvidenceReused': False}}
    write_json(directory / 'inputs.json', manifest, exclusive=True, mode=0o600)
    write_json(args.receipt, {key: value for key, value in manifest.items() if key != 'conditioning'} | {'conditioning': text_identity, 'privateManifest': {'path': str(directory / 'inputs.json'), 'bytes': (directory / 'inputs.json').stat().st_size, 'sha256': file_sha(directory / 'inputs.json')}, 'numericalModelExecution': False})
    print(json.dumps({'prepared': True, 'tokens': 5, 'textRows': 512, 'oldL3ReferenceReused': False, 'manifest': str(directory / 'inputs.json')}))


class Intervals:
    """Coverage grows with interval count, not with every token×stage×block."""
    def __init__(self):
        self.ranges = []

    def add(self, start, count):
        begin, end = start, start + count
        following = []
        inserted = False
        for left, right in self.ranges:
            if right < begin:
                following.append((left, right))
            elif end < left:
                if not inserted:
                    following.append((begin, end))
                    inserted = True
                following.append((left, right))
            else:
                begin, end = min(begin, left), max(end, right)
        if not inserted:
            following.append((begin, end))
        self.ranges = following

    def contains(self, start, count):
        return any(left <= start and start + count <= right for left, right in self.ranges)

    @property
    def rows(self):
        return sum(right - left for left, right in self.ranges)


class CachedParameters(REF.Parameters):
    """Original decode, bounded source reads, F32 weight cache, F64 dot tiles."""
    def __init__(self, path, side, cache_bytes=600000000):
        super().__init__(path, side)
        self.cache_limit = cache_bytes
        self.cache, self.cache_bytes, self.peak_cache_bytes = OrderedDict(), 0, 0
        self.matrix_load_seconds = self.linear_seconds = 0.0

    def matrix(self, key, first=0, count=None):
        entry = self.header[key]
        rows, inner = entry['shape'][0], math.prod(entry['shape'][1:])
        count = rows - first if count is None else count
        require(type(first) is int and type(count) is int and 0 <= first < rows and 0 < count <= rows - first, 'Exact original matrix row selection required')
        identity = (key, first, count)
        if identity in self.cache:
            self.cache.move_to_end(identity)
            return self.cache[identity]
        needed = count * inner * 4
        require(needed <= self.cache_limit, 'Original matrix exceeds explicit reference cache')
        while self.cache and self.cache_bytes + needed > self.cache_limit:
            _, old = self.cache.popitem(last=False)
            self.cache_bytes -= old.nbytes
        began = time.perf_counter()
        output = np.empty((count, inner), dtype='<f4')
        scale = self.scale(key) if entry['dtype'] == 'F8_E4M3' else None
        unit = 1 if entry['dtype'] == 'F8_E4M3' else 2
        for offset in range(0, count, 128):
            n = min(128, count - offset)
            raw = self.read(self.payload + entry['data_offsets'][0] + (first + offset) * inner * unit, n * inner * unit)
            output[offset:offset + n] = REF.decode(raw, entry['dtype'], scale).reshape(n, inner)
        self.matrix_load_seconds += time.perf_counter() - began
        self.cache[identity] = output
        self.cache_bytes += output.nbytes
        self.peak_cache_bytes = max(self.peak_cache_bytes, self.cache_bytes)
        return output

    def linear(self, stem, x, first=0, count=None):
        x = REF.f32(x)
        key = stem + '.weight'
        entry = self.header[key]
        full_rows = entry['shape'][0]
        count = full_rows - first if count is None else count
        require(x.ndim == 2 and 1 <= len(x) <= 512 and x.shape[1] == math.prod(entry['shape'][1:]), 'Reference input is bounded rows1..512 and complete original inner width')
        weight = self.matrix(key, first, count)
        bias = self.whole_small(stem + '.bias').reshape(full_rows)[first:first + count]
        values = x.astype(np.float64)
        output = np.empty((len(x), count), dtype='<f4')
        began = time.perf_counter()
        for start in range(0, count, 128):
            end = min(start + 128, count)
            dot = (values @ weight[start:end].astype(np.float64).T).astype('<f4')
            output[:, start:end] = np.add(dot, bias[start:end], dtype=np.float32)
        self.linear_seconds += time.perf_counter() - began
        require(np.isfinite(output).all(), 'Nonfinite independent projection')
        return output

    def close(self):
        self.cache.clear()
        self.cache_bytes = 0
        super().close()


class InputSequence:
    def __init__(self, manifest):
        self.manifest = manifest
        canonical = canonical_shapes(manifest['shapeRequest'])
        require(canonical == manifest['canonicalShape'], 'Canonical shape snapshot mismatch')
        require(canonical['orderedContexts']['complete'], 'All supplied context dimensions must be known')
        self.total = canonical['concatenation']['totalTokens']
        ids = ['target.latent', *[item['contextKey'] + '.latent' for item in canonical['orderedContexts']['entries']]]
        require([item['requirementId'] for item in manifest['tensors']] == ids, 'Exact target/source/reference ordered population required')
        requirements = {item['requirementId']: item for item in canonical['requirements']}
        self.streams = []
        for index, tensor in enumerate(manifest['tensors']):
            shape = tensor['shape']
            requirement = requirements[tensor['requirementId']]
            require(tensor['dtype'] == 'float32' and tensor['layout'] == 'NCTHW' and tensor['meaning'] == requirement['meaning'] and tensor['normalization'] == requirement['normalization'], 'Exact declared latent type/meaning/normalization required')
            require(shape == requirements[tensor['requirementId']]['shape'] and shape[:2] == [1, 16] and shape[3] % 2 == shape[4] % 2 == 0, 'Exact declared C16 even spatial input required')
            require(Path(tensor['path']).stat().st_size == math.prod(shape) * 4 and file_sha(tensor['path']) == tensor['sha256'], 'Saved latent payload identity mismatch')
            values = np.memmap(tensor['path'], dtype='<f4', mode='r', shape=shape)
            grid = [shape[2], shape[3] // 2, shape[4] // 2]
            interval = [0, canonical['target']['tokenCount']] if index == 0 else canonical['orderedContexts']['entries'][index - 1]['concatTokenRange']
            self.streams.append({'values': values, 'shape': shape, 'grid': grid, 'source': index, 'range': interval})

    def close(self):
        for stream in self.streams:
            stream['values']._mmap.close()
        self.streams = []

    def rows(self, start, count):
        require(type(start) is int and type(count) is int and 0 <= start <= self.total - count and 1 <= count <= 128, 'Bounded original row interval required')
        patches = np.empty((count, 64), dtype='<f4')
        positions = np.empty((count, 3), dtype='<f4')
        ids = []
        for row, global_row in enumerate(range(start, start + count)):
            stream = next(item for item in self.streams if item['range'][0] <= global_row < item['range'][1])
            local = global_row - stream['range'][0]
            _, height, width = stream['grid']
            t, h, w = local // (height * width), local // width % height, local % width
            patches[row] = stream['values'][0, :, t:t + 1, 2*h:2*h + 2, 2*w:2*w + 2].reshape(64)
            positions[row] = [t, h, w]
            ids.append(stream['source'])
        return patches, positions, ids


def streamed_attention(q, keys, values, *, key_rows=256):
    """FP64 max-rescaled softmax, all40 heads/all declared keys; bounded scores."""
    q = REF.f32(q)
    require(q.ndim == 2 and 1 <= len(q) <= 128 and q.shape[1] == 5120 and keys.shape == values.shape and keys.shape[1] == 5120, 'Full40-head bounded Q and complete KV required')
    query = q.reshape(len(q), 40, 128).transpose(1, 0, 2).astype(np.float64)
    maximum = np.full((40, len(q)), -np.inf, dtype=np.float64)
    denominator = np.zeros((40, len(q)), dtype=np.float64)
    numerator = np.zeros((40, len(q), 128), dtype=np.float64)
    for start in range(0, len(keys), key_rows):
        count = min(key_rows, len(keys) - start)
        k = np.asarray(keys[start:start + count]).reshape(count, 40, 128).transpose(1, 0, 2).astype(np.float64)
        v = np.asarray(values[start:start + count]).reshape(count, 40, 128).transpose(1, 0, 2).astype(np.float64)
        scores = (query @ k.transpose(0, 2, 1)) / math.sqrt(128)
        following = np.maximum(maximum, scores.max(axis=2))
        alpha = np.exp(maximum - following)
        probabilities = np.exp(scores - following[:, :, None])
        denominator = denominator * alpha + probabilities.sum(axis=2, dtype=np.float64)
        numerator = numerator * alpha[:, :, None] + probabilities @ v
        maximum = following
    require(np.isfinite(denominator).all() and np.all(denominator > 0), 'Finite positive whole-key denominator required')
    return REF.f32((numerator / denominator[:, :, None]).transpose(1, 0, 2).reshape(len(q), 5120).astype('<f4'))


class ChunkOracle:
    """Demand-driven independent expected chunks, <=3 F32 full-N backing files.

    Caller serializes comparisons. Actual native data is never written into any
    reference state. K/V are independent results and must cover all rows before
    a full-query attention comparison is permitted. X changes in-place only at
    completed residual/FFN boundaries; each future query still sees its own oldX.
    """
    def __init__(self, manifest_path, model_path, side, directory, *, allow_model_work=False):
        require(allow_model_work, 'Explicit model reference execution authorization required')
        self.manifest = read_json(manifest_path)
        require(self.manifest['schemaVersion'] == 'bernini-production-chunk-input/1' and self.manifest['gate'] == GATE, 'Fixed production chunk input contract required')
        require(file_sha(CORE) == REF.CORE_SHA256, 'Pinned complete Comfy source capture required')
        self.inputs = InputSequence(self.manifest)
        self.params = CachedParameters(model_path, side)
        self.side = side
        self.directory = private_directory(directory)
        self.total = self.inputs.total
        self.x = self.k = self.v = None
        self.current_block = -1
        self.prefix = None
        self.text_k = self.text_v = None
        self.row_cache = None
        self.coverage = {}
        self.comparison_count = self.compared_elements = self.failed_elements = 0
        self.comparison_summary = {}
        self.head_target = self.prediction = None
        self.attention_seconds = self.reference_seconds = 0.0
        self.closed = False
        self.file_paths = {name: self.directory / (name + '.f32') for name in ['reference-x', 'reference-k', 'reference-v']}

    def _file(self, name):
        path = self.file_paths['reference-' + name]
        descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'r+b') as stream:
            stream.truncate(self.total * 5120 * 4)
        return np.memmap(path, dtype='<f4', mode='r+', shape=(self.total, 5120))

    def _prefix(self):
        if self.prefix is not None:
            return self.prefix
        conditioning = self.manifest['conditioning']
        metadata = conditioning['metadata']
        require(all(metadata.get(key) == value for key, value in {'shape': [1, 512, 4096], 'dtype': 'float32', 'layout': 'BLC', 'meaning': 'text_hidden_states', 'normalization': TEXT_NORMALIZATION, 'modelSha256': REF.TEXT_MODEL, 'tokenizerSha256': REF.TOKENIZER}.items()), 'Canonical real full512 Text semantics/model/tokenizer required')
        mask = Path(conditioning['maskPath']).read_bytes()
        require(len(mask) == 512 and sha(mask) == REAL_MASK_SHA and list(mask) == metadata['attentionMask'], 'Exact full512 mask identity required')
        text = np.memmap(conditioning['payloadPath'], dtype='<f4', mode='r', shape=(512, 4096))
        require(file_sha(conditioning['payloadPath']) == REAL_PAYLOAD_SHA, 'Real full512 Text payload identity required')
        embedded = self.params.linear('text_embedding.2', REF.gelu(self.params.linear('text_embedding.0', text)))
        text._mmap.close()
        time_raw = self.params.linear('time_embedding.2', REF.silu(self.params.linear('time_embedding.0', REF.sinusoidal(self.manifest['timestep']))))
        time_act = REF.silu(time_raw)
        projected = np.concatenate([self.params.linear('time_projection.1', time_act, first=i * 5120, count=5120) for i in range(6)], axis=1).reshape(6, 5120)
        self.prefix = {'textEmbedded': embedded, 'timeRaw': time_raw, 'timeAct1': time_act, 'timeProjection': projected}
        return self.prefix

    def _block(self, block):
        require(type(block) is int and 0 <= block < 40, 'Original block0..39 required')
        if block == self.current_block:
            return
        require(block == self.current_block + 1, 'Reference blocks must advance without skipping')
        if block and not self._covered(self.current_block, 'blockOutput', 0, self.total):
            raise ValueError('Previous whole-block row comparison must complete before advancing')
        if self.x is None:
            self.x = self._file('x')
        self.current_block = block
        self.text_k = self.text_v = None
        self.row_cache = None
        for name in ['k', 'v']:
            value = getattr(self, name)
            if value is not None:
                value.flush()
                value._mmap.close()
                setattr(self, name, None)
            path = self.file_paths['reference-' + name]
            if path.exists():
                path.unlink()
            setattr(self, name, self._file(name))
        modulation = self.params.whole_small(f'blocks.{block}.modulation').reshape(6, 5120)
        self.modulation = np.add(modulation, self._prefix()['timeProjection'], dtype=np.float32)

    def _original(self, block, start, count):
        if block == 0:
            patches, _, _ = self.inputs.rows(start, count)
            return self.params.linear('patch_embedding', patches)
        return np.asarray(self.x[start:start + count]).copy()

    def _row(self, phase, block, start, count):
        identity = (phase, block, start, count)
        if self.row_cache is not None and self.row_cache['identity'] == identity:
            return self.row_cache
        original = self._original(block, start, count) if phase == 'self' else np.asarray(self.x[start:start + count]).copy()
        self.row_cache = {'identity': identity, 'original': original}
        return self.row_cache

    def _self(self, name, block, start, count):
        row = self._row('self', block, start, count)
        if name == 'blockInput':
            return row['original']
        if 'postModulated' not in row:
            row['postModulated'] = REF.modulate(REF.layer_norm(row['original']), self.modulation[0], self.modulation[1])
        if name == 'postModulated':
            return row[name]
        for kind in ['q', 'k', 'v']:
            if name.startswith(kind) or name in ['selfAttention', 'oProjection', 'selfResidual'] and kind == 'q':
                projected = kind + 'Projected'
                if projected not in row:
                    row[projected] = self.params.linear(f'blocks.{block}.self_attn.{kind}', row['postModulated'])
                if kind == 'v':
                    row['v'] = row[projected]
                else:
                    normalized = kind + 'Normalized'
                    if normalized not in row:
                        row[normalized] = REF.rms_norm(row[projected], self.params.whole_small(f'blocks.{block}.self_attn.norm_{kind}.weight'))
                    if kind not in row:
                        _, positions, ids = self.inputs.rows(start, count)
                        row[kind] = REF.apply_rope(row[normalized], REF.rotation_matrices(positions, ids))
                if name in [projected, kind + 'Normalized', kind]:
                    return row[name]
        if 'selfAttention' not in row:
            require(self._covered(block, 'k', 0, self.total) and self._covered(block, 'v', 0, self.total), 'All original key/value rows must be independently built before attention')
            began = time.perf_counter()
            row['selfAttention'] = streamed_attention(row['q'], self.k, self.v)
            self.attention_seconds += time.perf_counter() - began
        if 'oProjection' not in row:
            row['oProjection'] = self.params.linear(f'blocks.{block}.self_attn.o', row['selfAttention'])
        if 'selfResidual' not in row:
            row['selfResidual'] = REF.gate_residual(row['original'], row['oProjection'], self.modulation[2])
        return row[name]

    def _text_kv(self):
        if self.text_k is not None:
            return
        # Self attention is finished before native cross K/V begins. Preserve X
        # but remove two complete KV backing files before the FFN cache exists.
        block = self.current_block
        require(self._covered(block, 'selfResidual', 0, self.total), 'Whole self-residual rows required before cross attention')
        for name in ['k', 'v']:
            value = getattr(self, name)
            value.flush()
            value._mmap.close()
            setattr(self, name, None)
            self.file_paths['reference-' + name].unlink()
        text = self._prefix()['textEmbedded']
        self.text_k = REF.rms_norm(self.params.linear(f'blocks.{block}.cross_attn.k', text), self.params.whole_small(f'blocks.{block}.cross_attn.norm_k.weight'))
        self.text_v = self.params.linear(f'blocks.{block}.cross_attn.v', text)

    def _cross(self, name, block, start, count):
        self._text_kv()
        if name in ['crossK', 'crossV']:
            return (self.text_k if name == 'crossK' else self.text_v)[start:start + count].copy()
        row = self._row('cross', block, start, count)
        if 'crossQ' not in row:
            normalized = REF.layer_norm(row['original'], self.params.whole_small(f'blocks.{block}.norm3.weight'), self.params.whole_small(f'blocks.{block}.norm3.bias'))
            row['crossQ'] = REF.rms_norm(self.params.linear(f'blocks.{block}.cross_attn.q', normalized), self.params.whole_small(f'blocks.{block}.cross_attn.norm_q.weight'))
        if 'crossAttention' not in row:
            row['crossAttention'] = streamed_attention(row['crossQ'], self.text_k, self.text_v)
        if 'crossResidual' not in row:
            projected = self.params.linear(f'blocks.{block}.cross_attn.o', row['crossAttention'])
            row['crossResidual'] = np.add(row['original'], projected, dtype=np.float32)
        return row[name]

    def _ffn(self, name, block, start, count):
        row = self._row('ffn', block, start, count)
        if 'ffnPostModulated' not in row:
            row['ffnPostModulated'] = REF.modulate(REF.layer_norm(row['original']), self.modulation[3], self.modulation[4])
        if 'ffnUp' not in row:
            row['ffnUp'] = self.params.linear(f'blocks.{block}.ffn.0', row['ffnPostModulated'])
        if 'ffnActivated' not in row:
            row['ffnActivated'] = REF.gelu(row['ffnUp'])
        if 'ffnDown' not in row:
            row['ffnDown'] = self.params.linear(f'blocks.{block}.ffn.2', row['ffnActivated'])
        if 'ffnOutput' not in row:
            row['ffnOutput'] = REF.gate_residual(row['original'], row['ffnDown'], self.modulation[5])
        return row[name]

    def _covered(self, block, name, start, count):
        return self.coverage.get((block, name), Intervals()).contains(start, count)

    def _head(self, start, count):
        require(self.current_block == 39 and self._covered(39, 'blockOutput', 0, self.total), 'All40 whole blocks must finish before final head')
        value = np.asarray(self.x[start:start + count]).copy()
        modulation = np.add(self.params.whole_small('head.modulation').reshape(2, 5120), self._prefix()['timeRaw'].reshape(1, 5120), dtype=np.float32)
        result = self.params.linear('head.head', REF.modulate(REF.layer_norm(value), modulation[0], modulation[1]))
        target_tokens = self.inputs.manifest['canonicalShape']['target']['tokenCount']
        if self.head_target is None:
            self.head_target = np.empty((target_tokens, 64), dtype='<f4')
        stored = max(0, min(count, target_tokens - start))
        if stored:
            self.head_target[start:start + stored] = result[:stored]
        return result

    def event(self, name, start, count, block=None):
        """Canonical comparison descriptor; no candidate arithmetic imported."""
        text_rows = self.manifest['conditioning']['metadata']['shape'][1]
        if name in ['timeRaw', 'timeAct1']:
            full_shape, axis, columns = [1, 5120], 0, 5120
        elif name == 'timeProjection':
            full_shape, axis, columns = [1, 6, 5120], 1, 5120
        elif name == 'prediction':
            full_shape = self.manifest['tensors'][0]['shape']
            axis, columns = None, full_shape[-1]
        else:
            rows = text_rows if name in ['textEmbedded', 'crossK', 'crossV'] else self.total
            columns = 13824 if name in ['ffnUp', 'ffnActivated'] else 64 if name == 'headAll' else 5120
            heads = name in ['kProjected', 'kNormalized', 'k', 'v', 'qProjected', 'qNormalized', 'q', 'selfAttention', 'crossK', 'crossV', 'crossQ', 'crossAttention']
            full_shape, axis = ([1, rows, 40, 128] if heads else [1, rows, columns]), 1
        full_rows = math.prod(full_shape) // columns if axis is None else full_shape[axis]
        require(0 <= start and 1 <= count <= 128 and start + count <= full_rows, 'Chunk outside fixed source shape')
        shape = [count, columns] if axis is None else [count if i == axis else v for i, v in enumerate(full_shape)]
        return {'schemaVersion': 'bernini-model-chunk/1', 'name': name, 'block': block, 'globalRowStart': start, 'rowCount': count, 'rowAxis': axis, 'columns': columns, 'shape': shape, 'fullShape': full_shape, 'dtype': 'float32', 'storageElementOffset': start * columns, 'model': {'side': self.side, 'modelSha256': REF.MODELS[self.side][1]}, 'timestep': self.manifest['timestep']}

    def _check_event(self, event):
        require(isinstance(event, dict), 'Plain diagnostic descriptor required')
        name, start, count, block = event['name'], event['globalRowStart'], event['rowCount'], event.get('block')
        names = ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection', 'blockInput', 'postModulated', 'kProjected', 'kNormalized', 'k', 'v', 'qProjected', 'qNormalized', 'q', 'selfAttention', 'oProjection', 'selfResidual', 'crossK', 'crossV', 'crossQ', 'crossAttention', 'crossResidual', 'ffnPostModulated', 'ffnUp', 'ffnActivated', 'ffnDown', 'ffnOutput', 'blockOutput', 'headAll', 'prediction']
        require(name in names and type(start) is int and type(count) is int, 'Known graph stage and integer span required')
        require(block is None if name in ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection', 'headAll', 'prediction'] else type(block) is int and 0 <= block < 40, 'Exact original block ownership required')
        expected = self.event(name, start, count, block)
        for key in ['schemaVersion', 'rowAxis', 'columns', 'shape', 'fullShape', 'dtype', 'model', 'timestep']:
            require(event.get(key) == expected[key], 'Native diagnostic semantic descriptor mismatch: ' + key)
        if 'storageElementOffset' in event:
            require(event['storageElementOffset'] == expected['storageElementOffset'], 'Native row storage offset differs')
        if 'coordinates' in event:
            require(name not in ['textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection', 'crossK', 'crossV', 'prediction'], 'Unexpected source coordinates on non-source rows')
            _, positions, source_ids = self.inputs.rows(start, count)
            coordinates = event['coordinates']
            actual_positions = np.asarray(coordinates['positions'], dtype='<f4').reshape(count, 3)
            actual_ids = np.asarray(coordinates['sourceIds'], dtype='<i4').reshape(count)
            require(np.array_equal(positions.view('<u4'), actual_positions.view('<u4')) and np.array_equal(source_ids, actual_ids), 'Native source_id/RoPE coordinates differ from original stream/frame order')

    def expected(self, event):
        require(not self.closed, 'Reference owner is closed')
        self._check_event(event)
        name, start, count, block = event['name'], event['globalRowStart'], event['rowCount'], event.get('block')
        require(type(start) is int and type(count) is int and 0 <= start and 1 <= count <= 128, 'Bounded owned native chunk range required')
        if name == 'prediction':
            require(self._covered(None, 'headAll', 0, self.total), 'Head must process every concatenated token before target extraction')
            target_shape = self.manifest['tensors'][0]['shape']
            width = target_shape[-1]
            if self.prediction is None:
                self.prediction = REF.unpatch_target(self.head_target, target_shape)
            result = self.prediction.reshape(-1, width)[start:start + count].copy()
        elif name == 'headAll':
            result = self._head(start, count)
        elif name == 'patchHidden':
            patches, _, _ = self.inputs.rows(start, count)
            result = self.params.linear('patch_embedding', patches)
        elif name in ['textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection']:
            result = self._prefix()[name].reshape(-1, 5120)[start:start + count].copy()
        else:
            self._block(block)
            if name == 'blockOutput':
                require(self._covered(block, 'ffnOutput', start, count), 'Block output follows completed FFN rows')
                result = np.asarray(self.x[start:start + count]).copy()
            elif name in ['crossK', 'crossV', 'crossQ', 'crossAttention', 'crossResidual']:
                result = self._cross(name, block, start, count)
            elif name.startswith('ffn'):
                result = self._ffn(name, block, start, count)
            else:
                result = self._self(name, block, start, count)
        result = REF.f32(result)
        require(result.size == count * event['columns'], 'Native chunk semantic width differs from independent reference')
        if name in ['k', 'v', 'selfResidual', 'crossResidual', 'ffnOutput']:
            target = self.k if name == 'k' else self.v if name == 'v' else self.x
            target[start:start + count] = result.reshape(count, 5120)
        self.coverage.setdefault((block, name), Intervals()).add(start, count)
        return result

    def compare(self, event, raw):
        require(event.get('dtype') == 'float32', 'Native diagnostic dtype must be float32')
        count = event['rowCount'] * event['columns']
        require(len(raw) == count * 4, 'Exact binary32 chunk extent required')
        began = time.perf_counter()
        expected = self.expected(event).reshape(-1)
        actual = np.frombuffer(raw, dtype='<f4')
        finite = np.isfinite(actual) & np.isfinite(expected)
        error = np.abs(actual.astype(np.float64) - expected.astype(np.float64))
        gate = GATE['abs'] + GATE['rel'] * np.abs(expected.astype(np.float64))
        failed = np.logical_not(finite) | (error > gate)
        result = {'name': event['name'], 'block': event.get('block'), 'globalRowStart': event['globalRowStart'], 'rowCount': event['rowCount'], 'elements': count, 'failed': int(np.count_nonzero(failed)), 'maxAbsolute': float(np.max(error, initial=0)), 'maxNormalizedToGate': float(np.max(error / gate, initial=0)), 'actualSHA256': sha(raw), 'referenceSHA256': sha(expected.tobytes()), 'gate': GATE, 'elapsedSeconds': time.perf_counter() - began}
        self.reference_seconds += result['elapsedSeconds']
        self.comparison_count += 1
        self.compared_elements += count
        self.failed_elements += result['failed']
        key = (event.get('block'), event['name'])
        summary = self.comparison_summary.setdefault(key, {'chunks': 0, 'elements': 0, 'failed': 0, 'maxAbsolute': 0.0, 'maxNormalizedToGate': 0.0})
        summary['chunks'] += 1
        summary['elements'] += count
        summary['failed'] += result['failed']
        summary['maxAbsolute'] = max(summary['maxAbsolute'], result['maxAbsolute'])
        summary['maxNormalizedToGate'] = max(summary['maxNormalizedToGate'], result['maxNormalizedToGate'])
        return result

    def stats(self):
        return {'profileId': self.manifest['profileId'], 'side': self.side, 'totalTokens': self.total, 'comparisons': self.comparison_count, 'failedElements': self.failed_elements, 'comparedElements': self.compared_elements, 'referenceSeconds': self.reference_seconds, 'attentionSeconds': self.attention_seconds, 'matrixLoadSeconds': self.params.matrix_load_seconds, 'linearSeconds': self.params.linear_seconds, 'weightPayloadBytesRead': self.params.payload_read, 'weightReadCalls': self.params.read_calls, 'maxSourceReadBytes': self.params.max_payload_read, 'cachedWeightBytes': self.params.cache_bytes, 'peakCachedWeightBytes': self.params.peak_cache_bytes, 'maxBackingFileBytes': 3 * self.total * 5120 * 4, 'coverage': [{'block': block, 'name': name, 'rows': rows.rows, 'intervals': rows.ranges} for (block, name), rows in self.coverage.items()], 'comparisonsByStage': [{'block': block, 'name': name, **value} for (block, name), value in self.comparison_summary.items()], 'closed': self.closed, 'completeRequiredProduction': False}

    def close(self):
        if self.closed:
            return
        self.closed = True
        for name in ['x', 'k', 'v']:
            value = getattr(self, name)
            if value is not None:
                value.flush()
                value._mmap.close()
                setattr(self, name, None)
        self.params.close()
        self.inputs.close()
        self.row_cache = self.text_k = self.text_v = self.prefix = self.head_target = self.prediction = None


def reference_contract(manifest_path):
    manifest = read_json(manifest_path)
    sequence = InputSequence(manifest)
    total = sequence.total
    sequence.close()
    return {'schemaVersion': 'bernini-production-independent-contract/1', 'status': 'PRE_EXECUTION_GATE_FIXED', 'gate': GATE, 'gateMayNotBeRelaxedAfterComparison': True, 'profileId': manifest['profileId'], 'manifestSHA256': file_sha(manifest_path), 'totalTokens': total, 'allQueries': True, 'allKeys': True, 'heads': 40, 'textRows': 512, 'sourceSHA256': {'tools/diffusion-models/production-reference.py': file_sha(__file__), 'tools/diffusion-models/standalone-reference.py': file_sha(HERE / 'standalone-reference.py'), 'tools/diffusion-models/standalone-sampler-reference.py': file_sha(HERE / 'standalone-sampler-reference.py'), str(CORE.relative_to(ROOT)): file_sha(CORE), 'docs/shared/ai-connection/workflow-shapes.mjs': file_sha(ROOT / 'docs/shared/ai-connection/workflow-shapes.mjs')}, 'models': {side: {'fileName': record[0], 'previouslyVerifiedSHA256': record[1], 'headerSHA256': record[2], 'bytes': REF.MODEL_BYTES} for side, record in REF.MODELS.items()}, 'precision': {'weights': 'retained E4M3FN times own scalar F32 or original F16, decoded exactly to F32', 'linear': 'full-inner F64 matrix product, F32 output then separate F32 bias', 'normalization': 'independent frozen F64 reductions then original staged F32 boundaries', 'attention': 'F64 online max-rescaled softmax over every supplied key; F32 output; all40 heads', 'pointwise': 'separate original-source F32 operations, no fused gate/add', 'originalMxfp8Equivalence': 'UNCONFIRMED_NOT_COMPLETION_GATE'}, 'resources': {'fullReferenceBackingFiles': 3, 'maxBackingBytes': 3 * total * 5120 * 4, 'maxCachedF32WeightBytes': 600000000, 'maxQueryRows': 128, 'attentionKeyRows': 256, 'fullQueryOrScoresSaved': False}, 'normalAPIRequiresReference': False, 'originalWorkflowReplay': False}


def freeze_reference(args):
    contract = reference_contract(args.manifest)
    write_json(args.contract, contract, exclusive=True)
    print(json.dumps({'frozen': True, 'contract': str(args.contract), 'sha256': file_sha(args.contract), 'totalTokens': contract['totalTokens'], 'modelWeightsOpened': False, 'fullStoresAllocated': False}))


def evaluate_prediction(oracle, *, stop_after_block=None, progress=None):
    """Run every required original boundary; candidate output is never an input."""
    maximum = 39 if stop_after_block is None else stop_after_block
    for block in range(maximum + 1):
        for start in range(0, oracle.total, 128):
            count = min(128, oracle.total - start)
            for name in ['k', 'v']:
                oracle.expected(oracle.event(name, start, count, block))
            if progress:
                progress(block, 'keyValueRows', start + count, oracle.total)
        for start in range(0, oracle.total, 128):
            count = min(128, oracle.total - start)
            oracle.expected(oracle.event('selfResidual', start, count, block))
            if progress:
                progress(block, 'selfResidualRows', start + count, oracle.total)
        for start in range(0, 512, 128):
            for name in ['crossK', 'crossV']:
                oracle.expected(oracle.event(name, start, min(128, 512 - start), block))
        for phase in ['crossResidual', 'ffnOutput', 'blockOutput']:
            for start in range(0, oracle.total, 128):
                count = min(128, oracle.total - start)
                oracle.expected(oracle.event(phase, start, count, block))
                if progress:
                    progress(block, phase + 'Rows', start + count, oracle.total)
    if stop_after_block is not None:
        return None
    for start in range(0, oracle.total, 128):
        oracle.expected(oracle.event('headAll', start, min(128, oracle.total - start)))
    shape = oracle.manifest['tensors'][0]['shape']
    rows = math.prod(shape) // shape[-1]
    for start in range(0, rows, 128):
        oracle.expected(oracle.event('prediction', start, min(128, rows - start)))
    return oracle.prediction.copy()


def execute_reference(args):
    require(read_json(args.contract) == reference_contract(args.manifest), 'Exact pre-execution reference contract and sources required')
    contract_hash = file_sha(args.contract)
    original = read_json(args.manifest)
    tokens = original['canonicalShape']['concatenation']['totalTokens']
    require(tokens <= 128 or args.allow_full_shape, 'Full-shape independent model execution needs explicit --allow-full-shape')
    directory = private_directory(args.private_dir)
    spec = importlib.util.spec_from_file_location('independent_original_sampler_math', HERE / 'standalone-sampler-reference.py')
    sampler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sampler)
    target_shape = original['tensors'][0]['shape']
    sampler.SHAPE = target_shape  # Function source is unchanged; channel axes remain C16 NCTHW.
    _, sigmas, timesteps = sampler.schedule()
    arrays, metrics = {}, []
    started = time.perf_counter()

    def save(name, value):
        value = REF.f32(value)
        path = directory / (name + '.f32')
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(value.tobytes())
        arrays[name] = {'shape': list(value.shape), 'path': str(path), 'bytes': value.nbytes, 'sha256': file_sha(path)}

    def predict(side, timestep, target, step):
        manifest = copy.deepcopy(original)
        manifest['side'], manifest['timestep'] = side, float(timestep)
        path = directory / ('prediction-input-' + str(step) + '.f32')
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(REF.f32(target).tobytes())
        manifest['tensors'][0].update(path=str(path), sha256=file_sha(path))
        manifest_path = directory / ('prediction-input-' + str(step) + '.json')
        write_json(manifest_path, manifest, exclusive=True, mode=0o600)
        owner = ChunkOracle(manifest_path, args.models / REF.MODELS[side][0], side, directory / ('prediction-' + str(step)), allow_model_work=True)
        try:
            def progress(block, stage, rows, total):
                print(json.dumps({'step': step, 'side': side, 'block': block, 'stage': stage, 'rows': rows, 'total': total, 'elapsedSeconds': time.perf_counter() - started}), file=sys.stderr, flush=True)
            value = evaluate_prediction(owner, stop_after_block=args.stop_after_block, progress=progress)
            metrics.append(owner.stats())
            return value
        finally:
            owner.close()
            for path in owner.file_paths.values():
                path.unlink(missing_ok=True)

    if args.operation == 'predict':
        target = np.fromfile(original['tensors'][0]['path'], dtype='<f4').reshape(target_shape)
        result = predict(args.side, original['timestep'], target, 0)
        if result is not None:
            save('velocity', result)
    else:
        require(args.stop_after_block is None, 'Partial block diagnostic cannot become a sampler prediction')
        empty = np.fromfile(original['initialEmptyTarget']['path'], dtype='<f4').reshape(target_shape)
        noise = np.fromfile(original['explicitNoise']['path'], dtype='<f4').reshape(target_shape)
        x = sampler.noise_mix(noise, empty, sigmas[0])
        save('initialX', x)
        for step in range(6):
            side = 'HIGH' if step < 3 else 'LOW'
            velocity = predict(side, timesteps[step], x, step)
            save('velocity' + str(step).zfill(2), velocity)
            x = sampler.euler(x, velocity, sigmas[step], sigmas[step + 1])
            save('step' + str(step).zfill(2) + 'X', x)
            if step == 2:
                raw = sampler.process_out(sampler.inverse(x, sigmas[3]))
                save('highPublic', raw)
                x = sampler.noise_mix(np.zeros(target_shape, dtype='<f4'), sampler.process_in(raw, True), sigmas[3])
                save('lowEntry', x)
        save('finalRaw', sampler.process_out(sampler.inverse(x, sigmas[6])))
    result = {'schemaVersion': 'bernini-production-independent-reference/1', 'profileId': original['profileId'], 'operation': args.operation, 'contractSHA256': contract_hash, 'manifestSHA256': file_sha(args.manifest), 'gate': GATE, 'arrays': arrays, 'metrics': metrics, 'elapsedSeconds': time.perf_counter() - started, 'actualNativeOutputsUsedAsNumericInput': False, 'allTextRows': 512, 'originalWorkflowReplay': False, 'completeProductionAccepted': False}
    write_json(directory / 'reference.json', result, exclusive=True, mode=0o600)
    write_json(args.receipt, {key: value for key, value in result.items() if key != 'arrays'} | {'arrays': {name: {key: value for key, value in item.items() if key != 'data'} for name, item in arrays.items()}, 'privateReference': {'path': str(directory / 'reference.json'), 'bytes': (directory / 'reference.json').stat().st_size, 'sha256': file_sha(directory / 'reference.json')}})
    print(json.dumps({'finished': True, 'operation': args.operation, 'arrays': len(arrays), 'totalTokens': tokens, 'elapsedSeconds': result['elapsedSeconds'], 'reference': str(directory / 'reference.json')}))


def self_test(_args):
    request = declared_request()
    original = original_unknown_shapes()
    derived = canonical_shapes(request)
    require(derived['target']['initialLatentShape'] == [1, 16, 21, 60, 104] and derived['concatenation']['totalTokens'] == 73947, 'Original target plus explicit full contexts required')
    require([entry['tokenCount'] for entry in derived['orderedContexts']['entries']] == [32760, 2809, 2809, 2809], 'No context drop or frame reduction')
    require(not original['derived']['orderedContexts']['complete'] and original['derived']['concatenation']['totalTokens'] is None, 'Original unresolved metadata must not become absent')
    q = REF.dyadic(3 * 5120, 17, 11, 257, 128, 1024).reshape(3, 5120)
    k = REF.dyadic(7 * 5120, 29, 7, 251, 125, 1024).reshape(7, 5120)
    v = REF.dyadic(7 * 5120, 31, 19, 263, 131, 1024).reshape(7, 5120)
    a, b = streamed_attention(q, k, v, key_rows=3), REF.attention(q, k, v)
    require(np.allclose(a, b, atol=1e-7, rtol=1e-7), 'Independent online all-key/tail softmax differs from dense independent reference')
    text, mask, _, identity = verified_text()
    require(text.shape == (512, 4096) and mask.sum() == 3 and identity['payloadSHA256'] == REAL_PAYLOAD_SHA, 'Actual full512 packet must be preserved')
    intervals = Intervals()
    for begin, count in [(128, 128), (0, 64), (64, 64), (256, 3)]:
        intervals.add(begin, count)
    require(intervals.ranges == [(0, 259)] and intervals.rows == 259 and intervals.contains(0, 259) and not intervals.contains(0, 260), 'Contiguous full-key coverage and final tail required')
    manifest = {'shapeRequest': request, 'canonicalShape': derived, 'conditioning': {'metadata': {'shape': [1, 512, 4096]}}, 'tensors': [{'shape': [1, 16, 21, 60, 104]}], 'timestep': 1000.0}
    owner = object.__new__(ChunkOracle)
    owner.manifest, owner.side, owner.total = manifest, 'HIGH', 73947
    event = owner.event('q', 73856, 91, 0)
    owner._check_event(event)
    event['fullShape'] = [1, 128, 40, 128]
    try:
        owner._check_event(event)
        raise AssertionError('Fullshape forgery accepted')
    except ValueError:
        pass
    event = owner.event('crossK', 384, 128, 0)
    owner._check_event(event)
    event['model']['side'] = 'LOW'
    try:
        owner._check_event(event)
        raise AssertionError('Wrong model binding accepted')
    except ValueError:
        pass
    result = {'passed': True, 'checks': 9, 'declaredTokens': 73947, 'originalTokens': None, 'realTextRows': 512, 'attentionComparedElements': int(a.size), 'onlineAttentionMaxAbsolute': float(np.max(np.abs(a.astype(np.float64) - b.astype(np.float64)))), 'modelWeightsOpened': False, 'fullStoresAllocated': False}
    if getattr(_args, 'receipt', None):
        write_json(_args.receipt, result)
    print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    command = sub.add_parser('prepare', help='Prepare saved controlled full-geometry inputs; no model NN')
    command.add_argument('--private-dir', type=Path, required=True)
    command.add_argument('--text', type=Path, default=REAL_TEXT)
    command.add_argument('--receipt', type=Path, required=True)
    command.set_defaults(fn=prepare)
    command = sub.add_parser('prepare-small', help='Prepare separate controlled N5 with exact real L512; no model NN')
    command.add_argument('--private-dir', type=Path, required=True)
    command.add_argument('--text', type=Path, default=REAL_TEXT)
    command.add_argument('--receipt', type=Path, required=True)
    command.set_defaults(fn=prepare_small)
    command = sub.add_parser('self-test', help='Small coordinate/reference checks; no full stores/model weights')
    command.add_argument('--receipt', type=Path)
    command.set_defaults(fn=self_test)
    command = sub.add_parser('freeze', help='Freeze source, input, shape, precision and gate before NN execution')
    command.add_argument('--manifest', type=Path, required=True)
    command.add_argument('--contract', type=Path, required=True)
    command.set_defaults(fn=freeze_reference)
    command = sub.add_parser('execute-reference', help='Explicit independent model work, separate from normal public API')
    command.add_argument('--manifest', type=Path, required=True)
    command.add_argument('--contract', type=Path, required=True)
    command.add_argument('--models', type=Path, required=True)
    command.add_argument('--private-dir', type=Path, required=True)
    command.add_argument('--receipt', type=Path, required=True)
    command.add_argument('--operation', choices=['predict', 'sample'], default='predict')
    command.add_argument('--side', choices=['HIGH', 'LOW'], default='HIGH')
    command.add_argument('--stop-after-block', type=int, choices=range(40))
    command.add_argument('--allow-full-shape', action='store_true')
    command.set_defaults(fn=execute_reference)
    args = parser.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
