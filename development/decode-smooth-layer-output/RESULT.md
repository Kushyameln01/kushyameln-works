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
- Cloud browser reproduced the old public UI's two-name → five-layer output and downloaded the baseline archive. New public UI verification is pending release.

Two pre-existing assembly-test fixture defects were reproduced from an untouched archive of the baseline commit: a document-only helper supplied an undefined expected GUID, and the case-collision fixture lowercased `Assets/`, preventing it from reaching the intended check. The tests now obtain the original entry GUID and preserve `Assets/`. The independent verifier also now selects the Controller's two-space-indented `m_Name` rather than mixing in nested layer names; same-level uniqueness is still checked. These are verification fixes, not additional product behavior changes.

## Acceptance boundary and release checkpoint

Candidate code and source-preservation checks pass. Publication and post-release download verification remain pending at this checkpoint. Unity Editor import, VRChat runtime, and consumer-specific empty-layer classification are not verified. The user's attached package and screenshot were read only and are not included in this repository. The validation uses generated public sample inputs.

Rollback: restore the affected product files from baseline `b7367874` if post-release generation fails; do not alter unrelated changes.

## Post-release cache check

Commit `2164d083d4174615bc6966a586bc8eb589439745` was delivered to main. All three changed product module bytes fetched from Pages matched the candidate. The Cloud browser used for the old five-layer run nevertheless failed after reload with `Duplicate output Layer name Base Layer`, consistent with a new batch request reaching an old cached Worker integration module. Completion was withheld.

The follow-up versions both the Worker entry URL and its changed `integrate.mjs` dependency (`v=parameter-only-1`) so existing browser caches cannot combine this new API request with the old integrator. No asset generation semantics were added. Recheck the same browser session after delivery.
