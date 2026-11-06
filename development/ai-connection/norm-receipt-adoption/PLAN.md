# 規範付き入口と新receipt受領

基点: `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。固定catalogは引き続き
`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` / `1.0-draft.1`、計画は
`0fb553fd081d3bcbbad4ead7accd165679f77d34`。

今回の変更はユーザーの4項目に限る。LoRA新receiptの
`manager-p0-p1-audit.json`、`LOADER-FIELDS` が特定した未比較宣言は
`baseDtype:F32`、`outputDtype:F32`、`layout:row-major`。
固定loader recordの値を既存evaluateEdgeの比較へ渡す。欠落はUNVERIFIED、
既知衝突はINCOMPATIBLE。モデル数値処理やnative mappingは変更しない。

規範付き専用入口はverified ReferenceSet・固定policy・必要宣言を必須とし、
省略時にはnative dispatchを行わない。既存standalone APIの契約は維持する。
単に任意フラグを加え、呼出側が省略できる入口を規範受入とは呼ばない。

| 段階 | 実行境界 | 照合するもの | まだ使えないもの |
| --- | --- | --- | --- |
| declaration | native plan/dispatchより前 | 宣言、source/kernel、事前gate/reference、現在のresource | 実検証・公開後のreceipt |
| validated | 実owner validate/decode後、commit gateより前 | 実戻り値と事前宣言に結び付いた数値receipt | 公開後transaction receipt |
| published | 全commit・公開と必要cleanupの後 | 現実のqueue/snapshot/package receipt | 別request/revision、未完cleanupの見込値 |

判定は既存`evaluateEdge`に集約する。未到来scopeはpendingと明示し、入力に
将来らしいJSONがあっても先取りしてPASSにしない。数値gateだけ不足すれば
契約互換性を保持し、数値検証NOT_VERIFIED／当該段階BLOCKEDとする。
公開後の照合失敗では公開の事実を保持し、既存recovery経路で再利用を止める。

LoRA evidence40f7f0cとVAE evidencee86d17f8の取得元・実bytes・scopeを採用記録へ
取り込む。証拠配布commit・試験runner commit・実行module commitを別欄にする。
native fc2789a/5f880fd/855f435と既存codec pinは、receipt更新だけを理由に変更しない。
過去の合成制御、実PARTIAL20件、既存encode証拠は元scopeのまま再利用する。

Rectは既存encode出力を入力に、変更境界の新管理decode dispatch・対象取消・
終端解放・E4保存読戻しを検証する。decodeに必要な3assetのみ要求し、encoderの
再取得／再export／再推論を開始条件にしない。未取得bytesに依存する実NN境界は
他の検証と分け、fixtureを実NN証拠へ昇格させない。

負例を先に実行してから最小修正し、関係回帰と元272件を再確認する。
成果物・API・再現手順・scope付き結果を同作業branchへpushしてDraft PR#7を更新する。
本番生成の受付、main merge、Pages deployは今回の受入範囲に追加しない。
