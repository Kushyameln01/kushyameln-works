# Animator Integrator VRCFT5 要件

## ユーザー原文 2026-10-27

#現[Animator Integrator]のブラウザツールとしての調整について。
##前提として、これは[VRCFT5]向けのものとして確定させる。そのため、以下の調整を行う。
###名称を、[Animator Integrator(試作)]から[Animator Integrator(VRCFT5)]とする。
それに伴い、[GItHub・ツールページのリンク名称]と、[実ツールページ内部のUI]を変える。
###例外規則を、現行のものに加えて追加する。
-[Decode/・Function/・Proxy/・Smooth/]について、これはAAP(AnimatedAnimatorParameter)かつ外部出力とノットイコールであることから、基本として[ExpressionParameterに追加しない]。
-ただし[Smooth/かつ_Function]について、これは[関数指定を行う場合のSmooth]としてユーザーOptionとするので、[同期Off]として[ExpressionParameterに追加する]。
-[Binaryの末尾0]について、これはBlendTree構造において手動で実装が必要な要素であることから、基本として[ExpressionParameterに追加しない]。
-[Negative]について、これは[VRCFT5におけるParameter範囲]に基づき、未定義の場合は変更せず、定義済みかつ負の範囲が存在しない場合に、これを[同期Off]かつでなく[ExpressionPaarameterに追加しない]ものとする。
-[左右EyeLidにおけるBinaryParameter]について、これはFloatのEyeLidが[初期値0.75]であることにあわせ、[末尾4と末尾8]を初期値１とすることで、[Binary変換後に0.75となるようにする]。
###踏まえて、それらを実装したあとに[例外規則]をユーザーが簡単に判断できるように、ページ最下部に[例外規則についての記載欄]を用意したい。

## 作業範囲

公開GitHub Pages版の本実装を修正・検証する。基点9382390797ec0d06f6b1932f162254da8b6fc9a3。前ターンのCyant専用プロファイル案は実装仕様にしない。
Expressionへの出力登録・設定を変更し、Animator宣言、構造、Clip、BlendTree、Maskの保全条件は維持する。既存Hike/WASM統合基盤を使い、単純な行選別に新しい計算基盤を加えない。

## 解釈と受入条件

- prefixは名前先頭のDecode/、Function/、Proxy/、Smooth/で判断する。Smooth/かつ末尾_Functionはユーザー調整用Parameterとして登録し同期OFF、既存Expressionの型・初期値・Savedを保持する。未登録なら選択Animatorの宣言から型・初期値を引き継ぎ、Saved OFF・同期OFFで新規追加する。UIチェックボックス追加とは解釈しない。
- 除外は既存入力Expression行にも適用する。除外前の型変換・競合・bit検査で不要行が生成を妨げない。除外名をAnimatorから再追加しない。
- 末尾0は現行ASCII末尾判定を使いExpressionから除外する。
- Negativeは現行の公式範囲lookup（canonical、slash namespace、dot互換名）を使う。非負なら除外、負の範囲があれば既存Binary規則を適用、未定義は入力設定を保持する。
- 左右EyeLidのBinaryは1/2=0、4/8=1に揃える。Expressionだけに適用し、Float本体0.75は既存規則を維持。0.75の数値成立は実Templateから確認する。
- 今回の一般規則にないCheekPuffSuckNegative・MouthClosed1のCyant専用例外は加えない。
- 名称はAnimator Integrator(VRCFT5)。サイト内リンク、GitHubの現行案内、UIタイトルを更新する。歴史的検証記録の旧名称は書換えない。
- 例外規則一覧は素材未読込でもページ末尾に見える。適用対象・登録可否・型/初期値/同期と、Animator保持範囲が読み取れる。
- VRCFT5専用化に伴い旧range無効化UIを撤去する。API vrcft5RangeSyncは未指定/trueを受理し、falseは明示エラーとする。監査で原要件整合を確認。

## 完了証拠

原要件ごとのNode試験（純粋行規則と生成archive読戻し）、既存保全回帰、現行TemplateのEyeLid数値検査、Cloud browserの公開UI・ファイル生成/保存を別々に記録する。Unity Editor実動作は未検証として残す。

## 判断記録

Smooth追加を保持のみに狭めた初期解釈を監査で訂正した。未登録時の新規Saved OFFは既存AlwaysOne追加と同じ方針。選択Animator宣言が根拠であり、任意名/値の推測生成はしない。公開TemplateのDecode4=0.25、Decode8=0.5、NormalizeBlendValues=0を静的確認。
