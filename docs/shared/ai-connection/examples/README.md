# External descriptor examples

These manifests demonstrate the adopted common description without changing or importing any native module. The four Works descriptions use the A0 source baselines; they are local external descriptions, not declarations accepted by each owner. `adapterRef: null` means no executable native adapter is supplied by this A0/M1/M2 change. Operations use description-local IDs and retain their native method in `constraints` where names differ.

| File | Source and boundary |
| --- | --- |
| `text.json` | Unmerged G1C `6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095`, `works-ai-1`, client build `works-inference-v1`. Text and ID paths remain separate. |
| `vae.json` | Same G1C. Mean/profile operation and generated-sample metadata acceptance are separate operations; generated numerical integration remains partial/unverified. |
| `diffusion.json` | Public main `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`, native `diffusion-models/0.1` and its main build receipt. Mean128, pointwise1M and conditioning validation have separate constraints. Sample remains not implemented. |
| `lora.json` | Same main. Native `apiVersion: 1`; `build` is the existing SDK context's kernel SHA, not a newly invented unified protocol. Source inspection and weight transformation do not assert real-model consumer acceptance. |
| `synthetic-audio*.json` | A descriptor-only stereo waveform fixture with one arbitrary stage, `[1,2,480]` axes and no LoRA. The included `synthetic-audio-source.txt` has a real byte SHA-256, but supplies no executable model. |

`registry.json` registers local example semantics for static description and comparison. These IDs are **not new native wire schema IDs** or owner-approved numerical semantic specifications. No inference engine, model family, shape or stage name is registered globally by reading these examples. Fixed numerical shapes in the Works descriptions belong to their individual operation/profile.

`g1c-sample-artifact.json` is a metadata-only fixture: it retains two ordered producer identities, a separate decoder identity, native context/latentContract, five frame numbers/timestamps including duplicates, and an unknown optional extension. The two producer hashes are synthetic fixtures, not verified generated output. No payload bytes are supplied. `restored` is a metadata declaration, with no real restoration trace or numerical validation. Its native metadata schema entry opts into the G1C strict context/latentContract checks.

`synthetic-audio-snapshot.json` is a structural schema fixture only. Its all-zero `snapshotHash` is an explicit placeholder; it has **not** passed canonical hashing, package integrity, active binding or execution readiness checks. M5 owns hash computation and complete persistence. The snapshot's native revision `3` remains distinct from manager revision `7`.

Resource bindings and current budgets in these module descriptions are deliberately unbound. Evidence arrays are empty. A valid descriptor alone cannot authorize or make execution ready. Fixture validation does not establish actual audio support, large-model capacity, generated decode, LoRA application or public Pages behavior.

Validation: `node --test --test-isolation=none tools/ai-connection/test-examples.mjs` from repository root. The test suite exercises local schema/retention only.

The synthetic replacement-edge test uses the actual audio example ports and a metadata-only PCM artifact. Its result is contract `COMPATIBLE` with version/source/path reasons, while readiness is `blocked`: both synthetic operation implementations are `not-implemented` and the requested fixture evidence is absent. The explicit resource budget and active binding inputs are test fixtures, not observations of a running audio system.

Verified G1C native meaning strings are kept exactly: `text_hidden_states`, `rgb-unit`, `raw-posterior-mean`, `wan21-raw-generated-sample:v1`. G2's normalized mean uses `wan21-normalized-posterior-mean:v1` and its own example semantic schema. Pointwise and LoRA weight-block schemas intentionally have no single native-meaning correspondence until such a public mapping is provided. The synthetic PCM correspondence is locally declared `synthetic:pcm`.
