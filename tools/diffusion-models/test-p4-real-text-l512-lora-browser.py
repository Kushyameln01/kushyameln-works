"""Pre-native LoRA source/reference admission checks; no model operators."""
import copy
import hashlib
import http.server
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

SCRIPT = Path(__file__).with_name('p4-real-text-l512-lora-browser.py')
OWNER_SOURCE = Path('/tmp/p4-l512-lora/a80/source')
OWNER_RECEIPT = Path('/tmp/p4-l512-lora/a80/download-receipt.json')


def harness():
    spec = importlib.util.spec_from_file_location('real_l512_lora_browser_tests', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OwnerSourceAdmission(unittest.TestCase):
    def owner_fixture(self):
        if not OWNER_SOURCE.is_dir() or not OWNER_RECEIPT.is_file():
            self.skipTest('Acquired canonical owner source is unavailable')
        return json.loads(OWNER_RECEIPT.read_bytes())

    def test_exact_acquired_owner_files_are_admitted(self):
        self.owner_fixture()
        module = harness()
        overlay = module.load_owner_overlay(OWNER_SOURCE, OWNER_RECEIPT)
        sdk = overlay['/shared/inference/lora/sdk-v2.mjs']
        raw = sdk['path'].read_bytes()
        self.assertEqual(sdk['ownerCommit'], 'a80db72feea60b9bd69e292e4716665c6f0ee77f')
        self.assertEqual(sdk['bytes'], len(raw))
        self.assertEqual(sdk['sha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(sdk['gitBlobSHA1'], hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest())
        self.assertIn('/shared/vr180/sha256.mjs', overlay)

    def test_wrong_commit_content_identity_blob_proof_duplicates_and_escape_reject(self):
        rows = self.owner_fixture()
        module = harness()
        target = next(i for i, row in enumerate(rows) if row['path'].endswith('/sdk-v2.mjs'))
        mutations = (
            lambda p: p[target].update(commit='0' * 40),
            lambda p: p[target].update(sha256='0' * 64),
            lambda p: p[target].update(bytes=p[target]['bytes'] + 1),
            lambda p: p[target].update(gitBlobSHA1='0' * 40),
            lambda p: p[target].update(pluginGitBlobSHA1='0' * 40),
            lambda p: p[target].update(gitBlobMatched=False),
            lambda p: p[target].update(sizeMatched=False),
            lambda p: p.append(copy.deepcopy(p[target])),
            lambda p: p[target].update(path='../sdk-v2.mjs'),
        )
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / 'receipt.json'
            for mutate in mutations:
                candidate = copy.deepcopy(rows)
                mutate(candidate)
                receipt.write_text(json.dumps(candidate))
                with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                    module.load_owner_overlay(OWNER_SOURCE, receipt)
                # Exercise the inner provenance checks as well as the immutable
                # receipt hash boundary; production never rebinds this constant.
                digest = hashlib.sha256(receipt.read_bytes()).hexdigest()
                with self.subTest(inner_mutation=mutate), \
                        patch.object(module, 'OWNER_RECEIPT_SHA256', digest), \
                        self.assertRaises(ValueError):
                    module.load_owner_overlay(OWNER_SOURCE, receipt)

    def test_owner_file_byte_change_is_rejected_with_unchanged_receipt(self):
        self.owner_fixture()
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'
            shutil.copytree(OWNER_SOURCE, source)
            target = source / 'docs/shared/inference/lora/sdk-v2.mjs'
            target.write_bytes(target.read_bytes() + b'\n// changed after acquisition\n')
            with self.assertRaises(ValueError):
                module.load_owner_overlay(source, OWNER_RECEIPT)

    def http_response(self, server, path):
        try:
            with urlopen(f'http://127.0.0.1:{server.server_port}' + path, timeout=5) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    def test_http_serves_exact_owner_and_inventory_sources_without_namespace_fallback(self):
        self.owner_fixture()
        module = harness()
        overlay = module.load_owner_overlay(OWNER_SOURCE, OWNER_RECEIPT)
        local = 'docs/shared/diffusion-models/diagnostics/p4-real-text-l512/run.mjs'
        local_raw = (module.ROOT / local).read_bytes()
        handler = module.handler_for(overlay, {local: hashlib.sha256(local_raw).hexdigest()})
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            sdk_url = '/shared/inference/lora/sdk-v2.mjs'
            status, body = self.http_response(server, sdk_url)
            self.assertEqual(status, 200)
            self.assertEqual(body, overlay[sdk_url]['path'].read_bytes())
            status, body = self.http_response(server, local.removeprefix('docs'))
            self.assertEqual(status, 200)
            self.assertEqual(body, local_raw)
            self.assertEqual(next(row for row in handler.served if row['url'] == sdk_url)['ownerCommit'], module.OWNER_COMMIT)
            self.assertIsNone(next(row for row in handler.served if row['url'] == local.removeprefix('docs'))['ownerCommit'])
            for path in ('/shared/inference/lora/not-in-owner-manifest.mjs',
                         '/shared/inference/lora/%2e%2e/sdk-v2.mjs',
                         '/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs',
                         '/tmp/private-model.safetensors', '/development/private.json'):
                with self.subTest(path=path):
                    self.assertNotEqual(self.http_response(server, path)[0], 200)
            self.assertTrue(handler.served)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_http_rejects_owner_source_changed_after_inventory_freeze(self):
        self.owner_fixture()
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'
            shutil.copytree(OWNER_SOURCE, source)
            overlay = module.load_owner_overlay(source, OWNER_RECEIPT)
            sdk_url = '/shared/inference/lora/sdk-v2.mjs'
            sdk_path = overlay[sdk_url]['path']
            sdk_path.write_bytes(sdk_path.read_bytes() + b'\n// changed after freeze\n')
            handler = module.handler_for(overlay, {})
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                self.assertNotEqual(self.http_response(server, sdk_url)[0], 200)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)


class ReferenceAdmission(unittest.TestCase):
    def reference_fixture(self, module, directory):
        """Typed zero fixtures exercise transport admission, never LoRA math."""
        directory = Path(directory)
        ref = module.COMMON.module_at('p4-cross-ffn-reference')
        bindings = {key: str(index) * 64 for index, key in enumerate(
            ('savedArtifactSHA256', 'nativeTextArtifactSHA256', 'conditioningDataSHA256', 'conditioningMaskSHA256'), 1)}

        def array(name, shape, dtype, unit, *, file_field='file'):
            elements = __import__('math').prod(shape)
            raw = bytes(elements * unit)
            (directory / name).write_bytes(raw)
            return {file_field: name, 'shape': shape, 'dtype': dtype, 'elements': elements,
                    'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

        a = {
            'weight': array('A-weight.f64', [4, 5120], 'F64', 8),
            'bias': array('A-bias.f32', [4], 'F32', 4),
            'baseWeight': array('A-base-weight.f32', [4, 5120], 'F32', 4),
            'baseBias': array('A-base-bias.f32', [4], 'F32', 4),
        }
        blocks = []
        for role, shape, count in (('weight', [5120, 5120], 20480), ('bias', [5120], 4)):
            key = 'blocks.0.cross_attn.q.' + role
            blocks.append({'weightId': key, 'offset': 0, 'count': count, 'fullShape': shape,
                           'binding': {'kind': 'runtime-input' if role == 'weight' else 'hike-parameter', 'name': key},
                           'dtype': 'F32', 'data': [0.] * count,
                           'sha256': hashlib.sha256(bytes(count * 4)).hexdigest()})
        patch_raw = json.dumps({'schemaVersion': 'bernini-p4-final-f32-patches/0.1', 'side': 'LOW',
                               'candidatePlanSHA256': ref.PLAN_SHA256, 'patches': blocks}).encode()
        (directory / 'A-independent-patches.json').write_bytes(patch_raw)
        a['independentPatchArtifact'] = {'file': 'A-independent-patches.json', 'bytes': len(patch_raw),
                                         'sha256': hashlib.sha256(patch_raw).hexdigest()}
        descriptors = {name: array(name + '.f32', shape, 'float32', 4, file_field='path')
                       for name, shape in module.BASE.shapes().items()}
        identities = {name: {key: descriptor[key] for key in ('shape', 'elements', 'bytes', 'sha256')}
                      for name, descriptor in descriptors.items()}
        manifest = {
            'schemaVersion': 'bernini-p4-real-text-l512-lora-oracle/0.1',
            'scope': 'real-text-l512-saved-low3-n2-block0-selected-light-q4-strength1',
            'mode': 'COMPOSED_BEFORE_RUNTIME', 'side': 'LOW', 'strength': 1,
            'candidatePlanSHA256': ref.PLAN_SHA256,
            'sourceCommit': 'a' * 40, 'ownerSource': {'commit': module.OWNER_COMMIT},
            'referenceId': 'real-text-l512-light-LOW-q4-s1:' + 'a' * 40,
            'original': {'fileName': module.LORA_NAME, 'byteLength': module.LORA_BYTES,
                         'expectedSha256': module.LORA_SHA256, 'headerSha256': module.LORA_HEADER_SHA256,
                         'rank': 128, 'alpha': 128, 'sourceDtype': 'BF16',
                         'loaderPolicyId': 'comfy-lora-b5a4321-linear-diff-v1'},
            'selection': {'pairId': 'light', 'side': 'LOW', 'weightId': 'blocks.0.cross_attn.q.weight',
                          'biasWeightId': 'blocks.0.cross_attn.q.bias', 'rows': [0, 4], 'columns': [0, 5120],
                          'fullWeightShape': [5120, 5120], 'fullBiasShape': [5120],
                          'coverage': 'PARTIAL', 'completeAdapter': False},
            'inputBindings': {**bindings, 'finalF32PatchArtifactSHA256': a['independentPatchArtifact']['sha256']},
            'A': a, 'arrays': descriptors, 'outputIdentities': identities,
            'gates': copy.deepcopy(module.GATES), 'numericGates': ref.load_plan()['gates'],
        }
        return manifest, bindings

    def test_wrong_reference_artifact_hash_rejects_without_browser(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'manifest.json'
            path.write_text('{}')
            with self.assertRaises(ValueError):
                module.load_lora_reference(path, '0' * 64, {})

    def test_all25_reference_admission_and_deep_schema_gate_input_selection_mutations(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'manifest.json'
            manifest, bindings = self.reference_fixture(module, directory)

            def load(candidate):
                raw = json.dumps(candidate).encode()
                path.write_bytes(raw)
                return module.load_lora_reference(path, hashlib.sha256(raw).hexdigest(), bindings)

            payload, proof = load(manifest)
            self.assertEqual(proof['verifiedOutputCount'], 25)
            self.assertTrue(proof['verifiedBeforeNativeConstruction'])
            self.assertFalse(proof['ownerSDKPatchesUsedAsOracle'])
            self.assertEqual(set(payload['oracleArraysBase64']), {'weight', 'bias', 'baseWeight', 'baseBias', 'blockOutput'})
            mutations = {
                'controlled-K4-mode': lambda p: p.update(mode='CONTROLLED_K4'),
                'HIGH-side': lambda p: p.update(side='HIGH'),
                'wrong-strength': lambda p: p.update(strength=-1),
                'wrong-original-header': lambda p: p['original'].update(headerSha256='0' * 64),
                'rebased-full-shape': lambda p: p['selection'].update(fullWeightShape=[4, 5120]),
                'wrong-selected-rows': lambda p: p['selection'].update(rows=[4, 8]),
                'changed-owner-gate': lambda p: p['gates']['weight'].update(absolute=.01),
                'changed-stage-gate': lambda p: p['numericGates']['composed'].update(abs=1),
                'wrong-real-text-binding': lambda p: p['inputBindings'].update(conditioningDataSHA256='0' * 64),
                'missing-final-patch-binding': lambda p: p['inputBindings'].pop('finalF32PatchArtifactSHA256'),
                'independent-patch-path-escape': lambda p: p['A']['independentPatchArtifact'].update(file='../patch.json'),
                'A-descriptor-path-escape': lambda p: p['A']['weight'].update(file='../A-weight.f64'),
                'A-descriptor-byte-overflow': lambda p: p['A']['weight'].update(bytes=2**53),
                'L4-output-shape': lambda p: p['outputIdentities']['qkvK'].update(shape=[4, 5120]),
                'missing-output': lambda p: p['outputIdentities'].pop('normK'),
                'output-descriptor-path-escape': lambda p: p['arrays']['gate'].update(path='../gate.f32'),
                'output-binary-hash-mismatch': lambda p: p['arrays']['blockOutput'].update(sha256='0' * 64),
            }
            for name, mutate in mutations.items():
                candidate = copy.deepcopy(manifest)
                mutate(candidate)
                with self.subTest(mutation=name), self.assertRaises(ValueError):
                    load(candidate)

    def test_independent_reference_binary_changed_after_manifest_freeze_rejects(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'manifest.json'
            manifest, bindings = self.reference_fixture(module, directory)
            raw = json.dumps(manifest).encode()
            path.write_bytes(raw)
            changed = Path(directory) / 'A-weight.f64'
            with changed.open('r+b') as output:
                output.write(b'\x01')
            with self.assertRaisesRegex(ValueError, 'binary hash'):
                module.load_lora_reference(path, hashlib.sha256(raw).hexdigest(), bindings)


if __name__ == '__main__':
    unittest.main()
