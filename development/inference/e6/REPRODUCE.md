# E6再現と検証手順

repo rootから実行する。Linux/Python3.12、torch2.6.0+cpu、onnx1.17.0、numpy2.3.5、safetensors0.5.3、Pillow12.3.0、Playwright1.62.0、psutil7.2.2、Chromium154.0.8037.57で検証した。Chromiumは`/usr/bin/chromium`を使用する。torch等の隔離depsと、元VAEのreceipt記載SHAを満たすローカル原本を事前に用意する。新たな量子化・モデル置換・WebGPUはしない。

必要な小規模生成物は`fixtures/`に含む。ONNX/元VAEは非公開入力でありGitへ含めない。以下は別環境での再現用CLIで、既存F1正方形のexport/棚卸しをこのE6で繰り返した記録ではない。

```sh
export WKW_VAE_MODEL=/absolute/private/wan_2.1_vae.safetensors
export WKW_VAE_DEPS=/absolute/python-deps
export WKW_E6_ROOT=/absolute/new-private/e6-reproduction
mkdir -p "$WKW_E6_ROOT/baseline-meta"
cp development/inference/vae-v1/fixtures/baseline5-manifest.json "$WKW_E6_ROOT/baseline-meta/manifest.json"
python - <<'PY'
import json,os
from pathlib import Path
root=Path.cwd();out=Path(os.environ['WKW_E6_ROOT'])
p=json.loads((root/'development/inference/e6/acceptance-plan.json').read_text())
p['model']['path']=os.environ['WKW_VAE_MODEL']
p['input']['path']=str(root/'development/inference/e6/fixtures/rect-32x16.png')
p['privateOutput']=str(out/'bundle')
(out/'plan.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
PY
python tools/inference/vae/export_profile.py --model "$WKW_VAE_MODEL" --output "$WKW_E6_ROOT/bundle" --frames 1 --height 16 --width 32 --deps "$WKW_VAE_DEPS"
python tools/inference/vae/reference_still.py --plan "$WKW_E6_ROOT/plan.json" --bundle "$WKW_E6_ROOT/bundle" --output "$WKW_E6_ROOT/references" --deps "$WKW_VAE_DEPS"
python tools/inference/vae/accept_still.py --bundle "$WKW_E6_ROOT/bundle" --baseline-bundle "$WKW_E6_ROOT/baseline-meta" --skip-baseline --plan "$WKW_E6_ROOT/plan.json" --references "$WKW_E6_ROOT/references" --output "$WKW_E6_ROOT/browser"
```

全outputを元参照へ比較する。`--skip-baseline`時は元5-frameのmanifest識別だけを読み、そのmodel inferenceを行わない。元profileの受入証拠は54bfeadのまま再利用する。各output directoryはfreshにする。編集するのはlocal pathのみとし、PNG/model/source hash・shape・FP32方針・事前gateは変えない。新exportの実hashを記録し、記録済みassetへ便宜的に付け替えない。

取得したDiffusionのmean境界とmetadata差分は、次のように再現できる。最新ownerコードを推測で補わず、固定commitを明示取得する。必要な6ファイルを`peer-source-identity.json`と照合してから実行する。

```sh
git fetch origin refs/heads/codex/diffusion-l1-wasm
mkdir -p "$WKW_E6_ROOT/peer"
git archive f522d9aeff313558c4ef83022a340af9a4c21391 docs/shared/inference/tensor.mjs docs/shared/diffusion-models/tensor-interop.mjs docs/shared/diffusion-models/latent-space | tar -x -C "$WKW_E6_ROOT/peer"
node tools/inference/vae/test-peer-boundary.mjs --peer-root "$WKW_E6_ROOT/peer" --still development/inference/vae-v1/fixtures/png-mean.wktensor --rectangle "$WKW_E6_ROOT/browser/png-mean.wktensor" --output "$WKW_E6_ROOT/peer-boundary.json"
node tools/inference/vae/test-api.mjs
node tools/inference/test-connection-contract.mjs
PYTHONDONTWRITEBYTECODE=1 python tools/inference/vae/test_process_lifecycle.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests
python tools/diffusion-models/build-info.py --check
```

peer検査の成功は、**64/rectangleが拒否され、metadata欠落を再現できた**という既知状態の確認である。共同情報保全・新profileのDiffusion対応が合格した意味ではない。新owner版が対応する場合は、その新source/ABI/receiptと期待結果を別に確定する。実generated sampleをmeanへ改名して通さない。

browser/helperは自分の子孫だけを観測し、Linuxのprocess-local subreaperで引き取ったowned zombieのみをwaitする。既存/他owner processはkill/reapしない。source変更後は実行したsource hashと判定gateを記録する。本文のPSS/RSSは観測scope付きで読み、全端末peakや負荷改善としない。
