# Private segmented artifact transport qualification

This action qualifies transfer of actual public synthetic bytes through the
official GitHub artifact SDK. It also provides explicitly bounded transport
profiles for the separate private long-media experiment. It does not generate
or process media, enable a public VR180 capacity profile, or change billing settings.
The files live outside the Pages deployment tree.

## Enabled trials

| Profile | Originals | Data-part size | Data artifacts | Completion artifact |
| --- | ---: | ---: | ---: | ---: |
| `service-8mib` | Two distinct 60 MiB files | 8 MiB; final part 4 MiB | 16 | 1 |
| `single-128mib` | One 128 MiB file | 128 MiB | 1 | 1 |

The separate media-receiver gate uses `p5-receiver-calibration32`: a new execution
of the existing silent 32→32 Mbps calibration, 300 frames at 30 fps. Each real
input/output file is at most 80 MiB and the pair at most 120 MiB. It uses two
128 MiB-capacity data parts, one bounded producer-evidence artifact, then one
completion artifact. Its sender deadline is 600 seconds. The fixed producer job
is `p5-receiver-calibration`; old media cannot be assigned a new trial identity.

These are separate service trials. The first checks more than ten immutable
artifacts in one job and ordered reconstruction. The second checks the intended
maximum part size with this new uploader. Earlier 64/128 MiB transfer acceptance
does not establish this new action's behavior. Both need actual cloud upload,
complete download, API metadata/digest comparison, and independent byte checks.
Local tests use a mock SDK and establish none of those service outcomes.

The protocol permits at most two files, 200 data parts, and 128 MiB per part.
The private long-media transport profiles below do not establish media capacity;
their enablement is separate from authorization to run a large native trial.

| Private transport profile | Input file maximum | Output file maximum | Part size | Total action deadline |
| --- | ---: | ---: | ---: | ---: |
| `p5-5gb` | 5,100,000,000 B | 5,200,000,000 B | 128 MiB | 20 minutes |
| `p5-10gb` | 10,100,000,000 B | 10,200,000,000 B | 128 MiB | 30 minutes |

Both require ordered `input.mp4` / `output.mp4` files with IDs `input` / `output`.
Every file must have a positive integer byte length within its cap. The sender
does not impose a target-size minimum: a complete quality failure must remain
recoverable. Actual payload targets, output greater than 4 GiB, full decoding,
PSNR, timestamps, and resource acceptance are producer/host verdicts. A completed
transport is not a successful media experiment. The small service profiles keep
their exact original byte counts and generator contract.

## Fixed source and dependency contract

`@actions/artifact` is exactly **2.3.2**. Its source archive was retrieved from
the official npm registry and its SHA-512 matched the fixed upstream lock.
`sdk-provenance.json` records the archive SHA-256 and integrity string.

The lock contains the 152-package runtime dependency closure from
[`actions/upload-artifact` v4.6.2 commit
`ea165f8d65b6e75b540449e92b4886f43607fa02`](https://github.com/actions/upload-artifact/blob/ea165f8d65b6e75b540449e92b4886f43607fa02/package-lock.json).
The dependency versions, resolved URLs and integrities are preserved; the root
package is replaced and the lock container is converted from v2 to v3. No
dependency version was resolved afresh. Installation is:

```sh
npm ci --ignore-scripts --omit=dev --no-audit --no-fund
```

Run this inside `development/vr180/artifact-transfer-action` in the checked-out
candidate. The source uses CommonJS directly; there is no separately generated
bundle. The action declares `node20`, matching the pinned upstream action, and
records the actual Node runtime version because the service may select a newer
runtime. The workflow must record its actual npm version and the install step.

Before upload, the action checks the candidate commit and every executable
action source, lock, package manifest, provenance file, and generator against
that commit. It checks those source hashes again before publishing completion.
The installed SDK version must match the checked lock. The completed record
contains the source hashes and generator script path/hash. Producer paths are
selected only by the code-defined profile: small trials use
`tools/vr180/probe-segmented-transfer.py`; long trials use
`development/vr180/p5-long-prototype/probe-long.py`. A manifest cannot select
another script. Both the selected script's actual bytes and its source-manifest
hash must match the checked candidate. Package installation
integrity is supplied by `npm ci`; a lock hash alone is not represented as a
full post-install dependency tree audit.

The media-receiver calibration profile instead fixes its wrapper to
`development/vr180/p5-receiver-calibration/prepare.py`. The top-level
`sourceSHA256` identifies that wrapper. Its generator descriptor separately
names `development/vr180/p5-calibration-prototype/probe-calibration.py` and that
original script's `producerSHA256`; both actual files must match HEAD. The
descriptor fixes algorithm `vr180-fixed300-sbs180-webcodecs-calibration-v1`,
seed `0x1802026`, 1024×512, 300 frames, 30 fps, silent, requested bitrates
32,000,000→32,000,000, and event indices `[29,30,31]`. Its
`producerReportRunId` must be `{runId}-p5-32-32-{runAttempt}`. These source
identities do not replace the independent media-quality checks.

## Workflow interface

Both steps must run in the same job. The two output directories must be new,
owned paths below `RUNNER_TEMP`. The action rejects existing output directories.
The current small-trial workflow keeps source originals and bounded receipts
until the ephemeral runner ends. It does not claim immediate original-file
deletion. The action removes its owned staging directory after SDK child exit.

```sh
python tools/vr180/probe-segmented-transfer.py \
  --profile service-8mib \
  --output-directory "$RUNNER_TEMP/vr180-segment-source"
```

```yaml
- uses: ./development/vr180/artifact-transfer-action
  with:
    source-manifest: ${{ runner.temp }}/vr180-segment-source/source-manifest.json
    output-directory: ${{ runner.temp }}/vr180-segment-upload
```

`single-128mib` uses separate fresh directories. Workflow construction and cloud
execution belong to the coordinating task. The normal JavaScript action host
supplies `ACTIONS_RUNTIME_TOKEN` and `ACTIONS_RESULTS_URL`; the action does not
request or print credentials and does not call unpublished endpoints itself.
The SDK's child-process stdout/stderr are not forwarded. Only bounded receipts
and fixed error codes are printed.

For a long trial, the separate producer creates `source-manifest.json`,
`input.mp4`, `output.mp4`, `quality-evidence.json`, and
`producer-evidence.tar.gz` together in its new
`media/` directory. The same action inputs point at that manifest and a new
upload directory. The long-media producer's calibration, disk/quota, time and
quality gates remain prerequisites; this action neither runs nor bypasses them.

## Bytes and manifest protocol

For each file ID (`payload-a` / `payload-b`) and each absolute byte offset
`0, 1048576, ...`, the generator emits:

```text
SHAKE256(ASCII(seed + NUL + fileId + NUL + decimalOffset)).digest(blockLength)
seed = vr180-public-segmented-transfer-2026-10-17
blockLength = min(1048576, remaining file bytes)
```

This defines real, nonsparse bytes. Each generated file is flushed, fsynced,
closed, and reread completely. The source manifest has schema
`vr180-segmented-source-v1`, status `GENERATED_AND_REREAD`, identity
`{repository,commit,ref,runId,runAttempt,job}`, profile, partBytes, totalBytes,
`files:[{id,name,bytes,sha256}]`, generator formula, sourceSHA256, timing and disk
observations. File names are `payload-a.bin` and `payload-b.bin`.

The long generator descriptor is fixed to algorithm
`vr180-long-xorshift32-sbs180-webcodecs-v1`, seed `0x1802026`, 1024×512,
30 fps, silent, requested input/output bitrates 32,000,000 bit/s, event period
300 frames and offsets `[29,30,31]`, maximum 100,000 frames, target payload
5,000,000,000 or 10,000,000,000 bytes according to profile, and actual frame
count `1..100000`. Requested bitrate is not substituted for observed payload.

Long source manifests additionally bind:

```text
qualityEvidence: {name: "quality-evidence.json", bytes, sha256,
                  status: "PASS" | "FAIL", completeScan: true}
```

That regular, nonsymlink file is at most 64 KiB. The sender reads its actual
bounded bytes, verifies length/hash, and checks schema
`vr180-p5-long-quality-evidence-v1`, identity, profile, sourceSHA256, ordered
file IDs/names/bytes/hashes, `mediaVerdict` and `completeScan` against the source
manifest. Its `evidence:[{path,bytes,sha256}]` has 1–255 unique bounded relative
paths and nonnegative byte counts. The sender checks descriptor syntax but does
not open those referenced reports or reinterpret their media verdicts. The
producer verifies all referenced files and includes them with the identical
raw quality JSON in its separate metadata archive; the host verifies that
archive independently. A complete `FAIL` is transportable; an incomplete scan
cannot pass the sender gate. Quality bytes are reread unchanged before the
completion artifact is published.

Both calibration and long profiles preserve zero-byte original stderr logs.
Those files remain in the producer bundle and are verified as empty files by
the receiver; a missing file cannot substitute for a zero-byte file.

All media profiles additionally require the following
source descriptor and a regular nonsymlink file next to the media:

```text
evidenceBundle: {name: "producer-evidence.tar.gz", bytes: 1..8388608, sha256}
```

The producer packs the original `quality-evidence.json` and every referenced
evidence file, with no media, into that bounded archive. The sender treats the
archive as opaque bytes: it hashes the original before any uploads, copies it
to the owned stage as `evidence.bin` after the two media parts, rereads it before
and after upload, and rechecks the original before completion. Its artifact is
named `{prefix}-evidence` and contains exactly one ZIP entry, `evidence.bin`.
Missing, incomplete, changed or oversized bundle bytes prevent completion.
The independent receiver must validate the recovered tar structure, original
quality bytes, every evidence reference/hash and the actual media independently.

Long profiles now require this bundle too. The earlier bundle-optional
prototype contract is superseded before any long native run. Complete original
metadata reception, source/run binding, full-media recovery and fresh long
oracle validation remain separate gates. Short-media acceptance permits only
the first 5GB trial; 10GB additionally requires reviewed 5GB acceptance.

Each data artifact contains exactly one ZIP entry, **`chunk.bin`**. Its name is:

```text
vr180-seg-{profile}-{runId}-{runAttempt}-{job}-{fileId}-{index:05d}
```

The last artifact is named the same prefix plus `-complete`; it contains exactly
one entry, **`completion.json`**. Its schema is
`vr180-segmented-transfer-v1` and its status is `COMPLETE`. In addition to the
identity, profile, generator and provenance, it records:

```text
partBytes, totalBytes, partCount, sourceManifestSHA256,
files: [{id, name, bytes, sha256, partCount,
         parts: [{index, offset, length, sha256,
                  artifact: {id, name, sizeBytes, digest}, elapsedSeconds}]}]
```

For long profiles only, the completion record also copies the bounded
`qualityEvidence` descriptor. This ties the separate metadata archive's raw
quality JSON to the reconstructed media and source manifest, without adding a
second ZIP entry to any artifact. Host verification must compare that raw hash
and the quality record's identities, files and evidence references.

The calibration profile uses the same quality descriptor. When a bundle is
present, completion also contains
`evidenceBundle:{name,bytes,sha256,artifact:{id,name,sizeBytes,digest}}` and
`metadataArtifactCount:1`. Media `partCount` and `totalBytes` exclude metadata.
The external final receipt adds `metadataArtifactCount:1` and total
`artifactCount = partCount + 2`, including the evidence and completion artifacts.
The separate maximum is 200 media parts plus one evidence artifact plus one
completion artifact. An evidence-upload timeout is recorded as `UNKNOWN` in
`incomplete.json`, and no completion is published.

`digest` is normalized as `sha256:<64 lowercase hex>` and covers the whole ZIP;
part `sha256` covers the raw bytes. Offsets must be consecutive with no holes,
overlap, duplicates or reordered parts. The completion record is at most
256 KiB. Artifact names contain the profile, job, run ID and attempt, preventing
another job/attempt from silently appending or replacing parts.

The external `upload-result.json` receipt and one bounded stdout line contain:

```text
{schema, status: COMPLETE_MANIFEST_UPLOADED, identity, profile,
 completion: {bytes, sha256, artifact: {id,name,sizeBytes,digest}},
 totalBytes, partCount, elapsedSeconds,
 fullHostRecovery: PENDING, independentHostValidation: PENDING}
```

`completion.bytes` and `completion.sha256` cover the raw completion JSON. Its
artifact receipt cannot be stored inside itself. Action outputs expose
`completion-artifact-id`, `completion-artifact-name`, and
`completion-artifact-digest` as an additional discovery channel.

The receiver must fetch independent GitHub metadata, compare repository/run/
commit/name/size/digest, hash the entire ZIP, enforce the bounded ZIP directory
and single-entry contract, stream every entry into its exact position, and hash
the whole reconstructed files. For these synthetic trials it also checks every
byte against the formula above. A seed, a manifest, or a successful upload does
not substitute for recovery of actual bytes.

## Bounds, failures and cleanup

The uploader retains one physical staged part at a time and uses a reusable
1 MiB file-read buffer. It rereads each staged part before and after the SDK
upload, checks the whole source while splitting, and rereads each whole source
again before completion. Source files are never deleted by the action.

The SDK accepts file paths, not an arbitrary caller-provided range stream. It
streams ZIP output directly to blob storage; no complete ZIP or complete list of
part payloads is materialized on runner disk. Compression is 0, retention is
1 day, and SDK upload concurrency is 1. The fixed SDK's 8 MiB upload/ZIP buffers
are **not** a bound on Node RSS or on the browser's separate 8 MiB index budget.

Each upload runs in a child process, with a 120-second maximum and the remaining
trial deadline, whichever is shorter. The normal SDK stall timeout is 60
seconds. On timeout/cancellation the child is terminated, with a SIGKILL after
5 seconds if needed, and cleanup waits for its exit. Total action deadlines are
600 seconds (`service-8mib`), 300 seconds (`single-128mib`), 1200 seconds
(`p5-5gb`) and 1800 seconds (`p5-10gb`); workflow timeouts
must include startup, the 5-second kill grace and cleanup. The small source
generator has a separate 300-second deadline; the long-media producer enforces
its own phase deadlines. These are upper limits, not expected throughput.

`p5-receiver-calibration32` has a separate 600-second sender deadline with the
same 120-second maximum per artifact; its browser calibration has its own
existing deadlines. The evidence stage never overlaps a live media-part file,
so the uploader's additional disk admission already covers it.

The small source generator's disk admission is `3*sourceBytes + 2*partBytes + 512 MiB`.
The long producer has separate input/output/OPFS/temporary disk admission.
After sources exist, the uploader requires an additional
`2*partBytes + 2 MiB + 256 MiB`. These are conservative free-space checks, not
reservations. Host receiver capacity and deadlines are separately enforced.

Failure before completion does not publish a completed record. If the last
upload times out, whether its manifest reached the service is explicitly
`UNKNOWN`; a false absence is not recorded. Successful part receipts remain
bounded evidence. `cleanup-result.json` records removal of the owned stage;
cleanup failure fails the action. On forced process/runner termination, stage
cleanup is not guaranteed; immediate cleanup is not claimed. Artifacts use
one-day retention; immediate deletion is not promised and no remote deletion
or account setting change is attempted.

## Primary source limits and acceptance

The [fixed upload-action README](https://github.com/actions/upload-artifact/blob/ea165f8d65b6e75b540449e92b4886f43607fa02/README.md)
and [current README](https://github.com/actions/upload-artifact#limitations)
both specify 500 artifacts per job. The SDK package's older README says ten;
the 17-artifact trial explicitly checks the actual service behavior. The
[REST artifact API](https://docs.github.com/en/rest/actions/artifacts) supports
metadata/download/deletion, not artifact creation; download redirects expire
after one minute, so the receiver obtains each just before use. Fine-grained
download access requires Actions read permission. Deletion requires write and
is not part of this action.

[GitHub's billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
describes free standard hosted Actions for public repositories; the trial
keeps that condition and adds no paid runner or quota changes. Storage, account
usage and immediate deletion have not been audited by this action. The
[hosted-job limit](https://docs.github.com/en/actions/reference/limits) is six
hours; this action's much smaller trial deadlines remain in force.

Run local checks with `node --test test-transfer.cjs` and `python test-probe.py`.
The tests cover actual local split/reread hashes, ordered manifests, both part
sizes, mutation, deadlines, cancellation, existing-path ownership, interrupted
uploads, unknown completion, explicit long-profile caps, fixed producer paths,
bounded quality correspondence and mutation, and recovery of complete `FAIL`
records. Long-profile unit fixtures use tiny arbitrary bytes and a mocked SDK;
they are not valid media or evidence of 5/10 GB capacity. Cloud service acceptance remains a separate
record after the coordinating task runs and fully recovers the artifacts.
Calibration transport tests likewise use tiny arbitrary media/bundle bytes to
exercise correspondence, upload ordering, source/ZIP mutations, unknown timeout
and complete quality failure preservation. Tar and codec correctness belong to
the independent receiver, not these sender mocks.
