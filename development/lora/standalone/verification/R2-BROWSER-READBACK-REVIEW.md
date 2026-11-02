# R2 browser and remote readback review

**Approved within the tiny browser-fixture scope. No blocking finding.** Reviewed commit `986b66b3dd54ef26d98f99a1db92a2933f3e31aa` and artifacts in `browser-source-986b66`; no jobs were rerun or interrupted, original payloads were not read, and existing source files were not changed.

## Source identity

All **15 served/requested source files** in `result.json` match Git 986b66 byte lengths and SHA-256 hashes. This includes the SDK, reference host, fixture, mapping/classifier/loader, safetensors/SHA implementation, and streaming kernel host/registry/WASM. Embedded `control` and `readback` exactly equal `control.json` and `readback.json`. The browser is Chromium `154.0.8037.57`; the report records no browser/server errors.

- Owned package: `848563d336975a57ac326544356fbf294cc75cb855bcddab8b460ea2ecba01b0`, matching the independently reviewed R2 cancellation fix.
- Kernel WASM: `5117e21d789d01b5dd49d7e8cf9bc8d2f78a51f7d3810aab56e4a40588a0c361`.
- Of these 15 loaded sources, 14 are byte-identical to R1 `4a3419c768e2b4b38b081314abe2cfaaeed6b14b`; only `owned-package.mjs` changed.

## Browser evidence checked

The 15 recorded cases cover light/detail at 0/±1, both at 0/±1, repeated application, each pair's removal and base restoration. Independently recalculated all **135 recorded fixture output values** from the tiny factors/dyadic base; all match. Applied epochs progress 1–15, receipt/package identities match captured reads, and validation is normal with lease ownership and no diagnostic arguments. Base restoration has zero selected patch elements and is checked by its separate nine-value base readback.

Cancellation preserves epoch 16 and its active package. Injected rollback failure requires recovery; recovery and stale-plan rejection are recorded. These browser checks exercise controller cancellation; cold-factor/shared-waiter cancellation remains covered by the separate focused R2 Node regressions.

Save writes actual OPFS payloads of **258 and 254 bytes**, then a **6,793-byte manifest**. Saved descriptor names, sizes and hashes agree with registration and fresh readback. The checker closes the first page and creates a new page before `openPackage`; the fixture reads OPFS Files and rejects the serialized manifest as a runtime handle. Fresh SDK and transaction IDs differ from their origins, while plan/package identities remain unchanged. All reopened values match the composition.

After SDK/kernel owner disposal, the active consumer still reads correct values with one live package/kernel lease. Both control and fresh-readback terminal receipts show zero registrations, prepared packages, candidates, read leases, pending releases, in-flight work, package references, cache bytes/pending work and kernel memory/leases. The base is disposed and OPFS cleanup is confirmed.

This is a HIGH-side fixture with weight `[3,2]` and bias `[3]`, two local Files, real Hike WASM and real OPFS/fresh-page readback. Its own flags correctly retain `wholeModel:false`, `all2904Patches:false`, `modelInference:false` and `normalNumericalComparison:false`.

## Remote readback

All three records in `REMOTE-986b66-READBACK.json` match Git 986b66: `STANDALONE.md`, `standalone-sdk.mjs`, and `owned-package.mjs`. Independently compared the actual UTF-8 bodies in `remote-986b66-bodies.json` with Git blobs, lengths and SHA-256 hashes; all match. A parallel connector fetch already started before the root's no-refetch note also matched those exact stored bodies. This verifies these three remote repository file bodies, not Pages publication or the entire remote tree.

## Precise final-report reuse scope

Keep **R1 full numerical execution** attributed to source 4a3419 and its private runtime copies. Keep **R2 cancellation/control/browser/lifecycle execution** attributed to source 986b66. The reviewed R1→R2 runtime diff adds cancellation ownership/checks and pending-cache lifetime handling; factor decoding, product/merge mathematics, F32 order, loader scales, shapes, selected coordinates, kernel and independent oracle are unchanged. R1 numerical evidence can therefore support the unchanged arithmetic in R2 when accompanied by that diff review and the R2 regressions; it must not be renamed a fresh full numerical run at 986b66.

At this review, R1's full run and R2's full-source lifecycle run are still ongoing. Report completed results only after their own terminal receipts. Browser PASS does not close either outstanding run. Neither evidence set establishes real-base comparison, training-base identity, real Diffusion graph binding or generation readiness.

Artifact SHA-256 anchors: browser `result.json` = `f1e5983d2d3bd2c10628a72da83b25126660b002a9371a258236dc19cf06bc8a`; remote readback JSON = `f02c95ee0c235cf8e46a75f5a6f881ecd2fe99c3c6aab3c04cc24e8b42e8442c`; stored remote bodies JSON = `fc9dbc3ec3f3ab38d03b7966b58f3c0e42e7b14b64fc342ad7961c58d55a7f91`.
