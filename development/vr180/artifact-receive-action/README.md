# Private same-run raw ZIP receiver adapter

This adapter uses the installed, fixed `@actions/artifact` **2.3.2** internals
to retrieve one exact artifact from the current workflow run. It returns the
unmodified ZIP bytes. It does not extract the ZIP, reconstruct media, decide
media quality, request a PAT, add permissions, or use the SDK's `findBy` route.
Files remain outside the Pages deployment tree.

The wrapper accepts `service-8mib`, `single-128mib`, and the separately gated
`p5-receiver-calibration32`. The first two passed real same-run service recovery
in runs 39044433711 and 39044958599. Calibration accepts only a newly executed
300-frame, silent 32-to-32 Mbps case, at most 80 MiB per file and 120 MiB total.
The explicitly gated long profiles are `p5-5gb` and `p5-10gb`; workflow
requires reviewed short-media acceptance before 5GB and reviewed full 5GB
acceptance before 10GB. Profile support alone is not native media acceptance. Local mocks do not establish service access
or large-media capacity.

## Fixed upstream and adaptation

Dependencies come from the sender's exact lock in
`../artifact-transfer-action/package-lock.json`; there is no second lock or
floating installation. Install the shared closure there with:

```sh
npm ci --ignore-scripts --omit=dev --no-audit --no-fund
```

That lock is derived from `actions/upload-artifact` commit
`ea165f8d65b6e75b540449e92b4886f43607fa02`. `provenance.json` records the official
SDK archive SHA-256/SHA-512, shared lock hash, directly used SDK source hashes,
and the adaptation/patch hashes. `LICENSE.sdk.md` is the original MIT notice.

The fixed SDK's `lib/internal/download/download-artifact.js` ordinarily calls
`ListArtifacts(idFilter)`, obtains `GetSignedArtifactURL`, then automatically
extracts the response. `raw.cjs` preserves that metadata/URL sequence while
replacing extraction with strict raw-byte writing. It rejects multiple matches
and digest differences rather than selecting the first record or returning a
warning flag. `sdk-download.patch` is a reproducible review/reconstruction diff
from that exact upstream file to `raw.cjs`. It is **not** applied to the installed
SDK. This is a private internal adapter, not a new supported public SDK API.

The worker imports the fixed SDK's actual token scope decoder, generated
`Int64Value`, and Twirp client. The normal JavaScript action host supplies
`ACTIONS_RUNTIME_TOKEN` and `ACTIONS_RESULTS_URL`. The adapter neither creates
those credentials nor accepts alternative tokens/endpoints in its inputs.
The actual installed source hashes, package version, lock, checked-out commit,
adapter source, and fixed caller script are verified before execution. Source
hashes are checked again before reporting success. This is not a post-install
audit of every transitive package; `npm ci` supplies archive integrity checks.

## Workflow wrapper and CLI

The normal `node20` action entry runs exactly
`tools/vr180/receive-in-actions.py`, with inherited runtime environment and safe
Python stdout/stderr. It accepts `receipt-json` (at most 16 KiB) and `profile`.
It chooses a new directory below `RUNNER_TEMP`:

```text
vr180-receive-{runId}-{runAttempt}-{receiverJob}
```

The fixed Python CLI receives:

```text
--receipt-json <producer completion receipt JSON>
--profile service-8mib|single-128mib|p5-receiver-calibration32|p5-5gb|p5-10gb
--output <new owned directory>
```

Python invokes this adapter once per archive:

```sh
node development/vr180/artifact-receive-action/main.cjs \
  --request /absolute/runner-temp/owned/request.json \
  --output /absolute/runner-temp/owned/new.zip
```

The request is bounded JSON with the single field:

```json
{"expected":{"id":123,"name":"vr180-seg-service-8mib-12345-1-producer-payload-a-00000","sizeBytes":100,"digest":"sha256:0000000000000000000000000000000000000000000000000000000000000000"}}
```

The values above illustrate the schema only. The real request must contain
the expected artifact receipt. Artifact names must identify the current run
and attempt; the producer job may differ from the receiver job. The destination
must be new, beneath `RUNNER_TEMP`, and never replaces an existing file.

## Verification and bounded resources

`ListArtifacts` must return exactly one record with the exact ID, name, ZIP
size and digest. Its backend run must match the normal runtime token's run.
The returned producer job ID is used for signing, so a different job in the
same run is supported by the contract and remains subject to service testing.

The signed URL stays inside the isolated worker. The blob request uses no
runtime bearer token, requires HTTPS, and allows at most three redirects without
HTTPS downgrade. HTTP status must be 200; any declared Content-Length must
match, and compressed HTTP content encoding is refused. Bytes are checked
against the exact expected ZIP size and SHA-256. The maximum ZIP is 128 MiB
plus 2 MiB overhead. Stream chunks are at most 1 MiB, partial writes are retried,
and no whole-ZIP buffer is created. These are application I/O bounds, not a
Node RSS or SDK metadata allocation guarantee.

The parent opens the new destination with `wx`, retains the inode ownership
record, and passes its descriptor to the SDK child. On success, the child
fsyncs and closes its descriptor; the parent waits for child exit, fsyncs/closes
its own descriptor and rereads every saved byte for SHA-256. There is a
120-second per-archive deadline and a 30-second response idle limit. Deadline
or cancellation sends TERM, then KILL after five seconds if required, and waits
for child close before deleting only the owned inode. An unexpected replacement
is retained and reported as cleanup failure. Forced runner termination cannot
guarantee immediate cleanup.

The wrapper forwards TERM/INT to Python and waits for its close. Python owns
the adapter process group's termination and its evidence/ZIP cleanup; the
wrapper does not interpret Python termination as a successful SDK close.

SDK stdout/stderr are suppressed. The signed URL, runtime endpoint and token
are never included in receipts or error text. One bounded safe JSON receipt is
printed on success; failures print a fixed code. The receipt includes exact
raw size/digest, descriptor/fsync/readback observations, source provenance,
and metadata labelled `@actions/artifact@2.3.2 ListArtifacts(idFilter)` with
`scope: current-workflow-run-runtime-token`. It explicitly sets
`restWorkflowRunVerified: false` and `zipStructureVerified: false`. Runner
environment context is a separate field; SDK rows are never presented as REST
`workflow_run` records. The independent Python receiver must perform its own
public REST metadata and ZIP structure/entry/full reconstruction checks.

## Local checks

Calibration recovery downloads the completion, a bounded original-evidence
bundle, and every media part. The bundle is at most 8 MiB compressed, 16 MiB
regular-file payload, and 256 regular entries; decompressed tar framing is
bounded separately at 17 MiB. Links, sparse files, duplicate paths and unknown
entries are refused. Raw metadata bytes, including empty logs, are verified
against the quality references and original manifest. A fresh, fixed FFmpeg
oracle scans all recovered media, and its whole-file sizes/hashes must equal
the reconstructed files. Producer PASS and receiver PASS are both required.
`COMPLETE_MEDIA_FAIL` preserves a complete negative quality result; it is not
media acceptance. Cancellation uses a dedicated exception that cannot be
absorbed by an oracle's ordinary error handling, closes its runtime, and records
`FAIL`. Short-media jobs are separate from the original calibration job.

```sh
node --test development/vr180/artifact-receive-action/test.cjs
```

Tests use mocked metadata/blob responses and a separate local child fixture.
They exercise strict metadata, raw-byte/hash bounds, short writes, idle/deadline
and cancellation, descriptor closure/readback, existing-path preservation,
ownership-safe cleanup, input bounds, fixed SDK imports and reconstruction
patch hashes. They make no service calls. `test-child.cjs` is never selected
by production inputs or code.


Long media uses `receive-long-media-evidence.py`, its original noncircular
producer record, fixed complete source closure, and long packet/event verdict.
The fixed 300-frame calibration verdict is never substituted. It verifies real
input payload reaches 5,000,000,000 / 10,000,000,000 bytes and records actual
output size; capacity acceptance also requires an actual output over 4 GiB.
Input/output file caps are 5.1/5.2 or 10.1/10.2 decimal GB. Total recovery is
bounded to 45/60 minutes; one combined packet/full-frame oracle phase is bounded
to 15/25 minutes within the remaining overall deadline. Per-artifact limits are
unchanged. The output stays on the fresh receiver until runner termination;
this is not a claim that Codex locally recovered every original media byte.
