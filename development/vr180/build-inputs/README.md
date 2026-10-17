# Fixed Mediabunny core rebuild inputs

This is an unmodified-source reproducibility gate before any VR180 fork work.
It does not replace or publish a product bundle. This directory is outside the
GitHub Pages `docs/` deployment tree; its source material is public upstream
code, not private Space material.

## Inputs and provenance

- Mediabunny `1.61.5`, upstream commit
  `0664a57bf2f40e5c4efa176c75ebf1d60df69eb8`.
- Existing `docs/shared/media-basic/vendor/mediabunny-1.61.5-source.tgz` supplies
  `src/`, its package metadata (including browser mappings), and `LICENSE`.
- `mediabunny-1.61.5/` supplies four missing `shared/*.ts` files and the root and
  shared TypeScript configurations. They are byte-identical upstream files.
- `provenance.json` records source URLs, Git blob hashes, SHA-256 hashes, licenses,
  the exact core build-option source, and the reduced toolchain lock provenance.
- The four TypeScript files retain their upstream MPL-2.0 headers. The complete
  license is `docs/shared/media-basic/vendor/mediabunny-LICENSE`; its SHA-256 is
  checked by the runner. The recovered source has no fork edits.
- `toolchain/package-lock.json` retains the upstream esbuild `0.25.1` package and
  its optional platform-package records unchanged. The root package is an
  isolated development-only manifest. esbuild is MIT-licensed and is not
  bundled into the product by this verification tool.

The original all-workspace build also builds other variants, codecs, docs and
declarations. It is deliberately not run here. The selected options reproduce
only its minified browser ESM core context: `src/index.ts`, `bundle: true`,
`target: es2021`, `format: esm`, the exact license banner,
`legalComments: none`, its warning override, `minify: true`, and output
`dist/bundles/mediabunny.min.mjs`. No plugin, platform override,
source map, additional define, TypeScript transpiler or code patch is added.

The Works vendor is named `mediabunny.mjs` locally but its bytes match the
upstream archive's **minified** ESM (692,359 bytes), not the unminified ESM.
This correspondence was checked before the cloud rebuild; filenames alone do
not select the build variant.

## Execution contract

Required environment: Linux x64, Node.js 18 or newer, GNU tar, and an existing
parent directory for the output. Dependency acquisition is separate from the
runner. The runner performs no network request and executes no archive script.

Use a temporary prefix, preserving both files of the reduced lock:

```sh
vr180_build_prefix="$(mktemp -d "${RUNNER_TEMP:-/tmp}/vr180-esbuild.XXXXXX")"
vr180_rebuild_parent="$(mktemp -d "${RUNNER_TEMP:-/tmp}/vr180-rebuild.XXXXXX")"
trap 'rm -rf "$vr180_build_prefix"' EXIT
cp development/vr180/build-inputs/toolchain/package.json "$vr180_build_prefix/"
cp development/vr180/build-inputs/toolchain/package-lock.json "$vr180_build_prefix/"
npm ci --prefix "$vr180_build_prefix" --ignore-scripts --include=dev --include=optional --no-audit --no-fund
node tools/vr180/rebuild-vendor-core.mjs \
  --esbuild-dir "$vr180_build_prefix/node_modules/esbuild" \
  --output-dir "$vr180_rebuild_parent/result"
```

These commands need an environment permitted to fetch the lock's npm URLs.
Do not use `--omit=optional` or `--no-optional`. esbuild's official installation
documentation explains that with `--ignore-scripts`, npm still installs the
platform binary through its optional dependencies. This runner independently
checks the package version, API version and native executable `--version`,
all of which must be `0.25.1`. It also checks that the installed prefix lock
is byte-identical to the supplied lock. `ESBUILD_BINARY_PATH` must be unset.
There is no silent fallback, automatic install-script execution, or selection
of another esbuild version if these checks fail.

Reference: <https://esbuild.github.io/getting-started/#additional-npm-flags>.

`--output-dir` must not yet exist and must be outside this repository. Its
existing parent is resolved before creation to prevent output redirection
through a parent symlink. The runner extracts only the fixed core input into
`output-dir/work`, builds it, and removes that temporary source tree.

## Results and gate

- Exit `0`, `PASS`: rebuilt bytes and SHA-256 match the pinned distribution
  exactly: `5c3514965f106dd165cc6474979ba302ef85d8c84935a0ad3ea5202ccedfe51b`.
- Exit `1`, `FAIL`: source-integrity, extraction, build, comparison, cleanup or
  reporting failure. A different bundle is never accepted as equivalent.
- Exit `2`, `BLOCKED`: prerequisites, exact toolchain, or invocation are missing.
  This is not a successful dependency download or rebuild.

The JSON result is printed to stdout and, after safe output-directory creation,
saved as `rebuild-result.json`. It contains the status, phase, source and
toolchain hashes/versions, selected build options, and byte comparison.
If a build completed, `mediabunny-rebuilt.mjs` is retained alongside the report,
even when comparison fails. The mismatch report gives lengths, SHA-256 values,
the first differing byte and line contexts, equal prefix/suffix lengths and
different aligned-byte count. It does not claim semantic equivalence.

No output is copied back into `docs/`; no workflow or vendor file is modified.
The output artifacts remain until the calling workflow/operator handles them.
An existing output directory is never overwritten. Reproducibility PASS alone
does not demonstrate VR180 correctness, lower memory use or faster conversion.

At preparation time, exact esbuild `0.25.1` acquisition and rebuild were not
available on the local host. Cloud execution must record its own result; this
directory's presence is not a claim that the gate has passed.
