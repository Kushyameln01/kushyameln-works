# Web Worker共有計算API

Kushyameln Worksの共有ライブラリです。ブラウザのDedicated Workerへ独立ジョブを分配し、各ジョブが固有のHike/WASM InstanceとMemoryを使います。共有メモリやサーバー常駐処理は使いません。ページを閉じる前にdisposeしてください。ChatGPTは権限を与えられたブラウザ操作でworker-runnerを開き、JSONを入力し、結果JSONを読み取れます。

```js
import {createComputePool} from './client.mjs';
const pool = createComputePool({concurrency: 2});
const request = (jobId, masks) => ({
  protocolVersion: 1, jobId, inputRevision: 0,
  taskType: 'ft-magnitude-batch', taskVersion: 1,
  payload: {masks, weights: [1, 2, 4]},
  limits: {timeoutMs: 30000}
});
const batch = pool.submitBatch([
  request('first', [0, 3, 5]), request('second', [7])
]);
const results = await batch.promise; // 入力順。結果は[0,3,5]と[7]
console.log(results, pool.getStatus());
pool.dispose();
```

## 契約

- `submit(request)` → `{jobId, promise}`、`submitBatch(requests)` → `{jobIds, promise}`。batchは全入力を検査してから一括で受け付けます。
- `getStatus()`はキュー・実行中・保持量、`getStatus(jobId)`は個別状態、`getResult(jobId)`は保持している終端応答です。未知・破棄済みIDはnullです。
- `cancel(jobId)`は待機中なら除去、実行中なら該当Workerを終了します。旧応答は反映しません。`dispose()`は全ジョブを終端化し、保持参照を解除します。OSやGCによる即時メモリ解放は保証しません。
- 不正入力、重複ID、容量超過、dispose後の投入は受付前にthrowします。受付済みPromiseはsucceeded・failed・cancelledの応答へ一度だけresolveします。自動再試行はしません。
- 応答のprotocolVersion・buildId・taskType/taskVersion・jobId・inputRevision・generationを保持します。statusを確認してからresultを利用してください。0と空配列は正常値です。
- 同時数1〜4、既定2。未完了12件、入力は数値1要素8byteの論理会計で16MiBまで。1ジョブ最大262144 masks、weightsは1〜5個の正の有限数（合計も有限）。maskは0以上2^weights.length未満の整数です。
- timeoutMsは1〜30000、既定30000。待機・読込みも時間に含みます。jobIdは1〜64文字の英数字・`_.:-`。inputRevisionは非負の安全な整数です。
- 終端結果は最大16件・論理8MiBまで、古い完了順で破棄します。保持中のIDは再使用できません。呼出し側が保存した入力・Promise・結果は呼出し側で解放してください。
- `onUpdate`はジョブ状態と`snapshot`を通知します。例外は隔離されます。入力が変わった場合、呼出し側でも古いinputRevisionの画面反映を抑止してください。

## WASMと計測

既存の`../ft/kernel/ft-kernel.wasm`を変更せず使います。SHA256は`b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad`。i32/f64 ABIを使い、FtValidate・FtMagnitudeで値を検査・計算します。参照元は[Hike](https://github.com/kanryu/hike-lang)と[Kanryu氏の記事](https://qiita.com/kanryu/items/a031d4928ddb7caa0784)です。記事の共有ヒープruntimeを完成したWorkerプールとして流用したものではありません。

`moduleReuse:true`は比較用の任意設定です。既定false。trueでは同じプール内のcompiled Moduleを再利用しますが、InstanceとMemoryはジョブごとに新規です。準備に失敗したキャッシュは除去し、次の明示投入で回復できます。終了したプールのキャッシュは残しません。

Worker/Instance ID、queue・startup・load・compute・totalの時間と正規化した計算区間を記録します。transferResidualMsは起動やイベント待ち等を含む残差で、純粋な転送時間ではありません。memoryBytesはWASM Memoryの容量、保持byteは論理値です。JSヒープ実測値はnullです。複数Workerの区間が重なっても物理コアの同時実行を保証しません。高速化は入力・ブラウザごとの測定が必要です。

## タスク追加

権限のある開発者・AIが、以下の順でコードを追加します。入力文字列をevalする入口はありません。

1. taskType/taskVersion、期待値、最大入力・出力と所有権、ABIを設計書で定めます。
2. protocol.mjsの登録済みタスク検査と、pool-worker.mjs内の明示的なディスパッチを追加します。CPU計算はHikeのソース・WASMと識別hashを揃えます。
3. kernelアダプターでimports/exports、引数型、有限値とMemoryの独立性を検査します。既存タスクのABIを黙って変えません。
4. 正常値・0/空・境界・失敗・取消・古い応答・復帰の検査を先に用意し、単一Workerと並行実行の結果を照合します。
5. Sites仮実装を保存して静的確認し、公開対象一覧を更新してGitHub Pagesへ反映します。配信版と一致する最新版をクラウドへ取得してから、ChatGPTによる入力・実行・結果回収を動的検証します。製品のNode/WASM実行も反映後です。

今回のデータ搬送はstructured cloneによるコピーです。ArrayBuffer移譲・detachや共有Memoryの最適化は実装していません。入力・結果の外部送信や新しい認証は追加していません。

## 準備完了後にまとめて開始する

`pool.submitBatch(requests, {startTogether: true})` は、受け付けたbatchの全WorkerがWASMの準備を終えてから計算を開始します。既定falseです。未完了ジョブが0件（`outstanding === 0`）かつbatch件数が同時Worker数以下の場合に使えます。保持済み結果があっても利用できますが、ID重複は従来どおり拒否します。後続投入はこのbatchの待機対象へ加えません。

```js
const preparedPool = createComputePool({concurrency: 2});
const prepared = preparedPool.submitBatch([
  request('prepared-1', [0, 3, 5]), request('prepared-2', [7])
], {startTogether: true});
const preparedResults = await prepared.promise;
preparedPool.dispose();
```

取消・失敗・timeoutとなったジョブは待機対象から外し、生存するジョブがすべて準備できれば開始します。timeoutには準備待ちも含みます。`readyWaitMs`は準備後の待機時間で、`computeMs`には含みません。起動時刻のずれを分離できるオプションであり、高速化や物理コアの同時実行は保証しません。

## Unity解析タスク

`unity-analyze` と `unity-diff` を追加しています。入力仕様と上限は [Unity解析README](../unity-analysis/README.md) を参照してください。既存FTタスクの入力と計算内容は維持します。タスクごとに容量と結果を検査し、ModuleキャッシュをABI・hashで区別します。

Unity b2 adds `unity-expand` and `unity-parse` JavaScript-only tasks. Their owned byte inputs/expanded ArrayBuffers are transferred, WASM metrics are null, and terminal results are delivery-only (Promise consumption, no retained record). This bypass does not evict another caller's retained results. Existing FT/media and Unity Hike analysis tasks keep their result policy.
