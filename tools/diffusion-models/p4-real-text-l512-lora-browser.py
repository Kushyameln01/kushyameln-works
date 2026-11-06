"""Real L512 +1 light LOW LoRA through the exact canonical a80 SDK overlay.

Private Files/references never enter HTTP. One candidate validation runs P4;
all25 exported outputs receive separate independent local/composed comparison.
"""
import argparse
import base64
import hashlib
import http.server
import json
import math
from pathlib import Path
import threading
import time
from urllib.parse import unquote, urlsplit

import importlib.util
_spec = importlib.util.spec_from_file_location('p4_real_l512_frozen_base_driver', Path(__file__).with_name('p4-real-text-l512-browser.py'))
BASE = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(BASE)
COMMON, ROOT, sha = BASE.COMMON, BASE.ROOT, BASE.sha
OWNER_COMMIT = 'a80db72feea60b9bd69e292e4716665c6f0ee77f'
OWNER_RECEIPT_SHA256 = 'ab3980144681b518cac83af68731adfc814e25fc9f642011e6e20fd70c196d9b'
OWNER_SOURCE = Path('/tmp/p4-l512-lora/a80/source')
OWNER_RECEIPT = Path('/tmp/p4-l512-lora/a80/download-receipt.json')
SCRIPT = 'tools/diffusion-models/p4-real-text-l512-lora-browser.py'
RUNNER = 'docs/shared/diffusion-models/diagnostics/p4-real-text-l512/lora.mjs'
REFERENCE_SCRIPT = 'development/ai-connection/p4-real-text-l512/lora-reference/lora-reference.py'
LORA_NAME = 'Bernini-R_LightX2V_low_noise.safetensors'
LORA_BYTES = 1244141856
LORA_SHA256 = '86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b'
LORA_HEADER_SHA256 = 'bd4e95892305560456676c8fc9a4545c27f4deb979f5d2b929b7be7df2d5d333'
GATES = {'weight': {'absolute': 1e-5, 'relative': 1e-4}, 'bias': {'absolute': 0, 'relative': 0},
         'projection': {'absolute': .01, 'relative': .001}, 'projectionGateId': 'p4-cross-ffn-composed-f32-v1'}


def require(value, message):
    if not value:
        raise ValueError(message)


def file_sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def load_owner_overlay(source, receipt):
    source = Path(source).resolve()
    raw = Path(receipt).read_bytes()
    require(sha(raw) == OWNER_RECEIPT_SHA256, 'Frozen a80 acquisition receipt SHA256 mismatch')
    records = json.loads(raw)
    require(isinstance(records, list) and len(records) == 55, 'Complete exact a80 source acquisition required')
    overlay, seen = {}, set()
    for record in records:
        name = record.get('path')
        require(isinstance(name, str) and name not in seen and not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unique relative owner source path required')
        seen.add(name)
        path = (source / name).resolve()
        require(path.is_relative_to(source) and path.is_file(), 'Owner source path escape/missing file')
        data = path.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        require(record.get('commit') == OWNER_COMMIT and len(data) == record.get('bytes') and sha(data) == record.get('sha256') and blob == record.get('gitBlobSHA1') == record.get('pluginGitBlobSHA1') and record.get('gitBlobMatched') is True and record.get('sizeMatched') is True, 'Exact owner source/content/Git blob proof mismatch: ' + name)
        if name.startswith('docs/shared/inference/lora/') and path.suffix in ('.mjs', '.wasm') or name == 'docs/shared/vr180/sha256.mjs':
            overlay['/' + name.removeprefix('docs/')] = {'path': path, 'sha256': sha(data), 'bytes': len(data), 'gitBlobSHA1': blob, 'ownerCommit': OWNER_COMMIT}
    require('/shared/inference/lora/sdk-v2.mjs' in overlay and '/shared/inference/lora/diffusion-p4-adapter.mjs' in overlay and '/shared/inference/lora/kernel/lora.wasm' in overlay, 'Required canonical owner SDK entrypoints missing')
    # The common URL must have identical bytes for both owners' SHA helper.
    require(overlay['/shared/vr180/sha256.mjs']['sha256'] == sha((ROOT / 'docs/shared/vr180/sha256.mjs').read_bytes()), 'Shared SHA helper differs between owner sources')
    return overlay


def load_lora_reference(path, expected_sha, base_bindings):
    ref = COMMON.module_at('p4-cross-ffn-reference')
    path = Path(path).resolve()
    raw = path.read_bytes()
    require(sha(raw) == expected_sha, 'Frozen real L512 LoRA oracle SHA256 mismatch')
    manifest = json.loads(raw, object_pairs_hook=ref.unique_object)
    require(manifest.get('schemaVersion') == 'bernini-p4-real-text-l512-lora-oracle/0.1' and manifest.get('mode') == 'COMPOSED_BEFORE_RUNTIME' and manifest.get('side') == 'LOW' and manifest.get('strength') == 1 and manifest.get('candidatePlanSHA256') == ref.PLAN_SHA256, 'Fixed real L512 LoRA pre-runtime reference required')
    original = manifest.get('original', {})
    require(original.get('fileName') == LORA_NAME and original.get('byteLength') == LORA_BYTES and original.get('expectedSha256') == LORA_SHA256 and original.get('headerSha256') == LORA_HEADER_SHA256 and original.get('rank') == original.get('alpha') == 128 and original.get('loaderPolicyId') == 'comfy-lora-b5a4321-linear-diff-v1', 'Frozen original LoRA identity/loader mismatch')
    selection = manifest.get('selection', {})
    require(selection.get('weightId') == 'blocks.0.cross_attn.q.weight' and selection.get('biasWeightId') == 'blocks.0.cross_attn.q.bias' and selection.get('rows') == [0, 4] and selection.get('columns') == [0, 5120] and selection.get('fullWeightShape') == [5120, 5120] and selection.get('fullBiasShape') == [5120] and selection.get('coverage') == 'PARTIAL', 'Fixed partial Q4/bias4 selection required')
    require(manifest.get('gates') == GATES and manifest.get('numericGates') == ref.load_plan()['gates'], 'Frozen owner A and all25 numerical gates mismatch')
    bindings = manifest.get('inputBindings', {})
    require(set(bindings) == set(base_bindings) | {'finalF32PatchArtifactSHA256'} and all(bindings.get(k) == v for k, v in base_bindings.items()), 'Real L512 saved/Text input binding mismatch')
    require(isinstance(manifest.get('referenceId'), str) and manifest['referenceId'].startswith('real-text-l512-light-LOW-q4-s1:'), 'Explicit real L512 independent reference ID required')
    def read(record, file_name, shape, dtype, unit):
        require(isinstance(record, dict) and record.get('file', record.get('path')) == file_name and record.get('shape') == shape and record.get('dtype') == dtype and record.get('elements', math.prod(shape)) == math.prod(shape) and record.get('bytes') == math.prod(shape) * unit, 'Exact independent binary descriptor required: ' + file_name)
        file = (path.parent / file_name).resolve()
        require(file.is_relative_to(path.parent), 'Independent reference path escape')
        data = file.read_bytes()
        require(len(data) == record['bytes'] and sha(data) == record.get('sha256'), 'Independent reference binary hash mismatch: ' + file_name)
        return data
    a = manifest.get('A', {})
    arrays = {
        'weight': read(a.get('weight'), 'A-weight.f64', [4, 5120], 'F64', 8),
        'bias': read(a.get('bias'), 'A-bias.f32', [4], 'F32', 4),
        'baseWeight': read(a.get('baseWeight'), 'A-base-weight.f32', [4, 5120], 'F32', 4),
        'baseBias': read(a.get('baseBias'), 'A-base-bias.f32', [4], 'F32', 4),
    }
    patch = a.get('independentPatchArtifact', {})
    require(patch.get('file') == 'A-independent-patches.json' and patch.get('sha256') == bindings['finalF32PatchArtifactSHA256'], 'Independent A patch artifact binding mismatch')
    patch_raw = (path.parent / patch['file']).read_bytes()
    require(len(patch_raw) == patch.get('bytes') and sha(patch_raw) == patch['sha256'], 'Independent A patch JSON identity mismatch')
    ref.validate_patches(json.loads(patch_raw, object_pairs_hook=ref.unique_object), 'LOW', ref.load_plan())
    identities, descriptors = manifest.get('outputIdentities', {}), manifest.get('arrays', {})
    require(set(identities) == set(descriptors) == set(BASE.shapes()), 'All25 frozen independent L512 outputs required')
    for name, shape in BASE.shapes().items():
        identity = identities[name]
        require(identity == {'shape': shape, 'elements': math.prod(shape), 'bytes': math.prod(shape) * 4, 'sha256': descriptors[name].get('sha256')}, 'Exact independent L512 output identity required: ' + name)
        data = read(descriptors[name], name + '.f32', shape, 'float32', 4)
        if name == 'blockOutput':
            arrays[name] = data
    payload = {'oracleManifestText': raw.decode('utf-8'), 'oracleManifestSHA256': expected_sha,
               'oracleArraysBase64': {name: base64.b64encode(data).decode() for name, data in arrays.items()}}
    proof = {'manifestSHA256': expected_sha, 'mode': 'COMPOSED_BEFORE_RUNTIME', 'verifiedBeforeNativeConstruction': True,
             'verifiedOutputCount': 25, 'independentPatchArtifactSHA256': patch['sha256'], 'gates': GATES,
             'numericGates': manifest['numericGates'], 'ownerSDKPatchesUsedAsOracle': False}
    return payload, proof


def handler_for(overlay, inventory):
    """Exact owner overlay wins its namespace; private paths have no route."""
    class Handler(http.server.BaseHTTPRequestHandler):
        served = []
        def log_message(self, *args):
            pass
        def do_GET(self):
            url = unquote(urlsplit(self.path).path)
            if url == '/':
                data = b'<!doctype html><input type=file id=model><input type=file id=lora><input type=file id=native>'
                content_type = 'text/html'
                record = None
            else:
                record = overlay.get(url)
                owner_namespace = url.startswith('/shared/inference/lora/') or url == '/shared/vr180/sha256.mjs'
                if record is None and not owner_namespace:
                    key = 'docs' + url
                    if key in inventory and url.startswith('/shared/') and '..' not in Path(url).parts:
                        path = (ROOT / key).resolve()
                        if path.is_relative_to((ROOT / 'docs').resolve()):
                            record = {'path': path, 'sha256': inventory[key], 'ownerCommit': None}
                if record is None:
                    self.send_error(404)
                    return
                try:
                    data = record['path'].read_bytes()
                    require(sha(data) == record['sha256'], 'Requested source changed after freeze')
                except (OSError, ValueError):
                    self.send_error(409)
                    return
                self.served.append({'url': url, 'sha256': record['sha256'], 'ownerCommit': record['ownerCommit'],
                                    **({'gitBlobSHA1': record['gitBlobSHA1']} if record.get('gitBlobSHA1') else {})})
                content_type = 'application/wasm' if url.endswith('.wasm') else 'text/javascript'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
    return Handler


def source_inventory():
    inventory = BASE.source_inventory()
    for name in (SCRIPT, RUNNER, REFERENCE_SCRIPT):
        require((ROOT / name).is_file(), 'Required new LoRA execution source missing: ' + name)
        inventory[name] = sha((ROOT / name).read_bytes())
    return inventory


class LoraBinarySink(BASE.PrivateBinarySink):
    def finish(self, manifest_text, identities):
        manifest = json.loads(manifest_text)
        require(manifest.get('schemaVersion') == 'bernini-p4-real-text-l512-lora-runtime/0.1' and manifest.get('side') == 'LOW' and manifest.get('outputIdentities') == identities and set(self.entries) == set(identities) == set(self.expected_shapes), 'All25 LoRA native binary identities required')
        hashes = manifest.get('evidence', {}).get('outputHashes', {})
        require(set(hashes) == {name + 'SHA256' for name in self.expected_shapes}, 'All25 LoRA native evidence hashes required')
        for name, shape in self.expected_shapes.items():
            entry, identity = self.entries[name], identities[name]
            digest, size = entry['hash'].hexdigest(), math.prod(shape) * 4
            require(entry['file'].closed and entry['bytes'] == size and identity == {'shape': shape, 'elements': math.prod(shape), 'bytes': size, 'sha256': digest} and hashes[name + 'SHA256'] == digest and manifest['arrays'][name] == {'path': name + '.f32', 'shape': shape, 'dtype': 'float32', 'sha256': digest, 'bytes': size} and (self.directory / (name + '.f32')).stat().st_size == size and file_sha(self.directory / (name + '.f32')) == digest, 'LoRA private output native bit mismatch: ' + name)
        raw = COMMON.private_write(self.directory / 'manifest.json', manifest_text)
        return {'passed': True, 'verifiedOutputCount': 25, 'strictNativeOutputBits': True,
                'signedZeroPreservedByBinaryTransport': True, 'manifestSHA256': sha(raw),
                'chunkCount': self.chunk_count, 'rawBytes': self.raw_bytes, 'decodeWriteMs': self.decode_write_seconds * 1000}


def public_projection(result):
    projected = BASE.public_projection(result)
    for key in ('lora', 'sourceOwnership'):
        if key in result:
            COMMON.public_projection({'evidence': result[key]})
            projected[key] = result[key]
    return projected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=ROOT.parent / 'retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
    parser.add_argument('--lora', type=Path, default=Path('/tmp/p4-l512-lora/original') / LORA_NAME)
    parser.add_argument('--native-input', type=Path, default=BASE.DEFAULT_INPUT)
    parser.add_argument('--packet', type=Path, default=BASE.DEFAULT_PACKET)
    parser.add_argument('--owner-source', type=Path, default=OWNER_SOURCE)
    parser.add_argument('--owner-receipt', type=Path, default=OWNER_RECEIPT)
    parser.add_argument('--reference-manifest', type=Path, required=True)
    parser.add_argument('--reference-sha256', required=True)
    parser.add_argument('--source-commit')
    parser.add_argument('--execution-freeze', type=Path)
    parser.add_argument('--private-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    overlay = load_owner_overlay(args.owner_source, args.owner_receipt)
    native = BASE.load_native_input(args.native_input, args.packet)
    payload, guard = COMMON.load_saved_inputs('LOW')
    guard['oldE4Package'] = COMMON.verify_old_packages('LOW', payload)
    del payload['oldOutputs']
    payload.update(candidatePlanSHA256=COMMON.module_at('p4-cross-ffn-reference').PLAN_SHA256,
                   inputBindings={'savedArtifactSHA256': guard['savedArtifactSHA256'], **native})
    reference_payload, reference_proof = load_lora_reference(args.reference_manifest, args.reference_sha256, payload['inputBindings'])
    payload.update(reference_payload)
    require(args.lora.name == LORA_NAME and args.lora.stat().st_size == LORA_BYTES and args.model.stat().st_size == 15574833216, 'Exact local LoRA/base size required')
    # Hash the actual selected local source before any browser/native work.
    require(file_sha(args.lora) == LORA_SHA256, 'Actual local LoRA whole-file SHA256 mismatch')
    if args.validate_only:
        print(json.dumps({'passed': True, 'side': 'LOW', 'ownerCommit': OWNER_COMMIT, 'ownerOverlayFileCount': len(overlay), 'referenceManifestSHA256': args.reference_sha256, 'browserConstructed': False, 'nativeNumericalExecuted': False}))
        return
    require(args.source_commit and args.execution_freeze, 'Actual LoRA execution requires committed source and pre-runtime execution freeze')
    inventory = source_inventory()
    execution = BASE.verify_execution_source(args.source_commit, inventory)
    freeze_raw = args.execution_freeze.read_bytes()
    freeze = json.loads(freeze_raw)
    require(freeze.get('schemaVersion') == 'bernini-p4-l512-lora-pre-runtime-freeze/0.1' and freeze.get('sourceCommit') == args.source_commit and freeze.get('ownerCommit') == OWNER_COMMIT and freeze.get('ownerReceiptSHA256') == OWNER_RECEIPT_SHA256 and freeze.get('referenceManifestSHA256') == args.reference_sha256 and freeze.get('originalLoraSHA256') == LORA_SHA256 and freeze.get('inputBindings') == payload['inputBindings'], 'Fixed real L512 LoRA pre-runtime source/input/A/B freeze mismatch')
    require(not args.output.exists(), 'Use a new public LoRA receipt path')
    payload['sourcePins'] = {'ownerCommit': OWNER_COMMIT, 'diffusionCommit': args.source_commit, 'executionFreezeSHA256': sha(freeze_raw), 'ownerReceiptSHA256': OWNER_RECEIPT_SHA256}
    payload['modules'] = [{'role': role, 'sha256': inventory[path]} for role, path in (
        ('ORT', 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'),
        ('Hike.decode', 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm'),
        ('Hike.stream-attention', 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm'),
        ('Hike.p4-cross-ffn', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm'))]
    payload['modules'].append({'role': 'Hike.owner-lora', 'sha256': overlay['/shared/inference/lora/kernel/lora.wasm']['sha256']})
    sink = LoraBinarySink(args.private_dir / 'low-runtime')
    sampler = BASE.MemorySampler()
    handler = handler_for(overlay, inventory)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    browser, failure, result = None, None, None
    errors, requests = [], []
    from playwright.sync_api import sync_playwright
    sampler.start()
    began = time.monotonic()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: requests.append(request.url))
                page.expose_binding('__writeP4Output', lambda source, chunk: sink.write(chunk))
                page.expose_binding('__p4Phase', lambda source, event: sampler.phase_event(event))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                for element, path in (('model', args.model), ('lora', args.lora), ('native', args.native_input)):
                    page.locator('#' + element).set_input_files(str(path))
                result = page.evaluate("""async text=>{const p=JSON.parse(text),names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],old=names.map(k=>WebAssembly[k]);p.nativeInputText=await document.querySelector('#native').files[0].text();const m=await import('/shared/diffusion-models/diagnostics/p4-real-text-l512/lora.mjs');const r=await m.runP4RealTextL512Lora(document.querySelector('#model').files[0],document.querySelector('#lora').files[0],p,{writeOutput:globalThis.__writeP4Output,phaseEvent:globalThis.__p4Phase});if(!names.every((k,i)=>WebAssembly[k]===old[i]))throw Error('Observer was not restored');r.observerRestoredAfterRun=true;return r;}""", COMMON.encode_browser_payload(payload))
                manifest_text, patch_text = result.pop('privateManifestText'), result.pop('privateActualPatchText')
                patches = json.loads(patch_text)
                parsed, description = COMMON.module_at('p4-cross-ffn-reference').validate_patches(patches, 'LOW', COMMON.module_at('p4-cross-ffn-reference').load_plan())
                require(len(parsed) == 2 and {p['key'] for p in parsed} == {'blocks.0.cross_attn.q.weight', 'blocks.0.cross_attn.q.bias'} and sha(patch_text.encode()) == result['inputBindings']['finalF32PatchArtifactSHA256'], 'Actual SDK private patch artifact binding mismatch')
                COMMON.private_write(sink.directory / 'actual-prepared-patches.json', patch_text)
                result['boundaries']['privateArtifactNativeBits'] = sink.finish(manifest_text, result['outputIdentities'])
                result['privateArtifactSHA256'] = result['boundaries']['privateArtifactNativeBits']['manifestSHA256']
                BASE.verify_execution_source(args.source_commit, inventory)
                load_owner_overlay(args.owner_source, args.owner_receipt)
                require(not errors and result['passed'] and not any('.safetensors' in url or '.wktensor' in url or '/tmp/' in url or 'native.json' in url for url in requests), 'LoRA browser/private File isolation failed')
                served_urls = {record['url'] for record in handler.served}
                requested = {urlsplit(url).path for url in requests if urlsplit(url).path.endswith(('.mjs', '.js', '.wasm'))}
                require(requested == served_urls, 'Requested executable source was not hash-attributed to its owner')
                result['sourceOwnership'] = {record['url']: {**record, 'ownerCommit': record['ownerCommit'] or args.source_commit} for record in handler.served}
                result['sourceSHA256'] = {name: inventory[name] for name in (SCRIPT, RUNNER, REFERENCE_SCRIPT, BASE.SCRIPT, BASE.PREPARE)}
                result['sourceExecution'] = execution
                result['preRuntimeReference'] = reference_proof
                result['priorSavedTailGuard'] = guard
            finally:
                if browser is not None:
                    version = browser.version
                    browser.close()
    except BaseException as error:
        failure = {'schemaVersion': 'bernini-p4-real-text-l512-lora-failure/0.1', 'passed': False, 'errorType': type(error).__name__, 'sourceExecution': execution, 'lastPhase': sampler.phase}
        raise
    finally:
        sink.close()
        measurement = sampler.finish()
        server.shutdown()
        server.server_close()
        if failure is not None:
            failure['browserMemory'] = measurement
            COMMON.private_write(args.private_dir / 'low-failure.json', failure)
    result['browserMemory'] = measurement
    result = public_projection(result)
    result['browser'] = {'version': version, 'pageErrorCount': len(errors), 'modelHTTPRequests': 0, 'loraHTTPRequests': 0, 'privateReferenceHTTPRequests': 0, 'wallSeconds': time.monotonic() - began, 'disconnected': not browser.is_connected()}
    digest = COMMON.write_public(args.output, result)
    print(json.dumps({'side': 'LOW', 'passed': True, 'numericalAccepted': False, 'receiptSHA256': digest, 'output': str(args.output)}), flush=True)


if __name__ == '__main__':
    main()
