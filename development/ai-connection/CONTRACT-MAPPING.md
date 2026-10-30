# Diffusion owner: common/native mapping

総合仕様1.1-draft.1と実装計画0.1-draft.1のDiffusion部分。共通管理型をnative内部へ必須化しない。

| Edge | Native側の公開契約 / 残る条件 |
| --- | --- |
| Text→Diffusion | 現tensor-interopはF32 BLC/mask/model hashを検査。plain512、ID可変L。元tensorは管理所有、検査返却metadataのみ。prepared context/core推論はD1 |
| VAE mean→Diffusion | 現128要素raw mean正規化。generatedへ改名しない。frame配列とlatent Tを1対1対応にしない |
| Diffusion→VAE | G1C latentContract schema取得済。実sampleと復元trace/本番decodeはD1/V2未達。G1C側privateコードを変更しない |
| model File→L1 base | immutable File、expected full model identityと実header/config/scale/rangeを分離。owned F32 read、original fullshapeとselected rows、PARTIAL registry |
| L1→LoRA | diagnostic registry0.1。runtime-inputとhike-parameter。SDKv1 graphInitializerへ偽装しない。loaderPolicy/partial plannerはLoRA所有 |
| LoRA→L1 | ownedF32 blocksとSHA→sink coverage→runtime-feed-set→candidate→actualORT/Hike validation。明示expected/tolerance、scopePARTIAL。実LoRA低rank積の共同照合は保留 |
| 管理→Diffusion | 現protocol/job/revision/cancelを維持、内部BUSYを残す。global queue/共通snapshotは管理。親prepareの子readでqueue枠を再取得しない |
| L1 candidate | fixed実graphへの隔離owned feed-set。新しい14B NN/initializer sessionではない。candidate current/abortと旧rollback拒否、active copyとlease/解放を区別 |
| 保存 | native metadataを上書きしない。共通descriptor/snapshot/sidecarとcanonical packageは管理/codec所有者の別契約 |

LoRAへ渡すものはDIAGNOSTIC_API、実HIGH/LOW registry例、readBlock/sink/candidate契約と限定検証scope。VAEへはG1C schema受領とgenerated/bigshape未達、管理へは能力・所有権・取消・queueとPARTIAL/NOT_READY判定を渡す。A/Bをlight/detailへ割当てず、一組選択・切替を維持する。
