import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT/relative)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
c = load('nested_evidence_emitter', 'tools/vr180/cloud-validate.py')
r = load('nested_evidence_receiver', 'tools/vr180/recover-log-evidence.py')

class NestedManifestTests(unittest.TestCase):
    def test_original_nested_manifest_and_empty_log_survive_complete_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); source = base/'source'; nested = source/'producer/calibration'; nested.mkdir(parents=True)
            original = b'{ "originalManifest": true, "literal": "raw bytes" }\n'
            (nested/'manifest.json').write_bytes(original); (nested/'empty.stderr.log').write_bytes(b'')
            result = {'runId': 'nested-manifest-test', 'status': 'PASS'}
            (source/'run.json').write_text(json.dumps(result))
            log = io.StringIO()
            with contextlib.redirect_stdout(log):
                self.assertTrue(c.emit_evidence(source, result))
            text = log.getvalue()
            transport = {'begin': json.loads(re.search(r'VR180_EVIDENCE_BEGIN (.*)', text)[1]),
                         'end': json.loads(re.search(r'VR180_EVIDENCE_END (.*)', text)[1]),
                         'chunks': [{'index': int(i), 'total': int(n), 'data': data} for i,n,data in
                                    re.findall(r'VR180_EVIDENCE_CHUNK (\d+)/(\d+) ([A-Za-z0-9+/=]+)', text)]}
            path = base/'transport.json'; path.write_text(json.dumps(transport))
            self.assertEqual(r.recover(path, base/'recovered')['status'], 'BYTES_VERIFIED')
            self.assertEqual((base/'recovered/producer/calibration/manifest.json').read_bytes(), original)
            self.assertEqual((base/'recovered/producer/calibration/empty.stderr.log').read_bytes(), b'')
            manifest = json.loads((base/'recovered/manifest.json').read_text())
            row = next(x for x in manifest['files'] if x['name'] == 'producer/calibration/manifest.json')
            self.assertEqual(row['sha256'], hashlib.sha256(original).hexdigest())
            self.assertNotIn('manifest.json', [x['name'] for x in manifest['files']])

if __name__ == '__main__': unittest.main()
