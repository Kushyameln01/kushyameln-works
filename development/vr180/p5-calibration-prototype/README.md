# P5 private ten-second calibration

This is a reconstructed version after the temporary workspace disappeared. Five original files were reconstructed from recorded source/tool output; `test-frame.mjs` is a new regression implementation for the recorded eight-frame contract. Subsequent review fixes are included. New hashes and tests identify this version; historical source-hash identity is not claimed.

This prototype does not implement or accept 5/10 GB support. The public runtime and private 1 GiB output, 100,000 sample, 8 MiB index, 4 MiB aggregate sort and 4 MiB chunk/backing caps remain unchanged. It adds no workflow and performs no deployment.

## Calibration cases

| Case | Generated input | Conversion output | Timeline |
| --- | --- | --- | --- |
| `32-32` | H.264 requested 32 Mbps, realtime | Existing quality mode, requested 32 Mbps | 300 frames, 10 seconds, 30 fps |
| `48-24` | H.264 requested 48 Mbps, realtime | Existing quality mode, requested 24 Mbps | 300 frames, 10 seconds, 30 fps |

Every frame contains genuinely generated, independently seeded grayscale noise for each eye, eye markers and a frame barcode. A red event occupies frames 29, 30 and 31 in both eyes. The explicit reusable RGBA array is 2 MiB; canvas, codec and browser allocations are additional. Input is 1024×512 SBS 180 degrees; output has 512 pixels per eye. The existing transform really decodes/re-encodes every frame and applies geometry/tagging. This is synthetic calibration, not real-camera/VR-player acceptance. Both cases are silent; large AAC and 60 fps remain unverified.

Input generation requires strictly increasing encoded packet timestamps. Realtime mode avoids intentionally requesting B-frame reordering; the indexed muxer writes `cslg` only for non-zero composition offsets. The unchanged public `inspectMp4(...).transcodeSafe` gate must accept the generated input. If the encoder still reorders packets or the parser rejects the file, the trial fails. No fixture parser opt-in is used. Conversion retains quality mode and existing B-frame handling.

## Prerequisites

1. Commit these sources to the authorized candidate branch. Build `tools/vr180/build-input-index.mjs --combined` using the fixed esbuild 0.25.1 toolchain into a new directory outside the checkout. The harness checks exact vendor reproduction, bundle/patch/runtime/parser hashes, including the awaited `src/media-source.ts` close patch and the owner-module import closure.
2. Prepare the existing sandboxed Chrome/Playwright environment. Prepare FFmpeg/ffprobe from an official distribution at an explicit package version. The intended cloud package is Ubuntu `7:6.1.1-3ubuntu5`; unavailability blocks that setup rather than silently substituting another version. `tools/vr180/record-ffmpeg-toolchain.py` records the actual package, binary hashes, linked packages/libraries and apt policy. The harness does not install packages or attest provenance independently of that reviewed setup.
3. Install cloud NumPy **2.3.3**. Before media generation, the harness requires this exact version and successfully imports the independent verifier. A host-side independent check may have another recorded NumPy version; that is not cloud calibration evidence.
4. Supply the toolchain manifest below. Its original bytes, including linked-library/package/apt evidence, are retained at `evidence/oracle-toolchain.json`. Both actual binary hashes and `-version` outputs are verified; after changing PATH, `shutil.which(name).resolve()` must equal each verified binary. A verified alias cannot authorize another unverified PATH executable.

```json
{
  "schema": "vr180-ffmpeg-toolchain-v1",
  "source": "Official distribution provenance retained with this run",
  "packageVersion": "7:6.1.1-3ubuntu5",
  "files": {
    "ffmpeg": {"path": "/usr/bin/ffmpeg", "sha256": "actual SHA-256", "versionFirstLine": "exact first line"},
    "ffprobe": {"path": "/usr/bin/ffprobe", "sha256": "actual SHA-256", "versionFirstLine": "exact first line"}
  }
}
```

```sh
python development/vr180/p5-calibration-prototype/probe-calibration.py \
  --bundle "$RUNNER_TEMP/p5-build/mediabunny-input-output-index.mjs" \
  --output "$RUNNER_TEMP/p5-calibration-32-32" \
  --case 32-32 \
  --oracle-toolchain "$RUNNER_TEMP/p5-ffmpeg-toolchain.json"
```

Use a separate output directory for `48-24`. The root workflow owns build, dependencies, upload and cleanup of its own temporary prefix.

## Bounds and evidence

| Boundary | Condition |
| --- | --- |
| Real input/output writer | At most 80 MiB per file, including offsets/truncate |
| Returned media pair | At most 120 MiB; distinct expected names, actual sizes and SHA-256 |
| OPFS | Actual quota minus usage at least 512 MiB before the trial; this does not reserve disk |
| Runner disk | At least 2 GiB free; accounts for OPFS, download temporary, saved pair and archive duplication |
| Deadlines | Whole process 600 seconds; browser wait 360; full oracle 180; each packet-statistics scan 30 |
| Metadata transport | Existing bounded evidence transport for `evidence/` only; sibling `media/` never enters log payload |
| Ownership | Fresh namespace; early ownership notification; generator/conversion cleanup; zero index reservation; released locks; final owned namespace removal |
| Source identity | Exact checkout and loopback inventory; before/after hashes of harness, controllers, parsers, verifier and bundle |

The committed native OPFS Files are reread in full and hashed, then downloaded and hashed again on the cloud runner. Browser download temporary files are deleted after `save_as`; saved input/output remain. Independent FFmpeg/ffprobe scans every frame/packet and checks per-eye aggregate PSNR ≥30 dB, PTS error ≤1 ms, frame counts, red events and VR metadata. Calibration additionally requires exactly **three input events per eye**, output event indices exactly `[29,30,31]` per eye, all event flags equal and 300 packets per media. Matching two inputs with an already-lost event cannot pass.

`onEncoderConfig` is a pre-selection callback in the fixed source. `encoderConfigCandidates` is only a bounded list of attempted candidates; `selectedEncoderConfigObserved` remains false. The generator separately records the first actual encoded packet's decoder codec/dimensions metadata. Independent ffprobe records the actual H.264 profile/level of **both** saved files. A scalar full-packet scan of each file records packet count, total payload bytes, maximum packet size, rational min-PTS to max-(PTS+duration) timeline and actual payload bitrate. No full packet/timestamp array is retained, and at most 300 packets are allowed. The generator's bitrate divided by requested ten seconds is labelled `requestedTimelinePayloadBitsPerSecond`; actual measured-timeline bitrate is in `packetStatistics`.

Chunk payload/backing peaks, index reservations, generation/draw/submission/finalize times, conversion metrics and OPFS estimates remain separate. The supplementary Linux sampler reads `/proc` every 200 ms while this trial's browser runs, selects only Chrome-named processes descending from this Python PID, and retains scalar counts/max summed RSS/max process count/failures. Other jobs are excluded. Shared pages can be counted more than once, samples can miss the true peak, launch time precedes sampling, and GPU/native breakdowns are null. It is not a whole-browser-memory guarantee. Missing capability or no complete sample is `NOT_MEASURED`.

## Transfer and verdict

`READY_FOR_ARTIFACT_RECOVERY` means cloud media and a complete inspection record are ready. It is **not** a quality pass: inspect `calibrationVerdict=PASS|FAIL`. A completed PSNR/event/count rejection still retains media for full recovery. Incomplete verification, native failure, bounds or cleanup failure exits nonzero. `hostArtifactRecovery` remains `PENDING` until the receiver checks the actual artifact bytes.

Upload the transport-ready `media/` directory with fixed `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2), compression 0, retention 1 day, and a unique run/attempt/case name. The pair plus its small manifest fits below the previously recovered 128 MiB payload. That previous synthetic success does not prove recovery of this media artifact. No immediate remote deletion, billing/account change or paid runner is implied.

The receiver checks fresh free space, full archive bytes, GitHub artifact digest, ZIP CRC and the exact manifest/two media entries. It streams them into new files, rejects duplicates/unexpected members/oversize entries, and verifies every size/hash against browser/cloud evidence. Keep the actual input/output until independent host inspection is recorded. Synthetic SHAKE verification is not a media verifier. The dedicated `tools/vr180/verify-calibration-artifact.py` is maintained separately by the reviewer/root.

## Local validation and next gate

```sh
PYTHONDONTWRITEBYTECODE=1 python development/vr180/p5-calibration-prototype/test-harness.py
node development/vr180/p5-calibration-prototype/test-frame.mjs
node --check development/vr180/p5-calibration-prototype/worker.mjs
```

Reconstruction tests cover preflight/transport failures, PATH identity, original manifest retention, NumPy dependency gates, scalar packet aggregation, expected events, pair bounds, RSS ancestry and deterministic pixels. A separate local existing 60-packet silent fixture verified the real ffprobe statistics path with the recovered host toolchain (host NumPy 2.3.5). These are not WebCodecs/OPFS, cloud PSNR or 5/10 GB results. Native calibration and complete recovery must precede any separately reviewed capacity/profile/deadline increase.
