# 固定sourceの受領と共同実行

管理branchは `codex/ai-connection-e0-e4`、Draft PRは
[PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。
`SOURCE-PIN.json` の `managementExecutionSource` をcheckoutして実行する。
配布commitと実行sourceは別に記録する。新しいowner原本の取得や再export、encodeの再実行は不要。

## 1. 受領確認

固定管理sourceを別checkoutへ取得する。実行前に完全SHAを返し、
`CHECKPOINT-SOURCE-RECEIPT.json` に記載したpathの実bytes・長さ・SHA-256を照合する。
GitHub URLの参照、管理側のpush成功、他環境の絶対pathだけでは受領ACKとしない。
実行runnerも固定Git blobとローカルsourceを照合する。

```sh
git fetch origin "$MANAGEMENT_EXECUTION_SOURCE"
git checkout --detach "$MANAGEMENT_EXECUTION_SOURCE"
git rev-parse HEAD
```

native原本は同じrepositoryの下記commitを別rootへ展開する。
元のrepository-relative pathを保ち、現行mainのファイルで代用しない。

| root | 完全commit | 用途 |
| --- | --- | --- |
| `NATIVE_5F` | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` | Rect owner演算、真正base provider、診断consumer |
| `NATIVE_855` | `855f435120f08eb9e818e51281fc26f0e2633829` | 実VAE decodeと既存参照 |
| `NATIVE_FC` | `fc2789a0f649e33f15eb13750e6a983b5c52d170` | SDK、LoRA owner adapter、5051B kernel |

正式DATAは管理に同梱した82bの2module、codecは採用済み2bdのまま。
必要なGit objectも取得し、runnerのGit blob照合を省略しない。
Node 24、Chromium154、Playwrightを使う。P2は既存環境の
`/opt/codex/cua_node/lib/node_modules/playwright` と `/usr/bin/chromium` を使用する。
P3は `LORA_PLAYWRIGHT_MODULE` / `LORA_CHROMIUM_PATH` で実配置を明示できる。

## 2. P2：今回のmean保存経路から実decodeへ

使用Profileは `wan21-raw-f32-1x16x32`、mean `[1,16,1,2,4]`、RGB `[1,3,1,16,32]`。
元encode351のraw mean、独立参照とsource/model/profile/contextを再利用する。
新しいraw→normalize→marked E4保存読戻し→restore→E4保存読戻しが作ったファイルを、
同じtraceでmandatory decode入口へ渡す。旧RGBは新出力として採用しない。

保持済みdecoder3assetは計286314451B。全4asset／encoderは不要。

| File | bytes | SHA-256 |
| --- | ---: | --- |
| decoder-body.onnx | 286313363 | `6674457d2170352760b3aa73543ee1d2bf5713e6bf4d7ea6bf63d8f9703ac27e` |
| conv2-weight.f32 | 1024 | `9ce97eaf137ab64ae409384b6f6177a7b07e593faf103e7e986c0c99d0a1316f` |
| conv2-bias.f32 | 64 | `1a79fbc83c80584e46d5683d49df3482b575ffb4aca99c843a0e8a2aef9df9cd` |

`DEVICE_BUDGET_JSON` は実行deviceの明示resourceStateで、
`status`、`ownerId`、`requiredBytes`、`budgetBytes`、`occupiedBytes` を含む。
数値は保持環境の現在値を用い、ファイル検査用64KiBやtail単体の予算を転用しない。

```sh
node tools/ai-connection/run-joint-rect-management.mjs \
  --diffusion-root "$NATIVE_5F" \
  --native-root "$NATIVE_855" \
  --bundle-root "$EXISTING_RECT_DECODER_BUNDLE" \
  --reference "$NATIVE_855/development/inference/e6/fixtures/png-roundtrip.f32" \
  --manager-commit "$MANAGEMENT_EXECUTION_SOURCE" \
  --resource-state "$DEVICE_BUDGET_JSON" \
  --scenario decode --out "$FRESH_P2_DECODE_OUTPUT"
```

別のfresh directoryで `--scenario cancel-recover` を実行する。
新sourceの取得ACK、両方のresult.jsonとhash一覧、全packageの読戻しreceiptを返す。
両runのtraceには今回のraw/normalized/restored packageと実decode入力、実RGBが結び付くこと。
1536値を既存owner gateへ比較し、取消対象・元Promise終端・実Worker close・owner解放・復帰後新ownerを確認する。
既存encodeの再利用条件と、新実行のsource／時刻／targetを分ける。
source不一致、asset不足、resource不足を推論成功として返さない。

## 3. P3：単一の実Fileと真正bounded base

今回の固定試験はlight/HIGHの選択File一つ。製品入力は引き続きユーザー選択のローカルFile。

- File: `Bernini-R_LightX2V_high_noise.safetensors`、1244141856B、
  SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。
- bounded base JSON: 709364B、SHA-256
  `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。
  保存権限600、scope PARTIAL、fullFileHashRecomputed=falseを維持。
- `HIGH_REFERENCE_ROOT`: 既存0cの `HIGH-reference.json` に対応する保持済みreference directory。
  `reference.json`、`pre-execution-gates.json`、親directoryの `result.json`、
  activation/base weight/base biasとlight強度0/1/-1のweight/biasの計9配列を使う。
  参照JSON・gate・旧resultは固定0c Git blob、配列は既存digestへ照合する。参照値を再生成しない。

```sh
node tools/ai-connection/run-managed-lora-data-real.mjs \
  --lora-root "$NATIVE_FC" --diffusion-root "$NATIVE_5F" \
  --artifact "$GENUINE_BOUNDED_BASE_JSON" \
  --reference-root "$HIGH_REFERENCE_ROOT" \
  --file "$SELECTED_LOCAL_SAFETENSORS" --pair light --side HIGH \
  --expected-sha256 9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945 \
  --out "$FRESH_P3_PRIVATE_OUTPUT"
```

実Fileの全hashはbrowser側で検査する。baseの復号・対象mapping・LoRA演算は固定owner実装へ渡す。
正式DATAの宣言→実検証後receipt→公開後取引receiptを順に使用し、
request／管理revision／resource generation／native local tuple／診断snapshotを返す。
Q先頭16行・全5120列とbias16のPARTIALに限定する。
output16のE4 packageとselected-weight N-ARTIFACT scopeを混同しない。
取消、base復帰、独立copy、所有者解放を含むcase別result、source bytes/hash一覧と実保存読戻しreceiptを返す。
9参照配列を欠く場合はBLOCKED/native取引0。既存20ケースを新bridge実取引へ付け替えない。

## 4. 差分試験

```sh
WORKS_RECT_DIFFUSION_ROOT="$NATIVE_5F" \
WORKS_RECT_VAE_ROOT="$NATIVE_855" \
node --test --test-isolation=none \
  tools/ai-connection/test-joint-rect-management.mjs \
  tools/ai-connection/test-managed-lora-data-real.mjs
```

全回帰の原本root群は `../norm-receipt-adoption/REPRODUCE.md` に従い、
追加の `WORKS_LORA_ADMISSION_ROOT` は82cd9bb、`WORKS_N2_TAIL_NATIVE_ROOT` はa49に固定する。
元pinを一括更新しない。`CHECKPOINT-SOURCE-RECEIPT.json` の実行前後hash不変を確認する。
これはprivate NN/新実取引の成功件数と別の試験scopeである。

## 5. 受入と公開状態

返却を受けた後、両者の完全SHA、build/Profile/規範版、input/output、数値gate、
現在targetと保存receiptを照合して該当edgeだけ更新する。
契約一致・数値不足はCOMPATIBLE / NOT_VERIFIED / BLOCKED。
新contractの必須条件不明はUNVERIFIED。時間経過や管理側GitHub読戻しは受領ACKではない。
P4はDiffusion ownerの別作業で、今回の固定tail受入から任意module接続へ一般化しない。
generationReady:false、load/predict/sample=NOT_READYを維持する。
Draft PRの共有、mainへのmerge、Pages公開をそれぞれ別状態として報告する。
