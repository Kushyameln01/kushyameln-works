#!/usr/bin/env python3
"""Snapshot proposed inference public files for review; never approve or publish."""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOTS = ('docs/shared/inference', 'docs/text-encoder', 'docs/vae')
EXTRA = ('docs/github/index.html',)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def record(path):
    data = path.read_bytes()
    return {'path': path.relative_to(REPO).as_posix(), 'bytes': len(data), 'sha256': digest(data)}


def source(path):
    return record(REPO / path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=REPO / 'development/inference/publication-candidate.json')
    parser.add_argument('--evidence-root', type=Path, help='Optional existing session evidence; never copied into public files')
    args = parser.parse_args()
    registry_path = REPO / 'security/public-files.json'
    if args.output.resolve() == registry_path.resolve() or (REPO / 'docs') in args.output.resolve().parents:
        raise ValueError('Inventory output must not overwrite public assets or the approval registry')
    registry_before = registry_path.read_bytes()
    approved = set(json.loads(registry_before)['files'])
    kernel = json.loads((REPO / 'tools/inference/kernel/manifest.json').read_text())
    license_sources = json.loads((REPO / 'docs/shared/inference/vendor/license-sources.json').read_text())
    for item in license_sources:
        actual = source('docs/shared/inference/vendor/' + item['file'])
        if actual['sha256'] != item['sha256']:
            raise ValueError('License source hash mismatch: ' + item['file'])
    artifacts = []
    for name in ROOTS:
        root = REPO / name
        if not root.is_dir() or root.is_symlink():
            raise ValueError('Missing or symlink candidate root: ' + name)
        artifacts.extend(p for p in root.rglob('*') if p.is_file())
        if any(p.is_symlink() for p in root.rglob('*')):
            raise ValueError('Symlink in candidate root: ' + name)
    artifacts.extend(REPO / name for name in EXTRA)
    entries = []
    for p in sorted(set(artifacts)):
        if p.is_symlink() or p.suffix in ('.onnx', '.safetensors'):
            raise ValueError('Unexpected model weights or symlink in candidate: ' + str(p))
        entry = record(p)
        public = p.relative_to(REPO / 'docs').as_posix()
        try:
            old = subprocess.check_output(['git', 'show', 'HEAD:' + entry['path']], cwd=REPO, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            old = None
        entry.update(public_path=public, change='added' if old is None else 'modified' if digest(old) != entry['sha256'] else 'unchanged',
                     path_already_in_registry=public in approved,
                     content_approval='pending-human-review', head_sha256=None if old is None else digest(old))
        if '/vendor/ort' in entry['path'] or p.name.startswith('ORT-'):
            entry['provenance'] = {'component': 'onnxruntime-web', 'version': '1.24.3', 'upstream': 'https://github.com/microsoft/onnxruntime/tree/v1.24.3', 'license': 'MIT', 'license_files': ['shared/inference/vendor/ORT-LICENSE.txt', 'shared/inference/vendor/ORT-ThirdPartyNotices.txt'], 'source_kind': 'pinned-package-dist' if p.name.startswith('ort') else 'pinned-license-notice'}
            if args.evidence_root and p.name.startswith('ort'):
                original = args.evidence_root / 'browser-proof/tooling/node_modules/onnxruntime-web/dist' / p.name
                entry['provenance']['installed_dist_match'] = original.is_file() and digest(original.read_bytes()) == entry['sha256']
        elif p.name in ('sentencepiece.mjs', 'SentencePiece-LICENSE.txt', 'SentencePiece-ThirdPartyNotices.txt'):
            entry['provenance'] = {'component': '@sctg/sentencepiece-js', 'version': '1.3.3', 'upstream_commit': '30916b62bae58f8bb9cd038d3b5e449eee4cae6e', 'upstream': 'https://github.com/sctg-development/sentencepiece-js', 'license': 'Apache-2.0 package; bundled MIT/BSD-3-Clause dependencies and original Microsoft helper notice', 'license_files': ['shared/inference/vendor/SentencePiece-LICENSE.txt', 'shared/inference/vendor/SentencePiece-ThirdPartyNotices.txt'], 'source_kind': 'esbuild-browser-bundle' if p.suffix == '.mjs' else 'pinned-license-notice', 'build_script': source('tools/inference/build-tokenizer.mjs'), 'build_tool': {'name': 'esbuild', 'version': '0.25.12'}, 'model_data': 'SentencePiece tokenizer model selected separately by caller; not included'}
        elif '/kernel/' in entry['path']:
            entry['provenance'] = {'component': 'Hike kernel/runtime', 'license': 'MIT for pinned Hike runtime; authored kernel distribution requires project review', 'license_files': ['shared/inference/kernel/LICENSE-Hike.txt'], 'upstream': 'https://github.com/kanryu/hike-lang', 'compiler_commit': kernel['compilerCommit'], 'compiler_sha256': kernel['compilerSha256'], 'backend': kernel['backend'], 'build_script': source('tools/inference/kernel/build.py'), 'kernel_source': source('tools/inference/kernel/tensor.hike'), 'declared_wasm_sha256': kernel['wasmSha256'], 'host_imports': kernel['imports']}
        else:
            entry['provenance'] = {'component': 'Kushyameln Works inference source/documentation', 'source_kind': 'local-authored-change', 'license': 'No root project LICENSE found; human review required', 'model_weights': 'not included'}
            if p.name in ('text-encoder.mjs', 'tokenizer.mjs', 'API.md'):
                entry['provenance']['behavior_reference_inventory'] = source('tools/inference/text-encoder/source-provenance.json')
                entry['provenance']['reference_source_license_notice'] = source('tools/inference/text-encoder/COMFYUI-LICENSE')
        entries.append(entry)
    output = {
        'schema_version': 1,
        'status': 'candidate-inventory-only-not-approved',
        'generated_at_jst': datetime.now(timezone(timedelta(hours=9))).isoformat(),
        'generator': source('tools/inference/publication-inventory.py'),
        'source_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
        'publication_rule': 'security/README.md: additions require human review of purpose, content, dependencies and license before registry edits; inventory is evidence, never approval',
        'registry_before_sha256': digest(registry_before),
        'registry_changed_by_generator': False,
        'candidate_roots': list(ROOTS), 'extra_modified_files': list(EXTRA),
        'file_count': len(entries), 'total_bytes': sum(x['bytes'] for x in entries),
        'model_weights_included': False, 'files': entries,
        'license_source_receipts': license_sources,
        'required_review': [
            'Purpose/content/dependency/license review of every added file and modified github/index.html before registry changes',
            'Generated runtime imports, embedded tokenizer runtime WASM, dynamically selected ORT runtime paths and local file privacy',
            'Project-owned source license and relationship to cited source references; included notices do not constitute approval',
            'Regenerate after final edits; this snapshot is stale if any source bytes change',
            'Public export remains blocked until approved registry is updated through its separate human review; no deployment performed'
        ],
        'relocation_baseline_note': {
            'failure': 'tests/relocation.mjs requires shared FT loader byte identity to security/relocation.json baseline134fa4e6cd32e783138f414f70e8c92121a112d8',
            'affected': 'docs/shared/ft/kernel/load-kernel.mjs',
            'old_bytes': 2472, 'old_sha256': '11bd7384cf7018ed36440436c1376c745f32bacd5ec96c94cdaf991be90b3853',
            'current_bytes': 3536, 'current_sha256': '709bde7dd4917669e2a7f24e9c562017c9175b45e4a839efb1849a9e3a4c86a6',
            'at_inspection': 'current file exactly equals HEAD; pre-existing loader digest/ownership hardening, not changed by inference work',
            'action': 'report existing historical-invariant drift; do not alter unrelated loader/test/relocation registry'
        }
    }
    if registry_path.read_bytes() != registry_before:
        raise RuntimeError('Registry changed concurrently; no inventory emitted')
    for entry in entries:
        if record(REPO / entry['path'])['sha256'] != entry['sha256']:
            raise RuntimeError('Candidate changed during inventory: ' + entry['path'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'files': len(entries), 'bytes': output['total_bytes'], 'approval': False, 'registry_unchanged': True}))


if __name__ == '__main__':
    main()
