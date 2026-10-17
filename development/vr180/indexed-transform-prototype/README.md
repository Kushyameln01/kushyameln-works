# Private indexed pixel conversion entry

This prototype is outside Pages and is not imported by the public worker. It connects the existing pixel conversion loop to the private input/output index fork. It changes no public vendor, accepted input format, limit, or deployment. Native WebCodecs/OPFS qualification is required before any acceptance claim.

## Fixed source and preserved behavior

`make-transform.py` requires the exact public `docs/shared/vr180/transform.mjs` and Worker hashes recorded in the script and `provenance.json`. It writes `transform.mjs`, a unified `transform.patch`, and hashes for both complete sources and two unchanged substantive sections. Regeneration fails when the fixed public source changes.

The AAC copier and the audio scheduling / Canvas draw / VideoSampleSink / WebCodecs loop are byte-identical to the public transform. Geometry uses the unchanged public geometry module. The existing Worker admission rules are retained with `mode:'convert'` required. The entry first calls the unchanged public MP4 inspector, then checks confirmation, projection, eye layout, FOV, timing safety, total samples ≤100,000 and container metadata ≤16 MiB. The saved-output role uses the existing P3 derivative with its strict five-field/length/unknown-box checks, so a correctly generated `cslg` is validated. That role does not relax input admission. Private `cslg` input admission is not enabled: `createInputIndex` receives the default strict profile. Unknown or unsupported inputs still fail before an index or output writer is acquired.

Only one supplied combined fork module supplies Input, Output, sinks, sources, packet types and StreamTarget. No public Mediabunny bundle is imported by this module. The caller must obtain the fork from its separately verified build and retain that build provenance.

## Entry contract

```js
import * as Fork from '/fork.mjs';
import {convertStereo} from '/development/vr180/indexed-transform-prototype/transform.mjs';
const result = await convertStereo(inputFile, {
  mode: 'convert', confirmed: true, layout: 'sbs', fov: 180,
  eyeSize: 256, bitrate: 2_000_000,
}, {
  fork: Fork, indexRoot, outputHandle, jobId: trialId,
  signal, onProgress, onMetrics, onCleanup, onOutputCreated,
});
```

`indexRoot` is a native OPFS directory owned by the caller's trial namespace. `outputHandle` must be a new/empty destination accepted by the unchanged `createFileOutput`. `trialId` is 1–60 ASCII letters/digits/underscore/hyphen, leaving room for distinct `-in` and `-out` job IDs. Both use the shared `vr180:index-job:<jobId>` ownership rule. Passing a single ID to both controllers is never used as a convenience shortcut.

The entry creates one 8 MiB explicit index budget. Input index sort gets `4 MiB - PROFILE.sortReservedBytes` (2,594,304 B), output reserves 1,600,000 B, keeping the combined sort allowance at 4 MiB. The input controller is attached before the first `getTracks`. Both controllers remain bounded by their reviewed profiles; this is not a whole-process/native/codec memory guarantee.

The external writer uses fixed 1 MiB StreamTarget chunks and a HWM=1 wrapper. Every actual write and the final extent preserve the 1 GiB limit. There is no whole-moov capture or onMoov callback. The output controller inserts SBS VR180 tags and seals/inspects metadata before explicit commit. The entry compares the saved metadata hash with its precommit hash and runs the existing P3 output-only inspector on the saved File. Whole-file SHA-256 is observed after commit; it is not falsely labeled a comparison against a pre-write whole-file hash.

Return value:

- `file`, `saved`: committed File and `{bytes, sha256, committed, hashMatched:false, timings}`.
- `metrics`: public loop/phase counters plus `inputIndexBeforeCleanup`, `outputIndexBeforeCleanup`, disposed index snapshots, and `indexReservedAfterCleanup`.
- `info`, `savedInfo`: normalized SBS/180 conversion output and actual saved-output inspection result.
- `verification`: saved SHA, metadata expected SHA/range/match and committed fact.
- `cleanup`: retryable owner cleanup callback; the normal return has already awaited cleanup.

## Resource and failure boundary

The owner cleanup independently attempts Input disposal, upstream Output cancellation, writer abort, pending initialization cleanup and both index disposals. An upstream cancel failure still requires Worker termination; successful writer/index cleanup is not presented as proof that codecs closed. A cleanup failure retains its owner closure through `retryCleanup`; no other job is removed. `onCleanup` registers that same closure for the caller to invoke only after the conversion promise has unwound.

Held samples and the canvas are released on all exits. Final failure preserves a live `saveOutputState` getter: a committed file remains committed even when readback or cleanup fails. Such a trial rejects and is not a successful conversion. Cleaned successful trials return only after both index controllers dispose and the shared explicit reservation returns to zero.

## Local verification

`node --test tests/vr180-indexed-transform.test.mjs` passes ten contract/owner tests. They exercise the actual generated function with substituted codecs/index backends, while using the real file transaction and SHA implementation. Tests cover strict admission and limits, index attachment order/shared budget, the pixel loop, commit/readback, acquisition cancellation, codec-cancel failure, postcommit cleanup retry, postcommit metadata mismatch, and the retained AAC rejection rules. A real fixed-original `cslg` MP4 also passes saved-output inspection and fails the actual public input preflight before resource acquisition. They do not claim real browser decoding, encoding, OPFS, VR playback, or performance. The separate native harness must recover and independently inspect complete output files before qualification.
