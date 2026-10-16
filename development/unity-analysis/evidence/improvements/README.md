# Unity解析改善の証拠

対象は `unity-analysis-0.3.1` / `compute-unity-b4`。製品のPages commitは `aa4b92cd9e8f6189ee3ab8e59a86e231513d5486`、比較基準はGUID・JSON修正後の `1a3bd7ce3791cdd18a0eda7fd569b46e5cdd2b05` です。以前の `6dc93ea` の性能値との直接比較ではありません。

[全証拠ZIP](evidence.zip)には、測定の全samples、メモリの全観測、回収した全件JSON、失敗ログ、試験ハーネスを収録しています。[manifest.json](manifest.json)で各ファイルのサイズとSHA-256を確認できます。[performance-summary.json](performance-summary.json)は元の全件記録から作成した集計です。Sitesのsourceには非圧縮の元ファイルも保存しています。

## 確認結果

- GUIDの大小文字だけの変更、実際の変更、重複GUID、JSON遅延生成・再利用・解放の回帰8件。最終版ではbatch9件とZIP所有権7件を加え、24件成功。
- raw SDKの1/2/4 Worker × Module再利用off/onの6条件成功。module/bundle、ZIP/unitypackage、既存FTとの共存、取消・利用者分離、期限切れ・不正入力からの復帰を含む。
- 公開Chromeで123件のページ送りと絞込みを操作し、JSONサイズ算出は1回、整形は最初の表示または保存まで0回、その後は1回のまま。全件保存347,439 bytesと表示が一致。最終版のサンプルでも表示→保存の129,440 bytesが一致し、取消・設定変更後の古い結果失効・復帰を確認。
- 配信workflow成功と107個のGit blobを同定してから実行。個別CDN応答の全バイト取得とは区別する。

## 計算前後の時間

Node v24.19.0、単独`analyze()`、毎回新規pool、`moduleReuse=false`、各5回の全体時間中央値です。64個の小ファイルは13,612 bytes、128 objects。ブラウザ自体の速度測定や一般のUnityプロジェクトに対する保証ではありません。

| Workers | 1ファイルずつ | 最大8ファイルまとめ | 短縮率 |
|---|---:|---:|---:|
| 1 | 4,358.03 ms | 645.49 ms | 85.19% |
| 2 | 2,399.14 ms | 393.72 ms | 83.59% |
| 4 | 1,432.33 ms | 240.44 ms | 83.21% |

baseline114件、candidate114件成功。各90件のfresh測定と、4件のwarm初回・20件の同一pool反復を区別しています。全入力hashと解析内容が一致しました。比較時だけ `before.analyzerVersion` / `after.analyzerVersion` を基準版に統一し、実際の版・build・規則版と元のsemantic hashは保持しています。最初のcandidate試行は、この版番号差を機能差として扱って最終比較で失敗しました。stderrを保存し、測定側だけを直して必要な114件を再実行しました。

Workerの起動待ちにはimport・スケジューリング・メッセージ到達も含まれます。並行区間の合計を全体時間へ足すことはできません。数値の採用判定は最終JSON検査・freezeも含む呼出側`outerWallMs`を使います。通常のreport内`totalMs`はその最終検査前で終了します。

batchは最大8ファイル・256 KiB、waveは16 MiBまで。Worker常駐化はしていません。Module再利用の既定値はfalseを維持します。candidateのfresh・2 Workerではsmallが148.97→172.48 ms、manySmallが393.72→386.60 msで、有効化の採用基準を満たしませんでした。この判断は`analyze()`に限ります。

## メモリ

展開後63/64/65 MiBをそれぞれ新規Nodeプロセスで観測しました。63/64 MiBは完全なinventory/hashを維持し、65 MiBは明示的な展開上限エラーです。ZIP断片配列と最後の結合を単一出力bufferへの逐次転記へ変更しました。CRC・パス衝突・長さ・全件性の検査は維持しています。

最大観測RSSは63 MiB入力で219.2→217.0 MiB、64 MiBで225.2→224.7 MiBでした。明確なピーク削減やコピー総量の削減は確認できていません。10 ms間隔と工程境界の標本は瞬間ピークを見逃し得ます。RSSはWorkerを含むプロセス、heap/external/arrayBuffersはmain isolateの値です。64 MiBは展開量の上限であり、プロセスメモリ上限ではありません。メモリリークの有無を断定する試験でもありません。

## 記録の読み方と再現

ZIPの`improvements/`に元記録、`tools/unity-analysis/`に実行に使ったハーネスを格納しています。`acquisition-b3.json`と`acquisition-b4.json`にcommit、workflowと公開ファイルhashがあります。実行時は先に対象Pages更新成功とファイル同定を済ませ、`UNITY_PAGES_ROOT`をその検証済みクラウドコピーへ設定します。ローカルの未公開製品へ向けて実行しません。

`run-stages.mjs`の比較には`UNITY_STAGE_COMPARE`でbaseline JSONを指定し、このbaselineには`UNITY_STAGE_COMPARE_ANALYZER_VERSION=unity-analysis-0.3.0`を明示します。比較条件と全samplesは出力JSONに残り、失敗時も終了コードと失敗内容を保持します。合成素材はハーネスから再生成でき、inventory hashで同定できます。

TinyFishの観測範囲とChromeの操作・JSON回収証拠は別記録です。ユーザーが示した過去の独立検証403を、この実行で解消・再現したとは扱っていません。独立検証ZIPも今回取得できていません。

## 最終保存時の上流更新

性能測定後、media basic公開・前処理非公開化の別更新9086c481が入りました。Unity分析ソース・UI・WASMは不変ですが、共用registryとbundleの更新に合わせて、配信成功後のUnity依存38ファイルを同定し24回帰とSDK6条件を再確認しました。全件成功。[追加の統合記録ZIP](final-integration.zip)とmanifestのsupplemental欄を参照してください。性能値はaa4b92cでの測定に限定します。元の72項目ZIP（その時点のREADMEを含む）は固定しており、この追記はその後の統合記録です。
