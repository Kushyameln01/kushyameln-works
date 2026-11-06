#!/usr/bin/env python3
"""Synthetic-only public contract tests for the independent P4 reference oracle.

No native module, original model/LoRA, or accepted-reference payload is opened.
Every file read here is a tiny test-owned temporary safetensors/JSON file.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

MODULE_PATH = Path(__file__).with_name('p4-lora-reference.py')
_loaded = None


def oracle():
    global _loaded
    if _loaded is None:
        if not MODULE_PATH.is_file():
            raise AssertionError('Required independent P4 reference oracle module is not implemented')
        spec = importlib.util.spec_from_file_location('p4_reference_under_test', MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        _loaded = module
    return _loaded


def digest(value):
    return hashlib.sha256(value).hexdigest()


def fixture_file(path, entries):
    """Build a tiny independent format fixture, not a production model wrapper."""
    header, data, offset = {}, bytearray(), 0
    for name, dtype, shape, raw in entries:
        header[name] = {'dtype': dtype, 'shape': shape,
                        'data_offsets': [offset, offset + len(raw)]}
        data.extend(raw)
        offset += len(raw)
    raw_header = json.dumps(header, separators=(',', ':')).encode('utf-8')
    path.write_bytes(struct.pack('<Q', len(raw_header)) + raw_header + data)
    return header, raw_header, bytes(data)


class OracleFeatureTests(unittest.TestCase):
    def test_public_oracle_module_exists(self):
        self.assertTrue(MODULE_PATH.is_file(),
                        'Required independent P4 reference oracle module is not implemented')


class NumericContractTests(unittest.TestCase):
    def test_controlled_inputs_have_exact_declared_dyadic_values_and_identities(self):
        inputs, declaration = oracle().controlled_inputs()
        expected = {
            'residual': np.asarray([((i % 17) - 8) / 128 for i in range(10240)],
                                   dtype='<f4').reshape(2, 5120),
            'timeAct1': np.asarray([((i % 13) - 6) / 256 for i in range(5120)],
                                  dtype='<f4'),
        }
        self.assertEqual(set(inputs), set(expected))
        for name, want in expected.items():
            actual = inputs[name]
            self.assertIsInstance(actual, np.ndarray)
            self.assertEqual(actual.dtype, np.dtype('<f4'))
            self.assertEqual(actual.shape, want.shape)
            np.testing.assert_array_equal(actual.view(np.uint32), want.view(np.uint32))
            identity = declaration['identities'][name]
            self.assertEqual(identity['shape'], list(want.shape))
            self.assertEqual(identity['elements'], want.size)
            self.assertEqual(identity['bytes'], want.nbytes)
            self.assertEqual(identity['sha256'], digest(want.tobytes()))
        self.assertEqual(declaration['schemaVersion'], 'lora-p4-controlled-inputs/0.1-draft.1')
        self.assertEqual(declaration['scope'], 'controlled-caller-input-n2-k4')
        self.assertIs(declaration['producerAuthenticated'], False)
        self.assertIs(declaration['naturalN2Reused'], False)
        self.assertEqual(declaration['formulas'], {
            'residual': '((i%17)-8)/128', 'timeAct1': '((i%13)-6)/256'})
        another, _ = oracle().controlled_inputs()
        inputs['residual'][0, 0] = 99
        self.assertEqual(float(another['residual'][0, 0]), -8 / 128)

    def test_merge_is_independent_binary64_and_fixed_alpha_rule_not_repeated_add(self):
        base = np.asarray([[.5, -.25, 1], [2, 0, -1]], dtype='<f4')
        down = np.asarray([[.5, .25, -.5], [1, -.5, .25]], dtype='<f4')
        up = np.asarray([[2, .5], [-1, 1]], dtype='<f4')
        # Closed-form UP@DOWN for these dyadic matrices, not an oracle call.
        delta = np.asarray([[1.5, .25, -.875], [.5, -.75, .75]], dtype=np.float64)
        retained = [a.copy() for a in (base, down, up)]
        for strength, alpha, factor in [(0, 8, 0), (-2, .5, -.5),
                                        (-1, None, -1), (1, 0, 0), (.5, -2, -.5)]:
            with self.subTest(strength=strength, alpha=alpha):
                actual = oracle().merge_reference(base, down, up, strength, alpha)
                self.assertEqual(actual.dtype, np.dtype('float64'))
                np.testing.assert_array_equal(actual, base.astype(np.float64) + factor * delta)
        for original, saved in zip((base, down, up), retained):
            np.testing.assert_array_equal(original, saved)
        first = oracle().merge_reference(base, down, up, 1, None)
        repeated = oracle().merge_reference(base, down, up, 1, None)
        np.testing.assert_array_equal(first, repeated)

    def test_merge_rejects_nonfinite_strength_or_alpha(self):
        base = np.ones((2, 3), dtype='<f4')
        down = np.ones((1, 3), dtype='<f4')
        up = np.ones((2, 1), dtype='<f4')
        for strength, alpha in [(math.inf, None), (math.nan, None),
                                (1, math.inf), (1, math.nan)]:
            with self.subTest(strength=strength, alpha=alpha):
                with self.assertRaises((ValueError, TypeError, OverflowError)):
                    oracle().merge_reference(base, down, up, strength, alpha)

    def test_bias_rounds_strength_and_product_as_f32_and_preserves_inputs(self):
        base = np.asarray([-1, -2, 1], dtype='<f4')
        delta = np.asarray([1, 2, -1], dtype='<f4')
        before_base, before_delta = base.copy(), delta.copy()
        # 1+2^-24 rounds to exactly1 in F32; using binary64 strength would leave
        # a nonzero residual. This catches changing the declared multiplication.
        actual = oracle().bias_reference(base, delta, 1 + 2**-24)
        self.assertEqual(actual.dtype, np.dtype('<f4'))
        np.testing.assert_array_equal(actual, np.zeros(3, dtype='<f4'))
        np.testing.assert_array_equal(base, before_base)
        np.testing.assert_array_equal(delta, before_delta)
        np.testing.assert_array_equal(oracle().bias_reference(base, delta, -1),
                                      np.asarray([-2, -4, 2], dtype='<f4'))

    def test_bf16_decode_is_exact_and_rejects_incomplete_element(self):
        bits = [0x0000, 0x8000, 0x3F80, 0xC020, 0x0001]
        decoded = oracle().decode_bf16(struct.pack('<5H', *bits))
        self.assertEqual(decoded.dtype, np.dtype('<f4'))
        np.testing.assert_array_equal(decoded.view(np.uint32),
                                      np.asarray([v << 16 for v in bits], dtype=np.uint32))
        with self.assertRaises((ValueError, TypeError)):
            oracle().decode_bf16(b'\x00')


class SyntheticFileContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='p4-oracle-unit-')
        self.root = Path(self.temporary.name)
        self.file = self.root / 'tiny.safetensors'
        self.entries = [
            ('bf', 'BF16', [2, 2], struct.pack('<4H', 0x3F00, 0x3F80, 0xC000, 0x4000)),
            ('half', 'F16', [4], np.asarray([-1, .125, 2, 4], dtype='<f2').tobytes()),
            ('single', 'F32', [3], np.asarray([-0.0, 1.25, -2.5], dtype='<f4').tobytes()),
        ]
        self.raw_tensors, self.raw_header, self.raw_payload = fixture_file(self.file, self.entries)

    def tearDown(self):
        self.temporary.cleanup()

    def test_header_identity_and_partial_tensor_reads_use_element_coordinates(self):
        h = oracle().original_header(self.file)
        self.assertEqual(h['payloadStart'], 8 + len(self.raw_header))
        self.assertEqual(h['headerBytes'], len(self.raw_header))
        self.assertEqual(h['headerSHA256'], digest(self.raw_header))
        self.assertEqual(h['fileBytes'], self.file.stat().st_size)
        self.assertEqual(h['tensors'], self.raw_tensors)
        for key, offset, count, expected, raw in [
            ('bf', 1, 2, [1, -2], self.entries[0][3][2:6]),
            ('half', 1, 2, [.125, 2], self.entries[1][3][2:6]),
            ('single', 1, 2, [1.25, -2.5], self.entries[2][3][4:12]),
        ]:
            with self.subTest(key=key):
                values, metadata = oracle().read_tensor(self.file, h, key, offset, count)
                self.assertEqual(values.dtype, np.dtype('<f4'))
                np.testing.assert_array_equal(values.reshape(-1), np.asarray(expected, dtype='<f4'))
                self.assertEqual(metadata['name'], key)
                self.assertEqual(metadata['elementOffset'], offset)
                self.assertEqual(metadata['elementCount'], count)
                self.assertEqual(metadata['byteLength'], len(raw))
                self.assertEqual(metadata['sha256'], digest(raw))
        whole, _ = oracle().read_tensor(self.file, h, 'single')
        self.assertTrue(np.signbit(whole.reshape(-1)[0]))

    def test_read_rejects_fractional_negative_and_out_of_range_element_requests(self):
        h = oracle().original_header(self.file)
        for offset, count in [(-1, 1), (4, 1), (1, 4), (0.5, 1), (0, 1.5), (0, -1)]:
            with self.subTest(offset=offset, count=count):
                with self.assertRaises((ValueError, TypeError, IndexError, OverflowError)):
                    oracle().read_tensor(self.file, h, 'bf', offset, count)
        with self.assertRaises((ValueError, TypeError, KeyError)):
            oracle().read_tensor(self.file, h, 'missing')

    def test_header_rejects_duplicate_keys_and_invalid_declared_byte_ranges(self):
        descriptor = '{"dtype":"BF16","shape":[1],"data_offsets":[0,2]}'
        duplicate = ('{"x":' + descriptor + ',"x":' + descriptor + '}').encode()
        self.file.write_bytes(struct.pack('<Q', len(duplicate)) + duplicate + b'\x00\x00')
        with self.assertRaises((ValueError, TypeError)):
            oracle().original_header(self.file)
        for offsets in [[-1, 1], [2, 0], [0, 5], [0, 3]]:
            with self.subTest(offsets=offsets):
                raw = json.dumps({'x': {'dtype': 'BF16', 'shape': [2],
                                        'data_offsets': offsets}}).encode()
                self.file.write_bytes(struct.pack('<Q', len(raw)) + raw + b'\x00' * 4)
                with self.assertRaises((ValueError, TypeError)):
                    oracle().original_header(self.file)

    def test_header_and_tensor_reject_truncated_storage_and_nonfinite_values(self):
        for raw in [b'', b'\x01' * 7, struct.pack('<Q', 100) + b'{}']:
            with self.subTest(raw=raw):
                self.file.write_bytes(raw)
                with self.assertRaises((ValueError, TypeError, EOFError, struct.error)):
                    oracle().original_header(self.file)
        for dtype, raw in [('BF16', struct.pack('<H', 0x7F80)),
                            ('F16', np.asarray([math.nan], dtype='<f2').tobytes()),
                            ('F32', np.asarray([math.inf], dtype='<f4').tobytes())]:
            with self.subTest(dtype=dtype):
                fixture_file(self.file, [('x', dtype, [1], raw)])
                h = oracle().original_header(self.file)
                with self.assertRaises((ValueError, TypeError)):
                    oracle().read_tensor(self.file, h, 'x')
        fixture_file(self.file, self.entries)
        h = oracle().original_header(self.file)
        self.file.write_bytes(self.file.read_bytes()[:-1])
        with self.assertRaises((ValueError, TypeError, EOFError)):
            oracle().read_tensor(self.file, h, 'single')

    def test_private_json_exclusive_creation_permissions_and_signed_zero(self):
        target = self.root / 'nested' / 'private' / 'receipt.json'
        oracle().write_private_json(target, {'values': [-0.0, 0.0], 'scope': 'synthetic-only'})
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(target.parent.stat().st_mode & 0o777, 0o700)
        stored = json.loads(target.read_text())
        self.assertEqual(math.copysign(1, stored['values'][0]), -1)
        self.assertEqual(math.copysign(1, stored['values'][1]), 1)
        retained = target.read_bytes()
        with self.assertRaises((FileExistsError, ValueError)):
            oracle().write_private_json(target, {'replacement': True})
        self.assertEqual(target.read_bytes(), retained)

    def test_stat_identity_exposes_exact_string_fields_without_source_rehash(self):
        identity = oracle().stat_identity(self.file)
        stat = self.file.stat()
        expected = {'size': str(stat.st_size), 'mtimeNs': str(stat.st_mtime_ns),
                    'ctimeNs': str(stat.st_ctime_ns), 'dev': str(stat.st_dev),
                    'ino': str(stat.st_ino)}
        self.assertEqual(identity, expected)
        with self.file.open('ab') as stream:
            stream.write(b'x')
        self.assertNotEqual(oracle().stat_identity(self.file)['size'], identity['size'])


class SourceGateTests(unittest.TestCase):
    def test_tampered_closure_manifest_rejects_before_forward_core_import(self):
        module = oracle()
        build_path = 'development/ai-connection/p4-cross-ffn/build.json'
        # These are tiny code-identity fixtures, not executable oracle/native
        # sources. A fake Git transport supplies immutable expected blob bytes;
        # production fixed_source still performs the actual file-byte check.
        with tempfile.TemporaryDirectory(prefix='p4-source-gate-unit-') as temporary:
            peer = Path(temporary)
            blobs = {module.CORE_PATH: b'# test-only core identity; never executed\n',
                     module.PLAN_PATH: b'{"scope":"test-only-plan-identity"}\n'}
            entries = {}
            for index in range(50):
                name = 'test-source/source-' + str(index) + '.mjs'
                raw = ('// test-only source identity ' + str(index) + '\n').encode()
                blobs[name] = raw
                entries[name] = {'byteLength': len(raw), 'sha256': digest(raw)}
            other = 'test-source/other-present-git-object.mjs'
            blobs[other] = b'// another valid blob, outside the fixed build closure\n'
            expected_build = {'sourceCount': 50, 'sources': entries}
            blobs[build_path] = (json.dumps(expected_build, sort_keys=True) + '\n').encode()
            for name, raw in blobs.items():
                target = peer / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
            # Keep50 individually valid Git-bound entries, but silently replace
            # one registered source. Count/individual hashes alone cannot prove
            # the published build closure unless its manifest is pinned too.
            tampered = json.loads(blobs[build_path])
            del tampered['sources']['test-source/source-0.mjs']
            tampered['sources'][other] = {
                'byteLength': len(blobs[other]), 'sha256': digest(blobs[other])}
            (peer / build_path).write_text(json.dumps(tampered) + '\n')

            def fixture_git(_root, *arguments):
                if arguments == ('rev-parse', 'HEAD'):
                    return (module.PEER_COMMIT + '\n').encode()
                if len(arguments) == 2 and arguments[0] == 'show':
                    commit, name = arguments[1].split(':', 1)
                    self.assertEqual(commit, module.PEER_COMMIT)
                    return blobs[name]
                self.fail('Unexpected source-transport request: ' + repr(arguments))

            class ForwardImportReached(Exception):
                pass

            with patch.object(module, 'git', side_effect=fixture_git), \
                 patch.object(module, 'CORE_SHA', digest(blobs[module.CORE_PATH])), \
                 patch.object(module, 'PLAN_SHA', digest(blobs[module.PLAN_PATH])), \
                 patch.object(module.importlib.util, 'spec_from_file_location',
                              side_effect=ForwardImportReached):
                try:
                    module.load_peer(peer)
                except ValueError as error:
                    self.assertIn('build.json', str(error))
                except ForwardImportReached:
                    self.fail('Tampered closure manifest was accepted before forward-core import')
                else:
                    self.fail('Tampered closure manifest was accepted')


class BudgetContractTests(unittest.TestCase):
    def test_static_budget_declares_bounds_without_payload_io(self):
        module = oracle()
        with patch('builtins.open', side_effect=AssertionError('No payload I/O permitted')), \
             patch.object(Path, 'open', side_effect=AssertionError('No payload I/O permitted')):
            budget = module.static_budget()
        self.assertIsInstance(budget, dict)
        for key, expected in {'allMatrixWeightsResident': False,
                              'parameterReadsAreBounded': True,
                              'maxDecodedElementsPerTile': 81920,
                              'ffnDownMaxRowsPerRead': 4,
                              'fullBaseHashRecomputed': False}.items():
            self.assertEqual(budget[key], expected)


if __name__ == '__main__':
    unittest.main()
