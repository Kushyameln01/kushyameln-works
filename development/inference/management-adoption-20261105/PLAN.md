# Text採用設定と現データ契約の管理反映

日付は2026-11-05 JST。開始sourceは `20f640a6e071b6c060a212e89b28f0c8965923f7`。mainは実remote照会でも `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` のままで、作業treeはcleanだった。既存の隔離worktreeとDraft PR20を継続する。

## 要件と変更境界

ユーザーは修正manifestの実選択、数値規則と実行sourceの対応、旧all512-ID FAILの解消記録、現codec提供、最新版P4通常入口の確認、利用可能な保持済み実raw sampleのdecodeを求めた。原寸VAEの再export・全面再推論、marker改名、RMSNorm再適用、VAE側復元、meanへの改名は行わない。

管理head `e1661e561dfb1a4f20544ff48bc375175b5981d1` は前回の実管理受入と同じ。native runtime21file、管理closure15file、owner bridgeも前回789と同じbytesだった。旧manifestを許容する単独APIを維持し、新しい本番helperや数値処理を増やさず、既存bridgeのconfigure戻りcapabilitiesで採用設定を照合する。

## 実施項目

- [x] 最新管理／Diffusion sourceを固定取得し、前回との差分を確認。
- [x] `tools/inference/management-connection/verify-adoption.mjs` で保持済み実資材をfile-backed Mapとして登録。420e manifest→owner inspectorの24binding→実管理configure戻りを照合。現codecをbuild/read両方へ注入し、保存実conditioningとnormalized markerを読戻す。Worker／NN0と新規保存を区別する。
- [x] `verify-normal-p4.mjs` で固定b6e sourceへ実L512を渡す。通常checkSupportと通常native snapshot／protected captureで全値とmetadataを確認し、投影以降のNN実行へ拡張しない。
- [x] 実generated sample2件のreceiptを取得。保持ファイル、ZIP、JSON内の全値も調べたがpayload未取得。既存Rectへshapeは適合する。原本受領だけをDiffusion PR14へ依頼し、該当decodeのみ保留。syntheticの再decodeでは代用しない。
- [x] 採用manifest・内部norm・最終norm・数値規則・実行SHA・再利用scopeを対応表へまとめ、旧FAIL解消と未実施browser全512有効を区別する。
- [x] 変更境界の検証、固定sourceでの再現、GitHub返却用成果の作成。配布SHAと管理／Diffusionへの返却URLはDraft PR20へ記録する。

## 確認範囲

新規作業は構成、情報保全、通常P4入力受理、保存・解放の確認。元NNの実行sourceはID `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`、長文plain／管理browser `78954ee92d1b76c6652f50df1668159a55db6dc9` のまま保持する。旧48ffのmarker不一致は、新b6eでは正式受理が追加されて解消した。数値NNや別環境ACKの合格へ自動拡張しない。
