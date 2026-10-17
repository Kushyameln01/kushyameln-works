# Private index ownership and explicit cleanup

This small prototype implements the ownership/abandoned-temporary-file part of
plan 1.2 §6.3. It is not imported by the public product. It does not resume a
conversion, expand media limits, or change an external saved file's commit state.

`job-owner.mjs` is shared by the input and output controllers. Each fresh job
acquires the existing `vr180:index-job:<jobId>` exclusive Web Lock with
`ifAvailable:true` before checking/creating its directory. There is no in-memory
browser fallback, lock steal, TTL, or whole-origin sweep. Lock unavailability is
`BLOCKED`; a preexisting job is rejected without deleting or adopting it.

Before any table or metadata spool is created, the helper writes, flushes,
reads back and closes `owner.bin`. Its exact size is 256 bytes:

| Bytes | Meaning |
| --- | --- |
| 0–15 | ASCII `VR180IDXOWNER001` (16 bytes) |
| 16–19 | Little-endian schema version 1 |
| 20 | Role: input 1, output 2 |
| 21 | ASCII job ID length, 1–64 |
| 22–23 | Zero |
| 24–39 | 128-bit opaque owner token |
| 40–103 | ASCII job ID followed by zeros |
| 104–255 | Zero |

The helper reserves 4,096 bytes in the same explicit 8 MiB index budget from
acquisition through successful cleanup. This covers its bounded byte buffers and
scalar record scratch; it is not a measurement of native or whole-process heap.
Combined input/output ownership adds 8,192 reserved bytes. There are no
sample-proportional ownership arrays. Short I/O continues; zero/invalid progress
fails. The controllers expose the immutable ticket as `.owner` and accept an
optional `ownerToken` (32 lowercase hexadecimal characters). A default token is
generated with `crypto.getRandomValues`. Job IDs remain distinct for input/output.

The caller may record the job ID/token before creation, or record the returned
ticket after creation. Keeping that ticket through page reload is a caller
responsibility; this module adds no localStorage registry or UI. Its native
test driver retains exact tickets outside each page and passes them explicitly.
Tokens protect cooperative identity/accidental reuse, not hostile same-origin
JavaScript.

```js
const result = await cleanupAbandonedIndexJob({
  root, jobId, ownerToken, kind: 'input', budget,
});
```

Recovery acquires the same job lock first. A live owner blocks the attempt before
deletion. It then requires the complete record to equal the supplied identity,
including format, schema, role and reserved bytes. Missing, damaged, unknown,
oversized or mismatched records are refused and left in place. A missing job is
`already-absent`; it is not claimed as a deletion performed by this attempt.

Normal callers close every child handle before owner disposal. Recovery is only
for a lock-free abandoned job. Data children are removed one at a time using an
iterator, then the owner record, then the empty directory without `recursive`.
Other jobs are never visited. A failed close or deletion keeps its lease and
budget reservation; `error.retryCleanup()` retries the same ownership. Unrelated
owners remain excluded until cleanup and lease release finish.

A crash before the owner record completes, or between removal of its record and
removal of the final empty directory, can leave a directory whose identity is
unprovable to a new caller. Such a directory stays `BLOCKED`. The same still-live
cleanup operation can retry that final removal while holding its lease. Unknown
leftovers are not silently made eligible for deletion.

Web Locks specifies document/agent termination and lock release, but its worker
termination integration includes an explicit specification caveat. Therefore
the test observes reacquisition in the actual browser instead of assuming it
from a `terminate()` call or `query()` snapshot. Deletion is authorized only by
the helper's acquired exclusive lock.

- [Web Locks §2.6](https://www.w3.org/TR/web-locks/#termination)
- [File System SyncAccessHandle](https://fs.spec.whatwg.org/#api-filesystemsyncaccesshandle)

## Validation scope

`tests/vr180-index-owner.test.mjs` uses real temporary files and an injected
cooperating LockManager. It covers short I/O, malformed records, live contention,
explicit cleanup, missing jobs, constructor failures, abort, close/delete retry,
same-ID cross-role exclusion and shared-budget release. This is not native OPFS
qualification. Existing controller/store/transform small regressions also run.

`tools/vr180/probe-index-owner.py --output <new-outside-checkout-directory>` is
the cloud native probe. It serves an exact source inventory to sandboxed Chrome,
opens actual SyncAccessHandles in dedicated Workers, and exercises Worker
termination, page reload, page close, two-tab contention, wrong-token refusal,
other-live-job preservation and same-ID fresh creation. Final cleanup uses only
the known exact tickets and a nonrecursive removal of the empty random test
namespace. Unexpected leftovers block the run. Its JSON evidence records the
browser version, source hashes, native observations and cleanup result.

That probe does not qualify OS/browser-process crashes, power-loss durability,
conversion restart, writer rollback, codec processing, user interaction, or
larger media. Native results must be reported separately from Node results.
