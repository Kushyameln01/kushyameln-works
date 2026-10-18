# Indexed direct-file conversion runtime

This Sites runtime extends the reviewed disk-index implementation with streaming
capacity routing. The sole output profile is `default`, with no fixed input/output
file-size cap (`maxBytes: null`). Safe-integer offsets, MP4 structure and available
storage still constrain processing. No large-media runtime trial was performed for
this change; earlier private trial results do not qualify this revision. Private
large-output profiles and fixture input admission remain absent.

`transform.mjs` exports `convertStereo`, `createDirectMuxDestination`,
`cleanupConversionResources`, `createAacPacketCopier`, `validateIndexedAdmission`,
`inspectSavedOutput`, `OUTPUT_PROFILES` and `resolveOutputProfile`. `convertStereo`
accepts the existing `fork`, `indexRoot`, `outputHandle`, `jobId`, `signal`,
`onIndexOwnership`, `onCleanup`, `onOutputCreated`, `onProgress`, `onMetrics` and
default-only `outputProfileId` options. The caller must supply exactly one module
instance from `../vendor/mediabunny-indexed.mjs`; never mix its media classes with
the original shared vendor in a job. Importing this module does not load a codec
vendor. Routing and recovery UI are separate modules owned by the integration caller.

The input inspector is the strict `../mp4.mjs`, including AVC/HEVC sample-entry and configuration validation. `cslg` handling in
`mp4-output-inspect.mjs` is limited to saved-output verification. There is no relaxed
input parser or fixture option. H.264 and H.265/HEVC SDR inputs require the browser's decoder support; output remains H.264. One video and no audio or one AAC track,
geometry and timing/AAC preservation remain unchanged. Total indexed samples may
reach 10,000,000, aligned with the existing parser's per-track admission ceiling.
The total count is independent of the fixed output reorder workspace (100,000
samples); an oversized reorder group is rejected before writing another record.
Input presentation sorting keeps its bounded external merge. Explicit index
reservations remain 0.008388608 GB and aggregate sorting reservations remain
0.004194304 GB. The whole moov box is paged without a total metadata-size cap;
retained small metadata and the input skeleton remain bounded to 0.016777216 GB.
GB means 1,000,000,000 bytes. These budgets do not bound browser or codec memory.

The transform commits once, compares saved metadata to its precommit hash, reparses
the saved output and fixes immutable `savedObservation` before later cancellation,
callbacks or cleanup. Normal results return `file`, `saved`, `savedInfo`,
`verification`, `savedObservation`, `metrics`, `info` and `cleanup`. Later exceptions
carry the same observation; uncommitted or unverified output does not. Full-file SHA
is observed (`NOT_COMPARED`), while metadata is compared (`MATCH`). Save evidence
does not establish transfer, independent decoded quality, playback or page receipt
after Worker loss. Callers must not tag or commit an already-saved result again.

`job-owner.mjs` exports `createOwnedIndexJob` and `cleanupAbandonedIndexJob`.
Ticket format `vr180-private-index-owner`, schema 1 is retained for compatibility.
Its historical name is not an access permission or an external save receipt.
Persist the exact ticket before creating an index, close all owned handles before
cleanup, and retain records on unknown ownership, contention or cleanup failure.
Only explicit job ownership authorizes recovery; no TTL scan or global deletion is
provided. A committed external MP4 is never an index cleanup target.

`provenance.json` retains historical source hashes and records the shipped runtime
hashes plus the Sites capacity changes. The historical prototype generator alone
does not reproduce these later Sites edits. The dedicated vendor is unchanged and
includes original source, supplements, patches, MPL-2.0 and an offline rebuild
script. Input/output controller files derived from Mediabunny retain MPL notices;
the license is available at `../vendor/mediabunny-LICENSE`.
