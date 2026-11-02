#!/usr/bin/env python3
"""Small, exact fixtures for the development-only streaming oracle."""
import importlib.util
import io
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent


def load_oracle():
    spec = importlib.util.spec_from_file_location("standalone_reference", HERE / "standalone-reference.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_source(path, entries):
    header, payload = {}, bytearray()
    for name, dtype, shape, values in entries:
        values = np.asarray(values, dtype="<f4")
        if dtype == "BF16":
            raw = (values.view("<u4") >> 16).astype("<u2").tobytes()
        else:
            raw = values.astype({"F16": "<f2", "F32": "<f4"}[dtype]).tobytes()
        header[name] = {"dtype": dtype, "shape": shape, "data_offsets": [len(payload), len(payload) + len(raw)]}
        payload.extend(raw)
    raw_header = json.dumps(header, separators=(",", ":")).encode()
    path.write_bytes(struct.pack("<Q", len(raw_header)) + raw_header + payload)


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.oracle = load_oracle()
        self.tmp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.tmp.name) / "fixture.safetensors"
        write_source(self.path, [
            ("layer.lora_down.weight", "BF16", [2, 3], [1, 2, 3, -1, 0, 2]),
            ("layer.lora_up.weight", "F16", [3, 2], [2, 3, -1, 4, 0, 1]),
            ("layer.alpha", "F32", [], [1]),
            ("layer.diff_b", "BF16", [3], [1, -2, 3]),
            ("norm.diff", "F32", [3], [0.5, -0.25, 1]),
        ])

    def tearDown(self):
        self.tmp.cleanup()

    def setup_session(self, cases=None):
        session = self.oracle.Session()
        init = {"op": "init", "sources": [{"id": "light", "path": str(self.path), "side": "HIGH"}],
                "cases": cases or [{"id": "plus", "side": "HIGH", "sources": [{"sourceId": "light", "strength": 1}]}]}
        return session, session.handle(init)

    def test_original_headers_determine_orientation_alpha_dtypes_and_bias_rule(self):
        session, result = self.setup_session()
        self.assertEqual(result["cases"][0]["expectedElements"], 15)
        actual = session.expected_block("plus", "layer.weight", 3, 6)
        # up[out,rank] @ down[rank,in], alpha/rank = 1/2.
        expected = np.asarray([-2.5 - 5/128, -1 - 4/128, 2.5 - 3/128,
                               -0.5 - 2/128, -1/128, 1], dtype="<f4")
        np.testing.assert_array_equal(actual, expected)
        np.testing.assert_array_equal(session.expected_block("plus", "layer.bias", 0, 3),
                                      np.asarray([1-8/128, -2-7/128, 3-6/128], dtype="<f4"))

    def test_full_coverage_success_and_missing_tail_is_not_pass(self):
        session, _ = self.setup_session()
        for key, count in [("layer.weight", 9), ("layer.bias", 3), ("norm.weight", 3)]:
            actual = session.expected_block("plus", key, 0, count)
            session.handle({"op": "compare", "caseId": "plus", "targetKey": key, "offset": 0, "count": count}, actual.tobytes())
        result = session.handle({"op": "finalize"})
        self.assertTrue(result["passed"])
        self.assertEqual(result["cases"][0]["comparedElements"], 15)
        self.assertEqual(result["cases"][0]["completeTargets"], 3)
        missing, _ = self.setup_session()
        result = missing.handle({"op": "finalize"})
        self.assertFalse(result["passed"])
        self.assertEqual(result["cases"][0]["comparedElements"], 0)

    def test_exact_bias_and_weight_gate_failures_are_counted(self):
        session, _ = self.setup_session()
        actual = session.expected_block("plus", "layer.bias", 0, 3)
        actual[0] = np.nextafter(actual[0], np.float32(np.inf))
        r = session.handle({"op": "compare", "caseId": "plus", "targetKey": "layer.bias", "offset": 0, "count": 3}, actual.tobytes())
        self.assertEqual(r["failedElements"], 1)
        actual = session.expected_block("plus", "layer.weight", 0, 9)
        actual[4] += 0.1
        r = session.handle({"op": "compare", "caseId": "plus", "targetKey": "layer.weight", "offset": 0, "count": 9}, actual.tobytes())
        self.assertEqual(r["failedElements"], 1)
        with self.assertRaisesRegex(ValueError, "contiguous"):
            session.handle({"op": "compare", "caseId": "plus", "targetKey": "layer.weight", "offset": 0, "count": 9}, actual.tobytes())

    def test_pilot_selection_preserves_full_source_totals_and_cannot_claim_full_coverage(self):
        case = {"id": "pilot", "side": "HIGH", "sources": [{"sourceId": "light", "strength": 1}],
                "targetKeys": ["layer.weight"]}
        session, initialized = self.setup_session([case])
        declared = initialized["cases"][0]
        self.assertEqual(declared["coverage"], "PARTIAL")
        self.assertEqual(declared["fullSourceTargetCount"], 3)
        self.assertEqual(declared["fullSourceElements"], 15)
        self.assertEqual(declared["expectedElements"], 9)
        actual = session.expected_block("pilot", "layer.weight", 0, 9)
        session.handle({"op": "compare", "caseId": "pilot", "targetKey": "layer.weight", "offset": 0, "count": 9}, actual.tobytes())
        result = session.handle({"op": "finalize"})
        self.assertTrue(result["passed"])
        self.assertEqual(result["coverage"], "PARTIAL")
        self.assertEqual(result["cases"][0]["completeTargets"], 1)
        for keys, message in [(["layer.weight", "layer.weight"], "Duplicate"), (["unknown.weight"], "independently parsed"), ([], "nonempty")]:
            with self.assertRaisesRegex(ValueError, message):
                self.setup_session([{**case, "targetKeys": keys}])
        _, full = self.setup_session()
        self.assertEqual(full["cases"][0]["coverage"], "FULL")

    def test_ordered_composition_negative_strength_and_base_restore(self):
        detail = pathlib.Path(self.tmp.name) / "detail.safetensors"
        write_source(detail, [("layer.lora_A.weight", "F32", [1, 3], [1, 2, 4]),
                              ("layer.lora_B.weight", "F32", [3, 1], [1, 2, 3])])
        session = self.oracle.Session()
        session.handle({"op": "init", "sources": [{"id": "l", "path": str(self.path), "side": "HIGH"},
                                                    {"id": "d", "path": str(detail), "side": "HIGH"}],
                        "cases": [{"id": "both", "side": "HIGH", "sources": [{"sourceId": "l", "strength": -1}, {"sourceId": "d", "strength": 1}]},
                                  {"id": "none", "side": "HIGH", "targetsFrom": ["l", "d"], "sources": []}]})
        np.testing.assert_array_equal(session.expected_block("both", "layer.weight", 0, 3),
                                      np.asarray([1.5-8/128, -7/128, -2-6/128], dtype="<f4"))
        np.testing.assert_array_equal(session.expected_block("none", "layer.weight", 6, 3),
                                      np.asarray([-2/128, -1/128, 0], dtype="<f4"))

    def test_malformed_original_header_and_unaligned_tiles_are_rejected(self):
        session, _ = self.setup_session()
        with self.assertRaisesRegex(ValueError, "whole rows"):
            session.expected_block("plus", "layer.weight", 1, 3)
        bad = pathlib.Path(self.tmp.name) / "bad.safetensors"
        write_source(bad, [("x.alpha", "F32", [], [1])])
        with self.assertRaisesRegex(ValueError, "orphan"):
            self.oracle.Source({"id": "bad", "path": str(bad), "side": "HIGH"})

    def test_binary_framing_reads_exact_actual_payload_and_rejects_truncation(self):
        header = {"op": "compare", "count": 2}
        raw = json.dumps(header).encode()
        stream = io.BytesIO(struct.pack("<I", len(raw)) + raw + struct.pack("<ff", 1, -2))
        got, payload = self.oracle.read_frame(stream)
        self.assertEqual(got, header)
        self.assertEqual(payload, struct.pack("<ff", 1, -2))
        self.assertIsNone(self.oracle.read_frame(stream))
        with self.assertRaisesRegex(ValueError, "Truncated"):
            self.oracle.read_frame(io.BytesIO(struct.pack("<I", len(raw)) + raw + b"x"))

    def test_cli_framing_and_terminal_incomplete_exit_code(self):
        init = {"op": "init", "sources": [{"id": "s", "path": str(self.path), "side": "HIGH"}],
                "cases": [{"id": "base", "side": "HIGH", "targetsFrom": ["s"], "sources": []}]}
        frames = bytearray()
        for header, payload in [(init, b""), ({"op": "compare", "caseId": "base", "targetKey": "layer.bias", "offset": 0, "count": 3},
                                             struct.pack("<fff", -8/128, -7/128, -6/128)), ({"op": "finalize"}, b"")]:
            raw = json.dumps(header).encode()
            frames.extend(struct.pack("<I", len(raw)) + raw + payload)
        process = subprocess.run([sys.executable, str(HERE / "standalone-reference.py")], input=frames, capture_output=True)
        self.assertEqual(process.returncode, 2, process.stderr.decode())
        results = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(len(results), 3)
        self.assertTrue(results[1]["passed"])
        self.assertFalse(results[2]["passed"])
        self.assertTrue(results[2]["terminal"])
        self.assertEqual(results[2]["cases"][0]["comparedElements"], 3)


if __name__ == "__main__":
    unittest.main()
