"""Bounded real-base/F32 consumer test. No LoRA files or full model inference."""
import argparse
import hashlib
import http.server
import json
import math
from pathlib import Path
import struct
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = Path('/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
W = 'blocks.0.cross_attn.q.weight'
B = 'blocks.0.cross_attn.q.bias'

def f32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]

def fixture(path):
    with path.open('rb') as stream:
        n = struct.unpack('<Q', stream.read(8))[0]
        header_bytes = stream.read(n)
        header = json.loads(header_bytes)
        assert hashlib.sha256(header_bytes).hexdigest() == '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'
        def raw(key, count):
            d = header[key]
            width = {'F8_E4M3': 1, 'F16': 2, 'F32': 4}[d['dtype']]
            stream.seek(8 + n + d['data_offsets'][0])
            data = stream.read(count * width)
            assert len(data) == count * width
            return data
        scale = struct.unpack('<f', raw(W[:-7] + '.weight_scale', 1))[0]
        # Independent scalar E4M3FN decode, then explicit F32 scalar scaling.
        def decode(value):
            sign = -1 if value & 128 else 1
            exponent, mantissa = (value >> 3) & 15, value & 7
            if exponent == 15 and mantissa == 7:
                raise ValueError('Nonfinite FP8 base')
            number = mantissa / 8 * 2 ** -6 if exponent == 0 else (1 + mantissa / 8) * 2 ** (exponent - 7)
            return f32(sign * number * scale)
        weight = [decode(value) for value in raw(W, 20480)]
        bias = list(struct.unpack('<4e', raw(B, 4)))
    final_weight = [f32(value + ((i % 7) - 3) / 8192) for i, value in enumerate(weight)]
    final_bias = [f32(value + (i + 1) / 64) for i, value in enumerate(bias)]
    x = [0.0] * 10240
    for row in range(2):
        for i, (index, value) in enumerate([(0, .25), (37, -.5), (1023, .75), (5119, -.125)]):
            x[row * 5120 + index] = value * (row + 1)
    def projection(values, additive):
        return [sum(x[row * 5120 + k] * values[col * 5120 + k] for k in range(5120)) + additive[col] for row in range(2) for col in range(4)]
    return {'baseWeight': weight, 'baseBias': bias, 'finalWeight': final_weight, 'finalBias': final_bias, 'x': x, 'baseOutput': projection(weight, bias), 'finalOutput': projection(final_weight, final_bias)}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'docs'), **kwargs)
    def log_message(self, *args):
        pass

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=DEFAULT_BASE)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    diagnostic = fixture(args.base)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.set_content('<input type="file" id="base">')
                page.locator('#base').set_input_files(str(args.base))
                result = page.evaluate("""async diagnostic=>{const m=await import('/shared/diffusion-models/execution/test-model-weight-feed-browser.mjs');return m.runFullWeightFeedRealBaseCase({file:document.querySelector('#base').files[0],diagnostic});}""", diagnostic)
                result['chromiumVersion'] = browser.version
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    paths = ['docs/shared/diffusion-models/execution/' + name for name in ['model-weight-feed.mjs', 'model-weight-bindings.mjs', 'test-model-weight-feed-browser.mjs']]
    result['sourceFiles'] = [{'path': name, 'bytes': (ROOT / name).stat().st_size, 'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()} for name in paths]
    result['originalBase'] = {'fileName': args.base.name, 'bytes': args.base.stat().st_size, 'headerSHA256': '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b', 'fullFileSHA256Recomputed': False}
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    print(text)

if __name__ == '__main__':
    main()
