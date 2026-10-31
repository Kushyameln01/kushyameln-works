# Nonrect mean receiver acceptance plan

Goal: validate the user-selected existing Diffusion/VAE rectangular profile together with the existing LoRA connection. No new mean API, mathematical operator or management snapshot is added to LoRA.

Authorization: user clarified 「既存profileとの接続・共同検証」. Earlier authorization to push the module branch and update Draft PR remains applicable. Source: Diffusion5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3, Pagepage_2b15f0bb13288191837ee215949aa89d sequence3. Existing LoRA0c27874908638afc748ea2455a2779a16736730b.

## Fixed boundaries

- Rectmean profile wan21-raw-f32-1x16x32, float32 NCTHW [1,16,1,2,4],128values, raw-posterior-mean. Legacy [1,16,2,2,2]128values and F1[1,16,1,2,2]64values stay distinct. Require exact shape/profile/meaning/model identity; never reshape by count.
- Native requests retain input:{tensor}; normalize/restore use dedicated Hike Rect ABI and explicit G1C tensor codec. Predeclared roundtrip gate2e-6 and owner independent f32 formulas. No VAE NN/generated sample test.
- Private artifact709364B SHA25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff, exactly5ranges/side. Retain prior-owner full-file receipt as provenance, new fullFileHashRecomputed=false. No virtual full File, no omitted rows, no public payload/base64.
- LoRA uses existing native v2, fixedloader, independent references, Q full[5120,5120] rows0:16/allcolumns and light bias. All original exclusions remain PARTIAL. No two-pair composition or generation readiness.

## Tasks and files

- [x] Receive private artifact with Page tool; verify whole artifact bytes/hash, both5rawrange digests and current provider reconstruction. Store raw file mode0600 outsideGit. Record receiver provenance.
- [x] Run existing owner Rect/F1/F5 Node/browser tests and actual nativeWorker/Port boundary. Run actual fragment provider/browser tests, our19adapter fixtures and compare every supplied raw/decoded range with prior independently accepted real-base evidence. Keep fixture/real-base/real-LoRA claims separate.
- [ ] Add receiver-only reproducible joint harness tools/ai-connection/test-lora-nonrect.mjs. Reuse runJointCases via optional test-owned baseFactory callback in joint-browser-cases.mjs; its existing whole-File default stays unchanged. Run owner realmean/G1C Rect checks before and after actual four-LoRA sequential selections in the same browser. Use delivered block provider, old independently hashed reference arrays (after exact range+decoded equality) and existing gates. No product source changes.
- [ ] Inspect/helper tests then commit harness before executing it, so every served source/WASM is Git-blob pinned. New load of actual LoRA File keeps mandatory whole-source hash. Save every output and selected artifact privately, publish metadata/receipts only.
- [ ] Review counts/source hashes, mean metadata before/after, ownership/cancel/rollback results and unchanged native APIs. Update receiver contract/result/repro, push feat/lora-hike and update Draft PR2; record receipt on own handoff Page. No merge/deploy.

## Decision record

| ID | Before → accepted check | Basis | Scope/owner |
| --- | --- | --- | --- |
| R1 | Source unavailable earlier → exact5f880source and709364Bartifact received | supplied Page and hash | receiver; not fresh whole-model authentication |
| R2 | Rectshape not in prior LoRA receipt → accept existing strict Rect profile | user clarification + owner API/realmean fixtures | Diffusion/VAE owns transforms; LoRA owns only patches |
| R3 | Whole-base-only test CLI → explicit injected fragment provider in receiver test | unchanged public provider boundary; all10rawrange+decoded equality | test harness only, no native SDK extension |

After execution, RESULT.md and evidence will distinguish newly executed actual fragment/mean/LoRA checks, reused original proof, and unexecuted full-model/snapshot steps.
