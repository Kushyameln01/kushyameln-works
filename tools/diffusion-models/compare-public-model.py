"""Compare privately saved ordinary public output with a frozen independent F32 file.

Only identities, shapes and scalar error metrics are written. No model/runtime
module is imported and no numeric values are published. Admission precedes a
second, bounded 128-value streaming comparison/hash pass.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTRACT = ROOT / 'development/ai-connection/d1-d4-production-20261102/reference/small-real-l512-preexecution.json'
REFERENCE_EXECUTION = '3e68d2fc54c67b16f8a82002f69fa183674a9f14'
TEXT_MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
TOKENIZER = 'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'
VAE = '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
GATE = {'abs': 0.01, 'rel': 0.001}
CHUNK_ELEMENTS = 128


def require(condition, message):
    if not condition:
        raise ValueError(message)


def full_sha(value, label, digits=64):
    require(isinstance(value, str) and re.fullmatch('[0-9a-f]{' + str(digits) + '}', value), label + ' must be a full SHA')
    return value


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON field')
        result[key] = value
    return result


def read_json(path):
    require(path.stat().st_size <= 16 * 1024 * 1024, 'Metadata JSON exceeds bounded admission size')
    return json.loads(path.read_bytes(), object_pairs_hook=no_duplicates,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON constant')))


def file_identity(path):
    digest, count = hashlib.sha256(), 0
    with path.open('rb') as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
            count += len(block)
    return {'bytes': count, 'sha256': digest.hexdigest()}


def declared_identity(value, label):
    require(isinstance(value, dict) and type(value.get('bytes')) is int and value['bytes'] > 0, label + ' byte count')
    return {'bytes': value['bytes'], 'sha256': full_sha(value.get('sha256'), label)}


def exact_shape(value):
    require(isinstance(value, list) and len(value) == 5 and value[:2] == [1, 16]
            and all(type(x) is int and x > 0 for x in value), 'Exact positive NCTHW [1,16,T,H,W] required')
    return list(value)


def contract_source_check(contract, commit):
    full_sha(commit, 'Reference execution commit', 40)
    sources = contract.get('sourceSHA256')
    require(isinstance(sources, dict) and sources, 'Frozen reference source inventory required')
    verified = {}
    for name, expected in sources.items():
        require(isinstance(name, str) and not name.startswith('/') and '..' not in Path(name).parts, 'Unsafe reference source path')
        full_sha(expected, 'Contract source SHA256')
        raw = subprocess.check_output(['git', 'show', commit + ':' + name], cwd=ROOT, stderr=subprocess.DEVNULL)
        actual = hashlib.sha256(raw).hexdigest()
        require(actual == expected, 'Reference execution commit differs from frozen contract source: ' + name)
        verified[name] = {'bytes': len(raw), 'sha256': actual}
    return verified


def admit(native, reference, contract, contract_identity, source_commit=None):
    require(native.get('schemaVersion') == 'bernini-public-model-worker-host/0.1', 'Ordinary public host receipt required')
    require(native.get('passed') is True and native.get('sourceGuardAfter') is True
            and native.get('sourceGuardError') is None and native.get('hostError') is None, 'Native run/source guard did not pass')
    source = full_sha(native.get('sourceCommit'), 'Native source commit', 40)
    if source_commit is not None:
        require(source == full_sha(source_commit, 'Requested native commit', 40), 'Native source commit mismatch')
    public = native['publicResult']
    mode = native.get('mode')
    require(mode in ['predict', 'sample'] and public.get('mode') == mode, 'Only a completed normal predict or sample may be compared')
    require(public.get('sourceCommit') == source and public.get('publicWorkerConnected') is True
            and public.get('outcome') == 'completed' and public.get('error') is None, 'Public ordinary Worker/source/outcome mismatch')
    require(public.get('codecScope') == 'Actual normal ' + mode + ' output', 'Saved-input/diagnostic codec output is not a normal model output')
    execution = public.get('execution', {})
    require(execution.get('operation') == mode and execution.get('publicWorkerConnected') is True, 'Normal model operation tag mismatch')
    require(public.get('callerInputsBitExact') is True and public.get('inputIdentitiesBefore') == public.get('inputIdentitiesAfter'), 'Caller-input identity changed')
    require(reference.get('schemaVersion') == 'bernini-production-independent-reference/1'
            and reference.get('actualNativeOutputsUsedAsNumericInput') is False, 'Independent reference provenance required')
    require(contract.get('status') == 'PRE_EXECUTION_GATE_FIXED' and contract.get('gateMayNotBeRelaxedAfterComparison') is True,
            'Pre-execution fixed gate contract required')
    require(reference.get('contractSHA256') == contract_identity['sha256'], 'Frozen contract SHA256 mismatch')
    require(reference.get('gate') == contract.get('gate') == GATE, 'Predeclared gate may not be changed')
    inputs = native['inputReceipt']
    manifest_sha = full_sha(inputs.get('manifestSHA256'), 'Native input manifest')
    require(manifest_sha == reference.get('manifestSHA256') == contract.get('manifestSHA256'), 'Native/reference manifest identity mismatch')
    profile = contract['profileId']
    require(profile == reference.get('profileId') == inputs.get('profileId') == public.get('profileId'), 'Case/Profile identity mismatch')
    text = inputs['conditioning']
    require(reference.get('allTextRows') == contract.get('textRows') == 512 and text.get('shape') == [1, 512, 4096], 'All512 Text rows required')
    require(text.get('modelSha256') == TEXT_MODEL and text.get('tokenizerSha256') == TOKENIZER
            and text.get('normalization') == 'umt5-final-rmsnorm-f32-v1', 'Text model/tokenizer/normalization mismatch')
    for branch in ['positive', 'negative']:
        value = public['inputIdentitiesBefore'][branch]
        require(declared_identity(value, branch) == {'bytes': 512 * 4096 * 4, 'sha256': full_sha(text.get('payloadSHA256'), 'Text payload')}, 'Text payload identity/extent mismatch')
        require(declared_identity(value['mask'], branch + ' mask') == {'bytes': 512, 'sha256': full_sha(text.get('maskSHA256'), 'Text mask')}, 'All512 mask entries must retain identity')
    models = public['loaded']['models']
    model_ids = []
    for side in ['HIGH', 'LOW']:
        expected = contract['models'][side]
        require(models[side].get('side') == side and models[side].get('modelSha256') == expected['previouslyVerifiedSHA256']
                and models[side].get('headerSHA256') == expected['headerSHA256'], 'Base model/header identity mismatch: ' + side)
        model_ids.append(expected['previouslyVerifiedSHA256'])
    metadata = public['tensorMetadata']
    require(metadata.get('dtype') == 'float32' and metadata.get('layout') == 'NCTHW', 'Output dtype/layout mismatch')
    shape = exact_shape(metadata.get('shape'))
    require(shape == exact_shape(inputs['canonicalShape']['target']['initialLatentShape']), 'Full output/target shape mismatch')
    if mode == 'predict':
        require(native.get('side') == public.get('side') == 'HIGH' and native.get('timestep') == public.get('timestep') == 1000,
                'velocity00 comparison requires HIGH at first timestep1000')
        require(metadata.get('meaning') == 'bernini-flow-velocity:v1' and metadata.get('modelSha256') == model_ids[0], 'Flow-velocity meaning/model mismatch')
        require(reference.get('operation') == 'sample', 'velocity00 must come from the fixed independent six-update reference')
        name = 'velocity00'
    else:
        latent = metadata.get('latentContract', {})
        require(metadata.get('meaning') == 'wan21-raw-generated-sample:v1'
                and latent.get('schemaVersion') == 1 and latent.get('representation') == 'generated-sample'
                and latent.get('space') == 'raw' and latent.get('vaeModelSha256') == VAE
                and latent.get('producerModelSha256s') == model_ids
                and latent.get('normalization') == {'id': 'wan21-comfy-f32-v1', 'state': 'restored', 'owner': 'diffusion_models'}, 'Raw generated-sample contract mismatch')
        require(reference.get('operation') == 'sample', 'Final sample requires the complete independent sampler reference')
        name = 'finalRaw'
    metrics = reference.get('metrics', [])
    require(len(metrics) == 6 and [x.get('side') for x in metrics] == ['HIGH'] * 3 + ['LOW'] * 3,
            'Independent HIGH3→LOW3 six-update reference required')
    require(all(x.get('totalTokens') == contract['totalTokens'] for x in metrics), 'Reference context token population mismatch')
    descriptor = reference['arrays'][name]
    require(shape == exact_shape(descriptor.get('shape')), 'Reference/native full shapes differ')
    output_identity = declared_identity(public['outputIdentity'], 'Native output')
    require(output_identity['bytes'] == math.prod(shape) * 4, 'Native output extent/shape mismatch')
    require(declared_identity(native['privateOutputs']['tensor.f32'], 'Persisted native output') == output_identity, 'Native persisted payload differs from normal output')
    readback = public['readback']
    require(readback.get('realDiskFileSelected') is True and readback.get('allF32BitsExact') is True
            and readback.get('payloadElements') == math.prod(shape)
            and declared_identity(readback['payload'], 'Canonical readback') == output_identity, 'Actual canonical file readback identity mismatch')
    expected_identity = declared_identity(descriptor, 'Reference output')
    require(expected_identity['bytes'] == output_identity['bytes'], 'Reference output extent/shape mismatch')
    return {'sourceCommit': source, 'mode': mode, 'array': name, 'profileId': profile, 'manifestSHA256': manifest_sha,
            'shape': shape, 'elements': math.prod(shape), 'actual': output_identity, 'expected': expected_identity,
            'text': text, 'descriptor': descriptor}


def compare_files(actual_path, expected_path, admission):
    actual_id, expected_id = file_identity(actual_path), file_identity(expected_path)
    require(actual_id == admission['actual'], 'Actual F32 bytes/SHA256 differ from native receipt')
    require(expected_id == admission['expected'], 'Expected F32 bytes/SHA256 differ from reference descriptor')
    count = failed = nonfinite_actual = nonfinite_reference = 0
    max_abs = max_rel = max_normalized = 0.0
    first_failure = None
    actual_hash, expected_hash = hashlib.sha256(), hashlib.sha256()
    with actual_path.open('rb') as actual, expected_path.open('rb') as expected:
        while True:
            a, b = actual.read(CHUNK_ELEMENTS * 4), expected.read(CHUNK_ELEMENTS * 4)
            require(len(a) == len(b) and len(a) % 4 == 0, 'Comparison stream extent changed')
            if not a:
                break
            actual_hash.update(a)
            expected_hash.update(b)
            for x, y in zip(struct.iter_unpack('<f', a), struct.iter_unpack('<f', b)):
                x, y = x[0], y[0]
                finite_x, finite_y = math.isfinite(x), math.isfinite(y)
                nonfinite_actual += not finite_x
                nonfinite_reference += not finite_y
                bad = not (finite_x and finite_y)
                if not bad:
                    difference = abs(x - y)
                    normalized = difference / (GATE['abs'] + GATE['rel'] * abs(y))
                    max_abs = max(max_abs, difference)
                    max_rel = max(max_rel, difference / max(abs(y), 1e-30))
                    max_normalized = max(max_normalized, normalized)
                    bad = normalized > 1
                if bad:
                    failed += 1
                    if first_failure is None:
                        first_failure = count
                count += 1
    require(count == admission['elements'], 'Comparison did not cover all declared elements')
    require(actual_hash.hexdigest() == actual_id['sha256'] and expected_hash.hexdigest() == expected_id['sha256'], 'Binary input changed during comparison')
    return {'elements': count, 'failedElements': failed, 'nonfiniteActual': nonfinite_actual,
            'nonfiniteReference': nonfinite_reference, 'maxAbsoluteError': max_abs,
            'maxRelativeError': max_rel, 'maxNormalizedGateError': max_normalized,
            'maxErrorsScope': 'Finite value pairs only; every nonfinite pair fails separately',
            'firstFailureIndex': first_failure, 'allF32BitsExact': actual_id == expected_id,
            'allElementsCompared': True, 'chunkElements': CHUNK_ELEMENTS, 'gate': dict(GATE)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native-receipt', type=Path, required=True)
    parser.add_argument('--actual-f32', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--contract', type=Path, default=DEFAULT_CONTRACT)
    parser.add_argument('--source-commit')
    parser.add_argument('--reference-source-commit', default=REFERENCE_EXECUTION)
    parser.add_argument('--output', '--out', type=Path, required=True)
    args = parser.parse_args()
    report = {'schemaVersion': 'bernini-public-model-independent-comparison/1', 'passed': False,
              'comparator': {'path': str(Path(__file__).relative_to(ROOT)), **file_identity(Path(__file__))},
              'nativeValuesPublished': False, 'modelRuntimeImported': False, 'newInferenceExecuted': False,
              'generationReady': False, 'originalWorkflowAccepted': False}
    try:
        native, reference, contract = map(read_json, [args.native_receipt, args.reference, args.contract])
        identities = {name: file_identity(path) for name, path in [('nativeReceipt', args.native_receipt), ('reference', args.reference), ('contract', args.contract)]}
        admission = admit(native, reference, contract, identities['contract'], args.source_commit)
        source_inventory = contract_source_check(contract, args.reference_source_commit)
        expected_path = Path(admission['descriptor']['path'])
        if not expected_path.is_absolute():
            expected_path = args.reference.parent / expected_path
        comparison = compare_files(args.actual_f32, expected_path, admission)
        report.update({key: value for key, value in admission.items() if key not in ['descriptor']})
        report.update(identities=identities, comparison=comparison,
                      referenceExecution={'sourceCommit': args.reference_source_commit,
                                          'attribution': 'Execution SHA declared by harness/operator; reference JSON itself does not embed an execution commit',
                                          'frozenContractSourcesAtCommit': source_inventory},
                      scope='All values of the identified normal public output at the exact saved input shape/Text512; not original81 workflow or production precision acceptance',
                      passed=comparison['failedElements'] == 0)
    except Exception as error:
        report['admissionError'] = {'name': type(error).__name__, 'message': str(error)[:2000]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as destination:
        json.dump(report, destination, indent=2, allow_nan=False)
        destination.write('\n')
    print(json.dumps({'passed': report['passed'], 'output': str(args.output),
                      'comparison': report.get('comparison'), 'admissionError': report.get('admissionError')}, allow_nan=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
