"""Binary-artifact transport around the unchanged independent P4 numeric oracle.

Compose mode must finish and its manifest identity be frozen before the runtime
starts. Local mode checks binary runtime cuts, recomposes identically, then
compares all25 local and pre-runtime composed cuts with the original gates.
"""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import time

for _thread_variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[_thread_variable] = '1'
import numpy as np

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('prepare_real_text', HERE / 'prepare-input.py')
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)
ROOT = PREPARE.ROOT
NATIVE_SHA256 = '9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8'
BROWSER_VERIFIER = ROOT / 'tools/diffusion-models/p4-cross-ffn-browser.py'
BROWSER_VERIFIER_SHA256 = '141ab992ec58f3b985e739ec00f79ec98b03d0bbfc4d1581bc4131a3c986707b'
require = PREPARE.require
sha = PREPARE.sha


def concrete_shapes(oracle):
    return {key: [512 if axis == 'L' else axis for axis in shape]
            for key, shape in oracle.ARRAY_SHAPES.items()}


def load_inputs(side, native_path, saved_tail):
    oracle, plan = PREPARE.load_oracle()
    text_payload, artifact = oracle.read_json(native_path)
    require(artifact == NATIVE_SHA256, 'Frozen real native Text artifact changed')
    text, mask, metadata = oracle.validate_native_text(text_payload)
    require(text.shape == (512, 4096) and oracle.identity(text)['sha256'] == PREPARE.PAYLOAD_SHA256 and sha(mask.tobytes()) == PREPARE.MASK_SHA256, 'Frozen real Text payload/mask changed')
    inputs, anchor = oracle.saved_inputs(side, saved_tail, plan)
    bindings = oracle.runtime_binding({
        'savedArtifactSHA256': anchor['savedArtifactSHA256'],
        'conditioningDataSHA256': PREPARE.PAYLOAD_SHA256,
        'conditioningMaskSHA256': PREPARE.MASK_SHA256,
        'nativeTextArtifactSHA256': artifact,
    })
    metadata['inputArtifactSHA256'] = artifact
    return oracle, plan, inputs, text, bindings, metadata


def load_binary_arrays(manifest_path, manifest, oracle):
    shapes = concrete_shapes(oracle)
    descriptors = manifest.get('arrays')
    identities = manifest.get('outputIdentities')
    require(isinstance(descriptors, dict) and set(descriptors) == set(shapes) and isinstance(identities, dict) and set(identities) == set(shapes), 'All and only25 binary array descriptors/identities required')
    arrays = {}
    root = Path(manifest_path).resolve().parent
    for key, shape in shapes.items():
        entry, expected = descriptors[key], identities[key]
        require(isinstance(entry, dict) and entry.get('path') == key + '.f32' and entry.get('dtype') == 'float32' and entry.get('shape') == shape, 'Exact binary array name/dtype/shape required: ' + key)
        path = root / entry['path']
        require(path.resolve().parent == root and path.is_file() and not path.is_symlink(), 'Binary array path escape/non-file: ' + key)
        raw = path.read_bytes()
        wanted_bytes = math.prod(shape) * 4
        digest = sha(raw)
        require(len(raw) == wanted_bytes == entry.get('bytes') and digest == entry.get('sha256'), 'Binary array byte extent/SHA256 mismatch: ' + key)
        require(expected == {'shape': shape, 'elements': math.prod(shape), 'bytes': wanted_bytes, 'sha256': digest}, 'Binary native output identity mismatch: ' + key)
        array = np.frombuffer(raw, dtype='<f4').reshape(shape).copy()
        require(np.isfinite(array).all(), 'Nonfinite binary F32 array: ' + key)
        require(oracle.identity(array) == expected, 'Binary F32 identity changed: ' + key)
        arrays[key] = array
    return arrays


def runtime_cuts(manifest_path, side, oracle, plan, bindings):
    manifest, digest = oracle.read_json(manifest_path)
    require(manifest.get('schemaVersion') == 'bernini-p4-real-text-l512-runtime/0.1' and manifest.get('side') == side and manifest.get('candidatePlanSHA256') == oracle.PLAN_SHA256, 'Frozen binary runtime schema/side/plan mismatch')
    require(manifest.get('inputBindings') == bindings, 'Frozen binary runtime input identity mismatch')
    evidence = manifest.get('evidence')
    require(isinstance(evidence, dict) and evidence.get('schemaVersion') == 'bernini-post-self-attention-evidence/0.1' and evidence.get('executionProfileId') == plan['profileId'] and evidence.get('side') == side, 'Exact runtime evidence required before binary cuts')
    case = plan['cases'][side]
    input_hashes = {
        'residualSHA256': case['residualSHA256'], 'timeAct1SHA256': case['timeAct1SHA256'],
        'conditioningSHA256': bindings['conditioningDataSHA256'],
        'conditioningMaskSHA256': bindings['conditioningMaskSHA256'],
    }
    require(isinstance(evidence.get('inputHashes'), dict) and all(evidence['inputHashes'].get(key) == value for key, value in input_hashes.items()), 'Runtime input bit hashes mismatch')
    outputs = evidence.get('outputHashes')
    require(isinstance(outputs, dict) and set(outputs) == {key + 'SHA256' for key in oracle.ARRAY_SHAPES}, 'All and only25 native runtime output bit hashes required')
    arrays = load_binary_arrays(manifest_path, manifest, oracle)
    require(all(outputs[key + 'SHA256'] == oracle.identity(array)['sha256'] for key, array in arrays.items()), 'Binary output hashes mismatch runtime native evidence')
    return arrays, manifest, digest


def composed_reference(path, expected_sha, side, oracle, bindings):
    manifest, digest = oracle.read_json(path)
    require(digest == expected_sha, 'Pre-runtime composed manifest frozen SHA256 mismatch')
    require(manifest.get('schemaVersion') == 'bernini-p4-real-text-l512-reference-arrays/0.1' and manifest.get('mode') == 'COMPOSED_BEFORE_RUNTIME' and manifest.get('side') == side and manifest.get('candidatePlanSHA256') == oracle.PLAN_SHA256, 'Pre-runtime composed schema/mode/side/plan mismatch')
    require(manifest.get('inputBindings') == bindings and manifest.get('independentOracleSHA256') == PREPARE.ORACLE_SHA256, 'Pre-runtime composed input/oracle identity mismatch')
    return load_binary_arrays(path, manifest, oracle), manifest, digest


def binary_write(path, raw):
    require(path.is_absolute() and path.resolve().is_relative_to(Path('/tmp')) and not path.exists(), 'New private binary output under /tmp required')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)


def save_arrays(output_dir, arrays, oracle):
    descriptors, identities = {}, {}
    for key in oracle.ARRAY_SHAPES:
        array = arrays[key]
        raw = np.asarray(array, dtype='<f4', order='C').tobytes()
        identity = oracle.identity(array)
        binary_write(output_dir / (key + '.f32'), raw)
        descriptors[key] = {'path': key + '.f32', 'dtype': 'float32', 'shape': identity['shape'], 'bytes': len(raw), 'sha256': sha(raw)}
        identities[key] = identity
    return descriptors, identities


def parameter_proof(actual, expected):
    require(sha(BROWSER_VERIFIER.read_bytes()) == BROWSER_VERIFIER_SHA256, 'Retained strict parameter verifier source changed')
    spec = importlib.util.spec_from_file_location('frozen_p4_parameter_verifier', BROWSER_VERIFIER)
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    return verifier.verify_parameter_identities(actual, expected)


def generate(args):
    os.umask(0o077)
    oracle, plan, inputs, text, bindings, metadata = load_inputs(args.side, args.text, args.saved_tail)
    actual = runtime_manifest = runtime_sha = frozen = frozen_manifest = frozen_sha = None
    if args.mode == 'local':
        require(args.runtime_manifest is not None and args.composed_manifest is not None and args.composed_manifest_sha256 is not None, 'Local mode requires runtime manifest and frozen pre-runtime composed manifest SHA256')
        frozen, frozen_manifest, frozen_sha = composed_reference(args.composed_manifest, args.composed_manifest_sha256, args.side, oracle, bindings)
        actual, runtime_manifest, runtime_sha = runtime_cuts(args.runtime_manifest, args.side, oracle, plan, bindings)
    else:
        require(args.runtime_manifest is None and args.composed_manifest is None and args.composed_manifest_sha256 is None, 'Compose-before-runtime mode does not accept runtime predecessors')
    started = time.perf_counter()
    source = oracle.Parameters(args.models / oracle.MODELS[args.side][0], args.side, plan, [])
    try:
        composed, local = oracle.run_reference(source, inputs, text, actual)
    finally:
        source.close()
    mode = 'COMPOSED_BEFORE_RUNTIME' if actual is None else 'LOCAL_RUNTIME_CUTS'
    arrays = composed if actual is None else local
    comparisons = None
    proof = None
    if actual is not None:
        require(all(oracle.identity(composed[key]) == frozen_manifest['outputIdentities'][key] for key in oracle.ARRAY_SHAPES), 'Recomposed numerical reference differs from frozen pre-runtime reference')
        require(source.sources == frozen_manifest['parameterSources'], 'Immutable parameter sources differ from pre-runtime composed reference')
        proof = parameter_proof(runtime_manifest['evidence'].get('parameterSources'), source.sources)
        comparisons = {
            'composed': {key: oracle.compare(actual[key], frozen[key], plan['gates']['composed']) for key in oracle.ARRAY_SHAPES},
            'local': {key: oracle.compare(actual[key], local[key], plan['gates']['localCut']) for key in oracle.ARRAY_SHAPES},
        }
    descriptors, identities = save_arrays(args.output_dir, arrays, oracle)
    manifest = {
        'schemaVersion': 'bernini-p4-real-text-l512-reference-arrays/0.1',
        'mode': mode, 'side': args.side, 'candidatePlanSHA256': oracle.PLAN_SHA256,
        'profileId': plan['profileId'], 'modelHash': oracle.MODELS[args.side][1],
        'headerSHA256': oracle.MODELS[args.side][2],
        'weightFeed': {'inputClass': 'immutable-original-base', 'patchCount': 0, 'lowRankMathImplemented': False},
        'inputBindings': bindings, 'conditioning': metadata,
        'independentOracleSHA256': PREPARE.ORACLE_SHA256,
        'transportGeneratorSHA256': sha(Path(__file__).read_bytes()),
        'parameterSources': source.sources, 'outputIdentities': identities,
        'arrays': descriptors, 'gates': plan['gates'], 'readiness': plan['readiness'],
    }
    if runtime_sha is not None:
        manifest.update(runtimeManifestSHA256=runtime_sha, preRuntimeComposedManifestSHA256=frozen_sha)
    raw = oracle.private_write(args.output_dir / 'manifest.json', manifest)
    receipt = {key: value for key, value in manifest.items() if key != 'arrays'}
    receipt.update(
        schemaVersion='bernini-p4-real-text-l512-reference-receipt/0.1',
        referenceManifestSHA256=sha(raw), referenceManifestBytes=len(raw),
        selectedOriginalFileBytesRead=source.total, selectedPayloadBytesRead=source.payload_bytes,
        maxPayloadReadBytes=source.max_payload_read, matrixTiles=source.tiles,
        originalReadCalls=source.reads, fullFileSHA256Recomputed=False,
        prefixRecomputed=False, privateArraysPublished=False,
        originalProductionPrecisionVerified=False, elapsedSeconds=time.perf_counter() - started,
        referenceBackend={'numpy': np.__version__, **plan['precision'], 'blasThreads': 1},
    )
    if comparisons is not None:
        receipt.update(comparisons=comparisons, parameterProof=proof,
                       passed=all(cut['failed'] == 0 for group in comparisons.values() for cut in group.values()),
                       preRuntimeComposedArraysReproducedBitExactly=True)
    require(not args.receipt.exists(), 'New reference receipt path required')
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
    return {'side': args.side, 'mode': mode, 'referenceManifestPath': str(args.output_dir / 'manifest.json'), 'referenceManifestSHA256': sha(raw), 'receiptPath': str(args.receipt), 'passed': receipt.get('passed')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('compose', 'local'), required=True)
    parser.add_argument('--models', type=Path, default=Path('/workspace/work/retained/bernini'))
    parser.add_argument('--side', choices=('HIGH', 'LOW'), required=True)
    parser.add_argument('--saved-tail', type=Path, required=True)
    parser.add_argument('--text', type=Path, default=Path('/tmp/p4-real-text-l512/inputs/real-text-l512-native.json'))
    parser.add_argument('--runtime-manifest', type=Path)
    parser.add_argument('--composed-manifest', type=Path)
    parser.add_argument('--composed-manifest-sha256')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    print(json.dumps(generate(parser.parse_args())))


if __name__ == '__main__':
    main()
