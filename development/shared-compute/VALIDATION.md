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
