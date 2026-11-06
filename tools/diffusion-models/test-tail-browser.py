"""Fail-closed orchestration admission; no model operator is constructed."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('tail-browser.py')


def harness():
    spec = importlib.util.spec_from_file_location('tail_browser', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TailBrowserAdmission(unittest.TestCase):
    def test_fullprefix_patch_time_bits_are_anchored_without_browser(self):
        module = harness()
        payload, anchors = module.load_capture_inputs('HIGH')
        self.assertEqual(len(payload['fullPrefixArtifact']['arrays']['patchHidden']), 10240)
        self.assertEqual(len(payload['fullPrefixArtifact']['arrays']['timeAct1']), 5120)
        self.assertEqual(payload['fullPrefixReceiptSHA256'], anchors['fullPrefixReceiptSHA256'])
        self.assertNotEqual(anchors['fullPrefixArrayIdentities']['patchHidden'], payload['priorEvidence']['hiddenSHA256'])

    def test_exact_actual_and_independent_composed_tail_inputs_admit(self):
        module = harness()
        payload, anchors = module.load_tail_inputs('LOW', module.ROOT.parent / 'diffusion-private-tail-attention-20261101')
        self.assertEqual(payload['trustedInputs']['attention']['contextSHA256'], anchors['actualContextSHA256'])
        self.assertNotEqual(payload['localTailReference']['inputs']['attention']['sha256'], payload['composedTailReference']['inputs']['attention']['sha256'])
        self.assertTrue(anchors['old98FixedCommitInventoryVerified'])
        self.assertTrue(anchors['actualPriorProducerSourcesUnchanged'])

    def test_private_artifact_refuses_overwrite_and_repository_destination(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.json'
            module.write_new(path, '{"new":true}\n', private=True)
            with self.assertRaises(FileExistsError):
                module.write_new(path, '{}\n', private=True)
            with self.assertRaisesRegex(ValueError, 'outside repository'):
                module.write_new(module.ROOT / 'never-private-test.json', '{}', private=True)

    def test_forged_capture_pass_boolean_or_threshold_is_rejected(self):
        module = harness()
        receipt = json.loads((module.OUTPUT / 'high-attention-capture.json').read_bytes())
        receipt['headComparisons']['context-local']['gate']['abs'] = 1000
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'high-attention-capture.json').write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, 'Pinned actual attention capture receipt mismatch'):
                module.load_tail_inputs('HIGH', Path('/nonexistent'), path)

    def test_forged_reference_bytes_fail_before_parsing(self):
        module = harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'forged.json'
            path.write_text('{"gates":{"abs":1000}}')
            with self.assertRaisesRegex(ValueError, 'Anchored artifact/reference mismatch'):
                module.read_anchored(path, '0' * 64)


if __name__ == '__main__':
    unittest.main()
