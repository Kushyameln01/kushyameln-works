# Basic browser media module — media-basic-b1

This operational baseline decodes images/video, encodes **every** frame as PNG, and packages a ZIP. It performs no LBP, feature extraction, alignment or duplicate selection. It does not use the shared compute Worker pool or WASM. FT/Unity continue using their own shared pool.

Entry: `../../media-runner/`. Shared API: `import {processMedia} from './sdk.mjs'`; `await processMedia(file, {trialId, inputRevision, signal, onProgress, onMetadata, onEvent})` returns `{zip: Blob, preview: Blob, manifest, receipt}`. Caller owns returned Blobs and any Object URLs; revoke URLs and discard references when replacing outputs. Events have the operationId/trialId/inputRevision; one frame job is one ordered decode/encode unit, not a Worker job. Inputs are never sent to the log collector.

Limits: 4 MiB input; 1,048,576 pixels/frame; 100 frames; 10 seconds; 8 MiB ZIP. Supported: PNG, JPEG, static WebP, VP9 WebM, H.264 MP4 under the inherited format restrictions. Dynamic dimensions, unsupported codecs/animations and excess limits fail explicitly. PNG outputs use browser orientation and sRGB rendering. Keep original media for audio and decoder comparisons. The ZIP has no audio and is not a playable video.

## Identity and measurements

Each run carries trialId, operationId, inputRevision, input SHA-256 and each output's SHA-256, bytes, sequence, timestamp/duration and child job identity. All identical frames remain. Manifest is a pre-packaging snapshot; companion receipt JSON records ZIP SHA-256 and packaging/Blob/output-ready timing. The receipt cannot be embedded in the ZIP whose hash it contains. Recover both files; use the ZIP manifest for frame hash verification and the receipt for ZIP verification.

SDK measures inputHash, decode (iterator next including validation, metadata, dynamic decoder import and frame reads), encode, outputHash, manifest, zip and blob with one browser monotonic clock. UI adds outputReady and inputToOutputReady. Stages can include waits and are not pure CPU times. Page navigation timing is attached separately. New page does not imply cold cache: cacheState stays unknown. Caller labels new-page/revisit/same-page independently.

Memory: tracked buffer estimates include output/ZIP/Blob; samples of nonstandard JS heap API and timer gaps are observations, not maximum memory bounds. Native codec, CPU/GPU allocation peaks are unknown (null). 8 MiB output limit is not an 8 MiB memory bound. Long Tasks API, if present, observes main-thread tasks only. ZIP stays synchronous; cancel is cooperative before/after packaging, never claimed to interrupt synchronous ZIP. UI aborts after30 seconds when the event loop can run. Input change discards stale visible results; failure/cancel records remain distinct from ZIP ready.

## Caller-side route measurement

Use `tools/media-baseline/trial.py` in the repository to begin a trial, mark observed milestones, verify/recover ZIP, and finish after answerReceived. Supply its trialId in the page field or `?trialId=...`. Record operationStart/pagePreparationStart/pagePreparationEnd/inputStart/inputTransferred/downloadStart/downloadRecovered/extraction/aiStart/aiReadStart/aiReadEnd/answerReceived. Each marker is observed by the caller; unobserved stages stay null. Browser clocks are never subtracted from caller monotonic clocks. operationToAnswer and inputToAnswer have different boundaries; compare prior results only with matched boundaries. AI start-to-answer includes orchestration and tool waits; it is not model inference time. Optional read markers must come from the observing caller, not guessed from answer contents.

History is local to this browser/origin, newest100 records up to1MiB with eviction count. Storage failure leaves current records in memory and displays an export warning. Closing an unsaved page loses that fallback. Use the history JSON export to retain a period's measurements; no unattended operation or duration is configured.

Anonymous event collector uses build media-basic-b1, tasks image-decode/video-decode, variant none, workers0 and kernelHash null. Full fixed stage records retained30 days; existing decode/encode/total aggregates90 days. Local hashes/names/media never enter network events. Start/complete/failed/cancelled refer to this baseline route. UI shows actual ACK counts and collection failures separately. Counts are client-lifetime, not operation receipts. Logs do not prove speed or stability; representative use over time is still required.

Advanced preprocessing is outside Pages in the repository's development/media-preprocessing snapshot. Public GitHub source/history remains readable. Previous total-speed failure remains recorded in development/media-production/RESULT-2026-10-17.md. No new Skill has been created.
