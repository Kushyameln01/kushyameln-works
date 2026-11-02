# 512位置すべて有効なText conditioning fixture

[conditioning.wktensor](conditioning.wktensor) は、実Text encoderが出力した `[1,512,4096]` のfloat32 / BLC / `text_hidden_states`。全512位置のmaskが1で、`umt5-final-rmsnorm-f32-v1`、元modelとTokenizerのSHA-256をnative metadataに保持する。8,390,098 Bであり、重みfileではない。

通常の利用に必要なのはこのWKTと既存native codecだけである。外側の [manifest.json](manifest.json)、独立参照、gate、receiptは任意の開発診断資料で、tensorへmanagement fieldを追加していない。取得したWKTは既存 `decodeTensor()` へ渡し、返されたshape・layout・meaning・normalization・model/Tokenizer・maskを接続先の契約と照合する。

```js
import {decodeTensor} from '../../../../../docs/shared/inference/tensor.mjs';
const response = await fetch(new URL('./conditioning.wktensor', import.meta.url));
if (!response.ok) throw new Error('Conditioning download failed');
const conditioning = await decodeTensor(new Uint8Array(await response.arrayBuffer()));
```

これは `plain-long-eos512` の1caseで、入力はplainな `a` を511回並べた合成文とEOSである。固定Tokenizerではtoken289が511個、末尾はEOS1、合計512となる。Bernini prompt、重み付きprompt、画像・動画生成を含むfull workflowの品質例ではない。conditioningのprojection、cross-attention、そのFFNは接続先Diffusion側が所有する。

実producer sourceは `b3e5e34430d58bca3bf69b8938ba87beb196d054`。通常public Text factory、共有job、ORT CPU WASM1threadとHike最終RMSNormを通し、`diagnostics:false` で保存した。元WKTを変更せずコピーした。24層のrunと24 session releaseがcase receiptに記録されている。

独立FP32参照は元source `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` のfull512出力を再利用し、[diagnostic/plain-long-eos512-reference.f32](diagnostic/plain-long-eos512-reference.f32) に無変更で保存する。全2,097,152値を固定gateへ比較し、最大絶対誤差 `0.00039987266063690186`、maxAbs≤0.001とatol=rtol=0.001に合格した。元input recordのsource SHAも5954のまま保持し、producerのb3e5へ付け替えない。

この判定は当該plain caseだけに限る。別の `id-l512-all-active` は最大絶対誤差 `0.0016480088233947754` で固定gateに不合格のまま。receipt抽出時はhostが残りcaseを実行中で、全process・graph FDの最終cleanupと全体資源判定は未確定だった。このfixtureはText全domain、Browser取消、下流consumer、managementのREADY/ACKを成立させるものではない。

診断資料は [選択済みmodel manifest](diagnostic/prepared-model-manifest.json)、[元input record](diagnostic/input-record.json)、[case-native receipt](diagnostic/case-native.json)、[case比較receipt](diagnostic/comparison.json)、[独立参照case](diagnostic/independent-reference-case.json)、[codec読戻し検証](diagnostic/native-codec-validation.json)。case receiptは進行中の元receiptから抽出し、元fileのsnapshot hashを添えたものであり、host全体の完了receiptではない。

保存済みWKTの全value bit、全mask、descriptor・marker、独立所有buffer、再encodeした全fileのbitwise一致はNNなしで再確認できる。次の任意の診断はmodelを実行しない。`--files` は外側manifestに列挙したfileのbytes/SHAも確認する。

```sh
node development/inference/standalone-20261102/text/full512-conditioning/diagnostic/validate-codec.mjs --files
```
