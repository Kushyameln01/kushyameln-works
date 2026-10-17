# VR180 output-index private prototype — work in progress

This source is outside the Pages `docs/` tree and is not imported by the public product. It does not change the 100,000 combined-sample, 1 GiB conversion-output or existing metadata limits. The public OPFS-less direct path is unchanged. Input indexing (P4), VR player acceptance, decoded image/audio acceptance and 5–10 GB media qualification remain outside this prototype's completed claims.

## Fixed source and reproducible fork

The two-file patch targets Mediabunny 1.61.5, upstream commit `0664a57bf2f40e5c4efa176c75ebf1d60df69eb8`, using the existing source tarball SHA-256 `95c03a00ca69a7d5ed9805e424349ffeb0cdecbe8cabd0e17749a39e8117802f`. `patch-provenance.json` binds each original and patched file and the patch. `make-patch.py` recreates the patch from that exact source and refuses changed textual contexts. The upstream license and source remain at `docs/shared/media-basic/vendor/mediabunny-LICENSE` and `mediabunny-1.61.5-source.tgz`. Changed upstream source and the derived controller remain MPL-2.0; upstream notices are retained. This is not a change to the shared vendor.

`node tools/vr180/build-output-index.mjs --esbuild-dir <isolated exact 0.25.1> --output-dir <new directory outside repo>` first runs the unchanged-core byte-reproduction gate. Only PASS permits applying the checked patch and building with the identical core options. It writes a separate `mediabunny-output-index.mjs` and `fork-build-result.json`. The output directory must not exist. See `../build-inputs/README.md` for fixed-lock acquisition. Dependency acquisition is not hidden in this runner.

The patch adds an explicit private `format._options.vr180Index` adapter, not a public API. Only classes from the fork bundle may create the candidate Output, source, packets and target. With no adapter the old code path remains; this does not make old-path large-memory behavior a fallback for adapter failure.

## Private profile and ownership

`createOutputIndex({root, jobId, signal, layout})` acquires a native origin/storage-bucket Web Lock before checking/creating its job. `layout` is `null` for exact untagged baseline comparison, or `sbs` / `tb` to insert the existing product's VR180 metadata values. Only nonfragmented `fastStart:false`, H.264 with zero/one AAC track is intended. Call `dispose()` in the owner's finally block; it cancels pending controller work, waits for it, closes all owned index and metadata handles, removes only that job, then releases the lease. Cleanup failure retains ownership for retry. No browser in-memory lock fallback exists. Node's injected adapter and LockManager are tests only.

Samples are fixed 64-byte records (float64 PTS/DTS/duration/delta/offset; uint32 size/key; int32 composition offset; little endian). Chunks are 24 bytes (float64 offset/count/start PTS). Final table stores use fixed 4/8/12-byte records. Unresolved timestamp records stay on disk and are patched after sorting timestamp values. Only one pending stts/ctts/stsc run is retained while final tables are generated.

The private profile retains the current combined 100,000-sample ceiling. Its timestamp workspace reserves 1,600,000 bytes: one fixed-capacity 800,000-byte Float64 buffer plus conservative sort-work allowance. It is part of the shared 8 MiB explicit index budget and below the 4 MiB sort allowance. It is **not** an external sort implementation and cannot justify lifting the sample ceiling. Runtime-internal sort allocation, JS objects, codec/native memory, original reference implementation and OS cache are not measured by this reservation.

Original half-second chunk boundaries and track write ordering are preserved. A live chunk is limited to 4,096 sample references and 4 MiB payload per track; exceeding either explicitly fails this private profile, rather than changing chunk layout silently. Payload bytes are separately bounded and reported, not included in the index-buffer budget. Writer output is fed/awaited in at most 64 KiB pieces. Source packet arrays and upstream target allocations are separately observed. These are trial limits, not new public supported limits.

## Incremental metadata and commit boundary

Small codec/movie box generation is reused from the fixed source. Table leaves are disk-backed descriptors. Box sizes are counted first and emitted as headers, small contents and table pages; there is no whole-moov concatenation or `onMoov` tracking. Each emitted byte also goes to the job's metadata spool, with partial-write progress checking and task yields. The spool must match its counted extent, flush, close, and produce a matching-size File before parser use.

The existing `inspectMp4` parser receives only ftyp, actual mdat header and the finalized metadata File at their real output offsets. Missing payload ranges are rejected, not zero-filled. VR tags, when requested, are included before this validation. The controller never commits the external destination. The caller may commit only after Output.finalize and this verification succeed; saved-file readback/hash and independent recovery remain separate requirements. Node comparison files are real test files but not transactional browser picker saves.

## Verification commands and status

`node tools/vr180/compare-output-index.mjs --bundle <built fork> --out-dir <new evidence directory>` is designed to generate six fixed workloads (5k/25k/100k × monotonic/alternating ctts), compare complete original/candidate file bytes, then independently demux **all** packet metadata and payloads with the unchanged distribution (six additional rows). The exact file comparison covers complete metadata tables and every payload location, not only sample counts. This is synthetic index testing (`decoded:false`, `audioTracks:0`). Input fork is unimplemented; the unchanged demuxer retains its known proportional indices.

At source preparation time these comparisons have not yet run. Build output, full comparison evidence, fault tests, browser execution and resource peaks must be recorded before qualification. Do not call this P3 accepted based on source presence or unit tests alone.
