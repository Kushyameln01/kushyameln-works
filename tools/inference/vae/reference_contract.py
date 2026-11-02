"""Committed diagnostic reference-plan/receipt contracts; no tensor/model loads.

Historical plan bytes identify what was predeclared for an original source run.
Compatibility compares the selected case and shared numerical semantics, rather
than requiring a later plan containing additional cases to have identical bytes.
Tensor file byte/hash checks remain the acceptance caller's responsibility.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess

from stream_reference import (COMPARISON_GATE, MODEL_SHA256, SOURCE_SHA256, SOURCE_COMMIT,
                              PLAN_PATH, frame_contract, load_plan)

REPO = Path(__file__).resolve().parents[3]
PLAN_RELATIVE = 'development/inference/standalone-20261102/vae/predeclared-plan.json'
NATIVE_TOOL_RELATIVE = 'tools/inference/vae/stream_reference.py'
DERIVATION_TOOL_RELATIVE = 'tools/inference/vae/derive_stream_prefix.py'
CONTRACT_RELATIVE = 'tools/inference/vae/reference_contract.py'
DERIVED_STATUS = 'DERIVED_CAUSAL_PREFIX_REFERENCE'
SEMANTIC_FIELDS = ('schemaVersion', 'shapeAuthority', 'model', 'source', 'comparisonGate',
                   'comparisonPolicy', 'encodeInput', 'encodeOutput', 'decodeInput',
                   'decodeOutput', 'temporalContract')
PATTERNS = {'encode': '((c*71+t*13+y*5+x*3)%257-128)/128',
            'decode': '((c*17+t*11+y*7+x*5)%257-128)/512'}


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _hash(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def _committed_bytes(revision, relative):
    _require(isinstance(revision, str) and re.fullmatch('[0-9a-f]{40}', revision) is not None,
             'A full committed40hex execution revision is required')
    try:
        kind = subprocess.run(['git', 'cat-file', '-t', revision], cwd=REPO,
                              capture_output=True, check=True).stdout.strip()
        _require(kind == b'commit', 'Execution source identity must name a commit')
        return subprocess.run(['git', 'show', revision + ':' + relative], cwd=REPO,
                              capture_output=True, check=True).stdout
    except subprocess.CalledProcessError as error:
        raise ValueError('Committed reference contract/tool bytes are unavailable: ' + relative) from error


def _case(plan, identifier):
    matches = [case for case in plan.get('cases', []) if case.get('id') == identifier]
    _require(len(matches) == 1, 'Selected reference case must occur exactly once in its plan')
    return matches[0]


def _elements(shape):
    _require(isinstance(shape, list) and len(shape) == 5 and shape[0] == 1
             and all(type(value) is int and value > 0 for value in shape),
             'A literal positive N1 C T H W shape is required')
    return math.prod(shape)


def _axis2_ranges(source, target):
    _elements(source); _elements(target)
    _require(all(source[index] == target[index] for index in [0, 1, 3, 4])
             and target[2] <= source[2], 'Reference derivation changes spatial/channel geometry or extends time')
    plane = source[3] * source[4] * 4
    return [{'channel': c, 'sourceOffsetBytes': c * source[2] * plane,
             'targetOffsetBytes': c * target[2] * plane, 'bytes': target[2] * plane}
            for c in range(source[1])]


def _validate_plan(report, current_plan, tool_path, tool_hash_key):
    revision = report.get('executionSourceSha')
    _require(isinstance(revision, str) and re.fullmatch('[0-9a-f]{40}', revision) is not None,
             'Uncommitted/fake reference execution revision')
    plan_record = report.get('predeclaredPlan', {})
    _require(_hash(plan_record.get('sha256')), 'Reference predeclared-plan SHA256 is missing')
    original_bytes = _committed_bytes(revision, PLAN_RELATIVE)
    _require(_sha(original_bytes) == plan_record['sha256'],
             'Reference predeclared-plan SHA256 differs from its committed execution plan')
    if 'bytes' in plan_record:
        _require(type(plan_record['bytes']) is int and plan_record['bytes'] == len(original_bytes),
                 'Reference predeclared-plan byte count differs from committed bytes')
    historical = json.loads(original_bytes)
    current = current_plan if current_plan is not None else load_plan()
    for key in SEMANTIC_FIELDS:
        _require(key in historical and key in current and historical[key] == current[key],
                 'Historical/current numerical reference semantics differ: ' + key)
    _require(current['model']['sha256'] == MODEL_SHA256 and current['model']['keys'] == 194
             and current['model']['strictLoad'] is True
             and current['model']['storedDtype'] == 'bfloat16' and current['model']['executionDtype'] == 'float32',
             'Original model194-key BF16-to-FP32 contract changed')
    _require(current['source']['sha256'] == SOURCE_SHA256 and current['source']['commit'] == SOURCE_COMMIT,
             'Pinned original numerical source changed')
    _require(current['comparisonGate'] == COMPARISON_GATE and report.get('comparisonGate') == COMPARISON_GATE,
             'Reference comparison gate changed')
    _require(current['encodeInput']['pattern'] == PATTERNS['encode']
             and current['decodeInput']['pattern'] == PATTERNS['decode']
             and current['decodeInput']['derivedFromEncode'] is False
             and current['decodeInput']['provenance'] == 'RAW_LATENT_DECLARED_NORMAL_INPUT',
             'Declared input patterns or independent raw decode contract changed')
    identifier = report.get('case', {}).get('id')
    old_case, selected_case = _case(historical, identifier), _case(current, identifier)
    _require(report['case'] == old_case == selected_case,
             'Recorded/historical/current selected-case geometry or semantics changed')
    _require(report.get('frameContract') == frame_contract(selected_case['rgbShape'][2]),
             'Reference literal input/consumed/tail frame contract changed')
    tool_bytes = _committed_bytes(revision, tool_path)
    _require(_hash(report.get(tool_hash_key)) and _sha(tool_bytes) == report[tool_hash_key],
             'Reference tool SHA256 differs from the committed execution tool')
    return historical, current, {'caseId': identifier, 'executionSourceSha': revision,
        'historicalPlanSha256': plan_record['sha256'], 'historicalPlanBytes': len(original_bytes),
        'currentPlanSha256': _sha(PLAN_PATH.read_bytes()) if current_plan is None else _sha(json.dumps(current, sort_keys=True).encode()),
        'currentPlanHashEncoding': 'exact current file bytes' if current_plan is None else 'canonical sorted-key JSON override',
        'toolPath': tool_path, 'toolSha256': report[tool_hash_key],
        'selectedCaseSemanticsUnchanged': True, 'semanticFieldsChecked': list(SEMANTIC_FIELDS),
        'scope': 'Committed historical plan and selected-case/shared numerical semantics; unrelated additional case entries do not invalidate this reference'}


def validate_native_reference_plan(report, *, current_plan=None):
    """Verify the original committed plan/tool, allowing unrelated case additions."""
    _require(report.get('status') == 'REFERENCE_WRITTEN', 'A completed direct native source reference is required')
    _, _, checked = _validate_plan(report, current_plan, NATIVE_TOOL_RELATIVE, 'referenceToolSha256')
    model, source = report.get('model', {}), report.get('source', {})
    _require(model.get('sha256') == MODEL_SHA256 and model.get('verified') is True
             and model.get('storedDtype') == 'bfloat16' and model.get('executionDtype') == 'float32',
             'Native source model identity/precision verification differs')
    _require(source.get('sha256') == SOURCE_SHA256 and source.get('commit') == SOURCE_COMMIT
             and source.get('verified') is True, 'Native source identity verification differs')
    _require(report.get('strictLoad') == {'keys': 194, 'missing': [], 'unexpected': []},
             'Native source did not strictly load all194 original keys')
    checked.update(status='REFERENCE_WRITTEN', nativeExecutionPerformed=True)
    return checked


def _snapshot(directory, report, key, filename):
    record = report.get(key, {})
    _require(record.get('snapshotFile') == filename and _hash(record.get('sha256')),
             'Derived receipt has an invalid pinned native snapshot: ' + key)
    content = (Path(directory) / filename).read_bytes()
    _require(_sha(content) == record['sha256'], 'Included native snapshot SHA256 mismatch: ' + key)
    native = json.loads(content)
    _require(record.get('executionSourceSha') == native.get('executionSourceSha'),
             'Included native snapshot execution revision differs from its pin')
    return native


def _record(record, shape):
    _require(record.get('shape') == shape and record.get('dtype') == 'float32'
             and record.get('layout') == 'NCTHW' and record.get('byteOrder') == 'little'
             and record.get('bytes') == _elements(shape) * 4 and _hash(record.get('sha256'))
             and record.get('finite') is True and record.get('complete') is True,
             'Derived/native reference tensor metadata differs from its exact shape')


def _operation_shapes(case, operation):
    return (case['rgbShape'], case['latentShape']) if operation == 'encode' else (case['latentShape'], case['decodeRgbShape'])


def validate_derived_reference_plan(report, reference_dir, *, operations=None, current_plan=None):
    """Validate an honest derived receipt and its included committed native chain.

    This validates metadata/provenance, not tensor file contents or a new NN run.
    Acceptance must still verify every selected child file hash and compare all
    produced WASM values against those files under the unchanged gate.
    """
    _require(report.get('status') == DERIVED_STATUS, 'Expected an honestly labelled derived causal-prefix reference')
    _, current, checked = _validate_plan(report, current_plan, DERIVATION_TOOL_RELATIVE, 'derivationToolSha256')
    if 'referenceContractSha256' in report:
        _require(_hash(report['referenceContractSha256']) and
                 _sha(_committed_bytes(report['executionSourceSha'], CONTRACT_RELATIVE)) == report['referenceContractSha256'],
                 'Derived reference-contract helper differs from its committed execution bytes')
    _require(report.get('nativeExecutionPerformed') is False and type(report.get('newNNRuns')) is int
             and report['newNNRuns'] == 0 and type(report.get('newModelLoads')) is int
             and report['newModelLoads'] == 0 and not report.get('errors'),
             'Derived receipt falsely claims or records a new native/model execution')
    case = report['case']
    _require(case.get('role') == 'source' and case['rgbShape'][-2:] == [480, 832],
             'Causal prefix reuse is restricted to identical480x832 source geometry')
    _require(report.get('model', {}).get('sha256') == MODEL_SHA256
             and report['model'].get('storedDtype') == 'bfloat16'
             and report['model'].get('executionDtype') == 'float32'
             and report.get('source', {}).get('sha256') == SOURCE_SHA256
             and report['source'].get('commit') == SOURCE_COMMIT,
             'Derived original source/model identity differs')
    causal = report.get('causalEvidence', {})
    _require(causal.get('sourceSha256') == SOURCE_SHA256 and causal.get('spatialReuse') is False,
             'Derived causal evidence does not bind the same source/spatial geometry')
    parent = _snapshot(reference_dir, report, 'parentReport', 'parent-native-report.json')
    direct = _snapshot(reference_dir, report, 'directF1Report', 'direct-f1-native-report.json')
    parent_checked = validate_native_reference_plan(parent, current_plan=current_plan)
    direct_checked = validate_native_reference_plan(direct, current_plan=current_plan)
    _require(parent['case']['id'] == 'target-f81-480x832' and direct['case']['id'] == 'source-f1-480x832',
             'Derived native chain must be target81 plus independent direct F1')
    _require(report.get('parentStrictLoad') == parent['strictLoad'], 'Derived receipt changed inherited native strict-load evidence')
    available = list(report.get('operations', {}))
    _require(bool(available) and set(available) <= {'encode', 'decode'} and
             (operations is None or set(operations) <= set(available)), 'Selected derived operations are unavailable')
    for operation in available:
        shapes = _operation_shapes(case, operation)
        native = parent.get('operations', {}).get(operation, {})
        direct_operation = direct.get('operations', {}).get(operation, {})
        child_operation = report['operations'][operation]
        _require(native.get('status') == 'REFERENCE_WRITTEN' and direct_operation.get('status') == 'REFERENCE_WRITTEN'
                 and native.get('rawScale') == [0., 1.] and direct_operation.get('rawScale') == [0., 1.]
                 and native.get('inputShape') == _operation_shapes(parent['case'], operation)[0]
                 and native.get('outputShape') == _operation_shapes(parent['case'], operation)[1]
                 and direct_operation.get('inputShape') == _operation_shapes(direct['case'], operation)[0]
                 and direct_operation.get('outputShape') == _operation_shapes(direct['case'], operation)[1]
                 and native.get('allValuesPreserved') is True and direct_operation.get('allValuesPreserved') is True,
                 'Derived parent/direct operation is not an independent raw-scale native reference')
        _require(child_operation.get('status') == DERIVED_STATUS
                 and child_operation.get('nativeExecutionPerformed') is False
                 and child_operation.get('inputShape') == shapes[0] and child_operation.get('outputShape') == shapes[1]
                 and child_operation.get('rawScale') == [0., 1.]
                 and child_operation.get('allCaseValuesPreserved') is True
                 and child_operation.get('parentNativeOperation') == native,
                 'Derived operation status/shapes/native provenance differs')
        for index, kind in enumerate(('input', 'output')):
            child = report.get('references', {}).get(operation, {}).get(kind, {})
            base = parent.get('references', {}).get(operation, {}).get(kind, {})
            short = direct.get('references', {}).get(operation, {}).get(kind, {})
            _record(child, shapes[index])
            _record(base, _operation_shapes(parent['case'], operation)[index])
            _record(short, _operation_shapes(direct['case'], operation)[index])
            expected_origin = ('SYNTHETIC_DECLARED_RGB_INPUT' if operation == 'encode' else 'RAW_LATENT_DECLARED_NORMAL_INPUT') if kind == 'input' else 'DERIVED_CAUSAL_PREFIX_OF_INDEPENDENT_UNCHANGED_WAN21_SOURCE'
            _require(child.get('provenance') == expected_origin, 'Derived input/output provenance differs')
            original_origin = expected_origin if kind == 'input' else 'INDEPENDENT_UNCHANGED_WAN21_SOURCE'
            _require(base.get('provenance') == original_origin and short.get('provenance') == original_origin,
                     'Included native input/output provenance is not independent original source')
            _require(child.get('parent') == {'reportSha256': report['parentReport']['sha256'],
                     'file': base['file'], 'sha256': base['sha256'], 'shape': base['shape']},
                     'Derived tensor does not bind the pinned parent artifact')
            extraction = child.get('derivation', {})
            _require(extraction.get('axis') == 2 and extraction.get('selection') == [0, shapes[index][2]]
                     and extraction.get('sourceShape') == base['shape'] and extraction.get('targetShape') == shapes[index]
                     and extraction.get('channels') == _axis2_ranges(base['shape'], shapes[index]),
                     'Derived coordinate extraction is not exact per-channel NCTHW axis2')
            bridge = report.get('directF1AllValueBridge', {}).get(operation, {}).get(kind, {})
            gate = {'atol': 0., 'rtol': 0., 'maxAbs': 0.} if kind == 'input' else COMPARISON_GATE
            _require(bridge.get('passed') is True and bridge.get('allValuesCompared') is True
                     and bridge.get('allFinite') is True and bridge.get('elements') == _elements(short['shape'])
                     and bridge.get('axis') == 2 and bridge.get('parentShape') == base['shape']
                     and bridge.get('directShape') == short['shape'] and bridge.get('gate') == gate
                     and type(bridge.get('maxAbs')) in (int, float) and math.isfinite(bridge['maxAbs'])
                     and 0 <= bridge['maxAbs'] <= gate['maxAbs'] and bridge.get('failedAllcloseElements') == 0
                     and type(bridge.get('rmse')) in (int, float) and math.isfinite(bridge['rmse'])
                     and bridge['rmse'] >= 0
                     and bridge.get('firstFailedElement') is None,
                     'Independent direct F1 all-value bridge did not pass the unchanged gate')
        for label, native_report in [('parent', parent), ('directF1', direct)]:
            source = native_report['references'][operation]['input']
            pattern = report.get('inputPatternChecks', {}).get(label, {}).get(operation, {})
            _require(pattern.get('pattern') == PATTERNS[operation] and pattern.get('shape') == source['shape']
                     and pattern.get('expectedSha256') == source['sha256']
                     and pattern.get('allInputValuesBoundBySha256') is True,
                     'Derived native coordinate-pattern verification is missing or changed')
    checked.update(status=DERIVED_STATUS, nativeExecutionPerformed=False, operations=available,
                   parentNativePlan=parent_checked, directF1NativePlan=direct_checked,
                   tensorFileBytesVerified=False,
                   scope='Honest derived metadata and included committed native receipt chain; caller must separately hash child files and compare all numerical output values')
    return checked


def validate_reference_plan(report, reference_dir=None, *, operations=None, current_plan=None):
    """Dispatch without relabelling derived receipts as direct native execution."""
    if report.get('status') == 'REFERENCE_WRITTEN':
        return validate_native_reference_plan(report, current_plan=current_plan)
    _require(reference_dir is not None, 'Derived receipts require their included native snapshot directory')
    return validate_derived_reference_plan(report, reference_dir, operations=operations, current_plan=current_plan)
