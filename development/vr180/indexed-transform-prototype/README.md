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
  onIndexOwnership: async ticket => {
    await callerOwnedRegistry.put(ticket); // Await the registry's durable acknowledgment.
  },
});
```

`indexRoot` is a native OPFS directory owned by the caller's trial namespace. `outputHandle` must be a new/empty destination accepted by the unchanged `createFileOutput`. `trialId` is 1–60 ASCII letters/digits/underscore/hyphen, leaving room for distinct `-in` and `-out` job IDs. Both use the shared `vr180:index-job:<jobId>` ownership rule. Passing a single ID to both controllers is never used as a convenience shortcut.

`onIndexOwnership` is an optional awaited hook. Before creating each controller,
the entry generates a separate random 128-bit token and passes an immutable
ticket with `{format:'vr180-private-index-owner', schema:1, jobId, ownerToken,
kind:'input'|'output'}`. The job ID is `<trialId>-in` or `<trialId>-out`; the token
is 32 lowercase hexadecimal characters. Only after that callback resolves does
the entry pass the exact same job ID/token to the corresponding controller.
An input-hook rejection precedes Input/index/writer acquisition. An output-hook
rejection precedes output index/canvas/source/writer acquisition and still runs
the independent cleanup of the input owner already created. Cancellation is
checked before and after each acknowledgment, so cancellation during persistence
cannot create that index when the callback later resolves.

The registry in the example is supplied by the caller; it is not a new product
database or UI. Its acknowledgment must mean its own persistence operation has
completed. A callback that only starts a write and returns does not establish
durability. The callback must settle, and should honor the caller's cancellation
policy; the entry cannot interrupt an arbitrary unresolved callback. Without
the hook, conversion remains available but the entry does not claim that a
caller ticket survives reload. The ticket intentionally contains no file handle
or unbounded media data. The caller must retain the matching origin/root
namespace separately and must not infer it from a job ID alone.

Registry entries must not be removed merely because conversion rejected. Keep
them when cleanup failed or the Worker disappeared. Successful conversion has
already awaited index disposal and reports `indexReservedAfterCleanup:0`; the
caller can then remove its corresponding records. For failed or interrupted
work, first finish the still-live `retryCleanup`, or invoke the existing
`cleanupAbandonedIndexJob` with the explicit ticket after ownership can be
acquired. Remove the registry entry only after cleanup/absence is confirmed.
A ticket persisted just before acquisition may correspond to no directory;
the cleanup API reports that as `already-absent`. Unknown/damaged record or active
owner refusal must retain the registry entry for explanation/retry. There is no
TTL scan, conversion restart, public recovery UI, or automatic registry deletion.

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

`node --test tests/vr180-indexed-transform.test.mjs` passes thirteen contract/owner tests. They exercise the actual generated function with substituted codecs/index backends, while using the real file transaction and SHA implementation. Tests cover strict admission and limits, index attachment order/shared budget, the pixel loop, commit/readback, acquisition cancellation, codec-cancel failure, postcommit cleanup retry, postcommit metadata mismatch, and the retained AAC rejection rules. Three additional cases pause each ownership callback to prove awaiting/token correspondence, reject each callback to prove acquisition is stopped and existing cleanup still runs, and cancel during persistence to prove no late index creation. A real fixed-original `cslg` MP4 also passes saved-output inspection and fails the actual public input preflight before resource acquisition. They do not claim real browser decoding, encoding, OPFS, registry durability, VR playback, or performance. The separate native harness must recover and independently inspect complete output files before qualification.

## Named P5 trial output caps (private only)

`outputProfileId` defaults to `default` (1 GiB). Only `p5-5gb`
(5,200,000,000 bytes) and `p5-10gb` (10,200,000,000 bytes) add explicit
private final-output caps; arbitrary numeric caps are refused before inspection
or resource acquisition. The sink and the post-finalize extent use the same
resolved profile. Public source and default behavior are unchanged. The shared
100,000-sample, 16 MiB metadata, 8 MiB index, 4 MiB aggregate sort and bounded
chunk/backing contracts do not change. These limits are trial design values,
not evidence of a successful large conversion, capacity reservation, or public
support. P5 must separately establish actual payload, complete recovery and
independent quality before any large-profile acceptance.
