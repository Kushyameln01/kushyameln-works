# normalized marker修正・既存入力handoff

2026-11-01 JST。対象は共有codecの保存修正、実管理sourceでのE2/E4往復、既存Rect/Textのmanifestとローカル入力手順。新しいexport、NN、正規化・復元の実装変更、plain text全値推論比較は行わない。実Rectの正規化・復元も再実行しない。合成F5の既存回帰は後述する。既存の受入結果は元のscopeで再利用する。

## 実装差分と固定source

基点は`e86d17f8fe3310875d3578ce838e1fc2c32271dc`。native APIは`works-ai-1`、保存形式は`WKTSR001/schemaVersion1`を維持した。

- codec変更source：`2bdca59ea78580d4fe7a9d31a8de33209b64d029:docs/shared/inference/tensor.mjs`、8,256 bytes、SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`。
- 実管理source：`edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。管理core、旧pin helper、過去receiptは変更していない。
- 既存normalized値のDiffusion source：`5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。既存Hike出力をコピーして再利用し、数値変換を再実行していない。
- 既存Rect/Text実装・受入source：`855f435120f08eb9e818e51281fc26f0e2633829`。Wan VAE原本sourceは`9737cba9c1c3c4d04b33fcad41c111989865d315`。model・Tokenizer・graph識別と数値gateは[INPUTS.json](INPUTS.json)と原本manifestを参照する。

`snapshotTensorMetadata()`で、normalized meanに供給された有効な`normalization:'wan21-comfy-f32-v1'`をhash前に捕捉し、任意headerとして保存する。省略されたmarkerを推測で補わず、raw mean/sampleの矛盾したmarkerと未知規約の拒否を維持する。数値配列、shape、モデル識別、意味を変換しない。

共有codecの依存hashが変わるため、既存の固定build-info generatorでこのbranchの依存receiptを更新した。新IDは`diffusion-models/0.1+2fc3ce23708b6927845f3336aa6c0efdb411944b8de6594c0f670770cdca280b`。外部Diffusion担当の固定`5f880f…`や既存数値結果のbuildを付け替えたものではない。Hike kernelに変更はない。

## 旧ファイル互換性

旧codecは`2c171a09ccda65c54899f322ae490f1bfcaac6fb`、8,106 bytes、SHA-256 `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b`。同じbytesをimmutable fixtureに保持する。

| 経路 | 結果 |
| --- | --- |
| 旧markerなしfile → 新reader/writer | 読取り可能。markerを補わず、旧bytesを維持 |
| 新marker付きfile → 旧reader | 任意headerと値を読取り可能 |
| 新marker付きfile → 旧writerで再保存 | markerを失う旧制限あり。保存用codecとして選ばない |
| 新sourceRef → 旧registryだけを注入 | `unverified / NATIVE_CODEC_UNVERIFIED` |
| marker付きsidecar + 旧writerのnative bytes → 旧codecを明示登録した管理writer | `NATIVE_METADATA_MISMATCH`、書込み0 |

管理へ新sourceRefと実module SHAを明示して渡す。旧4c6992…pinを同名で差し替えない。旧ファイルのmarker欠落は、この修正によって過去へ遡って復元できるものではない。

## 実管理E2/E4での保存・回収

[E4-SOURCES.json](E4-SOURCES.json)が取得可能な完全commit、実importする5管理moduleのSHA、codec SHA、元Diffusion receiptとraw入力のSHAを固定する。[結果](evidence/e4-run/results.json)と[回収package](evidence/e4-run/normalized-package/manifest.json)を保存した。

受取データは既存Rect raw meanと照合済みのnormalized128値。`float32 / NCTHW / [1,16,1,2,4] / wan21-normalized-posterior-mean:v1`、markerは`wan21-comfy-f32-v1`。モデルSHAは`2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。元contextのinput/slot/frame0/time0を保持する。診断入力の識別を保存したもので、実媒体の真正性や実generated sampleの証明ではない。

実管理`captureNativeTensor()`→owned store→新codec→`writeArtifactPackage()`→実filesystem回収→`readArtifactPackage()`で、128値、shape/layout/meaning、marker、model/context、descriptor/evidence/traceが完全一致した。native payload SHAは`4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5`、新native全file SHAは`f7b2b158096937648a14a224ca4961543eace129a24ae3b88394a810f6c18840`。8 filesを保存し、store残留0。packageの`complete`はこの保存単位の復元であり、生成READYや全工程受入を表さない。

`.wktensor`にはnative tensor metadataとpayloadを保存する。snapshot、owner、graph/build、trace、evidenceは管理package側へ置き、strict native context/latentContractへ挿入しない。今回のsnapshotは明示的なnull。元raw入力とDiffusion出力の参照は外側evidence/traceに残す。生成decode後の入力sample来歴をRGBだけへ集約する変更は行っていない。

E4 helperは0.152秒、最大RSS42,086,400 bytes。これはNode helper全体の測定で、モデル推論時間・ブラウザピークではない。helper内の子process起動0、Worker0、NN session0、取消試行は非対象。終了後にhelper PID6500の不存在を確認した。過去のモデル推論の取消・session終了証拠は元scopeのまま保持する。

## RectとTextの引渡し

[INPUTS.md](INPUTS.md)にmanifest原本、全Mapキー、期待bytes/hash、ローカルFile選択方法、gateの適用範囲をまとめた。原本・graph・外部重みの再exportや公開はしていない。manifestだけでは実行bundleにならない。

Rect manifestは4,820 bytes、SHA-256 `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`。既存非正方形診断profile `wan21-raw-f32-1x16x32`、RGB`[1,3,1,16,32]`、latent`[1,16,1,2,4]`。[今回のVAE環境asset照合](evidence/rect-assets.json)では4asset、498,676,842 bytesが全てmanifestの期待SHAと一致した。所要0.713秒、export/推論0。native configureの成功とは別検査である。

Text manifestは19,908 bytes、SHA-256 `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`。`numericGate.maxAbsError=0.001 / rtol=0.001 / registeredBeforeComparison=true`、FP32 source-reference diagnostics限定。`finalNorm.epsilon=1e-6`、intermediateGateは別規則として保存する。plainは`[1,512,4096]`、ID入力は`[1,L,4096]`。mask・Tokenizer・元model識別を省略しない。

既存ID fixtureの最終参照誤差`2.142973244190216e-6`、plainのtokenize/shape/mask/finite確認は元scopeを維持する。plain固有の独立全値比較は`NOT_VERIFIED`。選択manifestとgate原本を取得できたため、この不足を補う目的の再exportや全数再推論は必要なかった。管理の有限norm binding採用と元manifest受領は別の責任・証拠である。

## 同hostでの管理File入力確認

実Chromiumのfile inputからRect4asset、Text28fileを選択し、実管理adapter→独立native moduleのconfigureを両方通した。[入力確認receipt](evidence/manager-input-check.json)に実import16moduleの固定hash、選択manifest、返却capabilities、File長とgate原文を保持する。native sourceは`2bdca59ea78580d4fe7a9d31a8de33209b64d029`、管理は`edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。原本Fileは6,735,906,897 bytes。Worker/run/fetch guardは全0、NN0、API/client/adapterはdisposeした。

browser/serverを閉じ、Node親はPython子PID7393のexit0を確認した。Python側はdriver/Chromiumの子孫11件をPID+create_timeで50ms間隔観測し、自己所有zombie3件をreapした。終了検査はlive0 / zombie0 / errors0。途中のzombieと最終残留を区別する。観測間に終了した未観測forkを全て捕捉する保証ではない。Worker/sessionを起動していないため、それらの取消はこのprobeの非対象。ブラウザのピークメモリやNN資源要求は測定していない。

検証環境のNode24では同じ原本を`openAsBlob()`すると2,440,939,601 bytesになり、長さassertionで停止した。その試行を[別receipt](INPUTS.node-file-limit.json)へ保存し、File.sizeの偽装・縮小・元モデル変更をしていない。観測用Proxyがfrozen APIの制約で止まった[helper試行](INPUTS.browser-observer-failure.json)も保持した。最終probeはactual native moduleを直接管理adapterへ渡し、実Chromium Fileで確認する。

この成功は共有filesystemにある実assetを、取得した管理sourceからローカル設定できたという範囲。configureはモデルpayloadの全hash確認や推論をしない。別管理Codex環境でのFile配置・受取ACK、管理graph全体の採用・数値norm binding・生成READYを認定するものではない。

## 検査結果と残件

- 新marker codecテスト6/6、既存接続fixture12/12。後者には合成入力で既存F5 Hikeの正規化・復元を2回呼ぶ小規模回帰を含む。新NNや実Rectの数値再推論ではない。
- 旧codec固定で管理packageテスト34/34、skip0。旧pinを維持した回帰確認。
- 全体Python53/53、build-info `--check` PASS。接続fixtureや実モデル推論とは別の結果。過去の52/53・LoRA公開台帳の履歴をこの結果で上書きしない。
- 実モデルの新推論・export・新profileは0。既存の数値受入結果のscopeを拡大しない。

別管理Codex環境のasset受取・配置・実行ACKは未取得。同hostで固定管理sourceから使えたことと、対向環境の受取は別状態として返す。Text plain独立全値比較、実generated sample、81frame・実参照媒体・大shape、新しいprofile、全工程UIの受入は残件。

管理側への確認は、新codec source/hashの明示採用、対象環境での実File/asset照合receipt、選択Text manifest/gateの記録。Diffusion側には同じcodec採用時のsource pinと、normalized値の数値責任を既存ownerに残すことを伝える。VAE側で正規化・復元を重複実装しない。

再現手順は[REPRODUCE.md](REPRODUCE.md)。
