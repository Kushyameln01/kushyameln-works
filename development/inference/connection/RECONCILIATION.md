# 接続担当・Diffusion担当への照合用引継ぎ

2026-10-31 JST。完了済み`connection-1`を保持する差分作業。**取得可能なsourceとsource上の整合は確認済み。外部Diffusion担当本人の受領・合意は未確認**である。この文書や内部レビューを、その担当の承認・実生成経路の受入と扱わない。[Draft PR #1](https://github.com/Kushyameln01/kushyameln-works/pull/1)を照合依頼の共有先として作成した。review用専用ブランチから渡し、mainへの統合・Pages更新は実行しない。

## 取得する原本

- 完全commit: [`502b243d092b84979b10b1624df60612047d640a`](https://github.com/Kushyameln01/kushyameln-works/commit/502b243d092b84979b10b1624df60612047d640a)。専用refは`codex/text-vae-contract-502b243`。
- [全実ソースZIP](https://codeload.github.com/Kushyameln01/kushyameln-works/zip/502b243d092b84979b10b1624df60612047d640a): 18,944,759 B、SHA-256 **`d3638a5836d85a24c1e7ab39fce2a690ba85c6f119de16633ffcd28ccb8441b3`**。モデル重み・非公開bundleは含まない。
- [API.md](https://github.com/Kushyameln01/kushyameln-works/blob/502b243d092b84979b10b1624df60612047d640a/docs/shared/inference/API.md)、[PROFILES.md](https://github.com/Kushyameln01/kushyameln-works/blob/502b243d092b84979b10b1624df60612047d640a/development/inference/connection/PROFILES.md)、[RESULT.md](https://github.com/Kushyameln01/kushyameln-works/blob/502b243d092b84979b10b1624df60612047d640a/development/inference/connection/RESULT.md)はいずれも同commit固定。

この窓口がHTTPSでZIPを再取得し、全996 memberのGit blobをcommitと照合した。3資料もGitHub connector経由で再取得した。byte数・各資料のSHA-256は[取得記録](handoff-retrieval.json)。絶対パスの存在だけを取得根拠にせず、窓口による再取得と受取担当による受領を区別する。以前の75,676 Bのpatch引継ぎZIPはSHA `e24eba26b59eb113ad590b6f2bc7a54b5dabde7936c57e49747891f80d6de1b2`のまま保持するが、上の全source ZIPとは別物である。

```sh
git fetch origin codex/text-vae-contract-502b243
git show 502b243d092b84979b10b1624df60612047d640a:docs/shared/inference/API.md
```

ZIPの圧縮表現が配信側で変わった場合はhash不一致を黙認せず、取得記録を分けてcommitの各fileとも照合する。原本502の資料・fixture・結果は書き換えない。

## 照合した対向版と今回の最小差分

| 項目 | 固定した版・結果 |
| --- | --- |
| 最新main | `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`。a33以後の2commitはDiffusion LoRA重みI/O/sourceと公開記録 |
| Diffusion完全source | `679a72d7f53e31bccecbee46b4e2fe559a4e0aba`、`codex/diffusion-models`。mainとの差は公開対象外のbuild/test sourceと公開後の結果記録を含む。元builderもここから取得して照合 |
| Text/VAE API・数値処理 | **502から追加変更なし**。`works-ai-1`、mean経路、識別、mask、共通codec、Hike/ORT graphを保持 |
| Diffusion API | `diffusion-models/0.1`を保持。既存LoRA追加を取り込み、生成sampleの新操作は追加しない。`load/predict/sample`はNOT_READY |
| 必要だった統合差分 | 既存receipt generatorへ対向追加分5 source（LoRA4 moduleとSHA実装）を加え、29→34 recordへ。generator自身のtools側key、atomic更新、`--check`を保持してreceiptを再生成 |

統合後BUILD_IDは`diffusion-models/0.1+114a2aa225f627286ee3e61c4d0a14d019fb990d8e112c7c61479b1c7574e70d`。502のIDや対向公開版のIDを新sourceへ流用しない。元builderの取得は今回の読取り照合であり、502当時に回収済みだったとは書き換えない。source集合は対向34件とgenerator key以外一致し、同名sourceのhash差は502のcodec・interop・context保持の3件だけである。

## 共有するText・mean契約

| 入力・境界 | 保持する出力・責務 |
| --- | --- |
| `encode({text})` | **float32 BLC `[1,512,4096]`**。EOS1/PAD0、mask `[512]`。Bernini system promptとnegativeの実文字列は管理側が組み立てる |
| `encode({tokenIds,attentionMask})` | **float32 BLC `[1,L,4096]`**、`1≤L≤512`。mask `[L]`の内部位置・返却長を保持し、EOS/PADは自動追加しない |
| Text識別 | 元UMT5 `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。保存でも保持 |
| VAE encode mean | `raw-posterior-mean`、float32 NCTHW `[1,16,2,2,2]`。既存のmean用normalize/restoreと旧hash省略時の挙動を保持。生成sampleとは別 |

ComfyUI prompt重み、custom/textual embedding、clip-skip、pooled output等は未対応。通常text出力を元conditioning全体の再現と呼ばない。明示IDのTokenizer識別は期待値であり、任意のID列の出所を証明しない。

## 生成sampleの受理条件と対向確認事項

`wan21-raw-generated-sample:v1`の**VAE consumer契約は変更しない**。

| 項目 | VAE受理条件・Diffusion側との境界 |
| --- | --- |
| 数値・shape | 有限float32、NCTHW、選択した実bundle/profileと完全一致。現在の候補は`[1,16,2,2,2]`だけ。RGBの範囲へclampしない |
| representation/space | `latentContract.schemaVersion=1`、`representation='generated-sample'`、`space='raw'` |
| 正規化状態 | `normalization={id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}`。Diffusionがchannel別mean/stdの復元を完了してから渡す。管理/VAEは追加適用しない |
| 生成元 | `producerModelSha256s`は実際に寄与した全Diffusion原本の非空・重複なしSHA列。任意`tensor.modelSha256`は既存の生成側値を保持し列の一員とする。単一primaryを捏造しない |
| 復号先 | `vaeModelSha256='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'`を実configureしたVAEと照合。VAE hashをproducer列へ入れたり、生成側model hashを付け替えたりしない |
| 拒否 | meanへの改名、normalized/未復元、不正なnormalization marker、違うVAE binding、非有限値、不一致shapeは拒否。既存mean wrapperを緩めない |

対向LoRA仕様が列挙するbase原本はHIGH `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52`、LOW `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`。これは[対向仕様](https://github.com/Kushyameln01/kushyameln-works/blob/679a72d7f53e31bccecbee46b4e2fe559a4e0aba/docs/shared/diffusion-models/lora/API.md)の原本識別であり、実sampleの生成実績ではない。両方が寄与した実jobだけ両hashを記録し、実行順・LoRA・sigma境界は管理traceへ保持する。header hashを原本hashとして代用しない。

現Diffusionはsample producerとgenerated-sample復元を実装していない。`restored`の宣言だけで数値変換や互換性を認定せず、対向には、元normalized tensor→復元Hike/build→raw payloadの前後hash・数値比較・一度だけの適用・対象profileを提示してもらう。mean専用128要素の成功はこの合格を代替しない。新しいnormalized-sample meaningや変換APIは今回独自に定義しない。

VAE contextのinput/slot/frame対応と保存、管理側のcontext順序・正負共有、Text/VAEとDiffusion executor間の直列化も502の契約を保持する。本番graphのcontext消費方法・結合軸・maskは対向の実装と合意待ちであり、管理側に数値処理を複製しない。

## 既存棚卸しから渡すprofile優先順位

[PROFILES.md](PROFILES.md)の棚卸しを再実施せず、次工程の順序案だけを示す。受入済み5-frame/16×16は回帰基準として保持し、新profileに合わせた入力の縮小・padding・frame削減は追加しない。

| 優先 | 区別する役割・開始条件 |
| --- | --- |
| 1 | **静止画F=1**。sourceの最初の時間分岐を別固定graphで検証。診断用の小profileは実媒体を縮小する指示ではない |
| 2 | **非正方形参照**。H/Wを別に固定して軸を確認し、その後、実slot画像の確定寸法ごとのF=1 encode。全slotを正方形や832×480へ統一しない |
| 3 | **元動画context encode**。実入力のframe数・時刻・寸法を取得したうえで、必要grid `[1,3,81,480,832]`→`[1,16,21,60,104]`を検証。別ratioのreference videoは例workflowで未接続のため、実入力とroleが決まってから別扱い |
| 4 | **最終decode**。同じgridでも入力は生成sample。`[1,16,21,60,104]`→`[1,3,81,480,832]`のdecoder export/FP32比較と、実sample受入を区別。後者は対向producer/復元の成立に依存 |

各profileは、実role/slot/F/H/W確定→原194-key VAEのFP32全出力参照→独立した非公開opset17固定export・manifest/graph SHA→結果を見る前に数値gate設定→実ブラウザHike/ORTの完全回収・全数値比較・取消/解放・RAM/時間計測→同じshape/意味の対向実tensor照合、の条件を満たす。現exporterのH/W≥16かつ16倍数、F=4n+1は維持する。新export・大shape推論・全生成の実行は別工程である。

## 検査結果と未対応を分離して引き継ぐ

| 検査・時点 | 結果 |
| --- | --- |
| 502当時の接続fixture | 12/12合格の元sourceと証拠を保持。今回も同じ12件を変更せず再実行し12/12合格。実128要素mean Hikeと保存往復を含み、NN生成推論ではない |
| 502当時の全体Python | **52/53、1 error**。基点a33由来のLoRA/plan15公開台帳漏れ。[元記録](repository-checks.json)は変更しない |
| 今回の最新main統合後 | **Python53/53合格**。上記15件は対向の既存commitで登録済み。今回の契約修正の成果へ付け替えない |
| 今回のreceipt | 6検査・`--check`合格、全34 source/self hashと対向source集合を独立照合。Text/VAEと12fixtureの差分なし |

今回の機械可読記録は[reconciliation-checks.json](reconciliation-checks.json)。以前の実24層Text/VAE小profile受入や6件の実Tokenizer検証は原RESULTの履歴であり、今回再実行していない。

未対応・未合意は、(1)Diffusion本体load/predict/sample、generated-sample復元と実decode、(2)F=1・非正方形・81-frameの新profile受入、(3)workflow latent2,096,640要素に対する現公開予算1,048,576とmean変換128要素の制約、(4)本番graphのcontext消費/正負共有の照合、(5)ComfyUI固有conditioning・元GPU precision・全workflow/端末負荷、である。LoRAはI/O追加を保持するが`loraApplied:false`であり、生成済み扱いしない。

**API schemaの追加差分は0件。** 今回は対向LoRAを保持するreceipt更新と引継ぎ資料だけを追加した。受取担当には取得commit/hash、Text2経路、sampleの復元所有者とproducer/decoder binding、次profileのrole、NOT_READYを確認するようreview依頼する。実際の回答を得るまでは「双方合意済み」と報告しない。
