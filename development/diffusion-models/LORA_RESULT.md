# LoRA重み接続口の実装結果

2026-10-31 JST。依頼された重みの入力接続口を、DiffusionModelsの既存JS/MessagePort APIへ実装した。設計と判断記録はLORA_PLAN.md、外部仕様はdocs/shared/diffusion-models/lora/API.md。

## 実装

inspectLora / loadLora / listLoras / readLora / readLoraSource / unloadLoraの6操作。HIGH/LOW各1件のFile/Blobと強度・baseモデルhashを明示登録し、1MiB以下の分割hashと4MiB以下の保存bytes読出しを行う。成功した登録だけをhostへcommitするため、失敗・取消で旧登録を失わない。metadataと結果bufferは独立所有で、別API/別stage/旧idやcaller指定の偽File/descriptorを拒否する。disposeで両登録を解除する。

F16/BF16/F32、通常2D factor pair、alpha、native targetの加算diff/diff_bに対応する。元の2モデルのheaderから作った1,095 target、うち406 linear weightとkey/shapeを照合する。重複JSONキー・不正shape/rank/offset/未知tensor・target衝突を拒否し、tensor読出し時の範囲内NaN/Infinityも拒否する。

source adapterは最大16MiBのSDK readを4MiB以下の逐次requestへ分け、binding/build/session/job/revision/op・範囲hashを確認する。SDKのsource read/hashを同一ページまたはMessagePort経由で提供する。header hash、実際に計算した全file hash、選択範囲hashの範囲を混同しない。元Fileと検査済みmetadataは公開request側の指定で差し替えられない。

## 検証

| 対象 | 最終結果 |
| --- | --- |
| core・3dtype・alpha・diff・範囲・分割hash | Node12項目合格 |
| SDK source transport・照合・取消・4MiB分割 | Node10項目合格 |
| 実Worker/MessagePortの登録・置換・取消・読出し・解除 | Chromium16項目合格 |
| 既存Diffusion API | Chromium22項目合格 |
| 既存別担当LoRA SDK | Node32項目合格。内部は未変更 |
| 実SDK.inspectの対向source接続 | JS/MessagePortの2経路合格 |
| 不正shapeの処理予算とzero dimension保持 | 独立WorkerのRED→GREEN、2項目合格 |
| 厳密exportの境界・参照検査 | 22項目合格 |

最終buildは `diffusion-models/0.1+33d7c5c3f3865fb6cf68b85358e04d1d0f558ca362531cc14902667fcc0c850b`。34sourceのhashを照合した。sanitize済み383ファイル、23,508,586 bytesのexportがsourceと一致し、公開prefixで23assetのバイト/MIMEと16API+2SDKを確認した。機械可読記録はlora-local-verification.json。新規test harness・fixture・実モデル・toolchainはPagesへ含めない。

独立レビューのBigInt増大の指摘は、不正dimension productをdescriptorのbyte容量と逐次照合して修正した。空tensorに後続zero dimensionがある場合の従来の意味も保持した。上記最終試験は修正後のbuildで確認している。各読出しでheader/alphaを再検査する実装の大きな実LoRAでの時間は未測定であり、負荷低減の成功とは扱わない。

## 別担当との境界と残件

最新main a33b311の別担当SDK仕様を実際に取得し、既存SDK/UIを変更せずにsource接続した。既に公開されていたpeerの15ファイルはbyteを保持したまま公開台帳へ取り込んだ。

本接続口は `loraWeightIO:true` / `loraApplied:false`。LoRAの行列積やモデルへの加算を行わず、量子化Bernini全体の実F32 graph registry、immutable baseProvider、package sink、prepareLoad/validate/commit/rollbackは未実装である。既存SDKのapplyを有効化したとは表示しない。全体load/predict/sampleはNOT_READY。

この担当環境には元workflowの2 LoRAや別担当が検査した4原本は存在しない。型・保存bits・契約の動的検査は、明示した合成LoRAで行った。実LoRAの学習元一致、元workflow同等、全工程推論、端末のCPU/RAM改善は未確認。

## 公開受入の記録先

公開するruntime/specはmain/docs、ビルド・検証用の完全sourceはcodex/diffusion-models。公開後のHTTPS受入結果は同source branchのdevelopment/diffusion-models/lora-public-verification.jsonへ保存し、同じdocsの記録専用再ビルドを発生させない。
