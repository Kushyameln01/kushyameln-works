# Private P5 long synthetic media producer

This is an unpublished trial harness, not a new public size limit. It extends
only the calibrated **32 → 32 Mbps, 1024×512 SBS180, 30 fps, silent** synthetic
route. The existing 300-frame calibration and public code remain unchanged.
No native long-media run has passed merely because these local tests pass.

| Profile | Actual encoded input payload target | Input file cap | Output file cap | Runner free-space gate |
| --- | ---: | ---: | ---: | ---: |
| `p5-5gb` | 5,000,000,000 B | 5,100,000,000 B | 5,200,000,000 B | 33,416,582,400 B |
| `p5-10gb` | 10,000,000,000 B | 10,100,000,000 B | 10,200,000,000 B | 63,416,582,400 B |

The target counts actual `EncodedPacket.data` bytes, not requested bitrate,
padding, sparse extents or repeated references. Generation stops after the
observed payload target, then flushes and checks actual packets, frames,
payload and final file bytes. It fails if the target is not reached by 100,000
frames. Encoder delay can add a few already-submitted frames. Input and output
are separate actual files. The actual output size and whether it exceeds 4 GiB
are reported separately; a smaller output does not demonstrate >4 GiB support.

The public/default output cap is still 1 GiB. Only named private final-output
profiles are passed to the indexed transform. The existing 100,000-sample,
16 MiB metadata, shared 8 MiB index, combined 4 MiB sort and 4 MiB chunk/backing
limits are preserved. Generation has its own 8 MiB index budget and finishes
and disposes it before conversion acquires its shared input/output budget.
One combined fork module owns all media classes. There is no whole-`moov`
allocation or second metadata append in this route.

## Deadlines and ownership

Generation, conversion and independent verification each have 15/25-minute
bounds for the 5/10 GB profiles. Browser-to-runner transfer has a 10/15-minute
bound. **The complete producer has a 60/85-minute bound**, including launch,
profile cleanup and the extra whole-file reads. This whole-producer deadline
can interrupt a stage before that stage's allowance ends. A fixed monotonic
deadline is also checked after cleanup and before/after manifest publication;
every stage/transfer/oracle deadline is capped by it. A caught deadline during
cleanup is rethrown after the independent cleanup attempts. Failure cleanup
and bounded evidence emission may finish later, but cannot become READY.
Only this run's recorded publication inodes are rolled back on failure. An unfinished stage
is FAIL with no source/completion manifest. Upload is a separate root-owned
20/30-minute stage within the 90/120-minute job. These budgets are candidate
bounds, not measured completion promises; the workflow's overall deadline is
also authoritative. 10 GB may start only after the separate 5 GB acceptance
and storage/cleanup decision. This script never sequences both profiles.

The browser uses a newly created, identity-recorded disposable user-data
profile and normal sandbox-enabled Chrome. It accepts no existing/personal
profile and supplies no quota/sandbox bypass flags. `storage.estimate()` is an
observation, neither a capacity reservation nor an enforced ceiling. The
prior 16 MiB normal-close/reopen probe established only that small capability;
it did not establish the large profiles.

Before each of three index acquisitions, the caller writes its exact owner
ticket outside the index directory. Each record is at most 1 KiB; there are
at most three records. The native SyncAccessHandle write/flush/full-read/close
and closed-file readback must finish before the corresponding controller is
created. Owner record work is fixed small caller overhead in addition to the
index budget, not hidden within a claim about total browser memory.

Generator and converter cleanup independently attempt writer, codec and index
release. A failed cancel cannot skip an index disposal. Known committed facts
are retained in the report. Records are removed only after zero index budgets,
absent index directories and no held locks, with all three common job leases
reacquired exclusively and every record compared before any deletion. The
Page then terminates the completed Worker, takes those leases again, inspects
all namespace entries, deletes only the explicitly created media files and
removes the empty namespace nonrecursively. Unknown entries, active jobs,
partial/unverified owner records or an unverified Worker completion produce
HOLD. The fresh profile is removed only after normal verified browser close
and proven namespace cleanup. Failed launch/close or unknown content retains
it. Retention after the runner or execution context ends is **not guaranteed**;
this is not a recovery UI or crash-resumption implementation.

## Complete media transfer and independent oracle

`probe-long.py` serves only the fixed source closure and one fork bundle on
loopback. Media uses sequential, nonce-bound same-origin POSTs of at most
1 MiB. The Page reads only `File.slice(...).arrayBuffer()`, awaits each exact
next-offset acknowledgment, and never reads a whole media file into an
ArrayBuffer. The receiver uses new owned `xb` files, scalar hashes, exact
ordered offsets, caps and a single request mutex. It flushes, fsyncs, closes
and rereads the full file before acknowledging completion. Active requests
stop before incomplete owned files are removed. A replacement inode is left
untouched. No browser download or base64 media transport is used.

The fixed FFmpeg/FFprobe and NumPy versions are checked before generation.
The existing full-media verifier scans every frame/packet/PTS, compares all
pixels and VR metadata, and retains bounded diagnostics. A second scalar
packet scan measures the actual payload and H.264 stream profile through EOF.
The input follows a 30 fps PTS/duration grid. Periodic short red events at
`frame % 300` equal to 29, 30 or 31 are checked in **both eyes** using count and
SHA-256 of every absolute event index, not merely the first 32 displayed
indices. The calibrated pixel formula is unchanged. Its 16-bit visual marker
wraps after frame 65535 and is diagnostic only; all PTS and full-frame
comparison establish absolute ordering. Independent quality thresholds remain
those of the fixed verifier, including 30 dB per-eye PSNR and 1 ms PTS tolerance.
This is not real-camera, 60 fps, long AAC, VR-player or usability acceptance.

Sources are bound to the candidate commit, recorded before/after execution and
served-byte checked. Whole input/output hashes are checked again after the
oracle. Local tests use small temporary files, injected Worker dependencies
and a real loopback receiver. They do not establish browser quota, WebCodecs
throughput, native OPFS capacity or a large-file conversion.

## Output and sender interface

```sh
python development/vr180/p5-long-prototype/probe-long.py \
  --profile p5-5gb \
  --bundle "$RUNNER_TEMP/fork/mediabunny-input-output-index.mjs" \
  --oracle-toolchain "$RUNNER_TEMP/oracle-toolchain.json" \
  --output "$RUNNER_TEMP/long-5gb"
```

The new output directory must be under `RUNNER_TEMP` and outside the checkout.
`media/` contains `input.mp4`, `output.mp4`, `source-manifest.json` and
`quality-evidence.json`. `evidence/` contains bounded observations, full-scan
reports, logs, source hashes and the **identical raw quality manifest**.
Only `evidence/` is emitted by the bounded log transport. The media directory
is the input to the separately reviewed segmented artifact sender.

The source schema is `vr180-segmented-source-v1`, status
`GENERATED_AND_REREAD`, part size 134,217,728 B, ordered `input`/`output` file
identities, the six-field GitHub trial identity and actual producer script SHA.
Its generator descriptor is `vr180-long-xorshift32-sbs180-webcodecs-v1` with
actual frame count and the fixed dimensions, FPS, bitrates, seed, periodic
pattern and payload target. No complete source manifest is produced when the
payload, storage, transfer or full scans are incomplete.

`quality-evidence.json` is at most 64 KiB and uses
`vr180-p5-long-quality-evidence-v1`. It binds the same identity/profile/files/
source SHA, `completeScan`, `mediaVerdict` and at most 256 unique fixed relative
`evidence:[{path,bytes,sha256}]` references. Absolute paths, `..` and symlink
references are not used. The producer hashes those references; sender validation
binds the raw manifest and media identities without rejudging quality. The host
must check every referenced raw report from the metadata archive.

A complete quality **FAIL** still gets the two full files and manifests for
independent recovery; it is never converted to PASS. Incomplete media is not
published as a partial giant artifact. `READY_FOR_SEGMENTED_RECOVERY` means the
runner preparation is complete. Actual artifact recovery, host full-media
verification, >4 GiB evidence and the final P5 acceptance remain separate gates.
