"""Independent six-NN sampler reference for the frozen controlled N5/L3 case.

Only the independent full40 NumPy reference is reused. No candidate, WASM,
JavaScript, ORT output, receipt, or expected prediction is an arithmetic input.
The original81-frame workload remains a separate, unverified acceptance scope.
"""
import argparse
import ast
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location('independent_full40', HERE / 'standalone-reference.py')
REF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REF)
np = REF.np
EVIDENCE = ROOT / 'development/ai-connection/standalone-d1-d4-20261102/sampler-reference'
CONTRACT = EVIDENCE / 'contract.json'
FULL_CONTRACT = ROOT / 'development/ai-connection/standalone-d1-d4-20261102/reference/contract.json'
INVESTIGATION = Path('/workspace/work/diffusion-investigation')
SOURCES = {
    'comfy/model_sampling.py': INVESTIGATION / 'references/comfy_model_sampling.py',
    'comfy/samplers.py': INVESTIGATION / 'references/comfy_samplers.py',
    'comfy/k_diffusion/sampling.py': INVESTIGATION / 'references/comfy_k_diffusion_sampling.py',
    'comfy/latent_formats.py': INVESTIGATION / 'model-architecture/comfy_latent_formats.py',
    'comfy/ldm/wan/model.py': INVESTIGATION / 'model-architecture/comfy_ldm_wan_model.py',
}
PROFILE = 'bernini-independent-six-step-full40-controlled-n5-l3-v1'
GATE = {'abs': 0.01, 'rel': 0.001}
SHAPE = [1, 16, 1, 2, 4]
NAMES = ['initialX'] + ['velocity' + str(i).zfill(2) for i in range(6)] + ['step' + str(i).zfill(2) + 'X' for i in range(6)] + ['highPublic', 'lowEntry', 'finalRaw']
sha = lambda raw: hashlib.sha256(raw).hexdigest()
require = REF.require


def source_hashes():
    values = {key: sha(path.read_bytes()) for key, path in SOURCES.items()}
    values['tools/diffusion-models/standalone-reference.py'] = sha((HERE / 'standalone-reference.py').read_bytes())
    values['tools/diffusion-models/standalone-sampler-reference.py'] = sha(Path(__file__).read_bytes())
    return values


def wan_constants():
    """Read exact literal channel constants, without executing torch/source."""
    module = ast.parse(SOURCES['comfy/latent_formats.py'].read_text())
    cls = next(node for node in module.body if isinstance(node, ast.ClassDef) and node.name == 'Wan21')
    init = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == '__init__')
    result = {}
    for node in init.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Attribute) or not isinstance(target.value, ast.Name) or target.value.id != 'self':
            continue
        if target.attr == 'scale_factor':
            result[target.attr] = float(ast.literal_eval(node.value))
        elif target.attr in ('latents_mean', 'latents_std'):
            tensor = node.value.func.value
            require(isinstance(tensor, ast.Call) and isinstance(tensor.func, ast.Attribute) and tensor.func.attr == 'tensor', 'Original Wan21 literal torch.tensor declaration required')
            result[target.attr] = REF.f32(ast.literal_eval(tensor.args[0]), [1, 16, 1, 1, 1])
    require(result['scale_factor'] == 1 and np.all(result['latents_std'] > 0), 'Original Wan2116-channel scale profile required')
    return result['latents_mean'], result['latents_std'], np.float32(result['scale_factor'])


def schedule():
    # Original PyTorch default F32 table, including the multiplier round-trip.
    t = np.divide(np.arange(1, 1001, dtype=np.float32), np.float32(1000), dtype=np.float32)
    t = np.divide(np.multiply(t, np.float32(1000), dtype=np.float32), np.float32(1000), dtype=np.float32)
    table = np.divide(np.multiply(np.float32(5), t, dtype=np.float32), np.add(np.float32(1), np.multiply(np.float32(4), t, dtype=np.float32), dtype=np.float32), dtype=np.float32)
    indices = [999 - int(i * (1000 / 6)) for i in range(6)]
    sigmas = np.asarray([table[index] for index in indices] + [np.float32(0)], dtype='<f4')
    return indices, sigmas, np.multiply(sigmas[:6], np.float32(1000), dtype=np.float32)


def noise_mix(noise, latent, sigma):
    sigma = np.float32(sigma)
    return REF.f32(np.add(np.multiply(sigma, np.multiply(np.float32(1), REF.f32(noise), dtype=np.float32), dtype=np.float32), np.multiply(np.subtract(np.float32(1), sigma, dtype=np.float32), REF.f32(latent), dtype=np.float32), dtype=np.float32))


def euler(x, velocity, sigma, next_sigma):
    sigma, next_sigma = np.float32(sigma), np.float32(next_sigma)
    denoised = np.subtract(x, np.multiply(velocity, sigma, dtype=np.float32), dtype=np.float32)
    derivative = np.divide(np.subtract(x, denoised, dtype=np.float32), sigma, dtype=np.float32)
    return REF.f32(np.add(x, np.multiply(derivative, np.subtract(next_sigma, sigma, dtype=np.float32), dtype=np.float32), dtype=np.float32))


def inverse(x, sigma):
    sigma = np.float32(sigma)
    require(sigma != np.float32(1), 'CONST inverse is singular at sigma1')
    return REF.f32(np.divide(x, np.subtract(np.float32(1), sigma, dtype=np.float32), dtype=np.float32))


def process_out(x):
    mean, std, scale = wan_constants()
    return REF.f32(np.add(np.divide(np.multiply(REF.f32(x, SHAPE), std, dtype=np.float32), scale, dtype=np.float32), mean, dtype=np.float32))


def process_in(raw, skip_all_zero=False):
    raw = REF.f32(raw, SHAPE)
    if skip_all_zero and not np.count_nonzero(raw):
        return raw.copy()
    mean, std, scale = wan_constants()
    return REF.f32(np.divide(np.multiply(np.subtract(raw, mean, dtype=np.float32), scale, dtype=np.float32), std, dtype=np.float32))


def identities(fixture):
    text = fixture['conditioning']
    return {
        'noise': REF.identity(REF.f32(fixture['construction']['explicitNoise'], SHAPE)),
        'tensors': {tensor['requirementId']: REF.identity(REF.f32(tensor['data'], tensor['shape'])) for tensor in fixture['tensors']},
        'positive': REF.identity(REF.f32(text['data'], text['shape'])),
        'negative': REF.identity(REF.f32(text['data'], text['shape'])),
        'maskSHA256': sha(np.asarray(text['attentionMask'], dtype='u1').tobytes()),
        'textModelSha256': text['modelSha256'], 'tokenizerSha256': text['tokenizerSha256'],
    }


def build_contract(fixture_path):
    fixture, full_contract, full_hash = REF.load_fixture(fixture_path, FULL_CONTRACT)
    indices, sigmas, timesteps = schedule()
    return {
        'schemaVersion': 'bernini-independent-sampler-contract/0.1', 'profileId': PROFILE,
        'status': 'PRE_EXECUTION_GATE_FIXED', 'gateMayNotBeRelaxedAfterComparison': True,
        'gate': GATE, 'fixtureSHA256': full_contract['fixtureSHA256'], 'fixtureBytes': fixture_path.stat().st_size,
        'full40ContractSHA256': full_hash, 'inputIdentities': identities(fixture),
        'sourceCommit': 'b5a432157de6b8884f81104cd02926adf4d597e4', 'sourceSHA256': source_hashes(),
        'schedule': {'name': 'simple6/shift5/split3', 'indices': indices, 'sigmas': sigmas.tolist(), 'timesteps': timesteps.tolist(), 'sideOrder': ['HIGH'] * 3 + ['LOW'] * 3, 'sampler': 'Euler', 'cfg': 1},
        'initialTarget': 'Original frozen target bytes retained, including its construction F32(rawMean+F32(.75*noise)); initial sigma1 CONST coefficient on target equals zero. No target replacement.',
        'contexts': 'Frozen source/reference already declared Wan21-normalized; no further context normalization. Same ordered population in all six predictions.',
        'conditioning': 'Positive and negative are separate snapshots of identical controlled L3 descriptor and mask111. Negative is validated and not evaluated at CFG1. Not real Text producer evidence.',
        'highLowOrder': 'Three HIGH Euler updates -> CONST inverse at sigma3 -> Wan21 process_out -> Wan21 process_in unless whole raw is zero -> CONST mix with zero noise at sigma3 -> three LOW Euler updates',
        'finalOrder': 'CONST inverse at sigma0 -> Wan21 process_out exactly once for final generated sample; not posterior-mean restoration',
        'arithmetic': {'model': 'Independent F64 dot/attention and staged F32 boundaries from separately frozen full40 reference; no runtime output as predictor', 'pointwise': 'Separate NumPy F32 operations at every original source expression boundary; no algebraic simplification/fused multiply-add'},
        'traceShapes': {name: SHAPE for name in NAMES}, 'models': full_contract['models'],
        'scope': {'sixFull40ControlledCaseOnly': True, 'originalWorkflowInputsVerified': False, 'producerVerified': False, 'required81FrameWorkflowVerified': False, 'originalProductionPrecisionVerified': False, 'load': 'NOT_READY', 'predict': 'NOT_READY', 'sample': 'NOT_READY', 'generationReady': False},
    }


def self_test():
    indices, sigmas, times = schedule()
    expected = np.asarray([1, .9617158770561218, .9092148542404175, .8333333134651184, .7148972749710083, .5005995035171509, 0], dtype='<f4')
    require(indices == [999, 833, 666, 499, 333, 166] and np.array_equal(sigmas.view('<u4'), expected.view('<u4')), 'Exact original simple6 table required')
    require(np.array_equal(times, np.multiply(expected[:6], np.float32(1000), dtype=np.float32)), 'Original timestep scaling required')
    x = np.arange(128, dtype=np.float32).reshape(SHAPE) / np.float32(32)
    noise = -x.copy()
    require(np.array_equal(noise_mix(noise, x, 1), noise), 'Initial sigma1 input must equal explicit noise')
    velocity = np.full(SHAPE, np.float32(2))
    require(np.array_equal(euler(x, velocity, .5, .25), x - np.float32(.5)), 'Staged Euler literal case required')
    zero = np.zeros(SHAPE, dtype='<f4'); zero.flat[1] = -0.0
    require(np.array_equal(process_in(zero, True).view('<u4'), zero.view('<u4')), 'Whole-zero skip must preserve signed zero')
    require(np.count_nonzero(process_in(zero, False)) == 128, 'Whole-zero skip differs from process_in of zero')
    mean, _, _ = wan_constants()
    require(np.array_equal(process_out(np.zeros(SHAPE, dtype='<f4')), np.broadcast_to(mean, SHAPE)), 'process_out channel constants and axes required')
    require(len(NAMES) == len(set(NAMES)) == 16, 'Exact16 diagnostic arrays required')
    print(json.dumps({'passed': True, 'tests': 8, 'neuralInferenceExecuted': False}))


def execute(args):
    contract, contract_hash = REF.read_json(args.contract)
    require(contract == build_contract(args.fixture), 'Exact pre-execution sampler contract and source bytes required')
    fixture, _, _ = REF.load_fixture(args.fixture, FULL_CONTRACT)
    indices, sigmas, timesteps = schedule()
    parameters = {}
    arrays, started = {}, time.perf_counter()
    try:
        for side in ('HIGH', 'LOW'):
            parameters[side] = REF.Parameters(args.models / REF.MODELS[side][0], side, args.tile_rows)
        noise = REF.f32(fixture['construction']['explicitNoise'], SHAPE)
        x = noise_mix(noise, REF.f32(fixture['tensors'][0]['data'], SHAPE), sigmas[0])
        arrays['initialX'] = x.copy()
        for step in range(6):
            side = 'HIGH' if step < 3 else 'LOW'
            prediction_input = copy.deepcopy(fixture)
            prediction_input['tensors'][0]['data'] = x.reshape(-1).tolist()
            prediction_input['timestep'] = float(timesteps[step])
            def progress(block, digest):
                print(json.dumps({'step': step, 'side': side, 'finishedBlock': block, 'elapsedSeconds': time.perf_counter() - started, 'outputSHA256': digest['sha256']}), file=sys.stderr, flush=True)
            prediction = REF.run_reference(parameters[side], prediction_input, progress)
            velocity = prediction['prediction'].copy()
            del prediction
            arrays['velocity' + str(step).zfill(2)] = velocity
            x = euler(x, velocity, sigmas[step], sigmas[step + 1])
            arrays['step' + str(step).zfill(2) + 'X'] = x.copy()
            if step == 2:
                raw = process_out(inverse(x, sigmas[3]))
                arrays['highPublic'] = raw.copy()
                x = noise_mix(np.zeros(SHAPE, dtype='<f4'), process_in(raw, True), sigmas[3])
                arrays['lowEntry'] = x.copy()
        arrays['finalRaw'] = process_out(inverse(x, sigmas[6]))
    finally:
        cleanup_errors = []
        for source in parameters.values():
            try:
                source.close()
            except Exception as error:
                cleanup_errors.append(error)
        if cleanup_errors:
            raise ExceptionGroup('Independent sampler reference cleanup failed', cleanup_errors)
    require(set(arrays) == set(NAMES) and all(np.isfinite(value).all() for value in arrays.values()), 'All16 independent finite sampler arrays required')
    require(contract == build_contract(args.fixture), 'Sampler sources changed during execution')
    common = {'profileId': PROFILE, 'fixtureSHA256': contract['fixtureSHA256'], 'samplerContractSHA256': contract_hash, 'gate': GATE, 'arrayIdentities': {name: REF.identity(value) for name, value in arrays.items()}, 'scope': contract['scope']}
    private = {'schemaVersion': 'bernini-independent-sampler-reference/0.1', **common, 'arrays': {name: {'shape': SHAPE, 'data': value.reshape(-1).tolist()} for name, value in arrays.items()}}
    raw = REF.private_write(args.output, private)
    receipt = {'schemaVersion': 'bernini-independent-sampler-receipt/0.1', **common, 'referenceSHA256': sha(raw), 'referenceBytes': len(raw), 'sourceSHA256': source_hashes(), 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'numpy': np.__version__, 'blasThreads': 1, 'tileRows': args.tile_rows, 'neuralPredictions': 6, 'blocksPerPrediction': 40, 'sideOrder': contract['schedule']['sideOrder'], 'elapsedSeconds': time.perf_counter() - started, 'payloadBytesRead': {side: value.payload_read for side, value in parameters.items()}, 'maxDecodedWeightTileBytes': args.tile_rows * 13824 * 4, 'fullFileSHA256Recomputed': False, 'privateValuesPublished': False, 'threadContention': 'Shared four-CPU cgroup; concurrent native browser work may affect timings'}
    require(not args.receipt.exists(), 'New receipt path required')
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'arrays': 16, 'independentSixNNExecuted': True, 'referenceSHA256': sha(raw), 'required81FrameWorkflowVerified': False}))


def compare_saved(args):
    reference, reference_hash = REF.read_json(args.reference)
    receipt, _ = REF.read_json(args.receipt)
    contract, contract_hash = REF.read_json(args.contract)
    candidate, candidate_hash = REF.read_json(args.candidate)
    require(contract.get('schemaVersion') == 'bernini-independent-sampler-contract/0.1' and contract['status'] == 'PRE_EXECUTION_GATE_FIXED' and contract['traceShapes'] == {name: SHAPE for name in NAMES} and contract['profileId'] == PROFILE and contract['gate'] == GATE and contract['gateMayNotBeRelaxedAfterComparison'] is True, 'Fixed unrelaxed sampler contract required')
    require(reference.get('schemaVersion') == 'bernini-independent-sampler-reference/0.1' and receipt.get('schemaVersion') == 'bernini-independent-sampler-receipt/0.1', 'Independent sampler reference/receipt schemas required')
    require(reference['profileId'] == receipt['profileId'] == PROFILE and reference['samplerContractSHA256'] == receipt['samplerContractSHA256'] == contract_hash, 'Exact independent contract binding required')
    require(reference_hash == receipt['referenceSHA256'] and args.reference.stat().st_size == receipt['referenceBytes'], 'Separate independent reference receipt required')
    require(receipt.get('sourceSHA256') == contract['sourceSHA256'] and receipt.get('arrayIdentities') == reference['arrayIdentities'] and reference.get('gate') == receipt.get('gate') == GATE, 'Independent source/array/gate bindings required')
    require(candidate.get('schemaVersion') == 'bernini-model-sampler-private/0.1' and isinstance(candidate.get('sourceCommit'), str) and len(candidate['sourceCommit']) == 40 and all(value in '0123456789abcdef' for value in candidate['sourceCommit']), 'Native source-pinned sampler diagnostic schema required')
    require(candidate.get('fixtureSHA256') == contract['fixtureSHA256'] == reference['fixtureSHA256'] and candidate.get('mode') == 'diagnose' and candidate.get('nativeSixFull40PredictionsExecuted') is True, 'Native full six-prediction diagnostic evidence required')
    require(candidate.get('samplerContractSHA256') == contract_hash, 'Native diagnostic sampler contract identity required')
    require(set(reference['arrays']) == set(candidate['arrays']) == set(reference['arrayIdentities']) == set(NAMES), 'All16 native/reference arrays required')
    comparisons = {}
    for name in NAMES:
        actual, expected = candidate['arrays'][name], reference['arrays'][name]
        require(actual['shape'] == expected['shape'] == SHAPE, 'Exact native/reference NCTHW target shape required')
        expected_values = REF.f32(expected['data'], SHAPE)
        require(REF.identity(expected_values) == reference['arrayIdentities'][name], 'Reference payload identity mismatch')
        comparisons[name] = REF.compare_arrays(REF.f32(actual['data'], SHAPE), expected_values, GATE)
    result = {'schemaVersion': 'bernini-independent-sampler-comparison/0.1', 'profileId': PROFILE, 'samplerContractSHA256': contract_hash, 'fixtureSHA256': contract['fixtureSHA256'], 'referenceSHA256': reference_hash, 'candidateSHA256': candidate_hash, 'gate': GATE, 'comparisons': comparisons, 'passed': all(value['failed'] == 0 for value in comparisons.values()), 'scope': contract['scope']}
    require(not args.output.exists(), 'New comparison path required')
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'arrays': 16, 'failedElements': sum(value['failed'] for value in comparisons.values())}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    sub.add_parser('self-test')
    freeze = sub.add_parser('freeze')
    freeze.add_argument('--fixture', type=Path, required=True)
    freeze.add_argument('--contract', type=Path, default=CONTRACT)
    run = sub.add_parser('run')
    run.add_argument('--fixture', type=Path, required=True)
    run.add_argument('--contract', type=Path, default=CONTRACT)
    run.add_argument('--models', type=Path, default=Path('/workspace/work/retained/bernini'))
    run.add_argument('--tile-rows', type=int, default=128)
    run.add_argument('--output', type=Path, required=True)
    run.add_argument('--receipt', type=Path, required=True)
    compare = sub.add_parser('compare')
    compare.add_argument('--reference', type=Path, required=True)
    compare.add_argument('--receipt', type=Path, required=True)
    compare.add_argument('--contract', type=Path, default=CONTRACT)
    compare.add_argument('--candidate', type=Path, required=True)
    compare.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.operation == 'self-test':
        self_test()
    elif args.operation == 'freeze':
        require(not args.contract.exists(), 'New pre-execution contract path required')
        args.contract.parent.mkdir(parents=True, exist_ok=True)
        raw = (json.dumps(build_contract(args.fixture), indent=2) + '\n').encode()
        args.contract.write_bytes(raw)
        print(json.dumps({'contractSHA256': sha(raw), 'neuralInferenceExecuted': False}))
    elif args.operation == 'run':
        require(1 <= args.tile_rows <= 128, 'Bounded independent weight tiles1..128 required')
        execute(args)
    else:
        compare_saved(args)


if __name__ == '__main__':
    main()
