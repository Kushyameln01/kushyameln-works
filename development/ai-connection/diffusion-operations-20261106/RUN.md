# Diffusion 運用候補の起動と保存Fileの再利用

2026-11-06 JST。既存の公開API／Workerを正本とし、まず保存済みraw sampleを読み込んで利用する。今回のAPI・数値kernel・build・対応shapeの変更はない。新しいものはモデル不要のFile再利用runnerと、この起動手順だけである。原寸の単体完成と管理経由の通し運用は未受入。

## 固定sourceと環境

- branch：`codex/diffusion-derived-hidden-heads`、[Draft PR #14](https://github.com/Kushyameln01/kushyameln-works/pull/14)。本書を含む配布の完全SHAをcheckoutし、以後HEADを動かさない。各runnerの`--source-commit`にはそのHEADの完全SHAを渡す。
- 数値runtimeは`6cda0a686d30a4bd748909fc56c61c1acece7bfb`／従来配布`e3d64d8743d8c1a3e2346cc98a072cf6cff84398`と同じ153 source。buildは`diffusion-models/0.1+e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6`。
- 保持環境checkout：`/workspace/work/diffusion-models`。Python 3／NumPy／Playwright、Node.js、Git、Chromium（`/usr/bin/chromium`）が利用可能。ブラウザrunnerにはloopback接続を許す実行環境を使う。
- この環境はCPU quota 4、memory上限16 GiB。モデルは既存Fileを利用し、複製しない。作業開始時の`/workspace`空きは約54 MiBのため、入力・出力は専用`/tmp`へ置く。この容量記録は原寸全工程の成立証拠ではない。

通常Pages用は**1-thread／no-COI**、明示構成は**4-thread／COIあり**。`resource.wasmThreads`の既定は1。4を指定する環境には実COOP/COEP・SharedArrayBufferが必要で、GitHub Pagesから自動的に得られるものではない。runnerでは`--wasm-threads 1 --coi false`と`--wasm-threads 4 --coi true`を別に指定する。4／falseは拒否され、1へ切り替えない。

## 保存済みraw sampleの原本を使う

原本は保持環境の`/workspace/outputs/bernini-standalone-20261102/raw-sample-n5.wktensor`。別環境では、既存の非公開[原本取得Page](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d)の「保存済みraw生成sampleの原本File」から取得する。Pageには**実File**と、binaryを読めないPageツール向けの**同じFile bytesのbase64 JSON**を添付済み。JSONを`read_page_reference`で取得し、Page掲載の手順で原本Fileへ戻せる。公開GitHubにpayloadは追加していない。

| 識別 | 値 |
| --- | --- |
| 原本File | 1,179 bytes／SHA-256 `c9fb6541b92ff5ea3b81b4decd4b29073aace11b5b9794810d826b34e5be7dd4` |
| payload | 512 bytes／SHA-256 `60dbc4c3e2070d8cbdb7e38b8a6b5e336d30fa9af444611ec0cd65bccb9d5beb` |
| tensor | float32／NCTHW `[1,16,1,2,4]`、128値 |
| 意味 | `wan21-raw-generated-sample:v1`、generated-sample／raw／restored、復元owner=`diffusion_models` |
| 生成実行source | `e6f76c6a36a641be0a3483fd7b6bf6fcdf287ce2` |
| 元の受入 | controlled N5／Text L3、HIGH3→LOW3・各40block。実Text L512／元81frameの出力ではない |

[既存SAMPLE-ARTIFACT](https://github.com/Kushyameln01/kushyameln-works/blob/3aed2f696adf36385b54cfaa5019d447d64984e0/development/ai-connection/standalone-d1-d4-20261102/SAMPLE-ARTIFACT.json)と実Fileの全体・payload identityが一致する。Pageから取得したJSONも復号し、元Fileとの全bytes一致を確認した。生成sampleの復元は済んでいる。**VAEへはraw generated sampleのまま渡し、meanへの改名や再復元をしない。** そのVAE shapeへの対応可否とdecodeはVAE ownerが判断する。

最小確認はモデル不要で、実browser File→公開`readTensor`→実Worker→disposeを通る。NN・保存・再exportは行わない。`--file`は取得した原本の配置先へ変更できる。

```bash
cd /workspace/work/diffusion-models
install -d -m 700 /tmp/diffusion-operations-20261106
RUN_SOURCE=$(git rev-parse HEAD)
python3 development/ai-connection/diffusion-operations-20261106/verify-saved-file.py \
  --source-commit "$RUN_SOURCE" \
  --file /workspace/outputs/bernini-standalone-20261102/raw-sample-n5.wktensor \
  --output /tmp/diffusion-operations-20261106/file-reuse-new.json
```

出力pathは未作成のものを指定する。成功時はcaller File不変、意味・shape・finite値・payload一致、Worker終了、dispose後`DISPOSED`を記録する。これはFile再利用の確認であり、1-threadの生成試験ではない。通常APIは取得物の固定hashや過去receiptを必須にしない。

## モデルと保存入力を使って公開操作を起動する

保持モデルは`/workspace/work/retained/bernini/`の`Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`と`Bernini_LOW_fp8_e4m3fn_scaled.safetensors`。各15,574,833,216 bytes。既存識別・取得元は[保存資材](../diffusion-standalone-20261104/SAVED-INPUTS.md)のmodel欄にある。今回モデル全体を再hashしていない。

保存入力の復旧には下記の固定Git objectが必要。欠けていれば、そのcommitを明示取得する。

```bash
git fetch origin f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48
git fetch origin ffeeeedb6b57d182a977c3ac02c042ce235fc87a
python3 tools/diffusion-models/recover-standalone-inputs.py \
  --private-root /tmp/diffusion-operations-20261106/recovery \
  --full-dir /tmp/diffusion-operations-20261106/full-inputs \
  --small-dir /tmp/diffusion-operations-20261106/small-inputs
```

保存済み実Textのbytesを固定format adapterで復旧し、既存shape ownerのprepareだけを呼ぶ。Text／VAE／LoRAは起動せず、新しい独立参照も作らない。両caseは実Text L512・全512行・mask有効3位置の同一保存packetで、正常markerは`umt5-final-rmsnorm-f32-v1`。無効行を除去せず、再RMSNormをしない。通常P4用の別canonical packet（全mask有効）へ差し替えない。

| case | shapeとcontext | 用途 |
| --- | --- | --- |
| small-inputs | target `[1,16,1,2,4]`、source同形、reference_video `[1,16,1,2,2]`、合計N5 | 公開操作の既知の小入力域 |
| full-inputs | target／宣言source `[1,16,21,60,104]`、reference_videoなし、848×848相当の参照3本をslot順、合計N73947 | 原寸targetを保った明示別case。原寸の全40block／6更新は未受入 |

復旧済み両manifestはpath移動分だけidentityが変わり、旧manifestへの宣言path rebase後に一致する。復旧は旧試験の再開ではない。元動画の実frame数・参照実寸法・有効slot数・元mxfp8精度は引き続き未確認。

まず起動前確認を行う。これはモデルのstat、saved入力、source/buildを確認し、browser／NNは起動しない。

```bash
RUN_SOURCE=$(git rev-parse HEAD)
python3 tools/diffusion-models/public-model-browser.py \
  --source-commit "$RUN_SOURCE" \
  --manifest /tmp/diffusion-operations-20261106/small-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --mode smoke --wasm-threads 1 --coi false \
  --private-output /tmp/diffusion-operations-20261106/check-private-unused \
  --output /tmp/diffusion-operations-20261106/check-unused.json \
  --check-only
```

実際の制御操作はこの既存runnerで`--check-only`を外して起動する。`smoke`はload→入力拒否→実prefixで取消→reload→保存入力のsave/read→unload/disposeであり、生成sampleを作らない。`--mode predict --side HIGH`または`LOW`は完全predictを要求し、`--mode sample`は内部HIGH3→LOW3の6更新とraw復元・実ファイル保存読戻しを行う。modeごとに新しいoutput/private-outputを使う。4-thread構成は両resource引数を明示変更する。

**上記の実操作モードは今回再実行していない。** 既存の数値・取消・保存証拠を再利用する。全モデル実行を開始する場合は重いjobを一つに限定し、旧原寸試験との重複起動をしない。モデル・入力・sourceを凍結してから実行する。

## 管理の通常操作と残る確認

契約は既存[MODEL_RUNTIME](../../../docs/shared/diffusion-models/api/MODEL_RUNTIME.md)と[WEIGHT_PORT](../../../docs/shared/diffusion-models/api/WEIGHT_PORT.md)。`load({files:{HIGH,LOW},resource:{wasmThreads}})`後のmodelSessionIdを使い、`predict`／`sample`を呼ぶ。取消は対象jobId／inputRevisionで行い、対象Promiseの`CANCELLED`終端後にreloadする。`saveTensor`のbytesを実Fileとして保存し、`readTensor({file})`で再利用する。終了時はweight clientのclear／dispose、`unload`、`api.dispose()`。失敗した解放は成功と扱わずownerを保持して再試行する。

weight接続は既存`openWeightFeed`／`createDiffusionWeightClient`のみ。通常P4は[固定handoff](../diffusion-contract-handoff-20261105/HANDOFF.md)の正式markerをそのまま使う。P4とpaired modelは同Workerで排他。`releaseP4`後にloadし、逆方向はunload後にprepareP4する。

固定管理source`296c18d5f2c878fa42bbb198a706991fc901065f`／現PR7 head`e1661e561dfb1a4f20544ff48bc375175b5981d1`は旧nativeを採用している。管理ownerには最新source closureと正式marker、weight-portの明示MessagePort所有経路の採用が残る。通常の`structuredClone`だけではMessagePortを受け渡せない。本担当のAPI成功を管理の全体接続完了とは扱わない。

| 状態 | 範囲 |
| --- | --- |
| 実装済み | 公開load/predict/sample、取消後reload、HIGH／LOW選択、保存読戻し、weight port。今回API・build差分なし |
| 今回の確認 | 保存入力復旧、import/build、1/noCOIと4/COIの起動前確認、4/noCOI拒否、実File／Workerのread・dispose、非公開Page経由の原本byte転送 |
| 再利用 | 1/noCOIのN5／実L512 HIGH全predict、旧4/COIの小入力6更新・raw保存／取消後reload、1と4の実weight-port制御、原寸4/COIのHIGH/block0独立比較。各元source・入力域のまま利用 |
| 未受入 | 原寸HIGH全40block/head終端・独立比較、原寸LOW／6更新／raw保存、1-thread sample、管理の最新採用後の実運用、実LoRA全モデル／VAE decode／全体運用 |

旧原寸HIGH sourceは`6cda0a686d30a4bd748909fc56c61c1acece7bfb`のまま。2026-11-06の保持環境では旧`/tmp`worktree・進捗／終端・watcher stateがなく、旧native session30165／watcher25717は`Unknown process id`。最後の記録はblock2処理中で、**現在の終端は取得不能・未確認**である。完了にも失敗にも変更せず、nativeもwatcherも再起動していない。[以前の記録](../diffusion-contract-handoff-20261105/CONTINUATION-ARMED.json)は当時点の状態として保持する。原寸block0合格を全40block／6更新へ拡張しない。

merge・Pages公開・実LoRA送付・全体運用実験は行っていない。今回の確認結果は[CHECKS.json](CHECKS.json)と[File再利用結果](file-reuse.json)にまとめる。
