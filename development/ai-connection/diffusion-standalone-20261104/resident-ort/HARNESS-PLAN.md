# Bounded public attention timing harness

Authorized scope: new tools and this resident-ort documentation only. No native
or browser execution during the active original-shape trial; no runtime, vendor,
normal API, branch, or commit changes.

1. Add native-free unit tests for strict profile admission, deterministic finite
   fixtures, trace pairing, synchronous transparent wrappers, one factory call,
   cleanup/restoration, and byte-exact comparison. Observe missing-feature failure.
2. Implement a dependency-free diagnostic core and a factory shim returning the
   original module object. Capture existing ORT trace intervals and the native
   _OrtRun call separately. Do not label preparation as copy-only time.
3. Add a browser case module using the existing canonical attention graph and
   pinned public ORT. One warmup and 1..4 measured ordered K256 tiles use H40/Q128/
   D128 finite fixtures. Baseline and wrapped cases run sequentially in distinct
   fresh browser processes with the same explicit 1-noCOI or 4-COI profile.
4. Add an opt-in Python driver serving captured allowlisted source bytes. Hash
   sources, graph, inputs, and outputs; compare every output byte across cases;
   record sessions, factory/heap/pthread observation, and cleanup. Output creation
   is exclusive. The execution flag is intentionally required after trial end.
5. Run only Node unit/static and Python syntax/admission checks. Record that the
   browser integration, native timings, and byte comparison remain unexecuted.

Review focus: failed initialization, duplicate factory calls, thrown native
errors, broken trace pairs, changed source bytes, unsupported/fallback profiles,
interleaved calls, pointer/view ownership, and cleanup preserving the first error.

No speedup, resident K/V implementation, model inference, original-shape acceptance,
or full-40/six completion claim is made by this harness.
