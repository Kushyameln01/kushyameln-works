# DiffusionModels 0.1 — 数値計算と接続基盤

**開発途中の部品です。Berniniモデル全体の推論は未実装です。**

同一ページのJavaScript APIと、明示したMessagePort経由で、モデルヘッダー検査、HikeのEuler/scheduler/CONST、tensor境界検査、Hike→ORT WASM→Hikeの部分射影を呼べます。ニューラルモデルのload/predict/sampleはNOT_READYを返します。動くUIや画像生成の代わりとなる仮出力はありません。

入口は [`api/index.mjs`](api/index.mjs)、使用方法・データ契約は [`API.md`](API.md)。Text Encoder/VAEと包括UIは別担当です。DiffusionModelsの推論部・外部API・Hike数値部は本担当が受け持ちます。

## 現在の対応

| 機能 | 状態 |
| --- | --- |
| File/Blobのsafetensorsヘッダー検査 | 実15.57GB LOW/HIGH両Fileで確認。全量重みを読み込まない |
| Hike f32 Euler更新 | 実WASM、Node/Chromiumで検証 |
| 同一ページAPI / 明示MessagePort | 実Worker/MessageChannelで検証 |
| 取消・新入力による旧応答失効・終了 | 自分のWorkerだけを終了し、Promiseを終端化 |
| Bernini load/predict/sample | NOT_READY。全量ORT/単純block分割ではMemory制約を満たさない |
| Text Encoder/VAE境界 | 公開固定版から独立APIとHike担当を確認。既存.wktensor互換でshape/意味/hash/maskを検査。全体推論の結合ではない |

ヘッダー検査はdescriptorの型・長さ・範囲検査で、完全な形式/重み検証ではありません。特にJSON重複キーの厳密拒否は未対応。原本hashとheader hashは区別します。

## ビルドと試験

配布済みWASMの利用にGo/compilerは不要です。再buildには、記録された固定Hike compilerとwabtが必要です。

```sh
DIFFUSION_TOOLCHAIN=/workspace/work/diffusion-investigation/toolchain python kernel/build.py
python api/build-info.py
node test/node-check.mjs
node test/browser-check.cjs
node api/test/browser-check.cjs
```

browser-checkはPlaywrightと`/usr/bin/chromium`を使い、自前のloopback限定HTTP serverを一時起動して終了します。静的配信先と同じbuildのJS/WASMを使ってください。別の実行環境ではtoolchain・Chromiumの実配置を確認してください。

固定compiler: kanryu/hike-lang `3c51fde6675f317453919bd505d0e2d0f638e7f1`、Go1.22.12、wabt1.0.39、WABT normal。生成元とhashは `kernel/build-record.json` にあります。生成runtimeは保存していますが、importsのないWASMを直接instantiateする経路を検証しています。

再準備する場合はHike固定source archiveとGo公式配布を取得し、`development/diffusion-models/toolchain-provenance.json`のhash・版と照合します。専用toolchain内へwabt1.0.39を`--ignore-scripts`で取得し、Goの`CGO_ENABLED=0`で`./cmd/hikec`をbuildします。記録外のcompiler/backendへの差替えを同じ合格としないでください。

## 推論本体の残件

元payloadだけで1モデル14.505GiBあり、ORT wasm32の4GiB address spaceを超えます。元rv2v相当の文脈tokensを含めると、naiveなblock分割でもQKVやFFNのactivationが大きく、単純な重み分割だけでは成立しません。各線形層のrow/token tileとオンラインsoftmaxによるattention等の実装・検証が必要です。

現在の数値部品を、モデル全体の変換合格・推論合格・元ComfyUIとの数値同等・負荷低減と解釈しないでください。詳細な根拠、未達、再開条件は `development/diffusion-models/RESULT.md` を参照してください。

最新の明示確認と追加実装はdevelopment/diffusion-models/REV3_RESULT.md。包括UIは3モジュール横断の直列化を担当し、別executorが自動共有されるとは扱わない。
