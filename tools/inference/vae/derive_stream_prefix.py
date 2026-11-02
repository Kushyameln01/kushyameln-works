#!/usr/bin/env python3
"""Diagnostic coordinate-prefix references from an accepted native target81 run.

No model, Torch, ONNX, WASM, stream program, or production arithmetic is run.
This does not create evidence that shorter native source calls were executed.
Only identical480x832 spatial geometry and the declared deterministic inputs
are supported. A direct F1 native reference must first pass all-value checks.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from stream_reference import (COMPARISON_GATE, MODEL_SHA256, SOURCE_SHA256, SOURCE_COMMIT,
                              PLAN_PATH, case_by_id, frame_contract, load_plan, pattern_values,
                              sha256_file, create_output, write_json)

PATTERNS = {'rgb': '((c*71+t*13+y*5+x*3)%257-128)/128',
            'raw-latent': '((c*17+t*11+y*7+x*5)%257-128)/512'}
DERIVED_STATUS = 'DERIVED_CAUSAL_PREFIX_REFERENCE'


def axis2_ranges(source_shape, target_shape):
    for shape in (source_shape, target_shape):
        if (not isinstance(shape, list) or len(shape) != 5 or shape[0] != 1
                or any(isinstance(n, bool) or not isinstance(n, int) or n < 1 for n in shape)):
            raise ValueError('A literal positive N1 C T H W shape is required')
    if ([source_shape[i] for i in (0, 1, 3, 4)] != [target_shape[i] for i in (0, 1, 3, 4)]
            or target_shape[2] > source_shape[2]):
        raise ValueError('Only axis2 temporal prefixes at identical channel/spatial geometry are allowed')
    plane = source_shape[3] * source_shape[4] * 4
    return [{'channel': c, 'sourceOffsetBytes': c * source_shape[2] * plane,
             'targetOffsetBytes': c * target_shape[2] * plane,
             'bytes': target_shape[2] * plane} for c in range(source_shape[1])]


def extract_axis2(source, source_shape, destination, target_shape):
    ranges = axis2_ranges(source_shape, target_shape)
    if source.stat().st_size != math.prod(source_shape) * 4:
        raise ValueError('Parent tensor byte count differs from literal shape')
    storage = 'regular-repacked-file'
    if source_shape == target_shape:
        try:
            os.link(source, destination)
            storage = 'hardlink-identical-complete-tensor'
        except OSError:
            # A cross-filesystem destination still gets literal complete bytes.
            if source.stat().st_size > shutil.disk_usage(destination.parent).free:
                raise OSError('Identical-shape hardlink unavailable and complete-copy storage is insufficient')
            with destination.open('xb') as output, source.open('rb') as input_file:
                shutil.copyfileobj(input_file, output, length=1024 * 1024)
            storage = 'regular-identical-complete-copy'
    else:
        with source.open('rb') as input_file, destination.open('xb') as output:
            for window in ranges:
                input_file.seek(window['sourceOffsetBytes'])
                remaining = window['bytes']
                while remaining:
                    block = input_file.read(min(remaining, 1024 * 1024))
                    if not block:
                        raise ValueError('Truncated accepted parent during coordinate extraction')
                    output.write(block)
                    remaining -= len(block)
    if destination.is_symlink() or destination.stat().st_size != math.prod(target_shape) * 4:
        raise ValueError('Derived input/output is not a complete exact-shape tensor file')
    return {'file': destination.name, 'path': str(destination.resolve()), 'shape': target_shape,
            'axes': ['N', 'C', 'T', 'H', 'W'], 'dtype': 'float32', 'byteOrder': 'little',
            'layout': 'NCTHW', 'elements': math.prod(target_shape), 'bytes': destination.stat().st_size,
            'sha256': sha256_file(destination), 'complete': True, 'storage': storage,
            'derivation': {'axis': 2, 'selection': [0, target_shape[2]], 'sourceShape': source_shape,
                           'targetShape': target_shape, 'channels': ranges,
                           'scope': 'Per-channel coordinate prefix repacked in NCTHW order; no flattened slice, resizing, padding, or numerical transform'}}


def compare_prefix(parent, parent_shape, direct, direct_shape, gate):
    ranges = axis2_ranges(parent_shape, direct_shape)
    if parent.stat().st_size != math.prod(parent_shape) * 4 or direct.stat().st_size != math.prod(direct_shape) * 4:
        raise ValueError('Prefix/direct comparison file size differs from exact shape')
    count, maximum, squared, failed, first_failed, finite = 0, 0.0, 0.0, 0, None, True
    with parent.open('rb') as left, direct.open('rb') as right:
        for window in ranges:
            left.seek(window['sourceOffsetBytes'])
            remaining = window['bytes']
            while remaining:
                length = min(remaining, 256 * 1024)
                a, b = left.read(length), right.read(length)
                if len(a) != length or len(b) != length:
                    raise ValueError('Truncated prefix/direct reference')
                for (x,), (y,) in zip(struct.iter_unpack('<f', a), struct.iter_unpack('<f', b)):
                    valid = math.isfinite(x) and math.isfinite(y)
                    error = abs(x - y) if valid else math.inf
                    accepted = valid and error <= gate['atol'] + gate['rtol'] * abs(y)
                    if valid:
                        maximum = max(maximum, error)
                        squared += error * error
                    else:
                        finite = False
                    if not accepted:
                        failed += 1
                        if first_failed is None:
                            first_failed = count
                    count += 1
                remaining -= length
    return {'passed': finite and failed == 0 and maximum <= gate['maxAbs'],
            'elements': count, 'allValuesCompared': True, 'allFinite': finite,
            'maxAbs': maximum, 'rmse': math.sqrt(squared / count),
            'failedAllcloseElements': failed, 'firstFailedElement': first_failed,
            'gate': gate, 'axis': 2, 'parentShape': parent_shape, 'directShape': direct_shape,
            'scope': 'All-channel exact-coordinate prefix versus separately executed direct F1 native reference; no new NN run'}


def read_accepted_report(directory, expected_sha256):
    if not re.fullmatch('[0-9a-f]{64}', expected_sha256):
        raise ValueError('Accepted report SHA256 must be explicitly pinned')
    path = Path(directory) / 'reference-report.json'
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ValueError('Accepted report SHA256 mismatch; partial/changing receipts cannot be used')
    report = json.loads(raw)
    if report.get('status') != 'REFERENCE_WRITTEN':
        raise ValueError('A completed direct native source report is required; no partial or derived parent')
    return report, raw


def validate_pattern_declaration(plan):
    if plan['encodeInput']['pattern'] != PATTERNS['rgb'] or plan['decodeInput']['pattern'] != PATTERNS['raw-latent']:
        raise ValueError('The predeclared coordinate patterns differ from this diagnostic derivation')
    if plan['decodeInput']['derivedFromEncode'] is not False or plan['decodeInput']['provenance'] != 'RAW_LATENT_DECLARED_NORMAL_INPUT':
        raise ValueError('Independent raw decode input declaration is required')


def validate_native_metadata(report, expected_case_id):
    if report.get('status') != 'REFERENCE_WRITTEN' or report.get('case') != case_by_id(expected_case_id):
        raise ValueError('Expected a completed original native reference of the fixed case geometry')
    if report.get('comparisonGate') != COMPARISON_GATE:
        raise ValueError('Parent/direct source gate differs from predeclared2e-3 gate')
    model, source = report.get('model', {}), report.get('source', {})
    if (model.get('sha256') != MODEL_SHA256 or model.get('verified') is not True
            or model.get('executionDtype') != 'float32'
            or source.get('sha256') != SOURCE_SHA256 or source.get('commit') != SOURCE_COMMIT
            or source.get('verified') is not True):
        raise ValueError('Parent/direct original model/source identity verification differs')
    if report.get('strictLoad') != {'keys': 194, 'missing': [], 'unexpected': []}:
        raise ValueError('Parent/direct source did not strictly load all194 original keys')
    if report.get('predeclaredPlan', {}).get('sha256') != sha256_file(PLAN_PATH):
        raise ValueError('Parent/direct receipt belongs to a different frozen input plan')
    validate_pattern_declaration(load_plan())


def pattern_sha256(shape, kind):
    import numpy as np
    _, channels, frames, height, width = shape
    cc, tt, yy, xx, divisor = (71, 13, 5, 3, 128) if kind == 'rgb' else (17, 11, 7, 5, 512)
    if kind not in PATTERNS:
        raise ValueError('Unknown declared coordinate pattern')
    digest = hashlib.sha256()
    columns = np.arange(width, dtype=np.int64)[None, :] * xx
    for c in range(channels):
        for t in range(frames):
            for row in range(0, height, 64):
                rows = np.arange(row, min(row + 64, height), dtype=np.int64)[:, None] * yy
                values = ((columns + rows + c * cc + t * tt) % 257 - 128).astype('<f4')
                values /= np.float32(divisor)
                digest.update(values.tobytes(order='C'))
    return digest.hexdigest()


def validate_native_files(directory, report, operations):
    case = report['case']
    pattern_checks = {}
    for operation in operations:
        records = report.get('references', {}).get(operation)
        native = report.get('operations', {}).get(operation, {})
        expected_in = case['rgbShape'] if operation == 'encode' else case['latentShape']
        expected_out = case['latentShape'] if operation == 'encode' else case['decodeRgbShape']
        if (not records or native.get('status') != 'REFERENCE_WRITTEN' or native.get('rawScale') != [0., 1.]
                or native.get('inputShape') != expected_in or native.get('outputShape') != expected_out
                or native.get('allValuesPreserved') is not True):
            raise ValueError('Native independent source operation is incomplete: ' + operation)
        for kind, shape in [('input', expected_in), ('output', expected_out)]:
            record = records[kind]
            if Path(record['file']).name != record['file'] or record['shape'] != shape:
                raise ValueError('Native tensor filename/shape differs')
            path = Path(directory) / record['file']
            if (record.get('dtype') != 'float32' or record.get('layout') != 'NCTHW'
                    or record.get('byteOrder') != 'little' or record.get('complete') is not True
                    or record.get('finite') is not True or path.stat().st_size != math.prod(shape) * 4
                    or record['bytes'] != path.stat().st_size or sha256_file(path) != record['sha256']):
                raise ValueError('Accepted native tensor bytes/hash/finite provenance differs')
        expected_provenance = 'SYNTHETIC_DECLARED_RGB_INPUT' if operation == 'encode' else 'RAW_LATENT_DECLARED_NORMAL_INPUT'
        if (records['input'].get('provenance') != expected_provenance
                or records['output'].get('provenance') != 'INDEPENDENT_UNCHANGED_WAN21_SOURCE'):
            raise ValueError('Native source/input origin differs; raw decode must not be encode output')
        kind = 'rgb' if operation == 'encode' else 'raw-latent'
        expected_hash = pattern_sha256(expected_in, kind)
        if expected_hash != records['input']['sha256']:
            raise ValueError('Accepted input values do not match the declared coordinate pattern')
        pattern_checks[operation] = {'pattern': PATTERNS[kind], 'shape': expected_in,
                                     'expectedSha256': expected_hash, 'allInputValuesBoundBySha256': True}
    return pattern_checks


def verify_committed_tool(report):
    revision = report.get('executionSourceSha', '')
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise ValueError('Native source receipt lacks a full execution revision')
    relative = 'tools/inference/vae/stream_reference.py'
    raw = subprocess.run(['git', 'show', revision + ':' + relative], cwd=ROOT.parents[2],
                         check=True, capture_output=True).stdout
    if hashlib.sha256(raw).hexdigest() != report.get('referenceToolSha256'):
        raise ValueError('Native reference tool bytes differ from the committed execution receipt')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent', type=Path, required=True)
    parser.add_argument('--parent-report-sha256', required=True, help='Coordinator-accepted completed target81 native report hash')
    parser.add_argument('--direct-f1', type=Path, required=True)
    parser.add_argument('--direct-f1-report-sha256', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--operation', choices=['encode', 'decode', 'both'], default='both')
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    if not re.fullmatch('[0-9a-f]{40}', args.execution_source_sha):
        parser.error('--execution-source-sha requires a full40hex diagnostic revision')
    case = case_by_id(args.case_id)
    if case['role'] != 'source' or case['rgbShape'][-2:] != [480, 832]:
        parser.error('Only declared source cases at the identical480x832 geometry can reuse this target81 parent')
    destination = create_output(args.output)
    operations = ['encode', 'decode'] if args.operation == 'both' else [args.operation]
    result = {'schemaVersion': 1, 'status': 'FAILED', 'case': case,
              'comparisonGate': COMPARISON_GATE, 'executionSourceSha': args.execution_source_sha,
              'executionSourceShaScope': 'Exact executing derivation-tool bytes checked against this commit; no model execution or whole-tree clean claim',
              'derivationToolSha256': sha256_file(Path(__file__)), 'nativeExecutionPerformed': False,
              'newModelLoads': 0, 'newNNRuns': 0, 'references': {}, 'operations': {}, 'errors': []}
    started, stage = time.monotonic(), 'committed-diagnostic-tool'
    try:
        committed = subprocess.run(['git', 'show', args.execution_source_sha + ':tools/inference/vae/derive_stream_prefix.py'],
                                   cwd=ROOT.parents[2], check=True, capture_output=True).stdout
        if hashlib.sha256(committed).hexdigest() != result['derivationToolSha256']:
            raise ValueError('Executing diagnostic derivation tool differs from its specified source commit')
        stage = 'accepted-native-receipts'
        parent_dir, direct_dir = args.parent.resolve(), args.direct_f1.resolve()
        parent, parent_raw = read_accepted_report(parent_dir, args.parent_report_sha256)
        direct, direct_raw = read_accepted_report(direct_dir, args.direct_f1_report_sha256)
        validate_native_metadata(parent, 'target-f81-480x832')
        validate_native_metadata(direct, 'source-f1-480x832')
        verify_committed_tool(parent); verify_committed_tool(direct)
        if sha256_file(ROOT / 'vendor/vae.py') != SOURCE_SHA256:
            raise ValueError('Local untouched vendor causal source bytes differ')
        if parent.get('frameContract') != frame_contract(81) or direct.get('frameContract') != frame_contract(1):
            raise ValueError('Native parent/direct literal frame contracts differ')
        result['parentReport'] = {'path': str(parent_dir / 'reference-report.json'), 'sha256': args.parent_report_sha256,
                                   'snapshotFile': 'parent-native-report.json', 'executionSourceSha': parent['executionSourceSha']}
        result['directF1Report'] = {'path': str(direct_dir / 'reference-report.json'), 'sha256': args.direct_f1_report_sha256,
                                     'snapshotFile': 'direct-f1-native-report.json', 'executionSourceSha': direct['executionSourceSha']}
        stage = 'native-file-and-coordinate-pattern-verification'
        result['inputPatternChecks'] = {'parent': validate_native_files(parent_dir, parent, operations),
                                         'directF1': validate_native_files(direct_dir, direct, operations)}
        stage = 'independent-direct-f1-all-value-bridge'
        bridge = {}
        exact = {'atol': 0., 'rtol': 0., 'maxAbs': 0.}
        for operation in operations:
            bridge[operation] = {}
            for kind in ('input', 'output'):
                base, short = parent['references'][operation][kind], direct['references'][operation][kind]
                comparison = compare_prefix(parent_dir / base['file'], base['shape'],
                                            direct_dir / short['file'], short['shape'],
                                            exact if kind == 'input' else COMPARISON_GATE)
                bridge[operation][kind] = comparison
                if not comparison['passed']:
                    raise ValueError('Independent direct F1 all-value bridge failed: ' + operation + '/' + kind)
        result['directF1AllValueBridge'] = bridge
        stage = 'exact-coordinate-extraction'
        needed, logical_bytes = 0, 0
        for operation in operations:
            shapes = [case['rgbShape'], case['latentShape']] if operation == 'encode' else [case['latentShape'], case['decodeRgbShape']]
            for kind, shape in zip(('input', 'output'), shapes):
                size = math.prod(shape) * 4
                logical_bytes += size
                base = parent['references'][operation][kind]
                same_filesystem = (parent_dir / base['file']).stat().st_dev == destination.stat().st_dev
                if shape != base['shape'] or not same_filesystem:
                    needed += size
        result['storagePlan'] = {'logicalTensorBytes': logical_bytes, 'expectedAdditionalDataBytes': needed,
                                'scope': 'Only identical complete shapes on one filesystem use hardlinks; smaller-F files are repacked regular files. Failed hardlinks require checked full-copy storage.'}
        if needed > shutil.disk_usage(destination).free:
            raise OSError('Insufficient storage for full exact-shape derived inputs and outputs')
        for operation in operations:
            child = {}
            for kind in ('input', 'output'):
                base = parent['references'][operation][kind]
                shape = (case['rgbShape'] if operation == 'encode' else case['latentShape']) if kind == 'input' else (case['latentShape'] if operation == 'encode' else case['decodeRgbShape'])
                record = extract_axis2(parent_dir / base['file'], base['shape'], destination / base['file'], shape)
                record.update(meaning=base['meaning'], finite=True,
                    finiteScope='Selected values inherited from hash-verified complete finite native parent; no numerical transform',
                    provenance=base['provenance'] if kind == 'input' else 'DERIVED_CAUSAL_PREFIX_OF_INDEPENDENT_UNCHANGED_WAN21_SOURCE',
                    parent={'reportSha256': args.parent_report_sha256, 'file': base['file'],
                            'sha256': base['sha256'], 'shape': base['shape']})
                if kind == 'input' and record['sha256'] != pattern_sha256(shape, 'rgb' if operation == 'encode' else 'raw-latent'):
                    raise ValueError('Repacked child input no longer matches declared coordinate pattern')
                child[kind] = record
            result['references'][operation] = child
            result['operations'][operation] = {'status': DERIVED_STATUS, 'nativeExecutionPerformed': False,
                'inputShape': child['input']['shape'], 'outputShape': child['output']['shape'],
                'rawScale': [0., 1.], 'allCaseValuesPreserved': True,
                'parentNativeOperation': parent['operations'][operation]}
        if sha256_file(parent_dir / 'reference-report.json') != args.parent_report_sha256 or sha256_file(direct_dir / 'reference-report.json') != args.direct_f1_report_sha256:
            raise ValueError('Accepted native receipt changed during derivation')
        (destination / 'parent-native-report.json').write_bytes(parent_raw)
        (destination / 'direct-f1-native-report.json').write_bytes(direct_raw)
        result.update(status=DERIVED_STATUS, frameContract=frame_contract(case['rgbShape'][2]),
            model={'sha256': MODEL_SHA256, 'storedDtype': 'bfloat16', 'executionDtype': 'float32',
                   'identityScope': 'Inherited accepted original-model native receipt; no model opened by derivation'},
            source={'commit': SOURCE_COMMIT, 'sha256': SOURCE_SHA256,
                    'scope': 'Accepted untouched native parent and locally verified source identity; source not executed by derivation'},
            parentStrictLoad=parent['strictLoad'], predeclaredPlan={'path': str(PLAN_PATH), 'sha256': sha256_file(PLAN_PATH)},
            scope='Diagnostic same-geometry causal coordinate-prefix references, derived from one independent native target81 run; not separately executed shorter native cases or production-WASM evidence',
            numericalScope='Exact-arithmetic prefix identity plus measured all-value F1 bridge at predeclared2e-3. Different total-T pointwise CPU kernels may round differently; bitwise equality or separately measured shorter-native tolerances are not claimed.',
            causalEvidence={'sourceLines': ['17-36: past-only Conv3d padding', '39-54: channel-only RMSNorm',
                 '101-160: past-only resample caches', '240-261: B*T spatial attention',
                 '505-506: pointwise terminal/projection convolutions', '516-568: first1/groups4 encode and one-step decode, no terminal flush'],
                 'sourceSha256': SOURCE_SHA256, 'spatialReuse': False},
            adaptation={'resize': False, 'spatialCrop': False, 'padding': False, 'inputFramesReduced': False,
                        'sourceTail': 'F4/F80 input files retain literal4/80 frames; native mean covers1/77 as explicitly recorded'})
    except Exception as error:
        result['errors'].append({'stage': stage, 'type': type(error).__name__, 'message': str(error),
                                  'traceback': traceback.format_exc()})
    result['elapsedSeconds'] = time.monotonic() - started
    write_json(destination / 'reference-report.json', result)
    print(json.dumps({'status': result['status'], 'caseId': case['id'], 'output': str(destination),
                      'newNNRuns': 0, 'errors': result['errors']}), flush=True)
    return 0 if result['status'] == DERIVED_STATUS else 1


if __name__ == '__main__':
    raise SystemExit(main())
