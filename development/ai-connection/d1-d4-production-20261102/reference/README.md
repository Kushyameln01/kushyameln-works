# Independent bounded reference

`tools/diffusion-models/production-reference.py` imports only the separately frozen NumPy reference, original safetensors reader and independent sampler expressions. It does not import candidate runtime, ORT, Hike or a native prediction. Actual chunk bytes are comparison operands only; reference state is written exclusively from independently calculated expected values.

Freeze the input identity, tracked full core source, numerical source hashes, retained model/header identities and **`abs=0.01 + rel=0.001*abs(reference)`** gate before model work. This is the existing bounded source-profile gate, not a claim of original mxfp8 equivalence. The gate must not be relaxed after comparison. Ordinary API inputs do not contain a reference, gate or receipt.

## Source and arithmetic

The complete captured original `comfy/ldm/wan/model.py` is checked against `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`. The existing independent `standalone-reference.py` owns E4M3FN/F16 decode, own weight scale, norm, modulation, rotary coordinate arithmetic, SiLU/GELU and target unpatchification. The new runner supplies generic saved inputs and chunk orchestration; it does not reinterpret old L3 evidence as L512 evidence.

Independent Gemm uses full-inner F64 accumulation and F32 rounding before separate F32 bias. Independent attention uses F64 online, max-rescaled global softmax over **all supplied keys**, all40 heads, and F32 output. Its tiny dense comparison covers multiple key tiles and a tail. Chunking the key scan changes no key population. Numerical comparison with native F32 operators uses the frozen error gate; it is not bit-equality to original GPU execution.

Original order is patch -> time/text prefix -> each block's modulation, Q/K RMSNorm, RoPE, self-attention, O projection, e[2] gate and block-input residual -> norm3/cross Q/K/V, cross-attention, O and residual -> norm2/modulation, FFN up/GELU/down, e[5] gate and residual -> final modulation/head -> target extraction/unpatchify. Every later block reads independently produced prior-block output. Saved post-modulation fixtures are not substituted as runtime input.

## Chunk interface

```python
owner = ChunkOracle(manifest_path, model_file, 'HIGH', private_reference_dir,
                    allow_model_work=True)
metrics = owner.compare(event_metadata, owned_binary_float32_chunk)
summary = owner.stats()
owner.close()
```

Metadata uses `bernini-model-chunk/1` and preserves `name`, `block`, `globalRowStart`, `rowCount`, `rowAxis`, `columns`, `shape`, `fullShape`, `dtype`, `model.side`, `model.modelSha256` and `timestep`. Optional coordinates are flattened F32 `[rows,3]` positions and Int32 source IDs serialized as number arrays. These are checked against independently derived stream/frame coordinates. Queries span the complete N, in chunks1..128; cross K/V span all512 Text rows. Final prediction uses NCTHW contiguous row spans, columns=target W and rowAxis=null.

For demand-driven comparison the native emission selection must include all `k`, `v`, `selfResidual`, `crossResidual`, `ffnOutput` and `blockOutput` rows. Other stage comparisons are optional diagnostic detail. Complete K/V coverage is required before global attention. Complete self residual is required before cross K/V; complete FFN output is required before block output; complete block39 is required before head; complete all-token head is required before target prediction. Missing stages fail explicitly. Stage comparisons cannot promote a block diagnostic into complete predict/sample.

The parent must serialize calls. `compare` awaits no external native values; a failed comparison returns failure counts for the harness to stop. `close` releases reference memmaps and model handles. Private reference backing-file deletion belongs to the runner after closing; output artifact files remain private for readback/identity checks. No actual callback chunk is retained beyond comparison.

## Budget

At N73947 one F32 hidden-width store is **1,514,434,560 bytes**; independent X+K+V peak backing size is **4,543,303,680 bytes**. K/V are removed before cross/FFN; X is updated after each independently completed residual. There is no full Q or attention-score store. Cached F32 weight matrices are bounded at600,000,000 bytes; the two largest FFN matrices together require566,231,040 bytes. F64 Gemm converts128 output columns at a time. Online attention uses128 query rows ×256 key rows ×40 heads; F64 score/probability tiles each occupy10,485,760 bytes. This is an oracle-only budget, not a combined native/browser/host acceptance result. Combined RSS/PSS/tmpfs/cache/WASM/ORT must be measured by the execution harness before admitting original-size stages.

## Explicit reference execution

```sh
python3 tools/diffusion-models/production-reference.py execute-reference \
  --manifest /tmp/new-small-inputs/inputs.json --contract /tmp/new-small-contract.json \
  --models /private/model-directory --private-dir /tmp/new-small-reference \
  --receipt /tmp/new-small-reference-receipt.json --operation predict --side HIGH
```

Use `--operation sample` for original Euler/simple6/shift5/split3, HIGH3→LOW3, explicit noise and generated-sample restoration. Use `--stop-after-block 0` for a standalone one-block diagnosis, which returns no velocity or sampler prediction. Full geometry additionally requires `--allow-full-shape`; this is an explicit diagnostic resource choice, not ordinary API admission. Output `reference.json` points to owned little-endian F32 files by path/shape/bytes/SHA-256. The six-step reference reuses the separately owned original sampler expressions and fixes their target shape, preserving C16 axes and each staged F32 expression boundary.

`self-test.json` is no-model validation only. A successful self-test does not establish real full-shape Gemm, attention, full40, six updates, public Worker operation, original-media replay or generation READY.

`input-coordinate-test.py` additionally reads bounded saved input windows and checks12 independently fixed stream/frame/patch landmarks, four chunks crossing source boundaries, scalar channel-major patch ordering and out-of-range rejection. It opens no model or full hidden store:

```sh
python3 development/ai-connection/d1-d4-production-20261102/reference/input-coordinate-test.py \
  --manifest /tmp/new-full-inputs/inputs.json --receipt /tmp/input-coordinate-test.json
```
