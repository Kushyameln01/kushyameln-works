#!/usr/bin/env python3
"""Fetch/check public fixed-source receipts. No model inputs or numerical execution."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import urllib.request

EXPECTED_INDEX_SHA256 = '1bcc24b0bc618ff56934d84585835f3554ae20ede48de2a6bf5889c49e079179'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--index', type=Path, default=Path(__file__).with_name('fixed-receipt-files.json'))
target = parser.add_mutually_exclusive_group(required=True)
target.add_argument('--out', type=Path, help='Create a new directory and download fixed public files')
target.add_argument('--check-dir', type=Path, help='Check already downloaded commit/path files without network')
args = parser.parse_args()
index_bytes = args.index.read_bytes()
if hashlib.sha256(index_bytes).hexdigest() != EXPECTED_INDEX_SHA256:
    raise SystemExit('Fixed file index SHA-256 mismatch')
index = json.loads(index_bytes)
root = args.out or args.check_dir
if args.out:
    root.mkdir(parents=True, exist_ok=False)
checks = []
for entry in index['files']:
    local = root / entry['commit'] / entry['path']
    url = f"https://raw.githubusercontent.com/{index['repository']}/{entry['commit']}/{entry['path']}"
    if args.out:
        local.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        local.write_bytes(data)
    else:
        data = local.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if len(data) != entry['bytes'] or sha256 != entry['sha256'] or blob != entry['gitBlobSHA1']:
        raise SystemExit(f"File bytes/SHA mismatch: {entry['commit']}/{entry['path']}")
    if entry['path'].endswith('run-result.json.gz'):
        digest, length = hashlib.sha256(), 0
        with gzip.open(local, 'rb') as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
                length += len(chunk)
        if length != index['decodedGzip']['bytes'] or digest.hexdigest() != index['decodedGzip']['sha256']:
            raise SystemExit('Decoded receipt bytes/SHA mismatch')
    checks.append({'commit': entry['commit'], 'path': entry['path'], 'bytes': len(data), 'sha256': sha256, 'gitBlobSHA1': blob, 'passed': True})
manifest_path = root / 'dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/evidence/MANIFEST.json'
manifest = json.loads(manifest_path.read_text())
for entry in manifest['files']:
    data = (manifest_path.parent / entry['path']).read_bytes()
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise SystemExit('Retained manifest mismatch: ' + entry['path'])
summary = {'status': 'PASS_FIXED_PUBLIC_RECEIPT_BYTES', 'publicFiles': len(checks), 'manifestFiles': len(manifest['files']), 'decodedReceiptHashOnly': True, 'inferenceOrExportOrOriginalReads': 0}
if args.out:
    (root / 'RECEIVED-SHA256.json').write_text(json.dumps({'summary': summary, 'files': checks}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False))
