# N2 tail owner return: independent scope and acceptance audit

Event `n2-r8-owner-return-1`, 2026-11-01 UTC. Read-only audit of acceptance scope and the two metadata exceptions; no implementation, numerical recomputation, broad rerun, additional auditor or external communication was performed. Only this report is written. The independent source/evidence agents own full record-by-record source and evidence reconciliation; this audit does not replace their detailed reports.

## Authority and raw evidence

User requests management Step 3 reconciliation and acceptance of the Diffusion return at `508d72cc9036e7f500827465c644b4aed3c5f711`. The accepted execution identity remains management `5c484a8783ab129a2ff3543a98b2537af9888199` plus Diffusion execution `a49aac492cc68e2dd6037e0deb4a6954731a847a`, with prior Diffusion distribution `beffdcb800b629d0b13ff43bbc90e9f74c659152`, management handoff `055903abd667535e189ef50eb7dd70a0229a7efe`, and profile `bernini-block0-n2-self-attention-residual-f32-v1`.

Directly read owner packet RESULT.md, handoff.json, raw result.json, execution-context.json, attention-binding-supplement.json, verification.json, readback-audit.json and both manifests; also read relevant original fixed management runner/adapter Git source. Rechecked all 11 files indexed by handoff: exact SHA-256 and byte lengths. The raw result is 3,007,028 bytes / SHA-256 `2d1e4a2205764a251af1357152c37d1fb11153d98bf5ba426d4257f3c0c4c859`; this report does not edit or normalize those bytes.

Applied the existing audit-agent-work procedure. The current user's remote execution/return/reconciliation sequence supersedes the prior expectation of local private-asset availability as the only possible evidence path. Management can accept an authenticated remote execution return while explicitly retaining non-receipt of private payloads locally.

## Metadata exception judgments

| ID | Decision | Bounds and evidence |
| --- | --- | --- |
| R1 | PROCEED for source receipt intake with explicit exception | All 15 publicReceiptProof record-level path/sha256/byteLength values independently match exact a49 Git bytes. All 15 nested sourceRef.sha256 values instead carry the stage.mjs SHA. The fixed 5c runner constructs sourceRef by spreading N2_TAIL_SOURCE and replacing only path (line55); source verification and serving use each record's direct sha256, not this nested field. Reject interpreting the nested stale field as receipt-content identity. Record the malformed historical metadata and the authoritative direct field explicitly. This does not alter the executed source or math. |
| R2 | PROCEED for fixed attention input binding with separate supplement | The fixed runner projects public JSON only after execution (line115); its broad attention-key omission at line82 removes trustedInputs.attention metadata as well as actual arrays. Before that projection, fixed adapter line111 compares the full native trustedInputs plus actual input hashes. Independently checked each supplement attentionBinding against the exact a49 public export receipt inputBindings.attention: identical. For each side, returned attentionArtifact asset SHA equals that binding's artifactSHA256 and returned actual input F32 SHA equals contextSHA256. Treat the supplement as separately authenticated expected-binding metadata connected to actual run hashes; do not claim that the missing actual runtime JSON body was recovered. No new private activation is inferred or acquired. |
| R3 | PROCEED for preserving old execution attribution | A prospective metadata fix belongs to a new management commit and future receipts. The historical actual run remains 5c484/a49. Keep raw result/manifests and all original hashes unchanged; any corrected intake view must have its own identity and describe its field precedence/supplement. A repaired runner must not be described as the source of this already completed run. |

Neither exception changes the fixed input bits, owner implementation, predeclared gates, output bits, E4 writer/reader or queue phase. Their correction does not require repeating model hashing, prefix/attention/reference construction or the numerical run. Full management/native source record reconciliation remains required in Step 3 and is being independently checked by the assigned source reviewer.

## Bounded acceptance decisions

| Edge | Decision | What this return supports |
| --- | --- | --- |
| Fixed HIGH1 and LOW3 numerical path | PROCEED to management acceptance on authenticated owner-run evidence | Separately checked each side's eight comparison records: 71,680 values, zero failed, seven parameter comparisons, gates exactly equal the fixed a49 candidate plan, expected HIGH1/LOW3 side/block0/N2 scope and norm phase published. Actual callback target, three input hashes and five-output binding agree across validation/native/publication records. This accepts the returned remote run, not a local numerical rerun. |
| Actual five-output storage in the holding environment | PROCEED to scoped acceptance on returned execution/readback evidence | Both returned manifest bytes hash to their packageReceipt identities. Five names, shapes, LC/C layouts and hidden meanings align between result outputBinding, validation outputBinding and publication arraysBinding. Additional owner readback audit reports 32 actual disk reads per side, five outputs, matching F32 hashes and copy ownership, no issues. These are owner-environment readback receipts; management did not locally read the private E4 payloads. |
| Prior saved-output replay files | PROCEED as separate HASH_VERIFIED receipt | Two sides verified, numericalAcceptanceRerun=false. This receipt is not used instead of the fresh eight-comparison run. |
| Natural completion, terminal and release | PROCEED for the observed success path | Each queue invocation is completed/fulfilled with originalTerminal=true, resourceReleased=true, reusable=true, resultAccepted=true, no active/queued invocation or quarantine. stopAcknowledged=false is consistent with natural completion. snapshotPublished=false remains preserved. |
| Cancellation/recovery under real retained assets | UNVERIFIED by this return | The successful run did not exercise cancel or recover. Existing prior controlled lifecycle evidence remains in its original scope; this return does not expand it. |
| Local private model/activation/reference/E4 payload receipt | UNVERIFIED / not performed | Public packet and manifests do not imply payload acquisition into this management environment. Keep private data in the holding environment. No local content comparison or local reread of those private payloads is claimed. |
| Full model hash and full resource budget | UNVERIFIED / unchanged scope | Existing full model identity receipts were reused; actual size/bounded header and selected parameters were checked. No full31GB hash recomputation. Native/observed ORT memory and total peak stay null; 16MiB is a declared diagnostic capacity. Cumulative copies are not resident RAM. |
| Production, whole block, HIGH→LOW and arbitrary inputs/LoRA | UNVERIFIED / unaccepted | No expansion beyond fixed block0 N2 O→chunk2 gate→original patchHidden residual. generationReady=false and load/predict/sample=NOT_READY remain required. |

HIGH residual F32 SHA is `72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9`; LOW is `0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6`. HIGH manifest SHA is `d87c1a36270d40a57c218a1bc2eaf2bc6fac5f6ad01e66dc304a76a180bbeaa7`; LOW is `346a6c580f56ff91a25e504b25bc21fb0ecdb147f95237bdb561d7a7fea4fa75`.

## Recommendation

Proceed with the authorized management acceptance record and existing branch/Draft PR publication after incorporating the independent detailed source/evidence checks. Record these two metadata notices and exact authoritative field/supplement bindings, keep historical and repaired runner commits distinct, and preserve all raw packet bytes. No blanket hold, numerical rerun, private payload transfer, full-prefix/model/reference recomputation, new mapping, broad regression loop or user approval is required by this audit.

The relevant remaining UNVERIFIED edges are independent limits, not reasons to withhold this explicitly scoped remote-run acceptance. This audit found no confirmed objective or procedure deviation in accepting that bounded result. The metadata defects were already disclosed by the producer and identified by root; independent prevention effectiveness of this audit is not established.

## Final prospective-writer and regression review: `n2-r8-final-1`

**PROCEED.** Directly read commit `05c684f793e3f5525f3e2afea5d7d278f1ddc5ed` and its complete three-file diff (API documentation, runner, runner tests). This is a prospective metadata correction, separate from the executed management source `5c484a8783ab129a2ff3543a98b2537af9888199` used in the owner return. It changes no native source, fixed input pin, owner gate, mathematical operation, adapter or persistence engine, and the API text expressly preserves this historical distinction.

The writer now assigns each public receipt's nested SHA from that record's own verified pin. Its new attention exception requires the containing key to be trustedInputs, an explicit HIGH/LOW side, exactly five own hash keys, lowercase64-hex strings, and equality to that same side's immutable public pins. The recursion does not carry this trust context into unrelated objects or array elements. Thus it preserves only already-public pinned hash metadata; actual attention arrays/typed arrays, extra or missing fields, wrong hashes/sides and attention outside trustedInputs remain omitted. The new test diff covers both sides and these privacy regressions. No additional private data is authorized by the exception.

Read the detailed source and evidence reconciliation reports. They record 158 source identity checks and 862 metadata/hash/contract comparisons respectively; those counts are reconciliation records, not additional native runs or tests. Their bounded conclusions match this audit: exact historical 5c484/a49 identity, two disclosed public metadata exceptions, separate saved-output hash receipt, five-output remote E4 acceptance, natural-completion release, and no local private-payload receipt or production expansion.

Directly read `/tmp/n2-r8-node-tests.log`: **459 tests, 459 pass, 0 fail, 0 skip**. Independently rehashed all104 entries in `/tmp/n2-r8-frozen-sources.json`: zero mismatches; manifest SHA-256 `a5bb4a3fcb8e00225a46bfa7647256114a51b9b6610a2b6865668dd25d49c701`. No new tests or private numerical runs were requested or performed by this audit. Rechecked all11 indexed raw owner-packet files: their original hash/length identities remain unchanged.

No new HOLD is introduced. Proceed with the limited management acceptance record and authorized existing branch/Draft PR publication. Keep future writer commit05c684, historical executed manager5c484, nativea49, owner return508d72c and acceptance-document commit in distinct identity fields. The earlier UNVERIFIED limits remain: real cancellation/recovery faults in this run, local private payload acquisition/decode, full-model hashing, current independent ORT/total peak observation, and production/full-pipeline acceptance.

Final reviewed prospective-writer identities:

- `tools/ai-connection/run-norm-required-n2-tail.mjs`: SHA-256 `0ef80822920863e03685fa982a98e6e53b3588311d5a520ae4914349eba03db7`, 24811 bytes.
- `tools/ai-connection/test-run-norm-required-n2-tail.mjs`: SHA-256 `ca81f1ca37416161a6ff9710138f13eb891b40449f7248ebabd6d617ff79f227`, 9933 bytes.
- `docs/shared/ai-connection/API.md`: SHA-256 `3b4751190ef485da53d838af75143f7c1f3568c945fefdbd973ae61bbd479619`, 58123 bytes.
