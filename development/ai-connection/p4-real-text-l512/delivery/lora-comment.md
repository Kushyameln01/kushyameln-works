Diffusion担当からa80 canonicalの実L512接続結果を返します。新scopeは `real-text-l512-saved-low3-n2-block0-selected-light-q4-strength1`、PARTIALです。公開controlled K4/旧Q16とは別で、K4期待値を流用していません。

配布:`4248a42dbe3c61142fd7444dcf60842c84fa8ee7`（PR14/codex/diffusion-derived-hidden-heads）。
実行source:`db5df292b21366ec385d92bb281b5f3ee74183c4`、owner SDK/canonical/A functions:`a80db72feea60b9bd69e292e4716665c6f0ee77f`。元consumer契約pin7eeとactual execution sourceを分離しています。

[LoRA限定結果](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/LORA-RESULT.md) / [全値receipt](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/lora-reference/s1-local-receipt.json) / [actual receipt](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/lora-integration/s1-browser.json) / [全path・bytes・SHA](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/FILES.json) / [owner55file正本](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/lora/owner-source-files.json) / [再現](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/REPRODUCE.md)

実light/LOW File1,244,141,856B/SHA86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527bを選択し、crossQ full[5120,5120]先頭4行/全5120列＋bias4、strength+1を実装しました。55source取得/21overlay提供可能/actual11owner+29Diffusion URLsを別記。namespace overlayでexact a80 SDKを使い、P4 capture brandは同じURL/moduleで保持。other owner product fileへ上書きせず、低rank積をDiffusionへ重複実装していません。

独立Aは貴担当のmerge_reference/bias_reference等を未変更でimport。SDK weight20480値は事前abs1e-5/rel1e-4で失敗0/max2.4756445782259107e-9、bias4はexact。AをF32丸めしたpatchから独立B全25cutをnative前に固定しました。B manifest5fe895ce6f1673c49b9a60fbd79a6701b7e5dae8c3e26b13d9bf9c91d9b5706b、freeze43881ef034aaba2031680e5b3a88975e67fd57384fcf9d3eec9ffeeb228129c3。

actual SDK patch JSON461b643ebcd7a481f6bec905f4b2e5d925593811c391b5f55f141f37817c9961、independent A patch affd64f5f07bd6cd89fb9ba8bef485a58208d9052deb18fa04f3236e2808c5d0は別に保持。weightはA-rounded hashと異なります。SDK完成bytesを独立base decodeへoverlayした全29消費proofだけに使用し、B数値参照を書き換えていません。
B local25+composed25各15,927,296値、失敗0/max5.340576171875e-5。composed blockOutput10240値max1.52587890625e-5、local blockOutput bit一致。L512/mask512/model/Tokenizer/元5537のidentityは不変です。

immutable provider→SDK prepare→native sink owned81,936B→candidate実ORT/Hike1回→valid→commit epoch1→SDK/source/prepared release→active bytes保持→rollback epoch2→選択/未選択/旧base/旧patched lease readback→全session/lease/patch0まで確認。ownership independent-copyはsink境界、prepareLoadの追加numeric copyはfalse。commit/rollback後のNN追加0、実LoRA取消/-1/再適用/失敗復帰はこのscopeに含めません。

numeric capacity54,657,024B(5Memory、2ORTsessions共有16MiB)、core146.1977s/browser167.3255s。RSS和peak1,198,710,784B/PSS922,116,096B。copy/staging/retainedPatch/leaseと未知peakは分離し、全体予算は未受入です。

actual model source994のHIGH/LOW realText baseは別scopeで各31,854,592値失敗0。今回のLOW LoRAをHIGHや全targets/二組同時合成へ昇格しません。generationReady:false/NOT_READY、snapshot未公開、管理採用未確認、merge/Pages公開なし。固定source/receiptを取得したpath/bytes/SHAとscopeのACKのみ返してください。取得確認の再NN/再exportは不要です。
