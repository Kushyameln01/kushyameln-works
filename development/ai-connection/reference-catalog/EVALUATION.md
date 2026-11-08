# 文書と参照台帳の検証

版1.0-draft.1／2026年10月31日 JST。対象は新しい文書とJSONの整合であり、製品推論・管理runtimeの動作試験ではない。

## 実行した確認

`python development/ai-connection/reference-catalog/validate_catalog.py` を参照台帳一式の存在する配置で実行する。開発作業領域では同名JSONとMarkdownを同じディレクトリへ置いて実行した。

結果：PASS。4カテゴリ18 profile records、10数値規則、12照合規範。record/rule/norm IDの一意性、完全commit形式、必要項目、規範とProfile/数値規則の参照、正規化から数値規則への参照、shape積・bytes、catalog内の6データファイルと7文書のSHA-256を確認した。

F5とRectは同じ128値でも異なるshapeであること、F1/Rectの2e-6 gateをF5へ流用していないこと、旧bridgeを現行adapterに重ねない宣言、最新owner版を管理採用扱いしない宣言、generationReadyと全session受入がfalseであることも確認した。

## 解釈上の点検

| 対象 | 本版の扱い |
| --- | --- |
| 管理が参照する規範 | 事前定義した宣言・identity・profile・scope条件を比較する |
| 数値規則 | 数値ownerによる式・演算順・参照/gateの根拠。管理へモデル演算を複製しない |
| 正規化ID / shape profile / ABI | 別識別として保持。未定義native IDは作らない |
| mapping正本 | LoRA owner adapterに一元化。管理はrequest/resource bindingを担当 |
| 旧管理bridge | 固定sourceの回帰専用。現行経路へ積み重ねない |
| ローカルsafetensors | 製品入力。過去4原本の取得を必須条件にしない |
| PARTIAL / fixture / 既存証拠再利用 | それぞれのscopeを保持。全体や実base新規実行へ昇格しない |
| 未取得gate / 不明な必須条件 | 値を推定しない。契約不明はUNVERIFIED、数値証拠のみ不足は契約判定を保持しNOT_VERIFIED/BLOCKED |

## 配布と今後の受入

GitHub作業branchの固定commitに文書とJSONを保存し、Draft PRで差分を提示する。Pageは同版の説明・入口として保存する。7 Pageは保存後の本文を読戻して確認する。閲覧レンダリングのpreviewツールは利用できないため、画面幅ごとの表示検証は未実施。

既存の209件、実PARTIAL20ケース等は固定sourceの記録を参照した。今回のcatalog作成で数値試験を再実行していない。管理がこのJSONを読んで判定する実装、実generated sample、全native session、81frameと本番資源予算の新規受入も行っていない。
