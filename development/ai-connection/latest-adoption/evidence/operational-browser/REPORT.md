# Fixed-source operational UI validation

- Status: **PASS, 14/14 cases**
- Source commit: `f084790d7f594915c869ef375fcbdc6e44ee56f3`
- `fixedSourceVerified:true`, all served source bytes match that commit
- `result.json`: 228620 bytes; SHA-256 `cbfe593897ec64e6d4a9383919780ba7324239fd25a154882eaa3e325e7610d7`
- 1043 requests, all GET; 235 exact-commit source files
- 9 Workers created; all 9 physically closed before browser teardown
- Source/page/console errors: 0/0/0
- Environment: Chromium154.0.8037.57, Node24.19.0, Linux6.18.57 x86_64/glibc2.41; COI false
- Default 1 thread; explicit 4-thread selection without COI rejected without fallback

The new saved workspace uses only `works:wktensor`, version `WKTSR001/schemaVersion1`, source `20f640a6e071b6c060a212e89b28f0c8965923f7`, `docs/shared/inference/tensor.mjs`. Text's default source-ordered-fp32 manifest and separately selected-compatible-manifest mode both remain available.

Normal P4's actual native capability query returned dispatchSupported:true for canonical three-input tensors and mask totaling **8,450,560 logical payload bytes**, with the UI's explicit editable **16,777,216-byte** allowance. The allowance excludes copies, model/ORT/workspaces/host and total RAM. The query did not prepare a native neural owner.

All existing File/codec/mean-Hike/Worker/cancel/retry/workspace cases passed against the fixed commit. Status fields remain fullImplementationComplete:true, implementationReview:PASSED, missingCodePaths:[], managedNumericalAcceptance:AWAITING_HOLDER_RECEIPT, wholeOperationalExperiment:NOT_RUN and generationReady:false.

No source edits, broad Node rerun, actual model pair load, neural execution, generated sample, experimental LoRA receipt or whole experiment occurred. The checkout remained clean after the run. Private artifacts only; root may copy these receipts into B.

Command:

```sh
node tools/ai-connection/run-operational-browser.mjs --manager-commit f084790d7f594915c869ef375fcbdc6e44ee56f3 --out /workspace/work/ai-connection/adoption-r18/operational-browser-fixed-f084790
```
