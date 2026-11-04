# Diffusion standalone continuation — 2026-11-04 JST

Starting distribution: `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`; Draft PR14.

## Decisions

- Reuse prior N5/L512 and N5/L3 evidence only within each saved input / execution source / thread scope. No original-size promotion.
- Latest standalone plan body actually read from Page `page_1e950f67b0688191bd3f2a1d5b252224`, version1.0 draft1. No missing media or original mxfp8 precision inferred.
- Existing linked worktree is the implementation checkout. A detached `/tmp` execution worktree freezes only committed executable bytes for long runs; independent API/weight-feed work cannot invalidate its HEAD/source guards.
- Task A: exact saved packet/nativeJSON/N5 recovery completed; full73947 and smallN5-L512 manifests match prior bytes. Portable retrieval script and asset map in progress.
- Task B: prepared head-major immutable KV pool, same Q128/K256, is the first performance change. It replaces row-major KV storage; native ORT uploads remain real copies. Numerical validation precedes adoption.
- Task C: immutable genuine base provider / completed-F32 transactional feed / 1053 logical targets separately bound to1095 native targets in progress. Diffusion owns no low-rank arithmetic.
- Task D: public sampler epoch pinning and explicit duplex MessagePort package transport in progress. Main-side package functions are never cloned into Worker input.
- Task E: bounded blocks/full40+head diagnostic runner and explicit resource profiles in progress; original all-query execution next.
- Normal runtime inputs never require saved payload hashes, references, gates or detailed numerical receipts.
- User authorized implementation, verification, branch push and Draft PR update. No duplicate approval/ACK gate; no merge, Pages publish, experimental LoRA delivery or whole-operation experiment.

## Resource observations before new model execution

CPU cgroup quota400000/period100000 (4CPU); memory.max17179869184B; no detected GPU runtime. Two retained15,574,833,216B scaledFP8/F16 model files remain immutable in existing workspace. Full F32 model materialization is not used. Workspace filesystem had~87MB free; temporary execution checkout and bounded private artifacts use `/tmp` tmpfs (capacity9,441,329,152B). These are host observations, not proof of full model completion.

## Acceptance status

Original73947 all queries, full40/head and six updates remain unaccepted until corresponding new receipts complete. Management has real pinned public-call adapters, but new source adoption and actual saved-input management execution are separate scopes. Conforming weight-feed validation is not actual full-model LoRA acceptance.

## Work recorded after the initial plan

- `c0cbd456df2274078c89de3cdb3856f612543aeb`: public holding runner now defaults1/noCOI and refuses4/noCOI before reading assets. Actual retained-model public smoke passed15.760679497s, cancellation at patch -> fresh reload in the same API -> canonical real File readback. No complete neural prediction was accepted by this smoke. RSS sum peak1,295,982,592B / PSS sum peak1,015,153,664B (separate outer monitor, 1s sampling).
- `ecf1122b3afaba989277c5b44f523a40219b79eb`: preparedKV source plus blocks/predict chunk harness frozen. Independent review found no Important/Critical defect in TaskB. Native bounded1/noCOI and4/COI comparison receipts preserve old graph bits. All-query N73947 HIGH/block0 trial started from the detached frozen worktree; native4/COI and explicit independent BLAS4 are recorded separately. Actual1-vs4 reference Q/K/V rows1/3 and all40-head bounded attention were bit-identical before selecting BLAS4 for this new trial. Older one-thread-reference receipts are not promoted.
- TaskC review found candidate commit/release and terminal cleanup/dispose races; fixes and regression tests are required before consumer acceptance. Root additionally requires genuine base outside selected package ranges rather than trusting package pass-through values. These do not affect the running frozen base trial.
- TaskD review is checking interrupted prepare and package release failure ownership; successful structural RPC tests do not close those findings. Public normal inputs still contain no numerical reference/gate.
- Portable saved-input recovery tests pass4/4; byte-exact old full/small manifests are restored. No Text inference or raw re-export was needed.

Runtime job receipts are pending, not completion evidence. Current stdout/progress and private oracle files remain outside Git until terminal results and cleanup are recorded.


## Packaged continuation at `6cda0a686d30a4bd748909fc56c61c1acece7bfb`

The earlier Task C/D “in progress” and review-finding notes above are historical. Their implementation, cleanup fixes, and scoped public Worker verification are now recorded in [weight-feed results](../standalone-weight-feed-20261104/RESULT.md) and [public Worker receipts](../standalone-weight-feed-20261104/public-worker/RESULT.md). Prepared-KV and in-place residual controls are recorded in [prepared-KV results](../standalone-prepared-kv-20261104/RESULT.md) and [residual results](../standalone-inplace-self-residual-20261104/RESULT.md). These boundaries do not accept original full-model execution or real LoRA.

The latest API source is `6cda0a686d30a4bd748909fc56c61c1acece7bfb`, runtime build source SHA-256 `e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6` (153 source entries, all checked against local bytes). Final live proxy release now keeps its ownership and native recovery fence until the host actually releases; failed live cleanup remains retryable, concurrent release shares one operation, and retain is blocked while ending. Closed-port host cleanup remains independently retained and retryable.

Fresh bounded Node controls passed transport10/10, mocked adapter26/26, and MockWorker host19/19 in separate processes. Exact stdout/stderr, exits, source-before/after bytes and SHA-256 are archived in [integration verification](evidence/integration-release-verification.json). These controls read no model bytes and execute no neural inference. The optional 8-byte Node resident-OrtValue probe was rerun once; [portable execution](resident-ort/PROBE.json) records exact output and source identity, with no OrtRun, model read, browser proof or allocation above 2GiB. Original failed CPU-location attempts remain recorded.

The GitHub connector retrieved both latest full weight-port source and contract bodies at the fixed commit; [acquisition proof](evidence/github-latest-acquisition.json) confirms exact local bytes, SHA-256 and Git blob SHA. This is owner-side retrieval evidence only, not counterpart acknowledgement or acceptance. [Delivery inventory](DELIVERY.json) enumerates the scoped existing evidence without private inputs or models.

The sole original heavy trial remains pending under frozen source `8ddefbafdb27ce8a0451c3ad5ba36d63729acd87`, exec session39985. This packaging did not read models, run another neural test, edit or stop that trial. Original all-query, full40/head, six updates, real full-model LoRA and whole-operation acceptance remain open. No merge, Pages publication or new delivery acknowledgement is claimed.


## Lightweight continuation packaged at `5eef220918ec88e9761f121e3b9c511b82c41e31`

[Management adoption audit](MANAGEMENT-ADOPTION.md) and [fixed-source diff](MANAGEMENT-SOURCE-DIFF.json) distinguish the existing seven base operations from latest-source adoption. The manager still pins `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`; adopting the latest native tree and implementing dedicated weight-port transfer/ownership remain manager-owner work. Whole connection implementation is therefore incomplete. This read-only audit supplies no new recipient ACK, manager NN or real-LoRA acceptance.

At diagnostic source `716ffd169cf1b77ac086e030131af9de6222e528`, [exit-status verification](evidence/diagnostic-exit-status.json) records16 lightweight tests and self-test, while [original CLI admission](evidence/original-cli-admission.json) records four validate-only cases. Neither executes browser/native model work or an independent model reference; neither changes or accepts the frozen original trial. Source `8ddefbafdb27ce8a0451c3ad5ba36d63729acd87` retains its historical process-status behavior and remains pending in exec session39985 without a terminal receipt.

The [attention timing harness](resident-ort/HARNESS.md), [plan](resident-ort/HARNESS-PLAN.md) and [validation](resident-ort/HARNESS-VALIDATION.json) are distributed in `5eef220918ec88e9761f121e3b9c511b82c41e31`. The validation records base HEAD `716ffd169cf1b77ac086e030131af9de6222e528` plus exact implemented-file hashes; those hashes match this distribution. Seven Node and three Python native-free unit checks passed. Browser/native execution, timing collection, output bit comparison, actual ORT cleanup and speedup remain unproven; no such run was added during packaging.

The runtime remains `6cda0a686d30a4bd748909fc56c61c1acece7bfb` / build SHA-256 `e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6` /153 source entries. Original all-query, full40/head and six updates remain unaccepted. This update changes only packaging records and does not query, modify or stop the active trial, run native/browser tests, publish or merge.


## Block0 terminal result and sequential public HIGH continuation

The prior session39985 pending notes are historical: frozen8d completed HIGH block0,13 selected stages/6,366chunks/4,169,937,920elements/failed0, unchanged source and gate, host13,737.908823s. [Block0 result](evidence/original-block0/RESULT.md) and [summary](evidence/original-block0/SUMMARY.json) record exact receipts, prefix evidence reuse, full-period sampled PSS peak12,217,216,000B/RSS12,494,725,120B, zero OOM-count increase and cleanup/unknown scopes. This accepts originalHighBlock0Only, not full40/head or public predict.

After that trial ended, [bounded attention timing](resident-ort/TIMING-RESULT.md) ran sequentially1/noCOI then4/COI at89fc9cb. Each profile's baseline/wrapper10,649,600 output bytes match, including one warmup plus3 measured tiles; no cross-profile bit comparison, original-shape duration/fraction, speedup or residentKV acceptance is inferred. Historical [implementation validation](resident-ort/HARNESS-VALIDATION.json) retains its original hashes and is checked against committed5eef Git objects, not later edited documentation.

The subsequent sole heavy NN is now public HIGH predict at6cda, session30165, from the frozen public worktree. [Saved running observation](RUNNING-PUBLIC-HIGH.json) records actual load/predict and block0 self-attention1,024/73,947rows, with no terminal receipt at that observation. [Reproduction](REPRODUCE.md) records the command, private/output/log/resource paths and acceptance requirements. Its96h watchdog is operational only. Public original full40/head/numerical acceptance, LOW, six updates, latest manager native adoption/weight-port implementation, whole connection and counterpart ACK remain incomplete/false. Packaging neither queried nor modified the running job and started no additional NN/browser/native execution.

Fixed distribution `38069cc4f8cc456743b536ba5f5e68be9b33a25b`: [API/RESULT full-body owner retrieval proof](evidence/github-distribution-acquisition.json) matches local bytes, SHA-256 and Git blob SHA; no counterpart ACK or new inference.
