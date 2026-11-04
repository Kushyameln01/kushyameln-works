# Public HIGH validation continuation

This tool waits for the already running, frozen original-size public HIGH
prediction. It does not restart that prediction or change its source, inputs,
Text, model files, numerical profile, gate, or normal API.

The implementation uses three phases: stdlib-only receipt/source admission;
one separately monitored original reference; then the existing offline
comparator. Missing, empty, or incomplete receipts mean WAIT. Explicit failure
or identity mismatch means BLOCKED. Only `--watch` may launch work. An exclusive
claim prevents a second watcher or a restarted watcher from repeating a started
reference automatically.

Implementation plan:

- [x] Pin the full native completion, cleanup, source, input and File identities
  with small failing tests, including incomplete and failed terminal receipts.
- [x] Add the one-shot sequential reference/comparator runner and verify failure
  never launches the next phase. Keep the default path free of NumPy imports.
- [x] Check the real running case with `--check-only`, run the lightweight suite,
  and review the guards. Do not arm a watcher or run inference during development.

The native source is `6cda0a686d30a4bd748909fc56c61c1acece7bfb` in
`/tmp/diffusion-public-execution-20261104`. The full contract is
`development/ai-connection/d1-d4-production-20261102/reference/full-declared-preexecution.json`
(2,615 bytes, SHA256
`1943f1a528580ae5f7055342cb1c117131592ca776ed655c3a9a81caadefb8d3`).
The existing full input manifest remains
`/tmp/d1-d4-production-73947-inputs/inputs.json` (82,481 bytes, SHA256
`7c1545413898de4c18cee2ed19dbec9f8abe61cfed7b48ee0954d33f0206c6b6`).

Run the default check without starting any numerical work:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/continue-public-high-validation.py \
 --check-only --state-dir /tmp/diffusion-original-high-validation-20261105
```

After committing/reviewing the watcher, the coordinator can explicitly arm it:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/continue-public-high-validation.py \
 --watch --state-dir /tmp/diffusion-original-high-validation-20261105
```

The latter command is recorded for later use; it has not been executed during
implementation. It polls every30 seconds. State, append-only events, commands,
source hashes, launcher BLAS observations, reference progress/resources and the
comparison receipt stay in the specified Git-external private directory.
`run.json` is the authoritative launched-phase record; check-only observations
retain that phase and cannot replace a running/failed continuation with READY.
The fixed native run also has a shared durable launch claim at
`/tmp/diffusion-original-high-public-20261104/validation-continuation-claim.json`.
Changing the state directory or restarting the watcher does not bypass it.

SIGTERM/SIGINT are observed cooperatively before/during spawning and polling.
Only the watcher's newly spawned observer process group is signalled. Cleanup
uses bounded TERM/wait and KILL/reap attempts; a remaining live-child obligation
is recorded while the watcher retains its instance lock and continues cleanup.
A durable claim survives a hard kill and blocks automatic reference retries.
Logging failure does not release a live obligation. The already running native
session30165 and its process group are never signalled.

Reference execution uses the unchanged frozen `production-reference.py
execute-reference --operation predict --side HIGH --allow-full-shape`, without
a partial-block option, under `observe-process-run.py`. A private launcher
imports NumPy/threadpoolctl, scopes BLAS to1, records the observed pools/version,
then invokes that original script with `runpy`. The comparator receives the
FULL contract, the same hash-verified manifest and both actual source commits;
its small-case/default-source arguments are never used implicitly.

Success means only this HIGH4/COI original-size declared-case prediction and its
independent comparison. LOW, six updates, raw generated-sample saving,
original-size1/no-COI, READY, whole operation and counterpart ACK remain false.
The retained mask is preserved as provenance; all512 Text rows still participate
in the original cross-attention calculation. No original-media or mxfp8 claim
is added. A failed/interrupted phase requires coordinator review; it does not
retry the heavy reference automatically.

Lightweight tests (no model, browser or reference inference):

```sh
python3 tools/diffusion-models/test-continue-public-high-validation.py
```

Development verification:28 small tests passed, including observed failing
regressions for admission, source/input ownership, fresh output reservation,
signal windows, incomplete cleanup, retry prevention and comparison identity.
Independent schema and interruption reviews found no remaining Important or
Critical issue in their reviewed scope. Real check-only returned WAIT with
`heavyWorkStarted:false`, fixed source6cda and no launch claim. It created only
private checker metadata in
`/tmp/diffusion-public-high-validation-check-20261105`; no numerical reference,
comparator process, browser, model copy or armed watcher was executed.

[Verification/source hashes](evidence/verification.json),
[28-test result](evidence/unit-tests.json), and
[actual check-only WAIT receipt](evidence/check-only-wait.json) preserve the
observed result. The directory date follows JST November5; machine timestamps
inside these receipts are the actual UTC values. Reviewed watcher SHA256 is
`bea290c7c48d5753d409057a99d3b033c7ccfe11ce82199b00b417cd16cff0ae`;
test SHA256 is
`2c4e55c978f18856a909e3860151c28014d5710a37bda7e8d8b8fb4bf0845406`.
The coordinator owns the later commit and explicit `--watch` arm.
