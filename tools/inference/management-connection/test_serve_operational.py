import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HOST = HERE / 'serve-operational.py'


class OperationalHostTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(HOST.exists(), 'Operational host entry is not implemented')
        spec = importlib.util.spec_from_file_location('operational_host', HOST)
        self.host = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.host)

    def test_corrected_manifest_is_served_as_the_selected_pair(self):
        site = self.host.CandidateSite(ROOT)
        body, mime = site.content('/assets/text-manifest.json')
        self.assertEqual(hashlib.sha256(body).hexdigest(), '420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405')
        self.assertIn('application/json', mime)
        config = json.loads(site.content('/candidate-config.json')[0])
        self.assertEqual(config['textManifestUrl'], '/assets/text-manifest.json')
        self.assertFalse(config['generationReady'])

    def test_private_and_traversal_paths_are_not_served(self):
        site = self.host.CandidateSite(ROOT)
        for path in ['/.git/config', '/shared/../../.git/config', '/shared/%2e%2e/.git/config', '/assets/model.safetensors', '/fixtures/unknown']:
            with self.subTest(path=path), self.assertRaises(FileNotFoundError):
                site.content(path)

    def test_declared_vae_files_are_size_checked_without_model_export(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            (bundle / 'unit.bin').write_bytes(b'one')
            (bundle / 'manifest.json').write_text(json.dumps({'assets': {'unit': {'file': 'unit.bin', 'bytes': 3}}}))
            site = self.host.CandidateSite(ROOT, vae_bundle=bundle)
            self.assertEqual(site.config['retainedAssets']['vae'][0]['bytes'], 3)
            self.assertEqual(site.config['retainedAssets']['vae'][0]['localPath'], str(bundle / 'unit.bin'))
            (bundle / 'unit.bin').write_bytes(b'too long')
            with self.assertRaisesRegex(ValueError, 'size'):
                self.host.CandidateSite(ROOT, vae_bundle=bundle)

    def test_saved_mean_fixture_is_not_labelled_generated_sample(self):
        site = self.host.CandidateSite(ROOT)
        fixture = next(x for x in site.config['fixtures'] if x['id'] == 'vae-rect-mean')
        self.assertEqual(fixture['kind'], 'raw-posterior-mean')
        self.assertNotIn('実生成', fixture['label'])
        self.assertFalse(site.config['realRawSampleAvailable'])
        body, _ = site.content(fixture['url'])
        self.assertEqual(hashlib.sha256(body).hexdigest(), 'dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612')


if __name__ == '__main__':
    unittest.main()
