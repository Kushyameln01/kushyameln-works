# 再現手順

実装の完全commitは `RESULT.json` の `managementCheckpoint`。最終配布commitからも同じ実装を取得できる。規範の正本は `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` / `1.0-draft.1` のまま。

## 1. 契約・段階境界

Node 24.19.0で実行した。外部モデルは不要。

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-loader-norm-fields.mjs \
  tools/ai-connection/test-norm-execution-boundaries.mjs \
  tools/ai-connection/test-norm-execution.mjs \
  tools/ai-connection/test-norm-required-lora.mjs \
  tools/ai-connection/test-norm-required-rect.mjs \
  tools/ai-connection/test-snapshot.mjs
```

loaderは3欠落・3不一致と正常1、段階判定は14件。原本hash再検査のCLI試験には後述のVAE855 sourceと既存restored入力を渡す。

## 2. 実LoRA native規範必須入口

実行する原本sourceは次の2固定commit。各commitを別directoryへ `git archive` 等で展開し、元のrepository-relative pathを保つ。外側の管理sourceは上のcheckpointへ固定する。

| 変数 | 完全commit |
| --- | --- |
| `NATIVE_FC` | `fc2789a0f649e33f15eb13750e6a983b5c52d170` |
| `NATIVE_5F` | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` |
| `NATIVE_855` | `855f435120f08eb9e818e51281fc26f0e2633829` |

```sh
WORKS_SNAPSHOT_LORA_ROOT="$NATIVE_FC" \
WORKS_SNAPSHOT_DIFFUSION_ROOT="$NATIVE_5F" \
WORKS_NORM_NATIVE_RESULT_PATH="$NORM_RESULT_DIRECTORY/lora-native.json" \
node --test --test-isolation=none tools/ai-connection/test-norm-required-lora-native.mjs
```

期待値は1 PASS、skip0、native plan/prepare/validate/commit各1、weight+bias81,936値、output16値、declaration/validated/publishedの各readinessがready。実行kernelはDiffusion5fのprojection Hikeであり、LoRA merge kernelのdigestへ置換しない。この試験のsource/baseは合成controlである。

## 3. 全回帰

既存native配置と取得は `../reference-adoption/README.md` のReproduceと従来の `../E-RESUME-RESULT.md` を参照。変数は各原本のrepository rootとする。過去pinを最新版へ一括置換しない。

```sh
WORKS_NATIVE_ROOT="$NATIVE_2C" \
WORKS_NATIVE_CODEC_PATH="$NATIVE_2C/docs/shared/inference/tensor.mjs" \
WORKS_LORA_NATIVE_ROOT="$NATIVE_DCB" \
WORKS_DIFFUSION_NATIVE_ROOT="$NATIVE_438" \
WORKS_VAE_PROFILE_ROOT="$NATIVE_7E" \
WORKS_ADOPTED_LORA_ROOT="$NATIVE_0C" \
WORKS_ADOPTED_DIFFUSION_ROOT="$NATIVE_438" \
WORKS_RECT_DIFFUSION_ROOT="$NATIVE_5F" \
WORKS_RECT_VAE_ROOT="$NATIVE_855" \
WORKS_SNAPSHOT_LORA_ROOT="$NATIVE_FC" \
WORKS_SNAPSHOT_DIFFUSION_ROOT="$NATIVE_5F" \
WORKS_NORM_RECT_NATIVE_ROOT="$NATIVE_855" \
WORKS_NORM_RECT_INPUT="$EXACT_351_RESTORED_INPUT" \
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

344 PASS、fail0、skip0を確認した。未設定の原本環境変数によるskipは、この全回帰の合格結果に数えない。テスト名と結果は `evidence/node-tests.log`。

## 4. Rectの原本検査と共同実dispatch

入力は元NN証拠 `35151d1f447d6bba30931a8c28636b2d5d9c3820` の
`development/inference/reference-adoption/p2/run/restored.wktensor`。
1084 bytes / SHA-256 `dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612`。
独立参照はVAE855の `development/inference/e6/fixtures/png-roundtrip.f32`。
6144 bytes / SHA-256 `44cf55e9ea5896f985a0ccf26f61cbb52650fd1a53d3fe80fc3e03aaae545c29`。

```sh
WORKS_NORM_RECT_NATIVE_ROOT="$NATIVE_855" \
WORKS_NORM_RECT_INPUT="$EXACT_351_RESTORED_INPUT" \
node --test --test-isolation=none tools/ai-connection/test-run-norm-required-rect.mjs
```

5 PASS、skip0。固定入力の正常decode、同じ長さでcodec上は有効な別meanと切詰め入力のdecode前拒否を含む。

decode assetがない空のbundle directoryを指定すれば、CLIの実経路はBLOCKED/native0/browser0となり、取得できたsource/input/referenceだけを照合する。明示RAM予算なしにブラウザ推論へ進まない。コマンド、3assetの全hash、VAE担当から返却するreceiptの条件は `RECT-OWNER-HANDOFF.md`。**decodeとcancel-recoverは実assets保持環境で別々のfresh出力directoryへ実行し、そのreceiptを追加受入するまで未完了**。

ブラウザ実行にはChromium154とPlaywrightが必要。今回のCLIは管理環境の既存 `/opt/codex/cua_node/lib/node_modules/playwright` と `/usr/bin/chromium` を使用する。別環境ではこの依存配置を満たす。localhostのGETだけを許し、素材はローカルFile選択、保存はfresh directoryへのwriteと実disk readである。Drive URLは製品入力にしない。

## 5. 証拠とcheckpointを照合

`CHECKPOINT-SOURCE-RECEIPT.json` の各pathについて、固定管理commitから読んだGit bytesと実行時hashの一致を検査する。CLIに渡した任意の40桁文字列だけでは実行sourceが証明されたことにならない。CLIのworking-tree `commit:null` を保持し、別のcheckpoint照合receiptで固定する。

`evidence/lora-native.json.gz` は実native試験の元JSONをそのままgzip化したもの。展開後のSHAと各配布fileのbytes/hashは `RESULT.json`。`OWNER-RECEIPTS.json` は過去owner証拠、今回の実行は `RESULT.json` と本evidenceで区別する。既存20ケース、受領LoRA6取引、VAE元NNの数値を今回の新管理実行回数へ加算しない。

## 6. 追加LoRA DATAの宣言probe

ownerの別checkoutを `40abf43c7c9cf565b115cafc36c7e33f4ae661f1` に固定し、そのdirectoryで次を実行する。管理は `RESULT.json` のcheckpoint、出力先はsource外の新規directory。probe自身がownerとmanagerのGit bytesを検査するため、Git metadataも必要。

```sh
node tools/ai-connection/probe-manager-lora-declarations.mjs \
  --manager-root "$MANAGEMENT_CHECKOUT" \
  --manager-commit "$MANAGEMENT_COMMIT" \
  --owner-declarations development/ai-connection/reference-adoption/lora/management-handoff/OWNER-NUMERIC-WITNESS.json \
  --out "$FRESH_PROBE_DIRECTORY"
```

期待値は `PASS_MANAGER_DECLARATION_METADATA_CONFORMANCE`、負例12/12・正例2/2、exit0。これはmetadata照合のみで数値実行／原本payload読出0、正式phase入口はNOT_ASSESSED。旧eddaの0/12は元receiptへ保持する。DATA実装82bの正式bridgeを接続した受入とは区別する。
