# Actual failed-pair discard and fresh Worker recovery

Source: `6d12140eeab204385fa31f5da73d4796968a4003`. The actual smoke passed in
15.009743461s (outer resource observation17.205834354s).

The test intentionally supplied retained HIGH File in both HIGH and LOW slots.
Load rejected the LOW side/header mismatch with COMPUTE_ERROR and all three
flags true: workerTerminated, preparationDiscarded, reloadRequired. Worker epoch1
was actually terminated. Fresh Worker epoch2 reported loaded=false,
cleanupRequired=false, nativeCandidateDescription=null and resources=null.

A real P4 preparation/release then succeeded in that clean realm. Its release
reported activeORTSessions0 and readLeases0; no P4 neural operation was executed.
A subsequent correct HIGH/LOW pair used the4-thread isolated profile, executed
actual patch-prefix work, cancelled, reloaded, checked stale-session refusal,
and completed the saved-input codec smoke. All128 F32 values read back bit-exact
from the actual763B canonical File; caller inputs remained unchanged, late
progress=0, disposal succeeded and later calls returnedDISPOSED. The codec input
is the explicit saved input, not a generated sample from cancelled work.

This is exception/reset/lifecycle evidence. The patch changed API status/error
ownership and diagnostic harness files; `git diff0f761f3..6d12140` changes no
execution/kernel/shape-math sources. Complete small N5/L512 numerical sample
remains attributed to execution source0f761f3, not silently reassigned to6d12140.
No full40 or six-update inference was repeated for this postpatch smoke.

Reviewed patch hashes are9fc8a97060f5b8dddbf3d9662b81308cc161c91a1f999407de6e1a81f6ec32f0
(API exception/status fix) and436f8665ea81de85e794d80df4db25253ed489c3d43a77c5e476d4714f7c62b9
(smoke diagnostic probe). Isolated red/green manifests and logs are retained with
their original identities: API19red failures→40green passes, driver10Node/3Python
red failures→13Node/4Python passes,22browser primitive/API passes. Fresh integrated
logs record40state +13Node/4Python driver +83bounded native-owner tests passing,
and22actual Chromium154 publicAPI/primitive cases at build9c5 (ownerSources144,
servedPaths152, errors[], actualModels[]). These are state/lifecycle/primitive
scopes, not whole-model numeric inference. The earlier isolated logs and fresh
integrated logs are separately named and identified.

Sampled RSS sum peak1,293,922,304B/PSS1,015,780,352B and observed Worker Memory
capacity peak157,220,864B cover this short smoke only. Resource-summary selection,
baseline/gate, original all-sample peaks, cleanup and observational limits remain
explicit. Process-tree totals and WASM capacity are different measurement scopes.

Published artifacts contain metadata/logs/hashes only. Model and tensor payloads
remain private. No inference was performed to package the evidence.
