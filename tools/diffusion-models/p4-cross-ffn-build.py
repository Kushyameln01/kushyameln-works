"""Inventory the separate P4 candidate, without changing historical native build100."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
BASE = 'docs/shared/diffusion-models/ort-bridge/'
ENTRIES = [BASE + 'post-self-attention/' + name for name in
           ('stage.mjs', 'source.mjs', 'weights.mjs', 'conditioning.mjs')]
ENTRIES += ['docs/shared/diffusion-models/diagnostics/p4-cross-ffn/' + name
            for name in ('run.mjs', 'feed.mjs')]
EXTRA = ['tools/diffusion-models/' + name for name in
         ('p4-cross-ffn-build.py', 'p4-cross-ffn-browser.py',
          'p4-cross-ffn-feed-browser.py', 'p4-cross-ffn-reference.py',
          'tail-browser.py', 'resource-browser.py')]
EXTRA += [BASE + 'post-self-attention/' + name for name in
          ('math.hike', 'build.py', 'build-record.json', 'kernel.wat', 'runtime.js')]
EXTRA += ['development/ai-connection/p4-cross-ffn/core/' + name for name in
          ('candidate-plan.json', 'fixture-contract.json')]
EXTRA += ['development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory():
    files, visited = {}, set()
    kernel = ROOT / BASE / 'post-self-attention'
    record = json.loads((kernel / 'build-record.json').read_bytes())
    for field, name in [('sourceSha256', 'math.hike'), ('hostSha256', 'math.mjs'),
                        ('builderSha256', 'build.py'), ('wasmSha256', 'kernel.wasm'),
                        ('watSha256', 'kernel.wat'), ('runtimeSha256', 'runtime.js')]:
        if digest((kernel / name).read_bytes()) != record[field]:
            raise ValueError('P4 Hike source/build/kernel receipt mismatch: ' + name)

    def visit(relative):
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise ValueError('Missing or escaping P4 dependency: ' + relative)
        relative = path.relative_to(ROOT).as_posix()
        if relative in visited:
            return
        visited.add(relative)
        data = path.read_bytes()
        files[relative] = {'sha256': digest(data), 'byteLength': len(data)}
        if path.suffix not in ('.js', '.mjs'):
            return
        text = data.decode()
        targets = re.findall(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]''', text)
        targets += re.findall(r'''new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url''', text)
        for target in targets:
            child = (path.parent / target).resolve()
            # Directory URLs are roots, not executable files. Model/private URLs
            # are not served by these modules and cannot become dependencies.
            if child.is_dir():
                continue
            visit(child.relative_to(ROOT).as_posix())

    for entry in ENTRIES + EXTRA:
        visit(entry)
    # Authenticate the reused native100 closure separately; do not retag it as
    # containing this new independent ES entrypoint or mutate its build-info.
    api = ROOT / 'docs/shared/diffusion-models/api'
    old_text = (api / 'build-info.mjs').read_text()
    old_sources = json.loads(re.search(r'Object.freeze\((\{.*\})\);', old_text, re.S)[1])
    for name, expected in old_sources.items():
        if digest((api / name).read_bytes()) != expected:
            raise ValueError('Historical native source changed: ' + name)
    old_digest = digest(json.dumps(old_sources, sort_keys=True, separators=(',', ':')).encode())
    if len(old_sources) != 100 or old_digest != 'bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74':
        raise ValueError('Historical native100 inventory identity mismatch')
    stable = dict(sorted(files.items()))
    serialized = json.dumps(stable, sort_keys=True, separators=(',', ':')).encode()
    h = digest(serialized)
    return {'schemaVersion': 'bernini-p4-candidate-build/0.1',
            'executionProfileId': 'bernini-block0-n2-cross-ffn-f32-candidate-v1',
            'buildId': 'bernini-p4-cross-ffn/0.1+' + h,
            'sourceInventorySHA256': h, 'sourceCount': len(stable),
            'entrypoints': ENTRIES, 'sources': stable,
            'historicalNativeSourceCountVerified': len(old_sources),
            'historicalNativeBuildUnchanged': 'diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74',
            'scope': 'Separate P4 runtime/import/assets plus selected source/harness closure; source identity only, not numerical or production acceptance',
            'generationReady': False, 'load': 'NOT_READY', 'predict': 'NOT_READY', 'sample': 'NOT_READY'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'development/ai-connection/p4-cross-ffn/build.json')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    value = inventory()
    if args.check:
        if json.loads(args.output.read_bytes()) != value:
            raise ValueError('P4 candidate source/build inventory mismatch')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(value, indent=2) + '\n')
    print(json.dumps({'passed': True, 'buildId': value['buildId'], 'sourceCount': value['sourceCount'], 'checkOnly': args.check}))


if __name__ == '__main__':
    main()
