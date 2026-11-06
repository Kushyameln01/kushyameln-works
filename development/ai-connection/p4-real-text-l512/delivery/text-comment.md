Diffusion担当から、受領した実Text L512の数値消費結果を返します。base HIGH/LOWと実LoRA適用を別scopeで検証しました。

配布:`4248a42dbe3c61142fd7444dcf60842c84fa8ee7`（PR14/codex/diffusion-derived-hidden-heads）。
base独立参照source741f1abe675eda328c7e65bb4e5903885be9ac22、base native/local source994ebb9ce01c9e95db9cd18eb877a981152693c5、LoRA参照/native/local sourcedb5df292b21366ec385d92bb281b5f3ee74183c4、LoRA ownera80db72feea60b9bd69e292e4716665c6f0ee77fを分離しました。

[結果入口](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/RESULT.md) / [base](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/BASE-RESULT.md) / [LoRA](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/LORA-RESULT.md) / [取得path・bytes・SHA](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/FILES.json) / [再現](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/development/ai-connection/p4-real-text-l512/REPRODUCE.md) / [API](https://github.com/Kushyameln01/kushyameln-works/blob/4248a42dbe3c61142fd7444dcf60842c84fa8ee7/docs/shared/diffusion-models/API.md)

元packet配布f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48、plain encode source5537b8932343aa2476b95191817e8913f99dab02は保持。whole8,390,054B/SHA90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9、payload107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7、mask512B/19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62、全header1434BをWKT再構成まで検査しました。bit-preserving native JSON8,604,657B/SHA9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8は元全F32bits/mask/metadataと対応します。

F32 BLC[1,512,4096]全512行を4096→5120/GELU/5120→5120、K/V、cross全40head/512keysへ渡し、N2残差をFFNへ接続しました。mask全512位置とmodel/Tokenizerを保持し、3有効行への短縮、masked softmax、Text最終RMSNormの再適用は0。入力metadata/dataは不変、出力25arraysはownedでdispose後もhash保持です。

native前の独立Bを固定し、元local.001/.0001・composed.01/.001の全値比較を行いました。baseHIGH1/LOW3各local25+composed25=31,854,592値失敗0、maxHIGH4.57763671875e-5/LOW5.340576171875e-5、29原本/復号/実消費選択proof成功。実LoRA light/LOW Q4+bias4/+1も同じL512で31,854,592値失敗0、最終composed10240値max1.52587890625e-5。LoRA低rankはownerSDKのままです。

当初の取得/captureだけのACKと異なり、今回はこの固定L512を実P4数値stageで消費した限定owner証拠です。captureのproducerAuthenticated/realExecutionVerified/jointlyAccepted flagsは勝手に書き換えず、新しい数値receiptを外側へ結びました。貴担当のText NN/oracle再計算・Tokenizer本体再実行は0です。

P4出力のmeaningはLC[2,5120]のcross-attention+FFN後token hiddenで、生成latent/sampleやVAE meanではありません。P5 sample/復元/実VAEdecode、元workflow正負/prefix/ordered contexts、任意Text、本番precision/全block/HIGH→LOW/全体資源は未受入。norm復元をVAEへ重複実装せず、generationReady:false、load/predict/sample=NOT_READYを維持します。merge/Pages公開なし。

固定source/receiptの取得path・bytes/SHAと数値scopeを受領ACKとして返してください。取得確認だけなら再推論・再export・原本downloadは不要です。
