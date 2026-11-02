# 新版LoRA管理接続の再現

実行するのは管理→実 `lora-standalone/1.0-draft.1` SDK→実Hike→LoRA owner準拠の開発provider/consumerである。実Diffusion全モデルの適用や生成READY、学習base同一性はこの手順で認定しない。固定管理source SHAと最終結果は[RESULT.md](RESULT.md)、全APIと寿命規約は[API.md](API.md)を参照する。

## 前提

- Node.js 24、Git。browser自動試験にはChromiumとPlaywrightを使う。
- 採用LoRAは `6d0c8df4cd4992f26745d2d26394f5e194d2567f`。byte同一closureが管理配布に含まれ、bootstrapが実source/WASMを検査する。通常利用者の入力にsource証明を追加しない。
- 実SDK、real Hike WASM、owner正本canonical registry/base/reference consumerを使用する。別環境の絶対pathや原本保持者ACKは実行条件ではない。
- 検証用Fileは生成する小さいrank1 F32 safetensors。targetのfull shape `[5120,5120]` は維持し、native targetsでrow1の1行を明示選択する。実4原本の取得や全2,904 patch再計算を要求しない。

## Nodeの接続・保存試験

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-lora-standalone-native.mjs \
  tools/ai-connection/test-lora-standalone-reference.mjs \
  tools/ai-connection/test-lora-standalone-adapter.mjs \
  tools/ai-connection/test-lora-standalone-management.mjs \
  tools/ai-connection/test-lora-standalone-storage.mjs
git diff --check
```

native試験は固定closureと実WASMを検査する。reference/adapter/management試験は実File登録、完成F32のconsumer適用、片組/二組/なし、強度変更・再適用・base復帰、取消元Promise終端、旧target/旧結果の拒否、失敗とnative recovery、side別instance、一括片側失敗とfresh base回復、prepared creator終了後のconsumer lease保持を確認する。storage試験は実一時ファイルへchunkを順次書き、manifest順序、partial保存、既存file保護、runtime handle拒否を確認する。

既存全体回帰は `tools/ai-connection/test-*.mjs` に含まれる。旧native fixtureが必要な試験は[前段の環境変数と回帰手順](../normal-execution/VERIFY.md)を使う。今回追加分の試験件数と、既存689件/Chromium14件は分けて報告する。旧回帰が通ったことだけを新SDKの接続成功とは呼ばない。

## 実browser自動試験

固定commitをcheckoutした状態で、未作成の出力ディレクトリを指定する。

```sh
node tools/ai-connection/run-lora-standalone-browser.mjs \
  --manager-commit <RESULT.mdに記録した完全40桁の実行source SHA> \
  --out /tmp/lora-management-fresh-result
```

この環境のrunnerは `/usr/bin/chromium` と `/opt/codex/cua_node/lib/node_modules/playwright` を使用する。別環境では同等の実browserを準備する。追加のモデルやLoRA原本をダウンロードしない。

runnerは `docs` をloopbackへ静的配信し、画面の実File input、checkbox、強度、公開ボタンだけを操作する。管理側source、実SDK、Hike、UI等のGET bytes・長さ・SHA-256を固定commitのGit objectと比較する。Fileのuploadや推論サーバーへの送信はしない。反復開発の `--development` は最終固定sourceの受入証拠として扱わない。

出力の `result.json` は操作ごとの成否、実取得source、source errors/browser errors、保存payload/manifest、別instanceのidentity、取消・回復、lease/資源の観測を保持する。`browser.png` は実画面である。GUI操作のtimeoutをnative停止・解放成功の証拠にしない。

### 手動でFileを作る場合

実File inputへ選択する開発Fileを任意の新ディレクトリへ出力できる。下記の4Fileは全組合せ試験用であり、通常入口が常に4原本を求める仕様ではない。

```sh
node --input-type=module <<'JS'
import {mkdir,writeFile} from 'node:fs/promises';
import {createLoraFixtureBytes} from './tools/ai-connection/lora-standalone-fixtures.mjs';
const out='/tmp/lora-management-local-files';
await mkdir(out,{recursive:false});
for(const side of ['HIGH','LOW'])for(const pairId of ['light','detail']){
  await writeFile(`${out}/management-${pairId}-${side}.safetensors`,
    createLoraFixtureBytes({side,pairId}),{flag:'wx'});
}
JS
python -m http.server 8000 --directory docs
```

`http://localhost:8000/ai-connection/lora/` を開く。

1. 開発用base/consumerと未bindingの表示を確認する。HIGH lightだけをFile選択し、登録・適用する。LOWやdetailを未選択のまま進められる。
2. detailを追加登録して二組適用し、片組checkbox解除、強度変更、同じ選択で再適用、base復帰を行う。source/key/rank/alphaや演算順を管理で編集しない。
3. 詳細欄の読取りで完成F32を確認する。これは開発fixtureの確認であり、通常利用のexpected/gate入力ではない。
4. 遅延modeでは適用開始→対象取消→遅延継続の順に操作し、元処理が終端するまで取消を完了扱いにしない。失敗mode解除後は回復と新しい取引を行い、古いtargetが新jobを止めないことを確認する。
5. HIGH/LOW一括では両sideを独立して選ぶ。片側を失敗させ、`BATCH_FAILED` とside別の結果を確認する。回復は新しいSDK取引で両sideをbaseへ戻し、`BASE_RECOVERED` を別receiptとして確認する。元batchを成功へ変更しない。
6. 適用済みまたはprepare済みpackageを新しい保存先へ保存する。保存先選択またはbrowser OPFSを使用し、実source payloadとmanifestがあることを確認する。保存metadataだけを復元成功と扱わない。
7. 「新SDKで開く」でfresh instanceを作り、保存payloadからopenPackageし、stageして再適用する。reload後もOPFSの保存先またはmanifest/payloadのFile再選択から開ける。以前のSDK/plan/prepared/lease IDは権限として復活しない。
8. read leaseを保持してSDKだけを終了し、consumer leaseから同じ完成値を読めることを確認する。その後leaseとconsumerを終了し、最後のkernel lease、cache、base等を解放する。使用中backingの解放拒否は、未解放資源を暗黙失効させないための状態である。

### fixtureの手で規定した値

元要素offset5120の4値を示す。参照baseはownerの独立dyadic provider、matrixは実canonical full shapeのままである。この表を通常APIの必須入力にはしない。

| side/選択 | 最初の4完成F32値 |
| --- | --- |
| 両side base | `[-0.0390625,-0.03125,-0.0234375,-0.015625]` |
| HIGH light +1 | `[-0.0078125,0,0.0078125,0.015625]` |
| HIGH light +1 / detail +1 | baseと同じ |
| LOW light +1 | `[0.0234375,0.03125,0.0390625,0.046875]` |
| LOW light +1 / detail +1 | `[-0.0078125,0,0.0078125,0.015625]` |

## 保存と資源を評価する範囲

保存先はfresh directory。`source-N.safetensors` はSDK writerがstreamを完全consumeしてから `manifest.json` を公開する。stream失敗・取消でmanifestがないものは未完保存である。`management.json` は1MiB以下の別plain JSONで、native payloadの代わりや実行権限にはしない。

reference factoryはkernel memory **32MiB/side**、bounded cache **1MiB/side**。明示した1行の完成値は5120 F32、20,480B。Fileはpairあたり約41KBだが、これらを最低RAMやprocess peakとは呼ばない。元shapeのdense全量を常駐させない。OS RSS、browser全体peak、実モデル全工程RAMは、測定したreceiptがない限り未測定とする。

ownerの全原本2,904 patch・R1全値比較/R2逐次全stream hashは、固定sourceと演算規則の照合で既存scopeのまま再利用する。今回の1行で全原本を数値再受入したとは報告しない。実Diffusion graph/operator binding、真正なbase、standalone consumer、model/session適用、生成結果は後段の共同受入である。`graphBinding:UNBOUND` と `generationReady:false` を維持し、merge・Pages公開は別作業とする。
