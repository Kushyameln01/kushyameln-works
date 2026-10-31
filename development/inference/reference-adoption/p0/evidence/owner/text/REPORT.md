# Actual UMT5 staged implementation handoff

Current scope is the user's later TextEncoder+VAE instruction. Diffusion is excluded. This task preserved the saved UMT5 source and did not recreate deleted diffusion data.

## Implemented

- `docs/shared/inference/text-encoder.mjs`: inspect/load/run/dispose, explicit token-ID/mask input, bounded originalF16 embedding-row reads with SHA256 integrity,24 sequential actual ORT-WASM block sessions, mandatory actual Hike final RMSNorm, explicit Tensor disposal and session release, cancellation checks, original requested outputshape/padding and provenance. No synthetic miniature model or JS normalization fallback.
- `tools/inference/text-encoder/`: pinned ComfyUI T5 source/config/license/provenance, CPU-only preparation, finalization/row-hash table/embedded tokenizer, numerical and runtime lifecycle checks, reproduction README.
- `bundle/`: complete actual prepared model:24 graphs,18,523,750,008 bytes total, original-tokenizer4,548,313 bytes, rowhash table8,204,288 bytes, finalnorm16,384 bytes, per-layer/reference tensors and manifest. Original source is read separately byFile.slice; no2.1GB embedding copy.

Pinned source: ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`. Source T5 operations are used unchanged with explicit ordinary CPU adapters. Every layer loads actual state strictly; all412 original entries are accounted for, including168 scales, original embedding, legacy marker, tokenizer and finalnorm. Original6,735,906,897-byte model SHA256 was reverified after preparation. No additional quantization or accelerator path was adopted.

## Verified locally

- All24 actual block ONNX exports, opset17, checker and native ORT1.24.3 staged chain passed.
- The final normalized FP32 result differs from the unchanged source reference by max absolute2.142973244190216e-6; predeclared normalized-final threshold0.001 was unchanged.
- Initial intermediate absolute-only0.001 gate failed on hidden values~20,464 (error0.08984375). That failed trial remains in `first-block-initial-gate-failed.json` and original log. Intermediate gates were explicitly revised before remaining stages to normalizedpeak/relativeRMS≤1e-4. All24 peak-normalized errors≤4.390249e-6. This is not a claim that the initial absolute gate passed.
- Real block0 padded512 vs activeprefix3 source-reference test passed: normalizedhiddenpeak1.9088e-7, normalized-outputmaxabs3.20375e-7. The manifest permits only trailing mask0 elision; all internal positions remain intact, and final masked output rows are restored as zeros. The source's masked-key attention/per-token FFN+norm and Wan zero_out_masked behavior justify the boundary; this is not arbitrary token removal.
- Runtime lifecycle5cases pass: manifest/model rejection,24sessions with at most1live,72 explicit input/outputTensor disposals, trailing-only compaction/internalmask preservation, abort-after-session-create cleanup, corruptedembeddingrow rejection, disposed-state rejection. Tiny ORT doubles are used only for lifecycle cases; numerical evidence uses actual weights separately.
- The integration agent's independent real Chromium block0 preflight also passed; its evidence is in `work/vae-implementation/text-block-probe/`, outside this agent's ownership. Full24 WorksUI/Worker/Hike browser evidence is owned by the root integration and should be consulted separately.

## Boundaries

This is FP32 expansion of original scaled-FP8/F16 stored values and FP32 arithmetic, not proof of original GPU FP8 execution equivalence. It supports the actual small-token numerical fixture and dynamic-shaped graphs up to the declared512-token cap. It never silently truncates longer input. Plain-text tokenizer/browser parity is implemented by the parent integration; this module itself consumes explicit IDs/mask. ComfyUI emphasis/custom embeddings, automatic Bernini system prompts, reference-media conditioning and original workflow performance are not claimed.

Root owns the shared Hike `.rmsNorm(input,weight,rows,4096,1e-6)` implementation, tokenizer text-entry path, Worker/controller/UI/tensor connection and final browser tests. This module requires that Hike method and records actual final-norm contribution only after the call succeeds. The prepared bundle's normalization/reference gates must not be presented as measurements of arbitrary user prompts or hardware load.

## Inputs for integration

Manifest: `/workspace/work/inference/text-implementation/bundle/manifest.json`.
Files Map: each bundle relative file plus original source under basename `umt5_xxl_fp8_e4m3fn_scaled.safetensors`.
Fixture IDs: `[42,1234,1,0]`; mask `[1,1,1,0]`; expected `final-reference.f32`, shape `[1,4,4096]`. Compaction executes3active positions and restores the fourth zero row. Prepared native final error is metadata, not an inferred browser result.

Model weights/source were not published, pushed or placed in public/static serving directories by this agent. No further large graphs are needed for this assigned scope.
