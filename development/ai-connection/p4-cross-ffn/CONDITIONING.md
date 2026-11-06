# P4 conditioning boundary

Status: **candidate input contract; real Text joint execution is blocked**. The fixed N2 self-attention tail is unchanged. The machine-readable companion is [conditioning-contract.json](conditioning-contract.json).

The independent ES module [conditioning.mjs](../../../docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs) has two explicit input captures. Both validate and synchronously copy inputs. They do not normalize, pad, compact, project, or run a model. They return:

```js
{
  schemaVersion: 'bernini-p4-conditioning-snapshot/0.1',
  dtype: 'float32', layout: 'BLC', shape: [1, L, 4096],
  rows: L, data: ownedFloat32Array,
  attentionMask: ownedUint8Array, meaning,
  metadata: {inputClass, producer, verification, ...originalMetadata},
  sealBytes
}
```

`captureP4Conditioning(tensor, options)` requires native `float32` / `BLC` / `text_hidden_states`, `1<=L<=512`, exactly `L*4096` finite F32 values and a compact Uint8Array mask `[L]` of 0/1 with at least one active position. Native masked rows must already be zero; the capture never zeroes them. Data and mask must occupy their entire ordinary ArrayBuffer and have the exact native typed-array prototypes. Shared, detached, offset, subclass, wrong-shape and incompatible inputs fail. Intrinsic typed-array slots are read without calling virtual buffer/length methods; finite/mask checks run on the owned copies. The full `L` and every mask position survive the copy.

Options default to the UMT5 model and embedded SentencePiece hashes below. A supplied identity must match the configured expectation. The default `missingTokenizerPolicy:'reject'` rejects missing/null tokenizer identity. The explicit legacy policy `missingTokenizerPolicy:'retain-unknown'` accepts that absence/null and returns `tokenizerIdentity:'unknown'`, `tokenizerSha256:null` and `fullProvenance:false` in the derived producer metadata. The original field remains absent or null as supplied. The configured expected hash is never inserted into the tensor. Known mismatches fail under both policies. Legacy token-ID evidence `tokenizer:null` remains unknown.

Here `fullProvenance:true` means that both required identity fields were present and matched their configured bindings. It does not authenticate a producer or prove model execution. Every capture explicitly returns `verification:{producerAuthenticated:false,realExecutionVerified:false,jointlyAccepted:false}`. Independent evidence must establish those facts separately.

All admitted enumerable, structured-cloneable caller metadata is retained. Native metadata other than `data/shape/attentionMask` is copied under `metadata.nativeTensorMetadata`; the three excluded fields are represented by the owned top-level payload/shape/mask. Fixture metadata other than these fields and `fixtureId/sourceRef` is copied under `metadata.fixtureMetadata`; fixture identity/source are kept explicitly. Metadata accessors, symbolic keys, uncloneable values and shared buffers fail instead of being silently reinterpreted. Custom own fields on Map/Set/typed arrays/ArrayBuffer/DataView/Date/RegExp and custom nonenumerable fields are rejected before native cloning can discard them. RegExp primitive `lastIndex` state is restored in the corresponding cloned graph, including cycles and Map/Set references; object/function/symbol `lastIndex` state is explicitly rejected. Native response fields outside the supplied tensor, including top-level `evidence`, must be preserved by the caller in its outer evidence package; this function cannot reconstruct them.

`captureP4FixtureConditioning({data,shape,attentionMask,fixtureId,sourceRef,...metadata})` has a separate `inputClass:'explicit-fixture'`, producer owner `fixture`, and meaning `p4-fixture-text-hidden-states:v1`. It requires a nonempty fixture identity and source reference, and rejects top-level Text model/tokenizer claims. It inserts no Text model identity. The capture checks the supplied boundary, not whether a fixture ID genuinely belongs to those bytes; the runtime/reference input manifest must independently bind its payload, mask and source hashes.

`snapshotP4CapturedConditioning(capture)` is the runtime's synchronous entry before its first `await`. A private WeakMap recognizes captures from this module and retains a protected copy. The helper rejects forged captures and changes to captured bytes, shape, mask or metadata, then returns a fresh owned snapshot. Replacing a view with an equal owned view does not change its bytes. The private recognition is scoped to one module instance in one realm, cannot survive cloning/serialization, and provides no external producer authentication. Persisted inputs must pass the appropriate explicit capture again.

`cloneP4CapturedConditioning(capture)` validates that same seal and returns a fresh owned capture with a new private seal. A weight-feed transaction uses it synchronously before asynchronous input hashing or validation; plain `structuredClone(capture)` loses the private recognition. The new capture and its seal add their own binary storage and lifetime. Neither call transfers or changes the caller's input.

`p4ConditioningMetadataBytes(metadata)` returns an owned Uint8Array synchronously for the shared stage/feed metadata hash. Its private namespace is **`bernini-p4-conditioning-metadata/0.1`**; it is not JCS or the common artifact metadata format. A UTF-8 JSON envelope contains only internally generated type tags, primitives and graph references. Object property names sort by UTF-16 code units, so insertion order does not change object hashes. Arrays retain length, holes and named enumerable properties. Map/Set retain their iteration order. Graph IDs and references preserve cycles and alias topology. Primitive tags distinguish undefined/null, BigInt/Number, negative zero, NaN and infinities. Date time, RegExp source/flags/lastIndex, fixed ArrayBuffer bytes, native typed-array kind/offset/length and DataView offset/length are included. A view binds its complete backing buffer, including bytes outside the visible range and aliases shared with other views.

The binding step explicitly rejects unsupported object types, typed-array subclasses/custom properties, accessors, symbols, nonenumerable custom properties, shared/resizable/detached buffers and other unsupported values. It does not silently drop them. Capture uses native structured-clone semantics; the binding concerns the metadata actually retained in that capture. Hash the mask bytes separately as well as F32 data bytes and these metadata bytes. An ID/hash field alone is not authenticated producer evidence. Runtime/feed must hold or account for the returned metadata encoding bytes; temporary strings, graph records and allocator/GC overhead remain additional unknown host storage. Caller `toJSON` methods are never invoked.

`sealBytes` counts the ArrayBuffer backing stores in the protected copy, including binary caller metadata, once per buffer identity. The same number of owned binary bytes exists in the public capture and again in each execution snapshot. Plain objects, strings, shape arrays, allocator/GC overhead and external retained inputs are additional unmeasured host storage. A seal stays live while its capture remains reachable; garbage collection timing is not guaranteed. Runtime resource evidence must account for these copies.

## Exact source retrieval and differences

On 2026-11-01 UTC, the receiver read GitHub branch metadata and then exact Git source objects. This is receiver-side acquisition, not a message or new agreement from another Codex.

| Source | Exact commit | Evidence read |
| --- | --- | --- |
| Text branch `codex/textencoder-vae` | `d2e9e3cba6269464bf556acc73c0b97030f75b5f` | `docs/shared/inference/{API.md,text-encoder-api.mjs,text-encoder.mjs,inference-worker.mjs,tokenizer.mjs}` and `development/inference/{verification.json,public-verification.json}` |
| VAE Rect branch `codex/e6-vae-rect` | `855f435120f08eb9e818e51281fc26f0e2633829` | The same native API/Text files, `tensor.mjs`, `vae.mjs`, E6 receipt and real Rect mean artifact |
| Receiver baseline | `508d72cc9036e7f500827465c644b4aed3c5f711` | `docs/shared/diffusion-models/{API.md,tensor-interop.mjs}` and fixed prefix/tail contracts |
| Manager branch `codex/ai-connection-e0-e4` | `60d16b64d6020d3d20239f087f8add91268dcaad` | `docs/shared/ai-connection/adapters/text-vae.mjs` and `examples/text.json`; its accepted tail evidence is separate from new conditioning acceptance |

The receiver's `docs/shared/inference/API.md` is the older 9182-byte Text baseline, SHA-256 `1bd5f67abc30e51b3783a61ef44e5dab735d912194c068803cb612b4e05a4897`. VAE855f's API is 28136 bytes, SHA-256 `2b51aa7292494b3a16ca15a284866e18557386940f73f2ad3040151efb25953b`. These are distinct source contracts with the same `works-ai-1` API name. VAE855f adds native tensor tokenizer identity and explicit input validation. The older d2 Worker does not put tokenizer identity in its tensor; its actual token-ID receipt records `tokenizer:null`.

VAE855f's API says Diffusion's `requireWanConditioning` and save wrapper check/preserve tokenizer identity. The receiver baseline's `tensor-interop.mjs` does neither, and `encodeWanConditioning` drops that field in its owned copy. Its SHA-256 is `13c3595f0786a45a62d0a8739b6acd58d3025c80f7eaff4baf7314559665c1c1`. This candidate records that disagreement and provides its own explicit boundary; it does not alter or widen the existing wrapper.

## Tensor meaning and numerical owners

| Boundary | Shape / dtype / layout / meaning | Numerical owner |
| --- | --- | --- |
| Text native output | F32 BLC `[1,L,4096]`, `text_hidden_states`, Uint8Array mask `[L]`; plain text yields `L=512`, explicit IDs preserve `1..512` | TextEncoder owns tokenization, 24 layers, final affine RMSNorm epsilon `1e-6` and zero masked output rows. No additional latent normalization applies to this tensor. |
| Rect VAE mean | F32 NCTHW `[1,16,1,2,4]`, `raw-posterior-mean`, no Text mask; profile `wan21-raw-f32-1x16x32` | VAE owns posterior-mean production, without sampling or latent normalization. |
| Normalized Rect mean | Same shape, `wan21-normalized-posterior-mean:v1`, normalization `wan21-comfy-f32-v1` | Diffusion owns Rect Hike normalization and inverse: per-channel F32 subtract mean → multiply 1 → divide std; inverse multiply std → divide 1 → add mean. |
| Text model context | F32 BLC `[1,L,5120]` inside the new candidate | Diffusion owns actual `text_embedding`: Linear4096→5120, GELU(tanh), Linear5120→5120. This is not a layout rename or TextEncoder operation. |
| Saved N2 tail residual | F32 LC `[2,5120]`, implicit B=1, `block0-self-attention-residual-token-hidden` | Fixed Diffusion tail owns the saved residual. It is neither a VAE mean nor a generated sample. |

UMT5 model SHA-256: `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`; embedded tokenizer: `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`; VAE: `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`. These identities do not identify either Bernini model.

Fixed ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`, `comfy/ldm/wan/model.py`, SHA-256 `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`, applies Text projection to the complete context at line610. `WanT2VCrossAttention` at line107 uses full-width Q/K RMSNorm and attention with no attention-mask argument and no RoPE. The producer mask remains metadata; this candidate keeps every `L` row. Projected zero rows can become nonzero through biases, so compaction or masked softmax would alter the fixed model source.

The manager owns exact prompt construction, Bernini system text/line breaks, negative selection, outer evidence and global queue. Text's EOS1/PAD0 path does not implement Comfy weighted prompt syntax, textual embeddings or arbitrary task prefixes. Direct IDs do not prove tokenizer origin even when a matching expected identifier is supplied.

## Available evidence and remaining gates

The d2 producer receipt records actual 24-layer Text output `[1,4,4096]`, file SHA-256 `cdfcde170281e69e6bff1d86fc4f22283f51933b44be48bda5f512da65c49614`, payload SHA-256 `9c68f4c64786bd7ba3e75ec7e02ebaaf433c47569f8f436e53c8dbd6d218622c`, max absolute error `2.86102294921875e-6` against its FP32 reference. It also records a plain-text `[1,512,4096]` MessagePort run. Neither retained payload is Git-tracked. The producer's declared `/workspace/work/inference/{integration,text-implementation,vae-implementation}` directories do not exist in this environment. All 24 available `.wktensor` headers under `/workspace/work`, `/workspace/attachments` and `/tmp` were inspected with zero read errors; none was a Text hidden-state payload. Receipts cannot reconstruct those missing bytes.

The separate candidate fixture is `bernini-p4-explicit-text-l4-dyadic-v1`, fixed in [core/fixture-contract.json](core/fixture-contract.json), body SHA-256 `17102144ab54236bc0dc28d3e2d083b5a5c850c48f0ada86aa4b06c89bab6338`, data SHA-256 `0cd4fa87e24e6d875207aca52cc214a1b46157a886d4c090fb7c5cfc9a5925ae`, shape `[1,4,4096]`, mask `[1,1,0,1]`. Its row2 is zero; all four rows are consumed. It is an explicit diagnostic fixture, not a real Text output.

Real Text retrieval and reference binding, new joint producer agreement, original GPU precision, actual HIGH→LOW handoff, full original workflow/context, full-block production readiness and generated decode remain unaccepted. HIGH1 and LOW3 are independent diagnostics. `load/predict/sample=NOT_READY` and generationReady=false remain unchanged.

Verification: `node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/post-self-attention/test-conditioning.mjs`. Initial missing-entrypoint RED: 8 failures; explicit verification flags and empty fixture source rejection also had a separate 2-failure RED followed by 8-pass GREEN. A subclass regression reproduced a virtual-buffer/finite-check bypass before hardening. Shared clone/metadata helpers then had four expected RED failures; an additional seal regression caught omitted backing bytes, RegExp state and alias changes. A final two-failure RED reproduced native cloning's lost RegExp state and built-in custom fields, followed by graph repair/explicit rejection. All 16 conditioning tests passed; the combined conditioning/weights/stage suite passed 31 tests. These tests use contract-only synthetic tensors and do not run Text/VAE or any model prefix.
