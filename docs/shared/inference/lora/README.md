# Local-folder LoRA module

The user selects a folder on their own terminal. Original `.safetensors` are read using File.slice; neither model upload nor persistent browser registration is performed. Calculation still runs in Hike WASM in the browser/Worker of the consuming tool. This is not a native filesystem daemon: a browser cannot open an arbitrary terminal path without the user's folder permission.

## Inputs

`openLoraFolder(FileList)` recognizes complete pairs:

| Pair ID | High | Low |
| --- | --- | --- |
| light | Bernini-R_LightX2V_high_noise.safetensors | Bernini-R_LightX2V_low_noise.safetensors |
| detail | NSFW-22-H-e8.safetensors | NSFW-22-L-e8.safetensors |
| folder | HighNoise.safetensors, or one .safetensors inside HighNoise/ | LowNoise.safetensors, or one .safetensors inside LowNoise/ |

Missing/ambiguous/conflicting pairs fail. File selection captures immutable File references; reselect the folder to observe changed disk files. Original bytes are not modified. The four original development inputs remain under `/workspace/work/lora/{light-safetensors,detail-safetensors}`; no model binary is bundled in this repository.

`inspect` reads the header only. `plan` computes a streaming whole-file SHA-256 for the selected local file, with cancellation and optional byte progress. This is distinct from header inspection and may take time for GB files. The planner rejects unsupported tensors and missing target mappings, and never infers base compatibility from filenames or equal shapes.

Supported source dtype: BF16/F16/F32. Initial target profile: F32 row-major Linear LoRA and additive weight/bias differences. Standard down/up and A/B names are recognized. Conv, DoRA, rsLoRA, quantized bases, graph fusion/slices/transposes require an explicit future handler, and are not silently flattened or converted. Light's `.diff`/`.diff_b` are applied too. Present alpha means alpha/rank; absent alpha means scale=1, explicitly following [ComfyUI's pinned loader](https://github.com/comfyanonymous/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/weight_adapter/lora.py). [Diff patch mapping](https://github.com/comfyanonymous/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/lora.py) is pinned separately. This is loader-policy provenance, not proof of real-model equivalence.

## Independent ES module API

```js
import {openLoraFolder} from './folder.mjs';
import {createLora} from './sdk.mjs';
const folder = openLoraFolder(folderInput.files);
const lora = await createLora({folder}); // loads/checks real Hike WASM
const selection = {pairId: 'light', noise: 'high'};
const report = await lora.inspect(selection);
const target = await targetResolver(selection); // supplied by the inference tool
const plan = await lora.plan({selection, strength: 1, target: await target.describe(),
  onHashProgress: ({bytesHashed,totalBytes}) => { /* observed bytes, not invented % */ }});
const sink = await createSink(plan);
const prepared = await lora.prepare(plan, {baseProvider, sink, blockRows: 16});
try { await lora.apply(prepared, target); }
finally { await lora.release(prepared); }
// Restore immutable original package; no subtracting rounded deltas:
await lora.detach(target);
await lora.dispose();
```

A folder may expose light and detail; selection chooses the pair and the High/Low model side explicitly. The upstream pipeline is responsible for its model-specific noise schedule and for coordinating both model sides in a generation. This module does not invent a High→Low timestep threshold, and does not certify simultaneous light/detail composition. No automatic application of one side to the other base.

### Consumer contract

The separate Codex's inference module supplies these interfaces. Names here are the implemented boundary, not a claim that that external module already implements them.

- `target.describe()` returns `{apiVersion:1, modelHash, graphHash, registryVersion, targets:[...]}`. Each target has `{key,weightId,module,graphInitializer,shape,dtype:'F32',layout:'row-major'}`. `key` is the explicit original logical layer weight/bias key, e.g. `diffusion_model.blocks.0.cross_attn.k.weight`. `graphInitializer` and weight provider must describe the **actual exported graph**, including any transformation. Unsupported transformations are rejected. Hashes are 64-character SHA-256 hex strings. Current module names: text_encoder/diffusion_models/vae, but actual provided targets determine applicability.
- `baseProvider.readBlock(weightId, elementOffset, elementCount, {signal,modelHash,graphHash})` returns an independently owned Float32Array from the immutable original base, never from an already patched version. It must honor abort and reject identity mismatch.
- `sink.begin(manifest)` starts a transaction. `sink.writeBlock({weightId,graphInitializer,offset,count,shape,dtype,sha256,data})` persists/copies each bounded Float32Array before resolving. Offsets/counts are elements, not bytes. `sink.finish(manifest)` checks completeness and returns an owned prepared package handle. `sink.abort(error)` cleans up even a partially failed begin. `sink.release(handle)` frees it. The sink must construct the actual graph/external-weight package consumed by the target. A dictionary of arrays is not automatically an ONNX package.
- `target.prepareLoad(handle,context)` loads an isolated candidate session/package; `target.validate(candidate,context)` must run the agreed small real-model input and return true; `target.commit(candidate,context)` atomically switches it. `target.rollback(candidate,context)` restores prior usable state and releases candidates after any failure, even if preparation itself failed. `target.prepareBase(context)` prepares immutable original weights for detach. Commit/rollback must not mutate unrelated sessions.
- `context` includes schema/build/job/input/application revision, base/graph/adapter hashes, plan ID, binary block checksums, AbortSignal and `isCurrent()`. The consumer MUST check revision/abort/current immediately before its atomic switch. Old operations cannot overwrite newer inference state. No unsupported mutable-initializer ORT API is assumed: an ORT consumer normally rebuilds a session from a verified package.

No WASM pointers cross this API. Buffers are copies owned by the caller/sink. All prepare/apply/detach calls are serialized; concurrent requests fail clearly. `cancel()` invalidates plans/results and aborts at the next block/async boundary; a currently running bounded synchronous Hike call completes first. Providers/consumers must honor AbortSignal. `dispose()` waits for the current cooperative operation to settle before releasing handles. An injected kernel is caller-owned; otherwise the SDK disposes its kernel. A consumer holding an applied session must own its loaded bytes independently before the prepared handle is released.

Each new plan invalidates older plans/packages; a single SDK instance represents one active model-side application. For a two-stage high/low pipeline, use separate SDK instances coordinated under the pipeline's common generation snapshot. Integrated multi-target commit and actual inference are consumer responsibilities, not silently claimed by a successful weight calculation.

## Embeddable UI and preview

```js
import {mountLoraPanel} from './panel.mjs';
const panel = mountLoraPanel(element);
panel.connect({targetResolver, baseProvider, createSink, blockRows:16});
// On host teardown:
await panel.dispose();
```

Preview: serve the repository's `docs/` root over HTTP and open `/lora/`. Only the folder selector, detected pair/side, strength and relevant actions are shown. Apply is disabled with `推論モジュール未接続` until the real consumer is connected. The preview performs inspection without a model/base; it does not fabricate an inference result. SDK can be imported into the host's own Worker; synchronous kernel exports use a fixed workspace. See `kernel/README.md` for ABI and build.

The previous administrator HTTP catalog/provider remains an optional programmatic adapter for the earlier delivery design. It is not used by this panel/local-folder path; detail external URLs remain unset. Its ranged reads do not assert whole-source SHA verification or production CORS support.

## Verification

From repository root:

```sh
node --test --test-isolation=none tools/lora/test-*.mjs
node tools/lora/test-panel.cjs
node tools/lora/kernel/browser-check.cjs
python tools/lora/check-real-kernel.py
node tools/lora/inspect-local.mjs /workspace/work/lora
```

Node tests cover real Hike arithmetic, all patch kinds, local source identity, malformed tensors, transaction failure/cancellation and stale input. Chromium tests use local-file fixtures and a **test consumer**, not a real model. Four real-file slice comparisons use synthetic zero base against independent Python arithmetic. Real base compatibility, complete original ComfyUI workflow agreement, the separate Codex's consumer, user-terminal performance and public deployment remain NOT VERIFIED. Evidence is in `development/lora/`.
