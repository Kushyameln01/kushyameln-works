# diffusion_models 外部API 0.1

このAPIは同じページのES module、または呼出し側が明示して渡した専用MessagePortから利用する。全体UI、Text Encoder、VAEのAPIを実装・推測しない。HTTP・WebSocketサーバーやグローバルなwindow message listenerは設けない。静的HTTP(S)配信とWorker/WASMを利用できるブラウザが必要。

現在動く操作は、safetensorsのヘッダー検査と、実Hike WASMによるEulerのelementwise更新。`load`・`predict`・`sample`は常に構造化エラーで拒否する。モデル推論の実装・変換・利用経路完成を意味しない。

## 同一ページの呼出し

```js
import {createDiffusionModels, PROTOCOL_VERSION, BUILD_ID} from './api/index.mjs';
const api = createDiffusionModels();
const response = await api.request({
  protocolVersion: PROTOCOL_VERSION,
  buildId: BUILD_ID, // 任意。指定する場合はこの配布版と一致すること
  sessionId: api.sessionId,
  jobId: 'step-1',
  inputRevision: 0,
  op: 'eulerStep',
  input: {
    latent: new Float32Array([3, 7, -2]),
    denoised: new Float32Array([1, 3, 2]),
    sigma: 2,
    nextSigma: 1
  }
});
// status='ok', result.latent = Float32Array [2,5,0]
api.dispose();
```

全requestにはprotocolVersion、sessionId、jobId、inputRevision、opを含める。sessionId/jobIdは1〜128文字の英数字と `_ . : -`。inputRevisionは0以上のsafe integer。responseはこれらと固定buildIdを返し、`status: 'ok', result` または `status: 'error', error: {code,message,details?}` を持つ。

| op | input | 結果・状態 |
| --- | --- | --- |
| capabilities | `{}` | modelInference=false、eulerStep=true、inspect=true、maxTensorElements=1048576、buildId等 |
| inspect | `{file: File または Blob}` | ヘッダーと実file長を照合したtensor一覧・payload容量・headerSHA256・readiness |
| eulerStep | `{latent,denoised,sigma,nextSigma}` | Float32Arrayの更新結果と実WASM hash、memoryBytes |
| load | `{file: File または Blob}` | 先にヘッダー検査を行い、その後NOT_READY。大容量モデルはdetails.reasonsにSINGLE_WASM32_MEMORY_EXCEEDED |
| predict / sample | `{}` | NOT_READY。仮のニューラル出力や注入predictorを返さない |
| cancel | `{jobId: 対象jobId,inputRevision: 対象revision}` | 自分が所有する実行中Workerだけ終了。対象のPromiseはCANCELLEDで終端化 |
| dispose | `{}` | Workerを終了し以後の呼出しをDISPOSEDで拒否 |

公開メソッド `api.cancel({sessionId,jobId,inputRevision})` も同じ対象を取り消す。`api.dispose()` は冪等である。取消後の次requestではWorkerを再生成できる。dispose後は再利用できない。

同じinputRevisionで実行中の別requestはBUSY。より古いrevisionはSTALE_INPUT。より新しい有効なrevisionを受けると旧Workerを終了し、旧PromiseをSTALE_INPUTで終端化して新requestへ移る。旧Worker・異なるbuild/session/job/revision/opの返信は現在の結果へ採用しない。build不一致で待機する場合も明示cancel/disposeが利用できる。

Eulerの上限1,048,576要素は、このAPIの作業予算。モデル全体の対応上限という意味ではない。Float32Arrayの長さ一致・有限値・sigma条件を検査する。固定workspaceのHike関数を最大65,536要素ずつ呼び、同じelementwise式の結果を結合する。この分割はニューラルグラフや時間・空間tensorを分割して推論する機能ではない。callerの入力配列は変更・detachしない。結果は独立した所有buffer。

inspectは最初の8 bytesと最大8 MiBのヘッダーだけを読む。dtype/shapeからの正確なbyte長、offset範囲、隙間・重複、実file終端を確認し、全payloadを読み込まない。headerSHA256はヘッダーのみのhash。`fullFileSHA256=null`、`fullFileHashStatus=NOT_COMPUTED_HEADER_ONLY`で、重みやモデルの完全hash検証を行ったと誤認させない。

検査の制限: JSON.parseが重複キーを後の値で置き換えるため、同じtensor名が重複した不正JSONの厳密拒否は未対応。このinspectはparsed descriptorの構造・範囲検査であり、safetensors形式全体や重み内容の検証を保証しない。厳密なimportが必要なモデル推論経路は現在NOT_READY。

## MessagePort

```js
import {createDiffusionModels, attachDiffusionPort} from './api/index.mjs';
const api = createDiffusionModels();
const {port1,port2} = new MessageChannel();
const detach = attachDiffusionPort(port1,api);
// port2は呼出し側コーディネーターへ、明示した経路で渡す。
// 同じrequest envelopeをport2.postMessage(request)で送り、onmessageでresponseを受信。
// 先にapi.sessionIdをコーディネーターへ知らせる。
// 終了:
detach(); // このportだけを閉じる。APIやWorkerはdisposeしない。
api.dispose();
```

配列はJSON化せずstructured cloneで渡す。呼出し側からWorkerへのtransferは行わず入力所有権を保つ。Workerは自己所有の結果bufferをhostへtransferし、MessagePortアダプターはその結果をstructured cloneで返す。異なるWASM Memory間のpointer共有やzero-copyは保証しない。ポートを閉じるだけではAPIをdisposeしないため、所有者は終了時にapi.disposeを呼ぶ。

## buildと検証

```sh
python api/build-info.py
node api/test/browser-check.cjs
# 保存済み巨大モデルもFileとして検査する場合:
node api/test/browser-check.cjs /absolute/path/LOW.safetensors /absolute/path/HIGH.safetensors
```

build-info.pyはAPI source、生成スクリプト、Euler host/registry/WASMのhashをまとめ、hostとworkerが独立に読み込む固定buildIdを生成する。対象sourceやkernelを変えたら必ず再生成する。build-info.mjs自体・テスト・READMEはhash対象外。

REDの記録はtest/red-*.json、最新GREENはtest/browser-results.json。Chromiumの実Worker・MessageChannel・Hike WASMで13ケースを確認した。追加の実File試験では保存済み各15.57 GBのLOW/HIGHを入力し、1815 tensors、181280 bytesのheader hashを独立Python棚卸しと照合した。どちらもloadはNOT_READYで拒否した。これはモデル本体の推論合格ではない。
