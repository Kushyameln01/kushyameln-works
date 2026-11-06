# 管理P0/P1完了後のLoRA P3共同検証

2026-10-31。ユーザーの「管理P0・P1が完了、作業再開」の指示に基づく。前回のP3事前確認を完了扱いへ変更せず、新たに取得した実装と変更境界を確認する。

## 固定する入力と維持条件

- 新計画 `1.0-draft.1` はPage全87ブロックを再取得。固定Git `0fb553fd081d3bcbbad4ead7accd165679f77d34`、参照catalogは指定の `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` を維持する。
- 管理の取得版は `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。P1は `loadReferenceSet` と有限bindingを既存 `evaluateEdge` へ接続している。旧管理285の不足をこの新しいsource取得で解消する。
- 試す候補はLoRA `fc2789a0f649e33f15eb13750e6a983b5c52d170`、Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。歴史的採用0c/438を上書きしない。現在のLoRA配布f51との製品byte一致は、commitの採用替えとは別に記録する。
- mapping正本は `createDiffusionDiagnosticAdapter`。管理のcandidate facadeとsnapshot ownerを注入し、旧bridgeを重ねない。製品SDK・planner・kernelを変更しない。
- 入力は選択されたローカルFile 1件から始める。初期対象はlight HIGH。過去4原本・二組同時合成を完了条件にしない。
- 実baseは既受領のbounded artifact：709,364 bytes、SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。Q full `[5120,5120]` の先頭16行・全列と明示bias16値だけ。header/rangesとprior-owner receiptを検証し、現在の全base File hash検証へ格上げしない。

## 実行前に判明した差分

管理の既存P3試験は実native queue/snapshotを通すが、`referenceContext` とsnapshot stepの`edges`を渡していない。従って、その成功をP1規範付きLoRA取引の証拠へ流用しない。既存8件の合成native制御と実File＋合成baseの結果は元scopeで再利用する。

事前に存在しない数値・取引receiptを作ってsnapshotを通さない。契約照合は事前、数値照合は実ownerのvalidate checkpoint、取引照合は実snapshot公開とqueue終端後に行い、同じ実context.targetへ外側traceを結ぶ。native receiptを改変せず、公開後もnative `snapshotPublished:false` と管理の診断snapshot公開を区別する。

固定catalogとnative pinのrepository表記差は、明示した外側SourceRef対応で扱う。native sourcePins、commit、hashを変更しない。Exec-QはDiffusion consumerの数値profileであり、LoRA重み比較には実owner-validationの証拠を使う。架空のEXEC-LORAを追加しない。

## 作業と検証

1. 新管理source、固定7 JSON、P0/P1・P3実APIと旧版との差を照合する。独立担当が契約と証拠scopeを監査する。
2. receiverの規範edge組立てとブラウザ試験を追加する。契約不明、既知衝突、数値証拠だけ不足する状態を区別し、改変source・旧kernel・graph・slice・loader等の負例を確認する。
3. 選択したローカル原本を新規loadに必要な検査で読み、検証済みbase断片と既存の独立期待値へ接続する。全81,920 weight・明示bias16値・各16出力を事前gateで比較する。期待値生成や過去4原本の全体hashは繰り返さない。
4. 実管理queue/snapshotで強度0・正負・再適用・base復帰、取消・復旧、失敗時の旧active維持を変更境界で確認する。独立copyとprepared解放、manager/native revision、同一context.targetを記録する。既存のLOW失敗隔離・cleanup故障の制御結果はscope付きで再利用する。
5. 保存した全選択配列・全出力とsource hashを独立に読み戻す。P1規範trace、native receipt、管理診断snapshot公開、未受入を別々に報告する。
6. 必要なコード・API追補・証拠・再現手順を既存作業branchへpushし、Draft PRを更新する。

## 受入しない範囲

全targetは対応する実graph/consumer成立後のP6。全model session、生成への寄与、lease方式、二組同時合成、本番公開・mergeは追加しない。現在の管理normが読まないbase/output dtype・layout等は、native SDKの制約と外側sidecarの拒否実証を混同せず、未実装の比較として報告する。

## 実施結果

実行source `25e5b56feeb070594110bb292d9de21e4e234f0a` でlight HIGHの実base PARTIAL共同試験に合格した。6公開case、取消checkpoint、復旧・queue経由のbase復帰、規範8負例を確認。独立読戻しで49 source・26生成物・全数値を照合した。[P3-RESULT.md](P3-RESULT.md) と [再現手順](P3-REPRODUCE.md) に今回の受入と残るscopeを記録する。
