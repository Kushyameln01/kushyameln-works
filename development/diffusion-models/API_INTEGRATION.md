# API接続の状態と引継ぎ

2026-10-31 JST / v0.1-foundation。これは結合済みAPI仕様ではない。

## 実在と独立性の確認結果

| 対象 | 個別モジュール | 外部接続 | Hike使用 |
| --- | --- | --- | --- |
| 別担当Text Encoder | ComfyUI workflowにはnode1の独立CLIPLoaderがある。ユーザー指定のa92e104の実装を取得・検証できていない | 同一ページJS/明示MessagePortが確定。実物取得待ち | 対象source/WASM/出力未取得につき未検証 |
| 別担当VAE | workflowにはnode2 VAELoaderとnode17 VAEDecodeがある。ユーザー指定のa92e104の実装を取得・検証できていない | 同上 | 同上 |
| 本担当DiffusionModels API | 本担当が独立して開発（ユーザー回答rev2） | 同一ページJS/明示MessagePortを実装・検証済み | 下記Euler部品から拡張 |
| 今回のEuler配列コンポーネント | 独立ES moduleとHike生成WASMを作成 | 下記ローカルES module APIをNode/Chromiumで検証。包括モジュールへの接続は未実施 | EulerDenoised全要素の計算をHike WASMが実行。JSは検査/copy/所有管理のみ |

最新取得Works commit a614f772cfcd95ebec0ba094fc5391e4bbdf0676の全970-entry treeおよび同HEADのローカルを調査した範囲では、推論3モジュールのパスは見つからなかった。別Codexの非公開/開発中成果物が存在しないという判定ではない。

## 今回作成したコンポーネントの実API

```js
import {createEulerKernel} from './euler-kernel.mjs';
const response = await fetch('./kernel/euler.wasm');
if (!response.ok) throw new Error(`WASM HTTP ${response.status}`);
const kernel = await createEulerKernel(await response.arrayBuffer(), {capacity:65536});
try {
  const next = kernel.step(
    new Float32Array([2, -4, 1, 0]),
    new Float32Array([0, -2, 3, 0]),
    1, 0.5
  ); // [1, -3, 2, 0]
} finally { kernel.dispose(); }
```

`step(x, denoised, sigma, nextSigma)`は平坦f32配列を扱う内部数値部品。`denoised`はsamplerが受け取るx0相当であり、rawネットワーク出力・velocity・epsilonと同一視しない。shape/layout/モデルhash/conditioningの検証とモデル出力からdenoisedへの正しい変換は、将来の確定したdiffusion runtimeが担当する。

sigmaはf32へ丸めた有限数、sigma>0、0<=nextSigma<=sigma。容量は生成時に1〜1,048,576要素を指定、既定65,536。これは部品の容量で、Bernini全latentや生成処理の上限を表さない。shapeを保持したchunkingを接続先仕様なしに実装したものではない。

入力配列は変更しない。出力は呼出し側所有のcopy。WASM bytesは非同期hash/compileより前に私有snapshotへcopyし、同一bytesをSHA-256照合して実行する。作業領域は初期Memory末尾より後へ一度だけ確保し、呼出しごとのgrow/allocator/freeを行わない。compilerのscalar scratchも反復ごとに増やさない。disposeは参照を解除し、OS全体のRAM返却や即時GCを保証しない。

WASM ABI: `EulerDenoised(xPtr:i32, denoisedPtr:i32, outPtr:i32, n:i32, capacity:i32, sigma:f32, nextSigma:f32) -> i32`。little-endian、4-byte alignment、各配列4*n bytes、disjoint領域、呼出し中借用。raw WASM入口は内部専用でhostによる範囲・型・有限値検査が必須。入力不備は-1/-2、成功0。JS hostは不正入力/非有限結果を例外にし、結果を公開しない。

## 接続先を得た後に照合する項目

以下はTE/VAEおよび包括UIとの受入確認項目。Diffusion APIは本担当が定義・実装し、他担当には確定した契約を渡す。

1. 各担当が提供する実際のbuild・export/endpoint、実行場所、predict/sample・TE・VAE encode/decodeの呼出し形式。
2. conditioningのtokenizer/model/config/hash、mask、temporal latentのdtype/shape/layout、VAE scale/shift、圧縮比。BerniniStudio node5がTE/VAE双方を使ってpositive/negative/latentを作る責務の所有者。
3. HIGH/LOWモデルとLoRAの版、量子化方式、予測の意味、sigma列、切替時点。simple schedulerの列を任意等間隔に変えない。
4. buildId/sessionId/jobId/inputRevision/model hash、バイナリ所有権、copy/transfer、旧応答拒否、待機取消/実停止/解放。
5. 各モジュール単独の成功・連結成功・一括UIの実行/取消/保存読戻しを別々に証拠化する。

Hikeが担当すべき部分は、確定したモデル/workflowに適合する実数値計算。TEのmask/embedding、VAEのlayout/scale等は他担当sourceと実WASM結果を受領して照合する。WASM読込みだけを使用実績にせず、Hike計算を欠いた場合の拒否と結果への寄与を確認する。

## TE/VAE確定版の通知
ユーザーからcodex/textencoder-vae / a92e104、docs/shared/inference/API.mdとdevelopment/inference/RESULT.mdが指定された。こちらの取得経路ではrefなしとなったため、詳細はTE_VAE_ACCESS.mdを参照。相手実装の存在を否定せず、未読仕様で結合しない。
