# Decode / Smooth: three-layer output

Date: 2026-10-27 JST. Baseline: `b7367874e026ae641f7f4a1c075a4597e0ea4f25`.
Build: `decode-smooth-integrator-3`.

## Requirement and scope

The generated AnimatorController must contain only `Base Layer`, `Root_BinaryParameter`, and `Root_Smooth_Parameter`, in that order. The former `Parameters 1` / `Parameters 2` registration layers must be absent from the Layer array, not disabled. Preserve AvatarMask, Animator and Expression declarations/settings, embedded Clips/Trees, source identity and the base Entry → empty child StateMachine structure.

The previous builder passed every generated Registrar Controller layer to Animator Integrator. The shared API now accepts explicit `parameterOnlyControllerIds`: a unique subset of selected additional Controllers. Their parameters and supported embedded objects remain; their layers are not selected for output. The builder checks its own generated Registrar layers are empty, unsynchronized and have no overrides before selecting this mode. No generic empty-layer pruning, weight-zero workaround, file packing change or asset pruning was introduced. Unspecified Integrator requests retain their existing all-layer behavior. No separate Sites deployment is included.

## Verification before release

- Red test reproduced the original 5-layer result against the required 3-layer expectation. Invalid option cases also failed before the API change.
- `INTEGRATOR_TEMPLATE_PATH=docs/parameter-template/template.json node --test tools/decode-smooth-builder/test-*.mjs tools/animator-integrator/test-*.mjs`: **64 passed, 0 failed, 0 skipped**.
- One-, two-, and three-target pipeline runs each emit the same three layer names. Parameter-only sources keep declarations and subassets. Invalid/base/duplicate/unselected identities are rejected. Generated nonempty/synchronized/Behaviour-override sources are rejected by the builder.
- Independent Python gzip/tar/Unity-text readback: **3 layers, 26 Animator parameters, 26 Expression parameters, 34 BlendTrees, 60 Clips** for the two-name sample. Source comparison passed for 42 complete unchanged source files, including Mask, and 94 original Motion documents; 22 unreferenced Motion documents were retained. No generator imports are used by this verifier.
- Reviewer supplemental execution: omitted option and explicit empty option produce equal output assets/composition; a LayerControl targeting an omitted layer blocks generation.
- Cloud browser reproduced the old public UI's two-name → five-layer output and downloaded the baseline archive. After the Worker cache fix below, the same browser session produced and downloaded a three-layer output.

Two pre-existing assembly-test fixture defects were reproduced from an untouched archive of the baseline commit: a document-only helper supplied an undefined expected GUID, and the case-collision fixture lowercased `Assets/`, preventing it from reaching the intended check. The tests now obtain the original entry GUID and preserve `Assets/`. The independent verifier also now selects the Controller's two-space-indented `m_Name` rather than mixing in nested layer names; same-level uniqueness is still checked. These are verification fixes, not additional product behavior changes.

## Acceptance boundary and release checkpoint

Candidate code and source-preservation checks pass. Product commit `e899b98ebee673766c609110a60e0d5ef3ab4a6b` is published; Pages deployment run `40349411072` completed successfully. The same Cloud browser session passed generation and actual file download after a normal reload. All changed publicly served product modules matched the reviewed source bytes. Unity Editor import, VRChat runtime, and consumer-specific empty-layer classification are not verified. The user's attached package and screenshot were read only and are not included in this repository. The validation uses generated public sample inputs.

Rollback: restore the affected product files from baseline `b7367874` if post-release generation fails; do not alter unrelated changes.

## Post-release cache check

Commit `2164d083d4174615bc6966a586bc8eb589439745` was delivered to main. All three changed product module bytes fetched from Pages matched the candidate. The Cloud browser used for the old five-layer run nevertheless failed after reload with `Duplicate output Layer name Base Layer`, consistent with a new batch request reaching an old cached Worker integration module. Completion was withheld.

The follow-up versions both the Worker entry URL and its changed `integrate.mjs` dependency (`v=parameter-only-1`) to avoid mixing the new API request with cached older integration code. No asset generation semantics were added. The same browser session passed after delivery without clearing its cache. This resolves the observed mixed-version failure; the originally cached module bytes were not independently recovered.

## Published output verification

[Published builder](https://kushyameln01.github.io/kushyameln-works/decode-smooth-builder/) was exercised with `v2/EyeLidLeft` and `v2/EyeLidRight`. The UI displayed `パラメータ 2件 ・ 3レイヤー`. Its downloaded archive independently passed the Python verifier: layer names exactly `[Base Layer, Root_BinaryParameter, Root_Smooth_Parameter]`, 26 Animator and 26 Expression parameters, 34 Trees, 60 Clips, Safety mask on every layer, and no unresolved package-internal references. Archive SHA-256: `1e2ebcd7b2a4f312b223d469e961b92616e24591f256e0bc4fe72583bb14ec85`.

- [Public download readback](public-verification.json) is from the actual Cloud browser UI download.
- [Source preservation readback](source-preservation-verification.json) is from the candidate's Node Worker pipeline and its same-run intermediate inputs, not the public UI run.
- [Public result screenshot](public-three-layers.jpg) shows the confirmed UI output.

The cache-routing follow-up also passed all 64 targeted Node tests. No user attachments or generated sample packages are committed. Unity Editor and VRChat acceptance remain unverified. Final task state: requested generation behavior and public browser output verified; no pending implementation work.
