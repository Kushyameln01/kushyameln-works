# 公開モデルAPI／Workerの接続検証（2026-11-02 JST）

公開の同一ページAPIと明示MessagePortを維持し、実Bernini全モデルownerへ接続した。通常入力はtensor契約・shape・モデル・容量で検査し、独立参照・gate・receipt・固定payload一致を要求しない。[API契約](../../../docs/shared/diffusion-models/api/MODEL_RUNTIME.md)。

## 再利用範囲

旧controlled N5/Text L3の数学・全40block/head・6更新は旧入力域の証拠のみ。今回のN5＋実Text L512は別の入力identityと独立参照で検証する。原寸target＋全contextはさらに別scope。

## 制御経路

source `7d8b0533588508985bfbe2a7caa5e79b957188e0` の初回pilotでは計測bootstrapのdynamic import中に初期load messageが失われた。119.6秒で停止し、モデル演算は実行されていない。WASM実行不能の証拠ではない。

source `7cf77c21889d9642e61d9a41d3242a816e24d6be` でbootstrapの初期message保持を修正。遅延した実Worker importによるred/green試験で一度だけ転送、listener除去を確認した。モデル演算・公開API本体の変更はない。

修正後の実File試験は15.264秒で成功。実pair load、重複load拒否、stale session拒否、HIGH/LOWのtimestep拒否、実patch計算中のhard cancel、再load、古いsession拒否、unload/dispose、保存入力tensor128値のcanonical保存・実ディスクFile読戻しが成立した。caller入力はbit保持。これは取消したprefixとcodecの試験であり、生成sampleの成功結果ではない。

数値実行と生成sampleの保存結果は、各normal predict/sample完了receiptと独立比較結果に基づいて追加する。

## 通常predictと6更新の数値結果

| 試験 | 実行source | 数値比較・保存 |
| --- | --- | --- |
| 公開HIGH predict、N5／実L512／t1000 | `7cf77c21889d9642e61d9a41d3242a816e24d6be` | 全40block・全5tokenへのhead・target2token抽出。最終128値fail0、最大絶対誤差2.7418136597e-6。canonical835Bの実File読戻しは全bit一致 |
| 公開sample、同一APIで取消→reload→HIGH3/LOW3 | `0f761f374dce1d447bbb912ad13c08f9bf85c279` | 各predict40block、合計240block、6更新。最終raw128値fail0、最大絶対誤差7.62939453125e-6、最大gate比0.000618276。canonical1179Bの実File読戻しは全bit一致 |
| 実L512・block0の中間境界 | `7cf77c21889d9642e61d9a41d3242a816e24d6be` | 33chunks／8,238,080値fail0。prefix、Q/K/V、self/cross/FFNとblock出力。headなしのblock診断で完全predictではない |

独立参照は `3e68d2fc54c67b16f8a82002f69fa183674a9f14` の新L512経路で生成した。新6更新の数値比較は**最終rawのみ**である。保存された16個の独立参照配列があることを、native側16配列の比較完了とは扱わない。旧N5/L3の16配列比較は、変更していないscheduler／Euler／HIGH→LOW／生成sample復元の元scopeに限定して再利用する。

sampleは最初のHIGH prefixを取り消し、同じAPI sessionで再loadしたreplacement modelSessionIdを使い、そのまま6更新を完走した。source guard、caller入力bit保持、stale返信拒否、unload/dispose、observer復元、全Worker終端を確認した。現在のrunに生存childはなく、RSS0のzombieは区別して記録した。

生成結果は `wan21-raw-generated-sample:v1`、shape `[1,16,1,2,4]`、raw/restoredのlatentContractを持つ。VAE model識別、HIGH/LOW両producer、Diffusionによる復元済み状態をcodec経由で保持した。posterior meanへ改名せず、mean専用復元は使用していない。positive／negativeは保存済み実Textの別owned copyで、CFG1のためnegativeの数値branchは未評価。元workflowのprompt／noiseとの同一性や生成品質を受け入れた結果ではない。

## 実測資源

| 対象 | HIGH predict | recovery sample6 |
| --- | ---: | ---: |
| host/browser runner時間 | 508.928秒 | 2945.988秒 |
| exec前から終了後までの外部観測時間 | receipt参照 | 2948.039秒 |
| RSS合算peak | 1,921,503,232B | 2,045,706,240B |
| PSS合算peak | 1,627,077,632B | 1,752,406,016B |
| 観測main Worker WASM peak | 384,172,032B | 324,534,272B |
| active samplerのshared ORT sessions | 2 | 2 |

同じ共有math/ops ownerをHIGH/LOWの各model statsから二重計上しない。各predictのblocksCompletedは最後の1回の40blockであり、120ではない。総240blockは6回の40block実行と進捗から確認する。初回取消Workerとreplacementの生存期間は別途receiptに記録した。

HIGH predictでは物理storage read17,243回、logical payload read182,132回、model fileの読出し合計15,574,833,216B、F32復号合計57,153,966,336Bを観測した。storage55.971秒、decode270.493秒、native Gemm45.424秒、prepared weight owner移譲57,132,974,080B。owner移譲はnative uploadの消滅を意味しない。累積runtime input span84,644,067,072Bはlive量や実copy byte数ではない。新L512と旧L3は入力が異なり、初期の独立参照とのCPU競合もあるため、全体時間を単純な改善率として比較しない。

## 最終の失敗時処理

独立レビューで、factoryが準備とcleanupの両方に失敗した場合に、呼出し側がcleanup ownerを失う経路を修正した。source `6d12140eeab204385fa31f5da73d4796968a4003` では、dispatchしたpaired loadの失敗後にWorkerを廃棄し、reloadが必要であることを明示する。既存ownerがある場合の重複load／P4 conflictは、dispatch前に拒否してownerを保持する。実行失敗でclosing／cleanupPendingが残る場合はcleanupRequiredを固定し、unloadで回復する。統計取得失敗だけで成功したunloadを取り残さない。

同sourceの実File試験15.010秒で、LOWへHIGH Fileを誤接続した拒否、Worker廃棄、fresh modelStatus、P4準備と解放（activeORTSessions0／readLeases0）、正常pair load、実prefix取消、reload、codec実File読戻しが通過した。数値kernels／成功時のmodel・sampler演算は変更していない。完全NNの実行sourceは上表に保ち、後続の例外処理修正後に全6更新を再実行したとは記載しない。

統合検証はAPI状態40、driver Node13／Python4、native関連83、公開API browser22が通過。初期sourceへの同じ失敗試験は19/40が失敗し、修正を検出した。browser22のactualModelsは空で、巨大モデル推論の証拠にはしない。実モデルを使う正常predict／sampleと失敗時smokeは別receiptである。

## 成立域と未受入事項

成立したのは、LoRAなし・保存済みN5のtarget/source/reference_video、実TextL512、明示noise、固定Euler/simple6/shift5/split3・CFG1、F32計算、明示COI4-thread構成での公開実行・取消後復帰・保存である。通常入口は固定payload hash・参照値・gateを要求しない。

原寸73947tokenのfull-block／完全predict／6更新は未完了。元媒体・元環境再現、全context query、query末尾、原寸cross/FFN/headと全工程peak、原寸raw sample、全モデルLoRA適用、生成品質は未受入。計画上限90000は検証済みdomainではなく、generationReadyとacceptedProductionはfalseを維持する。[原寸結果](../d1-d4-production-20261102/RESULT.md)と[evidence索引](evidence/README.md)を参照。
