# Dedicated VR180 Mediabunny index fork

This directory is independent of `shared/media-basic/vendor`. The runtime module is
`mediabunny-indexed.mjs`, a combined input/output index fork of Mediabunny 1.61.5,
upstream commit `0664a57bf2f40e5c4efa176c75ebf1d60df69eb8`.

The original npm source archive, missing upstream build supplements, output/input
patches (applied in that order), pinned esbuild lock and MPL-2.0 license accompany the
bundle. Together they provide the modified Source Code Form. The matching runtime
controllers in `../indexed/` keep their license notices. `provenance.json` identifies
every shipped source byte and the final bundle hash. No private plan, audit, fixture
media or deployment credential is part of this distribution.

To reproduce from a downloaded copy, supply an independently installed esbuild
**0.25.1** package and a new output directory outside this distribution:

```sh
node rebuild-indexed.mjs --esbuild-dir /path/to/node_modules/esbuild --output-dir /path/to/new-build
```

The script verifies all included hashes, recreates the unmodified official bundle,
checks its SHA, applies both patches with before/after source hashes, and requires an
exact SHA match for the combined bundle. It never installs packages or uses the
network. It removes only its own temporary build directory and never overwrites an
existing output directory. `toolchain/package-lock.json` is available for a separately
authorized isolated `npm ci --ignore-scripts --include=dev --include=optional` setup.

Expected combined bundle: 693,849 bytes, SHA-256
`65a96894f5442fe92d3672e09b80e6841b7a30a745b002b071636352f5b790cd`.
Build reproduction is distinct from browser codec support, saved-output recovery,
media quality, VR playback and deployment acceptance.
