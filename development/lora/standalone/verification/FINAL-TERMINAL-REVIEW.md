# Final terminal acceptance review

**Spec compliance: approved for the declared standalone LoRA L1–L4 domain. Quality: approved; no important or blocking finding remains from this review.** The formerly pending numerical and lifecycle work now has terminal evidence. The earlier cancellation finding remains resolved in R2. This report supersedes earlier pending-evidence statements without editing those historical reports.

Reviewed 2026-11-02 UTC, using raw `full-run-1` and `lifecycle-run-1` root/side/config reports, `verified-final-1/{summary,lifecycle-match,domain-closure}.json`, the canonical mapping/assets metadata, Git objects, and the postprocessor source. This was report/source-metadata validation only: no tensor calculations, inference, original/saved payload reads, job reruns, source edits or commits.

## Terminal numerical and domain evidence

- R1 is terminal `PASS`, `FULL`, non-pilot, with both workers exiting zero. Its 18 independent cases cover **255,748,547,328 elements** / **1,022,994,189,312 F32 bytes** / **370,404 blocks**, with zero gate failures and zero incomplete targets. Produced and compared counts agree. Both comparison queues are fully drained.
- Independently joined all **2,904 logical patches** / **5,314 source tensors** to the four actual whole-source captures, saved-cohort captures, source lengths/hashes, and independent target/shape fingerprints. Every mapped original tensor occurs once, payload extents cover each source without gaps/overlaps, full-row selections retain the original shapes, and no target/region is excluded.
- Light contributes 1,052 patches and 14,286,919,744 elements per side; detail contributes 400 patches and 14,050,918,400 elements per side. The separate-source domain is 56,675,676,288 elements / 226,702,705,152 F32 bytes. These domain sizes are distinct from the larger repeated-comparison execution volume.
- Per side, R1 independently compares light and detail individually at 0/+1/−1, the ordered compositions (+1,+1) and (+1,−1), and restored base across every prior light target. Original source data are BF16; F16/F32 coverage remains the separate component evidence.

The independent NumPy oracle uses binary64 products and ordered per-source F32 output rounding. Fixed per-element gates are `abs(error) <= 1e-5 + 1e-4 * abs(expected)` for weights and exact equality for additive bias. Observed maximum absolute difference is **1.4901161193847656e-8**; maximum reported relative difference is 13 near zero. Thus the result is zero failing comparisons under the fixed gates. It does not claim zero numerical error or bitwise equality to the binary64 reference.

## Sequential lifecycle and exact output reuse

R2 completed six sequential transactions on one consumer per side: fresh saved-both stage → remove detail → reapply light → reinstate detail → remove light → restore base. Consumer epochs advance 0→6. The raw report correctly remains immutable as `CONTROL_PASS_REFERENCE_PENDING` / `PENDING`; the separate terminal `lifecycle-match.json` establishes `PASS` / `MATCHED`.

All **12 lifecycle streams** match the corresponding independently accepted R1 **actual F32 output hashes**, full target-set hashes, traversal hashes, block counts and element counts. This covers **170,971,034,240 elements**, including complete prior-light restored-base readbacks. Normal admission itself covers 142,397,194,752 elements because an empty base composition selects zero patch elements.

Removing light also receives a separate independent base check over the 652 light-only targets / 236,001,344 elements per side: **472,002,688 additional elements**, terminal oracle PASS, zero failures, and equal actual/expected hashes. Those explicit subsets correctly retain `PARTIAL` relative to the complete source domain; every requested subset coordinate is complete.

Each actual-source cancellation stops after one 5,120-element tile, preserves its current consumer epoch and active package, and reaches recovered terminal state. Creator-release checks retain readable detail-active package leases after SDK/source/kernel creator release and later base publication. They are lifetime evidence, distinct from the complete stream comparisons above.

All raw R1 and R2 terminal cleanup receipts show released SDK registrations/prepared packages, consumer candidates/active/read leases, source references, kernel leases/memory, cache entries/pending work, and comparison work; no cleanup errors remain. R1 durable saves write the actual 1,857,658,608 source bytes per side before manifest publication and fresh SDK reopen. Full-column head/tail readback and independent leases survive creator disposal. These are tracked-resource terminal results, not an assertion that OS/GC process memory becomes zero.

## Fixed source identities and readback adaptation

R1 numerical execution remains attributed to **`4a3419c768e2b4b38b081314abe2cfaaeed6b14b`** with 17 recorded runtime files. R2 lifecycle execution remains attributed to **`986b66b3dd54ef26d98f99a1db92a2933f3e31aa`** with 18 recorded files. Independently checked both closures against Git, root versus side/config reports, and the summary's closure hashes. The shared closure changes only `owned-package.mjs`; R2 adds `standalone-lifecycle.mjs`. The earlier reviewed package change concerns cancellation/cache terminal ownership and retains the arithmetic expressions. R2 value preservation is now supported by the exact lifecycle stream matches, not an identical-source claim or a relabelled R1 run.

The Node Git-read limitation was reported by the root; this review did not reproduce the failed child-process call. Inspected `postprocess-acceptance-snapshot.mjs` against the original: restoring its import and three Git-read expressions reproduces the original file exactly. All validation predicates and aggregation/matching logic are unchanged. The replacement requires an exported entry and checks its decoded length and SHA-256.

Independently verified **all 37 exported objects** in `fixed-git-objects.json`, byte-for-byte, using checked Python `subprocess.check_output(['git','show', ref + ':' + path])`. This anchors the snapshot to Git independently of the export's own hashes. Also verified all five recorded postprocess input artifact hashes. The companion domain closure equals the summary's closure object. The readback adaptation is acceptable and did not relax acceptance validation.

## Accepted scope

Together, terminal R1 independent all-selected numerical evidence, R2 exact lifecycle reuse and removed-target checks, the reviewed R2 cancellation regressions, and the separately verified tiny browser/OPFS receipt support standalone completion for the four declared light/detail HIGH/LOW sources and listed strength cases. Normal SDK admission still requires no independent expected output, gate or NN executor.

The base is the independently defined dyadic F32 formula; real Bernini base agreement and training-base identity remain unverified. Logical mappings remain graph `UNBOUND`. Real Diffusion graph integration, model generation quality, arbitrary model/shape/strength combinations, and Pages publication remain outside this acceptance. No production NN run or another owner's ACK is added as a completion gate.

## Artifact anchors

- Raw R1 report: `80d85f8e62ecdf36995587850376bd4c599ccc90f32bb3ba0e4c62f87a1af774`.
- Raw R2 lifecycle report: `ed545ce9767db84554a2a4206176c95fc51f1b58b5992dea3eb774393a0e92e2`.
- Final summary: `96e3937a4e8079bc164d1f96fbae1f38b680348fff2fffe278ff0f79a7710d33`.
- Lifecycle match: `9c34457dd7eecf002d8020feeff5beadae0ed2eb4095d79e589647b8e6466aa0`.
- Domain closure: `fd331cdbf95cd58befef83afdc3f3b94b9fe4a79c1170ab4c24a8e10cd4f10c4`.
- Git object export: `58a560a9c31e80345602440522a5268048da22bcac9324d038f63c383a1b0681`.
- Adapted postprocessor: `1a38543898d61bdeb85fa5c70a3a27e4650954e03705f056a4f6ca43e3eaddbc`.
