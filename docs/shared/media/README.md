# Shared media preprocessing foundation

GitHub Pages candidate build `media-foundation-b2`, shared compute `compute-unity-b2`. This SDK is under validation. Check the live build and its capabilities before use; numerical correctness does not establish overall AI acceleration.

```js
import {createComputePool} from '../compute/pool.mjs';
import {createMediaProcessor} from './sdk.mjs';
const pool = createComputePool({concurrency:4, workerMode:'bundle'});
const processor = createMediaProcessor({
  pool, variant:'auto', chunkUnits:4, lookahead:4,
  memoryBudgetBytes:16*1024*1024
});
await processor.process({
  frames: signal => yourAsyncRGBAFrames(signal),
  policy: {mode:'all'},
  onFrame: async result => { await consumeColorCodesAndMetadata(result); }
});
processor.dispose(); // cancels only its own operations
pool.dispose();      // the session owner closes a shared pool
```

Frames contain fixed, nonshared RGBA8 `data`, positive width/height, stride in bytes and optional presentation timestamp/duration in seconds. Default limits are 1,048,576 pixels, 100 frames, 10 seconds. Explicit `limits` may raise the SDK bounds to at most 16,777,216 pixels, 100,000 frames and 86,400 seconds, subject to a separately sufficient memory budget. These are admission ceilings, not a measured throughput promise. The browser adapter/exporter has narrower limits below.

Outputs are ordered and callbacks awaited. The SDK snapshots producer buffers before requesting the next frame, even when a producer reuses its buffer. `chunkUnits` is 1/2/4; lookahead is 1..16; byte budgets may produce smaller waves. The media SDK defaults are concurrency4, chunk4, lookahead4, bundle loading, automatic SIMD and no Module reuse. Generic compute-pool defaults remain unchanged. Explicit module/chunk1/lookahead1 remain available for comparisons or smaller working sets. Finite chunks share one job's kernel instance, then end that Worker. No second scheduler or shared mutable Wasm memory is introduced. Bundle and module use the same registered Wasm assets. The selected defaults follow representative browser measurements; they are not an optimality claim across devices and inputs.

SDK live/peak counters cover owned RGBA/gray/codes/histograms, alignment references and temporary outputs. Pool snapshots/retained results, Wasm arena capacity, decoder resources and caller-retained outputs are separate. Completed output buffers belong to the caller. Keep only what the next step needs. `cancel(operationId)` affects only that operation; `dispose` never disposes a supplied pool. External producers and consumers must honor cancellation and settle their own work; arbitrary never-resolving callbacks cannot be forcibly stopped by terminating a Worker.

LBP uses neighbor >= center, bits NW,N,NE,E,SE,S,SW,W. Outer codes are zero and excluded from histograms. Features composite alpha over white using rounded integer channels, then luma 77R+150G+29B /256. Original color pixels are retained independently. `LBP_CONVENTION` binds this whole convention and display coordinates. Hike byte reads explicitly normalize unsigned values. Selected scalar/SIMD and actual ABI/hash appear in job metrics.

## Optional reference translation

```js
const alignment = {
  reference:'first-frame', referenceId:'anchor', sceneId:'shot-1',
  roi:{x:12,y:10,width:20,height:18}, searchRadius:5,
  policy:{maxCost:.05,minGap:.05,minTexture:.1,minMatches:3,
    minInlierRatio:.75,maxFbError:0,consensusTolerance:0}
};
// These policy numbers illustrate a test fixture, not universal confidence calibration.
await processor.process({frames:yourFramesWithSceneIds,alignment,onFrame:consume});
```

Each frame must carry the declared sceneId. The reference can instead be `{id,inputRevision,sceneId,conventionId,sha256,width,height,codes,timestamp}` with packed LBP codes, the exported convention ID, exact lowercase SHA-256 and timestamp or null. The SDK reserves/snapshots codes before hashing. Reference/current revisions identify their respective inputs and need not be equal. Maximum alignment size is 1 MP, ROI sides 8..128 pixels, integer radius 0..16. ROI must lie inside the valid LBP interior.

`frame.data` remains original. `frame.aligned` is a separate RGBA derivative and validMask, or null. `frame.alignment` records the reference/hash, confidence decision, actual scalar alignment kernel metrics, and current-to-reference matrix. Reject low texture/ambiguity/scene or dimension mismatch; never label an unapplied transformation corrected. Uncovered pixels are transparent and marked invalid. This is explicit reference/ROI translation, not semantic object detection or a guarantee that two images show the same object.

## Browser transport and metadata collection

`readMediaFrames` accepts PNG, baseline/progressive 8-bit grayscale/RGB JPEG, static WebP and WebM/VP9 or nonfragmented MP4/avc1 H.264 where the browser supports the codec. It rejects animated PNG/WebP, unsupported JPEG modes, encrypted/fragmented video and unsupported orientation/transform combinations explicitly. JPEG EXIF 1..8 is applied by the image decoder. For WebP EXIF 2..8 the adapter normalizes only the verified orientation field in a temporary Blob, verifies coded dimensions and applies the explicit display transform; the original Blob is retained unchanged; video samples are display-normalized by the pinned adapter. Returns display sRGB RGBA8, actual presentation timestamps and durations. The UI bounds are 4 MiB compressed input, 1 MP, 100 frames/10 seconds and 8 MiB complete ZIP. `resolveMediaLimits` supplies the same limits to `readMediaFrames`, `createMediaProcessor` and `encodePng`; explicit adapter ceilings include 64 MiB compressed input and 16 MP. Native codec/JS memory is not measured by logical byte counters. Original video audio remains in the caller's source file. Keep that file locally.

`createTelemetryClient` plus `createOperationTelemetry` can receive SDK onEvent and decoder onMetadata. This optional adapter sends only fixed performance/usage metadata to the site's collector. It reports queued/attempted/stored/duplicate/rejected/expired separately; enqueue is not proof of durable collection. SDK intervals stop after awaited frame callbacks, before outer ZIP/download steps. Tokens, file names, media, feature arrays and free-form error messages are excluded. New ordinary operation events identify all/alignment/exact-duplicates; missing mode in older events remains unrecorded rather than being classified as all. Hosted receipt and Pages CORS must be verified for each deployment.

## Optional exact frame selection

`process({policy:{mode:'exact-duplicates',anchorEvery:30,requiredTimestamps:[],budgetBytes:16777216},onFrame,onOmitted,...})` retains first/changed/periodic/required/final frames. Ordinary `all` remains the default. Identity compares every visible RGBA byte, every LBP code and histogram byte, dimensions, scene and coordinate mapping. It never drops color/text/event changes on the basis of LBP similarity. Approximate selection is not implemented. Alignment and exact selection together are explicitly unsupported in this version.

`onOmitted` is required and receives original sequence/timestamp/duration, a previously kept referenceSequence and reason. Keep this complete timeline; source times and audio are not shortened or renumbered. `frameCount` remains the number of processed source frames; `result.selection` contains separate kept/omitted counts and budget counters. The final pending frame callback and all omission callbacks settle before SDK completed. Missing required source timestamps, callback failure or cancellation fail the operation. The helper's binary/metadata budget is separate from SDK/pool/codec/export budgets. Do not sum overlapping work durations as elapsed time. `selection.mjs` also exposes the standalone awaited push/finish interface.

## Explicit paper-derived features

`paper/sdk.mjs` exports `createPaperProcessor({pool,variant:'auto',onEvent})`. A caller-owned existing compute pool is required. `preprocess({frame,roi,sampleId,sourceSha256},{signal})` crops an explicit fixed display ROI (each side1..64) and returns packed LBP codes, preprocessing/code hashes and metrics. The crop uses zero-gray halo, which differs from the ordinary whole-image SDK's zero-code outer border. Training and inference must use the same preprocessing hash, source dimensions and ROI coordinates; there is no automatic resize or object detection.

`fit({kind,width,height,featureCount,rankPolicy:'strict',preprocessing,splitManifest,samples},{signal})` returns a pool envelope whose `result.model` is the trained model. Kinds are `svd-diagonal-v1` and `paper-alg2-diagonal-v1`; featureCount1..16. `infer({model,codes,preprocessing,source},{signal})` returns an envelope with `result.features`. Both are finite Hike scalar jobs on that same pool. Only LBP preprocessing selects SIMD. Failure may include a finite `detailCode` such as RANK_LIMIT; ambiguous or inaccurate numerical solutions are rejected.

Source/group/split provenance is caller-declared at the general SDK boundary, while code and model hashes are verified. Separate original-source groups before training; evaluation images must not tune feature settings. The paper-lab caller hashes actual selected file bytes, checks same-hash and declared-group separation, fixes settings before fit, and exports the model with preprocessing/splits/LBP/evaluation correspondence. It cannot detect semantically related files declared as separate groups. Each admitted Paper SDK operation returns bounded local start/terminal logs. `paper/operation-telemetry.mjs` exports `createPaperOperationTelemetry({client})`; pass its `onEvent` to the processor to collect fixed metadata through the same sender. The remote fields exclude source/group/sample IDs, labels, models, features and caller-derived hashes. Preprocess records the actual LBP variant/hash; fit/infer record the scalar Paper hash and fixed method. Training size bands count total grid positions, not original-image pixels. Unknown worker count or non-UUID operation IDs remain local with a skipped reason. UI collection status is separate from computation success; bounded queues, session quotas, offline conditions and expiry can prevent collection.

`paper/dataset.mjs` provides `exportPaperModel` and `restorePaperModel` using exact Float64LE/Uint8 hex coefficients. Ordinary JSON number arrays can lose negative zero and invalidate a model hash. After restoring a model, inference revalidates its hash. Limits and measured training/application times appear in the caller output. This feature extractor is not a classifier, a general-quality result, or proof of total AI acceleration.

Mediabunny 1.61.5 is unchanged under MPL-2.0, with license and complete original source in `vendor/`. ZIP packaging reuses the existing fflate dependency.
