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

## Live Pages acceptance

Publication `8bc2ca779caf8b66bc2ac8ebeb207c367d5d068b`, Pages build
40664360590 succeeded. The same cloud browser session that previously rejected
Viseme successfully generated after reload, then saved both Body and
`顔/メッシュ "A" #1` packages. Input edits removed the old download href; empty
input was rejected; changing back to Body generated again. The Works catalog
shows the Viseme Template entry (11 tools). The success screenshot is retained.

Both browser downloads passed the independent original-package comparator:
19 package entries, 110 nonzero resolved references, 15 embedded Clips, one shared
external Clip referenced by all 15 Trees, no AvatarMasks, preserved Controller
and Curve payloads. Exact hashes are in browser-*-verification.json.

The public Unity analyzer compared the original attachment bytes with the saved
browser Body package. Its full 12,510,180-byte JSON was downloaded, parsed to the
end, hashed and retained losslessly as browser-unity-analysis.json.gz. The raw
selected-file hashes matched both files; canonical snapshot hashes are recorded
separately. All 19 ingestion/analysis jobs succeeded with matching session,
revision and build. Version: unity-analysis-0.3.1 / unity-static-3 /
compute-parameter-b1; analyzer WASM identity is in the summary JSON.

Before/after: 81/80 objects, 1153/1150 references (including null references),
17/17 shared targets, 1/1 existing cycle, 2/2 parameter declarations and 45/45
parameter checks. Zero unresolved references, opaque files, partial files or
unknown parameter checks. No findings. All result completeness flags are
untruncated; diff has 161 object changes, 85 file changes, zero ambiguous matches.
The diff uses exact GUID/fileID identity, so newly generated GUIDs produce many
add/remove entries; the independent comparator establishes preserved payloads.

UI cancellation, narrow-viewport layout and injected fetch failure were not
exercised through the cloud browser. Node covers cancellation/retry and malformed
Template rejection; these are not represented as browser checks. The retrieved console entries concerned browser-extension metadata errors.
Unity Editor Import/object recognition and VRChat runtime remain unverified.
