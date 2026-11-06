#!/usr/bin/env python3
"""Build a private SGEMM-only F32 FMA runtime candidate. Never writes vendor assets.

The exact two source-pinned SGEMM bodies are isolated for WABT lowering. Only
their compiled bodies are spliced back; every other body/section stays byte exact.
No model inference, graph export, weight conversion or production adoption occurs.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE_SHA256 = 'be0e129949062ad50290ef94683fac8be5bb6156f709e030b7a5f1661a2f6c17'
PINNED_BODIES = {
    1365: (2040, 'f7728808b5f87253962b9f639f830459c0961fbc2cd2f8463534e97ae5a7e534'),
    1946: (1922, '9e72cc3a5fb5a445d440bf86c3de4b8bb338ee3773f763c730af6227034c8f08'),
}
SIGNATURE = ([0x7f] * 8 + [0x7d], [0x7f])


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _integer(raw, at):
    value = 0
    for shift in range(0, 70, 7):
        if at >= len(raw):
            raise ValueError('Truncated WASM integer')
        byte = raw[at]
        at += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, at
    raise ValueError('Oversized WASM integer')


def _encode(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def _section(kind, payload):
    return bytes([kind]) + _encode(len(payload)) + payload


def sections(raw):
    if raw[:8] != b'\0asm\1\0\0\0':
        raise ValueError('WASM1 module required')
    at, rows = 8, []
    while at < len(raw):
        begin, kind = at, raw[at]
        length, start = _integer(raw, at + 1)
        end = start + length
        if end > len(raw):
            raise ValueError('Truncated WASM section')
        rows.append({'kind': kind, 'raw': raw[begin:end], 'payload': raw[start:end]})
        at = end
    return rows


def _one_section(raw, kind):
    found = [row['payload'] for row in sections(raw) if row['kind'] == kind]
    if len(found) != 1:
        raise ValueError('Exactly one selected WASM section required')
    return found[0]


def _imported_functions(raw):
    payload = _one_section(raw, 2) if any(row['kind'] == 2 for row in sections(raw)) else b'\0'
    count, at = _integer(payload, 0)
    result = []
    for _ in range(count):
        for _ in range(2):
            size, at = _integer(payload, at)
            at += size
        kind = payload[at]
        at += 1
        if kind == 0:
            signature, at = _integer(payload, at)
            result.append(signature)
        elif kind in (1, 2):
            if kind == 1:
                at += 1
            flags, at = _integer(payload, at)
            _, at = _integer(payload, at)
            if flags & 1:
                _, at = _integer(payload, at)
        elif kind == 3:
            at += 2
        else:
            raise ValueError('Unsupported import kind')
    if at != len(payload):
        raise ValueError('WASM import boundary mismatch')
    return result


def code_bodies(raw):
    payload = _one_section(raw, 10)
    count, at = _integer(payload, 0)
    bodies = []
    for _ in range(count):
        size, begin = _integer(payload, at)
        at = begin + size
        if at > len(payload):
            raise ValueError('Truncated function body')
        bodies.append(payload[begin:at])
    if at != len(payload):
        raise ValueError('WASM code boundary mismatch')
    return bodies


def _function_signatures(raw):
    types = _one_section(raw, 1)
    count, at = _integer(types, 0)
    signatures = []
    for _ in range(count):
        if types[at] != 0x60:
            raise ValueError('Only function types in the selected runtime are supported')
        params, at = _integer(types, at + 1)
        arguments = list(types[at:at + params])
        returns, at = _integer(types, at + params)
        results = list(types[at:at + returns])
        at += returns
        signatures.append((arguments, results))
    imported = _imported_functions(raw)
    functions = _one_section(raw, 3)
    count, at = _integer(functions, 0)
    ids = []
    for _ in range(count):
        kind, at = _integer(functions, at)
        ids.append(kind)
    return len(imported), [signatures[index] for index in imported + ids]


def inspect_selected_runtime(raw):
    if sha(raw) != SOURCE_SHA256:
        raise ValueError('Only the exact selected original runtime is supported')
    imported, signatures = _function_signatures(raw)
    candidates = [index for index, signature in enumerate(signatures) if signature == SIGNATURE]
    if imported != 99 or candidates != sorted(PINNED_BODIES):
        raise ValueError('Selected SGEMM function signature mapping changed')
    bodies = code_bodies(raw)
    records = {}
    for index, expected in PINNED_BODIES.items():
        body = bodies[index - imported]
        if (len(body), sha(body)) != expected:
            raise ValueError('Selected original SGEMM body changed')
        records[str(index)] = {'bytes': len(body), 'sha256': sha(body)}
    return {'sourceWasmSha256': SOURCE_SHA256, 'importedFunctions': imported,
            'selectedFunctionIndices': candidates, 'signature': {'parameters': SIGNATURE[0], 'returns': SIGNATURE[1]}, 'bodies': records}


def isolate_kernels(raw):
    found = inspect_selected_runtime(raw)
    all_bodies = code_bodies(raw)
    selected = [all_bodies[index - found['importedFunctions']] for index in found['selectedFunctionIndices']]
    names = [(b'memory', 2, 0), (b'zero', 0, 0), (b'add', 0, 1)]
    exports = _encode(3) + b''.join(_encode(len(name)) + name + bytes([kind]) + _encode(index) for name, kind, index in names)
    return (b'\0asm\1\0\0\0' + _section(1, b'\x01\x60\x09' + b'\x7f' * 8 + b'\x7d\x01\x7f')
            + _section(3, b'\x02\0\0') + _section(5, b'\x01\0\x01') + _section(7, exports)
            + _section(10, b'\x02' + b''.join(_encode(len(body)) + body for body in selected)))


def splice_bodies(raw, replacements):
    imported = len(_imported_functions(raw))
    bodies = code_bodies(raw)
    for index, replacement in replacements.items():
        if not imported <= index < imported + len(bodies):
            raise ValueError('Replacement function outside the original code section')
        bodies[index - imported] = replacement
    payload = _encode(len(bodies)) + b''.join(_encode(len(body)) + body for body in bodies)
    return b'\0asm\1\0\0\0' + b''.join(_section(10, payload) if row['kind'] == 10 else row['raw'] for row in sections(raw))


def verify_splice(original, candidate, expected):
    source_sections, changed_sections = sections(original), sections(candidate)
    if len(source_sections) != len(changed_sections):
        raise ValueError('Unexpected section count change')
    for left, right in zip(source_sections, changed_sections):
        if left['kind'] != right['kind'] or left['kind'] != 10 and left['raw'] != right['raw']:
            raise ValueError('Unexpected change to a non-code section')
    imported = len(_imported_functions(original))
    before, after = code_bodies(original), code_bodies(candidate)
    if len(before) != len(after):
        raise ValueError('Function body count changed')
    changed = [index + imported for index, (left, right) in enumerate(zip(before, after)) if left != right]
    if set(changed) != set(expected):
        raise ValueError('Unexpected function body changed or selected body unchanged')
    return {'changedFunctionIndices': changed, 'unchangedFunctionBodies': len(before) - len(changed), 'otherSectionsByteExact': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--wabt', type=Path, required=True, help='Existing WABT index.js, no toolchain installation')
    args = parser.parse_args()
    raw = args.source.read_bytes()
    found = inspect_selected_runtime(raw)
    if args.output.exists() or args.output.resolve().is_relative_to(HERE.parents[2] / 'docs'):
        raise ValueError('Fresh private output required')
    args.output.mkdir(parents=True)
    baseline = args.output / 'original-sgemm-kernels.wasm'
    baseline.write_bytes(isolate_kernels(raw))
    lowered = args.output / 'fma-sgemm-kernels.wasm'
    report_path = args.output / 'kernel-lowering.json'
    process = subprocess.run(['node', str(HERE / 'wasm-sgemm-fma.mjs'), '--wabt', str(args.wabt), '--input', str(baseline), '--output', str(lowered), '--report', str(report_path)], capture_output=True, text=True, check=True)
    candidate_bodies = code_bodies(lowered.read_bytes())
    if len(candidate_bodies) != 2:
        raise ValueError('Exactly two lowered kernel bodies required')
    replacements = dict(zip(found['selectedFunctionIndices'], candidate_bodies))
    candidate = splice_bodies(raw, replacements)
    boundary = verify_splice(raw, candidate, set(PINNED_BODIES))
    destination = args.output / 'ort-wasm-simd-threaded-fma-candidate.wasm'
    destination.write_bytes(candidate)
    validate = subprocess.run(['node', '--input-type=module', '-e', "import{readFile}from'node:fs/promises';const b=await readFile(process.argv[1]);if(!WebAssembly.validate(b))throw Error('Invalid private runtime');console.log('validated');", str(destination)], capture_output=True, text=True, check=True)
    report = {'schemaVersion': 1, 'status': 'diagnostic-only-unaccepted', 'variant': 'text-sgemm-f32-fma-v2-evaluation-order',
              'scope': 'Only two source-pinned MLAS SGEMM bodies; product vendor/VAE runtime untouched', 'newNeuralRuns': 0, 'newModelExports': 0,
              'source': {'path': str(args.source), 'bytes': len(raw), 'sha256': sha(raw)},
              'candidate': {'path': str(destination), 'bytes': len(candidate), 'sha256': sha(candidate)},
              'identification': found, 'boundary': boundary, 'lowering': json.loads(report_path.read_text()),
              'changedBodies': {str(index): {'bytes': len(body), 'sha256': sha(body)} for index, body in replacements.items()},
              'wabtCommand': process.args, 'wabtStdout': process.stdout, 'hostValidation': validate.stdout.strip(),
              'fmaSemantics': 'F32 relaxed_madd; host may choose fused or separate semantics, so host scalar canary and real local reference comparison remain required'}
    (args.output / 'runtime-candidate.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['status', 'newNeuralRuns', 'source', 'candidate', 'boundary']}))


if __name__ == '__main__':
    main()
