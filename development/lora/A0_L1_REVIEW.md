# A0/L1 independent review

Baseline: `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`.

Reviewed requirements in `development/lora/A0_L1_PLAN.md`, the supplied `a0-l1-review.patch`, and the current loader-policy, planner-v2, sdk-v2, v1-adapter, state/panel, contract notes and fixture sources. Current files include fixes made during this review; the initial patch alone is not the final reviewed state. No product code was edited by this reviewer and no commits or pushes were made.

## Verdict

**Spec compliance: clean for the authorized A0/L1 implementation scope after the fixes below. Code quality: approved for that scope, with no remaining blocking finding from this review.**

This verdict covers the pinned loader subset, binding-specific registry/planner, FULL/PARTIAL diagnostic distinction, actual Hike fixture computation, native transaction ownership and explicit v1 compatibility boundary. It does not certify a real Diffusion base, graph binding, consumer session, generated output, full-model inference, composition or publication. Final descriptor/archive/handoff identities remain the coordinating agent's completion task.

## Findings resolved during review

| Severity | Finding and original location | Resolution verified in current files |
| --- | --- | --- |
| High | Mutable consumer context could relabel a prepared PARTIAL result as FULL/full-adapter and replace its source hash. `sdk-v2.mjs:81` passed the same mutable object used by validation comparisons and returned identity. A direct fixture reproduced a successful commit returning FULL for a PARTIAL manifest. | Transaction context is frozen at `sdk-v2.mjs:81`. The mutation regression rejects before commit and rolls back. Validation evidence is cloned/frozen before commit, and receipt ownership metadata is captured independently, so later returned-object mutations cannot replace prior evidence or bypass lease retention. |
| Important | Initial v1 sink/consumer adapters forwarded v2 `fullShape` and local revision names without supplying documented v1 `shape`, `inputRevision` and `applicationRevision`. The original adapter-only tests already contained old field names, masking the integration failure. `v1-adapter.mjs` original `blockV1`, `manifestV1` and `legacy` conversions. | Current `v1-adapter.mjs:23`, `:33` and `:66` translate actual v2 blocks/manifests, bind native registry hashes, compute a consistent v1 bundle identity and retain separate v2 identity. An actual v2 plan/prepare/stage fixture uses the pinned Hike kernel and a documented v1 initializer sink/consumer. |
| Important | After the first adapter fix, rollback spread the original v2 context over the cached v1 context, replacing the legacy package `bundleHash` and blocks. A native commit failure therefore triggered rollback with the wrong package identity and repeated recovery failure. Original rollback at `v1-adapter.mjs:93`. | Current `v1-adapter.mjs:99` retains the candidate's native context and refreshes cancellation/currentness only. The integrated commit-failure regression verifies unchanged native bundle hash, adapter-set hash, registry hash, block metadata and shape during rollback. |
| Medium | A failed `sink.abort()` before prepared-handle registration was forgotten. `prepare` reported that disposal could retry, while disposal succeeded without another abort and left the partial allocation retained. Original `sdk-v2.mjs:73`. | Current `sdk-v2.mjs:20`, `:73`, `:96` and `:98` retain pending abort cleanup, block new transactions until recovery, and retry cleanup through recover/dispose. Regression verifies a failed disposal retains cleanup and a later disposal releases it. |
| Medium | Unknown coverage could receive the confirmed-applied/published label. Original `state.mjs:5` accepted `{state:'CONSUMER_APPLIED'}` and returned an affirmative label with null coverage. | Current `state.mjs:9` requires explicit coverage for these states. The unknown-coverage regression rejects both applied and published presentation. PARTIAL remains visibly diagnostic and cannot receive generation readiness. |

## Verification evidence

The review reproduced the context relabeling, forgotten abort cleanup and legacy rollback identity failures with tiny synthetic inputs; no real model binaries or base weights were used. The coordinating agent's saved `/workspace/work/lora/a0-l1-all-tests.log` recorded 71/71 passing fixtures before the final adapter rollback regression was added.

After inspecting the fixes, the reviewer independently ran only the affected regression selections, avoiding another full-suite run:

```text
node --test --test-reporter=spec \
  --test-name-pattern='snapshots validation|failed sink abort|cannot mutate partial|unknown coverage|bridge documented|rollback preserves' \
  tools/lora/test-sdk-v2.mjs tools/lora/test-state.mjs tools/lora/test-v1-adapter.mjs
# 5 passed, 0 failed

node --test --test-reporter=spec \
  --test-name-pattern='v2-to-v1 commit failure' tools/lora/test-v1-adapter.mjs
# 1 passed, 0 failed
```

Static review also confirmed that the loader policy is explicit and pinned; all original patches are classified before exclusions; unsupported tensors/transforms cannot hide in PARTIAL; full shapes and full-base element offsets are retained; bindings remain discriminated; the original SDK v1 entrypoint is unchanged; native results keep generationReady=false; failed consumer rollback and release retain package ownership; and management descriptors/snapshots are not imported into the native SDK.

## Remaining test scope

No additional blocking fixture gap remains from the concrete findings above. The next meaningful acceptance tests require the real Diffusion registry, immutable F32 provider, package/feed sink, consumer validation tolerances and copy/lease contract. Those tests must cover actual binding, numerical agreement, stale commit/rollback behavior and live-session byte lifetime. Synthetic fixture success cannot supply that evidence.
