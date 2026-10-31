# E1 joint integration independent review

Review started 2026-10-31 UTC against LoRA baseline `dcb1f504263955ef2a4b1613b7a9d802aebd1c18` and the in-progress integration files in `/workspace/work/lora-implementation`. Peer public source is pinned to `438972f30242e0a3bc66edb8591f38eaa0fcd384`; its diagnostic base/consumer are identical to original `f522d9aeff313558c4ef83022a340af9a4c21391`. Scope: read-only product/test review, with only this review artifact written. No synthetic 74-test suite or reported adapter 14-test suite was rerun.

Final reviewed worktree-byte snapshot (SHA-256 below). HEAD observed was `55b82f01fe524f94de44932121558280e0b1b8f8`; the tiny subsequent adapter run-guard/test delta was inspected too and must be committed before trial. The listed bytes, rather than that pre-delta HEAD alone, define this review:

| File | SHA-256 |
| --- | --- |
| `docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs` | `bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f` |
| `tools/ai-connection/lora-reference.py` | `8f52039e38fc991f1adfb4257efa7e444c51f67ad809867a5068cdfb7be18423` |
| `tools/ai-connection/joint-browser-cases.mjs` | `fac1bb4cb1b97ad1fc6a36a7b768e92fc357042dd9feebb1996679852875a93b` |
| `tools/ai-connection/test-lora-diffusion.mjs` | `e450eeb95b66a083090128db1629dc1e2e7df950bfaf4a379b4a3e4c6e9665cb` |
| `tools/ai-connection/test-diffusion-diagnostic-adapter.mjs` | `609c5b4d8436331c0daa1c9c3bccf58df1943d187387930ef34ad602f2bf06da` |

## Findings and closure

1. **Confirmed high priority: cancellation after native commit leaves cancelled feed active.** In the original reviewed adapter, `contextNative` retains SDK `context.isCurrent`, and `rollback` reuses that context (adapter lines 123, 148 before the fix). The SDK callback returns false after cancellation, while pinned native rollback restores only when `context.isCurrent() === true`. A cancellation between native atomic commit and the SDK post-commit guard therefore prevents cleanup of the same candidate.

   A single new narrow reproduction used the real SDK/Hike and pinned native consumer with an explicitly synthetic source/provider/stage. A consumer commit wrapper awaited native commit, called `sdk.cancel()`, then returned its receipt. Initial +1 output was `1`; the -1 stage rejected with `CANCELLED`; output after rejection was `-1`, while expected prior output was `1`. Exact observed record:

   ```json
   {"fixture":"synthetic provider/stage; real SDK Hike and pinned native consumer","before":1,"error":"CANCELLED","after":-1,"expectedAfterCancelledStage":1,"rollbackPreservedActive":false}
   ```

   **Closed in the reviewed fix.** Factory now requires explicit `isOwnerCurrent`; forward native context combines owner and captured SDK callback, while cleanup retains owner authority separately and relies on native candidate/epoch checks. An independent bounded reproduction verified all three cases after the fix (exit 0): late cancellation restores output `1`; superseded-owner cleanup leaves output `-1`; old cleanup preserves a newer native base epoch with output `0`. Every attempted stage rejected `CANCELLED`. This was one three-scenario script using the same explicitly synthetic contract fixture, not real joint numerical evidence or a rerun of the adapter suite. The implementer's red and green logs were inspected separately.

2. **Confirmed evidence gap: executed local product/browser sources were not bound in the trial report.** Original runner records peer source files and Node runner/Python oracle SHA-256, but does not record `/our/` module bytes or `/runner/joint-browser-cases.mjs`. The HEAD named in the report was the baseline while adapter/runner were untracked. This cannot identify exact executed adapter/browser code. **Implementation closure inspected:** runner captures `sourceCommit` once before execution; verifies every served `/our/` and browser-runner byte sequence against that commit's Git object; and reports their path, SHA-256, byte length and commit in `ourSourceFiles`. Root will commit the executed files before trial. Real report evidence must confirm the expected adapter and browser runner appear in that list.

3. **Context capture gap, normal SDK caller protected by freezing.** Original `checkedContext` awaits before reading caller context metadata, signal and callback; `prepareLoad` also reads bundleHash after awaiting. The plan explicitly requires contexts to be captured before awaits. **Closed by source inspection:** public prepareLoad/validate/commit capture metadata, selection, signal and callback before their first await, and prepareLoad uses the captured bundleHash. Numeric references were already copied synchronously. The implementer's added mutation test was inspected in source and its red/green log; the full test suite was not rerun by this reviewer.

## Static review observations

- Mapping keeps original full tensor shape in v2, selected tile shape in native, and translates full element offsets by the selected native row start. Nonzero-row contract tests exercise the mapping. Native metadata hash and v2 connection registry hash remain distinct. Runtime input `weight` and Hike parameter `bias` are retained; no initializer relabeling is present.
- Detail has no LoRA bias operation. Its finish path reads native immutable base bias `[0,16)` in selected coordinates, hashes the F32 bytes, writes pass-through data and records that provenance separately. Light requires both explicit weight and bias operations; native sink owns complete nonoverlapping coverage/checksum validation.
- Native candidate/feed copying and release behavior are grounded in the pinned public consumer, whose active feed retains its own references after candidate metadata/prepared package release. Adapter finalization is separate from SDK staging and retains rollback history through SDK post-commit checks. The cancellation finding above was the concrete failure in that design.
- Python oracle independently decodes original FP8/F16/BF16 values and uses NumPy binary64 factor products/sums. It imports no SDK or Hike arithmetic. Weight reference artifacts retain all 81,920 selected values; bias reference retains all 16 values. Browser `compareAll` loops over every element and records failed count/indices/max error; all 16 actual and expected projection outputs enter JSON.
- Gates and diagnostic strengths `[0,1,-1]` are now written to `pre-execution-gates.json` at main entry before source decoding, the first LoRA product, or browser execution. Projection gate is `1e-6 + 1e-5 * abs(expected)`, weight gate `1e-5 + 1e-4 * abs(expected)`, bias/base numeric gate zero. Only those finite diagnostic strengths are represented; no wider strength range or production GPU precision equivalence is established.
- Real runner uses actual input File references and actual pinned peer public factories with ORT/Hike. No original model substitution or sparse/zero-filled fake original is present in this code. Fixture tests explicitly use synthetic providers/stages and do not establish real joint results.
- v1 refusal and PARTIAL scope remain explicit. Reports and SDK receipts set generation readiness false and do not claim full-model inference or generation. Base restoration is a native diagnostic-side operation, not SDK detach or a management snapshot.
- Base full-file proof is required at runner entry through a size/stat-bound verified acquisition receipt and fixed original SHA-256. Python accurately reports that it did not independently recompute that full-file hash. No actual joint result was reviewed at this stage.

## Current disposition

**No remaining code blocker identified for starting the bounded real-original trial**, provided the executed source files are committed first as the new server enforces. The confirmed cancellation defect was fixed and independently verified in the narrow scenarios above. This review does not establish a passing E1 result: publication still needs the actual real-original trial report, committed/served source identities, fixed acquisition SHA/size proof, complete binary comparison artifacts and all 16 outputs. Existing source-readiness documents still need updating from their historical NOT_RUN/source-unavailable state as root already planned.

## Kernel correction review before HIGH retry

The first real HIGH trial is preserved at `/workspace/work/lora/e1-joint/HIGH/` and reports `FAIL` at the selected weight/bias gate. Root isolated a kernel defect rather than changing a numerical gate: the fixed Hike compiler bump-allocates source-declared local slots when each declaration executes. Declaring decoder temporaries inside the element loop lets its stack overwrite the host input/output arena beginning at byte 1,048,576. Nested merge-loop declarations have the same class of defect at larger supported shapes.

Scoped source review found the correction justified and limited:

- `tools/lora/kernel/lora.hike` hoists decoder and merge loop state to function entry and explicitly resets each reused value at the same logical point. Factor order, accumulation order, F32 operations, scale application, dtype cases, nonfinite rejection, status values and public ABI are unchanged.
- `LoraAdd` and `LoraCopy` generated implementation WAT are byte-for-byte identical as text after disassembly. Module exports are unchanged and imports remain empty. Fixed decoder/merge WAT initializes the reusable slots before iteration; subsequent stack-pointer writes restore the entry pointer on return rather than allocating element-dependent slots.
- Regenerated WASM is 5,051 bytes with SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`. Source SHA-256 is `42253683a927f5e3b19b118fef2215a8f4c82087374a4c149334c398668a41fa`; both match the new build record and kernel registry. Compiler commit/hash, runtime hash, backend, flags and ABI signatures remain unchanged from the prior build record.
- The regression source tests all 655,360 decoded BF16 and F16 values, including signed/ordinary/subnormal cases, and all 1,048,576 values of a large supported merge. The preserved RED log has 6 passing tests and two failing tests (the combined decode test fails first at BF16 index 0; its F16 arm is therefore not reached in that RED run). The GREEN log has 8 passing and zero failing tests. This reviewer inspected those logs and did not rerun that suite.

Independent fresh verification used raw WASM, stack sentinels and the actual original LoRA `e1-debug/down.bf16` bytes against independently decoded `down.reference.f32`, rather than another synthetic decoder expectation:

| Kernel/call | Compared values | Mismatches | Highest touched reserved stack byte | SP after return |
| --- | ---: | ---: | ---: | ---: |
| Old decode, full down factor | 655,360 | 655,360 | 1,048,575 (arena boundary reached) | 65,536 |
| Fixed decode, first 16 values | 16 | 0 | 65,589 | 65,536 |
| Fixed decode, full down factor | 655,360 | 0 | 65,589 | 65,536 |
| Fixed merge `[16,5120]`, rank 1 | 81,920 | 0 | 65,585 | 65,536 |
| Fixed merge `[1024,1024]`, rank 1 | 1,048,576 | 0 | 65,585 | 65,536 |

Both independent verification commands exited 0. Decode/merge stack footprint stayed constant as the loop workload increased and remained far below the host arena. The raw merge checks used explicit exactly representable values with expected output 1.5; they establish the stack/output regression, not original-model numerical equivalence.

**Disposition: no blocker found in this necessary kernel correction for the HIGH retry.** Commit the new source/WASM/registry/build record, keep the failed HIGH evidence, and retry under a distinct `HIGH-fixed` evidence directory and source commit. The existing gates, reference procedure and peer source stay fixed. A passing real retry is still required before an E1 success claim.

## Actual HIGH-fixed result review

Reviewed `/workspace/work/lora/e1-joint/HIGH-fixed/result.json`, SHA-256 `27e90af150c7e264d8cd661e2cef70819ff9e7620dddb3eb3c5fec50e406fc53`. Its executed LoRA source commit is `4d5fd7363f40f0d743ead448193ef2bf1915bbdc`; peer source stays `438972f30242e0a3bc66edb8591f38eaa0fcd384`. The result is `PASS_DIAGNOSTIC_PARTIAL`, side HIGH, with no browser page errors. LOW was not part of this run and remained pending when this addendum was written.

A fresh independent artifact verification command exited 0. It read and SHA-256/size checked all **39 unique artifacts** referenced by the result/reference records (24 actual weight/bias/scope artifacts and 15 independent reference arrays). It also checked all **28 loaded source records** against their exact Git objects (12 LoRA/browser modules, 16 peer modules), plus the Node runner and Python oracle hashes. The recorded new LoRA WASM is therefore bound to the executed source, not only to a worktree report.

The independent comparison recalculated every error and reproduced each recorded compared count, failed count and maximum error exactly:

| Evidence | Independently checked count | Maximum absolute error |
| --- | ---: | ---: |
| Ten applied weight artifacts | 819,200 values (81,920 each) | `6.122718332335353e-9` |
| Ten applied bias artifacts | 160 values (16 each) | `0` |
| Ten applied projection outputs | 160 values (16 each) | `7.450580596923828e-9` |
| Original base decode | 81,920 weights + 16 bias values | `0`, with exact F32 byte equality |

For each light/detail pair, applied cases are initial strengths `0,1,-1`, `+1` reapplication after base restoration, and `+1` cancellation recovery: five per pair, ten total. All 16 actual outputs and independent expected outputs are retained in each case JSON. Positive-strength weight hashes agree across initial/reapply/recovery calls, so reapplication did not add a delta to an already patched base. Base, weight, bias and projection gates are unchanged; `pre-execution-gates.json` is identical to the preserved failed HIGH trial's gate file.

The verified original acquisition receipt records exact authentic contiguous coverage, a complete sequential hash read of **15,574,833,216 bytes**, and full original SHA-256 `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52`. The runner records the stat-bound original unchanged across the trial. This review verified that existing receipt and coverage rather than repeating the whole-file hash. Native base verification remains correctly labeled header/ranges only; the stronger full-file proof is the separate acquisition receipt.

Scope and provenance checks passed: full shapes are retained, rows `[0,16)` and all 5,120 columns are selected, light excludes 1,050 other patches and detail 399, and remaining selected-target rows are explicitly excluded. Written blocks cover all selected weight elements, with complete light bias coverage, correct runtime/Hike bindings, and per-block hashes matching the actual artifacts. Each detail bias pass-through digest exactly equals immutable base bias bytes, with no bias patch fabricated. Native and v2 registry hashes remain different and each structured receipt retains the proper namespace. Owner IDs bind the actual native candidate; prepared package and candidate history release both occur before the recorded successful active-feed run.

All **19 lifecycle records** were inspected against the committed runner and their available numeric evidence: base restoration for both pairs reproduces all 16 base outputs; cancellation after one actual immutable-base read leaves the active feed unchanged; stale preparation and intentionally wrong validation reject; cooperative consumer cancellation rejects and recovery reapplies successfully; cancellation after native commit restores the prior owned feed with all 16 outputs exactly retained; missing/duplicate/checksum/binding failures reject with the expected native error codes. Two attempted v1 uses reject the diagnostic v2 registry schema. The stronger refusal of valid v1 adapters to accept PARTIAL/renamed runtime bindings remains covered by the earlier contract tests; this real HIGH run does not relabel them.

**Precise lifecycle coverage limit:** HIGH's `old-rollback-new-epoch` record prepares two base candidates, validates both, commits the second and rolls back the older **uncommitted** first candidate. Its `restored:false` result and all 16 base outputs were independently checked. This demonstrates that an older prepared candidate does not disturb the newer feed. The distinct older **already committed** candidate versus newer epoch scenario was verified in earlier scoped contract checks; it should not be described as a real HIGH scenario on the strength of this record alone. Root was notified before publication.

**Disposition: the saved HIGH evidence supports a real-original HIGH PARTIAL diagnostic pass for the declared strengths and activation.** No fake original model, FULL adapter, full-model inference, generation readiness, common snapshot, lease support or production GPU precision claim is present. This is not yet a two-side E1 result: LOW evidence and its review remain outstanding.

## Actual LOW-fixed result review and two-side disposition

Reviewed `/workspace/work/lora/e1-joint/LOW-fixed/result.json`, SHA-256 `236289c32d10c39a4180f95a01c9b417c14abd7443ead4be3363520c92870e6a`. Executed LoRA source commit is `e1f03a4f6092c3154d5b47f166b77bbd32897ac9`; peer remains `438972f30242e0a3bc66edb8591f38eaa0fcd384`. The result is `PASS_DIAGNOSTIC_PARTIAL`, side LOW, with ten applied cases and no browser page errors.

The prior LOW run is preserved as `/workspace/work/lora/e1-joint/LOW-stale-test/result.json`, SHA-256 `6afc82bc06b20c33a705889da44fe66c903b16cc798d730861ef1d6569d78e18`, source `bbfeaedd5e4307e41210a1e5723e6e63243e64f7`. It completed ten numerical cases, then correctly failed the native stale-candidate guard because the stronger test had prepared both candidates before committing the first. The corrected runner prepares, validates and commits candidate one **before** preparing candidate two, then validates/commits two and attempts rollback of one. No native guard was bypassed. Git comparison confirms SDK, adapter, kernel and Python oracle are unchanged from the passing HIGH source; the sequence correction is in the test runner.

A fresh independent LOW verification command exited 0. It re-read and hash/size checked all **39 unique actual/reference artifacts**, and verified all **28 loaded source records** against their exact Git objects, plus Node runner and Python oracle hashes. It recomputed native runtime-feed package hashes from the actual complete weight/bias artifacts for every applied case and matched each native validation receipt. Every selected comparison and recorded maximum error was independently reproduced:

| LOW evidence | Independently checked count | Maximum absolute error |
| --- | ---: | ---: |
| Ten applied weight artifacts | 819,200 values (81,920 each) | `3.723471309058368e-9` |
| Ten applied bias artifacts | 160 values (16 each) | `0` |
| Ten applied projection outputs | 160 values (16 each) | `7.450580596923828e-9` |
| Original base decode | 81,920 weights + 16 bias values | `0`, with exact F32 byte equality |

LOW again covers initial strengths `0,1,-1`, positive reapplication and positive cancellation recovery for both light and detail. All 16 actual/expected outputs exist and are finite in every case; all selected weight/bias arrays are complete and hash-verified. Positive initial/reapply/recovery weight hashes match within each pair. The pre-execution gate file is byte-identical to passing HIGH, failed HIGH and stale-test LOW: no tolerance, strength or activation adjustment was used to obtain this pass.

The LOW acquisition receipt records full authentic contiguous coverage and a complete sequential hash read of **15,574,833,216 bytes**, matching original SHA-256 `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`; the runner records its stat-bound input unchanged across execution. The receipt and coverage were verified without a repeated full-model hash or new inventory. LOW LoRA source hashes remain distinct from HIGH: light `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b`, detail `d6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db`.

All 19 LOW lifecycle records were checked, including the same restore/cancel/recovery/late-commit rollback/native sink failures and actual v1 schema refusals described for HIGH. Detail bias pass-through matches the immutable base bias digest; block coverage/hashes, bindings, original/full versus selected dimensions, excluded patches/rows, scoped native/v2 receipt identities and independent-copy release evidence are consistent. The corrected stronger record is `old-committed-rollback-new-epoch`: both native commits report committed PARTIAL scopes and advance epochs **17 → 18**, old rollback reports **`restored:false`**, and all 16 resulting base outputs pass the unchanged gate.

**Coverage distinction retained:** that older already-committed candidate scenario was executed with actual LOW data. HIGH's actual trial only exercised rollback of an older prepared uncommitted candidate; HIGH must not be relabeled as having run the stronger scenario. Earlier contract checks covered the shared candidate/epoch behavior independently as described above.

**Final scoped disposition:** independently checked saved evidence supports real-original HIGH and LOW **PARTIAL diagnostic** passes for light/detail at the declared `0,+1,-1` strengths and fixed activation, including restore/reapply and cancellation recovery. No numerical or source-evidence blocker remains in these reviewed results. This finding does not certify full LoRA adapter coverage, full-model inference, generation, wider strength ranges, production GPU precision, management snapshots, SDK detach or lease support. Public result/reproduction documents must preserve both prior failures, exact per-run source identities and the HIGH/LOW lifecycle coverage distinction.
