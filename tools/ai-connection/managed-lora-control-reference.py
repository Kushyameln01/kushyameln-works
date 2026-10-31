#!/usr/bin/env python3
"""Management control reference with an explicitly synthetic immutable base.

Reuses the pinned owner's independent decoders/NumPy loader formula. This is
not a new real-base E1 trial or a substitute for the accepted twenty cases.
"""
import argparse
import importlib.util
import json
import pathlib
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--owner-reference', type=pathlib.Path, required=True)
    parser.add_argument('--input', type=pathlib.Path, required=True)
    parser.add_argument('--out', type=pathlib.Path, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('verified_owner_reference', args.owner_reference)
    owner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(owner)
    args.out.mkdir(parents=True, exist_ok=True)
    gates = {'scope': 'synthetic-manager-control-fixture', 'realBase': False,
             'loaderPolicyId': owner.POLICY, 'strengths': [0, 1, -1],
             'gates': owner.GATES, 'purpose': 'local File, state, ownership, save and cancellation'}
    (args.out / 'pre-execution-gates.json').write_text(json.dumps(gates, indent=2) + '\n')
    start, header, header_sha = owner.header(args.input)
    stem = owner.STEM
    down_name = stem + ('.lora_down.weight' if stem + '.lora_down.weight' in header else '.lora_A.weight')
    up_name = stem + ('.lora_up.weight' if stem + '.lora_up.weight' in header else '.lora_B.weight')
    rank = header[down_name]['shape'][0]
    if header[down_name]['shape'] != [rank, 5120] or header[up_name]['shape'] != [5120, rank]:
        raise ValueError('Control reference requires the explicitly selected 2D Q target')
    down, down_range = owner.tensor(args.input, start, header, down_name)
    up, up_range = owner.tensor(args.input, start, header, up_name, count=16 * rank)
    down, up = down.reshape(rank, 5120), up.reshape(16, rank)
    alpha = None
    ranges = [down_range, up_range]
    if stem + '.alpha' in header:
        value, record = owner.tensor(args.input, start, header, stem + '.alpha')
        alpha = float(value[0])
        ranges.append(record)
    has_bias = stem + '.diff_b' in header
    if has_bias:
        delta, record = owner.tensor(args.input, start, header, stem + '.diff_b', count=16)
        ranges.append(record)
    else:
        delta = np.zeros(16, dtype='<f4')
    base = np.zeros((16, 5120), dtype='<f4')
    base[:, 0] = .25 + (np.arange(16) % 4) * .0625
    base[:, 17], base[:, 5119] = -.125, .5
    bias = np.arange(16, dtype='<f4') / 128
    x = np.zeros(5120, dtype='<f4')
    x[[0, 17, 5119]] = [.25, -.5, 1]
    result = {'scope': gates['scope'], 'realBase': False, 'loaderPolicyId': owner.POLICY,
              'gates': owner.GATES, 'rank': rank, 'alpha': alpha, 'hasBias': has_bias,
              'input': {'fileName': args.input.name, 'byteLength': args.input.stat().st_size,
                        'headerSha256': header_sha, 'fullFileHashComputedByOracle': False,
                        'ranges': ranges},
              'baseWeight': owner.write_array(args.out, 'fixture-base-weight.f32', base),
              'baseBias': owner.write_array(args.out, 'fixture-base-bias.f32', bias),
              'activation': owner.write_array(args.out, 'activation.f32', x),
              'baseExpectedOutput': (base.astype(np.float64) @ x.astype(np.float64) + bias).astype('<f4').tolist(),
              'cases': []}
    for strength in gates['strengths']:
        weight = owner.merge_reference(base, down, up, strength, alpha)
        selected_bias = (bias + np.float32(strength) * delta).astype('<f4')
        output = (weight @ x.astype(np.float64) + selected_bias.astype(np.float64)).astype('<f4')
        name = 'local-positive-s' + str(strength)
        result['cases'].append({'id': name, 'strength': strength,
                                'weight': owner.write_array(args.out, name + '-weight.f64', weight.astype('<f8')),
                                'bias': owner.write_array(args.out, name + '-bias.f32', selected_bias),
                                'expectedOutput': output.tolist()})
    (args.out / 'reference.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'scope': result['scope'], 'cases': len(result['cases']), 'realBase': False}))


if __name__ == '__main__':
    main()
