"""Packet/transport boundary tests; no model or real numerical reference run."""
import base64
import importlib.util
import json
from pathlib import Path
import struct
import unittest

import numpy as np

PATH = Path(__file__).with_name('prepare-input.py')
SPEC = importlib.util.spec_from_file_location('prepare_real_text', PATH)
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class InputBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = np.zeros((512, 4096), dtype='<f4')
        cls.data[0, :4] = [1., -0., -3., 0.125]
        cls.mask = [1] + [0] * 511
        cls.metadata = {
            'schemaVersion': 1, 'dtype': 'float32', 'shape': [1, 512, 4096],
            'layout': 'BLC', 'meaning': 'text_hidden_states', 'byteOrder': 'little',
            'byteLength': cls.data.nbytes, 'dataSha256': PREPARE.sha(cls.data.tobytes()),
            'modelSha256': PREPARE.MODEL_SHA256,
            'tokenizerSha256': PREPARE.TOKENIZER_SHA256,
            'attentionMask': cls.mask,
            'extraMetadata': {'nested': ['retained', {'value': -0.0}]},
        }

    def packet(self, metadata=None, payload=None):
        head = json.dumps(self.metadata if metadata is None else metadata, separators=(',', ':')).encode()
        return b'WKTSR001' + struct.pack('<I', len(head)) + head + (self.data.tobytes() if payload is None else payload)

    def test_all512_rows_mask_and_header_survive_json_bit_exactly(self):
        raw = self.packet()
        data, mask, metadata, header = PREPARE.decode_packet(raw)
        self.assertEqual(data.shape, (512, 4096))
        self.assertEqual(data.tobytes(), self.data.tobytes())
        self.assertEqual(mask.tolist(), self.mask)
        value = PREPARE.native_input(data, metadata, header, raw)
        roundtrip = json.loads(json.dumps(value, allow_nan=False))
        oracle, _ = PREPARE.load_oracle()
        native_data, native_mask, _ = oracle.validate_native_text(roundtrip)
        self.assertEqual(native_data.tobytes(), self.data.tobytes())
        self.assertEqual(native_mask.tobytes(), bytes(self.mask))
        self.assertEqual(roundtrip['nativeTensorMetadata'], self.metadata)
        self.assertEqual(base64.b64decode(roundtrip['nativeTensorHeaderBase64']), header)

    def test_wrong_extent_dtype_shape_and_mask_rejected(self):
        for fields in ({'shape': [1, 1, 4096]}, {'dtype': 'float16'}, {'byteOrder': 'big'}, {'attentionMask': [1]}, {'attentionMask': [True] * 512}):
            with self.subTest(fields=list(fields)):
                with self.assertRaises(ValueError):
                    PREPARE.decode_packet(self.packet(dict(self.metadata, **fields)))
        for raw in (self.packet()[:-1], self.packet() + b'\x00', b'NO-MAGIC' + self.packet()[8:]):
            with self.assertRaises(ValueError):
                PREPARE.decode_packet(raw)

    def test_nonzero_masked_rows_or_payload_corruption_rejected(self):
        values = self.data.copy()
        values[511, 0] = 1
        metadata = dict(self.metadata, dataSha256=PREPARE.sha(values.tobytes()))
        with self.assertRaisesRegex(ValueError, 'masked rows'):
            PREPARE.decode_packet(self.packet(metadata, values.tobytes()))
        raw = bytearray(self.packet()); raw[-1] ^= 1
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            PREPARE.decode_packet(bytes(raw))


if __name__ == '__main__':
    unittest.main()
