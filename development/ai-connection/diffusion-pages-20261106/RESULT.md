# Diffusion 公開管理画面の操作確認

2026-11-07 JST確認。公開画面からFile選択・設定・実行・取消・結果取得・実File保存と読戻しが成立した。確認したのは下記の小入力1 caseであり、原寸D1〜D4や全体運用の完成ではない。

## 1. 公開URL

https://kushyameln01.github.io/kushyameln-works/ai-connection/

ここでDiffusion単体操作を提供する。別担当の[統合フォーム](https://kushyameln01.github.io/kushyameln-works/ai-connection/modules/)とmedia/Text/VAE実装も保持しているが、本報告はその全体ルートの実運用成功を主張しない。

## 2. 公開mainのcommit

`d645f502b8f534b757673b6793136b1e1ebbafb4`。

[PR #24](https://github.com/Kushyameln01/kushyameln-works/pull/24)でmainへ統合した。数値owner sourceは`296e4fe14dff26689f5075e3103cf3c4a54e3485`、実行buildは`diffusion-models/0.1+6f8203f8f0a6dbb906dc212abcf1ce9d9fa6ae46d4cd8f399ae787aed7bf4de8`。[公開API](https://github.com/Kushyameln01/kushyameln-works/blob/d645f502b8f534b757673b6793136b1e1ebbafb4/docs/shared/diffusion-models/API.md)の既存入口から同じ固定ownerを呼ぶ。新transportや完成重みAPIは追加していない。

## 3. Pagesデプロイ結果

[pages build and deployment #42233753964](https://github.com/Kushyameln01/kushyameln-works/actions/runs/42233753964)は`completed / success`。Pages buildは`built`、commitは上記mainと一致、error messageはnull。main:/docsを公開している。[DEPLOYMENT.json](DEPLOYMENT.json)にGitHub APIの確認結果を保持する。

## 4. 公開画面から完走した操作と入力条件

Chromium154／Linux、1-thread/no-COI。4-threadは公開画面で選択不可。環境のCPU quota4・memory上限16GiBは確認したが、この試験ではRSS/PSS peakを測定していない。管理画面の表示・File input・button・実downloadを使い、アプリAPIの外部注入やlocalhost画面では代替していない。実行環境のHTTPS接続は、標準TLS検証を有効にしたurllibで取得した公開originの応答をブラウザへ転送した。証明書検証の無効化・恒久的な信頼設定変更・local contentの配信は行っていない。

| 条件 | 実入力 |
| --- | --- |
| target | 32×16・1frame、batch1、latent `[1,16,1,2,4]`、2 tokens |
| source/reference/slot | すべて明示absent、contextなし |
| Text | 実producer packet、float32 BLC `[1,512,4096]`、512行・全512 mask有効を保持 |
| conditioning File | 8,390,098B、SHA-256 `03b5f0cc3febd68503c56e6f9f8d32a22e1600fb7db4989c35ab475c5a10ea6f`、固定配布`badff7a436b56207a084c4c770e01490899a576c` |
| positive/negative | UIの明示checkboxで同じpositive Fileを使用、CFG1 |
| model | 保持済みscaled FP8 HIGH/LOW原本、各15,574,833,216B。既存のfull-hash証拠を再利用し、再hashしていない |
| compute | 既存のHike/ORT F32演算、LoRAなしbase、HIGH/LOW各epoch0・packageHash null |
| initialization | target/noise payloadをUIで作らず省略。Diffusionがzero targetとWebCrypto/host Box–Muller標準正規F32を生成 |
| sampling | Euler/simple、6更新、shift5、split3、HIGH3→LOW3、noiseScale1、augmentation0 |

次の9確認がすべて成功した。

1. owner既定値による設定と1-thread／4-thread環境gate。
2. 既存の実raw sample原本Fileの読込み。
3. 保存ボタンによる実downloadと、保存Fileのbit一致読戻し。
4. 誤Fileの構造化エラーと、直前の正常結果の保持。
5. disposeによる実Worker終了、再開、選択Fileの保持と再利用。
6. 実sample要求を取り消し、CANCELLED終端と実Worker終了を確認。
7. 同じHIGH/LOW Fileからreloadし、異なるmodelSessionIdへ切替。
8. 公開sampleで全40blockをHIGH3→LOW3の6更新に使い、raw sample返却まで完走。
9. 生成結果を実Fileへdownloadし、そのFileを再選択して読戻し。

生成結果はfloat32 NCTHW `[1,16,1,2,4]`、finite128値、`wan21-raw-generated-sample:v1`。generated-sample/raw/restored、復元owner=diffusion_modelsを保持する。meanへの改名・mean専用復元・二重復元はしていない。実Fileは1,179B、SHA-256 `c6fcabae8906c88f83957b63913b9ee6839a208c91060138d90bfe2a603e5c77`。実payloadは512Bである。

一連の公開操作は3,558.542秒（約59分）。これは起動・取消/reload・生成・保存を含むUI観測時間で、単独operatorのbenchmarkではない。ページerror・HTTP error・禁止宛先/メソッドはすべて0。観測した4つの実専用Workerは、取消・dispose・browser終了までにすべて閉じた。[公開操作結果](public-ui-verification.json)にmetadataとsource取得記録を保存する。raw payloadは公開repoへ同梱していない。

既存原本はcontrolled N5/Text L3・source`e6f76c6a36a641be0a3483fd7b6bf6fcdf287ce2`の生成物。1,179B／SHA-256 `c9fb6541b92ff5ea3b81b4decd4b29073aace11b5b9794810d826b34e5be7dd4`で、公開UIでread/save/readbackがbit一致した。VAE接続にはこの既存Fileを非公開受渡しから再利用でき、VAE確認のための再生成はしていない。

## 5. 未対応・未検証

- 原寸target `[1,16,21,60,104]`と全contextでの全40block・6更新・raw保存・全体資源は未受入。旧73947-token HIGH試験の終端取得不能も未解消で、再起動していない。
- この単体操作欄はtargetのみ。実Text生成、context選択、VAE decode、実LoRA適用、統合フォームの通し運用は今回の公開確認に含めない。
- 公開Pagesの4-thread、seed再現、Comfy/PyTorch RNG一致、元mxfp8計算精度との同等性は未対応／未確認。
- 元workflowのsource実frame数・参照寸法・有効slot数は未取得のまま。今回のtarget-only caseは元workflow再現の証拠ではない。
- 新noise演算は独立8,264値と一致し、owner関連109試験が通過。UI6、採用native5、adapter17、mean2、product13の変更境界試験も通過。既存モデル演算の証拠は元のsource・入力域に限定して再利用し、今回の新入力をモデル全体の新規独立精度受入へ読み替えない。

`generationReady:false`、`originalWorkflowAccepted:false`は維持する。sampleの4,194,304要素planning capとprimitiveの1,048,576要素capも区別する。

## 再現

固定runner取得sourceは`e3fb297ff12fa0c1f78f1530e62ab2af0b7313b9`、pathは`tools/ai-connection/verify-published-diffusion.py`、SHA-256 `4910fd006ec8ead312bff16949908ef2491374834ce93265bd5a2b9a79750ee3`。既存モデルとproducer packetを使い、他推論モジュールは起動しない。通常の取得確認にはsampleなしで既存raw Fileを使えばよい。

```bash
python3 tools/ai-connection/verify-published-diffusion.py \
  --file "$TASK_EXISTING_RAW_FILE" \
  --output /tmp/diffusion-public-file-reuse
```

本報告の6更新を再試験する場合だけ、同じcommandに`--sample --high "$TASK_HIGH_MODEL" --low "$TASK_LOW_MODEL" --conditioning "$TASK_CANONICAL_TEXT_FILE"`を加える。既定noiseは毎回変わるため、再試験の生成File hash一致は要求しない。通常の受領やVAE接続確認には再NNを必要としない。
