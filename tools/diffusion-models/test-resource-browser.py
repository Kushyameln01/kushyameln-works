"""Admission tests run before any browser/model operator is constructed."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name('resource-browser.py')


class ResourceBrowserAdmission(unittest.TestCase):
    def harness(self):
        self.assertTrue(SCRIPT.exists(), 'Anchored resource-browser admission is required')
        spec = importlib.util.spec_from_file_location('resource_browser', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_exact_private_references_admit_without_starting_browser(self):
        module = self.harness()
        payload, anchors = module.load_inputs(ROOT, 'LOW')
        self.assertEqual(payload['prefixReference']['meta']['side'], 'LOW')
        self.assertEqual(payload['localReference']['mode'], 'LOCAL_ACTUAL_HIDDEN')
        self.assertTrue(anchors['runtimeInventoryVerified'])
        self.assertEqual(anchors['fixedRuntimeCommit'], module.RUNTIME_COMMIT)

    def test_rewritten_private_reference_is_rejected_before_browser(self):
        module = self.harness()
        source = Path('/workspace/work/diffusion-private-heads/low-local-binding-final-reference.json')
        forged = json.loads(source.read_text())
        forged['gates']['allHeadContext']['abs'] = 1000
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'forged.json'
            path.write_text(json.dumps(forged))
            with self.assertRaisesRegex(ValueError, 'Private reference hash mismatch'):
                module.load_inputs(ROOT, 'LOW', local_path=path)

    def test_private_artifact_output_refuses_overwrite(self):
        module = self.harness()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.json'
            module.write_new_private(path, '{"fresh":true}\n')
            with self.assertRaises(FileExistsError):
                module.write_new_private(path, '{}\n')
            self.assertEqual(path.read_text(), '{"fresh":true}\n')


if __name__ == '__main__':
    unittest.main()
