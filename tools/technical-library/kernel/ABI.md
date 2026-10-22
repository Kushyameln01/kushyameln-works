# Knowledge index step ABI v1

Purpose: real posting aggregation and resumable unfinished-run state; JS only prepares numeric tokens and persists completed segments.

Inputs are lexicographically sorted by document, term, field, while each record uses [term,document,field]. All IDs and counts are nonnegative signed i32. State is null or a previous run with positive count. Empty input is valid. A nonempty resumed input cannot precede the saved run. Overflow is rejected. Host cursor is a nonnegative safe integer; zero cursor requires null state, positive state count cannot exceed cursor. Per-job records <=65536, logical input <=1MiB, output <=2MiB; output capacity is 1..65536 postings. Zero capacity is rejected to avoid nonprogressing host loops.

WASM export KiStep(recordsPtr,recordCount,statePtr,finalFlag,outputPtr,capacity,metaPtr)->i32; pointers reference disjoint host-owned i32 arenas. State [active,term,document,field,count] is mutated by real WASM; meta [consumed,emitted,done,outputFull]. Error -1: shape/range, -2: ordering, -3: count overflow. Validation precedes any output write. No imports, no shared memory. Host validates buffer ranges and values before entering WASM; direct arbitrary-pointer calls are not a public API.

On a new run, emit the previous run before consuming the new record. If output is full, retain previous run and do not consume new record. A final call flushes pending run if space exists; otherwise preserves it for an empty final call. done requires final=true, all records consumed, no pending run. Final input hash and higher-level dataset validation belong to host.

Independent acceptance: literal runs, same run split across calls with fresh Instance, repeated output-full resume, final flush, empty final, empty corpus, order reversal, negative/fraction IDs, overflow, cursor/state mismatch, corrupt binary hash, independent Instance/Memory, output/input preservation after disposal. Exact terminal postings must equal a separate JS counting oracle. Real-WASM rejection cannot silently fallback to JS.

Source/backend: Hike 3c51fde6675f317453919bd505d0e2d0f638e7f1, WABT normal. Actual tool versions and hashes in kernel-build.json. WAT ABI/static inspection and Node execution are distinct checks. Browser/pool integration and end-to-end performance are Coordinator-owned.
