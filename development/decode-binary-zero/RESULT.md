# Binary-to-Decode connection and zero-bit synchronization

Date: 2026-10-27 JST. Baseline: `b0321956678a65b116074a1ebedf5ea1fd259188`.

## User requirements and changes

- Connect the existing `Decode_Root` as a child Motion of `Binary_Root`. The producer adds one Direct child with `AlwaysOne` and Time Scale 1 before GUID rewriting; an existing connection is not duplicated. Existing child order/settings, all Clip data, asset layout and source Template revision2 JSON remain unchanged. Producer build: `parameter-template-1.4.0`.
- Make terminal ASCII `0` Binary parameters unsynchronized. The shared Integrator suffix rule keeps these Expression entries Bool and preserves defaults/Saved/Animator types. Suffixes 1–9 and Negative retain their existing rules; the independent Negative range policy still follows. Zero is OFF with range sync enabled or disabled. This matches the final name suffix, including `Value10`, not the numeric parameter value.

Builder and standalone screens use these shared producers. No additional Layer, Simple_Root/Decode0 connection, Clip multiplier or normalization change is introduced. Layer0, three output layers, AvatarMask and HideInHierarchy/omitted-Registrar-root behavior remain covered by regressions. Packing and WASM are unchanged; the shared bundle imports the Template API externally and needs no rebuild. Versioned imports select changed producer/rule modules for existing browser sessions.

## Candidate verification

The Decode missing-link tests failed before implementation (4 failures across the producer and integration tests), then passed. Zero-suffix tests failed before its rule change (6 expected failures), then passed. The combined related suite passed 126 tests with 0 failures and 2 existing Sites-only skips (128 total). The 7-target standalone generation check and strict static export also passed.

Independent Python archive readback found 3 layers, 4 StateMachines, 8 Controller objects, 26 Animator/Expression parameters, 34 Trees, 60 Clips and 8 synced bits for two targets. All 42 retained input files and 94 Motion documents match their same-run integration sources. 80 Motion documents are now reachable; 14 unreferenced documents are still preserved. Both Decode roots and their -1/0/+1 Clip writers are reachable from the played Binary layer.

A separate old/new Template comparison normalizes only freshly generated GUIDs using equal asset paths. The single allowed content difference is the appended Binary-to-Decode child; all original children, Clip fields and metadata match. Source template JSON is unchanged. See [source readback](source-verification.json) and [Template comparison](template-preservation.json).

## Public delivery and downloaded output

Product commit: `58a24ee803c0c13956ebaa6972679bb603949854`. Pages [deployment 40391141663](https://github.com/Kushyameln01/kushyameln-works/actions/runs/40391141663) completed successfully. All 10 changed public files match the reviewed bytes. The exporter regression suite also passed all 46 tests.

The existing Cloud browser session was reloaded normally and generated the two-target Builder archive. Independent readback confirms both same-target Binary-to-Decode links, Decode Clip values -1/0/+1, both terminal-zero Bool entries unsynchronized, 8 synced bits, and the preserved 3-layer/Layer0/Mask/visibility structure. Public archive SHA-256: `46bfd1fb40d86f3773691a048c422be8982da64473b6fa52e5058e0e357c264b`.

The standalone Template screen generated `v2/EyeLidLeft` with 16 Trees and 30 embedded Clips. Its first download event returned a path that was absent in both the shared workspace and browser filesystem; no contents were inferred from that event. Retrieving the same generated Blob through the supported download-link API produced a real archive, which passed the independent old/new full-field comparison. Its only content change after GUID mapping is the additional child reference. SHA-256: `6e5b6153b07918ee010f243bc00e28d7706d11d5eacb8ec9f110d2f95c38db88`.

- [Public Builder readback](public-verification.json)
- [Public standalone Template comparison](public-template-verification.json)
- [Public deployment byte comparison](deployment-verification.json)

Unity import/runtime remain unverified; this does not establish that the reported runtime one-tenth output symptom is resolved. No user attachments or generated packages are included in the repository. No separate ChatGPT Sites deployment is included. Rollback: restore only the affected product files from the baseline commit.
