# Diffusion既存契約の管理向け引継ぎ

2026-11-05 JSTの固定handoff。正式Text marker対応済みの通常P4と、既存の全モデルweight portを管理が採用するための契約をまとめる。今回はsource・保存済み公開packet・既存証拠の取得照合のみ。モデル読出し、新NN、browser、入力差替え、実行中jobの操作、他担当ACK、commit、merge／公開は行っていない。

全21 sourceの完全commit／path／bytes／SHA-256／固定URL、packet identity、gate・scopeは [CONTRACT.json](CONTRACT.json) を正本とする。rootによる現在codecのdecode／snapshot専用probeは [p4-canonical-text-receipt.json](p4-canonical-text-receipt.json) の **PASS_INGRESS_ONLY** として接続した。実P4／管理NNの合格とは扱わない。

## 固定sourceと管理との差分

| 項目 | 完全SHA |
| --- | --- |
| 本担当確認基点 | `b6e166478a8e072c9ffd3ce562bfdb0c89634920` |
| 同一runtimeの実行source | `6cda0a686d30a4bd748909fc56c61c1acece7bfb` |
| 通常P4の正式marker対応初出 | `3a198d6788b48293cd209c44141fa98657943609` |
| 最新管理配布／PR7 head | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| 管理実行source | `296c18d5f2c878fa42bbb198a706991fc901065f` |
| 管理が固定する旧P4 native | `30e283bb115741af6b475e9bdc41700a4e564053` |

GitHub PR7 metadataでも上記headを確認した。これは対向の当handoff受領ACKではない。b6e166と6cdaの通常P4、conditioning、共有codec、公開API／Worker／weight portは同一bytesである。

現在の [`execution/capabilities.mjs`](https://github.com/Kushyameln01/kushyameln-works/blob/b6e166478a8e072c9ffd3ce562bfdb0c89634920/docs/shared/diffusion-models/execution/capabilities.mjs) は28,121 bytes、SHA-256 `614283e9b12f3874b8deef81165f3b90312ddbbf5db48b122a947c7d3bb4d4b3`。21行で正式markerを宣言し、92行で通常P4には旧aliasも許容する。通常P4の実入口は [`execution/p4.mjs`](https://github.com/Kushyameln01/kushyameln-works/blob/b6e166478a8e072c9ffd3ce562bfdb0c89634920/docs/shared/diffusion-models/execution/p4.mjs)（6,254 bytes／`b71115876c22e7987ecfcd45dae211901ef8cab36e4f8c67bb15d9559c883fdb`）。新しいAPIを追加する必要はない。

管理側で必要な採用更新は次のとおり。今回、管理ownerのコードは変更していない。

- `tools/ai-connection/run-normal-holding.mjs:13`のP4 native／build／inventoryと、`adapters/normal-p4-owner.mjs:5`のsource参照を現在の実sourceへ更新する。
- `tools/ai-connection/test-normal-p4-owner.mjs:27`は、旧30eへ正式`umt5-final-rmsnorm-f32-v1`を渡して`UNSUPPORTED_NORMALIZATION`になる負例を固定している。更新後は正式markerを保持した成功条件へ変更し、未知markerの拒否は別の負例にする。管理側の改名や数値変換で旧gateを通さない。
- 通常P4 ownerはnativeの`postSelfAttention.available`と`checkExecutionSupport`へ委任する。全モデルbase管理は`modelRuntime.operationsImplemented`をgateにしており、legacy `modelInference:false`／`partialOnly:true`だけで実routeを拒否しない。独立参照・数値receipt・固定sample hashを通常入力の必須条件へ戻さない。

## 通常P4へ渡すtensor

操作は`postSelfAttention`、model sideは明示HIGHまたはLOW、**N2／block0／contextLatents=[]**。範囲外をtarget縮小やshape偽装で通さない。

| 入力 | dtype／layout／shape | 意味／正規化 |
| --- | --- | --- |
| residual | float32／LC／`[2,5120]` | `bernini-block0-post-self-attention-hidden:v1`／`none` |
| timeAct1 | float32／C／`[5120]` | `bernini-time-embedding-silu:v1`／`none` |
| conditioning | float32／BLC／`[1,L,4096]`、L1〜512 | `text_hidden_states`／`umt5-final-rmsnorm-f32-v1` |

Text modelは`c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizerは`e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。maskはcompactな非共有Uint8Array `[L]`、0/1・有効位置あり、無効行のhiddenはゼロ済みとする。元coreのとおり全L行を保持し、cross-attention softmaxへ別のmaskやRoPEを追加しない。

入力data／mask／metadataは最初のoperator await前にownerがcopyする。callerのbufferを保持し、出力はowned F32／LC `[2,5120]`、`bernini-block0-output-hidden:v1`／`none`。通常runは最終tensorを返し、全中間値・参照・gateは診断側へ分離する。direct runはlocal AbortSignalを受け、bounded演算のterminalと資源解放を待つ。公開Workerの取消はそのWorkerを終了させ、再prepare／再loadを必要とする。

正式markerを持つpacketは、**同じdata・全mask・model／Tokenizer・正式markerをそのまま渡す**。管理はcanonical→legacyのrename、RMSNorm再適用、4096→5120投影を行わない。投影・cross-attention・FFNはDiffusion ownerの演算である。保存は共有`decodeTensor`／`encodeTensor`で正式markerを保ち、`encoder-final-rmsnorm`へ書き換えない。旧aliasの通常P4互換は、共有codecの正式marker契約や全モデルpredict/sampleの入力域を変更しない。

## 正式marker付き実Text packet

固定配布は`badff7a436b56207a084c4c770e01490899a576c`、pathは [`development/inference/standalone-20261102/text/full512-conditioning/conditioning.wktensor`](https://github.com/Kushyameln01/kushyameln-works/blob/badff7a436b56207a084c4c770e01490899a576c/development/inference/standalone-20261102/text/full512-conditioning/conditioning.wktensor)。

| 識別 | 値 |
| --- | --- |
| WKT | 8,390,098 bytes／`03b5f0cc3febd68503c56e6f9f8d32a22e1600fb7db4989c35ab475c5a10ea6f` |
| payload | 8,388,608 bytes／`518d6cd4ab2e00270743d5fa417c686a86016d9f0fdcf409fdadbbfe27fa687b` |
| native metadata | F32／BLC `[1,512,4096]`、`text_hidden_states`、正式marker、上記model／Tokenizer |
| mask | 512位置すべて有効／`6caf38d537984e261527b8caef5f990fb91415a1db917198821a79ed28997973` |
| producer実行source | `b3e5e34430d58bca3bf69b8938ba87beb196d054` |
| 外側manifest | `manifest.json`、5,357 bytes／`2ed9bab2e773f031c844355847cf055ddf0b46235f6ed2edd08479de711188ad` |

producer／24層完了等の履歴は元manifestに保持し、WKT headerへ管理情報を追加しない。通常の受取に必要なのはWKTと既存codecであり、外側manifest・独立参照・gate・receiptは診断資料である。この`plain-long-eos512`は合成plain文の独立した1caseで、Bernini元promptや全workflow品質の証拠ではない。

進行中jobの旧f76 packetは8,390,054 bytes／`90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`、payload `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`、mask有効3位置で、native headerと旧native JSONにはmarkerがない。既存の固定prepare ownerがmetadata宣言だけを加えた入力をそのまま維持する。**今回のcanonical packetを旧active Textへ差し替えない。**

## weight接続と同Workerの排他

全モデルの正本は [`api/WEIGHT_PORT.md`](https://github.com/Kushyameln01/kushyameln-works/blob/6cda0a686d30a4bd748909fc56c61c1acece7bfb/docs/shared/diffusion-models/api/WEIGHT_PORT.md) の既存`openWeightFeed → createDiffusionWeightClient`のみ。side／modelSessionId／modelEpochへ束縛した不変base providerと完成F32 consumerを使う。低rank積・package作成はLoRA owner、全体loop・queueは管理owner、数値演算と内部資源はDiffusion ownerである。既存P4のbounded `weightFeed`を、この全モデル接続APIと呼ばない。

公開[`api/index.mjs:76–80`](https://github.com/Kushyameln01/kushyameln-works/blob/6cda0a686d30a4bd748909fc56c61c1acece7bfb/docs/shared/diffusion-models/api/index.mjs#L76)と[`api/worker.mjs:34–49`](https://github.com/Kushyameln01/kushyameln-works/blob/6cda0a686d30a4bd748909fc56c61c1acece7bfb/docs/shared/diffusion-models/api/worker.mjs#L34)の実guardを確認した。同じpublic APIが所有するWorkerでは、prepared P4とpaired model loadは排他であり、衝突は`RESOURCE_OWNER_CONFLICT`となる。

1. **P4→paired model**：runP4のterminalを確認 → `releaseP4`でsession／read lease解放を確認 → `load({files:{HIGH,LOW}})` → current modelSessionIdでside別`openWeightFeed` → `createDiffusionWeightClient`。
2. **paired model→P4**：計算terminalを確認 → weight clientのclear／dispose（失敗したhost cleanup ownerは保持・再試行） → `unload`成功とWorker realm終了を確認 → `prepareP4`。取消で終了したWorkerの古いowner／portを再利用しない。

管理全モデルadapterは、最新native採用とport専用の保持／transfer経路をまだ必要とする。現在の`diffusion-public/adapter.mjs:17`にはopenWeightFeedがなく、106／176行の汎用structuredCloneへMessagePortを渡せない。既存公開APIを採用してこの境界を接続し、重複APIや関数のwire cloneを追加しない。1-thread/no-COIと明示4-thread/COIは分け、暗黙fallbackを行わない。

## 再利用証拠・未受入

旧通常P4の実行source30eでは、LOW／N2／block0／contextなし／実L512・旧alias入力の最終10,240値を比較し、失敗0・maxAbs `2.09808349609375e-5`、gate `abs .01 + rel .001*abs(reference)`を満たした。全25cut・限定完成F32 consumer・取消／解放も元scopeで再利用する。新canonical packetをこの既存入力の実行結果へ付け替えない。

badffのText caseは2,097,152値の独立比較が成功し、既存Text側codec証拠では全value bit／mask／descriptor／markerとWKT再encodeの一致を確認している。これは当該Text caseと当該Text codecの証拠である。現在のDiffusion codecによる新しい確認は次の入口scopeに限る。**canonical packetの実P4 NN、管理NN、全モデル実LoRA、全体運用は未受入**。metadata／snapshot成功をこれらへ昇格させない。

## 新しい入口確認と再現

rootの [receipt](p4-canonical-text-receipt.json) は31,940 bytes／SHA-256 `15fded109d0f490816392d2724d56acab687d7dc971cfc62e3cddd34cff94bb8`。badff Git objectから同一bytesで私的領域へcopyした実packetに、既存`decodeTensor → checkExecutionSupport → snapshotNormalP4Inputs`を適用した。正式markerを変更せず、全8,388,608 payload bytesを直接比較して一致、全512 mask／model／Tokenizer一致、owned buffer分離、caller保持、pre-aborted snapshotと不正markerの拒否を確認した。

residual／timeは**入口検査専用の合成ゼロfixture**であり、本番block hidden／time値ではない。数値factory・P4 run・正規化演算は呼んでいない。WASM instantiate試行0、network試行0、新NN0、packet書換え／re-encode／再exportなし、active f76変更なし。

```bash
node tools/diffusion-models/verify-p4-canonical-text.mjs \
  --runtime-source b6e166478a8e072c9ffd3ce562bfdb0c89634920 \
  --packet /tmp/p4-canonical-handoff-20261105/conditioning.wktensor \
  --expected-packet-sha 03b5f0cc3febd68503c56e6f9f8d32a22e1600fb7db4989c35ab475c5a10ea6f \
  --output /tmp/p4-canonical-handoff-20261105/new-ingress-receipt.json
```

packet取得元は上記badffの固定Git path。別環境では同じGit bytesを私的pathへcopyし、`--packet`を明示する。`--output`は未作成のpathが必要で、既存receiptを上書きしない。

driverは実行時点では未commitの新規file（7,198 bytes／SHA-256 `e1d263627dec9734e7dbf44dac062ba108cad80f6fc8c0357c153a4d50eedf88`）で、receiptがその実source hashを保持する。`--runtime-source b6…`は同一の既存153 runtime sourceを固定する指定であり、driverがb6 commitへ含まれるという意味ではない。最終配布SHAとの対応は後続のFILES manifestで固定する。
