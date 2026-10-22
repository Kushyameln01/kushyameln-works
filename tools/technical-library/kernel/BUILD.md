# Fixed local build

See tools/technical-library/kernel/build-inputs.json for official source URLs and verified hashes. Create a private .toolchain directory beside this file; unpack Go1.22.12 linux-amd64 and Hike 3c51fde6675f317453919bd505d0e2d0f638e7f1 there. Verify both archive hashes before extracting. Keep source metadata in .toolchain/sources.json using the sources array. Install wabt1.0.39 with npm --prefix .toolchain --cache .toolchain/npm-cache --ignore-scripts --no-audit --no-fund and compare lockfile with wabt-package-lock.json. No global install is required.

Build Hike compiler from the fixed source with its Go1.22.12: CGO_ENABLED=0, workspace GOCACHE/GOPATH, `go build -buildvcs=false -o ../hikec ./cmd/hikec`. Retain actual compiler hash. Then run `python3 tools/technical-library/kernel/build.py` from repository root. It builds the isolated scalar probe and step source, checks the final WAT signature/imports and emits WASM, registry and build evidence. Generated runtime.js is retained in private .build; this no-import kernel is directly instantiated and does not need that runtime published.

Run `node tests/technical-library-kernel.test.mjs`. Tests use the real WASM and independent JS expected values. The build script does not execute product code. The test script does not publish. Worker bundle rebuilding is a separate integration step.

WABT normal lowers local declarations/short-circuit temporaries into its linear stack. Keep loop variable declarations outside loops; the maximum-input cases protect against stack/arena overlap. A new source/backend requires fresh boundary validation; do not assume another backend shares this ABI.
