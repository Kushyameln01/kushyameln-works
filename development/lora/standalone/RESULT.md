# LoRA L1–L4 単体完成結果

**単体の宣言範囲はPASS。** ローカルlight/detailのHIGH/LOW、計2,904 logical patchを全full shape・全入力列で通常SDKから処理した。独立NumPy比較は18ケース、255,748,547,328要素、370,404 blockでgate逸脱0。R2の12逐次取引も全値F32 stream hashで対応を確認した。Diffusion全モデルへの組込、学習base同一性、製品生成READYはこの判定に含めない。

基準計画は[Kushyameln Works モジュール単体完成 実行計画 Draft](https://chatgpt.com/space/page_1e950f67b0688191bd3f2a1d5b252224)、版1.0 draft1。実施日2026-11-02 JST。元receiptの時刻はUTC表記を保持する。

## 配布と実行source

| 区分 | 完全commit SHA／参照 |
| --- | --- |
| 作業branch／Draft PR | feat/lora-hike／[PR #2](https://github.com/Kushyameln01/kushyameln-works/pull/2) |
| 着手時実装 | 86f87f42c8585d823f06810370bc0bd451f3fce3 |
| R1 全selected値・保存数値試験 | 4a3419c768e2b4b38b081314abe2cfaaeed6b14b |
| R2 取消修正・逐次取引・browser | 986b66b3dd54ef26d98f99a1db92a2933f3e31aa |
| 証拠配布SHA | 本文を含む固定commitをPR #2の配布報告とチャットに記載する。自己参照hashは本文へ埋め込まない。 |

[API](../../../docs/shared/inference/lora/STANDALONE.md)／[機械可読結果](./RESULT.json)／[実行source全closure](./EXECUTION-SOURCE.json)／[取得契約](./HANDOFF.json)／[path・bytes・SHA-256](./FILES.json)／[再現手順](./REPRODUCE.md)／[資源](./RESOURCES.md)。R1は17ファイル、R2は18ファイルの実行bytesを各固定Git objectと照合済み。

R1→R2のruntime差分はowned-package.mjsの共有計算取消・終端処理と、新しいlifecycle試験だけである。loader、mapping、full shape、kernel、演算順、独立参照、gateは同一。R1の実行をR2へ付け替えず、R2の全値F32 hash一致と変更境界の回帰を組み合わせて再利用する。

## 完成した機能と入力域

新版lora-standalone/1.0-draft.1を追加した。standalone SDK、registry、planner、owned package、strict-F32 Hike streaming kernelが実装正本。通常はregister→compose→prepare→stage、またはapply、restoreBase、save／openPackage、cancel／recover／disposeを使う。独立expected、gate、NN run、画像mean／F/H/Wは通常入力に要求しない。

| 原本／side | logical patch | full selected要素 | 原本storage／完成dtype |
| --- | ---: | ---: | --- |
| light HIGH | 1,052 | 14,286,919,744 | BF16／F32 row-major |
| light LOW | 1,052 | 14,286,919,744 | BF16／F32 row-major |
| detail HIGH | 400 | 14,050,918,400 | BF16／F32 row-major |
| detail LOW | 400 | 14,050,918,400 | BF16／F32 row-major |

全原本の5,314 source tensorをmapping／実capture／独立target集合へ結合した。light片sideは低rank405、weight diff201、bias diff446。detail片sideは低rank400。rank64／128、alpha128または省略、幅256／4096／5120／13824を含み、FFN・time_projection等も全full shapeで計算した。原本の除外target／領域は0。対応表全件は[MAPPING.json](./MAPPING.json)と[完了scope](./diagnostics/DOMAIN-CLOSURE.json)を参照する。MAPPING.jsonのNOT_EXECUTEDは当初のheader棚卸し時点の歴史的状態であり、後から数値合格へ書き換えていない。

固定loaderはcomfy-lora-b5a4321-linear-diff-v1。linear-down-up／linear-a-b／additive-diff／additive-diff-b、BF16／F16／F32を扱い、元座標・全入力列・末尾tileを保持する。alpha/rankとalpha省略時のscale=1は、この固定ComfyUI規約だけの扱い。未知variant、倍率、暗黙転置、Conv／DoRA／LoHa／LoKr、量子化baseの暗黙復号等を既定値で通さない。F16/F32のcomponent検証と、実原本BF16の全件検証は別証拠である。

一instanceは固定HIGHまたはLOW。片組、二組、なしを選択でき、合成順はlight→detail。不変baseから各段階をF32で再構築し、再適用で累積加算せず、除去で丸め済み差分を引き戻さない。strengthは有限F32を受け付け、全件数値試験は各組0／+1／-1、二組(+1,+1)／(+1,-1)を確認した。任意の全実数強度を総当たりした主張ではない。

正本はgraph-free logical registryで、1053可能targetを持つ。FULLは選択LoRAの全patch・全領域という意味であり、Diffusion全graphの適用範囲ではない。任意sliceは元full shapeと除外を保持しPARTIALとする。ファイル名・shape一致や宣言modelHashだけで学習base適合を認定しない。通常クライアントに全4原本の登録・既知hash一致は要求しない。

旧v1／v2／Q16／P4の契約と16MiB小package上限は維持した。旧Diffusion論理tableはLoRA ownerのbernini-targets.mjsを互換reexportし、mapping正本を増やさない。今回のAPI差分は全対象streamingと通常二組制御の新版追加であり、実Diffusion production feedの複製ではない。

## 新規検証と再利用証拠

| 検証 | 結果／scope |
| --- | --- |
| 4原本のfresh header／alpha棚卸し | 計2,904 patch。既存inventoryの有効hash証拠を再利用。棚卸しだけの全体再hashはしない。 |
| R1 actual capture／save／fresh open | 新規loadに必要な実原本・保存payloadのhashとheader、base／kernel identityを検査。保存後の全件比較は保存payloadを使用。 |
| R1 独立全selected比較 | 各side8算術ケース＋base復帰の9ケース、合計255,748,547,328要素。全ケースFULL、未完target0、gate逸脱0。 |
| R2 逐次通常取引 | 各side同一consumerで二組→light→light再適用→二組再適用→detail→base、計12件。170,971,034,240要素相当の全stream hashがR1 actual F32と一致。 |
| R2 除去後base独立比較 | lightだけにあった652 target／side、236,001,344要素／side、合計472,002,688要素、逸脱0。base復帰後は旧light全1052 targetも読戻す。 |
| 実原本の取消／復帰 | 両sideのfull planを最初のbounded tile後に取消。公開epochとactive packageを保持し、recover後に後続全取引が完了。取消観測領域は各5,120要素、PARTIAL。 |
| 変更境界／互換回帰 | Node241/241 PASS、fail／skip0。Python oracle8 PASS。既存小P4 fixtureは48ff固定の互換試験であり単体runtime依存ではない。 |
| Chromium／OPFS | Chromium154、15小File制御ケース。実payload保存→fresh page→新SDK読戻し、取消・復旧・所有権と終端解放。全2904のbrowser再実行とは呼ばない。 |

独立baseは非zero F32((originalFullElementCoordinate % 17 - 8) / 128)。参照は独立safetensors parserとNumPy binary64積、各source適用段階でF32丸め、biasはF32数値一致。事前gateはweight abs≤1e-5+1e-4×abs(expected)、bias abs=0。最大絶対差は1.4901161193847656e-8であり「数値差ゼロ」ではない。near-zero要素の最大相対差だけで合否を判断しない。raw全ケースの値数・誤差・全stream hashは[CSV](./diagnostics/NUMERICAL-RESULTS.csv)と[R1完全receipt](./diagnostics/R1-FULL.json)に保持する。

R2は新規全取引を行い、loader／kernel／source／registry／strength／base／target集合／traversalが同一のR1 actual F32全出力hashへ照合した。これはsample比較ではない。[R2完全receipt](./diagnostics/R2-LIFECYCLE.json)のCONTROL_PASS_REFERENCE_PENDINGは元実行記録として保持し、[独立結果との照合receipt](./diagnostics/LIFECYCLE-MATCH.json)でPASSを閉じる。算術sourceと制御sourceの試行は各1回で別記録。過去の2層pilotとQ4／Q16／P2／P3／P4証拠は元scopeのまま保存し、今回の全件試験の代用にしていない。

## 所有権・保存・資源

SDK local revision、fresh transaction ID、consumer native epochを分離した。取消・旧plan失効・旧rollbackは後続公開を上書きしない。prepareはlazy所有であり全計算済み表示ではなく、通常consumerが宣言範囲の完成F32・有限性・充足・現在性を検査して初めてCONSUMER_APPLIEDとなる。試験hostの適用状態と実Diffusion適用状態を区別する。

prepared／active／read leaseは別capabilityである。元SDK／source／kernel creatorを解放しても、consumerの有効leaseが必要bytes・計算資源を保持する。baseはcaller所有で、全active/read leaseより長く生存させる。最終的にSDK、source、candidate、read/package lease、pending work、cache、Hike memory／leaseが全て0またはclosed。cleanup失敗はrecoverまで保留する。取消はbounded Hike呼出し後の協調停止である。

保存payloadは全4原本で3,715,317,216B。JSON descriptorだけではなく実payloadとmanifestを保存し、fresh SDKで再検査する。全dense modelではなく、同じ不変base・registry・kernelへ再結合するowned recipeである。[保存manifest](./diagnostics/SAVED-PACKAGES.json)の実JSONをgzipで同梱し、raw source payloadはGitへ置かない。

全個別出力は226,702,705,152B相当だが全量常駐・全量disk化せず計算した。上限はblock1,048,576 F32要素、kernel32MiB、試験cache64MiB、比較queue16frames／32MiB。R1 Node peakはHIGH594,640KiB／LOW524,392KiB、Python peakは各246,370,304B／260,042,752B。R2逐次controller peak534,328KiB。4CPU quota／16GiB環境で実行した実測であり、最低必要RAMやdevice全体peakの保証ではない。詳細は[RESOURCES.md](./RESOURCES.md)。

## 未受入事項と後段接続

- 実Bernini base値との今回の全target比較、学習base同一性、実Diffusion全graph／operator binding、full model session、生成結果への寄与・品質は未受入。logical graphBindingはUNBOUND、trainingBaseVerified／generationReadyはfalse。
- standalone論理packageを旧P4 consumerへそのまま渡した適用は主張しない。実Diffusion側のtarget/provider/consumerが成立した範囲で、正本mappingから別途接続受入する。
- HIGH／LOWは別instance。管理全体snapshot、製品内HIGH→LOW schedule、元81frame workflow全工程との比較は後段。LoRAへ画像mean APIやF/H/W条件を追加しない。
- Conv／派生LoRA／未知variant・shape、量子化base暗黙変換、未知モデル族は今回の対応範囲外。
- Draft PR維持。merge／Pages公開は実行しない。本人ACK・他owner完成待ちは単体完了条件に追加しない。固定sourceの実body取得確認は本担当側で行い、相手本人ACKとは区別する。

[最終独立レビュー](./verification/FINAL-TERMINAL-REVIEW.md)がterminal receipt・全source・mapping結合・hash再利用・資源を確認した。実装コードの変更はR2までに固定し、この結果配布では文書・receiptだけを追加した。
