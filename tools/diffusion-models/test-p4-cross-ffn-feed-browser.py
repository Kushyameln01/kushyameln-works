"""Lightweight final-F32 diagnostic admission tests; never opens a model."""
import importlib.util
import copy
import http.server
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock


class FeedAdmission(unittest.TestCase):
    def harness(self):
        path = Path(__file__).with_name('p4-cross-ffn-feed-browser.py')
        spec = importlib.util.spec_from_file_location('p4_feed_browser', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_private_patch_schema_and_hash_are_checked_before_browser(self):
        module = self.harness()
        ref = module.module_at('p4-cross-ffn-reference')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'patch.json'
            path.write_text(json.dumps({'schemaVersion': 'wrong', 'side': 'HIGH'}))
            with self.assertRaisesRegex(ValueError, 'patch schema'):
                module.load_patches(path, 'HIGH', ref)

    def test_browser_fixture_admission_preserves_positive_zero_bits_and_rejects_changed_bits(self):
        """Only fixture/saved-input guards run; no File, source, WASM or NN."""
        module = self.harness()
        payload, _ = module.build_payload('HIGH', module.SAVED)
        argument = module.browser_payload_argument(payload)
        self.assertIsInstance(argument, str, 'Use JSON text across the Python Playwright transport')
        from playwright.sync_api import sync_playwright
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), module.handler_for(module.ROOT / 'docs'))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
                try:
                    page = browser.new_page()
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    admission_script = """async text=>{const p=JSON.parse(text),m=await import('/shared/diffusion-models/diagnostics/p4-cross-ffn/feed.mjs');const owned=await m.captureP4FeedInputs(p);const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),n=>n.toString(16).padStart(2,'0')).join('');const hashes={data:await digest(owned.conditioning.data),mask:await digest(owned.conditioning.attentionMask)};p.conditioning.data[0]=-p.conditioning.data[0];let rejected=false;try{await m.captureP4FeedInputs(p);}catch(error){rejected=String(error).includes('Conditioning data/mask input binding mismatch');}return {hashes,rejected,positiveZeroRetained:owned.conditioning.data.some(v=>Object.is(v,0)),negativeZeroCount:owned.conditioning.data.filter(v=>Object.is(v,-0)).length};}"""
                    result = page.evaluate(admission_script, argument)
                    self.assertEqual(result['hashes']['data'], payload['inputBindings']['conditioningDataSHA256'])
                    self.assertEqual(result['hashes']['mask'], payload['inputBindings']['conditioningMaskSHA256'])
                    self.assertTrue(result['positiveZeroRetained'])
                    self.assertEqual(result['negativeZeroCount'], 0)
                    self.assertTrue(result['rejected'])
                    # Separate explicit probe fixture contains both signs of zero;
                    # the frozen production-candidate fixture remains untouched.
                    signed = copy.deepcopy(payload)
                    signed['conditioning'].update(fixtureId='pure-signed-zero-transport-probe', sourceRef={'kind': 'pure-harness-probe'})
                    signed['conditioning']['data'][8192] = -0.0
                    signed_hash = module.sha(module._base.f32_bytes(signed['conditioning']['data']))
                    signed['inputBindings']['conditioningDataSHA256'] = signed_hash
                    result = page.evaluate(admission_script, module.browser_payload_argument(signed))
                    self.assertEqual(result['hashes']['data'], signed_hash)
                    self.assertTrue(result['positiveZeroRetained'])
                    self.assertEqual(result['negativeZeroCount'], 1)
                    self.assertTrue(result['rejected'])
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()

    def test_public_projection_drops_private_payload_and_filters_validation(self):
        module = self.harness()
        public = module.public_projection({'schemaVersion': 'test', 'passed': True, 'privateArtifactText': 'secret', 'arrays': [7], 'validation': {'valid': True, 'expected': [7]}})
        self.assertNotIn('privateArtifactText', public)
        self.assertNotIn('arrays', public)
        self.assertNotIn('expected', public['validation'])
        with self.assertRaisesRegex(ValueError, 'Private field'):
            module.public_projection({'validation': {'evidence': {'data': [7]}}})

    def test_reference_admission_requires_hash_mode_bindings_and_block_identity(self):
        module = self.harness()
        ref = module.module_at('p4-cross-ffn-reference')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reference.json'
            path.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'reference file hash'):
                module.load_expected(path, '0' * 64, 'HIGH', {}, ref)
            with self.assertRaisesRegex(ValueError, 'composed reference'):
                module.load_expected(path, module.sha(path.read_bytes()), 'HIGH', {}, ref)

    def test_private_patch_and_reference_bindings_accept_exact_bytes_then_fail_mutations(self):
        module = self.harness()
        ref = module.module_at('p4-cross-ffn-reference')
        plan = ref.load_plan()
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory) / 'private'
            patches = []
            for key, (shape, count, kind) in module.TARGETS.items():
                array = ref.np.ones(count, dtype='<f4')
                patches.append({'weightId': key, 'fullShape': shape, 'offset': 0, 'count': count, 'dtype': 'F32', 'binding': {'kind': kind, 'name': key}, 'sha256': ref.identity(array)['sha256'], 'data': array.tolist()})
            patch_path = parent / 'patch.json'
            module.private_write(patch_path, {'schemaVersion': 'bernini-p4-final-f32-patches/0.1', 'side': 'HIGH', 'candidatePlanSHA256': ref.PLAN_SHA256, 'patches': patches})
            _, patch_hash, public = module.load_patches(patch_path, 'HIGH', ref)
            self.assertEqual(public['patchCount'], 2)
            self.assertTrue(all('data' not in block for block in public['patches']))
            arrays = {key: ref.np.zeros([4 if n == 'L' else n for n in shape], dtype='<f4') for key, shape in ref.ARRAY_SHAPES.items()}
            binding = {'savedArtifactSHA256': 'a' * 64, 'conditioningMaskSHA256': 'b' * 64, 'finalF32PatchArtifactSHA256': patch_hash}
            reference = {'schemaVersion': 'bernini-p4-reference/0.1', 'mode': 'COMPOSED_FROM_SAVED_N2_TAIL', 'side': 'HIGH', 'candidatePlanSHA256': ref.PLAN_SHA256, 'profileId': plan['profileId'], 'gates': plan['gates'], 'modelHash': ref.MODELS['HIGH'][1], 'headerSHA256': ref.MODELS['HIGH'][2], 'inputBindings': binding, 'weightFeed': {'inputArtifactSHA256': patch_hash}, 'expected': {key: array.reshape(-1).tolist() for key, array in arrays.items()}, 'arrayIdentities': {key: ref.identity(array) for key, array in arrays.items()}}
            path = parent / 'reference.json'
            raw = module.private_write(path, reference)
            expected, expected_hash, digest = module.load_expected(path, module.sha(raw), 'HIGH', binding, ref)
            self.assertEqual(len(expected), 10240)
            self.assertEqual(expected_hash, reference['arrayIdentities']['blockOutput']['sha256'])
            self.assertEqual(digest, module.sha(raw))
            for field in binding:
                with self.assertRaisesRegex(ValueError, 'input binding'):
                    module.load_expected(path, digest, 'HIGH', {**binding, field: '0' * 64}, ref)
            reference['expected']['blockOutput'][0] = 1
            altered = parent / 'altered.json'
            raw = module.private_write(altered, reference)
            with self.assertRaisesRegex(ValueError, 'array identity'):
                module.load_expected(altered, module.sha(raw), 'HIGH', binding, ref)

    def parameter_fixture(self, module):
        ref = module.module_at('p4-cross-ffn-reference')
        actual, expected, patches = {}, {}, []
        patch_hash, package_hash = 'c' * 64, 'd' * 64
        for key, (shape, count, kind) in module.TARGETS.items():
            patches.append({'weightId': key, 'fullShape': shape, 'offset': 0, 'count': count, 'dtype': 'F32', 'binding': {'kind': kind, 'name': key}, 'sha256': module.sha((key + 'patch').encode())})
        plan = ref.load_plan()
        for index, (key, spec) in enumerate(plan['parameters'].items()):
            matrix = 'selectedRows' in spec
            extent = spec['selectedRows' if matrix else 'selectedElements']
            extents = [[at, at + 5120] for at in range(*extent, 5120)] if key in ('time_projection.1.weight', 'time_projection.1.bias', 'blocks.0.modulation') else [extent]
            for first, stop in extents:
                name = key + ':' + str(first) if matrix or first else key
                width, unit = (spec['fullShape'][1] if matrix else 1), (1 if spec['storageDtype'] == 'F8_E4M3' else 2)
                raw_hash, decoded = module.sha((name + 'raw').encode()), module.sha((name + 'decoded').encode())
                final = module.sha((name + 'final').encode()) if key in module.TARGETS else decoded
                binding = {'kind': 'runtime-input' if matrix else 'hike-parameter', 'name': key}
                base_offset = 8 + plan['bounds']['headerBytes'] + index * 10000000
                record = {'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype'], 'selectedRows' if matrix else 'selectedElements': [first, stop], 'absoluteByteOffset': base_offset + first * width * unit, 'selectedRawBytes': (stop - first) * width * unit, 'rawSHA256': raw_hash, 'decodedF32SHA256': decoded, 'finalF32SHA256': final}
                feed = {'packageHash': package_hash, 'patches': [{'weightId': patch['weightId'], 'offset': patch['offset'], 'count': patch['count'], 'blockSHA256': patch['sha256']} for patch in patches if patch['weightId'] == key]}
                source = {'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype'], 'computeDtype': 'F32', 'byteLength': int(ref.np.prod(spec['fullShape'])) * unit, 'binding': binding, 'absoluteByteOffset': record['absoluteByteOffset'], 'selectedRawBytes': record['selectedRawBytes'], 'selectedByteLength': record['selectedRawBytes'], 'rawSHA256': raw_hash, 'effectiveF32SHA256' if matrix else 'decodedF32SHA256': final, 'weightFeed': feed}
                if matrix:
                    source.update(selectedRows=[first, stop], rowStart=first, rowCount=stop-first, elementOffset=first*width, elementCount=(stop-first)*width, selectedElementCount=(stop-first)*width, columns=width, originalAbsoluteByteOffset=base_offset, selectedEffectiveBytes=(stop-first)*width*4, tileBindings=[feed])
                else:
                    source.update(elementOffset=first, elementCount=stop - first)
                if spec['storageDtype'] == 'F8_E4M3':
                    stem = key[:-7]
                    for field, suffix in (('scaleSHA256', '.weight_scale'), ('quantConfigSHA256', '.comfy_quant')):
                        digest = module.sha((stem + suffix).encode())
                        source[field] = record[field] = digest
                        size, config_shape, dtype = (4, [], 'F32') if field == 'scaleSHA256' else (27, [27], 'U8')
                        descriptor = {'originalKey': stem + suffix, 'fullShape': config_shape, 'storageDtype': dtype, 'absoluteByteOffset': base_offset + 9000000 + size, 'byteLength': size}
                        source['scaleSource' if field == 'scaleSHA256' else 'quantConfigSource'] = descriptor
                        expected[stem + suffix] = {**descriptor, 'rawSHA256': digest, 'selectedRawBytes': size}
                    source['fp8ProfileId'] = record['fp8ProfileId'] = 'scaled-e4m3fn-scalar-f32-v1'
                actual[name], expected[name] = source, record
        reference = {'parameterSources': expected, 'inputBindings': {'finalF32PatchArtifactSHA256': patch_hash}, 'weightFeed': {'inputArtifactSHA256': patch_hash, 'patches': patches}}
        return actual, reference, {'patches': patches}, patch_hash, package_hash

    def test_strict29_patch_proof_accepts_only_declared_changed_final_and_exact_raw(self):
        module = self.harness()
        actual, reference, patches, patch_hash, package_hash = self.parameter_fixture(module)
        proof = module.verify_patched_parameter_identities(actual, reference, patches, patch_hash, package_hash)
        self.assertEqual(proof['verifiedParameterCount'], 29)
        self.assertTrue(proof['strictOriginalRawAndConsumedFinalBits'])
        self.assertEqual(sum(p['declaredPatchApplied'] for p in proof['parameters'].values()), 2)
        q = 'blocks.0.cross_attn.q.weight:0'
        mutations = [('rawSHA256', '0' * 64, 'raw/final'), ('effectiveF32SHA256', '0' * 64, 'raw/final'), ('absoluteByteOffset', -1, 'offset'), ('binding', {'kind': 'initializer', 'name': q}, 'binding'), ('scaleSHA256', '0' * 64, 'quantization bits')]
        for field, value, pattern in mutations:
            changed = copy.deepcopy(actual)
            changed[q][field] = value
            with self.assertRaisesRegex(ValueError, pattern):
                module.verify_patched_parameter_identities(changed, reference, patches, patch_hash, package_hash)
        changed = copy.deepcopy(reference)
        unpatched = next(key for key in actual if key.startswith('text_embedding.0.weight'))
        changed['parameterSources'][unpatched]['decodedF32SHA256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'explicit patch scope'):
            module.verify_patched_parameter_identities(actual, changed, patches, patch_hash, package_hash)
        with self.assertRaisesRegex(ValueError, 'artifact binding'):
            module.verify_patched_parameter_identities(actual, reference, patches, '0' * 64, package_hash)
        changed = copy.deepcopy(actual)
        changed[q]['tileBindings'][0]['patches'][0]['blockSHA256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'undeclared patch'):
            module.verify_patched_parameter_identities(changed, reference, patches, patch_hash, package_hash)
        with self.assertRaisesRegex(ValueError, 'All29'):
            module.verify_patched_parameter_identities({key: value for key, value in actual.items() if key != q}, reference, patches, patch_hash, package_hash)
        changed = dict(actual)
        changed['renamed-selection'] = changed.pop(q)
        with self.assertRaisesRegex(ValueError, 'all29 frozen'):
            module.verify_patched_parameter_identities(changed, reference, patches, patch_hash, package_hash)

    def test_small_provider_proof_compares_independent_fp8_and_f16_decode_bits(self):
        module = self.harness()
        ref = module.module_at('p4-cross-ffn-reference')
        scale_hash, config_hash = 'a' * 64, 'b' * 64
        class FakeParameters:
            def __init__(self, path, side, plan):
                self.plan, self.scales = plan, {'blocks.0.cross_attn.q.weight': ref.np.float32(.5)}
                self.sources = {'blocks.0.cross_attn.q.weight_scale': {'rawSHA256': scale_hash}, 'blocks.0.cross_attn.q.comfy_quant': {'rawSHA256': config_hash}}
            def selection(self, key, spec):
                return (0, 20480) if len(spec['fullShape']) == 2 else (30000, 8)
            def read(self, offset, count):
                return b'\x38' * count if offset == 0 else ref.np.full(4, .25, dtype='<f2').tobytes()
            def close(self):
                pass
        receipt = {'patches': [{'weightId': 'blocks.0.cross_attn.q.weight', 'count': 20480, 'baseF32SHA256': ref.identity(ref.np.full(20480, .5, dtype='<f4'))['sha256']}, {'weightId': 'blocks.0.cross_attn.q.bias', 'count': 4, 'baseF32SHA256': ref.identity(ref.np.full(4, .25, dtype='<f4'))['sha256']}], 'registry': {'targets': [{'weightId': 'blocks.0.cross_attn.q.weight', 'scaleSHA256': scale_hash, 'quantConfigSHA256': config_hash}]}}
        with mock.patch.object(ref, 'Parameters', FakeParameters):
            proof = module.verify_prepared_base(receipt, Path('/unused-model'), 'HIGH', ref)
            self.assertEqual(len(proof['selections']), 2)
            self.assertTrue(proof['independentBoundedDecodeBitsExact'])
            receipt['patches'][0]['baseF32SHA256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'decoded F32 bits'):
                module.verify_prepared_base(receipt, Path('/unused-model'), 'HIGH', ref)

    def test_private_outputs_remain_tmp_600_and_parent_700(self):
        module = self.harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'private' / 'patch.json'
            module.private_write(path, {'patches': [{'data': [7]}]})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)


if __name__ == '__main__':
    unittest.main()
