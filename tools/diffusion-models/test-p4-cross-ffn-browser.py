"""Admission and publication guards; no model operators or browser are constructed."""
import importlib.util
import copy
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('p4-cross-ffn-browser.py')


class BrowserAdmission(unittest.TestCase):
    def harness(self):
        self.assertTrue(SCRIPT.exists(), 'P4 cross/FFN harness is missing')
        spec = importlib.util.spec_from_file_location('p4_cross_browser', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def parameter_fixture(self, module):
        plan = module.module_at('p4-cross-ffn-reference').load_plan()
        actual, expected = {}, {}
        digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
        for index, (key, spec) in enumerate(plan['parameters'].items()):
            matrix = 'selectedRows' in spec
            first, stop = spec['selectedRows' if matrix else 'selectedElements']
            step = 5120 if key in ('time_projection.1.weight', 'time_projection.1.bias', 'blocks.0.modulation') else stop - first
            width = spec['fullShape'][1] if matrix else 1
            unit = 2 if spec['storageDtype'] == 'F16' else 1
            base = 1000000 + index * 100000000
            for start in range(first, stop, step):
                end = min(start + step, stop)
                alias = key + (':' + str(start) if matrix or start else '')
                elements, raw_bytes = (end - start) * width, (end - start) * width * unit
                shared = {'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype'], 'absoluteByteOffset': base + start * width * unit,
                          'rawSHA256': digest(alias + ':raw')}
                final = digest(alias + ':decoded')
                expected[alias] = dict(shared, selectedRawBytes=raw_bytes, decodedF32SHA256=final, finalF32SHA256=final)
                actual[alias] = dict(shared, computeDtype='F32', byteLength=math.prod(spec['fullShape']) * unit,
                                     binding={'kind': 'runtime-input' if matrix else 'hike-parameter', 'name': key},
                                     fp8ProfileId='scaled-e4m3fn-scalar-f32-v1' if spec['storageDtype'] == 'F8_E4M3' else None)
                if matrix:
                    expected[alias]['selectedRows'] = [start, end]
                    actual[alias].update(selectedRows=[start, end], selectedRawBytes=raw_bytes, selectedEffectiveBytes=elements * 4, effectiveF32SHA256=final, columns=width, originalAbsoluteByteOffset=base,
                                         rowStart=start, rowCount=end-start, elementOffset=start*width, elementCount=elements, selectedElementCount=elements, selectedByteLength=raw_bytes)
                else:
                    expected[alias]['selectedElements'] = [start, end]
                    actual[alias].update(elementOffset=start, elementCount=elements, selectedByteLength=raw_bytes, decodedF32SHA256=final, rowStart=None, rowCount=None)
                if spec['storageDtype'] == 'F8_E4M3':
                    for field, suffix in [('scaleSHA256', '.weight_scale'), ('quantConfigSHA256', '.comfy_quant')]:
                        code_hash = digest(key + suffix)
                        actual[alias][field] = code_hash
                        config_key = key[:-7] + suffix
                        size, shape, dtype = (4, [], 'F32') if field == 'scaleSHA256' else (27, [27], 'U8')
                        offset = base + (0 if field == 'scaleSHA256' else 4)
                        expected[config_key] = {'originalKey': config_key, 'fullShape': shape, 'storageDtype': dtype, 'absoluteByteOffset': offset, 'selectedRawBytes': size, 'rawSHA256': code_hash}
                        actual[alias]['scaleSource' if field == 'scaleSHA256' else 'quantConfigSource'] = {'originalKey': config_key, 'fullShape': shape, 'storageDtype': dtype, 'absoluteByteOffset': offset, 'byteLength': size}
        return actual, expected

    def test_saved_residual_and_time_are_verified_without_operator_execution(self):
        module = self.harness()
        payload, bindings = module.load_saved_inputs('HIGH')
        self.assertEqual(len(payload['residual']), 10240)
        self.assertEqual(len(payload['timeAct1']), 5120)
        self.assertEqual(len(payload['oldOutputs']), 5)
        self.assertEqual(bindings['residualSHA256'], '72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9')
        self.assertEqual(payload['trustedInputs']['fullPrefix']['timeAct1SHA256'], bindings['timeAct1SHA256'])
        self.assertFalse(bindings['prefixRecomputed'])

    def test_forged_saved_file_is_rejected_before_browser_construction(self):
        module = self.harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'high-tail-outputs.json').write_text('{"side":"HIGH"}')
            with self.assertRaisesRegex(ValueError, 'Pinned saved-tail artifact mismatch'):
                module.load_saved_inputs('HIGH', path)

    def test_private_output_is_exclusive_tmp_mode_600_and_parent_700(self):
        module = self.harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'private' / 'actual.json'
            module.private_write(path, {'arrays': {'secret': [7.]}})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                module.private_write(path, {})
        with self.assertRaisesRegex(ValueError, '/tmp'):
            module.private_write(module.ROOT / 'never-private.json', {})

    def test_public_projection_drops_unknown_payload_fields_and_rejects_nested_values(self):
        module = self.harness()
        public = module.public_projection({'schemaVersion': 'test', 'passed': True, 'arrays': {'secret': [7.]}, 'scale': 7., 'evidence': {'resources': {'inputSnapshotBytes': 10}}})
        self.assertNotIn('arrays', public)
        self.assertNotIn('scale', public)
        self.assertEqual(public['evidence']['resources']['inputSnapshotBytes'], 10)
        for key in ('arrays', 'data', 'scale', 'expected', 'attentionMask'):
            with self.assertRaisesRegex(ValueError, 'Private field'):
                module.public_projection({'evidence': {key: [7.]}})

    def test_comparison_requires_fixed_bindings_and_all_named_arrays(self):
        module = self.harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            artifact = {'schemaVersion': 'bernini-p4-runtime-arrays/0.1', 'side': 'HIGH', 'candidatePlanSHA256': '0' * 64, 'arrays': {}}
            (path / 'high-runtime-arrays.json').write_text(json.dumps(artifact))
            with self.assertRaisesRegex(ValueError, 'runtime-cut schema/side/plan'):
                module.compare_private('HIGH', path / 'high-runtime-arrays.json', path)

    def test_parameter_proof_rejects_changed_decoded_bits_and_missing_chunks(self):
        module = self.harness()
        self.assertTrue(hasattr(module, 'verify_parameter_identities'), 'Independent decoder proof is missing')
        actual, expected = self.parameter_fixture(module)
        proof = module.verify_parameter_identities(actual, expected)
        self.assertEqual(proof['verifiedParameterCount'], 29)
        key = 'blocks.0.cross_attn.q.weight:0'
        original = actual[key]['effectiveF32SHA256']
        actual[key]['effectiveF32SHA256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'parameter.*bits'):
            module.verify_parameter_identities(actual, expected)
        actual[key]['effectiveF32SHA256'] = original
        del expected['time_projection.1.bias:15360']
        with self.assertRaisesRegex(ValueError, 'parameter.*missing'):
            module.verify_parameter_identities(actual, expected)

    def test_parameter_proof_requires_complete_actual_selection_coverage(self):
        module = self.harness()
        actual, expected = self.parameter_fixture(module)
        del actual['blocks.0.modulation:20480']
        with self.assertRaisesRegex(ValueError, 'parameter.*coverage'):
            module.verify_parameter_identities(actual, expected)

    def test_parameter_proof_cannot_treat_two_missing_raw_hashes_as_verified(self):
        module = self.harness()
        actual, expected = self.parameter_fixture(module)
        key = 'blocks.0.cross_attn.q.weight:0'
        actual[key]['rawSHA256'] = None
        expected[key]['rawSHA256'] = None
        with self.assertRaisesRegex(ValueError, 'parameter.*bits'):
            module.verify_parameter_identities(actual, expected)
        for field, suffix in [('scaleSHA256', '.weight_scale'), ('quantConfigSHA256', '.comfy_quant')]:
            with self.subTest(field=field):
                actual, expected = self.parameter_fixture(module)
                actual[key][field] = None
                expected['blocks.0.cross_attn.q' + suffix]['rawSHA256'] = None
                with self.assertRaisesRegex(ValueError, 'parameter.*bits'):
                    module.verify_parameter_identities(actual, expected)

    def test_parameter_proof_rejects_mapping_offset_count_binding_and_dtype_mutations(self):
        module = self.harness()
        actual, expected = self.parameter_fixture(module)
        key = 'blocks.0.cross_attn.q.weight:0'
        mutations = {'originalKey': 'blocks.0.cross_attn.k.weight', 'absoluteByteOffset': 1,
                     'selectedRawBytes': 1, 'selectedEffectiveBytes': 1, 'fullShape': [1, 1],
                     'storageDtype': 'F16', 'computeDtype': 'F16', 'selectedRows': [1, 5121],
                     'binding': {'kind': 'hike-parameter', 'name': 'blocks.0.cross_attn.q.weight'}}
        for field, value in mutations.items():
            with self.subTest(field=field):
                forged = copy.deepcopy(actual)
                forged[key][field] = value
                with self.assertRaisesRegex(ValueError, 'parameter'):
                    module.verify_parameter_identities(forged, expected)

    def test_explicit_patch_scope_verifies_final_bits_without_claiming_original_decode(self):
        module = self.harness()
        self.assertIn('patch_scope', inspect.signature(module.verify_parameter_identities).parameters, 'Explicit patch proof scope is missing')
        actual, expected = self.parameter_fixture(module)
        key = 'blocks.0.cross_attn.q.weight:0'
        patched = hashlib.sha256(b'explicit final F32 patch').hexdigest()
        actual[key]['effectiveF32SHA256'] = patched
        expected[key]['finalF32SHA256'] = patched
        with self.assertRaisesRegex(ValueError, 'Patched parameter'):
            module.verify_parameter_identities(actual, expected)
        scope = {'artifactSHA256': 'a' * 64, 'allowedTargetIds': ['blocks.0.cross_attn.q.weight', 'blocks.0.cross_attn.q.bias']}
        proof = module.verify_parameter_identities(actual, expected, patch_scope=scope)
        self.assertEqual(proof['verifiedParameterCount'], 29)
        self.assertFalse(proof['strictOriginalAndDecodedBits'])
        self.assertTrue(proof['strictOriginalStorageAndFinalF32Bits'])
        self.assertEqual(proof['patchScope'], scope)
        outside = 'blocks.0.cross_attn.k.weight:0'
        actual[outside]['effectiveF32SHA256'] = patched
        expected[outside]['finalF32SHA256'] = patched
        with self.assertRaisesRegex(ValueError, 'outside.*patch scope'):
            module.verify_parameter_identities(actual, expected, patch_scope=scope)

    def test_patch_scope_rejects_unbound_artifact_duplicate_and_unregistered_targets(self):
        module = self.harness()
        self.assertIn('patch_scope', inspect.signature(module.verify_parameter_identities).parameters, 'Explicit patch proof scope is missing')
        actual, expected = self.parameter_fixture(module)
        valid = {'artifactSHA256': 'a' * 64, 'allowedTargetIds': ['blocks.0.cross_attn.q.weight']}
        cases = [dict(valid, artifactSHA256=None), dict(valid, artifactSHA256='A' * 64),
                 dict(valid, allowedTargetIds=[]), dict(valid, allowedTargetIds=['blocks.0.cross_attn.q.weight'] * 2),
                 dict(valid, allowedTargetIds=['blocks.0.norm3.weight']), dict(valid, allowedTargetIds=['time_projection.1.weight']),
                 dict(valid, allowedTargetIds=['unregistered']), dict(valid, arbitraryApproval=True)]
        for scope in cases:
            with self.subTest(scope=scope):
                with self.assertRaisesRegex(ValueError, 'patch scope'):
                    module.verify_parameter_identities(actual, expected, patch_scope=scope)


if __name__ == '__main__':
    unittest.main()
