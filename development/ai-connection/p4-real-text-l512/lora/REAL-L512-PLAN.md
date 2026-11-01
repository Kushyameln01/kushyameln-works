# a80 canonicalによる実L512 LoRA限定接続

baseのHIGH/LOW全値受入後に追加されたowner正本
`a80db72feea60b9bd69e292e4716665c6f0ee77f` を使う。
最初の実LoRA scopeはlight/LOW、block0・LOW3の保存N2 residual/timeAct1と実Text L512、
cross Q weight full[5120,5120]の先頭4行×全5120列、bias full[5120]の先頭4値、strength+1に限定する。
HIGH/LOWの一組や二組の同時合成をこの受入へ含めない。

1. owner公開source55fileと選択LoRA原本を固定する。既存Q16とcontrolled K4結果は別scopeのまま保持する。
2. independent Aはowner `p4-lora-reference.py` の `merge_reference/bias_reference` 等をexact sourceでimportする。
   BF16 DOWN[128,5120]・UP[4,128]、alpha128、diff_b4を独立decodeし、weight20480値はF64、bias4はF32で固定する。
   owner事前gateはweight abs1e-5/rel1e-4、bias exact。Diffusionは低rank積を実装しない。
3. independent BはAをF32へ丸めた疎patchと不変base、実L512・保存LOW入力から元coreの25cutを計算する。
   SDK/Hike出力を見てA/B期待値を書き換えない。B manifest/input/weight/gateはmodel NN前に固定する。
4. SDKはownerの `createLoraV2` と `createDiffusionP4Adapter` を未変更で使う。
   HTTP source overlayはLoRA名前空間だけを固定a80から提供し、P4 core URLは本担当と共有してcapture brandを保つ。
   各取得path/bytes/hashと実request sourceを照合する。他ownerのproduct fileを上書きしない。
5. immutable Hike baseProvider→owner SDK低rank計算→sinkのowned完成F32→candidate→実ORT weight/Hike biasへ接続する。
   完成F32をAの数値gateへ比較し、実消費bitsをSDK package/patch hashへ結ぶ。
   A由来F32のhashとSDK完成F32のhashは別欄に保持し、数値gate内の差を隠さない。
6. candidate内の一回の実L512 stageを独立Bの全25cut・最終10240値へ照合する。local gate.001/.0001、composed.01/.001。
   全29原本選択のraw/独立decodeを保持し、patched weight/biasの実F32は完成SDK packageとの消費proofで区別する。
7. commit後のactive view、旧base lease、SDK/prepared解放後のbytes、rollbackのbase復帰、各lease/session終端を検査する。
   commit後/rollback後のmodel再実行を行わない場合は、byte readback受入と明記しNN証拠へ加算しない。
8. SDK staging・package/active/lease・copy・WASM・RSS/PSS・時間をbaseと別scopeで測定する。
   本番shape・元precision・全block・実HIGH→LOW・全体資源予算・生成受入は含めない。

`load/predict/sample=NOT_READY`、generationReady:falseを維持する。
