# 管理P1完了後のRect証拠受入

2026-10-31 JST。管理P0/P1の完了に伴い、実source `edda43f9ea69c5b3ab1af3c6eb82295f2912887c` を取得し、旧35151d1の実Rect traceを新しいP1へ接続した。**P1未導入というblockerは解消。完了済みRect mean/RGB証拠の規範受領と現在の入力契約・保存検査はPASS。** 新たなVAE推論は行っていない。

## 変更境界と固定source

| 対象 | 固定版と確認 |
| --- | --- |
| 管理 | `edda43f9ea69c5b3ab1af3c6eb82295f2912887c` / Draft PR #7。新reference-loader/norm-bindingsとevaluateEdge接続を実import |
| 参照catalog | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、1.0-draft.1。SHA `14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c` と登録6JSONの実bytesを新loaderで検査 |
| 数値owner | Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、VAE `855f435120f08eb9e818e51281fc26f0e2633829`。host/kernel/graph/profileに差分なし |
| G1C codec | `2c171a09ccda65c54899f322ae490f1bfcaac6fb`、実bytes SHA `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b` を明示注入。管理checkout内の旧codecへ置換しない |
| 再利用する元実行 | `35151d1f447d6bba30931a8c28636b2d5d9c3820` / P2 trace SHA `18f0a5181a24eb52b64172098e77246c8d2d41db6026e5563fe23be3127650c0` |

管理285→eddaでcapture・queue・package・descriptor・schema・codecは同じbytes。差分は規範loader/binding/evaluateEdgeである。[取得・byte比較](manager-source-checks.json)と[実import pins](source-pins.json)を保持する。新しいモデル数値判定器やP1のコピーは作らず、所有者の公開moduleを使った。native API・tensor codec・モデル・数値規則は変更していない。

## 元の数値証拠との結合

Rect latent `[1,16,1,2,4]` とRGB `[1,3,1,16,32]`、model SHA `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` を維持する。復元meanの全file・payload、RGBの全file・payload、context、元参照とdecode evidenceを照合した。

| 結合する項目 | SHA-256 |
| --- | --- |
| 復元mean file | `dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612` |
| 復元mean payload | `71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063` |
| 実decode RGB file | `4de752c8a7d6df05fed012065bfd222b2f41d4c1c93c2cf8be58edfa24a46d72` |
| 実decode RGB payload | `aacf932664139862197c2dab5c087ce76305b2622bf02b3f5bde44eb73392d85` |

元実WASMのmean全128値の往復誤差`2.384185791015625e-7 ≤ 2e-6`、RGB全1536値の誤差`4.328787326812744e-6 ≤ 2e-5`を、元source/profile/reference/gateのscopeで再利用する。Diffusionのmean規範recordへVAE RGBのgateを付け替えていない。RGBはSHAPE recordの`rgb-decoder-raw`、独立したowner-validationと必要scopeへ対応付けた。

過去の`p1Integrated:false`、旧管理285、実Worker/ORT実行時刻等は原本のまま残す。今回のmanager eddaで新しいNNが動いた、というreceiptへ書き換えない。最新の再受領結果は[run/result.json](run/result.json)から、その元trace hashへ遡れる。

## 実行した新境界

1. 同一import系統の`loadReferenceSet`で固定catalogと6JSONを認証し、その実ReferenceSetを既存`evaluateEdge`へ渡した。
2. 既存Rect bundleの4asset、計498,676,842 Bをstreamして長さ・SHAを照合した。管理担当の環境でのasset不足は、この環境では解消済み。元モデルやgraphの再export・転送・公開はしていない。
3. 実native `validateVaeRequest({operation:'decode',...})`で復元meanと固定manifestの入力契約を確認。実manager capture→queue→package writer→disk readerで、復元meanと既存RGBを新たに保存・回収した。
4. N-IDENTITY、N-SHAPE、N-ARTIFACT、N-EVIDENCE、N-TRANSACTION、meanに必要なN-NORMALIZATION/N-NUMERICを照合した。request/session/revision/resource generation/tokenは今回のqueueへ結び、古いqueueの停止receiptを現在のresource状態に流用しない。
5. 復元mean境界とRGB境界はともに`COMPATIBLE`、必要なscopeは全て`pass`。判定とfield/normごとのtraceを保存した。

ここでの`readiness:ready`は**現在の入力契約・完了済み証拠受領・file保存検査**に限る。64 KiBのresource予算もその小さい検査用であり、VAE/ORT推論のMemory予算ではない。新規model sessionの起動可否、利用端末予算、全工程の実行準備をこの値で認定しない。producer operationは元ownerの実装済み演算を参照するが、今回は再dispatchしていない。

## 失敗条件と終了

9条件を新しいP1で確認した。

- 数値gateだけ欠落：`COMPATIBLE`を維持し、該当数値scopeのみ`not-verified / blocked`。
- 同じ128値のF5 shape、旧kernel：`INCOMPATIBLE`。
- 各境界の未知必須norm：`UNVERIFIED`。
- 各境界のdecode evidence欠落：契約を維持し`blocked`。
- 各境界に生成条件を要求：診断PASSのまま生成条件は`blocked`。

実loaderの既存検査10件、norm binding検査8件は全て合格、skip0。これは管理が報告する272件全体の新規再実行ではない。今回の追加harnessは2境界・9負例で合格。旧VAE/接続fixtureの合格は元scopeを維持して再利用する。

新規NN/ORT session/Worker/Browser/Hike変換/exportは0。store参照0、queue終了・quarantineなし、直接子Nodeと観測した子孫の生存0/zombie0/errors0。helper/観測PIDのctimeでも終了を確認した。完了済みNNの過去資源記録とは合算しない。

## 残る未受入

- 新管理から新たにNNをdispatchする全実行工程・future model-resource readinessは今回未検証。必要になった変更境界で別途受け入れる。
- normalized中間WKTのmarker保持は既存G1Cの未対応。raw/RGBの保存と、owner memory上のnormalized→restoreという既存境界を維持し、marker削除やrawへの改名で通さない。
- Text plain固有の独立全値比較、RGB affine/Text RMSNorm等の未実装な規範binding、persistent全session、実baseの新規管理取引、全target、実generated-sample、実媒体不足profile/81frame、元GPU precision、利用端末負荷は別工程。

再現は[REPRODUCE.md](REPRODUCE.md)。API差分なし。管理の旧採用entryは上書きせず、eddaによる完了済み証拠受領を外側の新receiptとして共有する。
