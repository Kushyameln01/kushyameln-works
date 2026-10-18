# 作業記録

## 2026-10-18 開始

- 計画v1.0の実行指示を受領。関連スキルとクラウド複製手順、Sites手順を適用。
- Pages mainは2feb6d4。Sitesはv73/source82b7422まで進んでおり、VR180差分を保持する。
- 空ディレクトリでのSites helper初回は `Unable to prepare the Site`。同一Siteの既存clean checkoutを公式helperで開き、最新版へのfast-forward成功。初回失敗の原因は特定していない。製品障害とは扱わない。
- TinyFishは残高不足。課金・設定変更を行わず、許可済みCodex cloud cdpを選択。前回と同じ入出力経路を再確認する。
- Aの計測追加は既存挙動を変えず端末内のみ。B公開前にAの結果を全量回収する。

## C01 保存物探索

- workspace/Sites記録とLibraryの2系統を探索。旧生成器は実行していない。
- Sites `docs/ft-hike/avatar-regression-evidence-20261012.json` の runs[5].cases[0/1] に生成成功とPlanが残る。出力69,208 bytes/SHA-256 `1e8a3d26700d7ac3954d80b6d609c4c0039b7d97a83d1a11f15280b63da53b7f`、17,289 bytes/`d0bf8e6e5763d0862ba18ccb13ba367057691e8544aa4700bf7c643d1fcfdc87`。
- 対応入力subset hashは `cbe30caebabf50243705a4610ef1a5809828aa76b0c01d587238c543ade53989`。入力実体、生成package実体、操作revisionとSites v69の対応は未確保。
- Libraryの対象生成名検索は該当なし。10月11日のUseReviewは生成未完了の評価記録なので出力基準に使わない。
- 判定はHOLDを維持。今回のA/B出力保全と旧C01を別に記録する。

## A公開・基準測定
- commit d424a1774a86704bf156f824681d9f6ca42a5aae、Pages run 39112374856 成功、変更3配信ファイルSHA一致。
- 通常/多件数×診断なし/あり×5の計20回。多件数2回でブラウザ待機側エラーが出たが、同じ操作の完了を確認して計測値を回収。
- 返却ダウンロードパスの7件は実体未回収。各条件の出力と全件JSONは取得済。生成後に診断が失効する既存挙動のため、ページ送り観測は追加の診断完了後に実施。50→100→150行整形、容量計算1回・全文整形0回を確認。
- Bの静的レビューPROCEED。pool所有権、同期コピー境界、遅延JSON、baseline不変を確認。
- Sites静的配信検査で計測用new URL式の未登録を検出。URLの観測のみでfetchしない2式と既存computeへの動的importを明示登録し、検査を維持して再build。

## B公開と検証
- Pages commit 20edc32b13981320686d5418852cacf589d24a63 / run 39113199803 成功。公開133ファイルを取得し全件Git blob一致。
- 診断境界30ケースPASS。実SDK/Node Worker/WASMのsnapshot/report上限超過と復帰PASS。
- 選択回帰の初回呼出しで必要な --experimental-vm-modules を付け忘れ、Node harnessの起動失敗。製品不具合と区別して正しい起動オプションで再実行。
- Sites側はVR180のHEVC・track reference更新が同時進行。2回の非fast-forwardを受け、他変更を保持してmerge。生成build-reportのみ再生成して衝突解消。
- Sites source eecd74935882b3f19b37494e18f0581f5bce0688 push成功。save時invalid_archive。packager終了後のアーカイブ実体は2,621,440 bytesでgzip終端欠落を確認。別パスへ公式helperで再packageし、全エントリを読み直してから再登録する。切断原因は未特定。

## 公開完了・証拠回収

- Sitesを公式helperで再package。9,194,466 bytes、SHA-256 `d3add22dc1e0675f1fb361b6d7c63e0617a89f60479cad0df3b128f525a21ec4`、255ファイルを全量読取り確認。v76保存・deployment `appgdep_6ad48b1107e88191adda1a0449b7d125` succeeded。公開audience、DB/R2設定は変更していない。並行したVR180更新を保持した。
- 公開取得版の選択回帰は正しいフラグで12群PASS。境界30ケース、実SDK上限回帰の結果と試験層をB-testsへ保存。
- Bも通常/多件数×診断有無×5回を完了。30 download操作中25実体回収、5実体未回収。A/B合計package31、report17を静的照合。全packageの本体・member bytes、全reportの意味・全件性が一致。同一反復の直接比較は19 PASS / 11 UNAVAILABLE / 0 FAIL。
- A archive照合の旧表示 `manifestMatchesArchive:true` には、未回収7件の「不在がmanifestと一致」も含まれていた。各行へ回収状態とbyteVerificationを追加し、未回収はNOT_PERFORMED_UNAVAILABLE、byteLengthAndSha256Match=nullと明記。測定や成果物の再実行はしていない。
- 通常・診断なしの最初のB測定群で2〜5回中央値413.45 msが調査境界339.5 msを超過。製品変更なしの別群5回は220.1/254.1/228.4/222.3/230.3 ms。原群は残し、再現しなかったことだけを記録。原因解消や性能全体の合格は未認定。
- 初期resource24→6、未実施JSON保存後も6。多件数512行の未展開整形0、同じ行/coverageは展開後各1、全件JSON/容量各1を確認。全件表示は8,706,284文字、回収JSONは8,706,378 bytes。日本語等の文字数とUTF-8容量を混同しない。
- 生成物診断25ファイル、同じ出力の比較差分0、取消（sdkReport=null）後214ファイル再実行を確認。取消時のsdkSettlementはpendingでlastMs=null。UI終端を物理的Worker停止としない。
- TEXT_BYTE_LIMITでも生成可能。生成結果16 Asset。最初の返却downloadパスに実体がなく、既存生成リンクから6,518 bytesを取得しSHA-256記録。再生成なし。続けて通常素材の診断succeeded、208,926 bytesの全件JSONを回収。
- 詳細summaryのEnter操作はブラウザ制御のdeadlineで確認できず。表示状態を確認し、PageDownや一意なselectorへ変えたが成功証拠は得られなかった。ネイティブdetails構造からキー操作合格を推定しない。クリック展開は別のB-ui証拠にあり、キー操作はUNVERIFIEDとして保存。
- 巨大な全文JSONの全体text探索はブラウザ読取りdeadlineとなった。対象DOMに限定してJSON内容と文字数を読取り、保存実体と照合。ブラウザ待機エラーを製品異常と断定していない。

## 最終判定と再開点

- 独立レビューはC12=PARTIALの維持、初回診断788.4→2029.6 msの併記、追測による原群置換禁止を確認。上限エラー後の回収記録を実体hashへ更新した。
- 実装・公開は成立。保全計画全体は未完了。C01の旧対応実体、C12の連続全体/Blob区間、キー操作の必須証拠、download欠測を残す。
- 性能の工程和を連続待ち時間、JS参照保持短縮をGC解放/ピーク低下へ読み替えない。Memoryはnull、Unity/MA/VRChat実動作は範囲外。
- RESULT/VALIDATIONと全回収実体を保存。再開はそれぞれ不足証拠の取得から。最新公開版以外の生成器を実行しない。
