# Fixed f084790 Chromium weight-port ownership verification

**PASS** against source A `f084790d7f594915c869ef375fcbdc6e44ee56f3`. No runtime source edits, commits, or broad test runs.

Scope: Chromium 154, actual adopted native factory host relay and native weight client/server, actual browser Workers executing a **synthetic model/weight provider**. No real model files were loaded and no neural network or LoRA arithmetic was executed.

## Frozen source proof

- Before inventory SHA-256: `eb29e8bb823c8d81cb58007fb2903fa2b3c654d79616c695c8f02a70212bd80b`
- After inventory SHA-256: `eb29e8bb823c8d81cb58007fb2903fa2b3c654d79616c695c8f02a70212bd80b`
- 498 tracked files, 58,808,272 bytes, all equal committed bytes before and after.
- Source inventory covers all tracked `docs/shared/ai-connection` files plus `docs/shared/ft/vendor/fflate.mjs`.
- Browser HTTP source replies came from the captured before-byte snapshot: 177 unique files / 220 requests; no denied paths.
- Git status was clean before and after.
- Harness SHA-256: `0046d20f03e4919ba10150f12b141880abc84723c777d3a9c0794745effecbdb`
- Runner SHA-256: `04654038437185ba1b16442c020b12568ae452415f0e6cc482525dc818dd0d29`

`source-before.json`, `source-after.json`, `source-proof.json`, and `served-sources.json` contain the detailed evidence. `artifact-hashes.json` records output hashes.

## Cases

1. Native factory cancel terminates the actual owned Worker, original request reaches terminal, failed host package release remains retained, and exact-ID retry succeeds. Reload/new feed survives an old feed close.
2. Targeted cancellation during an explicitly delayed native-client MessageChannel handshake settles as `INVOCATION_CANCELLED`, confirms `originalTerminal`, and preserves the healthy loaded model.
3. Ordinary local managed close uses the native graceful close protocol and settles.
4. Failed local close revokes cached facade authority immediately. `prepareLoad`, `validate`, `commit`, and `readBlock` each reject `DIFFUSION_WEIGHT_FEED_STALE`; retained native capability cleanup succeeds on retry.
5. Wrong reply identity, wrong side, and stale model binding each notify the remote native server through the actual factory relay. Each Worker receipt is matched by exact session ID and job ID and reports `serverClosed:true`. Each case then permits a valid replacement feed.
6. Native unload succeeds separately from persistent host package cleanup. Result flags retained cleanup, reload is blocked by `DIFFUSION_WEIGHT_FEED_CLEANUP_REQUIRED`, and exact retained-ID retry releases the fence and permits reload.
7. Separate expected native contract limit: a raw, unannounced browser-local MessagePort.close does not acknowledge native RPC disposal (bounded 200 ms probe). Managed paths use the explicit native terminal protocol. This is labeled `expectedContractLimit` in the receipt.

All supported managed cases passed. The expected raw-close contract limit was observed separately, as specified.

## Physical Worker lifetime across the complete trace

Before closing Chromium:

- Playwright: 10 Workers created, 10 Worker close events, zero live.
- CDP: 10 Worker targets created, 10 TargetDestroyed events, zero live.

`worker-trace.json` records each physical creation/close and CDP target event. Browser shutdown was not used to satisfy these counts.

## Reproduction

`python3 /workspace/work/ai-connection/adoption-r18/weight-port-browser-fixed-f084790/run.py`

The runner asserts HEAD equals the source A commit and requires tracked runtime bytes to match it. It reads sources into a frozen server snapshot before launching Chromium and re-hashes the live source inventory afterward.

An initial private harness attempt passed every ownership case and Worker lifetime check but marked the aggregate result false because Chromium requested an unconfigured favicon. That result is preserved as `first-attempt-favicon404.json`. The private HTML gained a data-URI favicon, then the entire frozen-source run was repeated. No runtime source changed in either attempt.
