# DiffusionModels 通常実行と診断の分離結果

2026-11-02 JST。実行source：`30e283bb115741af6b475e9bdc41700a4e564053`。変更前基点：`9d67561685173de6529d6f22e79088bb75a6a679`。APIは`diffusion-models/0.1`の追加操作として提供する。

**通常P4はdescriptorと実装能力で判定し、固定payload hash・既存数値receipt・独立参照を要求しない。** 実LOW・N2・block0・L512を通常入口で完走させ、既存独立参照gate内であることを確認した。通常と診断は同じ数値stageを使い、最終hiddenはbit一致した。全モデルload/predict/sampleはNOT_READYを維持する。

## 配布物とAPI差分

- [通常API契約](../../../docs/shared/diffusion-models/execution/README.md)：単独owner、Worker／MessagePort、tensor入出力、取消／解放、制約と必要拡張。
- [capabilities.mjs](../../../docs/shared/diffusion-models/execution/capabilities.mjs)：shape・dtype・意味・正規化・容量と対応判定の正本。shape計算や数値変換を管理側へ複製しない。
- [p4.mjs](../../../docs/shared/diffusion-models/execution/p4.mjs)：単独`createBerniniP4Execution`。`run`は最終tensor/state/resourcesのみ、`diagnose`は同じ演算の25cutと詳細evidence。
- 既存`createDiffusionModels().request`へ`checkSupport`、`prepareP4`、`runP4`、`releaseP4`を追加。`capabilities.executionDescriptor`に通常契約を追加。既存envelope・build/session/job/revision・stale返信排除は維持。
- weight feedの`validate(candidate,context)`を通常構造検証、`diagnose(candidate,diagnosticRequest)`を独立数値比較へ分離。commitはnative内部のadmission状態に従う。registry hashとvalidate結果の契約は変わるため、旧診断adapterをそのまま通常adapterとは扱わない。

source、mapping、数値演算の正本は既存P4 source/feed/stageを共有した。WASM kernel・graph・正規化定数・既存gateの変更、上限の引上げ、Text再encode、低rank積の再実装は行っていない。model/tokenizer/kernel/packageのhashによるidentity・integrity検査は残し、固定サンプル内容との一致から分離した。通常weight readの範囲hash計算は省略でき、テストでdigest呼出し0を確認した。

## 通常実行の新規検証

[browser receipt](diagnostics/normal-low-browser.json)のSHA-256：`76046761d6dad3e94282455584b1e395885144d400a7e7f60163786feb8f2ff3`。private tensor本体は公開receiptへ含めていない。

| 対象 | 結果 |
| --- | --- |
| 通常LOW P4、実Text L512、固定保存N2 residual／timeAct1 | 131.1821秒で完走。出力LC `[2,5120]`、全10,240値finite、caller入力を保持 |
| 既存composed参照との通常出力比較 | abs0.01／rel0.001、失敗0、maxAbs `2.09808349609375e-5` |
| 同じ入力の明示diagnose | 143.7854秒。25cut×local／composed、各15,927,296値、計31,854,592値、失敗0。全cut最大絶対誤差 `5.340576171875e-5` |
| 通常／診断の最終hidden | bit一致。SHA-256 `fb76e71e53571d5318eb54e0c2faaaa83b274d40302da16191427fc13a4d70a3` |
| N3・N32760・非empty context | supported:false、必要拡張を返却。実行拒否で追加model readは各0 |
| 別内容のL1／hidden | 固定payload以外を受理し、実最初のweight tileまで到達。busy拒否・AbortError・入力保持・取消後lease/pending tensor0 |
| 単独owner解放 | 0.6ms、session／lease／patch保持0。以後のrunはDISPOSED |

gateは既存の`abs(actual-reference) <= absolute + relative*abs(reference)`。local abs0.001／rel0.0001、composed abs0.01／rel0.001を固定し、参照値やgateを変更していない。L1の全完走と独立数値受入は今回は行っていない。

通常返却tensorは40,960 B。診断の25cutは63,709,184 Bであり、通常入口へ全中間出力を持ち出さない。normal入力snapshotは8,450,560 B、Hike固定Memoryはsource1,572,864＋math1,638,400＋attention1,114,112＝4,325,376 B、ORTは2session。今回の通常responseはORT allocator容量やhost peakを確定値として返さない。旧scopeのORT Memory証拠を通常の全資源受入へ拡張しない。

モデルの全payload一括readは0、payload read上限は163,840 B、headerを含む最大File sliceは181,280 B。normal＋diagnose＋小weight検証等の累積File readは1,049,435,371 Bであり、同時live量ではない。Browserプロセス群の全harness観測peakはPSS972,460,032 B／RSS合計1,254,195,200 B。これには準備、参照読込、診断配列等を含み、normal単独のallocator／全pipeline peakとは扱わない。時間もこの環境の観測であり、速度比較benchmarkではない。

## LoRA通常consumerの検証と引継ぎ

LoRA担当の既存完成F32 artifact（SHA-256 `461b643ebcd7a481f6bec905f4b2e5d925593811c391b5f55f141f37817c9961`）を再利用した。低rank積の再計算は0。native sinkへLOW cross Qの先頭4行×全5120列とbias4値を渡し、通常validate → commit → package解放 → 実ORT Gemm → 実Hike biasを確認した。

通常admissionとcommitは`numericalComparison:false`で、独立参照やrun callbackを受け取らない。数値比較は診断caseがその後に行い、既存独立LoRA Qの選択8値に対してabs0.01／rel0.001、失敗0、maxAbs `1.430511474609375e-6`だった。これはQ4+bias4のconsumer境界であり、新通常経路でのLoRA全P4 block受入ではない。

package解放後のcandidate所有、旧base leaseの不変、rollback後のpatch lease保持、未宣言rowのbase保持、復帰後のcandidate/package/lease/pending/patch bytes0を確認した。検証済みcandidateの配列をcallerへ渡して再提出させず、native owner内部へ保持する。

LoRA担当へ渡す変更は、registryの`validationGate`（構造検証）と`numericalDiagnostics`（任意独立比較）の分離、通常validateの引数／結果、candidateのnative admission、consumer切替／復帰の契約である。[API契約](../../../docs/shared/diffusion-models/execution/README.md#lora-weight-feedの通常検証)に記載した。取得したLoRA側c4860579d01d9f704cb16714e364a22668f9d57eのP4-APIも、独立参照と診断gateをcommit前に要求する契約である。新通常adapterとの共同受入は未実施。既存の旧sourceでのLoRA A/B受入は、そのscopeを保持して再利用する。

[LoRAへの引継ぎ](LORA-HANDOFF.md)を[PR2へ投稿](https://github.com/Kushyameln01/kushyameln-works/pull/2#issuecomment-6564381875)し、本文の一致readbackを確認した。[DELIVERY.json](DELIVERY.json)に相手の固定仕様書の取得bytes・hashと送信結果を記録した。相手のACK・新adapter受入は未確認。

## 管理の共有shape規則との照合

[照合receipt](management-shape-correspondence.json)と[説明](management-shape-correspondence.md)に、管理側固定source `59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f`の取得path・bytes・hash・行を記録した。

管理の`SHAPE-BERNINI-BLOCK0-N2-CROSS-FFN-F32`はN2／5120／Text4096・L1〜512／FFN13824／40head×128と一致する。`N-P4-NUMERIC`の固定HIGH1／LOW3・保存input／cohort hashは診断条件として保持する。管理の既存output semanticIdは`works:p4-output:NAME:f32`でownerNativeMeaning未指定のため、新通常tensorの意味への明示adapter bindingは未適用。管理側採用・共同snapshot・相手の取得ACKが成立したとは報告しない。

全体待機列と工程管理は管理側。通常ownerは内部の数値演算、候補、source lease、ORT sessionとWASM資源の寿命を所有する。管理側へshape算出・正規化・LoRA mappingの別実装を追加していない。

## 取消・解放と回帰

- [RPC browser](diagnostics/rpc-browser.json)：固定source30e283bで9項目合格。LOW prepare/release後session・lease0、実Workerのpending runを20msで取消しCANCELLED／Worker終了、再生成後P4_NOT_PREPARED、disposeを確認。
- [Node検証log](diagnostics/node-verification.log)：61件合格。normal ingress、shape／意味／正規化、source/feed、任意F32、欠損／範囲外／非finite、stale取引、abort中hash、candidate予算、既存診断の数値条件を確認。
- [既存外部API browser](diagnostics/legacy-api-results.json)：22項目合格。primitive、tensor境界、MessagePort、stale／cancel／dispose、NOT_READYを保持。
- [実ORT/Hike小境界](diagnostics/focused-runtime-browser.json)：full inner13824のFFN down、score、入力snapshot、取消／解放を再確認。これは実行source固定前の小境界確認であり、最終30e283bの直接数値証拠は上記normal-low-browserを使用する。

通常Workerの取消はそのownerごとWorkerを終了するため、次のP4実行は再prepareが必要。単独ownerのAbortSignal取消はlease／pending tensorを終端化しownerを再利用できる。

## 固定sourceと再現

[EXECUTION-SOURCE.json](EXECUTION-SOURCE.json)は実行source30e283bの117ファイルをpath・bytes・SHA-256・git blobへ対応付ける（113 build closure＋4診断source）。build IDは`diffusion-models/0.1+2fb82c63758d657932ffdf063f438c7ad183501b3f1ae72ed24d0fe2b2cd1ae8`。

```sh
git checkout 30e283bb115741af6b475e9bdc41700a4e564053
PYTHONDONTWRITEBYTECODE=1 node --test --test-isolation=none \
  docs/shared/diffusion-models/execution/test-*.mjs \
  docs/shared/diffusion-models/ort-bridge/post-self-attention/test-*.mjs \
  docs/shared/diffusion-models/diagnostics/p4-cross-ffn/test-*.mjs \
  docs/shared/diffusion-models/diagnostics/p4-real-text-l512/test-*.mjs
python development/ai-connection/normal-execution-20261102/diagnostics/rpc-browser.py
python development/ai-connection/normal-execution-20261102/diagnostics/run-browser.py \
  --source-commit 30e283bb115741af6b475e9bdc41700a4e564053
```

browser試験にはChromium／Python Playwrightとloopback配信が必要。数値再現には保持環境のLOW model、保存N2 tail、実Text、既存local/composed参照、LoRA完成artifactを要する。原配置・bytes・hashは診断の`frozen-input-reference-receipt.json`／`weight-feed-input-freeze.json`に記載した。55件の入力／参照、5件のweight検証入力を実行前後に再hashし不変を確認した。公開cloneだけでprivate tensorを取得できたとは扱わず、上記実行はそれらがある環境で行う。通常利用自体は、その固定artifactを要求せずcallerの対応tensorを使える。

## 残る対応shape・未受入事項

通常P4はblock0、N2、Text L1〜512、contextなし、F32だけ。HIGH通常完走、新しいL1の全完走／独立数値受入、前段prefix／QKV／自己注意tailの通常factory化、管理新adapter採用、LoRA新通常SDK adapterの共同受入、weight取引のRPC公開は今回の受入に含めない。

元81frameのmodel／LoRA／prompt／noise条件、本番全N・全block・head、実HIGH→LOW、元production precision、全工程Memory／copy予算、生成とVAE decodeは別受入である。`load/predict/sample=NOT_READY`／`generationReady:false`を維持する。merge・Pages公開は実施しない。
