#!/usr/bin/env python3
"""Independent, unchanged-source Wan2.1 CPU FP32 references in private files.

This tool calls vendor WanVAE_.encode/decode directly. It never imports the
partitioned program, runtime, ONNX exports, or production VAE implementation.
The coordinator must serialize this heavyweight job with other model jobs.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import multiprocessing
import os
from pathlib import Path
import re
import resource
import shutil
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parent
PLAN_PATH = ROOT.parents[2] / 'development/inference/standalone-20261102/vae/predeclared-plan.json'
MODEL_SHA256 = '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
SOURCE_SHA256 = '4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498'
SOURCE_COMMIT = '9737cba9c1c3c4d04b33fcad41c111989865d315'
COMPARISON_GATE = {'atol': .002, 'rtol': .002, 'maxAbs': .002,
                   'registeredBeforeComparison': True,
                   'scope': 'New declared FP32 synthetic shape domain; proposed before comparison, not transferred from tiny-model tolerances.'}


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def frame_contract(frames):
    if isinstance(frames, bool) or not isinstance(frames, int) or frames < 1:
        raise ValueError('Actual input frame count must be a positive integer')
    latent = 1 + (frames - 1) // 4
    consumed = 1 + 4 * (latent - 1)
    return {'inputFrames': frames, 'latentFrames': latent, 'consumedFrames': consumed,
            'ignoredTailFrames': frames - consumed, 'decodedFrames': consumed}


def load_plan():
    plan = json.loads(PLAN_PATH.read_text())
    if plan['comparisonGate'] != COMPARISON_GATE:
        raise ValueError('Predeclared comparison gate differs from this reference tool')
    if plan['model']['sha256'] != MODEL_SHA256 or plan['source']['sha256'] != SOURCE_SHA256:
        raise ValueError('Predeclared model/source identity differs from pinned original')
    return plan


def case_by_id(case_id):
    cases = [case for case in load_plan()['cases'] if case['id'] == case_id]
    if len(cases) != 1:
        raise ValueError('Choose one explicit predeclared case ID')
    case = cases[0]
    n, channels, frames, height, width = case['rgbShape']
    contract = frame_contract(frames)
    if n != 1 or channels != 3 or height % 16 or width % 16:
        raise ValueError('Predeclared case has invalid RGB geometry')
    if case['latentShape'] != [1, 16, contract['latentFrames'], height // 8, width // 8]:
        raise ValueError('Predeclared latent shape differs from original source frame contract')
    if case['decodeRgbShape'] != [1, 3, contract['decodedFrames'], height, width]:
        raise ValueError('Predeclared raw decode shape differs from source frame contract')
    return case


def pattern_values(shape, kind):
    """Small stdlib oracle for the specified input patterns, in NCTHW order."""
    if len(shape) != 5 or shape[0] != 1 or any(isinstance(n, bool) or not isinstance(n, int) or n < 1 for n in shape):
        raise ValueError('A positive N1 C T H W shape is required')
    if kind not in ('rgb', 'raw-latent'):
        raise ValueError('Unknown input pattern')
    _, channels, frames, height, width = shape
    cc, tt, yy, xx, divisor = (71, 13, 5, 3, 128) if kind == 'rgb' else (17, 11, 7, 5, 512)
    for c in range(channels):
        for t in range(frames):
            for y in range(height):
                for x in range(width):
                    yield ((c * cc + t * tt + y * yy + x * xx) % 257 - 128) / divisor


def create_output(path):
    path = Path(path).resolve()
    if 'docs' in path.parts:
        raise ValueError('Private reference files must stay outside docs/')
    path.mkdir(parents=True, exist_ok=False)
    return path


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.pending')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def read_cgroup_memory(root=Path('/sys/fs/cgroup')):
    values = {'path': str(root), 'limitBytes': None, 'currentBytes': None,
              'inactiveFileBytes': None, 'anonBytes': None, 'shmemBytes': None,
              'workingSetBytes': None,
              'workingSetScope': 'max(0,memory.current-observed inactive_file); missing inactive_file falls back to raw charge. Shmem/tmpfs is not separately subtracted. Non-atomic observation, not an exact pressure measurement.'}
    for file, field in [('memory.max', 'limitBytes'), ('memory.current', 'currentBytes')]:
        try:
            raw = (Path(root) / file).read_text().strip()
            values[field] = None if raw == 'max' else int(raw)
        except (OSError, ValueError):
            pass
    try:
        stat = {}
        for line in (Path(root) / 'memory.stat').read_text().splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[0] in ('inactive_file', 'anon', 'shmem'):
                number = int(parts[1])
                if number >= 0:
                    stat[parts[0]] = number
        for key, field in [('inactive_file', 'inactiveFileBytes'), ('anon', 'anonBytes'), ('shmem', 'shmemBytes')]:
            values[field] = stat.get(key)
    except (OSError, ValueError):
        pass
    if values['currentBytes'] is not None:
        # Inactive file cache may be evicted under pressure. Do not subtract
        # shmem/tmpfs: private scratch pages still consume the cgroup budget.
        values['workingSetBytes'] = max(0, values['currentBytes'] - (values['inactiveFileBytes'] or 0))
    return values


def process_memory(pid):
    result = {'rssBytes': None, 'pssBytes': None}
    try:
        for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines():
            if line.startswith(('Rss:', 'Pss:')):
                key = 'rssBytes' if line.startswith('Rss:') else 'pssBytes'
                result[key] = int(line.split()[1]) * 1024
    except (OSError, ValueError):
        pass
    return result


def resource_record(pid):
    return {'monotonicSeconds': time.monotonic(), 'process': process_memory(pid),
            'cgroup': read_cgroup_memory()}


def memory_guard(record, reserve):
    memory = record['cgroup']
    limit = memory['limitBytes']
    working_set = memory.get('workingSetBytes', memory['currentBytes'])
    return limit is not None and working_set is not None and working_set >= limit - reserve


def file_record(path, shape, meaning, provenance, digest=None, minimum=None, maximum=None):
    expected_bytes = math.prod(shape) * 4
    if path.stat().st_size != expected_bytes:
        raise ValueError(f'Incomplete NCTHW tensor file: {path.name}')
    return {'file': path.name, 'path': str(path), 'shape': list(shape), 'axes': ['N', 'C', 'T', 'H', 'W'],
            'dtype': 'float32', 'byteOrder': 'little', 'layout': 'NCTHW', 'elements': math.prod(shape),
            'bytes': expected_bytes, 'sha256': digest or sha256_file(path), 'finite': True,
            'min': minimum, 'max': maximum, 'meaning': meaning, 'provenance': provenance,
            'storage': 'external-private-file', 'complete': True}


def write_pattern(path, shape, kind, np):
    _, channels, frames, height, width = shape
    cc, tt, yy, xx, divisor = (71, 13, 5, 3, 128) if kind == 'rgb' else (17, 11, 7, 5, 512)
    digest = hashlib.sha256()
    minimum, maximum = math.inf, -math.inf
    columns = np.arange(width, dtype=np.int64)[None, :] * xx
    with path.open('xb') as output:
        for c in range(channels):
            for t in range(frames):
                for row in range(0, height, 64):
                    rows = np.arange(row, min(row + 64, height), dtype=np.int64)[:, None] * yy
                    values = ((columns + rows + c * cc + t * tt) % 257 - 128).astype('<f4')
                    values /= np.float32(divisor)
                    data = values.tobytes(order='C')
                    output.write(data)
                    digest.update(data)
                    minimum = min(minimum, float(values.min()))
                    maximum = max(maximum, float(values.max()))
    meaning = 'RGB in [-1,1]' if kind == 'rgb' else 'Unnormalized raw latent in [-.25,.25], independent of encode'
    provenance = 'SYNTHETIC_DECLARED_RGB_INPUT' if kind == 'rgb' else 'RAW_LATENT_DECLARED_NORMAL_INPUT'
    return file_record(path, shape, meaning, provenance, digest.hexdigest(), minimum, maximum)


def write_tensor(path, tensor, shape, meaning, np):
    if list(tensor.shape) != shape:
        raise ValueError(f'Unchanged source returned {list(tensor.shape)}, expected {shape}')
    array = tensor.detach().cpu().numpy()
    digest, minimum, maximum = hashlib.sha256(), math.inf, -math.inf
    with path.open('xb') as output:
        for chunk in np.nditer(array, flags=['external_loop', 'buffered', 'zerosize_ok'],
                               op_flags=['readonly'], order='C', buffersize=262144):
            values = np.asarray(chunk, dtype='<f4')
            if not np.isfinite(values).all():
                raise ValueError('Independent source produced a non-finite reference value')
            data = values.tobytes(order='C')
            output.write(data)
            digest.update(data)
            minimum, maximum = min(minimum, float(values.min())), max(maximum, float(values.max()))
    return file_record(path, shape, meaning, 'INDEPENDENT_UNCHANGED_WAN21_SOURCE',
                       digest.hexdigest(), minimum, maximum)


def execute_reference(request, destination):
    """Runs only in the owned worker process; heavy imports remain local here."""
    destination = Path(destination)
    case = case_by_id(request['caseId'])
    report = {'schemaVersion': 1, 'status': 'RUNNING', 'case': case,
              'scope': load_plan()['scope'], 'operation': request['operation'],
              'executionSourceSha': request['executionSourceSha'],
              'executionSourceShaScope': 'Caller-supplied development revision, not a clean-tree claim',
              'referenceToolSha256': sha256_file(Path(__file__)),
              'predeclaredPlan': {'path': str(PLAN_PATH), 'sha256': sha256_file(PLAN_PATH)},
              'comparisonGate': COMPARISON_GATE, 'references': {}, 'operations': {},
              'frameContract': frame_contract(case['rgbShape'][2]),
              'inputResize': False, 'padding': False, 'hiddenFrameReduction': False,
              'tailPolicy': 'Original source consumes first1 plus complete groups4; input file and shape retain every actual RGB frame.',
              'resourcePolicy': {'cpuThreads': 2, 'interopThreads': 1,
                                 'memoryReserveBytes': request['memoryReserveBytes'],
                                 'reserveScope': 'Explicit supervisor reserve, not a measured model memory requirement',
                                 'guardCharge': 'Observed memory.current minus inactive_file only; shmem/tmpfs remains charged'},
              'errors': []}
    stage, started = 'identity', time.monotonic()
    last_event = [0.0]
    last_memory_check = [0.0]

    def progress(event, **details):
        record = {'event': event, 'elapsedSeconds': time.monotonic() - started, **details}
        report['progress'] = record
        write_json(destination / 'reference-report.json', report)
        print(json.dumps({'caseId': case['id'], **record}), flush=True)

    try:
        progress('verify-original-model-and-source')
        source_path = ROOT / 'vendor/vae.py'
        source_meta = json.loads((ROOT / 'vendor/source.json').read_text())
        if source_meta['commit'] != SOURCE_COMMIT or source_meta['sha256'] != SOURCE_SHA256:
            raise ValueError('Pinned VAE source metadata mismatch')
        if sha256_file(source_path) != SOURCE_SHA256:
            raise ValueError('Untouched original VAE source SHA256 mismatch')
        model_path = Path(request['model'])
        if sha256_file(model_path) != MODEL_SHA256:
            raise ValueError('Original VAE model SHA256 mismatch')
        report['source'] = {**source_meta, 'path': str(source_path), 'verified': True}
        report['model'] = {'path': str(model_path), 'bytes': model_path.stat().st_size,
                           'sha256': MODEL_SHA256, 'verified': True,
                           'storedDtype': 'bfloat16', 'executionDtype': 'float32',
                           'precisionScope': 'Unchanged BF16 stored values expanded to FP32; not original BF16 arithmetic equivalence'}
        stage = 'imports-and-strict-load'
        if request.get('deps'):
            sys.path.insert(0, request['deps'])
        import numpy as np
        import torch
        from safetensors.torch import load_file
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        source_spec = importlib.util.spec_from_file_location('wan21_independent_source', source_path)
        source_module = importlib.util.module_from_spec(source_spec)
        source_spec.loader.exec_module(source_module)
        with torch.device('meta'):
            model = source_module.WanVAE_(dim=96, z_dim=16, dim_mult=[1, 2, 4, 4],
                                         num_res_blocks=2, attn_scales=[],
                                         temperal_downsample=[False, True, True], dropout=0.)
        state = load_file(str(model_path), device='cpu')
        if len(state) != 194:
            raise ValueError(f'Expected exactly 194 original model keys, received {len(state)}')
        loaded = model.load_state_dict(state, strict=True, assign=True)
        del state
        model = model.float().eval()
        report['strictLoad'] = {'keys': 194, 'missing': list(loaded.missing_keys),
                                'unexpected': list(loaded.unexpected_keys)}
        report['versions'] = {'torch': torch.__version__, 'numpy': np.__version__}

        def module_observation(name, phase, values):
            now = time.monotonic()
            if now - last_memory_check[0] >= .25:
                last_memory_check[0] = now
                if memory_guard({'cgroup': read_cgroup_memory()}, request['memoryReserveBytes']):
                    raise MemoryError('Observed cgroup working-set estimate reached the declared supervisor reserve')
            if now - last_event[0] >= 2:
                last_event[0] = now
                observed = resource_record(os.getpid())
                shapes = [list(value.shape) for value in values if hasattr(value, 'shape')]
                progress('source-module', operation=stage, module=name, phase=phase, shapes=shapes,
                         memory=observed)

        hooks = []
        for name, module in model.named_modules():
            if not list(module.children()):
                hooks.append(module.register_forward_pre_hook(
                    lambda _module, args, name=name: module_observation(name, 'before', args)))
                hooks.append(module.register_forward_hook(
                    lambda _module, _args, output, name=name: module_observation(name, 'after', (output,))))
        operations = ['encode', 'decode'] if request['operation'] == 'both' else [request['operation']]
        for operation in operations:
            stage = operation
            progress('operation-start', operation=operation)
            if operation == 'encode':
                input_shape, output_shape = case['rgbShape'], case['latentShape']
                input_name, output_name, kind = 'rgb-input.f32', 'mean-reference.f32', 'rgb'
                meaning = 'Raw posterior mean; no stochastic sampling or latent normalization'
            else:
                input_shape, output_shape = case['latentShape'], case['decodeRgbShape']
                input_name, output_name, kind = 'decode-raw-input.f32', 'decode-rgb-reference.f32', 'raw-latent'
                meaning = 'Raw RGB from independent unnormalized raw latent; no output clipping or channel normalization'
            report['references'][operation] = {'input': write_pattern(destination / input_name, input_shape, kind, np)}
            # Copy-on-write mapping preserves external bytes; source receives literal actual F.
            mapped = np.memmap(destination / input_name, mode='c', dtype='<f4', shape=tuple(input_shape))
            tensor = torch.from_numpy(mapped)
            operation_start = time.monotonic()
            with torch.inference_mode():
                result = model.encode(tensor, [0., 1.]) if operation == 'encode' else model.decode(tensor, [0., 1.])
            report['references'][operation]['output'] = write_tensor(destination / output_name, result, output_shape, meaning, np)
            report['operations'][operation] = {'status': 'REFERENCE_WRITTEN',
                                                'nativeSeconds': time.monotonic() - operation_start,
                                                'inputShape': input_shape, 'outputShape': output_shape,
                                                'rawScale': [0., 1.], 'allValuesPreserved': True}
            del result, tensor, mapped
            progress('operation-complete', operation=operation)
        for hook in hooks:
            hook.remove()
        report['status'] = 'REFERENCE_WRITTEN'
        report['acceptance'] = 'NOT_COMPARED: external independent references only; no WASM or production-runtime acceptance claimed'
    except BaseException as error:
        report['status'] = 'FAILED'
        report['errors'].append({'stage': stage, 'type': type(error).__name__, 'message': str(error),
                                 'traceback': traceback.format_exc()})
    finally:
        report['elapsedSeconds'] = time.monotonic() - started
        report['workerPeakRssBytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
        write_json(destination / 'reference-report.json', report)
    if report['status'] == 'FAILED':
        raise SystemExit(1)


def supervise(request, destination):
    worker = multiprocessing.get_context('spawn').Process(target=execute_reference,
                                                          args=(request, str(destination)))
    worker.start()
    peaks = {'rssBytes': 0, 'pssBytes': 0, 'cgroupCurrentBytes': 0,
             'cgroupInactiveFileBytes': 0, 'cgroupAnonBytes': 0,
             'cgroupShmemBytes': 0, 'cgroupWorkingSetBytes': 0}
    terminated, sample_count = False, 0
    with (destination / 'resources.jsonl').open('x') as log:
        while worker.is_alive():
            record = resource_record(worker.pid)
            log.write(json.dumps(record) + '\n')
            log.flush()
            sample_count += 1
            for key in ('rssBytes', 'pssBytes'):
                peaks[key] = max(peaks[key], record['process'][key] or 0)
            peaks['cgroupCurrentBytes'] = max(peaks['cgroupCurrentBytes'], record['cgroup']['currentBytes'] or 0)
            for observed, peak in [('inactiveFileBytes', 'cgroupInactiveFileBytes'), ('anonBytes', 'cgroupAnonBytes'),
                                   ('shmemBytes', 'cgroupShmemBytes'), ('workingSetBytes', 'cgroupWorkingSetBytes')]:
                peaks[peak] = max(peaks[peak], record['cgroup'][observed] or 0)
            if memory_guard(record, request['memoryReserveBytes']):
                terminated = True
                worker.terminate()
                worker.join(timeout=5)
                if worker.is_alive():
                    worker.kill()
                break
            worker.join(timeout=.25)
    worker.join()
    report_path = destination / 'reference-report.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {'status': 'FAILED', 'errors': []}
    report['resourceObservation'] = {'peaks': peaks, 'samples': sample_count,
                                    'sampleIntervalSeconds': .25, 'workerExitCode': worker.exitcode,
                                    'terminatedForCgroupReserve': terminated,
                                    'finalCgroup': read_cgroup_memory(), 'log': 'resources.jsonl',
                                    'scope': 'Sampled RSS/PSS and shared cgroup raw current/inactive_file/anon/shmem/working-set estimate. Guard excludes only observed inactive_file; shmem/tmpfs remains charged. Cgroup includes other processes; sampling may miss transients.'}
    report['observedTensorFiles'] = [{'file': path.name, 'bytes': path.stat().st_size}
                                      for path in sorted(destination.glob('*.f32'))]
    if terminated or worker.exitcode:
        report['status'] = 'FAILED'
        report.setdefault('errors', []).append({'stage': 'supervisor',
                                                'type': 'ResourceLimit' if terminated else 'WorkerExit',
                                                'message': 'Observed cgroup working-set estimate reached reserve; owned worker stopped' if terminated else f'Owned worker exited {worker.exitcode}'})
    write_json(report_path, report)
    print(json.dumps({'status': report['status'], 'report': str(report_path),
                      'resourceObservation': report['resourceObservation']}), flush=True)
    return 0 if report['status'] == 'REFERENCE_WRITTEN' else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--operation', choices=['encode', 'decode', 'both'], required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Fresh private directory, preferably coordinator-selected /tmp scratch')
    parser.add_argument('--deps', type=Path)
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--memory-reserve-bytes', type=int, default=268435456,
                        help='Explicit supervisor cgroup reserve; default256MiB, not a model memory requirement')
    args = parser.parse_args(argv)
    case = case_by_id(args.case_id)
    if not re.fullmatch('[0-9a-f]{40}', args.execution_source_sha):
        parser.error('--execution-source-sha must identify a full40hex development commit')
    if args.memory_reserve_bytes < 0:
        parser.error('--memory-reserve-bytes must be nonnegative')
    destination = create_output(args.output)
    needed = 0
    if args.operation in ('encode', 'both'):
        needed += (math.prod(case['rgbShape']) + math.prod(case['latentShape'])) * 4
    if args.operation in ('decode', 'both'):
        needed += (math.prod(case['latentShape']) + math.prod(case['decodeRgbShape'])) * 4
    free = shutil.disk_usage(destination).free
    if needed > free:
        write_json(destination / 'reference-report.json', {'status': 'FAILED', 'case': case,
                   'errors': [{'stage': 'output-preflight', 'type': 'InsufficientStorage',
                               'requiredTensorBytes': needed, 'availableBytes': free}]})
        return 1
    request = {'caseId': args.case_id, 'operation': args.operation,
               'model': str(args.model.resolve()), 'deps': str(args.deps.resolve()) if args.deps else None,
               'executionSourceSha': args.execution_source_sha, 'memoryReserveBytes': args.memory_reserve_bytes}
    return supervise(request, destination)


if __name__ == '__main__':
    raise SystemExit(main())
