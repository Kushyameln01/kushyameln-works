"""Receipt-plan compatibility tests use tiny metadata fixtures, never model data."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import reference_contract as contract
from stream_reference import load_plan, frame_contract


def raw(value):
    return (json.dumps(value, indent=2) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


class ReferenceContractTests(unittest.TestCase):
    def setUp(self):
        self.current = load_plan()
        self.historical = copy.deepcopy(self.current)
        self.historical['cases'] = [case for case in self.historical['cases'] if case['id'] != 'diagnostic-f5-16x32']
        self.revision = 'a' * 40
        self.tool = b'committed native reference tool bytes'
        self.derive_tool = b'committed coordinate derivation tool bytes'

    def case(self, identifier):
        return copy.deepcopy(next(case for case in self.current['cases'] if case['id'] == identifier))

    def committed(self, revision, relative):
        self.assertEqual(revision, self.revision)
        return {contract.PLAN_RELATIVE: raw(self.historical),
                contract.NATIVE_TOOL_RELATIVE: self.tool,
                contract.DERIVATION_TOOL_RELATIVE: self.derive_tool}[relative]

    def native(self, identifier):
        case = self.case(identifier)
        report = {'status': 'REFERENCE_WRITTEN', 'case': case, 'executionSourceSha': self.revision,
                  'referenceToolSha256': digest(self.tool),
                  'predeclaredPlan': {'sha256': digest(raw(self.historical)), 'bytes': len(raw(self.historical))},
                  'comparisonGate': copy.deepcopy(self.current['comparisonGate']),
                  'model': {'sha256': contract.MODEL_SHA256, 'verified': True,
                            'storedDtype': 'bfloat16', 'executionDtype': 'float32'},
                  'source': {'sha256': contract.SOURCE_SHA256, 'commit': contract.SOURCE_COMMIT, 'verified': True},
                  'strictLoad': {'keys': 194, 'missing': [], 'unexpected': []},
                  'frameContract': frame_contract(case['rgbShape'][2]), 'references': {}, 'operations': {}}
        for operation in ['encode', 'decode']:
            source = case['rgbShape'] if operation == 'encode' else case['latentShape']
            target = case['latentShape'] if operation == 'encode' else case['decodeRgbShape']
            input_origin = 'SYNTHETIC_DECLARED_RGB_INPUT' if operation == 'encode' else 'RAW_LATENT_DECLARED_NORMAL_INPUT'
            def record(kind, shape, provenance):
                import math
                return {'file': operation + '-' + kind + '.f32', 'shape': shape,
                        'dtype': 'float32', 'layout': 'NCTHW', 'byteOrder': 'little',
                        'bytes': math.prod(shape) * 4, 'sha256': ('b' if kind == 'input' else 'c') * 64,
                        'finite': True, 'complete': True, 'provenance': provenance}
            report['references'][operation] = {'input': record('input', source, input_origin),
                'output': record('output', target, 'INDEPENDENT_UNCHANGED_WAN21_SOURCE')}
            report['operations'][operation] = {'status': 'REFERENCE_WRITTEN', 'rawScale': [0., 1.],
                'inputShape': source, 'outputShape': target, 'allValuesPreserved': True}
        return report

    def test_historical_committed_plan_allows_an_unrelated_appended_case(self):
        report = self.native('source-f1-480x832')
        with patch.object(contract, '_committed_bytes', side_effect=self.committed):
            checked = contract.validate_native_reference_plan(report, current_plan=self.current)
        self.assertNotEqual(digest(raw(self.current)), report['predeclaredPlan']['sha256'])
        self.assertEqual(checked['caseId'], 'source-f1-480x832')
        self.assertTrue(checked['selectedCaseSemanticsUnchanged'])

    def test_gate_pattern_selected_case_and_source_changes_are_rejected(self):
        changes = [('comparisonGate', lambda plan: plan['comparisonGate'].update(atol=.1)),
                   ('encodeInput', lambda plan: plan['encodeInput'].update(pattern='different')),
                   ('cases', lambda plan: plan['cases'][1].update(rgbShape=[1, 3, 5, 480, 832])),
                   ('source', lambda plan: plan['source'].update(sha256='0' * 64)),
                   ('temporalContract', lambda plan: plan['temporalContract'].update(latentFrames='ceil(F/4)')),
                   ('comparisonPolicy', lambda plan: plan.update(comparisonPolicy='sample some pixels'))]
        for name, change in changes:
            with self.subTest(field=name):
                self.historical = copy.deepcopy(self.current)
                change(self.historical)
                report = self.native('source-f1-480x832')
                with patch.object(contract, '_committed_bytes', side_effect=self.committed):
                    with self.assertRaises(ValueError):
                        contract.validate_native_reference_plan(report, current_plan=self.current)

    def test_fake_plan_or_tool_hash_and_optional_byte_count_are_rejected(self):
        for field in ['plan-hash', 'tool-hash', 'plan-bytes']:
            report = self.native('source-f1-480x832')
            if field == 'plan-hash': report['predeclaredPlan']['sha256'] = '0' * 64
            if field == 'tool-hash': report['referenceToolSha256'] = '0' * 64
            if field == 'plan-bytes': report['predeclaredPlan']['bytes'] += 1
            with patch.object(contract, '_committed_bytes', side_effect=self.committed):
                with self.assertRaises(ValueError):
                    contract.validate_native_reference_plan(report, current_plan=self.current)
        with patch.object(contract, '_committed_bytes', side_effect=ValueError('uncommitted/fake revision')):
            with self.assertRaises(ValueError):
                contract.validate_native_reference_plan(self.native('source-f1-480x832'), current_plan=self.current)

    def derived(self, directory):
        parent, direct = self.native('target-f81-480x832'), self.native('source-f1-480x832')
        case = self.case('source-f80-480x832')
        result = {'status': contract.DERIVED_STATUS, 'case': case, 'executionSourceSha': self.revision,
                  'derivationToolSha256': digest(self.derive_tool),
                  'predeclaredPlan': {'sha256': digest(raw(self.historical))},
                  'comparisonGate': copy.deepcopy(self.current['comparisonGate']),
                  'frameContract': frame_contract(80), 'newNNRuns': 0, 'newModelLoads': 0,
                  'nativeExecutionPerformed': False, 'errors': [], 'parentStrictLoad': parent['strictLoad'],
                  'model': {'sha256': contract.MODEL_SHA256, 'storedDtype': 'bfloat16', 'executionDtype': 'float32'},
                  'source': {'sha256': contract.SOURCE_SHA256, 'commit': contract.SOURCE_COMMIT},
                  'causalEvidence': {'sourceSha256': contract.SOURCE_SHA256, 'spatialReuse': False},
                  'references': {}, 'operations': {}, 'directF1AllValueBridge': {}, 'inputPatternChecks': {'parent': {}, 'directF1': {}}}
        for key, filename, native in [('parentReport', 'parent-native-report.json', parent),
                                      ('directF1Report', 'direct-f1-native-report.json', direct)]:
            content = raw(native);(directory / filename).write_bytes(content)
            result[key] = {'snapshotFile': filename, 'sha256': digest(content), 'executionSourceSha': self.revision}
        for operation in ['encode', 'decode']:
            shapes = [case['rgbShape'], case['latentShape']] if operation == 'encode' else [case['latentShape'], case['decodeRgbShape']]
            result['references'][operation] = {}
            result['directF1AllValueBridge'][operation] = {}
            for kind, shape in zip(['input', 'output'], shapes):
                base = parent['references'][operation][kind]
                record = copy.deepcopy(base);record.update(shape=shape, bytes=contract._elements(shape) * 4,
                    parent={'reportSha256': result['parentReport']['sha256'], 'file': base['file'], 'sha256': base['sha256'], 'shape': base['shape']},
                    derivation={'axis': 2, 'selection': [0, shape[2]], 'sourceShape': base['shape'],
                                'targetShape': shape, 'channels': contract._axis2_ranges(base['shape'], shape)})
                if kind == 'output':record['provenance'] = 'DERIVED_CAUSAL_PREFIX_OF_INDEPENDENT_UNCHANGED_WAN21_SOURCE'
                result['references'][operation][kind] = record
                short = direct['references'][operation][kind]
                gate = {'atol': 0., 'rtol': 0., 'maxAbs': 0.} if kind == 'input' else copy.deepcopy(contract.COMPARISON_GATE)
                result['directF1AllValueBridge'][operation][kind] = {'passed': True, 'allValuesCompared': True,
                    'allFinite': True, 'elements': contract._elements(short['shape']), 'axis': 2,
                    'parentShape': base['shape'], 'directShape': short['shape'], 'gate': gate,
                    'maxAbs': 0., 'rmse': 0., 'failedAllcloseElements': 0, 'firstFailedElement': None}
            result['operations'][operation] = {'status': contract.DERIVED_STATUS, 'nativeExecutionPerformed': False,
                'inputShape': shapes[0], 'outputShape': shapes[1], 'rawScale': [0., 1.],
                'allCaseValuesPreserved': True, 'parentNativeOperation': parent['operations'][operation]}
            for label, native in [('parent', parent), ('directF1', direct)]:
                source = native['references'][operation]['input']
                declaration = self.current['encodeInput'] if operation == 'encode' else self.current['decodeInput']
                result['inputPatternChecks'][label][operation] = {'pattern': declaration['pattern'],
                    'shape': source['shape'], 'expectedSha256': source['sha256'], 'allInputValuesBoundBySha256': True}
        return result

    def test_derived_status_chain_shapes_and_bridge_are_preserved(self):
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch);report = self.derived(path)
            with patch.object(contract, '_committed_bytes', side_effect=self.committed):
                checked = contract.validate_derived_reference_plan(report, path, current_plan=self.current)
            self.assertEqual(checked['status'], contract.DERIVED_STATUS)
            self.assertFalse(checked['nativeExecutionPerformed'])
            self.assertEqual(report['references']['encode']['input']['shape'][2], 80)

    def test_tampered_snapshot_failed_bridge_wrong_axis_and_fake_native_claim_fail(self):
        for field in ['snapshot', 'bridge', 'axis', 'native-claim']:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as scratch:
                path = Path(scratch);report = self.derived(path)
                if field == 'snapshot': (path / 'parent-native-report.json').write_text('{}')
                if field == 'bridge': report['directF1AllValueBridge']['decode']['output']['passed'] = False
                if field == 'axis': report['references']['encode']['input']['derivation']['axis'] = 0
                if field == 'native-claim': report['nativeExecutionPerformed'] = True
                with patch.object(contract, '_committed_bytes', side_effect=self.committed):
                    with self.assertRaises(ValueError):
                        contract.validate_derived_reference_plan(report, path, current_plan=self.current)


if __name__ == '__main__':
    unittest.main()
