# 通常LoRA取引の実装・検証結果

2026-11-02。今回の受入は、既知のweight shapeでの通常取引、理由付き非対応、取消・復帰・解放まで。`PASS_LORA_NORMAL_REAL_PARTIAL`。全model推論、生成READY、管理の新normal facadeへの共同採用は含めない。

## 固定sourceと配布

| 用途 | 完全commit |
| --- | --- |
| 今回のLoRA実行source | `126614a8cf99b6c80243595309ae0e6e704d780f` |
| 今回読み込んだDiffusion正本 | `48ff155988d995fc2569e495c8d8820273bd472c` |
| 今回使用した管理queue | `8849891f19124df31847bd691503c2491278eaa8` |
| 再利用oracleの生成source | `a80db72feea60b9bd69e292e4716665c6f0ee77f` / core `7ee36228030ba3bb544a90b1d4b528702a7bae32` |

branch `feat/lora-hike`、Draft [PR #2](https://github.com/Kushyameln01/kushyameln-works/pull/2)。配布commitは、この文書とmanifestを指す送付URLの完全SHAを使用する。実行sourceを結果文書の追加commitへ付け替えない。[EXECUTION-SOURCE.json](./EXECUTION-SOURCE.json)に実ロード47sourceのcommit/path/bytes/SHA-256/Git blobを保存した。

Diffusionの既存通常実行source `30e283bb115741af6b475e9bdc41700a4e564053`の結果とは別の実行である。準備中だった9d上の独自native patchは未配布で廃止し、48ffの正本を変更せず使用した。その提案の18件を今回の合格件数へ流用していない。

## API差分

[通常API](../../../docs/shared/inference/lora/NORMAL-TRANSACTIONS.md)、[変更境界](./PLAN.md)、[owner取得証拠](./OWNER-ACQUISITION.json)。

- SDK v2 `stage(...,{validationMode:'normal'|'diagnostic'})`を任意追加。明示modeは検証・commitのwrapperまで一致必須。省略時の既存context/result、v1、旧Q16経路は維持する。
- canonical P4 adapterを`lora-diffusion-p4-adapter/0.2-draft.1`へ更新。`describeCapabilities()`と`assessSupport()`がweight target/full shape/範囲/storage・compute dtype/binding/loader/block上限、対応可否と理由を返す。画像F/H/Wやmean APIは追加していない。
- owner48ffではnative `validate`が`admission/0.1`、`diagnose`が数値`validation/0.1`、`commit`は内部`admittedAtEpoch`を要求する。adapterがSDK modeを翻訳する。nativeに架空のmode/capability methodを要求しない。
- 通常factory/取引にrun、conditioning、独立expected、数値gateは不要。診断時だけ独立参照を使用する。registryの構造的`gateId`はowner内部のadmission識別子で、callerに数値gateを要求するものではない。
- 原本hashとownerのsource/base/loader/full-coordinate range記録を照合。未知variant、転置、任意base、未実証rangeを既定値で通さない。学習base同一性の証明へは拡張しない。

## 今回の通常受入範囲

選択Fileは`Bernini-R_LightX2V_low_noise.safetensors`、1,244,141,856 bytes、SHA-256 `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b`。新load時のheader/全体hash検査を実施した。他3原本の取得は要求していない。

baseは保持済みLOW、15,574,833,216 bytes、SHA-256 `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`。既存の全体hash receiptと現在のsize/mtimeNs/dev/inoが一致し、実行前後のFile identityも不変。[BASE-REUSE-RECEIPT.json](./BASE-REUSE-RECEIPT.json)に再利用条件を保存。今回全体hashは再計算せず、新規header・実rangeの検査を維持した。

| target | full shape / 実適用領域 | storage → compute/feed | 実binding |
| --- | --- | --- | --- |
| `blocks.0.cross_attn.q.weight` | `[5120,5120]`の先頭4行・全5120列、offset0/count20480 | scaled `F8_E4M3` → F32 row-major | runtime-input / ORT weight |
| `blocks.0.cross_attn.q.bias` | `[5120]`の先頭4要素 | F16 → F32 | hike-parameter / 明示bias |

loaderは`comfy-lora-b5a4321-linear-diff-v1`。選択QはBF16 low-rank、rank128/alpha128、biasは明示`diff_b`。完成F32をsinkへ渡し、元baseを変更しない。未選択row/targetはbaseを保持。**coverageはPARTIAL**のままで、通常検証の合否と別fieldに記録した。

## 新規検証結果

最終Nodeは**140/140 PASS、fail/skip 0**。旧7ee診断互換は別試験**26/26 PASS**。後者を重複加算してユニーク件数とは表示しない。mode/receipt偽装、wrong scope/count/epoch、未知source/base/range、block制約、取消、旧plan失効、旧rollback、prepared寿命、v1互換を含む。[ログ](./verification/node-140.log) / [旧sourceログ](./verification/legacy-7ee-26.log)。

実File試行は固定126614で**1試行・1合格**。通常取引の順序と独立したrevisionは以下のとおり。

| 通常取引 | strength | SDK local revision | 管理revision | native epoch |
| --- | ---: | ---: | ---: | ---: |
| 初回適用 | 1 | 1 | 4001 | 1 |
| 強度変更 | -1 | 2 | 4002 | 2 |
| 再適用 | 1 | 3 | 4003 | 3 |
| prepare取消後の復帰 | 1 | 6 | 4005 | 4 |
| validation-call取消後の復帰 | 1 | 9 | 4007 | 5 |
| base復帰 | — | 前planとの共通revisionにしない | 4008 | 6 |

通常native validateは7呼出し。全てidentity/signal/isCurrentのみ、expected/gate/input/run/native modeなし。通常系列でnative diagnose/forwardとも**0回**。5件のSDK適用receiptはcompact UTF-8 JSONで4,338〜4,368 bytes（独立診断・capability queryを含まない）。成功stateは`CONSUMER_APPLIED`で、snapshot公開や生成READYを意味しない。[NORMAL-RESULT.json](./NORMAL-RESULT.json)。

5種類の非対応要求（未知原本、未知target、slice shapeのfull shape偽装、未実証row、異なるmodel）を理由付きで拒否し、native prepareへ渡していない。prepare/validation-callの取消は元Promise終端、stop確認、resource release、再利用可能、quarantineなしを確認。取消中は既存active feedを保持した。validation-call取消は同期admission完了後からcommit前の停止であり、同期Hikeの途中を強制中断した試験とはしない。

## 診断・再利用証拠

既存a80 oracle manifest **21,434 bytes / SHA-256 `04e643dfddf37337c44d210d20c44b9eefe0d2328efbc7833a0903d59c0167ef`**を再利用。新規oracle生成・再exportなし。既存数値受入のsource/scopeを変更せず、新通常経路の完成値を事後比較した。

- 適用5件それぞれW20,480値＋bias4値：失敗0。W maxAbs `2.4756445782259107e-9`、bias厳密一致。
- 通常適用後にprepared/選択LoRA read capabilityを解放した状態の実ORT/Hike出力10,240値：失敗0、maxAbs `3.2186508178710938e-6`。
- 通常base復帰後の実出力10,240値：失敗0、maxAbs `6.079673767089844e-6`。

これは別工程の**診断forward2回**で、通常検証の前提にしていない。N2/K4 controlled caller input、producer-authenticatedではない。[数値集計](./diagnostics/NUMERICAL-RESULT.json) / [完全receipt gzip](./diagnostics/real-run1.json.gz) / [2出力とprivate成果物の識別](./ARTIFACTS.json)。選択済みweight/biasの実バイナリと原本・base・oracleはprivateに保持し、Gitへ追加していない。公開したF32は診断のactivation出力2件。

## 所有権・資源

sinkが完成F32をprivate copyし、candidate/active/leaseが必要bytesを保持する。prepareLoadでの別の全数値copyを意味しない。prepared/package解放後の実operator weight/bias binding、旧epochのread lease、後続commit後の旧rollback無効を確認。strength変更は不変baseから再構築し、正の再適用4件のweight/bias hashが一致した。

native admissionの`immutableBasePreserved`単独をsource寿命証明とはしない。今回のcurrent callbackはowner生存＋actual source.disposed=false＋初期descriptor一致へ束縛。実execution ownerのprivate source/closing guardと、任意mutable custom sourceを区別した。[寿命レビュー](./verification/OWNER-SOURCE-LIFETIME-REVIEW.md)。

base復帰後と最終dispose後にretained/pending/active patch bytes、packages、candidates、transactions、read leases、inFlightはいずれも0。診断2runtimeともORT session0でdispose。queue→SDK→feed→sourceの終端処理後、source owner-current=false、cleanup/page/server error0。

[資源実測](./RESOURCE-RESULT.json)の所有Node＋Chromium process-tree RSS標本合計の観測最大は**1,063,436,288 bytes**。298標本、終了時のVmRSS未取得2件・不完全標本1件があり`PARTIAL_SAMPLED_OBSERVATION`。通常＋別診断を含む標本値で、通常単独のpeakやOS/device peak・上限保証ではない。WASM capacity、copy traffic、private retained bytesをRSSへ合算していない。

## 未受入事項

default source bindingはlight LOWのQ4＋bias4のみ。native registry全12/optional16 targetが通常LoRAで受入済みとは扱わない。他pair/side、未実証row/target、任意full shape、全target適用、二組同時合成は未受入。対応graph/consumer・owner記録成立後に追加する。

管理884 queueでのrequest/取消/終端は確認したが、新管理normal facade・HIGH/LOW共同snapshot・Text由来の自然入力・全model session・生成寄与・元81frame workflowの実行は今回未受入。merge/Pages公開なし。固定sourceと成果物は管理・Diffusionへ送付し、送信側の再取得照合と相手本人の取得ACKを分けて報告する。相手本人の新規ACKは受領待ち。
