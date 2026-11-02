#!/usr/bin/env python3
"""Reproduce the optional repaired WABT backend into a private build directory.

The original pinned compiler source and binary remain unmodified. The patch
enables structured returns, executes for-loop initialization once, and keeps
switches on the established CFG path. This is a development alternative to the
production LLVM build.py: no public WASM, registry, or build record is written.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
REVISION = '3c51fde6675f317453919bd505d0e2d0f638e7f1'
ORIGINAL_COMPILER_SHA256 = '556a11f406482a0b2015ba0a40e34813ad6c1ec2c50eed175f9d005e7f39a95f'
PATCH_SHA256 = '679c8d52fadf3d4f261bcb2312051ae6ec541611c26e19658eee80d9004e567c'
COMPILER_SHA256 = '948ff2039007a6055389f8bce40b639a26aa94090862368c10b08aa2311f2c03'
ORIGINAL_FILES = {
    'pkg/backend/wabt/structured.go': 'a6cad56f761ded985d782b52dc343b435013a244232c66cae6227357b1c4e06a',
    'pkg/backend/wabt/emitter.go': 'b2df3743ee9450658f99f56486f654e157145ac5b70d03e826a8360cac06fbe7',
}
TEST_FILES = {
    'structured_return_test.go': 'pkg/backend/wabt/structured_return_test.go',
    'structured_return_loop_test.go': 'pkg/compiler/structured_return_loop_test.go',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_sha(path, expected):
    actual = sha(path)
    if actual != expected:
        raise RuntimeError(f'Pinned input hash differs: {path} ({actual})')


def run(command, log, *, cwd, env):
    result = subprocess.run(list(map(str, command)), cwd=cwd, env=env,
                            capture_output=True, text=True)
    log.write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f'Command failed ({result.returncode}); see {log}')
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--toolchain', type=pathlib.Path,
                        default=pathlib.Path(os.environ.get('LORA_HIKE_TOOLCHAIN', '/workspace/work/lora-toolchain')))
    parser.add_argument('--out', type=pathlib.Path, default=HERE / 'build' / 'wabt-structured',
                        help='Fresh private output directory; existing contents are rejected')
    parser.add_argument('--test', action='store_true',
                        help='Run backend, compiler, and complete WABT regression suites')
    parser.add_argument('--compile', action='store_true',
                        help='Compile the Hike source to private lora.wasm and lora.wat')
    parser.add_argument('--source', type=pathlib.Path, default=HERE / 'lora.hike')
    args = parser.parse_args()
    tool, out, source = args.toolchain.resolve(), args.out.resolve(), args.source.resolve()
    if out.is_relative_to(tool) or out.is_relative_to(ROOT / 'docs'):
        parser.error('--out must be private and outside the original toolchain and public docs')
    if out.exists() and any(out.iterdir()):
        parser.error('--out must be empty; choose a fresh private directory')
    original = tool / ('hike-lang-' + REVISION)
    patch = HERE / 'hike-structured-return-loop.patch'
    require_sha(tool / 'hikec', ORIGINAL_COMPILER_SHA256)
    require_sha(patch, PATCH_SHA256)
    for relative, expected in ORIGINAL_FILES.items():
        require_sha(original / relative, expected)
    out.mkdir(parents=True, exist_ok=True)
    copied = out / 'compiler-source'
    shutil.copytree(original, copied)
    tests = {}
    for name, relative in TEST_FILES.items():
        test = HERE / 'compiler-tests' / name
        shutil.copyfile(test, copied / relative)
        tests[relative] = sha(test)
    env = dict(os.environ, PATH=os.pathsep.join([str(tool / 'go' / 'bin'),
               str(tool / 'node_modules' / '.bin'), os.environ.get('PATH', '')]),
               GOCACHE=str(out / 'go-cache'), GOMODCACHE=str(out / 'go-modcache'),
               GOPROXY='off', GOSUMDB='off', GOFLAGS='-buildvcs=false')
    go = tool / 'go' / 'bin' / 'go'
    run(['patch', '--batch', '--forward', '-p1', '-i', patch], out / 'patch.log', cwd=copied, env=env)
    compiler = out / 'hikec'
    flags = ['-trimpath', '-buildvcs=false']
    run([go, 'build', *flags, '-o', compiler, './cmd/hikec'], out / 'compiler-build.log', cwd=copied, env=env)
    require_sha(compiler, COMPILER_SHA256)
    record = {
        'kind': 'optional-development-wabt-reproduction',
        'upstreamCommit': REVISION,
        'originalCompilerUnmodified': True,
        'originalCompilerSha256': ORIGINAL_COMPILER_SHA256,
        'patchSha256': sha(patch),
        'compilerSha256': sha(compiler),
        'goVersion': run([go, 'version'], out / 'go-version.log', cwd=copied, env=env),
        'goSha256': sha(go),
        'buildFlags': flags,
        'modifiedFiles': {relative: {'beforeSha256': expected, 'afterSha256': sha(copied / relative)}
                          for relative, expected in ORIGINAL_FILES.items()},
        'regressionSources': tests,
        'relevantTests': 'not-requested',
        'privateKernel': None,
        'publicArtifactsWritten': False,
    }
    if args.test:
        run([go, 'test', './pkg/backend/wabt', './pkg/compiler', './tests/wabt', '-count=1'],
            out / 'compiler-tests.log', cwd=copied, env=env)
        record['relevantTests'] = 'passed'
    if args.compile:
        wasm, wat = out / 'lora.wasm', out / 'lora.wat'
        run([compiler, 'build', '-target', 'wabt', '-wasm-mode', 'normal', '-o', wasm, source],
            out / 'kernel-build.log', cwd=out, env=env)
        run([compiler, 'emit-ir', '-target', 'wabt', '-wasm-mode', 'normal', '-o', wat, source],
            out / 'kernel-wat.log', cwd=out, env=env)
        text = wat.read_text()
        # WABT lowers the decode literal 0.5 through f64.const followed by
        # f32.demote_f64. Reject FP64 operations, while allowing that constant.
        fp64_operations = re.findall(r'\bf64\.(?!const\b)[a-z0-9_]+\b', text)
        if '(import ' in text or '$cfg_dispatch' in text or fp64_operations or 'relaxed_madd' in text:
            raise RuntimeError('Unexpected import, CFG dispatcher, FP64, or fused math in private kernel')
        record['privateKernel'] = {'sourceSha256': sha(source), 'wasmSha256': sha(wasm),
                                   'wasmBytes': wasm.stat().st_size, 'watSha256': sha(wat),
                                   'backend': 'patched-wabt-normal-structured',
                                   'imports': [], 'cfgDispatcher': False, 'fp64Arithmetic': False,
                                   'f64LiteralCount': text.count('f64.const')}
    # Recheck the original after all operations, including optional suites.
    require_sha(tool / 'hikec', ORIGINAL_COMPILER_SHA256)
    for relative, expected in ORIGINAL_FILES.items():
        require_sha(original / relative, expected)
    (out / 'build-record.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if __name__ == '__main__':
    main()
