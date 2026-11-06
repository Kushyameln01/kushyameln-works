"""Copy committed owner sources into the existing fixed native adoption layout."""
import argparse
import hashlib
import json
from pathlib import Path
import posixpath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = 'docs/shared/diffusion-models/api'
DEST = 'docs/shared/ai-connection/native/diffusion-pages-20261106'
BOOTSTRAP = 'docs/shared/ai-connection/adapters/diffusion-public/native.mjs'
OLD = 'ffeeeedb6b57d182a977c3ac02c042ce235fc87a'
MANAGER = 'e1661e561dfb1a4f20544ff48bc375175b5981d1'
sha = lambda value: hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    commit = args.source_commit
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Complete owner source commit required')

    def read(ref, path):
        return subprocess.check_output(['git', 'show', ref + ':' + path], cwd=ROOT)

    build = read(commit, BASE + '/build-info.mjs')
    inventory = json.loads(re.search(rb'BUILD_SOURCES=Object\.freeze\((\{.*?\})\);', build, re.S).group(1))
    build_id = re.search(rb'BUILD_ID=[\'\"]([^\'\"]+)[\'\"]', build).group(1).decode()
    sources = {}
    for relative, digest in inventory.items():
        path = posixpath.normpath(posixpath.join(BASE, relative))
        declared_source = path.startswith(('docs/', 'tools/inference/kernel/')) or path == 'development/inference/publication-candidate.json'
        if not declared_source or path.endswith(('.safetensors', '.wktensor', '.f32')):
            raise ValueError('Non-runtime owner asset rejected: ' + path)
        raw = read(commit, path)
        if sha(raw) != digest:
            raise ValueError('Committed build inventory is stale: ' + path)
        sources[path] = raw
    for path in [BASE + '/build-info.mjs', BASE + '/MODEL_RUNTIME.md', BASE + '/WEIGHT_PORT.md', BASE + '/NORMAL_GENERATION_INPUTS.md']:
        sources[path] = read(commit, path)
    records = []
    for path, raw in sorted(sources.items()):
        target = ROOT / DEST / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        records.append({'path': path, 'byteLength': len(raw), 'sha256': sha(raw)})
    digest = sha(json.dumps(records, separators=(',', ':')).encode())
    manifest = {'sourceCommit': commit, 'buildId': build_id,
                'entrypoint': BASE + '/index.mjs', 'ownerBuildSourceCount': len(inventory),
                'sourceDigest': digest, 'files': records, 'modelFilesEmbedded': False,
                'privatePayloadsEmbedded': False}
    manifest_bytes = (json.dumps(manifest, indent=2) + '\n').encode()
    (ROOT / DEST / 'SOURCE.json').write_bytes(manifest_bytes)
    bootstrap = read(MANAGER, BOOTSTRAP).decode()
    bootstrap = bootstrap.replace('diffusion-ffeeeedb/', 'diffusion-pages-20261106/')
    bootstrap = bootstrap.replace(OLD, commit)
    index_hash = sha(sources[BASE + '/index.mjs'])
    bootstrap = re.sub(r"(path:'docs/shared/diffusion-models/api/index.mjs',sha256:')[a-f0-9]+", r'\g<1>' + index_hash, bootstrap)
    bootstrap = bootstrap.replace('5df689d94e1eba9bcf326480caae5a77ff8e0d231b46ce8a6ae53683b0defa1d', sha(manifest_bytes))
    bootstrap += "\nexport const attachDiffusionPort=api.attachDiffusionPort;\nexport const createDiffusionWeightClient=api.createDiffusionWeightClient;\nexport const MAX_TENSOR_ELEMENTS=api.MAX_TENSOR_ELEMENTS;\n"
    bootstrap += "const shapes=await import(new URL('docs/shared/ai-connection/workflow-shapes.mjs',DIFFUSION_PUBLIC_ROOT_URL));\nexport const deriveWorkflowShapes=shapes.deriveWorkflowShapes;\n"
    target = ROOT / BOOTSTRAP
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(bootstrap)
    print(json.dumps({'sourceCommit': commit, 'buildId': build_id,
                      'files': len(records), 'bytes': sum(len(v) for v in sources.values()),
                      'manifestSHA256': sha(manifest_bytes), 'nativeRoot': DEST}))


if __name__ == '__main__':
    main()
