# P0・P1導入とP2・P3診断接続の報告

2026-10-31（JST）。P0の対応固定とP1の管理導入を実装し、P2の取得済み実mean区間、P3の診断取引・実File経路を検証した。生成受付と実baseの新規受入は行っていない。

取得文書・全source pin・再現コマンドは [README.md](README.md)、native宣言と管理入力の対応は [DECLARATION-BINDINGS.json](DECLARATION-BINDINGS.json)、根拠版と既存scopeは [EVIDENCE-INDEX.json](EVIDENCE-INDEX.json) に記録した。旧文書の読了を今回の本文確認へ代用していない。

| 工程 | 結果と受入scope |
| --- | --- |
| P0 | 4種Profile、12規範・68読取field、18 recordのnative宣言／receipt／管理状態を固定。catalog 8,343 bytesと6 JSON・7説明文書のhash・版一致 |
| P1 | 同梱JSONの実bytes loaderと有限bindingを既存 `evaluateEdge` に導入。別判定器・モデル数値演算・暗黙URL取得を追加していない |
| P2 | **部分受入**。受領実Rect mean→E4保存読戻し→cache→実owner Rect WASM→復元mean保存読戻し。fresh VAE encode/decodeと、その復元meanからのRGBは未受入 |
| P3 | **診断scope受入**。native SDK/Hike・ORT/Hikeの管理queue／snapshot取引、実File＋明示fixture base、publish後finalize、実snapshot付きE4保存読戻し。実base／全sessionは未受入 |

## 原本・版と採用境界

新計画は `1.0-draft.1`、`0fb553fd081d3bcbbad4ead7accd165679f77d34`。
台帳・4種Profile・管理照合規範・数値規則の本文と参照JSONは指定の
`1.0-draft.1`、`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` に固定した。
catalog SHA-256は `14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c`。

| module | 採用済み完全commit | 別候補の完全commit・契約差分 |
| --- | --- | --- |
| 管理 | `28596717182e48aeb23c719c51b6e593edf4e496` | 実ブラウザ・Rect sourceは `74b4b4b0b6cff5b98e5410f9b604f88f587915c7`。共通descriptor/packageの版は維持 |
| LoRA | `0c27874908638afc748ea2455a2779a16736730b` | `fc2789a0f649e33f15eb13750e6a983b5c52d170`。SDK `lora-connection/2.0-draft.1`、owner adapter `/0.1`。SDK／owner adapter／kernelのbytesは同一だがcommitを混同しない |
| Diffusion | `438972f30242e0a3bc66edb8591f38eaa0fcd384` | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。RPC `diffusion-models/0.1`。mean ABIはv2→`wan21-raw-mean-f32-v3`、Rect専用exportあり。LoRA consumer bytesは同一 |
| Text/VAE・codec | `2c171a09ccda65c54899f322ae490f1bfcaac6fb` | `855f435120f08eb9e818e51281fc26f0e2633829`。`works-ai-1`／`works-inference-v1`。実API・codecを照合、診断証拠とAPI説明の差分を分離 |

LoRA kernelは実5,051 bytes、SHA-256
`3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。
旧4,919 bytesを同じAPI版として受理しない。Diffusion Rect kernelは
`bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d`。
[CANDIDATES.json](CANDIDATES.json) は採用済みentryを上書きせず別候補を登録している。
旧 `createDiagnosticLoraBridge` は回帰専用で、owner factoryと重ねて使わない。

## 変更と判断例

`reference-loader.mjs`、`norm-bindings.mjs`、既存`compatibility.mjs`、native facade、snapshotの限定hook、diagnostic packageを変更した。既存queue・E4 package・snapshot・cacheを再利用し、native型や数値mappingを管理へ複製していない。変更一覧はGitの `28596717182e48aeb23c719c51b6e593edf4e496..HEAD` で再現できる。

| 入力・状態 | 互換性 | 検証／準備 |
| --- | --- | --- |
| 実Rect復元mean、契約と実roundtrip／E4証拠あり、fresh decodeなし | `COMPATIBLE` | 実施scope `PASS`、fresh decode `NOT_VERIFIED`／`BLOCKED` |
| 同じ実artifactでgate参照だけ欠落 | `COMPATIBLE` | E4 `PASS`を維持、数値scopeのみ`NOT_VERIFIED`／`BLOCKED` |
| execution宣言全欠落、未知必須norm／profile、片側source未照合 | `UNVERIFIED` | `BLOCKED` |
| 同じ128要素でもRectをF5 shapeへ置換、旧kernel、採用labelへ候補pin混入 | `INCOMPATIBLE`または保存拒否 | 失敗field・norm・出典を記録 |
| 具体的な利用可能adapterが両portで明示許可され、有限変換ruleが一致 | `NEEDS_ADAPTER` | 実行せず`BLOCKED`、挿入後の再評価が必要 |
| fixture証拠を実base／FULLへ変更、旧receipt／別source／別gate | 契約による結果を維持 | 当該数値scopeは`NOT_VERIFIED`、失敗receiptは`FAIL`／`FAILED` |

native profile ID、catalog record ID、意味、normalization rule、kernel ABIを別々に照合する。Textの1M超tensorへpointwise演算の上限を強制しない。複数producer・decoder、mask／Tokenizer、frame／時刻の順序と重複、任意optional拡張を保持する。

## 実行証拠

[RECT-RESULT.json](RECT-RESULT.json)／[P2-RESULT.md](P2-RESULT.md)：全128 normalized値・全128 restored値は独立owner参照と一致。往復最大差 `2.384185791015625e-7 ≤ 2e-6`。raw前後と別scopeの受領RGBの3 packageを実ファイルへ保存して読み戻した。正規化済み配列をrawへ改名していない。

[P3-NATIVE-RESULT.json](P3-NATIVE-RESULT.json)：actual SDK／LoRA Hike／ORT 1.24.3・Hike consumerを固定source bytesで検査した。8ケースでHIGH成功LOW失敗、旧rollback、取消の元Promise終端・release barrier、prepare cleanup失敗、復元未確認のBLOCKED保持を確認した。強度0→1→1再適用→queued base復帰は両sideで`3→3.625→3.625→3`、全491,616 weight/bias値を照合し、累積しないことを確認した。base復帰時に旧snapshotのcurrentnessを解除した。制御入力・baseは明示した合成fixtureで、元の実PARTIAL20ケースとは別scopeである。

[P3-BROWSER-RESULT.json](P3-BROWSER-RESULT.json)：Chromium `154.0.8037.57`。
ローカル選択した `Bernini-R_LightX2V_high_noise.safetensors` は1,244,141,856 bytes、nativeの全体hashは
`9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。
baseは明示fixture。生成したoracle5条件のうち今回実行したのはstrength1の1条件である。

- 全81,920 weight：最大差 `2.7374881028663367e-8`、事前gate `atol=1e-5, rtol=1e-4`。
- 全16 bias：差0、事前gate数値完全一致。
- 全16 ORT/Hike出力：最大差 `5.960464477539063e-8`、事前gate `atol=1e-6, rtol=1e-5`。
- publish前は元feed、publish後にnative元copy owner IDを保持。native／connection registry hash、request／manager revision／SDK local revision／resource generationを区別した。
- source54ファイルのGit object照合、保存8ファイルの実disk読戻し、改変・必須snapshot欠落の拒否、原本unload後の独立copy、SDK／consumer／ORT終了を確認した。

原本LoRA、base重み、選択weight blockはGitへ追加していない。必要な小さい診断package4組は [fixtures](fixtures/) に原本bytesのまま同梱した。`read-reference-packages.mjs --codec <855-root>/docs/shared/inference/tensor.mjs` で既存E4 readerによる4/4 completeを再現できる。

## 検証結果と再現

全体Node回帰は **272/272 PASS、skip 0**（[node-tests.log](node-tests.log)）。既存209件のscopeを保ち、変更境界63件を追加した。別途、実Fileブラウザ1条件、native取引8ケース、実Rect 2操作、公開package4/4 readbackが成功した。独立レビューで見つかったprofile宣言欠落、片側identity省略、RGB意味の誤固定、復元拒否の成功扱い、採用label混入、snapshot scope/operation不一致を修正し、負例へ追加した。

再現手順は [README.md](README.md#reproduce)。ブラウザ／Rectの実行source完全commitは`74b4b4b0b6cff5b98e5410f9b604f88f587915c7`。追加の第8試験はruntimeを変更せずrunner/testだけを拡張し、その実行bytesと固定commitをP3-NATIVE-RESULTへ記録した。最終配布はこの実行証拠・小さいpackage・readerと文書を追加するもので、native／管理runtimeの再変更はない。

## 未受入事項と各ownerへの確認

1. VAE：既存Rect exportの4asset（計498,676,842 bytes）の受渡し、同じ復元meanからのfresh decodeと全1536 RGB値・終了資源証拠。
2. VAE／codec：`normalization:'wan21-comfy-f32-v1'` のwire保持。現在E4は`NATIVE_METADATA_MISMATCH`で正しく拒否し、0ファイル書込。marker削除で回避しない。
3. Text：新たに選択するmanifest実bytes・hashと`numericGate`、対応model／Tokenizer／finalNorm。旧4token receiptの`.001`を新選択へ代入しない。
4. Diffusion／VAE：F5 legacy synthetic gateを受領実VAE meanへ拡張する場合の、対応原本・事前gate・scope。F1／Rect gateを転用しない。
5. LoRA／Diffusion：正当な実base provider／bounded原本、独立reference、実base管理取引。未verifiedなpartial fullFileを使わない。元20ケースの証拠は元pin・scopeで保持し、新規管理E1成功へ読み替えない。
6. 本番工程：persistent全session、全target、actual generated-sampleの生成・復元・decode、81frame、device live-resource budget。RGB affine／generated-sample／Text RMSNormの未実装reference bindingは依存edgeのみ`UNVERIFIED`。

PARTIAL成功、STAGED、診断snapshot公開、保存完備をもって生成受付を解除しない。LoRAなし・base経路にはLoRA固有normを追加しない。上記の不足は該当edgeだけに限定している。
