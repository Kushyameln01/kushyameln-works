# P0とP2候補の再現

P0の静的再照合は[p0/README.md](p0/README.md)のCLIを使う。推論もnetworkも不要。選択manifestのgateと既存証拠を別profileへ転用しない。

P2はLinux、Node24、Python3.12、numpy、Playwright、psutil、`/usr/bin/chromium`を使用した。shell sandboxではlocalhost HTTP/socketを許可する必要がある。Browserの外向きrequestはhelperで遮断し、モデルはFile入力する。

既存の受入済みRect bundleを非公開入力として用意する。manifest SHAは`450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`、model SHAは`2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。必要graph/外部重みのidentityは同梱[p0 manifest](p0/evidence/manifests/vae-rect.json)にある。既存bundleの再exportはしない。未提供assetをmanifest編集だけで代用しない。

repo rootから、ownerを固定commitで別directoryへ取得する。

```sh
export WKW_P2=/absolute/new-private/p2
export WKW_RECT_BUNDLE=/absolute/private/existing-accepted-rect-bundle
mkdir -p "$WKW_P2/manager" "$WKW_P2/diffusion"
git fetch origin 28596717182e48aeb23c719c51b6e593edf4e496
git archive 28596717182e48aeb23c719c51b6e593edf4e496 docs/shared/ai-connection | tar -x -C "$WKW_P2/manager"
git fetch origin 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
git archive 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 docs/shared/diffusion-models docs/shared/inference/tensor.mjs | tar -x -C "$WKW_P2/diffusion"
PYTHONDONTWRITEBYTECODE=1 python tools/inference/vae/accept_p2_rect.py --manager-root "$WKW_P2/manager" --diffusion-root "$WKW_P2/diffusion" --bundle "$WKW_RECT_BUNDLE" --output "$WKW_P2/run"
```

`run`は未作成のfresh directoryにする。source pinsとG1C codecを検査してからactual manager module、Diffusion専用host/kernelをimportする。manager内の旧codecをG1Cの代わりに使わない。prepare→一回の実VAE raw decode→finishを元Promise/子processの終端を待って順次実行し、各管理packageを実bytesから回収する。normalizedはowner memoryで意味/markerを保ち、WKTへrawとして保存しない。

期待する結果は`passed:true`、`candidateDiagnosticPassed:true`、`fullP2AdoptionAccepted:false`。mean128値は2e-6以内、RGB1536値は独立参照へ2e-5以内。trace・package・Browser結果・process記録が出力される。manifestの0.002は残し、実行時の比較gateを事前planから変更しない。旧profileの再encode/再export、Text推論、参照再計算は行わない。

小さい回帰は次のとおり。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/inference/vae/test_restored_mean_profiles.py
node tools/inference/test-connection-contract.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests
```

実generated sampleをこのmean CLIへ渡して受け入れた扱いにしない。管理P1が成立した新sourceで試す場合は、既存採用pinを上書きせず別候補を宣言し、source/build/gate/証拠を固定し直す。
