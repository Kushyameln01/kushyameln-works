# Indexed direct-file conversion runtime

This distribution candidate ports the reviewed disk-index implementation to relative
runtime imports. Preparing these files does not enable a route or establish browser,
large-media or public deployment acceptance. The sole output profile is `default`
(1 GiB); private large-output profiles and fixture input admission are absent.

`transform.mjs` exports `convertStereo`, `createDirectMuxDestination`,
`cleanupConversionResources`, `createAacPacketCopier`, `validateIndexedAdmission`,
`inspectSavedOutput`, `OUTPUT_PROFILES` and `resolveOutputProfile`. `convertStereo`
accepts the existing `fork`, `indexRoot`, `outputHandle`, `jobId`, `signal`,
`onIndexOwnership`, `onCleanup`, `onOutputCreated`, `onProgress`, `onMetrics` and
default-only `outputProfileId` options. The caller must supply exactly one module
instance from `../vendor/mediabunny-indexed.mjs`; never mix its media classes with
the original shared vendor in a job. Importing this module does not load a codec
vendor. Routing and recovery UI are separate modules owned by the integration caller.

The input inspector is the unchanged strict `../mp4.mjs`. `cslg` handling in
`mp4-output-inspect.mjs` is limited to saved-output verification. There is no relaxed
input parser or fixture option. H.264 SDR, one video and no audio or one AAC track,
geometry, timing/AAC preservation, 100,000 samples, 16 MiB metadata, 8 MiB explicit
index budget and 4 MiB aggregate sorting limits remain unchanged. That index budget
is not a browser, codec or total process memory limit.

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

`provenance.json` records reviewed source and distributed hashes. From the repository,
`python3 tools/vr180/prepare-indexed-runtime.py --check` reproduces and compares all
explicit files without changing routing or existing shared modules. The dedicated
vendor includes original source, supplements, patches, MPL-2.0 and an offline rebuild
script. Input/output controller files derived from Mediabunny retain MPL notices;
the license is available at `../vendor/mediabunny-LICENSE`.
