# 非正方形meanと既存LoRAの受領側共同検証

2026年10月31日 JST。ユーザーが指定した「既存profileとの接続・共同検証」はPASSです。Diffusion/VAEの非正方形mean `[1,16,1,2,4]` を既存の専用profileで受け入れ、同じChromium内で実4 LoRAのPARTIAL診断を順次実行しました。前後でmeanのprofile・shape・正規化／復元hashが一致しました。LoRAのnative API、loader、数値kernelと演算scopeは変更していません。

## 固定した正本と受領

| 対象 | 固定版 |
| --- | --- |
| Diffusion担当Page | [接続検証用ソースと公開契約](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d)、取得時sequence3、本文全32block |
| 採用Diffusion | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、[API](https://github.com/Kushyameln01/kushyameln-works/blob/5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3/docs/shared/diffusion-models/API.md)／[診断provider契約](https://github.com/Kushyameln01/kushyameln-works/blob/5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md) |
| native build | `diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20` |
| 元VAE受渡し版 | `7e091192232fae36367b550ca5fada88915a0703`。実mean fixture/manifestは上のDiffusion固定treeに保持 |
| 今回の共同実行source | `e66733a74a24405091e25805e7985d11a77683cd`、branch `feat/lora-hike` |
| 再利用した独立参照の受入版 | `0c27874908638afc748ea2455a2779a16736730b`。旧reference/result JSONのGit blobとbyte同一を検査 |
| 実行環境 | Chromium154.0.8037.57、Node24.19.0。localhostの分離したsource配信、実Hike/ORT WASM/G1C |

LoRA担当本人がPageツールで非公開断片JSONを取得し、**709,364 bytes／SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`**を照合しました。schema `bernini-diagnostic-base-block/0.1`、scope PARTIAL。各sideのheader181,280 B、Q81,920 B、bias32 B、scalar scale4 B、config27 Bの5rangeを全て検査しました。10rangeのraw hashは以前の独立original-base参照と一致し、両sideの全81,920 weight＋16 biasは復号後F32 bytesも一致しました。[本人受領receipt](evidence/receipt.json)／[元参照との照合](evidence/block-prior-reference.json)。

新しい元モデル全量hashは計算していません。prior-owner full-hash receiptは過去の出典として保持し、`fullFileHashRecomputed:false`、native `fullFileSHA256Verified:false`、`unprovidedRangesAvailable:false`を維持します。省略row/tensorを持つ仮想full Fileは作らず、明示 `createBerniniBlockProvider` を注入しました。raw断片はGit外mode0600に保存し、HTTP GETや公開Gitへ出していません。

## meanの契約と結果

| profile | dtype/layout/shape | 全値比較と往復最大誤差 |
| --- | --- | --- |
| 非正方形 `wan21-raw-f32-1x16x32` | float32/NCTHW `[1,16,1,2,4]`、128値 | 正規化・復元とも独立f32式へ全128値一致。元入力との往復 `2.384185791015625e-7` |
| 既存F1 `wan21-raw-f32-1x16x16` | float32/NCTHW `[1,16,1,2,2]`、64値 | 全64値一致。元入力との往復 `1.1920928955078125e-7` |
| 既存F5 `wan21-raw-f32-5x16x16` | float32/NCTHW `[1,16,2,2,2]`、128値 | 既存10項目回帰PASS。Rectへのshape互換扱いなし |

rawのmeaningは `raw-posterior-mean`、model SHAは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。nativeの `validateRawLatent / normalizeRawMean / restoreRawMean` は `input:{tensor}` で呼びます。Rectは専用guardと `NormalizeRawMeanRect/RestoreRawMeanRect`、ABI `wan21-raw-mean-f32-v3`へrouteします。channelあたり8位置という演算規約を守り、同じ128要素という理由で旧shapeや任意shapeへ読み替えません。誤profile、generated-sample meaning、異なるmodel、二重正規化、異常値・容量を拒否します。

実保存meanはHike正規化→明示G1C codec保存・読戻し→Hike復元まで全値比較しました。事前roundtrip gateは `2e-6`、変更なし。Rect fixture SHA `8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8`、manifest SHA `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`。

Rectの正規化SHAは `4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5`、復元SHAは `71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063`。共同LoRA処理の前後で一致しました。mean Hike WASM SHA `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d`、Memory1,114,112 B／arena1,024 Bを再使用しています。

## 同一browserでの共同検証

順序はnative mean API4項目→実保存F1/Rect mean/G1C7項目→light HIGH→detail HIGH→light LOW→detail LOW→mean/G1C7項目です。mean前後は各々所有・解放される新しいinstanceでの再計算比較です。同一のpersistent mean instanceを保持した試験や、共通管理snapshotの試験とは扱いません。

LoRAは各pair/sideで強度0/1/−1、強度1の再適用・取消復帰を実行し、**計20ケースPASS**。全1,638,400 weight、320 bias、320 consumer出力を比較し、weight最大絶対誤差 `6.122718332335353e-9`、bias0、出力 `7.450580596923828e-9`。gateは前回と同じweight abs1e-5＋rel1e-4、bias/base decode厳密一致、出力abs1e-6＋rel1e-5です。[全16出力とnative receipt](evidence/joint-result.json)／[保存配列の独立再照合](evidence/independent-comparison.json)。

Q full `[5120,5120]` の先頭16行・全列とlight biasだけを選択し、detail biasは実baseからpass-throughしました。light他1,050 patch（全201 diffを含む）、detail他399 patchと選択Qの残りrowを除外したPARTIALを維持します。4実原本は新しく捕捉したFileの全体hash/header/rangeを検査し、同じFileの強度切替のみhashを再利用しました。独立期待値は固定受入版の保存済みF64/F32配列を使い、原本・base断片と全hashを結び付けて再利用しています。

不変base復帰・再適用、取消後復帰、旧plan、validate失敗復帰、commit直後取消からのrollback、missing/duplicate/checksum/binding拒否、両sideのcommit済み旧candidate rollback拒否を確認しました。preparedとcandidate履歴の解放後も実consumerの独立copyで全16出力が一致しました。native leaseは非対応でN/Aです。mean変換をLoRA weightへ混入せず、runtime-input weight／hike-parameter biasとnative v2を維持しました。

### 別scopeで行った確認

- 既存mean受入：Node27項目・Chromium27項目（Rect7/F1 10/F5 10）、native Worker/Port API4項目PASS。
- 新fragment provider：Node8項目、実Hike→ORTブラウザHIGH/LOW2case PASS。実LoRA演算の代用にはしません。
- 現LoRA adapter：新5f880consumerに対する契約fixture19件PASS。provider/stageの合成fixtureと上の実20caseを分けます。
- 受領側helper：File/factoryの曖昧指定をimport前に拒否するなど3項目PASS。

実行中に読み込んだ46source/WASM/fixture/codecを、LoRAとDiffusionそれぞれの完全commitのGit blobとbytes/SHAで照合しました。新Diffusionの公開v2-adapterは旧LoRA2bba907と旧kernel identityを固定しているため、そのidentityを現版へ書き換えて通していません。今回は従来どおりLoRA担当の外側adapterと修正済みHike kernelを使い、byte同一のnative consumerへ接続しました。[静的・実測レビュー](evidence/RUNNER-REVIEW.md)。

## 再現と生成物

追加したのは `tools/ai-connection/test-lora-nonrect.mjs` と、既存共同helperのtest用provider注入口です。製品SDK・planner・loader・kernel・パネルの変更はありません。[再現手順](REPRODUCE.md)／[機械可読な受入契約](CONNECTION.json)。

選択した全実値／独立期待値、旧受入reference root、全除外表、今回の結果と85fileのSHA manifestは、[LoRA引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3) の私的archiveから取得できます。10,088,369 bytes、SHA `693f76570cf9915be07f258a4248c7618754b99f6dc4f8c11f013a8af053002f`。709,364-byteのraw入力断片・4原本・モデルは含みません。

管理へは新Diffusion build、厳密mean profile/shape/meaning/model identity、LoRA側のpair/sideと別々のSDK local revision、PARTIAL receiptと所有権・取消終端を渡します。meanとLoRAの成功を共通revisionや生成可能snapshotへ昇格させません。G1C raw/normalized meanとgenerated sampleは別契約です。

全target適用、元model全session、VAE NN再実行、生成sample/decode、本番latent `[1,16,21,60,104]`、全体memory peak、管理snapshot公開は未検証です。load/predict/sample NOT_READYとE8 BLOCKEDを維持し、二組同時合成・merge・Pages本番deployは実施していません。
