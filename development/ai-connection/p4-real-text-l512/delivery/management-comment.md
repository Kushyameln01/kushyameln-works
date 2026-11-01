Diffusion担当から、実L512 baseと実canonical LoRAの限定数値結果を別scopeで返却します。配布 `4248a42dbe3c61142fd7444dcf60842c84fa8ee7`、branch codex/diffusion-derived-hidden-heads / Draft PR14です。

実行source：
- base独立composed:741f1abe675eda328c7e65bb4e5903885be9ac22
- base native/local:994ebb9ce01c9e95db9cd18eb877a981152693c5
- LoRA独立A/B・native/local:db5df292b21366ec385d92bb281b5f3ee74183c4
- LoRA owner SDK/canonical/reference:a80db72feea60b9bd69e292e4716665c6f0ee77f

[結果入口](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/RESULT.md) / [全public取得path・bytes・SHA-256](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/FILES.json) / [実行source186件](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/SOURCE-MANIFEST.json) / [再現](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/REPRODUCE.md) / [固定API](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/docs/shared/diffusion-models/API.md)

1. 実Text base：f76の原packet/model/Tokenizer/producer5537を保持した全512行を4096→5120投影/KV/crossへ渡し、N2残差をFFNへ接続しました。HIGH1/LOW3各local25+composed25=31,854,592値、失敗0。全cut最大絶対誤差HIGH4.57763671875e-5/LOW5.340576171875e-5、全29原本/復号/消費選択proof通過。[base結果](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/BASE-RESULT.md)
2. 実LoRA：light/LOW・crossQ先頭4行×全5120列＋bias4・strength+1のみ。a80 ownerコードの低rank積を使い、immutable Hike base→SDK完成F32→sink→actual ORT weight/Hike biasへ渡しました。A weight20480値max2.4756445782259107e-9、bias4exact、B local25+composed25=31,854,592値失敗0、composed blockOutput max1.52587890625e-5。[LoRA結果](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/LORA-RESULT.md)
3. A-rounded F32とSDK完成F32を別hashで保持。Bを書き換えず、SDK bytesの消費照合だけを独立overlayで検査。candidate内NN1回→commit1→SDK/prepared解放後copy保持→rollback2→旧base/active lease readback→全lease/session/patch解放を確認。commit/rollback後の追加NNは0です。

既存local abs.001/rel.0001・composed abs.01/rel.001を維持。新gate緩和、元core/kernel変更、pointwise1048576/mean128 cap変更、Text再encode/モデル再export、旧prefix/tail再計算は0。旧Q16/正式82b/固定N2受入は元source/scopeで保持します。

数値stageのWASM capacityはbase21,102,592B、LoRA54,657,024B（owner32MiB含む）。2ORTsessionsは1個の16MiB Memoryを共有。base core147.640s/149.2032s、LoRA146.1977s。linear snapshot26,825,525,760B/runは累積copyでpeakではありません。RSS/PSS/cgroupとnamed buffers、staging、leaseは各receiptへ分離。全工程/allocator/GC/FileBacking peakはnullで、全体資源予算の受入ではありません。

[catalog supplement](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/catalog-supplement.json) は同一P4 candidate profileへのowner証拠追補で、共通catalog採用/管理dispatch/共同snapshotを先取りしません。全workflow contexts・本番shape/precision・全block/最終head・実HIGH→LOW・生成/VAE decode・他LoRA範囲は未受入、load/predict/sample=NOT_READY、generationReady:false。merge/Pages公開なし。

固定source/manifestの取得commit/path/bytes/SHAと確認scopeのACKだけを返してください。取得確認のための再推論・再export・原本downloadは不要です。
