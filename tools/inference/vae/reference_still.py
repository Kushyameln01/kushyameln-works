#!/usr/bin/env python3
"""Independent original-weight FP32 reference for a native-size opaque still.

Private outputs only. This is a profile acceptance harness, not media resizing.
"""
import argparse
import hashlib
import json
from pathlib import Path
import resource
import sys
import time


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--deps', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    manifest = json.loads((args.bundle / 'manifest.json').read_text())
    assert manifest['profile']['videoShape'] == plan['videoShape']
    assert manifest['profile']['latentShape'] == plan['latentShape']
    assert plan['videoShape'][2] == 1
    root = Path(__file__).resolve().parent
    assert sha(root / 'vendor/vae.py') == plan['source']['sha256']
    model_path = Path(plan['model']['path'])
    assert sha(model_path) == plan['model']['sha256']
    image_path = Path(plan['input']['path'])
    assert sha(image_path) == plan['input']['sha256']
    if args.output.exists():
        raise FileExistsError('Use a fresh private reference directory')
    if 'docs' in args.output.resolve().parts:
        raise ValueError('Private references must stay outside docs/')
    args.output.mkdir(parents=True)
    sys.path[:0] = [str(args.deps.resolve()), str(root / 'vendor')]
    import numpy as np
    import onnx
    from PIL import Image
    import torch
    from safetensors.torch import load_file
    from vae import WanVAE_
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    image = Image.open(image_path)
    assert image.mode == 'RGB' and image.size == tuple(plan['videoShape'][3:][::-1])
    assert not image.getexif() and 'icc_profile' not in image.info
    pixels = np.asarray(image, dtype=np.uint8)
    unit = (pixels.transpose(2, 0, 1).astype(np.float32) / np.float32(255)).reshape(plan['videoShape'])
    raw = unit * np.float32(2) + np.float32(-1)
    with torch.device('meta'):
        model = WanVAE_(dim=96, z_dim=16, dim_mult=[1, 2, 4, 4], num_res_blocks=2,
                        attn_scales=[], temperal_downsample=[False, True, True], dropout=0.)
    state = load_file(str(model_path))
    assert len(state) == 194
    loaded = model.load_state_dict(state, strict=True, assign=True)
    del state
    model = model.float().eval()
    started = time.monotonic()
    with torch.inference_mode():
        mean = model.encode(torch.from_numpy(raw.copy()), [0., 1.])
        decoded = model.decode(mean, [0., 1.])
    assert list(mean.shape) == plan['latentShape']
    assert list(decoded.shape) == plan['videoShape']
    elapsed = time.monotonic() - started
    records = {}
    for name, array in [('png-unit', unit), ('png-raw', raw), ('png-mean', mean.numpy()),
                        ('png-roundtrip', decoded.numpy())]:
        array = np.asarray(array, dtype='<f4')
        assert np.isfinite(array).all()
        path = args.output / (name + '.f32')
        path.write_bytes(array.tobytes())
        records[name] = {'file': path.name, 'shape': list(array.shape), 'bytes': path.stat().st_size,
                         'sha256': sha(path), 'elements': array.size}
    graphs = {}
    for role in ['encoder', 'decoderBody']:
        asset = manifest['assets'][role]
        path = args.bundle / asset['file']
        assert sha(path) == asset['sha256']
        graph = onnx.load(str(path), load_external_data=False)
        onnx.checker.check_model(graph)
        external = [t.name for t in graph.graph.initializer if t.data_location == onnx.TensorProto.EXTERNAL]
        assert not external, 'This exported profile uses embedded ONNX weights'
        dims = lambda value: [d.dim_param or d.dim_value for d in value.type.tensor_type.shape.dim]
        expected_input = plan['videoShape'] if role == 'encoder' else plan['latentShape']
        expected_output = plan['latentShape'] if role == 'encoder' else plan['videoShape']
        assert dims(graph.graph.input[0]) == expected_input
        declared_output = dims(graph.graph.output[0])
        assert len(declared_output) == len(expected_output)
        assert all(isinstance(d, str) or d == expected_output[i] for i, d in enumerate(declared_output))
        graphs[role] = {'file': path.name, 'sha256': sha(path), 'bytes': path.stat().st_size,
                        'input': expected_input, 'expectedRuntimeOutput': expected_output,
                        'onnxOutputDeclaration': declared_output,
                        'outputShapeAcceptance': 'Native reference exact shape; real SDK must also check all runtime dimensions. Symbolic ONNX metadata is not arbitrary-shape support.',
                        'opsets': [{'domain': o.domain, 'version': o.version} for o in graph.opset_import],
                        'externalWeightFiles': [], 'weightStorage': 'embedded initializer bytes'}
    report = {'scope': 'V1 F=1 unchanged-size diagnostic still, native FP32 encode-mean and raw decode',
              'modelSha256': plan['model']['sha256'], 'source': plan['source'],
              'strictLoad': {'keys': 194, 'missing': list(loaded.missing_keys), 'unexpected': list(loaded.unexpected_keys)},
              'precision': plan['precision'], 'comparisonGate': plan['comparisonGate'], 'references': records,
              'graphs': graphs, 'torchVersion': torch.__version__, 'threads': torch.get_num_threads(),
              'nativeInferenceSeconds': elapsed, 'processPeakRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
              'inputPixelResize': False, 'padding': False, 'frameReduction': False}
    (args.output / 'reference-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
