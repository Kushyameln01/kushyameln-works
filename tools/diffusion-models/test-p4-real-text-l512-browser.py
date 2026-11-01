"""No operators: exact native admission, private chunk transport and publication."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('p4-real-text-l512-browser.py')


def harness():
    spec = importlib.util.spec_from_file_location('real_l512_browser_tests', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AdmissionAndTransport(unittest.TestCase):
    def test_frozen_private_native_input_and_original_wkt(self):
        module = harness()
        if not module.DEFAULT_INPUT.exists() or not module.DEFAULT_PACKET.exists():
            self.skipTest('Private native packet not available')
        binding = module.load_native_input(module.DEFAULT_INPUT)
        self.assertEqual(binding['nativeTextArtifactSHA256'], module.NATIVE_SHA256)
        self.assertEqual(len(module.shapes()), 25)
        self.assertEqual(sum(__import__('math').prod(shape) * 4 for shape in module.shapes().values()), 63709184)

    def test_wrong_native_bytes_rejected_before_any_browser_import(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'native.json'
            for payload in ({}, {'shape': [1, 4, 4096]}, {'modelSha256': '0' * 64}, {'attentionMask': [1] * 512}, {'nativeTensorMetadata': {'meaning': 'forged'}}):
                path.write_text(json.dumps(payload))
                with self.assertRaisesRegex(ValueError, 'native Text file SHA256'):
                    module.load_native_input(path)

    def test_all25_binary_outputs_preserve_signed_zero_and_exact_native_hashes(self):
        module = harness()
        names = list(module.shapes())
        raw = struct.pack('<4f', 0., -0., 1.5, -2.25)
        small_shapes = {name: [4] for name in names}
        identity = {'shape': [4], 'elements': 4, 'bytes': 16, 'sha256': module.sha(raw)}
        identities = {name: dict(identity) for name in names}
        manifest = {'schemaVersion': 'bernini-p4-real-text-l512-runtime/0.1', 'outputIdentities': identities,
                    'arrays': {name: {'path': name + '.f32', 'shape': [4], 'dtype': 'float32', 'sha256': module.sha(raw), 'bytes': 16} for name in names},
                    'evidence': {'outputHashes': {name + 'SHA256': module.sha(raw) for name in names}}}
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'shapes', return_value=small_shapes):
            sink = module.PrivateBinarySink(Path(directory) / 'private')
            try:
                for name in names:
                    for offset in (0, 8):
                        sink.write({'name': name, 'offset': offset, 'byteLength': 8, 'base64': base64.b64encode(raw[offset:offset + 8]).decode()})
                bad = copy.deepcopy(manifest)
                bad['evidence']['outputHashes']['gateSHA256'] = '0' * 64
                with self.assertRaisesRegex(ValueError, 'native bits/shape'):
                    sink.finish(json.dumps(bad), identities)
                proof = sink.finish(json.dumps(manifest), identities)
                self.assertEqual(proof['verifiedOutputCount'], 25)
                self.assertEqual(proof['rawBytes'], 400)
                self.assertEqual(proof['chunkCount'], 50)
                for name in names:
                    path = sink.directory / (name + '.f32')
                    self.assertEqual(path.read_bytes(), raw)
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(sink.directory.stat().st_mode & 0o777, 0o700)
                self.assertEqual((sink.directory / 'manifest.json').stat().st_mode & 0o777, 0o600)
            finally:
                sink.close()

    def test_chunk_rejects_unknown_names_wrong_offsets_duplicates_sizes_and_base64(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            sink = module.PrivateBinarySink(Path(directory) / 'private')
            try:
                valid = {'name': 'gate', 'offset': 0, 'byteLength': 4, 'base64': base64.b64encode(b'\x00' * 4).decode()}
                for changed in ({'name': '../escape'}, {'offset': 4}, {'byteLength': 262148}, {'byteLength': 3}, {'base64': '!!!!'}, {'extra': True}):
                    with self.assertRaises((ValueError, __import__('binascii').Error)):
                        sink.write({**valid, **changed})
                sink.write(valid)
                with self.assertRaisesRegex(ValueError, 'order/duplicate'):
                    sink.write(valid)
                with self.assertRaisesRegex(ValueError, 'All25'):
                    sink.finish('{}', {})
            finally:
                sink.close()

    def test_public_projection_drops_manifest_and_private_native_input(self):
        module = harness()
        public = module.public_projection({'schemaVersion': 'x', 'privateManifestText': 'secret', 'nativeInputText': 'secret',
                                           'sourceExecution': {'commit': 'a' * 40}, 'browserMemory': {'sampleCount': 2}})
        self.assertEqual(set(public), {'schemaVersion', 'sourceExecution', 'browserMemory'})
        with self.assertRaisesRegex(ValueError, 'Private field'):
            module.public_projection({'sourceExecution': {'data': [7]}})

    def test_uncommitted_source_cannot_start_actual_execution(self):
        module = harness()
        with self.assertRaisesRegex(ValueError, 'commit'):
            module.verify_execution_source('0' * 40, {module.SCRIPT: module.sha(SCRIPT.read_bytes())})

    def test_pre_runtime_composed_freeze_rejects_changed_hash_gate_input_and_missing_output(self):
        module = harness()
        ref = module.COMMON.module_at('p4-cross-ffn-reference')
        commit = 'a' * 40
        bindings = {'savedArtifactSHA256': 'b' * 64, 'nativeTextArtifactSHA256': module.NATIVE_SHA256,
                    'conditioningDataSHA256': 'c' * 64, 'conditioningMaskSHA256': 'd' * 64}
        identities = {name: {'shape': shape, 'elements': __import__('math').prod(shape),
                             'bytes': __import__('math').prod(shape) * 4, 'sha256': 'e' * 64}
                      for name, shape in module.shapes().items()}
        manifest = {'schemaVersion': 'bernini-p4-real-text-l512-reference-arrays/0.1',
                    'mode': 'COMPOSED_BEFORE_RUNTIME', 'side': 'HIGH', 'candidatePlanSHA256': ref.PLAN_SHA256,
                    'inputBindings': bindings, 'gates': ref.load_plan()['gates'], 'outputIdentities': identities,
                    'independentOracleSHA256': module.sha((module.ROOT / 'tools/diffusion-models/p4-cross-ffn-reference.py').read_bytes()),
                    'transportGeneratorSHA256': module.sha((module.ROOT / 'development/ai-connection/p4-real-text-l512/reference/run-reference.py').read_bytes())}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            frozen = path / 'freeze.json'
            reference_path = path / 'manifest.json'
            def write(candidate):
                raw = json.dumps(candidate).encode()
                reference_path.write_bytes(raw)
                freeze = {'schemaVersion': 'bernini-p4-l512-pre-runtime-reference-freeze/0.1',
                          'candidatePlanSHA256': ref.PLAN_SHA256, 'sourceCommit': commit,
                          'cases': {side: {'manifestPath': str(reference_path), 'manifestSHA256': module.sha(raw)} for side in ('HIGH', 'LOW')}}
                frozen.write_text(json.dumps(freeze))
            write(manifest)
            self.assertTrue(module.verify_composed_freeze(frozen, 'HIGH', bindings, commit)['verifiedBeforeNativeConstruction'])
            reference_path.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'manifest SHA256'):
                module.verify_composed_freeze(frozen, 'HIGH', bindings, commit)
            for change in (lambda p: p.update(mode='LOCAL_RUNTIME_CUTS'),
                           lambda p: p['gates']['localCut'].update(abs=1),
                           lambda p: p['inputBindings'].update(conditioningDataSHA256='0' * 64),
                           lambda p: p['outputIdentities'].pop('gate')):
                candidate = copy.deepcopy(manifest)
                change(candidate)
                write(candidate)
                with self.assertRaisesRegex(ValueError, 'Pre-runtime composed'):
                    module.verify_composed_freeze(frozen, 'HIGH', bindings, commit)


if __name__ == '__main__':
    unittest.main()
