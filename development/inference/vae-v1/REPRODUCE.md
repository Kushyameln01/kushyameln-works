# V1 F=1受入の再現

受入原本は完全commit `54bfeadbd83f1fea074c503c0e05ec478aba5cfb`。この追補は必要な小規模fixtureとCLIを共有するもので、既存export/棚卸しを実行し直した記録ではない。`fixtures/`には元PNG、実際の参照F32、回収WKTとmanifestを置く。モデル原本・約499MBのONNX/conv2資材は非公開入力として別に用意する。

検証環境はLinux、Python3.12、torch2.6.0+cpu、onnx1.17.0、numpy2.3.5、safetensors0.5.3、Chromium154.0.8037.57、Playwright1.62.0、psutil/Pillow。Pythonのtorch等は隔離depsへ置き、`--deps`で指定する。Nodeの小fixtureはNode標準runnerを使う。元VAEのSHAはreceipt記載の`2fc39d...`完全値と一致させる。

repo rootで、次のtask専用変数を実環境へ設定する。

```sh
export WKW_VAE_MODEL=/absolute/private/wan_2.1_vae.safetensors
export WKW_VAE_DEPS=/absolute/python-deps
export WKW_V1_ROOT=/absolute/new-private/v1-reproduction
export WKW_BASELINE_BUNDLE=/absolute/private/accepted-5frame-bundle
mkdir -p "$WKW_V1_ROOT"
python - <<'PY'
import json,os
from pathlib import Path
root=Path.cwd();out=Path(os.environ['WKW_V1_ROOT'])
p=json.loads((root/'development/inference/vae-v1/acceptance-plan.json').read_text())
p['model']['path']=os.environ['WKW_VAE_MODEL']
p['input']['path']=str(root/'development/inference/vae-v1/fixtures/frame-000.png')
p['privateOutput']=str(out/'bundle')
(out/'plan.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
PY
python tools/inference/vae/export_profile.py --model "$WKW_VAE_MODEL" --output "$WKW_V1_ROOT/bundle" --frames 1 --height 16 --width 16 --deps "$WKW_VAE_DEPS"
python tools/inference/vae/reference_still.py --plan "$WKW_V1_ROOT/plan.json" --bundle "$WKW_V1_ROOT/bundle" --output "$WKW_V1_ROOT/references" --deps "$WKW_VAE_DEPS"
python tools/inference/vae/accept_still.py --bundle "$WKW_V1_ROOT/bundle" --baseline-bundle "$WKW_BASELINE_BUNDLE" --plan "$WKW_V1_ROOT/plan.json" --references "$WKW_V1_ROOT/references" --output "$WKW_V1_ROOT/browser"
node tools/inference/test-connection-contract.mjs
```

変更するのは環境ごとのpathだけとし、shape、元model/source、入力PNG hash、FP32方針、事前gateは保持する。全出力を比較し、生成物の実hashを新たに記録する。export時のpath/ツール環境によるbyte差を記録hashの付替えで隠さない。旧5-frame bundleを持たない場合、この版の全回帰harnessの前提不足として明示し、別profileで代用しない。各出力directoryはfreshなものを指定する。

`bundle-manifest.json`は元受入時の資材識別であり、manifestだけを新shapeへ変更して使わない。`.wktensor`だけではevidence・snapshot・owner・graph/build・traceは保存されないため、receipt・artifact-indexと返却evidenceも保持する。raw meanとgenerated sampleを改名・混同しない。実generated sampleとの結合や本番生成はこの再現に含めない。
