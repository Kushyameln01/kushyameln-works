版1.0-draft.1／2026年10月31日 JST。管理が参照する照合規範。状態：文書化したdraft。runtimeへの規範読込み・判定器実装は未実施。

# 管理が判断するもの

管理は、あらかじめ版を固定した規範に対し、入力・出力の宣言とownerの検証証拠を照合する。数値式やモデル定数から実行時に規範を導出しない。数値規則を根拠に、各数値ownerが対象profile・参照結果・演算精度・許容差を確定し、その結果を本規範へ登録する。

機械参照用ファイルは `norms.v1.json`。`managerReads` は管理adapter側の照合語彙である。native requestへ一律に新しい必須フィールドを挿入する仕様ではない。取得元に応じてnative descriptor/receiptまたは管理sidecarに対応付け、元のhash・版・所有権を保持する。`comparisons` とreasonLabelsも新しい台帳語彙であり、既存nativeエラー名を上書きしない。

# 照合順と必要な情報

| 規範 | 最低限の参照内容 | 判断・担当境界 |
| --- | --- | --- |
| N-IDENTITY | native版、固定source/build、実bytes hash/長さ、採用組合せ | API版だけの一致を受理しない。pin文字列だけでは読込実体の証拠にならない |
| N-SHAPE | profile、shape全軸、dtype、layout、semantic、byteLength | 同じ要素数でもshape/意味が違えば同じartifactにしない |
| N-NUMERIC | 実行/precision/source版、owner receipt、gateとreference、scope | ownerの事前規定gateによる結果を照合。管理で演算再実装や許容差決定をしない |
| N-NORMALIZATION | raw/normalizedの意味、profile、明示変換trace | 必要な変換はownerに依頼し、その結果を再照合する |
| N-LOADER | ローカル入力、loader ID、variant、shape/dtype、strength、原本hash | 未対応variantを既定倍率・flattenで補わない |
| N-MAPPING | 正本owner、adapter版、実行経路、両registryと選択領域 | LoRA owner adapterに一元化。旧管理bridgeは回帰専用 |
| N-EVIDENCE | coverage/scope、base種別、reference、証拠の来歴とcurrentness | PARTIAL・fixture・再利用証拠を全体/実base/新規実行へ昇格しない |
| N-TRANSACTION | request/revision、resource generation、所有権、終端receipt、復旧状態 | stale結果のpublishや未復旧resourceの再利用を止める |
| N-ARTIFACT | package版、header/payload hash、context/evidence/provenance | producer列の順序とnativeの一意性、context/frame配列の順序と重複、任意metadataを保持。異なるhash名前空間を同一化しない |
| N-LEGACY | 実initializer/FULL、v1 adapter、legacy-boolean | v1へPARTIAL/runtime-inputを渡さない |
| N-GENERATION | native readiness、全session/全対象の証拠、資源予算 | 現在のload/predict/sample=NOT_READYは生成受付不可 |
| N-EXTENSION | 必須feature、任意metadata、対象edge | 未知の必須条件はUNVERIFIED。その依存edgeを保留する |

byteLength照合は宣言されたdtypeの1要素bytes×全軸積として行う。数値ownerが有限値・値域の証明を返す場合はその対象と結果を照合する。管理が内容検査を行う場合も、規範で定めた有限性/範囲の機械照合に限定し、モデル固有の数学や推定を追加しない。意味に依存する未規定の値域やthresholdは数値ownerへ戻す。

# 分類は三つの軸で保持する

接続適合は `COMPATIBLE / NEEDS_ADAPTER / INCOMPATIBLE / UNVERIFIED`、検証結果は `PASS / FAIL / NOT_VERIFIED`、要求した操作の準備状態は `READY / BLOCKED / FAILED` として区別する。これらは本台帳の分類であり、native状態機械を置換しない。

すべての必要宣言が一致しても、証拠不足なら検証PASSとはしない。必要な意味変換を行うowner adapterが具体的に特定され、実行だけが未了ならNEEDS_ADAPTER。変換内容や対応adapterが不明ならUNVERIFIED。既知のshape/variant衝突はINCOMPATIBLE、base/graph等の契約識別・必須宣言が不明ならUNVERIFIED。契約上COMPATIBLEと判断でき、数値受入のgateや実行receiptだけが不足する場合は、その契約判定を維持して検証NOT_VERIFIED・準備BLOCKEDとする。診断のPASSは生成READYを意味しない。

# 判定例

- F=5の `[1,16,2,2,2]` と矩形F=1の `[1,16,1,2,4]` はともに128値だが交換不可。対応profileを明示する。

- `raw-posterior-mean` と `wan21-raw-generated-sample:v1` は意味が違う。generated-sample schema検査の成功だけで実producer/restore/decodeを受入済みにしない。

- 実LoRA File＋synthetic-manager-control-fixture baseの管理試験は、そのscopeのPASSを保持する。実base再試験やE5全sessionのPASSへ読み替えない。

- 管理採用Diffusion 438とowner最新5fは別組合せ。API版が同じでも、最新版を旧版の共同受入へ紛れ込ませない。

- LoRAのmean APIは追加しない。meanは既存VAE/Diffusionの契約で検証する。

- 新しいmodel族やshapeは既存profileへ無理に分類せず、宣言・owner検証・必要adapterを備えた新規recordとして登録する。

# 規範を作る手順

1. 数値ownerが数値規則の出典と適用条件、shape、dtype、演算順、参照実装、比較指標を提示する。

2. profileごとに、独立referenceと実行前に定めたgateを用いて検証し、誤差値・比較母数・base種別・対象領域・source版を記録する。未確認のgateは数値を推測せず未確定とする。

3. ownerと接続先が意味・変換・証拠scopeを確認し、規範版と台帳版を更新する。LoRA mappingの変更はLoRA正本adapterで行う。

4. 管理は公開済みの規範版と採用組合せを固定して照合する。未登録の必須契約条件は互換性UNVERIFIEDとし、数値gate/受入証拠だけの不足なら契約判定を維持して検証NOT_VERIFIED・準備BLOCKEDとする。いずれも依存edgeのみを保留する。

全モジュールで同じnative APIやモデル定数を共有することは要求しない。共通化するのは宣言・根拠・照合方法であり、各moduleの単独実行と数値責任は維持する。

# 変更・検証の境界

数値規則を変更しても既存規範へ自動反映しない。規範の改版、適合評価、採用組合せの更新を分ける。本版では文書とJSONの参照整合を確認する。製品管理がJSONを読み込む実装、推論の再実行、E5/E8以降の新規受入は含まない。

# 文書の参照先

[総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)／[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)／[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)

# 固定版ファイル

[説明文の固定版](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/development/ai-connection/reference-catalog/MANAGER-NORMS.md)／[機械参照JSON](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/docs/shared/ai-connection/reference/norms.v1.json)／[検証結果と制約](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/development/ai-connection/reference-catalog/EVALUATION.md)／[Draft PR #10](https://github.com/Kushyameln01/kushyameln-works/pull/10)

固定commit：`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`。文書・参照データの保存とruntimeの採用・数値受入は別に確認する。
