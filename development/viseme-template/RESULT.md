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

- Node focused/regression suite: 81 tests, 79 passed, 2 existing Sites-only skips,
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
