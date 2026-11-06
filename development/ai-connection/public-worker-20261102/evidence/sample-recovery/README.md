# Completed normal public sample after cancellation/reload

Execution source `0f761f374dce1d447bbb912ad13c08f9bf85c279`; independent reference
source `3e68d2fc54c67b16f8a82002f69fa183674a9f14`. This is the controlled N5 case
(target `[1,16,1,2,4]`, source2tokens and reference-video1token) with all512 rows of
the retained real Text packet. It is a new N5/L512 acceptance scope, not the earlier
N5/L3 numerical fixture or the declared73,947token full-target case.

A public prediction was cancelled after actual patch progress. Its Worker was
terminated, immediate retry returnedMODEL_NOT_LOADED, explicit reload created a
new model session, and the stale session was rejected. In the SAME API instance,
normal `sample` then completed HIGH3 to LOW3 with Euler/simple6/shift5/split3,
all40blocks plus final head on each of6updates, and generated-sample-only raw
restoration. Recovery receipt IDs prove the same API owner and new model session;
all caller inputs remained bit-exact. No numerical reference or error gate was
passed as a mandatory normal API input.

All6 per-prediction block receipts contain40 completed blocks: 240total.
Per-side `blocksCompleted=40` is the last prediction's counter, not cumulative120.
The sampler's direct-public-predict counter remains0 while internal predictions
are HIGH3/LOW3. Two shared ORT sessions were reused across both model sides.

All128 FINAL raw-sample values independently compared with0failures, max absolute
error `7.62939453125e-6`, normalized gate error `0.0006182760546939364`, under the
pre-execution `abs0.01 + rel0.001*abs(reference)` gate. This new L512 run compares
finalRaw only. It does not claim16 new intermediate comparisons. The earlier
N5/L3 six-update16-array evidence is reusable only within its original scope and
unchanged sampler-math boundaries.

The result meaning is `wan21-raw-generated-sample:v1` with the generated-sample
raw-space latentContract and both producer model hashes, never posterior mean.
The actual canonical file was1,179B, was selected again as an actual disk File,
and all128 F32 payload values plus metadata read back bit-exact. Disposal returned
owned model/ops/source resources to the disposed state; later calls returned
DISPOSED, and no late progress callbacks were counted.

Host lifecycle duration was2,945.987954757s; gated outer observation2,948.039342596s.
Sampled process-tree RSS peak2,045,706,240B and PSS peak1,752,406,016B; observed
public Worker WASM Memory capacity peak324,534,272B. These are different scopes:
Memory capacity is not native allocator live bytes, RSS duplicates shared pages,
and PSS is sampled/best effort. Resource summary preserves baseline, before-exec
gate, original all-sample peaks, nearest30s/peak-window/final-cleanup observations,
role heuristics and original29,286,373B raw resource receipt SHA-256.

The metadata summary preserves source-read/decode/cache and cumulative copy/
staging/session counters. Cumulative ORT-operator JS input snapshots were
10,574,771,712B, F32 weight ownership transfers342,797,844,480B, peak prepared
stage weights566,231,040B. These totals describe repeated traffic, not simultaneous
memory. Actual internal ORT/WASM uploads and allocator suballocations remain
unobserved. The six-run source decode total is recorded independently from
storage and copy time; inclusive stage and child timers must not be added.

This closes normal public six-update sampling and cancellation/reload recovery
ONLY for the declared small N5/L512 input domain. Full target81, complete global
query/block/head/fullshape sampling, original media replay and originalmxfp8
precision remain unaccepted. `generationReady` staysfalse. This later sample
receipt supersedes the earlier evidence bundle's historical statement that
normal public six-update sampling had not yet run; it does not extend that
small-input scope to production shape.

All published files contain metadata/hashes only. Actual tensors and canonical
files remain private. No repeat inference or export was performed for packaging.
