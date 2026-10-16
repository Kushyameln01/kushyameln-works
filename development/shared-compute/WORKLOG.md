# 共有計算の本実装ログ

- 2026-10-16: 最新指示によりSites=仮実装、GitHub Pages=本実装、TinyFish限定を解除。保存された指定手順の順序・合格条件は維持。
- Sites v48で単一Workerの実往復と基準測定。設計批評後にプールを実装しv49で比較。正答は成立したが計算区間の重なりが未観測だったため、その判定を保持して修正設計へ戻った。
- 準備後開始の公開APIオプションを設計・批評し、要件検査REDから実装。既定false、同一入力と同一計算を維持。v50/source5a93af5ece9c3980b68179690f4045edf7ae7a28で2/4の重なりと正答、ライフサイクルを実ブラウザー確認。
- 技術Reviewer PASS、独立監査PROCEED後、既存Pages基点a4bece5001dd70037918f2d63d64123ade164de8から22ファイルの差分を作成。32既存公開ファイル中31をバイト保持、githubカテゴリの入口のみ変更し、新規11公開ファイルを追加。公開一覧43、Node29、出版15検査PASS。
- 本実装commit bad511c1d51683b6bd19bd803b95e781956382f2。Actions38863237492成功後、公開URLで通常バッチ/準備後2・4Worker/MIME/既存導線を確認。原JSONと画面を記録。ソース保存、実検証、目的達成、公開を分けて確認した。
- 記録だけの追記では公開docsツリーを変更しない。性能値は観測条件に限る。生の添付資料、会話全文、資格情報はこの記録へ含めない。
- 配信後の最終批評: 技術Reviewer PASS、独立監査PROCEED。準拠確認を先に行い、本番原JSONの正答・MIME・独立ID・計算区間を再計算した。4Worker全区間共通約93.2ms。登録済み1タスクを扱う共有基盤として目的達成と判定。原記録を確認した監査役がActionsを別途再取得したとの主張はしない。


## compute-unity-b5 調整履歴

[調整計画](https://chatgpt.com/space/page_34045a8cecec8191a2b2702f41773653)に基づく。基準Pages0ee9b175、Sites v63。保存手順の復元→既存DESIGN差分→二批評→RED検査→最小修正→是正後再批評→Sites受入の順に実施。元手順チャット全文の取得は主張しない。

未決Module検査RED6件→37PASSの後、独立レビューでabort listenerからの同ID再投入/旧evict境界を発見。再現RED→順序/record同一性の修正→38PASSと独立再検査で是正。比較側もv64初回timeoutを保持し、失敗時短縮率nullへRED→GREENで是正。

### 調整E・候補受入完了（2026-10-17 JST）

- v65通常比較は18試行72ジョブ全正答、performanceComparable=true。1/2/4のcaller中央値11822/6726/3658.95ms。通常開始のcompute重複は未観測であり、速度短縮と並行区間を区別する。v64初回4TIMEOUTは残し、別試行として記録。
- v64準備後開始は両順序で全正答、2Worker全数重複143.1001/135.8999ms、4Worker68.2998/75.5ms。Reviewerが別算法でrun/波すべて再集計し一致。
- 実ブラウザ6タスクを既存画面から回収。FT二ジョブはjobId/inputRevision202と値[0,3,5]/[0,7]一致。ZIPからexpand→parse-batch→analyze、単独.animからparse→analyze、構造化比較でanalyze×2→diffが成功。差分はIdle→Idle revised。新UI/新taskは追加していない。
- 入力変更時に旧操作を取消し結果/診断を消去、新revisionだけを表示。明示取消→空結果[]、不正weights拒否→正常再投入[0,3,5]を確認。生記録sites-ui-checks.json。
- v64→v65はREADME・通常比較gate・説明文だけで、pool/worker/WASM/prepared/lifecycle/recovery不変を独立確認。v64受入証拠は対象版を明記して引き継ぐ。Sites全live bytes未確認の限界はdelivery receiptへ明記。
- Pages候補は81公開ファイル維持、追加/削除0、変更7件、登録表とWASM不変。既存publication15件PASS、静的media公開検査PASS。元公開アーカイブ43ファイルもbaseline blobとSHA256照合。既存runtime検査は本番の全81配信一致receipt後に実行する。
- 目的確認：複数Workerへの投入・入力との対応・結果回収・失敗後の復帰を既存利用経路で確認。FT最適化は根拠不足で不採用。公開前の独立最終判定へ進む。
