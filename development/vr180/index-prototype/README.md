# IndexStore 最小試作（非公開）

計画1.2 §7.2 / §7.4と設計正本のP2比較契約に基づく、SyncAccessHandle向けの局所試作です。`docs/`、共有vendor、製品transformからは参照していません。既存Mediabunnyの比例保持、逐次moov、AAC、metadata検査との統合は未実装です。P3全体の合格・性能改善・5〜10 GB対応を示しません。

## 使用境界

専用Worker内の同一所有者が、新規jobディレクトリと一つの`records.bin`を所有します。`root`はこの試作用に分けたOPFS名前空間のDirectoryHandleです。存在確認・作成の前に、`navigator.locks.request`で固定名`vr180:index-store:job:<jobId>`のexclusive leaseを`ifAvailable: true`で取得します。同じorigin / storage bucket内で同名jobを扱う各Worker・タブがこの規則を共有します。異なるrootでも同じjobIdは保守的に競合させます。

取得競合は`INDEX_JOB_LOCK_BUSY`、Web Locks未提供・拒否は`INDEX_JOB_LOCK_UNAVAILABLE`とし、例外の`status`を`BLOCKED`にして、ディレクトリへアクセスする前に拒否します。ブラウザ向けのメモリ内ロックへの代替はありません。取得後に既存jobを発見した場合は読み込み・削除をせず、leaseだけ解放して拒否します。ディレクトリの作成自体を排他とみなしていません。

```js
const budget = createIndexBudget(); // 同じWorkerの索引bufferへ共有する
const store = await createIndexStore({
  root, jobId: crypto.randomUUID(), budget,
  schema: {version: 1, recordBytes: 24, endianness: 'little'},
});
try {
  await store.appendRecord(recordBytes);
  await store.seal({expectedCount: 1});
  await store.readRecord(0, destinationBytes);
} finally {
  await store.dispose(); // 失敗時は同じstoreで再試行できる
}
```

`schema.version`は正のsafe integer、record幅は1〜65,536 bytes、endiannessはlittleです。recordは呼出側が定義する固定幅の生bytesで、日時・時刻・offset等のフィールド意味をまだ決定していません。保存済みtableの再open・復旧・schema移行は提供しません。sealのmanifestにschema・count・extentを返します。

| API | 契約 |
| --- | --- |
| `appendRecord(bytes, {signal})` | 1 recordを追記し、そのindexを返す。全write成功までcountを進めない |
| `patchRecord(index, bytes, {signal})` | 既存recordのみ更新。page境界をまたいでもよい |
| `readRecord(index, destination, {signal})` | 呼出側のrecord幅bufferへ読み出す |
| `readPage(pageIndex, destination, {signal})` | 64 KiBの呼出側bufferへ読み出し、有効bytesを返す。末尾の有効範囲外は変更しない |
| `iterate(visit, {start, end, signal})` | 一つのrecord scratchを使い、各`visit(bytes, index)`のPromiseを待つ。viewの有効期間はcallback完了まで。storeへの再入は禁止 |
| `seal({expectedCount, signal})` | 件数・計算extent・実getSize一致を確認しflush後に読み取り専用化 |
| `flush({signal})` | 当該handleをflush。将来の電源断耐性を保証するものではない |
| `abort()` / `dispose()` | 実行中処理を取り消して終端を待ち、handle close成功後に自jobだけ削除。外部MP4を操作しない |

同時操作は`INDEX_BUSY`で拒否し、入力bufferを抱えた待ち行列を作りません。各Promise完了まで入力・出力bufferを再利用・変更しないでください。SharedArrayBufferは受け付けません。I/O失敗・取消後は部分writeを読み取り成功にせず、storeをfailedとして清掃を要求します。

## 固定した予算とI/O

- page cacheは1枚64 KiB。iterateだけ追加で1 record分を予約します。cache map、record一覧、run一覧、可変長descriptor配列はありません。
- 同じmodule/Workerの既定budgetを共有し、上限8 MiB。明示budgetを渡す場合も、同じWorkerの索引資源で共有します。確保前に予約し、失敗時に解放します。
- 操作中の借用bufferはview長だけでなくbacking ArrayBuffer全体を予約します。呼出側が操作外でも保持する索引bufferは呼出側で同じbudgetへ別途予約する必要があります。追加の借用予約と二重計上になる場合も保守的に扱います。JS object、codec、GPU、OS cache、ブラウザ全体のメモリ保証ではありません。
- read/write要求は64 KiB以下。短いread/writeは残りを継続し、0進捗・不正返却件数は失敗にします。64 KiB又は64 I/O呼出しごとにtaskへ制御を戻し、前後でsignalを確認します。単発の同期I/Oそのものを途中中断できるという意味ではありません。
- offset/件数/幅はsafe integerを検査し、乗算をBigIntで検査してからNumberへ変換します。page番号の非負safe integer検査もcache照合より先に行い、未読cacheの番兵値`-1`を有効ページにしません。32bit演算で位置を切り詰めません。
- close失敗ではhandleと予約を保持し、削除へ進みません。close後の削除失敗はcloseを繰り返さず、自job削除だけを再試行します。初期化中の清掃失敗は例外の`retryCleanup`を残します。どちらもleaseを保持し、closeと削除が成功してから解放を待ちます。`dispose`成功後は同じjobIdを再取得できます。ページ終了・Worker停止によるlease解放はファイル削除の完了を意味せず、残存jobは引き続き拒否します。残存物の回復・削除機能は未実装です。

## 試験と未確認

`node --test tests/vr180-index-store.test.mjs`

Nodeの実temp fileをSyncAccessHandle形のadapterで読み書きします。短I/O、page境界、patch/read一致、逐次iterate、予算、0進捗、部分書込み後disk full、取消、close/remove再試行、別job保護を確認します。Nodeだけで注入するLockManager mockは、exclusive / ifAvailable / callback Promise完了までの保持を再現します。同時作成の片方だけが成功し、競合側のディレクトリアクセス・削除が0回、成功側の継続利用、清掃後の再取得、close/削除失敗・初期化取消の清掃再試行中のlease保持を確認します。これはブラウザのWeb Locks動作を試験したという意味ではありません。

4 GiB境界は別の模擬backendで、実payloadを保持せず64 KiBを65,537回進め、4 GiB超のNumber位置がwrite/patch/readへ届くことだけを確認します。実4 GiB出力・大容量媒体の合格ではありません。

実OPFS/SyncAccessHandleのブラウザ実行、固定12索引ケースの意味照合、実Chrome peak、逐次moov、mux/demux forkとの接続は未確認です。製品上限を変更する根拠には使いません。

Web Locksの参照仕様：<https://www.w3.org/TR/web-locks/>（exclusive / ifAvailable、callback Promise完了で解放、request Promiseで解放完了を待つ規則）。

## Write-through cache revision

The output-index prototype exposed 6.99 GB of read I/O for a 6.4 MB sample table. After each acknowledged synchronous write, overlapping cached bytes now update in place; unrelated cached pages remain valid. A growing partial page is reused only when its valid prefix matches the requested extent. Failed or canceled partial writes still poison the store until disposal. The 4,096-record append/read/patch regression independently reads the real disk file and bounds index read bytes. This corrects measured I/O amplification; native/browser and complete output comparisons must be repeated for this revision before adoption.
