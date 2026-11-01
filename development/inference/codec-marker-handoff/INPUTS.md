# Rect / Textの既存ローカル入力handoff

対象は既存bundleと選択manifestの受渡しです。native APIは`works-ai-1`、既存VAE/Text証拠sourceは`855f435120f08eb9e818e51281fc26f0e2633829`、今回のnative configure sourceは`2bdca59ea78580d4fe7a9d31a8de33209b64d029`、管理sourceは`edda43f9ea69c5b3ab1af3c6eb82295f2912887c`です。このINPUTSの受渡し自体はnative API・数値処理を変更しません。別作業のcodec差分は同directoryのRESULT.mdを参照します。再export、NN推論、元モデルの再棚卸しは行っていません。

[INPUTS.json](INPUTS.json)に正確なMapキー、file/bytes/hash、ローカルpath、source inspection、gate参照を記録しました。必要なmanifestだけをP0証拠からbyte exactで再利用しています。原本・ONNX・Tokenizer本体・norm重みのコピーや公開はしていません。`manifests/`だけでは実行用bundleになりません。

## Rectの4 assetsとmanifest

選択manifestは[manifests/vae-rect/manifest.json](manifests/vae-rect/manifest.json)、4,820 bytes、SHA-256は`450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`です。既存private bundleは`/workspace/work/inference/e6-rect/accepted-bundle/`に保持しています。

| manifest role | Mapキー | bytes | 使用するnative操作 |
| --- | --- | ---: | --- |
| encoder | `encode.onnx` | 212,362,391 | encode |
| decoderBody | `decoder-body.onnx` | 286,313,363 | decode |
| conv2Weight | `conv2-weight.f32` | 1,024 | decode |
| conv2Bias | `conv2-bias.f32` | 64 | decode |

4 assetsは合計498,676,842 bytes、manifest込みでは498,681,662 bytesです。全assetの期待SHAはmanifestとINPUTS.jsonに保持しています。入力表の作成では存在と長さだけを確認しました。別のVAE-owner検証`check-rect-assets.py`は4 assetをstream hashし、498,676,842 bytesすべてが一致しました（0.713秒、NN0）。そのreceiptは`evidence/rect-assets.json`です。このasset照合と、管理側が実際にローカルFileを利用できた結果は別scope・別receiptです。

native呼出しは`api.vae.configure({manifest,files})`です。`manifest`は読み込んだJSON、`files`は上表の正確なキーを持つ`Map<string,File|Blob|Uint8Array>`です。nativeにはmanifestを別引数で渡すため、Map内の`manifest.json`は必須ではありません。既存の単独UIはフォルダ選択からちょうど1件の`manifest.json`を探し、選択fileを`File.name`でMapへ入れるため、このファイル名が必要です。同名fileの重複は拒否されます。

profileは`wan21-raw-f32-1x16x32`、RGB`[1,3,1,16,32]`、raw mean`[1,16,1,2,4]`です。同じ128値のF5 profileへの置換やmanifestだけのshape変更はしません。VAE modelの識別はmanifestの`/model/sha256`、decoder graphは`/assets/decoderBody/sha256`で別に照合します。

gateの参照先も分けます。

- manifestの`/comparisonGate`は元のexporter既定値0.002です。
- [Rect事前計画](../reference-adoption/p0/evidence/owner/e6/acceptance-plan.json)の`/comparisonGate`と[受入receipt](../reference-adoption/p0/evidence/owner/e6/receipt.json)の`/acceptanceGate`はnative全出力比較の2e-5です。
- Diffusion mean往復の2e-6は[P0 gateCatalog](../reference-adoption/p0/DECLARATION-BINDINGS.json)の`/gateCatalog/mean-rect-roundtrip`に帰属し、VAE raw decodeのgateへ転用しません。

## Textのmanifest・gateとsource File

選択manifestは[manifests/text/manifest.json](manifests/text/manifest.json)、19,908 bytes、SHA-256は`aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`です。`/numericGate`は`maxAbsError=0.001`、`rtol=0.001`、scopeはFP32 source-reference diagnosticsです。原GPU FP8算術の同等性を保証するgateではありません。

既存bundleは`/workspace/work/inference/text-implementation/bundle/`、元モデルは`/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`です。Mapキーは次のとおりです。期待SHA・bytesと24個の完全なpath一覧はmanifestとINPUTS.jsonにあります。

| Mapキー | 用途 |
| --- | --- |
| `block-00.onnx`〜`block-23.onnx`、各pathを正確に保持 | 24層、ID/plain共通 |
| `embedding-row-sha256.bin` | 元embeddingの使用row検査、ID/plain共通 |
| `final-norm.f32` | 最終Hike RMSNorm重み、ID/plain共通 |
| `spiece.model` | plain textの元SentencePieceモデル |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 元F16 embeddingの部分読出し、ID/plain共通 |

native呼出しは`api.textEncoder.configure({manifest,files})`です。元モデルは`manifest.embedding.sourceFile`のキーでMapへ追加します。既存UIでは実行用フォルダと元モデルを別々に選び、元モデルの`File.name`をキーに追加するため、元のファイル名を保ちます。元モデルを`arrayBuffer()`で一括読み込みして新しいFileを作る必要はありません。ユーザーが選択したFileをそのまま渡します。

```js
// ユーザーが選択したFileListを使用する。HTTPへのmodel uploadは行わない。
const files = new Map();
for (const file of selectedBundleFiles) {
  if (files.has(file.name)) throw Error('Duplicate local filename');
  files.set(file.name, file);
}
const manifest = JSON.parse(await files.get('manifest.json').text());

// Textのみ。SDKのMap keyはmanifestに記載された正確なsourceFile名。
files.set(manifest.embedding.sourceFile, selectedOriginalSourceFile);
api.textEncoder.configure({manifest, files});
const configured = api.textEncoder.capabilities();
```

Rectでは最後の2行を`api.vae.configure({manifest,files})`と`api.vae.capabilities()`に置き換えます。これは入力設定の例で、`configure`成功は実asset hash検査やNN受入の証拠になりません。このhandoff検査では`encode`/`decode`を呼びません。

モデルは`/modelSha256`、Tokenizerは`/tokenizer/sha256`、最終normは`/finalNorm`のpath/bytes/hash/epsilonを使います。`/intermediateGate`と[初回失敗履歴](../reference-adoption/p0/evidence/owner/text/REPORT.md)は最終gateと区別します。独立したnative Text profileIdを作らず、`wan-umt5-staged-fp32`はmanifest型として保持します。

元モデル6,735,906,897 bytesと24 graph合計18,523,750,008 bytesは既存のままです。一層ずつの実行は同時常駐量を抑える方式で、保存容量の削減ではありません。plain text用Tokenizerを含むruntime入力28 fileは元モデル込み25,272,425,890 bytesです。manifestと任意の参照fixtureはこの合計に含みません。

plainの`Hello world`は既存のroute/shape/mask/finite記録を維持します。独立FP32参照とのplain全値比較は別残件です。選択manifestのgateを取得したことやID fixtureの数値合格から、plain全値比較の合格を補完しません。再export・24層再推論は今回の確認に含めません。

## 管理への渡し方と環境の区別

管理の`adapters/text-vae.mjs`は注入された`nativeClient`のメソッドへ`q.input`をそのまま渡します。管理はmodel fileを自動取得しません。呼出し側で上記native instanceを設定し、同じinstanceを`createModuleAdapter({kind:'text-vae',module:'vae'|'text_encoder',nativeClient,...})`へ渡します。descriptor、sourceVerified、request/revision/resource binding等は実際の管理側契約で確定し、未取得のP0Table値をこのhandoffから補完しません。

管理sourceのcloneは`/workspace/work/inference/p1-resume-20261031/manager`で参照できます。今回、同じhostの実Chromium file inputでRect/Textの実Fileを選択し、実管理adapterの`invoke(configure)`から実native moduleの`configure`までを確認しました。元Text Fileの長さ6,735,906,897 bytes、選択Rect profile、Text gate原文・epsilonを確認しています。実import16 moduleは管理edda/native2bdの固定bytes/hashと一致し、新tensorを旧855由来とは扱っていません。これはconfigure専用のdirect adapter dispatchであり、M1/evaluateEdgeの本番採用やNN処理の受入ではありません。

Node24.19.0の`openAsBlob`はこの6.7GB原本についてBlob/File長を2,440,939,601 bytesへ丸める実挙動を示しました。size assertionで拒否した[失敗receipt](INPUTS.node-file-limit.json)を保持し、sizeを偽装せず、実Chromium Fileへ切り替えました。frozen native APIを観測Proxyで包む試行もJS invariantで拒否されたため、[失敗receipt](INPUTS.browser-observer-failure.json)を保持し、actual native moduleを管理へ直接渡しました。どちらもNN0です。

最終receiptは`evidence/manager-input-check.json`です。Worker factory・native run・global Worker・fetchの呼出しはすべて0、native module/client/adapterをdisposeし、実browserとlocal serverを終了しました。Python子のPID/ctimeとexit0、Playwright driverのPID/ctime、50ms間隔で観測した所有子孫11件を記録し、自己所有reap3件、終了後live0・zombie0・観測error0でした。短命で未観測のforkを含む網羅的監査ではありません。SIGTERMからfinallyへ入る経路は実装していますが、timeout回復の動的合格を認定していません。

共有filesystem上のこの検証は、別Codexの管理環境がFile/assetを受領・使用した証拠ではありません。**別管理Codex環境のACKは未取得**です。相手側のローカルassetの利用可否・manifest/hash照合・必要な操作のreceiptを別に受け取るまで、別環境の受入は未確認とします。

## manifestだけの静的照合

repository rootから次を実行すると、handoff manifestと既存private manifestのbytes一致を確認できます。assetや元モデルpayload、NNは読みません。

```sh
python - <<'PY'
import hashlib, json
from pathlib import Path
root = Path('development/inference/codec-marker-handoff')
inputs = json.loads((root / 'INPUTS.json').read_text())
for module in ('rect', 'text'):
    entry = inputs[module]['manifest']
    data = (root / entry['manifestPath']).read_bytes()
    assert len(data) == entry['byteLength']
    assert hashlib.sha256(data).hexdigest() == entry['sha256']
    assert Path(entry['currentPrivateOriginal']).read_bytes() == data
print('PASS: selected Rect/Text manifest bytes')
PY
```

VAE-owner asset照合の再現入口は次です。再実行時は新しいoutput pathを選びます。

```sh
python development/inference/codec-marker-handoff/check-rect-assets.py \
  --bundle /workspace/work/inference/e6-rect/accepted-bundle \
  --output /workspace/work/inference/codec-marker-20261101/rect-assets-replay.json
```

同host configure専用の実行入口は次です。Python PlaywrightとChromiumを使い、実model FileはHTTPへ配信・uploadしません。ローカルserverは許可されたmodule sourceのGETだけを提供します。

```sh
node development/inference/codec-marker-handoff/check-manager-inputs.mjs \
  --manager-root /workspace/work/inference/p1-resume-20261031/manager \
  --native-root /workspace/work/inference/p0-p2-20261031/worktree \
  --rect-bundle /workspace/work/inference/e6-rect/accepted-bundle \
  --text-bundle /workspace/work/inference/text-implementation/bundle \
  --text-source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --output /workspace/work/inference/codec-marker-20261101/manager-input-check-replay.json
```

この実行は`configure`で止まります。guardはWorker/run/NN開始を拒否し、fake numeric outputは返しません。`configure`のPASSをasset hash検証やText plain独立全値比較、別環境ACKへ昇格させません。
