# dtype・layout宣言と三段階入力の管理引継ぎ

2026-11-01 JST。ユーザー指定の3項目を対象とする。既存6公開caseの数値・native取引証拠は固定scopeで再利用し、その成功を新しい管理入口の受入へ流用しない。

## 取得済みの現在地

- LoRA配布 `40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68`。実6caseの実行sourceは `25e5b56feeb070594110bb292d9de21e4e234f0a`。
- 管理PR #7と全branchを確認したが、公開管理は引き続き `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。新しい管理修正版は未取得。非依存のLoRA側実装を先行し、修正後の正式経路の受入試験は当該sourceを取得してから行う。
- 固定参照は文書 `1.0-draft.1`、catalog `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、新計画 `0fb553fd081d3bcbbad4ead7accd165679f77d34` を維持する。
- 管理のloader規範はbaseDtype/outputDtype/layoutを未比較。snapshotの既存edge評価は準備前のみで、前回の実証はreceiverの明示phase hookである。

## 実装するowner側の範囲

1. 公開 `describeBinding()` のnative/connection registryと実plan operationをkey/weightIdで結び、base/output dtype・layout・元storageの対応を返す版付きデータexportを追加する。欠落をF32/row-majorで補完せず、consumer16出力と準備したweight/biasを区別する。native SDK/adapter/kernelやregistry mappingは変更しない。
2. 実証済み三段階の組立てを公開の版付き入力factoryへ移し、管理が自分の既存 `evaluateEdge` を呼べるraw inputを返す。ownerはREADYや別の互換性判定を返さない。旧receiver入口は互換shimとして残す。
3. 正式管理経路へ渡す契約、取得可能な完全source/path/hash、負例と既存証拠の再利用条件をまとめ、管理PRへ固定版を提示する。提示と管理担当の採用・受領確認を区別する。
4. 現管理版の宣言負例をmetadataだけで観測し、未対応を記録する。管理修正を取得後、欠落・矛盾、旧source/target/token、future/replayed receipt、解放未完了、公開後監査失敗から先に確認する。6caseの原本load/hash・Hike計算は繰り返さない。

## 三段階の保持条件

preflightに将来の数値・取引receiptを作らない。checkpointは実native validationと全選択weight/bias証拠を同じplan/source/registry/targetへ結び、commit直前に選択・資源・tokenを再確認する。公開後は実native ownership・snapshot・queue終端・cleanupを比較する。

公開後の照合に失敗した場合も実際にpublishした事実は残る。finalize済みのrollback履歴があるかのように扱わず、診断受入と再利用をBLOCKEDにする。stage用currentnessと公開後のactive snapshot/current ownerは別に確認する。

## 拡張する検証目的は一つ

**HIGHが成功した後LOWが失敗しても、新しい共同snapshotを公開せず、HIGHの元feedへの復帰と両sideの資源終端を確認する。** 管理側の既存 `low-failure` native fixtureは元scopeで再利用し、追加は正式規範入口との対応の確認に限る。新しいLOW実原本の数値受入や二組同時合成を目的へ追加しない。

過去4原本の取得・全体hash再計算は前提にしない。全targetは対応する実graph/consumer成立後のP6へ残す。全model session・生成・本番公開・mergeは含めない。
