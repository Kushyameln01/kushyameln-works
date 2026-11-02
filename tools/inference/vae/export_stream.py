#!/usr/bin/env python3
"""Export the original Wan2.1 VAE as private spatially dynamic streaming units.

The exported unit graphs expose causal history as tensor inputs and outputs.
They retain the supplied model's coefficients, use FP32 arithmetic, and require
the streaming program to preserve native temporal order. Export is preparation;
native-reference and browser acceptance are separate steps.
"""

import argparse
import hashlib
import json
import pathlib
import re
import sys
import time


ROOT = pathlib.Path(__file__).resolve().parent
MODEL_HASH = '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
STATE_KEYS = 194


def sha(path):
    digest = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(16 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    parser.add_argument('--deps', type=pathlib.Path,
                        help='Optional isolated dependency directory; installs nothing')
    return parser.parse_args(argv)


def private_destination(path):
    destination = pathlib.Path(path).resolve()
    if 'docs' in destination.parts:
        raise ValueError('Private streaming output must be outside public docs/')
    if destination.exists():
        raise FileExistsError('Select a new output directory; existing bundles are not overwritten')
    return destination


def asset_filename(identifier):
    if not isinstance(identifier, str) or not identifier:
        raise ValueError('Streaming unit identifiers must be nonempty strings')
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', identifier)
    safe = re.sub(r'\.{2,}', '_', safe)
    if not re.match(r'^[A-Za-z0-9]', safe):
        safe = 'unit_' + safe
    if len(safe) > 180:
        raise ValueError('Streaming unit identifier is too long')
    return safe + '.onnx'


def descriptor(path, **metadata):
    return {**metadata, 'file': path.name, 'bytes': path.stat().st_size,
            'sha256': sha(path)}


def export_unit(identifier, unit, destination, torch, onnx):
    """Export one bounded temporal step; only its spatial axes are symbolic."""
    metadata = dict(unit.metadata)
    input_names = metadata.get('inputNames')
    output_names = metadata.get('outputNames')
    for names in (input_names, output_names):
        if (not isinstance(names, list) or not names
                or any(not isinstance(name, str) or not name for name in names)
                or len(names) != len(set(names))):
            raise ValueError('Invalid streaming tensor names for ' + identifier)
    examples = unit.example_inputs(height=2, width=2)
    if not isinstance(examples, tuple) or len(examples) != len(input_names):
        raise ValueError('Streaming example input count mismatch for ' + identifier)
    actual = unit(*examples)
    outputs = actual if isinstance(actual, tuple) else (actual,)
    if len(outputs) != len(output_names):
        raise ValueError('Streaming example output count mismatch for ' + identifier)
    dynamic_axes = {}
    for name, tensor in zip(input_names + output_names, examples + outputs):
        if tensor.ndim not in (4, 5):
            raise ValueError('Expected NCHW or NCTHW streaming tensors for ' + identifier)
        # Input and output sizes can differ for a spatial resampling unit.
        # Distinct symbols describe that relationship without fixing either size.
        dynamic_axes[name] = {tensor.ndim - 2: name + '_height',
                              tensor.ndim - 1: name + '_width'}
        if metadata.get('kind') == 'add':
            dynamic_axes[name][1] = 'channels'
    path = destination / asset_filename(identifier)
    torch.onnx.export(
        unit, examples, str(path), opset_version=17,
        input_names=input_names, output_names=output_names,
        dynamic_axes=dynamic_axes, dynamo=False, do_constant_folding=True,
    )
    onnx.checker.check_model(str(path))
    graph = onnx.load(str(path), load_external_data=False).graph
    if ([entry.name for entry in graph.input] != input_names
            or [entry.name for entry in graph.output] != output_names):
        raise ValueError('Export dropped or changed explicit streaming I/O for ' + identifier)
    for entry in list(graph.input) + list(graph.output):
        dimensions = entry.type.tensor_type.shape.dim
        if len(dimensions) not in (4, 5) or any(
                not dimension.dim_param for dimension in dimensions[-2:]):
            raise ValueError('Streaming spatial axes became fixed for ' + identifier)
    return descriptor(path, **metadata)


def main(argv=None):
    options = args(argv)
    destination = private_destination(options.output)
    if sha(options.model) != MODEL_HASH:
        raise ValueError('Original Wan2.1 VAE model SHA256 mismatch')
    source = json.loads((ROOT / 'vendor/source.json').read_text())
    if sha(ROOT / 'vendor/vae.py') != source['sha256']:
        raise ValueError('Pinned official VAE source hash mismatch')
    if options.deps:
        sys.path.insert(0, str(options.deps.resolve()))
    sys.path[:0] = [str(ROOT / 'vendor'), str(ROOT)]
    import numpy as np
    import onnx
    import torch
    from safetensors.torch import load_file
    from nearest_exact_symbolic import register
    from stream_program import build_program
    from vae import WanVAE_

    register()
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    with torch.device('meta'):
        model = WanVAE_(dim=96, z_dim=16, dim_mult=[1, 2, 4, 4],
                        num_res_blocks=2, attn_scales=[],
                        temperal_downsample=[False, True, True], dropout=0.)
    state = load_file(str(options.model))
    if len(state) != STATE_KEYS:
        raise ValueError('Original Wan2.1 VAE must contain all 194 state keys')
    loaded = model.load_state_dict(state, strict=True, assign=True)
    del state
    model = model.float().eval()
    if list(model.conv2.weight.shape) != [16, 16, 1, 1, 1]:
        raise ValueError('Unexpected original decoder conv2 shape')
    program = build_program(model)
    if set(program.programs) != {'encode', 'decode'} or not program.units:
        raise ValueError('Streaming program must provide encode and decode units')
    filenames = [asset_filename(identifier) for identifier in program.units]
    if len(set(filenames)) != len(filenames):
        raise ValueError('Streaming unit identifiers collide after filename sanitization')
    # Resolve every schema value before creating private output files.
    json.dumps(program.programs)
    for unit in program.units.values():
        json.dumps(unit.metadata)
    manifest = {
        'schemaVersion': 1,
        'kind': 'wan21-vae-stream-v1',
        'model': {
            'sha256': MODEL_HASH, 'storedDtype': 'bfloat16',
            'executionDtype': 'float32',
            'precisionNote': 'Stored BF16 coefficients are unchanged. FP32 arithmetic is not asserted identical to BF16 execution.',
        },
        'source': source,
        'profile': {
            'id': 'wan21-raw-f32-stream', 'layout': 'NCTHW',
            'latentSpace': 'raw', 'posterior': 'mean', 'opset': 17,
        },
        'domain': {
            'maxSourceFrames': 81, 'minSpatial': 16,
            'maxSpatial': 848, 'spatialStride': 16,
        },
        'inference': {
            'executionProvider': 'wasm', 'threads': 1,
            'graphOptimizationLevel': 'disabled',
        },
        'programs': program.programs,
        'assets': {},
        'semantics': {
            'encode': 'RGB [-1,1] to raw posterior mean; no sampling or latent normalization.',
            'decode': 'Independent raw latent input through original Hike conv2 and decoder body; raw RGB output without clipping.',
            'temporal': 'Native core consumes 1 + 4*floor((sourceFrames-1)/4) source frames and emits 1 + floor((sourceFrames-1)/4) latent steps; incomplete trailing groups are unused. Decoder emits one RGB frame initially and four per continuation.',
            'spatial': 'Symbolic spatial axes; no spatial tiling or altered attention boundaries.',
        },
        'lowering': {
            'operation': 'nearest-exact 2x -> ONNX Resize nearest half_pixel round_prefer_floor',
            'sourceSha256': sha(ROOT / 'nearest_exact_symbolic.py'), 'opset': 17,
        },
        'versions': {'torch': torch.__version__, 'onnx': onnx.__version__,
                     'numpy': np.__version__},
        'validation': {
            'status': 'exported; native-reference and browser validation required',
            'strictModelState': True, 'keys': STATE_KEYS,
            'missingKeys': list(loaded.missing_keys),
            'unexpectedKeys': list(loaded.unexpected_keys),
        },
        'comparisonGate': {'atol': .002, 'rtol': .002, 'maxAbs': .002,
                           'scope': 'FP32 reference; acceptance must be recorded separately'},
    }
    destination.mkdir(parents=True)
    started = time.monotonic()
    with torch.inference_mode():
        for identifier, unit in program.units.items():
            manifest['assets'][identifier] = export_unit(
                identifier, unit, destination, torch, onnx)
        for role, filename, tensor in (
            ('conv2Weight', 'conv2-weight.f32', model.conv2.weight.reshape(16, 16)),
            ('conv2Bias', 'conv2-bias.f32', model.conv2.bias),
        ):
            path = destination / filename
            array = tensor.detach().cpu().numpy().astype('<f4')
            path.write_bytes(array.tobytes())
            manifest['assets'][role] = descriptor(path, shape=list(array.shape))
    manifest['exportSeconds'] = time.monotonic() - started
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'manifest': str(destination / 'manifest.json'),
                      'unitCount': len(program.units),
                      'validation': manifest['validation']}))


if __name__ == '__main__':
    main()
