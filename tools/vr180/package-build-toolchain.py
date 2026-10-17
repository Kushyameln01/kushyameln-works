#!/usr/bin/env python3
"""Return only the fixed, verified Linux x64 esbuild toolchain for local rebuilding."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'package.json', 'package-lock.json',
    'node_modules/esbuild/package.json', 'node_modules/esbuild/lib/main.js',
    'node_modules/esbuild/LICENSE.md',
    'node_modules/@esbuild/linux-x64/package.json',
    'node_modules/@esbuild/linux-x64/bin/esbuild',
    'node_modules/@esbuild/linux-x64/README.md',
]
BINARY_SHA256 = 'cfbfcac245e272a19c709cea06cda74d8cdebf3c033ba9f4dc2b7fc5985fd516'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prefix, out = args.prefix.resolve(), args.output.resolve()
    assert not prefix.is_relative_to(ROOT) and not out.is_relative_to(ROOT)
    assert out.is_dir() and not (out/'esbuild-0.25.1-linux-x64.tgz').exists()
    report = json.loads((out/'rebuild-result.json').read_text())
    assert report['status'] == 'PASS' and report['comparison']['identical']
    assert report['esbuild']['binarySha256'] == BINARY_SHA256
    assert (prefix/'package-lock.json').read_bytes() == (ROOT/'development/vr180/build-inputs/toolchain/package-lock.json').read_bytes()
    records = []
    archive = out/'esbuild-0.25.1-linux-x64.tgz'
    with tarfile.open(archive, 'w:gz') as tar:
        for name in FILES:
            path = prefix/name
            assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(prefix)
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            executable = name.endswith('/bin/esbuild')
            if executable: assert digest == BINARY_SHA256
            info = tar.gettarinfo(str(path), arcname=name)
            assert info.isfile()
            info.uid = info.gid = 0
            info.uname = info.gname = ''
            info.mode = 0o755 if executable else 0o644
            with path.open('rb') as stream: tar.addfile(info, stream)
            records.append({'path':name, 'bytes':len(data), 'sha256':digest, 'mode':info.mode})
    manifest = {'schema':'vr180-fixed-toolchain-recovery-v1', 'status':'PASS',
        'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'runId':os.environ['GITHUB_RUN_ID'], 'runAttempt':os.environ['GITHUB_RUN_ATTEMPT'],
        'files':records, 'archiveBytes':archive.stat().st_size,
        'archiveSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(),
        'unmodifiedVendorRebuildPassed':True, 'productFilesWritten':False}
    (out/'toolchain-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    spec=importlib.util.spec_from_file_location('cloud',ROOT/'tools/vr180/cloud-validate.py')
    cloud=importlib.util.module_from_spec(spec);spec.loader.exec_module(cloud)
    run={'runId':manifest['runId']+'-toolchain-'+manifest['runAttempt'],
        'checkoutCommit':manifest['sourceCommit'],'status':'PASS',
        'scope':'Exact esbuild build tooling and unmodified vendor byte identity only; no media acceptance'}
    cloud.write(out/'run.json',run)
    if not cloud.emit_evidence(out,run): raise SystemExit(1)

if __name__ == '__main__': main()
