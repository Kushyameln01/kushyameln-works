# Wan UMT5 staged CPU/WASM preparation

This prepares the actual supplied `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (SHA-256 `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`) as24 sequential actual encoder blocks. It is not a miniature substitute model. Original FP8 matrix values are expanded to FP32 and multiplied by their stored scalar `scale_weight`; original F16 parameters are expanded exactly. No additional quantization or WebGPU path is introduced. FP32 arithmetic is a diagnostic/compatibility path and does not establish equality with an original GPU FP8 execution.

The unchanged ComfyUI T5 source/config are pinned at `b5a432157de6b8884f81104cd02926adf4d597e4`; the source is GPL-3.0 and its license/provenance are retained here. CPU dependency adapters implement its ordinary Linear/Embedding/SDPA operations; this is not a running ComfyUI installation. Every layer's actual keys and shapes are loaded strictly.

## Prepare locally

Run the following from this directory, or use the repository-root commands in [the inference preparation guide](../README.md). Use a dedicated Python environment with the pinned CPU requirements (no CUDA packages). The output requires about18.54GB in addition to the unchanged6.74GB original. Keep extra working headroom; one block is converted at a time.

```
python -m pip install -r requirements.txt
python prepare.py --model /path/umt5_xxl_fp8_e4m3fn_scaled.safetensors --out /path/umt5-bundle
```

`--deps /path/to/site-packages` can select an existing isolated dependency directory. `--resume` reuses existing block files while re-evaluating the staged numeric chain. `--limit N` is for partial feasibility investigations; its manifest stays incomplete unless all24 blocks pass. `--compact-proof proof.json` permits recording independently obtained padded-prefix equivalence evidence; it does not invent a proof or silently enable compaction.

Preparation reads only selected embedding rows for its numerical fixture and one transformer block's parameters at a time. The original2.1GB embedding table is not copied into another large file. Finalization verifies the whole original file hash, creates an8.2MB table of per-row hashes for bounded runtime reads, and extracts the unchanged embedded SentencePiece model. It refuses an incompatible original hash.

Preparation rejects public `docs/` destinations, including symlink aliases, and accepts `--limit` only from1 through24. A nonempty existing output directory requires explicit `--resume`; a new or empty private directory is accepted. Source/config bytes are checked against the packaged pinned provenance before numerical imports or executing the reference source. Explicit `--source`/`--config` copies are allowed only when their bytes match those pins. These checks do not load or re-export model tensors.

The manifest contains each graph's bytes/hash, exact source/model identity, final-normalization weights, numeric gates and results, tokenizer parameters, and completeness. Do not distribute a partial manifest as a complete model. ONNX opset17 and ORT1.24.3 are required.

## Runtime connection

`docs/shared/inference/text-encoder.mjs` exports:

```
const encoder = await loadTextEncoder({manifest,files,ort,hike,onProgress,signal});
const result = await encoder.run({tokenIds,attentionMask,onProgress,signal});
await encoder.dispose();
```

`files` is a Map of relative bundle filenames to local File/Blob or Uint8Array. Include the original safetensors under its basename. Original embedding rows are obtained with bounded File.slice and checked against the row-hash table. Graph and final-norm/hash-table files are checked before use. At most one ORT inference session is alive at a time; each block uses the WASM provider and threads1. A dedicated owner Worker is necessary to terminate an uninterruptible WASM call promptly; the parent controller owns that boundary.

`hike.rmsNorm(input,weight,rows,4096,1e-6)` is mandatory and replaces the actual model's final T5RMSNorm. Its output contributes directly to the returned tensor. There is no JS fallback for that operation. Padded output rows are zeroed as Wan's `zero_out_masked=True` requires. Results contain Float32 hiddenStates, shape `[1,requestedTokens,4096]`, Uint8 attentionMask and provenance.

The explicit token-ID API accepts1..512 tokens and a matching binary mask; it rejects unknown shapes/IDs and never silently truncates a prompt. The parent UI's separately validated plain SentencePiece text path adds EOS1, uses pad0 and pads to512. ComfyUI prompt emphasis/custom embeddings, Bernini system prompts, or other conditioning are not added implicitly.

When the manifest contains a matching successful compaction proof, only trailing masked positions are elided internally; all interior positions are retained. Original requested length and zero padding are restored on output. Padded query rows cannot influence active rows because every attention layer masks padded keys, subsequent feedforward/norm operations are per-position, and final masked outputs are zero. A real block0 padded512/prefix3 reference comparison supports this bounded implementation; broader end-user precision/performance acceptance remains separate.

## Validation

- `test-runtime.mjs` covers manifest rejection, single-session lifetime, abort cleanup, internal-mask preservation and row-integrity rejection. Tiny lifecycle doubles are explicitly separate from numeric model validation.
- `test_prepare_contract.py` checks an actual completed bundle, all24 real layers and the unchanged final-output error gate.
- `verify_compaction.py` checks the actual first block's padded512 vs active-prefix semantics against pinned source. Its current command paths describe the original execution workspace and should be adapted to a new preparation environment.

The original intermediate absolute-only threshold0.001 failed on hidden magnitudes around20,464 (absolute difference0.08984375, normalized difference4.39e-6). That failed trial is retained. Before the remaining layers, scale-aware intermediate thresholds were recorded (normalized peak and relative RMS≤1e-4); the predeclared normalized final-output maximum error0.001 was retained unchanged. Actual full24-layer native FP32 final error is about2.143e-6. This is not a claim that the original intermediate absolute gate passed, nor a user-workflow quality guarantee.

Browser/WASM results, Hike final-normalization contribution, text-tokenizer compatibility, cancellation/memory and actual user workload are separate acceptance evidence collected by the owning integration workflow.
