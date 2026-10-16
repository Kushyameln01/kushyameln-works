# 共有計算の実装・検証記録

対象: compute-pool-b2、2026-10-16。ChatGPT-Sitesは仮実装、GitHub Pagesは本実装。ユーザー指定の開発手順の保存本文について、要件・利用経路確認、単一Worker往復、同一入力測定、文書先行の批評、検査先行の実装、実ブラウザー検証、配布範囲確認の順に点検した。元チャット全文を直接読んだという主張はしない。TinyFish限定は最新指示で解除され、直接操作したブラウザーの結果を採用した。

## 配布対象

- Sites v50、source `5a93af5ece9c3980b68179690f4045edf7ae7a28`。配布物は既存公開版62ファイルと新規11ファイルのみ。未公開の別製品は含めない。
- Pagesの基点は `a4bece5001dd70037918f2d63d64123ade164de8`。既存32ファイルと新規11ファイルの43件を公開対象一覧で検査。既存公開ファイルの変更は `github/index.html` の共有計算への入口のみ。
- 共有APIと実行画面の11ファイルはSites検証版と同一。Pages全体をSitesの配布物で置き換えない。公開権限、既存Composer、解析用スクリプトは変更しない。
- Hike/WASMは既存の6184 bytesを再使用。SHA256 `b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad`。再コンパイルしたとは扱わない。独立Instance/Memoryを各Workerで作り、SharedArrayBufferは使わない。

## 確認結果

| 対象 | 結果と範囲 |
| --- | --- |
| Node検査 | pool26件、単一client・実WASM worker・benchmark各1件、合計29件PASS。取消、timeout、異常終了、古い応答、再入、Module失敗、保持上限、独立Memory、準備後開始を含む |
| 公開検査 | 既存出版検査15件PASS、43ファイルの完全一致・ローカル参照・新規出力へのexportがPASS |
| ChatGPT利用 | 実行画面へJSONを投入し、構造化結果を直接回収。単一Worker基準、複数ジョブ、空配列と0、取消後の再実行を確認 |
| 実並行計算 | b2の準備後開始で2/4 Workerとも正答と実計算区間の重なりを確認。4ジョブ/方式、各262144要素、checksum917504。各方式4つの異なるWorker/Instance ID |
| ライフサイクル | b2のModule再利用false/true両方で実行中/待機中取消、正常ジョブ継続、timeout、復帰、不正入力拒否、18回反復、保持上限、dispose後の確定・拒否・参照解放がPASS |
| MIME | Sites上で実取得したWASMのContent-Typeがapplication/wasm。Pages配信後も別途確認する |

実ブラウザーはChrome154/Linuxのクラウド環境、hardwareConcurrency=5。入力hash `c47096e057d473de47591813d0d57795ca1ff881ccbbb39ea23d26a92c1dc888`。原記録は `browser-prepared-b2.json` と `browser-lifecycle-b2.json`。待機時間readyWaitMsはcomputeMsへ含めない。独立Workerの時間重複はアプリレベルの証拠であり、物理コア同時稼働の保証ではない。JSヒープ、GC解放時刻、キャッシュ状態は未測定。

## 不合格を受けた修正と最終批評

b1の通常1/2/4比較は48/48正答だったが、計算区間の重なりは全てfalseだった。各方式4回の総時間は1 Worker=[3716.1,3371.9,3873.7,3336.4]、2=[2277.3,2270.4,2231.6,2567]、4=[2480,1812.2,1930.8,2349.6] ms。起動・読込のずれが実計算時間を上回る観測をもとに、公開APIの任意指定startTogetherを文書で設計・批評し、RED検査から追加した。既定動作・入力・計算量・重複判定条件は変更していない。通常モードを並列実証済みとは呼ばない。

Module再利用の比較は同一8192要素を各6回。後半5回中央値が758.3→596ms、事前条件の10%改善とライフサイクル検査を満たした。ただし再利用は任意、既定falseを維持。一般の端末・負荷での高速化は保証しない。

共有APIはsubmit/submitBatch/getStatus/getResult/cancel/disposeを提供し、実行画面と独立した検証呼出し元で使用できる。上限は同時1〜4、待機含む12ジョブ、論理入力16MiB、保持16件/8MiB。終端でWorkerを破棄し、取消・失敗もPromiseを一度だけ確定する。ページ内セッションのCPU計算であり、ページを閉じた後の常駐処理やサーバーMCPではない。新規タスクはREADMEに従ってコード・検査を追加する。任意コード評価や新規認証は追加していない。

GitHub Pagesの反映・配信後の実測結果は実行後に追記する。未実施の配信確認を合格にはしない。

## 本実装の配信後確認

2026-10-16、commit `bad511c1d51683b6bd19bd803b95e781956382f2` をmainへ反映。作成したGit treeの全22変更ファイルをローカルのGit blob hashと照合し、削除・無関係な変更がないことを確認した。expectedSHAを指定したforce:false更新で反映し、GitHub Actions `38863237492`（pages build and deployment）がsuccessになった。

GitHub Pagesの実行画面 `https://kushyameln01.github.io/kushyameln-works/worker-runner/` を直接操作し、build compute-pool-b2を確認。通常バッチは `[0,3,5]` と `[0,7]` を返した。準備後開始の2/4 Workerは両方correct/overlap/parallelVerified=true、各4Worker/Instance、全ジョブが期待checksumと件数に一致。実取得したWASMのMIMEはapplication/wasmだった。原記録は `kushyameln-production-b2.json`、画面は `kushyameln-production-b2.png`。

既存トップ→GitHub・ツール（共有計算入口を含む3件）→Animator Composerの導線と初期表示を確認。既存Composerの生成・Unity importは今回の変更対象ではなく、再検証したとは扱わない。公開対象一覧と配布コードはSites検証版と照合済み。検証記録の追記は公開docsツリーを変更しない。

最終批評では保存手順への準拠を先に確認し、共有API、独立Workerの計算と正答、ChatGPTによる投入と結果回収、取消・復帰・保持上限、配布一致の必須条件が成立したと判定する。全端末での高速化・物理コア同時稼働・ページを閉じた後の継続・任意コード実行は提供範囲に含まれない。将来の計算タスクは共有READMEに沿った追加実装と検証が必要。


## compute-unity-b5 調整（2026-10-17 JST）

この節はb2の記録を更新対象版ごとに補うものです。上の当時の未確認・不合格を現在の全条件へ一般化しません。

基準はPages `0ee9b175b75890f42c965770af0d06b0b77cd003`／Sites v63 `ce9a98d49d153491ebeeaac74b65637b38a82deb`。実装根拠は[調整計画](https://chatgpt.com/space/page_34045a8cecec8191a2b2702f41773653)と保存されたWORKFLOW_PLAN.mdの共通手順です。元の「開発手順確認」チャット全文を取得したとは主張しません。既存Sites DESIGNへ差分を反映してから二批評、要件由来のRED検査、最小実装、是正後再批評、Sites候補受入の順に進めました。各批評の冒頭で準拠を確認しました。

### 変更と目的への対応

| 変更 | 目的との関係 | 維持した条件 |
| --- | --- | --- |
| 共通APIと6タスクの仕様表 | AIが正しい入力搬送・結果回収を選べる | WASM不要のタスク、コピー後transfer、delivery-onlyと保持結果を区別 |
| schema2の比較JSON | 投入呼出し直前→Promise回収直後を同じ尺度で比較する | API protocolVersion/taskVersionは1、既存totalMsの意味は不変 |
| 最大同時計算数と重複時間 | any-pairと全数重複を区別できる | 不正・欠測区間はnull/NOT VERIFIED。物理コアの同時実行は保証しない |
| 未決Moduleの期限と依存管理 | 取消・timeout後の明示再投入が古い準備に固定されない | 他の生存ジョブ、世代照合、once-only終端、独立Instance/Memory、既定reuse=false |

Module準備は固定30秒の絶対期限を持ち、resolve時にも期限を確認します。依存ジョブが消えたpending entryは通知前に切り離します。成功Moduleの既存cache寿命は維持し、abortを無視する処理やcompile自体の物理中断は保証しません。新認証・任意コード実行・外部テレメトリ・登録タスクの追加は行っていません。

### 検査・失敗・是正

- poolの未決準備検査は修正前6件FAIL、修正後37件PASS。独立レビューでabort同期listenerから同ID再投入した時の旧結果evict境界が見つかり、再現RED→是正後38件PASSと独立再実行PASSを確認しました。
- Node回帰はSites側52件PASS（その後、FT入力境界を追加して候補5件PASS）、Pages側45件中43件PASS・Sites専用media2件skipです。6タスクは実Node Workerでmodule/bundle × reuse false/trueの4組を確認。Nodeをブラウザの代替証拠とはしません。
- 比較検査は半開区間、端点、ゼロ長、同一Worker ID、欠測、全6順列、AB/BA、呼出し時間境界、prepared波合計、固定復帰診断を確認しました。
- Sites v64/source `61c1b91f1edc18fac2b3c9a1413943d433613f8b` の最初の通常比較は4件TIMEOUT、後続17試行は正答。startup未取得の原因は未特定です。生JSON `evidence-adjustment/sites-normal-first-failed.json` を保持し、この比較の短縮率は性能根拠に採用しません。
- 失敗込みでも短縮率を出す不足を、先行RED検査から是正。全試行正答、有効caller時間、正の1Worker中央値を満たす場合のみperformanceComparable=trueとし、不成立時は短縮率null＋理由を返します。生時間と失敗は保持します。独立Reviewerと監査が再確認しました。
- この是正だけを加えたSites v65/source `c3b3c2666c106e91bd99cd888a8fd074741096bf` を保存・公開しました。pool/worker/WASM/Unity経路はv64と同一です。比較の再検査は別試行として記録し、初回失敗を取り消しません。

### FT最適化の判断

FT計算の最適化は不採用です。変更前と候補の8192／262144要素を同じ外部測定器で各4回計測しました。後続3回の中央値はNode環境で、変更前caller 75.01／154.20ms・compute 5.98／56.47ms、候補caller 77.69／155.24ms・compute 6.00／58.24msでした。この計測はローカルファイルWASMとNode Workerでありブラウザ速度に一般化しません。実ブラウザでは起動・取得を含む時間が支配的で、毎要素処理の変更が必要という根拠は得られていません。FT adapter・WASM・ABI・loaderは変更せず、P1の正確な回収・復帰・計測に範囲を保ちます。

### 証拠の読み分け

| 証拠 | 対象版・配信経路 | 判断できる範囲 |
| --- | --- | --- |
| b2初期48ジョブ | 当時のSites通常開始、上の記録 | 正答、対象条件で重複未観測。通常開始全般の不能ではない |
| b2準備後開始 | e0b8c9cの[kushyameln-production-b2.json](https://github.com/Kushyameln01/kushyameln-works/blob/e0b8c9c4411af76e9051baa99a8c2640f7c74e2b/development/shared-compute/kushyameln-production-b2.json) | 対象入力の2／4 Workerの重複。速度一般化とは別 |
| 後続クラウド報告 | ユーザー提示の2026-10-16報告、ローカルHTTP | 報告値は1/2/4中央値365.7/246.2/180.8ms。元測定JSONは今回未取得、再集計済みとはしない |
| 調整後候補 | Sites v64/v65、evidence-adjustment/ | 版・実行順序・生時間・失敗と回復を保持 |
| 調整後Pages | 配信確認後の追記と取得receipt | 候補試験とは別に本実装の配信一致と利用経路を確認 |

ヒープ/自然GC/Worker peak/browser全体メモリは今回測定していません。論理入力や未完了件数0を全参照解放やメモリ0とは表現しません。外部の全利用者テレメトリは追加しない原条件を維持します。

### Sites候補受入の結果

| 確認 | 結果・証拠 |
| --- | --- |
| 通常比較 v65 | 18試行72ジョブ全正答、performanceComparable=true。1/2/4中央値11822/6726/3658.95ms。通常開始のcompute重複は未観測。sites-normal-v65.json |
| prepared v64 | 両順序とも正答、2/4全数重複。2Workerは143.1001/135.8999ms、4Workerは68.2998/75.5ms。別算法による再集計一致。sites-prepared.json |
| Module比較 v64 | 全正答・lifecycle成立、両順序約1.1%/4.3%短縮で10%未達。recommendReuse=false。sites-module-comparison.json |
| 取消・復帰 v64 | 両reuse方式のlifecycle、未決準備からの明示再投入、同key生存ジョブ保護、disposeがPASS。sites-lifecycle.json / sites-preparation-recovery.json |
| 6タスクの実ブラウザ往復 | FT2ジョブ、ZIPexpand/parse-batch/analyze、単独.anim parse/analyze、構造化analyze/diff。jobId/revision/status、fileID文字列、Idle→Idle revised一致。sites-ui-checks.json / sites-unity-{zip,single,diff}.json |
| 画面と例外 | 入力変更で旧応答抑止、明示取消→空結果、拒否→正しい再投入。sites-ui-checks.json |

証拠はすべて[evidence-adjustment](evidence-adjustment/)に保存しています。初回timeoutは原因未特定であり、v65全正答をもって原因解消とは主張しません。Sites v64/v65とsource/archive/deploymentの対応はsites-delivery.json / sites-delivery-v65.jsonを参照してください。ブラウザ実測のsourceCommit=nullは未取得の意味を保持し、外部receiptで対応付けます。

### 本実装の配信確認（compute-unity-b5）

2026-10-17 JST、runtime commit `34368e769def983d7709ed21a6ac4a93c9b4b2b4` をexpectedSHA `0ee9b175b75890f42c965770af0d06b0b77cd003`、force=falseでmainへ反映しました。Git tree全56変更ファイルを候補のblob hashと照合し、公開差分は7件、公開81件の追加・削除は0でした。Actions `38974723548` はsuccessです。

| 配信後の確認 | 結果 |
| --- | --- |
| 実配信81ファイル | 全件Git blob一致、HTTP200、WASM application/wasm。pages-acquisition.json |
| FT画面往復 | 別Worker/Instanceへ2ジョブ、revision303、[0,3,5]/[0,7]正答。pages-ft.json |
| 準備後並行計算 | 両順序・16ジョブ正答。2Worker全数重複126.7002/114.6001ms、4Worker67.7000/60.2000ms。pages-prepared.json |
| Module準備復帰 | 未決準備→個別timeout→明示再投入成功。一方取消で同key生存ジョブを保護。dispose後論理会計0。pages-preparation-recovery.json |
| Unityの既存画面 | 公開ファイルサンプルから5ジョブ成功、差分Idle→Idle revised。pages-unity-browser.json |
| 配信物を要求する既存検査 | 実取得receipt確認後、publication runtimeでmodule/bundleの6タスクと旧mediaタスク拒否PASS。Unity minimum/filesは各1/2/4Worker×reuse両方式の6構成PASS。pages-runtime-publication.log、pages-unity-minimum.log、pages-unity-files.log |

相対パスは候補の静的export検査と実配信のworker-runner/Unity画面→shared Worker/WASM読込みで確認しました。詳細な配信対応はpages-deployment.json、全証拠のhashはpages-evidence-manifest.jsonに保存しました。後続の証拠追記commitは公開docsファイルを変更しません。

最終批評では、保存手順と最新指示への準拠を先に確認し、原目的の「権限を持つChatGPTが、複数Workerへ計算を投入して結果を回収できる共有基盤」を維持したと判定しました。仕様表、計測、復帰処理のP1を完了し、FT最適化は不採用です。初回Sites通常比較の起動timeoutは原因未特定として残し、全端末の速度向上・物理コア同時稼働・自然GC/最大メモリ・タブ終了後の継続処理を保証しません。
