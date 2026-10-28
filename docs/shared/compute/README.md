# Web Worker共有計算API

権限を持つChatGPTと既存のサイト機能が、複数のDedicated Workerへ独立したジョブを投入し、対応する結果を回収する共有基盤です。ChatGPTは許可されたブラウザ操作で `worker-runner/` にJSONを入力し、結果JSONを読み取り・保存できます。任意コードの実行入口、新しい認証、共有Memory、常駐処理、外部への入力送信は追加しません。

## 最小の利用例

```js
import {createComputePool} from './client.mjs';
const pool = createComputePool({concurrency: 2});
const request = (jobId, masks) => ({
  protocolVersion: 1, jobId, inputRevision: 0,
  taskType: 'ft-magnitude-batch', taskVersion: 1,
  payload: {masks, weights: [1, 2, 4]},
  limits: {timeoutMs: 30000}
});
try {
  const results = await pool.submitBatch([
    request('first', [0, 3, 5]), request('second', [7])
  ]).promise; // 入力順。正常結果は [0,3,5] と [7]
  for (const response of results) {
    if (response.status === 'succeeded') console.log(response.jobId, response.result);
  }
} finally {
  pool.dispose();
}
```

## 全タスクに共通する契約

- `submit(request)` → `{jobId, promise}`、`submitBatch(requests)` → `{jobIds, promise}`。batchは全入力の検査、容量判定、予約を済ませてからコピーし、一括で受け付けます。
- `getStatus()`はキュー・実行中・保持量、`getStatus(jobId)`は個別状態、`getResult(jobId)`は保持している終端応答です。未知・解放済み・delivery-onlyの終端IDは `null` です。
- `releaseResult(jobId)`は保持済み終端結果の参照を外します。解放した場合 `true`、未知・実行中は `false`。Promiseや取得済み結果を呼出し側が保持していれば、その参照は呼出し側で解放します。
- `cancel(jobId)`は待機ジョブを除去し、実行中なら該当Workerを終了します。`dispose()`は全未完了ジョブを終端化し、Worker・準備・保持参照を解除します。利用終了時とページを閉じる前に呼び出してください。OSやGCの即時解放は保証しません。
- 不正入力、重複ID、容量超過、dispose後の投入は受付前にthrowします。受付済みPromiseは `succeeded`・`failed`・`cancelled` の応答へ一度だけresolveします。自動再試行はありません。
- 応答の `protocolVersion`、`buildId`、`taskType/taskVersion`、`jobId`、`inputRevision`、`generation` を照合します。`status` を確認してから結果を使ってください。数値0と空配列は正常値です。
- 同時Worker数1〜4、既定2。未完了12件、プール全体の論理入力16MiBまで。タスク固有の上限・計数方法は下表の仕様を参照してください。
- `timeoutMs` は1〜30000、既定30000。受付後のキュー・準備・読込み・計算を含み、入力検査・コピー前からの時間ではありません。`jobId` は1〜64文字の英数字・`_.:-`、`inputRevision` は非負の安全な整数です。
- 保持対象の終端結果は最大16件・論理8MiBまで、古い完了順で破棄します。保持中のIDは再使用できません。delivery-onlyは他ジョブの保持結果を追い出しません。
- `onUpdate`は状態と`snapshot`を通知し、callbackの例外は隔離します。画面・SDK側も現在の操作と `inputRevision` を確認し、古い応答を反映しないようにします。

## タスク別のWASM・搬送・保持

GitHub Pagesで登録されるタスクのうち、FT・Unity解析・Template生成の搬送契約です。[Parameter Registrar](../parameter-registrar/README.md)と[技術情報ライブラリ](../technical-library/README.md)の追加タスクは各仕様を参照してください。structured cloneはWorker境界のコピー、transferはプール所有のArrayBufferの所有権移動です。入力時にコピーするため、呼出し側の元バッファはdetachしません。

| taskType（taskVersionは全て1） | 実処理 | 入力の搬送 | 結果の搬送 | 終端結果の保持・回収 |
| --- | --- | --- | --- | --- |
| `ft-magnitude-batch` | Hike/WASM＋JS検査 | 数値配列をコピーしてclone | 数値配列をclone | 保持。Promise／getResult |
| `unity-analyze` | Hike/WASM＋JS静的解析 | snapshotをコピーしてclone | 解析結果をclone | 保持。Promise／getResult |
| `unity-diff` | Hike/WASM＋JS差分処理 | before／afterをコピーしてclone | 差分結果をclone | 保持。Promise／getResult |
| `unity-expand` | JSのみ | 所有するbytes.bufferをtransfer | 展開した各ArrayBufferをtransfer | delivery-only。Promise |
| `unity-parse` | JSのみ | 所有するbytes.bufferをtransfer | 構造化した解析結果をclone | delivery-only。Promise |
| `unity-parse-batch` | JSのみ | 所有する各bytes.bufferをtransfer | 構造化した解析結果群をclone | delivery-only。Promise |
| `parameter-template-generate` | 既存Template生成（JSのみ） | `payload: {target}` をclone | unitypackageのbytesをtransfer | delivery-only。Promise |

`parameter-template-generate`は[Template公開API](../../parameter-template/README.md)へ`target`だけを渡します。データのURL・ハッシュ・件数・生成器本体を共有計算側に固定しません。正常時の`result`は`kind:'parameter-template-package'`と、公開APIの`apiVersion, target, bytes, fileName, folderName, treeCount, clipCount, buildId, roots, rootFolder`です。API形式・入力との対応・bytesの上限・参照を確認し、`buildId`は版の記録に使います。`getResult`には保持しないためPromiseから回収してください。Module版とbundle版とも公開APIをそのまま参照し、Template生成器はbundleへ埋め込みません。[Decode / Smooth 一括生成](../../decode-smooth-builder/)がこのタスクとRegistrarを利用します。

`viseme-template-generate` v1 は[Viseme Template公開API](../../viseme-template/README.md)へ `payload: {meshName}` を渡します。既存FT Hike/WASMのCRC32でBlendShapeのパスBindingを更新し、生成package bytesをtransferします。delivery-onlyで、結果はPromiseから回収します。Templateの内部データ・hash・件数を共有poolへ複製せず、module版・bundle版ともproducer APIを参照します。

FTは最大262144 masks、weightsは1〜5個の**正の有限数**で合計も有限。maskは0以上 `2 ** weights.length` 未満の整数です。論理入力は数値1要素8byteで数えます。Unityのsnapshot・ファイル・アーカイブ上限、対応形式、結果の読取りは [Unity解析README](../unity-analysis/README.md) を参照してください。

Unity取込みの最小例です。delivery-onlyの結果はPromiseから回収します。

```js
const sourceBytes = new TextEncoder().encode(
  '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &1\nGameObject:\n  m_Name: Example\n'
);
const parserPool = createComputePool({concurrency: 2});
try {
  const response = await parserPool.submit({
    protocolVersion: 1, taskType: 'unity-parse', taskVersion: 1,
    jobId: 'parse-example', inputRevision: 1,
    payload: {path: 'Assets/Example.prefab', bytes: sourceBytes}
  }).promise;
  if (response.status === 'succeeded') console.log(response.result.file);
  console.log(sourceBytes.byteLength); // 元の入力はdetachしていない
  console.log(parserPool.getResult('parse-example')); // null。回収先は上のPromise
} finally {
  parserPool.dispose();
}
```

ChatGPT-Sites仮実装には既存のmedia実験タスクも残っています。その登録は `registered-tasks.mjs` とmedia各仕様に従い、Pagesの6タスクと同一だとは扱いません。今回の調整で両環境の登録タスクを増減しません。共通の `tasks.mjs` がFT等の登録表とUnityの解析・取込みadapterを束ねます。

## Moduleの準備・再利用・復帰

`moduleReuse:true`は任意設定で、**既定false**です。同じプール・同じABI/hash/variantの準備済みModuleを再利用します。成功済みModuleは最大3 keyを保持し、未決の準備は別に管理します。Moduleを渡しても、ブラウザ内部で再コンパイルが絶対に起きない保証にはなりません。WASMを使うジョブは毎回独立したInstanceとMemoryを作ります。

未決の準備にはkeyごとのAbortController、待機集合、準備開始から30,000msの期限を設けます。後から加わるジョブは期限を延長しません。個別の取消・timeoutでは、そのジョブを待機集合から外します。同keyのqueued／preparingが残れば準備を共有し、全て消えたら未決準備を切り離します。次の**明示投入**は新しい準備を開始できます。成功済みModuleは依存ジョブが0になっても、通常のキャッシュ上限またはdisposeまで保持します。

| 状況 | 終端応答 | 後続への扱い |
| --- | --- | --- |
| 個別ジョブの期限 | failed / `TIMEOUT` | 他の生存ジョブを継続 |
| 明示取消／dispose | cancelled / `CANCELLED` または `DISPOSED` | 該当ジョブだけ／全ジョブを終端化 |
| 準備の通常失敗 | failed / `PREPARATION_FAILED` | その時点で受付済みの同key依存ジョブを終端化 |
| 準備そのものの期限 | failed / `PREPARATION_TIMEOUT` | 同上。未決entryを除去し明示再投入で復帰 |

個別期限と準備期限が競合した場合は先に確定した終端を維持します。旧準備の遅延resolve／rejectは、新準備や新ジョブへ反映しません。abortは取得中止を要求しますが、abortを無視する処理やWASMコンパイルの物理的停止は保証しません。バックグラウンドのタイマー制限下で正確に30秒後に処理される保証もありません。

JS-onlyタスクはModule準備を行いません。WASM hash、Instance ID、WASM Memoryの指標は `null`、`wasmNotApplicable` に理由を記録します。`metrics.moduleReuse` はプール設定であり、各ジョブがWASMを使った証拠ではありません。

## 準備後開始と時間の読み方

`submitBatch(requests, {startTogether:true})` は、そのbatchの全生存Workerが各タスクの準備を終えてから計算を開始します。既定false。未完了0件かつbatch件数が同時Worker数以下で使えます。保持結果があっても利用できますが、ID重複は拒否します。後続投入は開始待ち集合に加えません。取消・失敗・timeoutのジョブは集合から外します。`readyWaitMs` は準備後の待機で、`computeMs` には含みません。

Worker/Instance ID、queue・startup・load・compute・totalと計算開始終了の正規化時刻を記録します。`computeMs` はadapterのJS検査・配列整形・WASM呼出しを含み、WASM単独の時間ではありません。`transferResidualMs` は起動・イベント待ち等を含む残差で、純粋な転送時間ではありません。`memoryBytes` はWASM Memory容量、入力・保持byteは論理値、JSヒープ実測値は `null` です。

worker-runnerの比較JSONは `schemaVersion:2` です。APIの `protocolVersion:1` と区別してください。主指標 `callerElapsedMs` は**投入呼出し直前から結果Promise回収直後**まで。request生成、正答確認、表示、disposeは外側です。既存ジョブの `totalMs` は入力検査・コピー後からの内訳として残します。prepared試験は波ごとの時間とその合計を記録し、波間の処理を含む全体時間と区別します。

`parallelVerified`／`overlap` は異なるWorkerの少なくとも一組に正の計算区間重複があるという指標です。設定Worker数すべての同時実行を意味しません。`maxConcurrentWorkers`、`overlapDurationByConcurrency`（同時Worker数ごとの正の重複ms）、`fullConcurrencyOverlapMs`、`intervalValidation` も併記します。同一Worker IDは重複計上せず、区間が端点で接するだけなら重複0、時刻欠測・異常は未確認 (`null`) とします。物理コアの同時実行の証明ではありません。

通常1／2／4比較は全6順列、準備後開始2／4は両順序、Module off／onも両順序を記録します。通常比較の `performanceComparable` は全試行が正答し、全caller時間が有限・非負で、1 Workerの中央値が正の場合だけtrueです。不成立時は短縮率をnull、理由を `performanceComparisonReason` に残し、失敗と生時間を削除しません。初回と後続を分け、キャッシュ状態不明を隠しません。Moduleの採用候補は正答・両方式の取消復帰が合格し、**両順序それぞれ**で後続5回のcallerElapsedMs中央値が10%以上短縮した場合だけです。候補判定後も既定falseは維持します。結果を別環境の高速化保証に一般化しません。

診断の「Module準備からの復帰」は固定した未決準備を内部で再現する検査です。通常計算には障害を注入しません。「全件JSONを保存」は、その操作の全検証記録を保存します。外部テレメトリは追加しません。

## タスク追加と検証の手順

1. taskType/taskVersion、期待結果、最大入力・出力、所有権、保持方針、必要なABIを設計書で定めます。
2. **実装前に**局所の設計とChatGPTからの利用経路・目的適合を別に批評します。各批評の冒頭で開発手順への準拠を確認し、不一致は修正・再確認してから続行します。
3. 正常・0/空・境界・拒否・取消・古い応答・復帰の検査を先に用意し、必要最小限を実装します。`tasks.mjs` から対応adapterへ明示的に振り分け、環境ごとの `registered-tasks.mjs` の公開範囲を維持します。JS-onlyの取込みも既存の許可されたタスクです。WASMの追加・変更ではHikeソース・バイナリ・hashを揃え、imports/exports、引数型、有限値、Instance/Memory独立を検査します。ABIや許容入力を黙って変えません。
4. 実装後も手順準拠を先に確認し、成果物を設計・期待結果と照合します。不一致は修正と再検査を行い、再批評してから候補へ進みます。
5. 検査済みソースをSites仮実装へ保存・配信し、実ブラウザで投入・回収・失敗からの復帰と既存呼出し元を確認します。候補を配信済みPagesと偽装して検査しません。
6. 公開差分・許可範囲・生成bundleを確認してGitHub Pages本実装へ反映し、配信commit/hash・HTTP/MIME・相対パスと実際の投入・回収を確認します。両環境の状態と証拠は別々に記録します。

FTは既存 `../ft/kernel/ft-kernel.wasm`（SHA256 `b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad`）のi32/f64 ABI、FtValidate・FtMagnitudeを使います。参照元は [Hike](https://github.com/kanryu/hike-lang) と [Kanryu氏の記事](https://qiita.com/kanryu/items/a031d4928ddb7caa0784) です。記事の共有ヒープruntimeを完成したWorkerプールとして流用したものではありません。

## 未公開の技術情報ライブラリ候補

候補checkoutの `compute-knowledge-b2` は既存6タスクに
`knowledge-index-step` v1を追加する。公開Pagesへの配信は未実施。
詳細は [候補契約](../technical-library/README.md) を参照。
WASMが検索postingと継続stateを生成し、hostがIndexedDBへ保存する。
この追加でもcancelはWorker終了であり、保存付きpauseではない。
既存の上限・Module再利用既定値・FT/Unityの意味を変更しない。
