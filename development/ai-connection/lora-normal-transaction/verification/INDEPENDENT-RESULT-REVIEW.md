# Independent review of the stored normal-transaction result

**Decision: PASS within the recorded PARTIAL scope. No blocking discrepancy found.**

Reviewed on 2026-11-02. This is an independent review of saved bytes and fixed source objects, not a new runtime execution or live admission. The saved result is `real-run1/result.json`, status `PASS_LORA_NORMAL_REAL_PARTIAL`, 4,372,691 bytes, SHA-256 `171ba22e96753df6a90ab76d75c10eee1674c8561b9f1bc3e95c84324097248f`.

The fresh review verifier completed **811 assertions**, exit 0. It checked Git object identities, file boundaries and hashes, receipt and queue consistency, numerical summaries recomputed from saved arrays, lifecycle evidence, and scope flags. I did not read original LoRA/base safetensors, unpatched base-weight arrays, rerun an NN, generate new expectations, modify implementation files, or commit. Selected actual and independently expected patched weight/bias arrays were used privately for comparisons; no arrays are reproduced here.

## Source and artifact identity

All 47 `loadedSources` entries were independently matched to the exact fixed Git object for their owner: path, byte count, SHA-256, and Git blob SHA. Their current checkout file bytes also equal those objects. The owner counts are receiver 2, LoRA 12, Diffusion 32, manager 1. `preverifiedSources` equals `loadedSources`; all nine `sourcePins` match corresponding loaded records. The runner hash matches its fixed source record.

| Owner | Fixed commit |
| --- | --- |
| Receiver and LoRA | `126614a8cf99b6c80243595309ae0e6e704d780f` |
| Native Diffusion | `48ff155988d995fc2569e495c8d8820273bd472c` |
| Manager queue | `8849891f19124df31847bd691503c2491278eaa8` |

All 12 `selectedArtifacts` are regular files whose resolved paths remain inside `real-run1/actual`; the directory contains exactly those 12 files. Their saved byte counts and SHA-256 values match the result and each numerical-comparison descriptor. The five weight files are 81,920 bytes each, five bias files 16 bytes each, and two output files 40,960 bytes each. Each full selected weight/bias block's actual file hash also matches its prepared-write hash and count. Positive reapplication and both positive recovery applications have the same weight and bias bytes as `initial-one`, consistent with no accumulation.

The previously generated oracle manifest is exactly 21,434 bytes with SHA-256 `04e643dfddf37337c44d210d20c44b9eefe0d2328efbc7833a0903d59c0167ef`. Its generator commit is `a80db72feea60b9bd69e292e4716665c6f0ee77f`; peer core/plan commit is `7ee36228030ba3bb544a90b1d4b528702a7bae32`. All three recorded oracle-generation source hashes match those historical Git objects. The result's execution-source, selection, gates, and 25 manifest file descriptors match the fixed manifest. Files used in independent numerical recomputation were read and hashed against that manifest; unused oracle payloads were not re-read.

## Ordinary admission remains separate from numerical diagnostics

Fixed source inspection confirms the intended split:

- Native `weights.mjs:116` performs identity/current-epoch and structural admission, covering target/full shape, declared and complete ranges, retained finite F32 blocks, package completeness, and immutable-base preservation. Commit requires admission at the current epoch. `diagnose` is a separate method.
- Adapter `diffusion-p4-adapter.mjs:109` calls native `validate` with the native identity/current context. In explicit `normal` mode it returns the admission receipt without calling `diagnose`. `normalOptions` rejects forward input, independent expected values, numerical reference/gate options, and extra fields.
- SDK `sdk-v2.mjs:80` carries the explicitly requested SDK mode and checks validation/commit mode agreement. The adapter translates this into the native schema; it does not forward `validationMode` to native admission.

The seven stored normal validator calls contain exactly `executionProfileId`, `graphHash`, `isCurrent`, `modelHash`, `registryHash`, `scope`, `side`, and `signal`. They contain no expected value, numerical gate, forward input, runtime callback, or native `validationMode`. The runtime-call count is unchanged across every call; native diagnose counts remain zero. This includes the validation-call cancellation and immutable-base restore. Six calls occur before any separate diagnostic run; restore occurs after one diagnostic and does not add a run.

All ordinary native receipts use `bernini-p4-f32-feed-admission/0.1`, declare `numericalComparison:false`, `modelInference:false`, and `generationReady:false`, and omit native mode and diagnostic/reference fields. The SDK results retain `validationMode:'normal'` and PARTIAL coverage. The native receipt's structural `gateId` is an owner admission identifier, not a caller-supplied numerical comparison gate.

There are exactly five completed patched transactions: strengths `+1, -1, +1, +1, +1`, native epochs 1–5. Each admission reports two blocks/two declared patch ranges and 81,936 patch bytes; its admission epoch is the epoch immediately before its commit. Queue targets, manager revisions, resource generation/owner binding, and SDK revision tuples agree with the saved transactions. All receipts preserve `independent-copy` ownership and `snapshotPublished:false`.

## Independently recomputed numerical comparisons

These checks use saved actual arrays and the existing pinned oracle only. They run after normal commit in the fixed harness and never supply values to ordinary admission. The criterion is `abs(actual - expected) <= absolute + relative * abs(expected)` for every value, with non-finite errors counted as failures.

| Completed transaction | Weight values / failures | Weight maximum absolute error | Bias values / failures | Bias maximum absolute error |
| --- | --- | --- | --- | --- |
| `initial-one` | 20,480 / 0 | `2.4756445782259107e-09` | 4 / 0 | 0 |
| `strength-negative` | 20,480 / 0 | `2.4756445782259107e-09` | 4 / 0 | 0 |
| `reapply-one` | 20,480 / 0 | `2.4756445782259107e-09` | 4 / 0 | 0 |
| `prepare-cancel-recovery` | 20,480 / 0 | `2.4756445782259107e-09` | 4 / 0 | 0 |
| `validation-cancel-recovery` | 20,480 / 0 | `2.4756445782259107e-09` | 4 / 0 | 0 |

The fixed weight gate is absolute `1e-5`, relative `1e-4`; bias gate is exact (`0`, `0`). Actual F32 weights were compared against the independent F64 weights for the matching strength; biases were compared as F32. The recomputed counts, failures, maxima, gates, pass fields, descriptor hashes, and prepared-write hashes equal the saved reports: 102,400 weight values and 20 bias values, zero failures.

Exactly two separately diagnosed forward calls exist, both completed and disposed. Their outputs independently reproduce the stored numerical summaries:

| Output | Values / failures | Maximum absolute error | Actual SHA-256 |
| --- | --- | --- | --- |
| `normal-applied-after-release` | 10,240 / 0 | `3.2186508178710938e-06` | `381525046e0eb5276a8e350b19b08b01ffe217f2ec4e651cdedf5f2d6abb9784` |
| `normal-restored-base` | 10,240 / 0 | `6.079673767089844e-06` | `3e60f8d1fc36d583b661e0170726b68ebff8055c95f01b472ef47fde14201f6b` |

Both use the unchanged predeclared composed-output gate: absolute `0.01`, relative `0.001`, ID `p4-cross-ffn-composed-f32-v1`. Their expected files are the historical strength +1 and 0 outputs, respectively. Output artifact hashes also equal `evidence.outputHashes.blockOutputSHA256`.

The applied diagnostic runs at native epoch 5 on the last committed package, after prepared-package release and after the local LoRA File capability is revoked. Its two operator-consumption records match the actual prepared weight/bias hashes, coordinates, package hash, and epoch; the native parameter-source tile/vector patch evidence contains those same block records. The base diagnostic runs at epoch 6 on the immutable-base package, after normal base restoration, with no patch-consumption claim. Each diagnostic compares 10,240 saved output values to its pinned oracle output; no forward computation was repeated for this review.

## Lifetime, cancellation, recovery, and cleanup

The saved control evidence and fixed source support all requested lifetime checks:

- An old positive patched read lease at epoch 1 retains the exact 81,920-byte weight and 16-byte bias after epoch 2 commits. At the deliberately retained point, the stats show one read lease and two deduplicated patch sets; subsequent release/finalization returns the retained count to the active set.
- Rolling back the old positive candidate after the negative commit returns `restored:false`, epoch 2, and preserves the newer active package. Ordinary subsequent commits release prepared packages and candidates; only the intentionally retained first candidate remains during the first two snapshots.
- Prepare cancellation (manager revision 4004) and validation-call cancellation (4006) reject results as `INVOCATION_CANCELLED`. Both acknowledge stop, reach original terminal, release resources, permit reuse, and avoid quarantine. Their epoch/package hashes remain those of the preceding successful commit, with no transactions, packages, candidates, leases, pending bytes, or in-flight work left. Successful applications at 4005 and 4007 verify recovery.
- The eight queue invocations cover five patch commits, two cancellations, and base restore. All reach original terminal, calculation stopped, resource released, and reusable. The two cancelled entries reject/unaccept their results; the six completed entries accept fulfilled results. The queue has no active invocation, queued item, or quarantine at the recorded drain point.
- Native sink `writeBlock` copies caller F32 bytes into private storage and checks the copied-byte hash. Package/candidate/active state retain those private blocks; `prepareLoad` copies block metadata, not another numeric array. The private-copy contract is distinct from the explicitly exercised internal read lease. Prepared packages can therefore be released while the active committed patch remains usable.
- Local LoRA File capability release is recorded before both diagnostics; the SDK and immutable base owner remain live. The owner guard requires an explicit live owner, actual `source.stats().disposed === false`, and equality with the initial source descriptor. It is current before transactions and after the unpatched-base diagnostic, then false after final disposal. Native admission is explicitly not presented as independent source-lifetime proof.
- Normal immutable-base restoration admits zero blocks/ranges/bytes at epoch 5 and commits epoch 6, without another diagnostic run. Patch, package, candidate, read-lease, pending, and in-flight resource counts are zero after restore.
- Final cleanup records queue drain/disposal, SDK disposal, feed disposal, and source disposal. The feed is disposed at epoch 7, with no active package, patch bytes/buffers, pending bytes, transaction, package, candidate, lease, or in-flight operation. Both diagnostic runtimes are disposed with no active ORT sessions. Page/server/cleanup error arrays and private input HTTP request arrays are empty.

## Exact verified scope and limits

The evidence supports the lighter ordinary apply/restore transaction path for the selected `light` LOW source and bounded block-0 cross-attention Q weight/bias ranges: weight rows `[0,4)`, all 5,120 columns, and four bias entries. Two logical patches are included; 1,050 other logical targets and all unselected regions remain outside this application scope. The controlled output diagnostics use historical caller-supplied N2/K4 inputs.

Every checked full-model/generation/producer/management-adoption flag is false, including nested receipts and diagnostic evidence: `completeAdapter`, `modelInference`, `generationReady`, snapshot publication, `managementProfileAccepted`, `managementP4NormAdoption`, producer authentication, natural P2/N2 acceptance, full-block verification, and production-input/precision verification. This does not establish full-model LoRA integration, generation readiness, authenticated natural N2, training-base identity, or new management P4-norm adoption. The unsupported-source/target/full-shape/range/model probes all reject with bounded reason codes.

The recorded browser receipt reports a newly verified selected LoRA whole hash. For base reuse, I additionally inspected only the historical `LOW-acquisition-receipt.json` metadata (SHA-256 `4869d4fc9c20baa4f8b6b9299865729c9f64e68960eff811d9c09d02eda44242`) and current file stat. That receipt is `COMPLETE_VERIFIED`, `fullFileVerified:true`, has exact complete coverage and a prior sequential full-hash read of 15,574,833,216 bytes, and records matching expected/observed/actual/verified SHA-256 `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`. Its four-field stat is size `15574833216`, mtimeNs `1793409826164002004`, dev `27`, ino `394064`; all four fields equal the current `os.stat`, the run's retained stat, and its before-run stat. Combined with saved `baseFileUnchanged:true` for the run's before/after identity, this supports reusing that historical whole-base receipt without another content read or hash. This remains evidence reuse bound by metadata, not a new cryptographic content check. Native source evidence alone remains fresh header/selected-range evidence; the fresh descriptor explicitly says the whole-base hash was not reauthenticated. No original/base payload was read or hashed for this review.

The 1,063,436,288-byte host/owned-Chromium sampled RSS sum is labelled `PARTIAL_SAMPLED_OBSERVATION`, with one incomplete sample and two `VmRSS unavailable` observations. It is not an OS/device or whole-pipeline peak and does not change the numerical/transaction review decision.
