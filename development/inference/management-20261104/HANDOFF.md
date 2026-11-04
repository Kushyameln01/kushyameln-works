# Text／VAEの引継ぎと受入境界

2026-11-05 JST追補：採用manifestの実選択・現codecの保存確認と、最新版b6eで解消した通常P4 marker差分は[新しい管理反映資料](../management-adoption-20261105/HANDOFF.md)へ引き継ぐ。本書のNN実行source／受入scopeはそのまま保持し、48ffの未対応記述を最新b6eの状態へ転用しない。

Textの全512有効ID不一致を元gateのまま解消し、TextとVAEを実管理APIから部分運用した。配布branchは `codex/text-vae-management-20261104`、[Draft PR #20](https://github.com/Kushyameln01/kushyameln-works/pull/20)。この文書を取得した固定commitが配布sourceであり、以下の実行sourceとは区別する。

## 実行source

| 範囲 | 完全commit SHA |
| --- | --- |
| 全512有効ID、通常SDK・全値比較 | `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3` |
| 採用manifestでの長文plain・実管理Text | `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| 新長文conditioningの実P4 capture検証helper | `941b2a6e3e956d000a3339ae05c0ef84aafed47e` |
| 実管理Rect encode／decode／取消・保存 | `8594722e693bda9901f61cededfc1b3338e66c92` |
| 実管理adapter／queue／capture／workspace | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| Diffusion P4 capture・契約fixtureの復元owner | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |

実hostが配信したsource closureのpath／bytes／SHA-256は各receiptに含めた。絶対pathだけを取得証明にせず、固定Git sourceとのbyte照合を使う。新しい診断観測poolは配布sourceに含まれ、元789実行へ遡って実行済みとは扱わない。NN0の全観測復元比較で変更境界を検証した。

## 管理が受け取るもの

- [通常API](API.md)、[正本API](../../../docs/shared/inference/API.md)、ブラウザES module `docs/shared/inference/management-adapter.mjs`、[再現手順](REPRODUCE.md)。実管理sourceを注入し、既存native `.configure/.encode/.decode` を呼ぶ。独立参照・gate・固定prompt hashは通常引数に不要。
- Textの[採用manifest](text/source-ordered-fp32/manifest.json)：696,123B、SHA-256 `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。元modelと27 prepared資材をmanifestのpath／bytes／SHAに対応させる。元18.5GB graphの再export・複製は不要。構成済みfilesは呼出し側が再構成／disposeまで保持する。
- VAEの[Rect manifest](../e6/fixtures/bundle-manifest.json)：4,820B、SHA-256 `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`。RGB `[1,3,1,16,32]` ⇔ latent `[1,16,1,2,4]`。[資材取得・復旧receipt](asset-recovery/README.md)にはstream全71件507,834,866Bのpath／hashを含める。大きいprivate資材本体の他環境取得は未ACKであり、小さいmanifestが読めたことと分ける。
- [実管理Text](text/managed-accepted/README.md)と[実管理Rect](rect/README.md)のnative WKT・管理ZIP・receipt。decodeの管理ZIPは元raw入力とRGBを両方保持する。strictなnative context／latentContractへ管理fieldを入れない。

Textのplainは常にfloat32 BLC `[1,512,4096]`、IDは `[1,L,4096]`、L1..512、ID0..256383、同長0/1maskで少なくとも1つ有効。plainはBOSなし、EOS込み512上限、越えれば拒否する。mask、model／Tokenizer、適用済み最終RMSNorm markerを通常出力／WKTで保持する。RMSNormの今回の修正は内部集計順だけで、最終Hike RMSNormは変更していない。

stream VAEはN1・float32 NCTHW、encode元F1..81、H/W16..848の16倍数。T=`1+floor((F-1)/4)`、latent空間H/8・W/8。実処理frame、元全frameとの対応、末尾未処理、slot・時刻・順序はcontext／sourceContext／frameProcessingに残す。decodeはT1..21・latent空間2..106の偶数。F=`1+4*(T-1)`へ戻る。構成済みmanifestからの `capabilities/querySupport` が正本であり、域外を自動padding・縮小・frame削減で通さない。

## Diffusionが受け取るもの

実conditioningは次を選択できる。各indexにpath／bytes／SHA、mask・model／Tokenizer・最終marker、独立参照、元gate、実行sourceがある。

| payload | 対象 | WKT SHA-256 |
| --- | --- | --- |
| [全512有効ID](text/norm-accepted/README.md) | L512・mask全1、合法ID0を含む。全値maxAbs8.52346420288086e-5 | `efaed289fbeeb69a1fb6ab172d35d8e2f09bf164bedba5a360787cc29f4e4e29` |
| [長文plain](text/plain-long-accepted/README.md) | EOS込みL512・mask全1。全値maxAbs0.000151902437210083 | `18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a` |
| [実管理Hello world](text/managed-accepted/README.md) | plainと同じ512 IDs／3有効mask。各全値maxAbs2.4437904357910156e-6 | `6be07864f6c92601b689bfa69e0c4ddc870fdc3be4dc719f3d9c611ec4c1f101` |

各WKTは8,390,098B、2,097,152 float32値。元gateはすべてmaxAbs／atol／rtol0.001で維持する。新長文と実管理payloadをFFEの実 `captureP4Conditioning` へ渡し、全値・mask・model／Tokenizer・最終markerとsnapshotの独立所有を確認した。これは4096→5120投影・cross-attention・FFNの実行ではない。内蔵verification flagsはfalseのまま保持する。

復元済み生成sampleの入力は `wan21-raw-generated-sample:v1`、finite float32 NCTHW、`generated-sample/raw`、元producer群、実VAE decoder hash、Diffusion所有 `wan21-comfy-f32-v1/restored` が必要。追加の復元・clamp・meanへの改名は行わない。実管理Rectでは保存契約fixtureをこの経路へ通し、raw＋RGBを同じpackageへ保存した。実producerによる生成・復元receiptと最終target decodeの共同受入は後段。

最終取得したDiffusion48ffのstrict通常P4は `encoder-final-rmsnorm` を要求し、実Text markerを現状では拒否する。[取得・契約照合](CONTRACT-CHECK.md)を参照する。FFE captureの合格を通常consumerの受入へ拡張しない。Text／管理でmarkerを書き換えず、Diffusion ownerで正式受理する契約と実装を調整する。

## 保存・取消・解放

現codecを実管理workspaceへ注入する。`WKTSR001/schemaVersion1`と旧ファイル互換を維持し、存在しないmarkerを推測しない。WKT内はpayload／shape／dtype／layout／meaning／識別／mask／normalization／context／latentContract。owner・snapshot・graphBindings・trace・evidenceは外側管理packageへ保存する。RGBだけを保存し元raw依存がない要求は拒否する。

取消は完全targetで指定し、nativeのcancel受付だけで解放済みとせず、元Promise・queue afterTerminal/releaseを待つ。未dispatch取消もdeadlockなく次jobへ進む。管理側の共有executor直列化を使い、別Diffusion executorとの全体横断順序は管理側が所有する。返却tensorは呼出し側所有、管理captureは独立コピー。disposeは所有Worker・session・storeを終了する。取消時のWorker hard terminationをsession finally実行済みへ読み替えない。

## 再利用・新規検証・未受入

既存のnative81frame `[1,3,81,480,832]` ⇔ `[1,16,21,60,104]`、source末尾、F1参照画像の数値結果は[元scope](REUSED-EVIDENCE.md)で再利用する。消失private bundleだけを元sourceで復旧し、全71資材hashが一致した。81frame推論・参照生成・全域再試験は行っていない。

新規は内部normのsource-exact局所比較、全512有効ID・長文plain・実管理Textの全値比較、実管理Rectの新encode／同meanからの新decode、保存raw-generated契約fixture decode、取消／回復／保存／dispose。資源の条件とピークは[RESULT](RESULT.md)と各元receiptを参照する。特にTextの管理browser標本peakRSS5,344,391,168B、VAE Rect1,584,381,952B。長文Nodeと管理browserの並行測定を単独の速度改善と主張しない。

未受入は管理81の大payload資源・保存運用、実媒体slotを含む全体UI、Diffusion投影以降、実producer生成raw sampleのtarget最終decode、相手担当の別環境ACK、LoRA送付と全体実験。送付側GitHub取得self-checkは[取得確認](recipient-acquisition/README.md)で分ける。mainへのmerge、Pages公開、全体接続完了、製品生成READYを宣言しない。基点の全Python52/53およびLoRA公開台帳不整合は、今回の変更境界試験の合否と分離する。
