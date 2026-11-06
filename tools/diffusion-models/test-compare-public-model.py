"""Small controlled comparator tests; no model/reference NN or browser execution."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('public_comparator', Path(__file__).with_name('compare-public-model.py'))
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


def identity(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def fixture(mode='predict', values=None):
    data = struct.pack('<128f', *(values if values is not None else [i / 32 for i in range(128)]))
    ident = identity(data)
    models = {side: {'previouslyVerifiedSHA256': ('a' if side == 'HIGH' else 'b') * 64,
                     'headerSHA256': ('c' if side == 'HIGH' else 'd') * 64} for side in ['HIGH', 'LOW']}
    contract = {'status': 'PRE_EXECUTION_GATE_FIXED', 'gateMayNotBeRelaxedAfterComparison': True,
                'gate': dict(C.GATE), 'profileId': 'controlled-test-only', 'manifestSHA256': 'e' * 64,
                'textRows': 512, 'totalTokens': 5, 'models': models}
    raw = json.dumps(contract).encode()
    descriptor = {'shape': [1, 16, 1, 2, 4], 'path': 'expected.f32', **ident}
    reference = {'schemaVersion': 'bernini-production-independent-reference/1', 'operation': 'sample',
                 'actualNativeOutputsUsedAsNumericInput': False, 'contractSHA256': identity(raw)['sha256'],
                 'gate': dict(C.GATE), 'manifestSHA256': 'e' * 64, 'profileId': 'controlled-test-only', 'allTextRows': 512,
                 'metrics': [{'side': side, 'totalTokens': 5} for side in ['HIGH'] * 3 + ['LOW'] * 3],
                 'arrays': {'velocity00': descriptor, 'finalRaw': copy.deepcopy(descriptor)}}
    text = {'shape': [1, 512, 4096], 'modelSha256': C.TEXT_MODEL, 'tokenizerSha256': C.TOKENIZER,
            'normalization': 'umt5-final-rmsnorm-f32-v1', 'payloadSHA256': 'f' * 64, 'maskSHA256': '0' * 64}
    inputs = {branch: {'bytes': 8388608, 'sha256': 'f' * 64, 'mask': {'bytes': 512, 'sha256': '0' * 64}} for branch in ['positive', 'negative']}
    metadata = {'dtype': 'float32', 'layout': 'NCTHW', 'shape': [1, 16, 1, 2, 4],
                'meaning': 'bernini-flow-velocity:v1', 'modelSha256': 'a' * 64}
    if mode == 'sample':
        metadata = {key: value for key, value in metadata.items() if key != 'modelSha256'}
        metadata.update(meaning='wan21-raw-generated-sample:v1', latentContract={
            'schemaVersion': 1, 'representation': 'generated-sample', 'space': 'raw',
            'vaeModelSha256': C.VAE, 'producerModelSha256s': ['a' * 64, 'b' * 64],
            'normalization': {'id': 'wan21-comfy-f32-v1', 'state': 'restored', 'owner': 'diffusion_models'}})
    public = {'mode': mode, 'side': 'HIGH', 'timestep': 1000, 'sourceCommit': '1' * 40,
              'publicWorkerConnected': True, 'outcome': 'completed', 'error': None,
              'codecScope': 'Actual normal ' + mode + ' output',
              'execution': {'operation': mode, 'publicWorkerConnected': True},
              'callerInputsBitExact': True, 'inputIdentitiesBefore': inputs, 'inputIdentitiesAfter': copy.deepcopy(inputs),
              'profileId': 'controlled-test-only', 'loaded': {'models': {side: {'side': side,
                  'modelSha256': value['previouslyVerifiedSHA256'], 'headerSHA256': value['headerSHA256']} for side, value in models.items()}},
              'tensorMetadata': metadata, 'outputIdentity': ident,
              'readback': {'realDiskFileSelected': True, 'allF32BitsExact': True, 'payloadElements': 128, 'payload': ident}}
    native = {'schemaVersion': 'bernini-public-model-worker-host/0.1', 'passed': True,
              'sourceGuardAfter': True, 'sourceGuardError': None, 'hostError': None, 'sourceCommit': '1' * 40,
              'mode': mode, 'side': 'HIGH', 'timestep': 1000, 'publicResult': public,
              'inputReceipt': {'manifestSHA256': 'e' * 64, 'profileId': 'controlled-test-only', 'conditioning': text,
                               'canonicalShape': {'target': {'initialLatentShape': [1, 16, 1, 2, 4]}}},
              'privateOutputs': {'tensor.f32': ident}}
    return native, reference, contract, identity(raw), data


class ComparatorTests(unittest.TestCase):
    def test_complete_predict_reference_does_not_require_six_unrelated_updates(self):
        n,r,c,ident,_=fixture()
        descriptor=r['arrays']['velocity00']
        r.update(operation='predict',arrays={'velocity':descriptor},metrics=[{
            'side':'HIGH','totalTokens':5,'coverage':[
                *[{'block':block,'name':'blockOutput','rows':5,'intervals':[[0,5]]} for block in range(40)],
                {'block':None,'name':'headAll','rows':5,'intervals':[[0,5]]},
                {'block':None,'name':'prediction','rows':32,'intervals':[[0,32]]}]}])
        manifest=json.dumps({'timestep':1000}).encode()
        digest=identity(manifest)['sha256']
        n['inputReceipt']['manifestSHA256']=r['manifestSHA256']=c['manifestSHA256']=digest
        ident=identity(json.dumps(c).encode())
        r['contractSHA256']=ident['sha256']
        self.assertEqual(C.admit(n,r,c,ident,reference_manifest_raw=manifest)['array'],'velocity')
        with self.assertRaises(ValueError):C.admit(n,r,c,ident)
        with self.assertRaises(ValueError):C.admit(n,r,c,ident,reference_manifest_raw=manifest+b' ')
        wrong=json.dumps({'timestep':500}).encode()
        badn,badr,badc=copy.deepcopy((n,r,c))
        badn['inputReceipt']['manifestSHA256']=badr['manifestSHA256']=badc['manifestSHA256']=identity(wrong)['sha256']
        badident=identity(json.dumps(badc).encode());badr['contractSHA256']=badident['sha256']
        with self.assertRaisesRegex(ValueError,'timestep'):
            C.admit(badn,badr,badc,badident,reference_manifest_raw=wrong)
        for name in ['blockOutput','headAll','prediction']:
            incomplete=copy.deepcopy(r)
            incomplete['metrics'][0]['coverage']=[x for x in incomplete['metrics'][0]['coverage'] if not(x['name']==name and (name!='blockOutput' or x['block']==7))]
            with self.subTest(missing=name),self.assertRaises(ValueError):C.admit(n,incomplete,c,ident,reference_manifest_raw=manifest)
        sample=copy.deepcopy(n)
        sample['mode']=sample['publicResult']['mode']='sample'
        with self.assertRaises(ValueError):C.admit(sample,r,c,ident,reference_manifest_raw=manifest)

    def test_full_shape_high_first_velocity_admitted(self):
        n, r, c, ident, _ = fixture()
        admitted = C.admit(n, r, c, ident)
        self.assertEqual(admitted['array'], 'velocity00')
        self.assertEqual(admitted['elements'], 128)

    def test_raw_sample_contract_admitted(self):
        n, r, c, ident, _ = fixture('sample')
        self.assertEqual(C.admit(n, r, c, ident)['array'], 'finalRaw')

    def test_smoke_diagnostic_and_wrong_source_refused(self):
        for mutate in [lambda n: n.update(mode='smoke'),
                       lambda n: n.update(sourceGuardAfter=False),
                       lambda n: n.update(sourceCommit='7cf'),
                       lambda n: n['publicResult'].update(codecScope='Saved input only'),
                       lambda n: n['publicResult']['execution'].update(operation='diagnose'),
                       lambda n: n.update(side='LOW')]:
            n, r, c, ident, _ = fixture()
            mutate(n)
            with self.assertRaises(ValueError):
                C.admit(n, r, c, ident)

    def test_shape_tensor_meaning_and_text_population_refused(self):
        for mutate in [lambda n: n['publicResult']['tensorMetadata'].update(shape=[1, 16, 2, 1, 4]),
                       lambda n: n['publicResult']['tensorMetadata'].update(meaning='raw-posterior-mean'),
                       lambda n: n['inputReceipt']['conditioning'].update(shape=[1, 3, 4096]),
                       lambda n: n['publicResult']['inputIdentitiesBefore']['positive'].update(bytes=3 * 4096 * 4)]:
            n, r, c, ident, _ = fixture()
            mutate(n)
            with self.assertRaises(ValueError):
                C.admit(n, r, c, ident)

    def test_gate_contract_manifest_and_reference_extent_refused(self):
        for mutate in [lambda r: r.update(gate={'abs': 1, 'rel': 1}),
                       lambda r: r.update(contractSHA256='f' * 64),
                       lambda r: r.update(manifestSHA256='f' * 64),
                       lambda r: r['arrays']['velocity00'].update(shape=[1, 16, 1, 4, 2]),
                       lambda r: r.update(allTextRows=3)]:
            n, r, c, ident, _ = fixture()
            mutate(r)
            with self.assertRaises(ValueError):
                C.admit(n, r, c, ident)

    def test_all_values_compared_and_nonfinite_is_failure(self):
        n, r, c, ident, data = fixture()
        admitted = C.admit(n, r, c, ident)
        with tempfile.TemporaryDirectory() as directory:
            a, b = [Path(directory) / name for name in ['actual.f32', 'expected.f32']]
            a.write_bytes(data);b.write_bytes(data)
            result = C.compare_files(a, b, admitted)
            self.assertEqual(result['elements'], 128)
            self.assertTrue(result['allF32BitsExact'])
            values = list(struct.unpack('<128f', data));values[0] = float('nan');values[-1] += 1
            changed = struct.pack('<128f', *values);a.write_bytes(changed)
            admitted['actual'] = identity(changed)
            result = C.compare_files(a, b, admitted)
            self.assertEqual(result['failedElements'], 2)
            self.assertEqual(result['nonfiniteActual'], 1)
            self.assertEqual(result['firstFailureIndex'], 0)
            self.assertGreater(result['maxNormalizedGateError'], 1)
            self.assertNotIn('values', result)

    def test_hash_mismatch_fails_before_numeric_comparison(self):
        n, r, c, ident, data = fixture()
        admitted = C.admit(n, r, c, ident)
        with tempfile.TemporaryDirectory() as directory:
            a, b = [Path(directory) / name for name in ['actual.f32', 'expected.f32']]
            a.write_bytes(data);b.write_bytes(data[:-4] + b'\x00' * 4)
            with self.assertRaisesRegex(ValueError, 'Expected F32 bytes/SHA256'):
                C.compare_files(a, b, admitted)


if __name__ == '__main__':
    unittest.main()
