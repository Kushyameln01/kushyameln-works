# Independent LoRA standalone integration review

Review date: 2026-11-02 UTC. Reviewer: independent `lora_review` agent. Review was read-only for repository implementation and tests; this private report is the only artifact written by the reviewer.

## Sources and limits

- Management repository: `/workspace/kushyameln-works`, baseline `92942230fbefe6ff727ba0b6f78f59591c46756e`. Integration was unstaged/untracked when reviewed; it was not a fixed execution-source commit.
- Authoritative request: `/workspace/work/ai-connection/lora-standalone-r15/USER-REQUEST.md`.
- Authoritative owner API/result: `OWNER-API.md` and `OWNER-RESULT.md` in that directory, adopted owner distribution `6d0c8df4cd4992f26745d2d26394f5e194d2567f`.
- Plan: `/workspace/kushyameln-works/development/ai-connection/lora-standalone/PLAN.md`.
- Reviewed new modules: `docs/shared/ai-connection/adapters/lora-standalone/{adapter,management,native,reference,storage}.mjs`; shipped browser entry `docs/ai-connection/lora/{main.mjs,index.html}`; owner SDK/host and common queue/snapshot interactions relevant to the findings.
- Scope: side/request/revision/epoch identity; queued arguments; cancellation and original terminal; late native publication and compensation; batch failure/fresh base recovery; lifetime and streamed save/reopen; native versus management acknowledgements; actual browser entry dispatch.
- No mapping, numerical implementation, or independent gate was added. No real Diffusion base/graph/consumer acceptance or generation readiness was tested. The development provider/consumer remains graphBinding UNBOUND and generationReady false.
- After the three findings were accepted, follow-up review was restricted to closing those three boundaries. No broad new feature audit was performed.

## Initial independent test evidence

Each new suite was executed directly with Node. All were green before the three reproducers were added:

| Suite | Passed |
| --- | ---: |
| `tools/ai-connection/test-lora-standalone-native.mjs` | 2 |
| `tools/ai-connection/test-lora-standalone-adapter.mjs` | 11 |
| `tools/ai-connection/test-lora-standalone-management.mjs` | 4 |
| `tools/ai-connection/test-lora-standalone-reference.mjs` | 4 |
| `tools/ai-connection/test-lora-standalone-storage.mjs` | 7 |
| Total | 28 |

Those 28 passes did not cover the three failing boundaries below. Parent-reported browser 14 DEV passes and combined 717 passes are separate evidence; the reviewer did not independently rerun those suites. They do not establish that these boundary reproducers passed, nor constitute fixed-source acceptance. The original 689 Node / 14 Chromium regressions retain their original regression scope.

## Findings and raw observations

### R1 — P1: undispatched cancellation deadlocked afterTerminal

Original location: `docs/shared/ai-connection/adapters/lora-standalone/adapter.mjs:39`, resolution originally only inside execute's `finally` at line 89.

Minimal trigger:

```js
const controller = new AbortController();
const pending = adapter.restoreBase({signal: controller.signal});
queueMicrotask(() => controller.abort());
```

The queue marked the slot running but skipped execute because cancellation arrived before its dispatch microtask. Its owner terminal callback then awaited a promise that execute never created a terminal for. Raw observations after 100 ms:

```json
{"settled":false,"active":null,"queue":{"groups":[{"queued":[],"quarantined":false}],"invocations":[{"resultAccepted":false,"originalTerminal":true,"stopAcknowledged":false,"calculationStopped":true,"resourceReleased":false,"reusable":false,"state":"cleanup","cancelRequested":true,"nativeStopRequired":false,"nativeOutcome":"rejected"}]},"sdk":{"side":"HIGH","localRevision":0,"busy":false,"operation":null,"disposed":false,"registeredSources":0,"preparedPackages":0,"recoveryRequired":false}}
```

The resource slot never released, blocking successors and disposal.

### R2 — P1: native publication was hidden when cleanup rejected after release

Original location: `adapter.mjs:64`: `r.nativeCommitted=true` ran only after `sdk.stage()` resolved.

Trigger: wrap the conformant reference consumer, preserving native calls, but reject the first terminal cleanup acknowledgement after cleanup completed:

```js
let once = true;
const consumer = {...backing.consumer,
  async releaseCandidate(...args) {
    await backing.consumer.releaseCandidate(...args);
    if (once) {
      once = false;
      throw Error('response lost after release completed');
    }
  }
};
```

Register one HIGH light development File and apply its declared selected row. Consumer commit completed. Candidate release removed the candidate before rejecting. The SDK's rollback found a released candidate and returned without restoring publication; stage rejected without leaving an SDK recovery requirement. Raw observation:

```text
apply rejected: response lost after release completed
```

```json
{"epoch":1,"publicationDiverged":false,"recoveryRequired":false,"query":true,"consumer":{"disposed":false,"epoch":1,"candidates":0,"readLeases":0,"inFlight":0,"pendingReleases":0,"active":true,"activePackageHash":"a6a35f15c7d162698f377aeefca0eb9c1f0b1cf1933a0a083aa69e625d8286e2"}}
```

Management rejected the request but reported an executable, nondivergent state while the native consumer retained the unreported applied package. This was initially rated P2 in the reviewer response and accepted for P1 treatment by the parent; its silent divergence is the material finding.

### R3 — P1: action completion was mistaken for queue acceptance

Original locations: `adapter.mjs:89` set `r.accepted=true` before queue acceptance; catch at line 96 suppressed divergence when that flag was true.

Trigger: following native candidate release, queue a bounded microtask poll. Abort when the operation's queue record first reports `originalTerminal:true` and `state:'running'`. This is after execute fulfilled and before queue cleanup/acceptance:

```js
let attempts = 0;
const spin = () => {
  const invocation = adapter.inspect().queue.invocations.at(-1);
  if (invocation.originalTerminal && invocation.state === 'running') {
    controller.abort();
  } else if (attempts++ < 300) queueMicrotask(spin);
};
queueMicrotask(spin);
```

Raw observation:

```text
abort at running fulfilled
apply rejected: INVOCATION_CANCELLED Cancelled invocation result was not accepted
```

```json
{"epoch":1,"publicationDiverged":false,"recoveryRequired":false,"snapshot":null,"query":true}
```

Native publication remained applied while management rejected the operation without retaining divergence or a compensation requirement.

## Follow-up verification

### R1: closed independently

The implementation now resolves the native terminal barrier when common queue owner outcome explicitly reports `notStarted:true`.

The reviewer independently reran the exact microtask-abort trigger, asserted cancellation within 100 ms, then ran a successor base restore and disposed SDK plus caller backing. Raw terminal record:

```json
{"resultAccepted":false,"originalTerminal":true,"stopAcknowledged":false,"calculationStopped":true,"resourceReleased":true,"reusable":true,"id":"review-pre-dispatch-abort","requestId":"review-pre-dispatch-abort","revision":1,"parentId":null,"state":"cancelled","cancelRequested":true,"nativeStopRequired":false,"nativeOutcome":"rejected","errorCode":"INVOCATION_CANCELLED"}
```

SDK local revision remained 0 during the undispatched cancellation; successor returned `CONSUMER_APPLIED`. Final backing evidence: consumer disposed, candidates/readLeases/inFlight/pendingReleases all 0, active false; kernel disposed, memoryBytes 0 and leaseCount 0; baseAlive false; cache bytes/entries/pending all 0.

### R2 and R3: closed independently

The implementation forwards the original consumer methods with their original receiver and exact native arguments/results. Its narrow facade observes commit entry/return; native SDK receipt checks and native consumer completed-F32 validation remain responsible for admission. An unaccepted commit attempt now retains publication divergence, including a stage rejection after successful candidate release. Action completion and actual common queue acceptance use separate flags; acceptance occurs only after original terminal, release, reuse, and result acceptance are confirmed.

The reviewer independently reran both original reproducers. Each still rejected the triggering request and left consumer epoch 1 applied, but now management retained publicationDiverged true / recoveryRequired true and query.dispatchSupported false. Resource recovery retained compensationRequired true and did not clear divergence. A register attempt was rejected with COMPENSATION_REQUIRED. Fresh restoreBase committed epoch 2, and actual native readback returned the base prefix `[-0.0390625, -0.03125, -0.0234375, -0.015625]`; divergence cleared only then and query.dispatchSupported became true. Final SDK/consumer/backing cleanup reached zero resources in both cases.

The reviewer also independently reran `node tools/ai-connection/test-lora-standalone-adapter.mjs`: 14/14 passed, failed/cancelled/skipped 0. This includes the three new regression cases. The other four suites were independently green at the initial 28-test checkpoint; they were not redundantly rerun after the adapter-only correction.

## Acceptance status

All three reported boundaries are independently closed on the source bytes identified below. No remaining important finding was observed in this bounded follow-up. The source was still uncommitted when this verification ran; this is a working-source review, not fixed-source or full browser acceptance. The parent must bind subsequent committed/browser evidence to these bytes or rerun the appropriate validation after changes.

## Final independent raw boundary receipt

```json
{
  "review": "known-three-boundaries",
  "records": [
    {
      "boundary": "pre-dispatch cancellation",
      "result": "PASS",
      "rejected": "INVOCATION_CANCELLED",
      "checkpoints": {
        "terminal": {
          "resultAccepted": false,
          "originalTerminal": true,
          "stopAcknowledged": false,
          "calculationStopped": true,
          "resourceReleased": true,
          "reusable": true,
          "id": "review-pre-dispatch-abort",
          "requestId": "review-pre-dispatch-abort",
          "ownerId": "lora-standalone:HIGH:e035a096-b766-4b6e-aa17-6a4fc8f509ca",
          "resourceBinding": "lora-manager:96996869-f1a5-4d04-9ee9-f827fceff70d:HIGH:resource",
          "resourceGeneration": "lora-resource:431dd2ab-d6cb-47ca-8765-63267969c22b",
          "revision": 1,
          "activeToken": "e6e73de6-f423-4b44-a749-d59f15ac6a2c",
          "parentId": null,
          "state": "cancelled",
          "cancelRequested": true,
          "nativeStopRequired": false,
          "nativeOutcome": "rejected",
          "errorCode": "INVOCATION_CANCELLED"
        },
        "sdkRevision": 0,
        "consumerEpoch": 0
      },
      "finalResources": {
        "kind": "DEVELOPMENT_REFERENCE_PROVIDER_CONSUMER",
        "side": "HIGH",
        "graphBinding": "UNBOUND",
        "trainingBaseVerified": false,
        "generationReady": false,
        "baseAlive": false,
        "backingDisposed": true,
        "consumer": {
          "disposed": true,
          "epoch": 2,
          "candidates": 0,
          "readLeases": 0,
          "inFlight": 0,
          "pendingReleases": 0,
          "active": false,
          "activePackageHash": null
        },
        "kernel": {
          "productCalls": 0,
          "applyCalls": 0,
          "decodeCalls": 0,
          "downUploads": 0,
          "workspaceHighWaterBytes": 0,
          "residentDownBytes": 0,
          "memoryBytes": 0,
          "closing": true,
          "disposed": true,
          "leaseCount": 0
        },
        "cache": {
          "maxBytes": 1048576,
          "bytes": 0,
          "entries": 0,
          "pending": 0,
          "hits": 0,
          "misses": 0
        },
        "controls": {
          "blockAttempts": 0,
          "completedBlocks": 0,
          "completedElements": 0,
          "releaseAttempts": 1,
          "rollbackAttempts": 0,
          "mode": "success",
          "releaseFailures": 0,
          "rollbackFailures": 0,
          "waiting": false
        }
      }
    },
    {
      "boundary": "lost cleanup acknowledgement",
      "result": "PASS",
      "rejected": "response lost after release completed",
      "checkpoints": {
        "rejectedAtEpoch": 1,
        "snapshot": null,
        "publicationDiverged": true,
        "recoveryRequired": true,
        "dispatchSupported": false,
        "resourceRecovery": {
          "recovered": true,
          "compensationRequired": true
        },
        "compensation": {
          "state": "CONSUMER_APPLIED",
          "consumerEpoch": 2,
          "values": [
            -0.0390625,
            -0.03125,
            -0.0234375,
            -0.015625
          ],
          "publicationDiverged": false
        },
        "cancelObserved": false
      },
      "finalResources": {
        "kind": "DEVELOPMENT_REFERENCE_PROVIDER_CONSUMER",
        "side": "HIGH",
        "graphBinding": "UNBOUND",
        "trainingBaseVerified": false,
        "generationReady": false,
        "baseAlive": false,
        "backingDisposed": true,
        "consumer": {
          "disposed": true,
          "epoch": 3,
          "candidates": 0,
          "readLeases": 0,
          "inFlight": 0,
          "pendingReleases": 0,
          "active": false,
          "activePackageHash": null
        },
        "kernel": {
          "productCalls": 1,
          "applyCalls": 1,
          "decodeCalls": 2,
          "downUploads": 1,
          "workspaceHighWaterBytes": 61440,
          "residentDownBytes": 0,
          "memoryBytes": 0,
          "closing": true,
          "disposed": true,
          "leaseCount": 0
        },
        "cache": {
          "maxBytes": 1048576,
          "bytes": 0,
          "entries": 0,
          "pending": 0,
          "hits": 0,
          "misses": 2
        },
        "controls": {
          "blockAttempts": 1,
          "completedBlocks": 1,
          "completedElements": 5120,
          "releaseAttempts": 3,
          "rollbackAttempts": 1,
          "mode": "success",
          "releaseFailures": 0,
          "rollbackFailures": 0,
          "waiting": false
        }
      }
    },
    {
      "boundary": "late queue cancellation",
      "result": "PASS",
      "rejected": "INVOCATION_CANCELLED",
      "checkpoints": {
        "rejectedAtEpoch": 1,
        "snapshot": null,
        "publicationDiverged": true,
        "recoveryRequired": true,
        "dispatchSupported": false,
        "resourceRecovery": {
          "recovered": true,
          "compensationRequired": true
        },
        "compensation": {
          "state": "CONSUMER_APPLIED",
          "consumerEpoch": 2,
          "values": [
            -0.0390625,
            -0.03125,
            -0.0234375,
            -0.015625
          ],
          "publicationDiverged": false
        },
        "cancelObserved": true
      },
      "finalResources": {
        "kind": "DEVELOPMENT_REFERENCE_PROVIDER_CONSUMER",
        "side": "HIGH",
        "graphBinding": "UNBOUND",
        "trainingBaseVerified": false,
        "generationReady": false,
        "baseAlive": false,
        "backingDisposed": true,
        "consumer": {
          "disposed": true,
          "epoch": 3,
          "candidates": 0,
          "readLeases": 0,
          "inFlight": 0,
          "pendingReleases": 0,
          "active": false,
          "activePackageHash": null
        },
        "kernel": {
          "productCalls": 1,
          "applyCalls": 1,
          "decodeCalls": 2,
          "downUploads": 1,
          "workspaceHighWaterBytes": 61440,
          "residentDownBytes": 0,
          "memoryBytes": 0,
          "closing": true,
          "disposed": true,
          "leaseCount": 0
        },
        "cache": {
          "maxBytes": 1048576,
          "bytes": 0,
          "entries": 0,
          "pending": 0,
          "hits": 0,
          "misses": 2
        },
        "controls": {
          "blockAttempts": 1,
          "completedBlocks": 1,
          "completedElements": 5120,
          "releaseAttempts": 2,
          "rollbackAttempts": 0,
          "mode": "success",
          "releaseFailures": 0,
          "rollbackFailures": 0,
          "waiting": false
        }
      }
    }
  ],
  "source": [
    {
      "path": "docs/shared/ai-connection/adapters/lora-standalone/adapter.mjs",
      "byteLength": 24843,
      "sha256": "52e3ea4f887951c9b5d6f40dd07a8ddd087b42cec2875527ee58f46ee77f1a28"
    },
    {
      "path": "tools/ai-connection/test-lora-standalone-adapter.mjs",
      "byteLength": 18113,
      "sha256": "62df7af3998fbca425204530ffcaee2d7c710ddbcc6945aef068a855821db9e0"
    }
  ]
}
```

## Final independent adapter suite output

```text
✔ management exposes a distinct standalone side adapter without replacing v2 (0.937321ms)
✔ actual SDK File registration, two pairs, removal, repeat and base restoration run through common control snapshot (85.570074ms)
✔ opaque manager plans and prepared handles cannot be copied into native authority and explicit release preserves consumer lease (29.808328ms)
✔ targeted cancellation waits original Hike consumer barrier and old target cannot cancel successor (38.21853ms)
✔ SDK candidate cleanup failure quarantines common queue until explicit native recovery (22.01762ms)
✔ SDK disposal never invalidates consumer-owned active/read leases or disposes caller kernel/base (18.630419ms)
✔ streamed native payload and manifest reopen into a different SDK authority and apply without original registrations (63.667296ms)
✔ duplicate in-flight manager request cannot replace cancellation authority or quarantine its original target (20.082299ms)
✔ cancel after native commit keeps publication divergence across recover until a fresh base compensation succeeds (21.479318ms)
✔ queued handle and writer arguments are captured on acceptance instead of changing with caller mutation (20.113244ms)
✔ failed SDK final kernel-lease cleanup can recover after queue closure and then retry disposal (9.280704ms)
✔ abort between queue running and native dispatch reaches an unstarted terminal without waiting on an uncreated native promise (18.817405ms)
✔ lost cleanup acknowledgement after consumer commit cannot publish readiness even when SDK rollback no longer owns the released candidate (19.062682ms)
✔ late cancel after action terminal but before queue acceptance never adopts a native commit as current management success (19.204646ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 395.569643
```
