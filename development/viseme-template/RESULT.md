# Viseme Template verification — 2026-10-28

## Implemented contract

The producer exposes `generateVisemeTemplate` and `createVisemeGenerator` for the
standalone UI and future batch composition. The shared compute registry routes
`viseme-template-generate` to that producer in both module and bundled workers.
The existing Hike WASM kernel and unitypackage writer are reused.

The output preserves the source Controller graph and parameters, removes its
AvatarMask, embeds 15 unique Clips in the 15 BlendTrees, and keeps one shared
`Assets/Viseme/Viseme_none.anim`. There is no Animation folder. All output
asset/folder GUIDs are newly allocated. Mesh path text and binding CRC32 change
together; other Curve and Controller payloads are preserved.

## Local evidence

- Node focused/regression suite: 83 tests, 81 passed, 2 existing Sites-only skips,
  0 failures (Viseme, shared compute, parameter-template, Decode/Smooth).
- Python repository suite: 46 passed.
- Exact publication inventory/reference export: passed.
- Existing parameter-template public API static dependency check: passed.
- `git diff --check`: passed.
- Independent readback of Body and Unicode output against the original
  attachment: 19 entries, 110 resolved references, 15 embedded Clips, one shared
  external Clip referenced by all 15 Trees, zero AvatarMasks. Original Controller
  text (except GUIDs/Mask), Clip payloads, and tree settings preserved.
- Independent review: no Critical, Important or Minor findings.

The original attachment SHA-256 is recorded in PLAN.md and the verification JSON.
The evidence packages are generated with random GUIDs; their bytes change when
tests rerun. The verifier compares against the attachment, not generated fixtures.

## Scope and remaining live verification

Local Chromium could not launch because the execution environment disallows its
socket operation. `tools/viseme-template/check-browser.mjs` is retained as an
automated browser harness, but was not completed in this environment. Live UI
generation/download will be checked through the separate cloud browser after
Pages publication. Narrow-viewport and automated route-failure tests remain
unexecuted unless explicitly recorded below.

Unity Editor Import, Unity object recognition and VRChat runtime behavior are
unverified. Static readback and browser generation do not establish these.

## Publication follow-up

Initial publication: `cd9084086859b292e936f13a89d0a58adb6798b1`, Pages build
40663462726 succeeded. A cloud browser that opened the analyzer before deployment
then rejected the new task with the old FT-only protocol message. HTTP acquisition
of tasks, pool, Worker, protocol and Viseme client matched local files; actual Node
module and bundle Workers generated successfully. This points to stale browser/CDN
module delivery, not a reproducible source execution error.

The new UI import chain, shared registry imports and Worker URLs now include
`registry=viseme-template-1` so the new task loads a fresh registry across host and
Worker boundaries. This changes resource identity only; pool ABI and behavior
remain unchanged. Two additional real Worker tests cover the Viseme client,
module/bundle generation, cancellation/retry, transferred output and borrowed-pool
survival. Both passed. Final cloud browser acceptance is recorded below when complete.
