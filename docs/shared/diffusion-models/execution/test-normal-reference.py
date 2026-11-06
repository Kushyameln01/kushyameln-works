"""Independent Python F64 arithmetic gate for host Box-Muller initialization.

Only the frozen Uint32-to-normal transform is compared. This does not test
WebCrypto, reproduce a seeded RNG, execute a model, or establish NN acceptance.
"""
import json
import math
from pathlib import Path
import struct
import subprocess
import unittest


ABSOLUTE_GATE = 1e-6
RELATIVE_GATE = 1e-6
MODULE = Path(__file__).resolve().with_name('sample-initialization.mjs')


def f32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]


def f32_bits(value):
    return struct.unpack('<I', struct.pack('<f', value))[0]


def reference(words):
    """Compute F64 uniforms/Box-Muller independently, rounding only outputs."""
    result = []
    for index in range(0, len(words), 2):
        u1 = (words[index] + 0.5) / 4294967296
        u2 = (words[index + 1] + 0.5) / 4294967296
        radius = math.sqrt(-2 * math.log(u1))
        angle = 2 * math.pi * u2
        result.extend((f32(radius * math.cos(angle)),
                       f32(radius * math.sin(angle))))
    return result


def fixed_words():
    # Explicit discrete-uniform endpoints and both sides of the midpoint.
    landmarks = (0, 1, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff)
    words = [word for first in landmarks for second in landmarks
             for word in (first, second)]
    # Fixed arithmetic input pattern; no platform RNG or seed API is involved.
    for index in range(4096):
        words.extend(((index * 0x9e3779b1 ^ 0xa5a5a5a5) & 0xffffffff,
                      (index * 0x85ebca77 ^ 0x5a5a5a5a) & 0xffffffff))
    return words


NODE_DRIVER = r'''
import {readFileSync} from 'node:fs';
const {moduleURL, words} = JSON.parse(readFileSync(0, 'utf8'));
const {standardNormalFromWords} = await import(moduleURL);
const input = Uint32Array.from(words);
const before = input.slice();
const output = standardNormalFromWords(input);
if (Object.getPrototypeOf(output) !== Float32Array.prototype) {
  throw Error('The normal transform must return native Float32Array');
}
if (!input.every((word, index) => word === before[index])) {
  throw Error('The normal transform mutated caller entropy');
}
if (!output.every(Number.isFinite)) {
  throw Error('The normal transform returned nonfinite values');
}
process.stdout.write(JSON.stringify({
  values: Array.from(output),
  bits: Array.from(new Uint32Array(output.buffer, output.byteOffset, output.length))
}));
'''


class NormalReference(unittest.TestCase):
    def test_fixed_uint32_pairs_match_python_f64_reference(self):
        self.assertTrue(MODULE.is_file(), 'Host initialization module is missing')
        words = fixed_words()
        expected = reference(words)
        run = subprocess.run(
            ['node', '--input-type=module', '-e', NODE_DRIVER],
            input=json.dumps({'moduleURL': MODULE.as_uri(), 'words': words}),
            text=True, capture_output=True, check=False,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        actual = json.loads(run.stdout)
        self.assertEqual(len(actual['values']), len(expected))
        self.assertEqual(len(actual['bits']), len(expected))
        max_absolute = 0.0
        max_relative = 0.0
        exact_bits = 0
        for index, (value, oracle) in enumerate(zip(actual['values'], expected)):
            self.assertTrue(math.isfinite(value), f'Nonfinite output at {index}')
            difference = abs(value - oracle)
            max_absolute = max(max_absolute, difference)
            max_relative = max(max_relative, difference / max(abs(oracle), 1e-30))
            self.assertLessEqual(
                difference, ABSOLUTE_GATE + RELATIVE_GATE * abs(oracle),
                f'Python F64 normal-transform gate failed at value {index}',
            )
            exact_bits += actual['bits'][index] == f32_bits(oracle)
        print(json.dumps({
            'scope': 'host Box-Muller Uint32-to-F32 arithmetic only; no RNG or NN acceptance',
            'reference': 'independent Python math F64, struct F32 output rounding',
            'pairs': len(words) // 2,
            'values': len(expected),
            'exactF32Bits': exact_bits,
            'maxAbsolute': max_absolute,
            'maxRelative': max_relative,
            'gate': {'absolute': ABSOLUTE_GATE, 'relative': RELATIVE_GATE},
            'passed': True,
        }, sort_keys=True))


if __name__ == '__main__':
    unittest.main()
