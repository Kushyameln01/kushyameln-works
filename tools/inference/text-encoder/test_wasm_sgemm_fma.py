"""NN0 binary-boundary checks for the private SGEMM-only diagnostic runtime."""
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def integer(value):
    output = bytearray()
    while value > 127:
        output.append((value & 127) | 128)
        value >>= 7
    output.append(value)
    return bytes(output)


def section(kind, payload):
    return bytes([kind]) + integer(len(payload)) + payload


def fixture(bodies=(b'\0\x0b', b'\0\x01\x0b', b'\0\x01\x01\x0b')):
    return (b'\0asm\1\0\0\0' + section(1, b'\x01\x60\0\0') + section(3, b'\x03\0\0\0')
            + section(10, integer(len(bodies)) + b''.join(integer(len(body)) + body for body in bodies))
            + section(0, b'\x04noteunchanged'))


class SgemmBinaryBoundary(unittest.TestCase):
    def target(self):
        path = HERE / 'wasm_sgemm_fma.py'
        self.assertTrue(path.exists(), 'Private SGEMM-only binary builder is missing')
        spec = importlib.util.spec_from_file_location('sgemm_fma', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_splice_keeps_every_other_body_and_section_byte_exact(self):
        target = self.target()
        original = fixture()
        replacements = {0: b'\0\x01\x01\x01\x0b', 2: b'\0\x0b'}
        patched = target.splice_bodies(original, replacements)
        result = target.verify_splice(original, patched, set(replacements))
        self.assertEqual(result['changedFunctionIndices'], [0, 2])
        self.assertEqual(result['unchangedFunctionBodies'], 1)
        self.assertTrue(result['otherSectionsByteExact'])
        self.assertEqual(target.code_bodies(patched)[1], b'\0\x01\x0b')

    def test_guard_rejects_a_change_outside_the_two_selected_bodies(self):
        target = self.target()
        original = fixture()
        patched = target.splice_bodies(original, {0: b'\0\x01\x01\x01\x0b', 2: b'\0\x0b'})
        with self.assertRaisesRegex(ValueError, 'section'):
            target.verify_splice(original, patched.replace(b'unchanged', b'CHANGED!!'), {0, 2})
        modified = target.splice_bodies(patched, {1: b'\0\x01\x01\x01\x0b'})
        with self.assertRaisesRegex(ValueError, 'body'):
            target.verify_splice(original, modified, {0, 2})

    def test_selected_vendor_has_the_exact_two_pinned_signature_and_body_hashes(self):
        target = self.target()
        raw = (HERE.parents[2] / 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm').read_bytes()
        found = target.inspect_selected_runtime(raw)
        self.assertEqual(found['importedFunctions'], 99)
        self.assertEqual(found['selectedFunctionIndices'], [1365, 1946])
        self.assertEqual(found['bodies']['1365']['bytes'], 2040)
        self.assertEqual(found['bodies']['1946']['bytes'], 1922)


if __name__ == '__main__':
    unittest.main()
