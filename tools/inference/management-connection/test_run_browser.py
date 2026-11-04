"""Manifest selection mapping checks; no browser, graph execution or oracle edits."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location('managed_browser', HERE / 'run-browser.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ManifestMapping(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_raw = (ROOT / 'development/inference/codec-marker-handoff/manifests/text/manifest.json').read_bytes()
        evidence = ROOT / 'development/inference/p2-p3-acceptance/plain/evidence'
        cls.plain = json.loads((evidence / 'plain-input.json').read_bytes())
        cls.oracle = json.loads((evidence / 'reference-results.json').read_bytes())
        # This check needs the independently retained reference identity, not
        # the 8 MiB reference payload. Numeric comparison remains the NN job.
        cls.reference_identity = cls.oracle['reference']

    def selection(self):
        candidate = json.loads(self.old_raw)
        for block in candidate['blocks']:
            block['attentionLowering'] = {'mapping-test-only': True, 'index': block['index']}
        return candidate

    def validate(self, candidate, plain=None, oracle=None, old_raw=None):
        return runner.validate_text_manifest_mapping(
            selected_raw=json.dumps(candidate).encode(), original_raw=old_raw or self.old_raw,
            plain=plain or self.plain, oracle=oracle or self.oracle)

    def test_additive_selection_keeps_original_oracle_and_gate(self):
        candidate = self.selection()
        original_plain, original_oracle = copy.deepcopy(self.plain), copy.deepcopy(self.oracle)
        mapping = self.validate(candidate)
        self.assertEqual(mapping['originalSha256'], self.plain['manifestSha256'])
        self.assertEqual(mapping['addedAttentionLoweringBlocks'], list(range(24)))
        self.assertEqual(mapping['gate'], self.oracle['gate'])
        self.assertTrue(mapping['onlyAddedBlockAttentionLowering'])
        self.assertEqual(self.plain, original_plain)
        self.assertEqual(self.oracle, original_oracle)
        self.assertNotEqual(mapping['selectedSha256'], mapping['originalSha256'])

    def test_unchanged_selection_is_allowed(self):
        mapping = runner.validate_text_manifest_mapping(selected_raw=self.old_raw, original_raw=self.old_raw,
                                                       plain=self.plain, oracle=self.oracle)
        self.assertEqual(mapping['addedAttentionLoweringBlocks'], [])
        self.assertEqual(mapping['selectedSha256'], mapping['originalSha256'])

    def test_unrelated_model_tokenizer_gate_and_graph_changes_are_rejected(self):
        for field in ('model', 'tokenizer', 'gate', 'graph'):
            with self.subTest(field=field):
                candidate = self.selection()
                if field == 'model':
                    candidate['modelSha256'] = 'f' * 64
                elif field == 'tokenizer':
                    candidate['tokenizer']['sha256'] = 'f' * 64
                elif field == 'gate':
                    candidate['numericGate']['maxAbsError'] = .01
                else:
                    candidate['blocks'][0]['sha256'] = 'f' * 64
                with self.assertRaisesRegex(ValueError, 'attentionLowering'):
                    self.validate(candidate)

    def test_candidate_cannot_replace_original_sha_or_independent_oracle(self):
        plain = copy.deepcopy(self.plain)
        plain['manifestSha256'] = 'f' * 64
        with self.assertRaisesRegex(ValueError, 'original manifest'):
            self.validate(self.selection(), plain=plain)
        oracle = copy.deepcopy(self.oracle)
        oracle['oracleUsesOnnxOrHike'] = True
        with self.assertRaisesRegex(ValueError, 'independent'):
            self.validate(self.selection(), oracle=oracle)
        oracle = copy.deepcopy(self.oracle)
        oracle['input']['attentionMask'][0] = 0
        with self.assertRaisesRegex(ValueError, 'unchanged oracle input'):
            self.validate(self.selection(), oracle=oracle)


if __name__ == '__main__':
    unittest.main()
