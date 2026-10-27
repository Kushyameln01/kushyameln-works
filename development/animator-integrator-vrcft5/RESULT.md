# Animator Integrator(VRCFT5) 検証記録

基点: `9382390797ec0d06f6b1932f162254da8b6fc9a3`。対象はGitHub Pagesの既存Animator Integratorと、同じAPIを呼ぶDecode / Smooth一括生成。

## 実装

- UI・GitHub/ツール一覧・READMEを `Animator Integrator(VRCFT5)` に統一。
- Expressionに対してAAP prefix、末尾0、公式値域が非負のNegativeを除外。未定義Negativeは型・初期値・Saved・同期を保持。
- `Smooth/…_Function`は既存行の同期OFF。未登録なら選択Animatorから型・初期値を引継ぎ、Saved OFF・同期OFFで追加。
- 左右EyeLid Binaryの1/2=0、4/8=1。Animator Binary宣言の初期値は保持。
- 未読込み時からページ最下部に例外規則表を表示。旧range無効化UIを撤去し、APIのfalse指定は明示エラー。
- 除外を競合・Bool検証・bit計算より先に実施。除外/追加/変更元をreportに記録。

## 実行済み

1. Core新規回帰: 初回RED 6件失敗/1件既存合格からGREEN 7/7。Integrator全体は実Template指定で54/54、skip 0。
2. 関連統合試験: `INTEGRATOR_TEMPLATE_PATH=docs/parameter-template/template.json node --test tools/animator-integrator/test*.mjs tools/decode-smooth-builder/test*.mjs tools/parameter-template/test*.mjs tools/parameter-registrar/test*.mjs` →89/89 PASS、skip 0。
3. 実Templateから生成されたDecode1/2/4/8のClip定数を読み、最終ExpressionのBinary初期値で左右それぞれ0.75を再構成。0.25 + 0.5 = 0.75。Clip・Treeは変更していない。
4. `verify-output.py`による生成コード非依存のgzip/tar/Unity text読戻し: PASS。2対象、3Layer、26 Animator宣言、13 Expression登録、8bit。42全ファイル、94 Motion（未参照14を含む）の保全確認。
5. `python3 -m unittest discover -s tests -v` →46/46 PASS。
6. `python3 scripts/sync-static.py docs --output <新規検証stage>` →Validated export。公開allowlistに新規moduleだけ追加。
7. `git diff --check` →PASS。
8. 原依頼とSPECに対する読取監査 →PROCEED。Smoothの未登録追加を当初の保持のみ解釈から訂正済み。Cyant専用の追加例外は実装していない。

## 既存検査の失敗

`node tests/relocation.mjs`は、過去の配置変更時点の固定snapshotと現在のkernel loaderをバイト比較して失敗する。今回の差分がない基点 `9382390` を別worktreeへ展開して同じ失敗を再現した。今回の変更ファイルにkernel loaderは含まれない。旧snapshot固定検査を今回の機能修正に合わせて書換えていない。

## 公開確認

実装公開commit: `b7191d791103779facee96562951b889ebc6212d`。ローカル検証済みcommitと公開commitのtreeはともに `594d47cd53ac1265cda16e94bffc6f4fa656dedf` で一致する。

- 公開版 `https://kushyameln01.github.io/kushyameln-works/animator-integrator/` でVRCFT5名称、素材未読込み状態の末尾規則表を確認。
- `https://kushyameln01.github.io/kushyameln-works/github/` のリンク名も確認。
- 合成素材を実UIへ投入し、Controller順序・Expression・Mask・2Treeを選択して生成。Unitypackageと検証JSONを保存リンクから取得。
- 保存物を生成コードとは別のPython gzip/tar/Unity text読戻しで照合。入力19 Expression行から6行を除外しSmooth1行を追加、最終14行・9bit。期待する全行と保存したreportが一致。
- 既存SmoothのSaved保持と同期OFF、未登録SmoothのAnimator由来Float0.4/Saved OFF/同期OFF、未定義NegativeのFloat0.25/Saved ON/同期OFF保持、signed Negative Bool同期ON、左右EyeLidの1/2=0・4/8=1を確認。
- 同じ素材の保持対象5全ファイルについてGUID・親配下path・meta・payloadを比較。AnimatorにDecode/TestとSmooth/Added_Functionが残ることも確認。
- 保存後に出力名を変更し、古い結果とダウンロードが失効することを確認。
- 詳細は `public-verification.json`。画面は `public-vrcft5.jpg`。

追加の読取コードレビューでは修正必須の欠陥なし。レビュー担当の再実行12/12 PASS。

## 検証範囲

Unity Editor Import、VRChat実動作、ユーザー環境でのアバター挙動は未検証。上記はブラウザ用Workerの生成・数値・参照・素材保全の確認である。
