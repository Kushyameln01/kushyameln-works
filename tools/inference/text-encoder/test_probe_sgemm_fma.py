"""NN0 guards for reusing the historical block19 reference with restored bytes."""
import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


class FmaReferenceBridge(unittest.TestCase):
    def target(self):
        path = HERE / 'probe_sgemm_fma.py'
        self.assertTrue(path.exists(), 'Missing one-run block19 FMA probe')
        spec = importlib.util.spec_from_file_location('fma_probe', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def fixture(self, root, module):
        bundle, reference = root / 'bundle', root / 'reference'
        bundle.mkdir(); reference.mkdir()
        digest = lambda raw: hashlib.sha256(raw).hexdigest()
        graph = b'opaque existing graph'
        (bundle / 'block-19.onnx').write_bytes(graph)
        pins = copy.deepcopy(module.PINS)
        pins.update(graphBytes=len(graph), graphSha256=digest(graph))
        records = {}
        for name, raw, size_key, hash_key in [
            ('source-hidden-18.f32', b'input tensor', 'tensorBytes', 'inputSha256'),
            ('source-hidden-19.f32', b'source tensor', 'sourceBytes', 'sourceSha256'),
            ('final-norm.f32', b'norm weight', 'normBytes', 'normSha256'),
            ('source-norm-rows-19.f32', b'rows', 'rowsBytes', 'rowsSha256'),
        ]:
            (reference / name).write_bytes(raw)
            pins[size_key], pins[hash_key] = len(raw), digest(raw)
            records[name] = {'bytes': len(raw), 'sha256': digest(raw)}
        manifest = {'modelSha256': module.MODEL, 'blocks': [{'index': i, 'path': f'block-{i:02}.onnx', 'bytes': len(graph), 'sha256': digest(graph)} for i in range(24)], 'finalNorm': {'sha256': pins['normSha256'], 'epsilon': 1e-6}}
        raw = json.dumps(manifest).encode(); (bundle / 'manifest.json').write_bytes(raw)
        pins['manifestSha256'] = digest(raw)
        inp = {'id': 'id-l512-all-active', 'shape': [1,512,4096], 'attentionMask': [1]*512, 'tokenIds': [0]*512, 'manifestSha256': pins['manifestSha256']}
        layers = [{'index': i, 'hiddenSha256': pins['inputSha256'] if i == 18 else pins['sourceSha256'], 'matchesOriginalOracle': True} for i in range(24)]
        source = {'passed': True, 'allLayerDigestsMatchOriginalOracle': True, 'sourceFinalMatchesOriginalOracle': True, 'originalOracleExecutionSha': module.ORACLE, 'executionSourceSha': 'b'*40, 'selectedNormRows': [0,1,255,511], 'manifest': {'sha256': pins['manifestSha256']}, 'input': inp, 'files': records, 'layers': layers}
        native_layers = [{'index': i} for i in range(24)]
        native_layers[19] = {'index': 19, 'graphSha256': pins['graphSha256'], 'input': {'sourceSha256': pins['inputSha256']}, 'output': {'sourceSha256': pins['sourceSha256'], 'localSha256': pins['allLocalSha256']}, 'raw': {'local': {'allValuesCompared': True}}, 'weightedNorm': {'local': {'allValuesCompared': True}}}
        old = {'passed': True, 'preservedCanaryReproducedBitwise': True, 'finalFixedGatePassed': False, 'originalOracleExecutionSha': module.ORACLE, 'executionSourceSha': 'c'*40, 'sourceCheckpointExecutionSha': 'a'*40, 'manifest': source['manifest'], 'input': copy.deepcopy(inp), 'native': {'options': module.OPTIONS, 'layers': native_layers}}
        (reference / 'trace-source-results.json').write_text(json.dumps(source))
        historical = root / 'old-native.json';historical.write_text(json.dumps(old))
        return bundle, reference, historical, pins, source, old

    def test_new_source_execution_is_bridged_by_exact_bytes_without_relabelling_old_receipt(self):
        target = self.target()
        with tempfile.TemporaryDirectory() as folder:
            b,r,h,pins,source,old = self.fixture(Path(folder),target)
            original = h.read_bytes()
            with patch.dict(target.PINS,pins,clear=True): result = target.select_reference(b,r,h)
            self.assertEqual(result['sourceBridge']['historicalCheckpointExecutionSha'], 'a'*40)
            self.assertEqual(result['sourceBridge']['restoredCheckpointExecutionSha'], 'b'*40)
            self.assertFalse(result['sourceBridge']['sameExecutionSource'])
            self.assertTrue(result['sourceBridge']['selectedTensorBytesMatch'])
            self.assertEqual(h.read_bytes(),original)

    def test_changed_checkpoint_or_historical_graph_hash_is_rejected(self):
        target = self.target()
        for tamper in ['input', 'graph']:
            with self.subTest(tamper=tamper), tempfile.TemporaryDirectory() as folder:
                b,r,h,pins,source,old = self.fixture(Path(folder),target)
                if tamper == 'input': (r/'source-hidden-18.f32').write_bytes(b'other tensor')
                else:
                    old['native']['layers'][19]['graphSha256'] = '0'*64;h.write_text(json.dumps(old))
                with patch.dict(target.PINS,pins,clear=True), self.assertRaises(ValueError):target.select_reference(b,r,h)


if __name__ == '__main__':unittest.main()
