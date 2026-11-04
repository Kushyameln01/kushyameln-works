# 固定sourceと変更境界の再現

この文書を含む配布commitをcheckoutする。[実行版](EXECUTION-SOURCES.json)はC1 `168a1e2fde2b643cc662514da288a7fd67ab2213`、成功browser/再現C2 `cfdea995f7f316786ed32a885b10478f66906a23`。C2の差分はfavicon専用204だけ。通常入口へ独立expected/gateを渡す必要はない。

## コードだけの試験

Node24・Python3.12以降を使う。validation-inputs.tar.gzには固定owner91ファイルと合成F32 descriptorだけがあり、実model/LoRA原本はない。

```bash
python - <<'PY'
import json, hashlib, pathlib, tarfile, tempfile
root = pathlib.Path('development/lora/model-connection')
m = json.loads((root / 'OWNER-SOURCES.json').read_text())
archive = root / m['archive']['path']
b = archive.read_bytes()
assert len(b) == m['archive']['bytes']
assert hashlib.sha256(b).hexdigest() == m['archive']['sha256']
dest = pathlib.Path(tempfile.mkdtemp(prefix='lora-owner-inputs-'))
with tarfile.open(archive) as tar:
    tar.extractall(dest, filter='data')
for f in m['files']:
    b = (dest / f['owner'] / f['path']).read_bytes()
    assert len(b) == f['bytes']
    assert hashlib.sha256(b).hexdigest() == f['sha256']
    assert hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest() == f['sha']
assert hashlib.sha256((dest/'FIXTURE-SOURCE.json').read_bytes()).hexdigest() == m['fixture']['sha256']
print(dest)
PY
```

表示された絶対pathを次の変数へ設定する。例のpathをそのまま使わない。

```bash
export LORA_MODEL_CONNECTION_INPUTS=/absolute/path/printed/above
node --test --test-isolation=none \
  tools/lora/test-model-connection.mjs \
  tools/lora/test-model-session.mjs \
  tools/ai-connection/test-lora-model-management.mjs
```

期待結果24/24 PASS、fail/skip0。今回も配布archiveから空directoryへ展開して確認した。test-isolation=noneを使い、process制限下のfile単位の見かけの成功を実test成功にしない。

全265件はC1で次を実行した。legacy P4試験用の別固定owner directoryは新規24件/通常利用の必須条件ではない。

```bash
P4_NATIVE_ROOT=/workspace/work/lora/diffusion-normal-owner-48ff \
node --test --test-isolation=none \
  tools/lora/kernel/streaming/test.mjs tools/lora/test-*.mjs \
  tools/ai-connection/test-lora-model-management.mjs
```

## 実base部分比較

上で展開したowner directory、Playwright、Chromium、NumPy、対応する手元のLOW base Fileを使う。harnessがsmall検証用LoRA Fileを生成するので過去4原本は不要。base識別は [browser summary](verification/BROWSER-SUMMARY.json) のbytes/header hashを参照。

```bash
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright
export CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium
node tools/lora/run-model-connection-browser.cjs \
  --base /absolute/path/to/Bernini_LOW_fp8_e4m3fn_scaled.safetensors \
  --inputs /absolute/path/printed/above \
  --out /tmp/lora-model-browser-new-run
OPENBLAS_NUM_THREADS=1 python tools/lora/model-connection-reference.py \
  --raw /tmp/lora-model-browser-new-run/RAW.json \
  --out /tmp/lora-model-browser-new-run/INDEPENDENT.json
```

outは未存在directory。localhost HTTPと同originのOPFSで保存→fresh page/newSDK読戻しを行う。RAW.jsonは実base配列を含むprivate診断資料とし、Gitや通常受渡しへ含めない。共有は要素数/hash/誤差/資源のcompact receiptを使う。

期待結果13ケース・317,500比較要素・gate違反0・終端資源0。元Q full[5120,5120]の行[1,3)・全列、選択時のbias[1,3)へ適用し、行[0,4)を読み選択外baseも比較。PARTIALを維持し、数値gateは開発Pythonにのみ置く。

[FILES.json](FILES.json)で配布path/bytes/SHA-256、[BINDINGS-RECEIPT.json](BINDINGS-RECEIPT.json)で対応表の圧縮/展開後hashを照合する。既存原本hash・全2,904patch算術は変更していないため受渡しのために再実行しない。全model推論・81frame・VAE・製品保存・生成READYはこの試験の範囲外。[残件](HANDOFF.md)を参照。
