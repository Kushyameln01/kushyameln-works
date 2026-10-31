# P0 — VAE / Text宣言と証拠の対応

新計画 `page_78c30bebe16481918944e621b8c2a02a`、版 `1.0-draft.1` に対する静的な対応表です。参照台帳は `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、VAE/Text sourceは `855f435120f08eb9e818e51281fc26f0e2633829`、Diffusion候補は `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` に固定しています。

[DECLARATION-BINDINGS.json](DECLARATION-BINDINGS.json) にVAE 3 profileとText plain/IDの5宣言、全12 normIdの読取元・外側field・必須条件・比較方法・欠落時分類を記録しました。[EVIDENCE-INDEX.json](EVIDENCE-INDEX.json) は62件、計531,578 bytesの小さい証拠と取得元・完全SHA・長さ・本来のscopeを参照します。必要な4 manifestは実bytesを変更せず同梱しました。モデル原本、ONNX、WASM binaryはコピーしていません。

## 判定範囲

P0の静的対応とbytes照合は完了しています。管理 `28596717182e48aeb23c719c51b6e593edf4e496` へのP1規範runtime導入は未実施なので、P2の正式採用は **BLOCKED** のままです。候補版を直接つなぐ数値診断は別scopeとして記録できますが、正式採用や全生成の受入にはなりません。

台帳のrecordId、rule ID、normIdは外側sidecarの参照だけに使います。native API・profileId・hash名前空間を変更していません。Textには独立したnative profileIdがないため、理由付きのnullとし、`wan-umt5-staged-fp32` をprofileIdへ改名していません。

| 宣言 | RGB / Text出力shape | raw mean shape | native profile |
| --- | --- | --- | --- |
| VAE F5 | `[1,3,5,16,16]` | `[1,16,2,2,2]` | `wan21-raw-f32-5x16x16` |
| VAE F1 | `[1,3,1,16,16]` | `[1,16,1,2,2]` | `wan21-raw-f32-1x16x16` |
| VAE Rect | `[1,3,1,16,32]` | `[1,16,1,2,4]` | `wan21-raw-f32-1x16x32` |
| Text plain | `[1,512,4096]`、BLC | 対象外 | null、manifest型と区別 |
| Text ID | `[1,L,4096]`、`1≤L≤512`、BLC | 対象外 | null、manifest型と区別 |

F5とRectはともに128値でも別profileです。maskの内部位置と出力L、producer列の順序とnative一意性、context/frame配列の順序と重複を保持します。RGBのFとlatentのTを同じframe数へ読み替えません。VAE model、Text model、Tokenizer、decoder graph、manifest、payload、native binary、外側packageの各hashを別の識別子として照合します。

## gateと証拠の分離

| 対象 | 取得したgate | 根拠と適用範囲 |
| --- | --- | --- |
| VAE 3 manifest | `atol/rtol/maxAbs=0.002` | 元の`comparisonGate`をそのまま保持したexporter既定診断gate |
| VAE F5ブラウザ診断 | `maxAbs=0.002` | 既存の固定PNG encode/raw decode記録。mean正規化ではない |
| VAE F1 / Rect受入 | `atol/rtol/maxAbs=2e-5` | 各pre-export acceptance planとowner receipt。元manifestの0.002やexport時pending表示を改変しない |
| Diffusion F5 mean | 往復`maxAbs≤2e-6` | 固定source `latent-space/test-cases.mjs` 28–29行の合成128値と独立staged-f32 oracle。current bd42 WASMの`rect-legacy-regression.json`で結び付く。F1/Rectからの転用ではない |
| Diffusion F1 / Rect mean | 往復`maxAbs≤2e-6` | 受領した実診断meanのnormalize/G1C保存/restore。全値oracle検査と往復gateは別検査。VAE NNの再実行ではない |
| Text最終出力 | `maxAbsError/rtol=0.001` | 選択manifestの`numericGate`。FP32診断scopeのまま、実ID fixtureの独立参照比較へ適用 |
| Text中間層 | peak正規化誤差 / relative RMS `≤1e-4` | 残りの層の処理前に明示改訂した`intermediateGate`。最終出力gateとは別 |
| Text初期中間層試行 | 絶対誤差0.001で **FAIL** | 誤差0.08984375の初回失敗JSONと[REPORT](evidence/owner/text/REPORT.md)を保持。初期gate合格にはしない |

Text manifestのSHA-256は `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f` です。選択manifestのgateは取得済みです。一方、既存のplain `Hello world` 記録はtokenize→24層・出力shape・mask・finite・MessagePort制御を確認したもので、plain専用の独立FP32参照との全値誤差receiptは含みません。その値はnull＋理由のままとし、ID fixtureの誤差を付け替えません。

## 取得・受領と欠落時分類

参照JSON 7件を取得記録と再照合し、選択VAE/Text sourceのGit固定bytes、Hike build recordと実kernelのhash/長さ、受領Diffusion build receiptの対象subsetを照合しました。[identity-verification.json](evidence/identity-verification.json) は静的観測です。現在のruntimeでkernelを新しくロードした、完全なDiffusion buildを再現した、数値試験を再実行した、という記録ではありません。

契約・必須identityが不明なら依存edgeをUNVERIFIED、既知の衝突はINCOMPATIBLEとします。契約が一致してgate/数値receiptだけ不足する場合は、契約上の互換性を維持し、検証NOT_VERIFIED・準備BLOCKEDとします。現在のresource状態は静的P0で取得できないため理由付きnullです。過去のcleanup件数を現resourceの再利用許可へ流用しません。LoRAなしのText/VAE edgeへLoRA variant、strength、registry、v1 adapter条件を強制しません。

生成sampleは`wan21-raw-generated-sample:v1`と別latentContractの宣言検査までです。mean成功やmetadataの`restored`だけで実sample復元/decodeを受け入れません。元81frame・480×832、実媒体全profile、元GPU precision、全native sessionと本番生成の資源予算は未受入です。

固定G1C codec `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b` は、normalized meanの`normalization`文字列を検査しますが保存しません。version付きmeaningは保存され、Diffusionの明示restoreは省略されたmarkerも受理します。一方、marker保持を要求してnormalized中間を管理captureへ渡すと、読戻し時の`/normalization`不一致として拒否され得ます。この文字列の保存保全まで保証しません。P2必須のraw mean/RGB保存と、owner memory上のnormalized tensorを直接restoreへ渡す処理を分け、normalizedの意味・marker・payload hash・規約をtraceに保持します。rawへの改名、codec変更、管理による数値変換は行いません。P2担当からは追加normalized package試行がこの境界でNN実行0回のまま失敗したと報告されており、その試行の実行記録はP2側で保管します。

## 静的な再照合

このdirectoryで次を実行すると、同梱62 entryのbytes/長さ/hashを再確認できます。モデル処理やネットワーク取得は行いません。

```sh
python - <<'PY'
import hashlib, json
from pathlib import Path
p = Path('.')
index = json.loads((p / 'EVIDENCE-INDEX.json').read_text())
assert len(index['entries']) == index['entryCount'] == 62
for entry in index['entries']:
    path = p / entry['path']
    assert path.resolve().is_relative_to(p.resolve())
    data = path.read_bytes()
    assert len(data) == entry['byteLength'], entry['id']
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['id']
print('PASS: 62 evidence entries')
PY
```

P0作成時には加えて、5宣言すべての12 normId参照、全managerFieldsの明示read binding、native profile/shape/byte長、gateの分離、全evidence参照、P1未導入/P2 BLOCKEDの保持を確認しました。P0の静的照合ではAPI変更、数値実装、NN再実行は行っていません。成果物の共有状態は[統括結果](../RESULT.md)とDraft PRへ記録します。
