# 通常owner能力照会と診断分離

2026-11-02 JST。ユーザーの今回の4項目と完了条件を実装根拠とする。基点は5b0da96b71708d56d3226a4bd4cb353aa30fbe3b。fetch時の同担当branchも同SHA。mainは029ce9336a61e53bc6172fa4a7b7189b15f2efa0で、当担当の後続受入・codec・Text資源変更を含まないため、自動mergeしない。管理照合sourceは59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f。

## 方針と境界

既存capabilities(request?)を拡張し、operation/input descriptorを受けて対応可否・理由・必要変更を返す。別owner registryやProfile名のallowlistは作らない。構成済みmanifestの完全shapeとgraph bindingを返し、未実行の宣言と実行で確かめたshape/hashを区別する。graph改変を実行可能と認定しないよう、既存ORT sessionのmetadataと実出力検査を使う。新たなONNX parserや数値演算は追加しない。

通常出力のText識別・maskに、実Hike最終RMSNormのmarkerを追加してcodecで保持する。旧markerなしファイルは有効。raw mean・normalized mean・generated sampleの既存意味と復元ownerは変えない。decode入力の来歴は通常resultのinputDescriptorへ保持し、RGBのみの保存に来歴保持を仮託しない。管理packageの保存責任は管理側に残す。

詳細evidenceはconfigure({diagnostics:true})で要求する診断経路へ分ける。通常configure/runに独立参照・比較gate・nativePass receiptを要求しない。既存診断UI/harnessは明示opt-inへ移行し、公開APIのoperation/数値経路/取消/独立moduleは保つ。

## 手順

- [ ] VAE manifest/descriptor検証を一箇所へ抽出し、対応照会と実dispatchで共有する。完全shape、操作別asset、export/runtime制約、非対応理由を返す。
- [ ] Text最終norm markerとowned descriptorをcodecに追加し、旧codec互換・normalized marker・producer/decoder/context保持を検証する。
- [ ] 通常Worker結果、診断opt-in、MessagePort照会、graph実shape照合とreconfigure後の検証状態クリアを接続する。
- [ ] 新規境界テストのRED→GREENと既存接続テストを確認する。
- [ ] 既存Rect graph/referenceで通常encode/decode・shape拒否・取消復帰・解放を確認する。Textは既存独立Hello world参照を再利用し、新規通常encode一件を全値比較する。再export・参照再生成・全生成は行わない。
- [ ] API、管理へのfield対応、制限、通常結果と詳細診断、再現手順を分けて記録し、独立レビュー後に作業branchへpush/Draft PRを作成する。merge/Pages公開は対象外。

## 検証で注意する入力

同じ要素数で異なるshape、数式上成立する81frameで未構成のgraph、正規化markerの矛盾、generated producerとdecoderの衝突、reconfigure中のstale結果、disposed module、欠落asset、plain L512とID任意L、mask内部0、詳細receiptなしmanifestを対象にする。

## 進捗

基点の外部API・VAE API・normalized marker検査はPASS。実装前のText/codec新規テストREDを別担当が確認。今回の依頼は具体的な実装とpushまでを明示しているため、設計の追加承認を挟まず実行する。
