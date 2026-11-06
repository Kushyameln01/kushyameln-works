# 管理単体 M1・M2・M3 受入結果

**M1〜M3を管理自身の制御機能として受け入れた。** 本物NNの成功・他担当の完成・取得ACKを待つ条件にはしていない。実装sourceは `efab53ce16ab411598e8c7b74ff8356b55407540`。branchは `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。この結果・未加工証拠を含む配布commitの完全SHAはPRと配布報告に記録する。merge・Pages公開はこの作業では実施していない。

今回取得した正本は[新計画](https://chatgpt.com/space/page_1e950f67b0688191bd3f2a1d5b252224)本文の1.0 draft 1、更新2026-11-02T04:01:34.856047Z。旧読了報告で代用せず、本文hashを[HANDOFF.json](HANDOFF.json)とPLAN.mdに保持した。共通契約は `works-module-contract/1.0-draft.1`。新しいpipeline・host・workspace API、参照owner、静的browserは追加実装として区別している。

## 完成した機能と入力域

| 対象 | 完成した管理機能 | 確認した入力域・制限 |
| --- | --- | --- |
| M1 | 有限pipelineの参照解決・topological順、循環・未解決・多重writer拒否、共通workflow shape→port要求→owner能力照会 | scalar/named入力、独立branch、source/reference/slot/frame順。式に合ってもowner非対応なら具体的理由で停止。shape計算は既存正本だけ |
| M2 | 既存normal adapter/evaluateEdge/queue/snapshotによる実行・進捗・対象取消・旧結果不採用・失敗retry・解放失敗quarantine/recover | 準拠する注入owner。正常・遅延・失敗・取消・解放失敗・能力変更、同owner直列化、別branchの遅延中の独立下流を確認 |
| M3 | 単独browserの実File/JSON設定、部分・最終結果保存、native/bundle実読戻し・復旧・終了 | WKT tensorと追加owner-asset File。保存tensorはdurable入力、追加Fileの権限は失効して必要時再選択。RGB媒体loaderや本物model loaderの完成を意味しない |

実browserでは目標latent **F32 `[1,16,21,60,104]`、NCTHW、8,386,560B**を実Fileとして選択し、参照ownerのコピーを通常入口で実行した。小診断shapeへ縮小していない。元81frameとのframe/context対応を保存し、全payload hashと手で規定した値を比較した。参照ownerはCONTROL_REFERENCE_ONLY、modelWeightsLoaded:falseであり、数値演算・LoRA mapping・NN計算を管理へ複製していない。RGB `[1,81,480,832,3]` はshape能力照会のみで、388,177,920Bの実RGB実行とは報告しない。

## API差分・保存

[固定API説明](https://github.com/Kushyameln01/kushyameln-works/blob/efab53ce16ab411598e8c7b74ff8356b55407540/development/ai-connection/standalone-management/API.md)に新規APIと全入出力を示す。既存normal.executeに外側のonProgressを追加し、同ownerで次のqueue選択が始まったときの先行受入済みcopyを誤って破棄する境界を修正した。native引数/contextは変更していない。共通workflow bindingのmetadata照合を共用helperへ抽出し、package readerは完全なhydrated descriptor/snapshotを追加返却する。

通常入口に独立参照・gate・事前PASS・数値receipt・全中間保存を必須化していない。保存は明示操作で行い、数値証拠がない場合は理由を記録しPASSを捏造しない。実native全体hash、descriptor、trace、evidence、snapshot、任意binary拡張を既存E4 verifierで照合する。矛盾したdescriptorの暗黙修復、別request snapshot貼付、必須metadata/snapshot欠落、改変、未知必須schemaを拒否した。manifest/receiptを正しく再hashしても対象request/revision/tokenの貼付は拒否する。

裸WKTはcodec実encode→decodeで元payload/metadataを比較し、保持できないfieldがあればNATIVE_SAVE_METADATA_LOSSで拒否してbundle保存へ案内する。未知optional native metadataはbundle sidecarと読戻しで保持する。workspace用498 codecはbyte同一の独立format依存であり、既存2bd codec/P2/native source pinを一括変更していない。

## 再利用証拠と新規検証

既存workflow-shapes、descriptor/evaluateEdge、normal queue/snapshot、E4 package/attachmentsを再利用した。旧P2・LoRA bridge・診断は元scopeのまま回帰した。過去のNN証拠を今回の参照owner成功へ付け替えていない。

- [全回帰](verification/FULL-SUITE.log): **689/689 PASS、FAIL/SKIP 0**。既存634件と新規55件。実装commit直前の同一coreで実行し、固定commit後も新規[55/55](verification/FIXED-STANDALONE-SUITE.log)を実行した。
- [固定source browser結果](verification/BROWSER-RESULT.json): **14/14 PASS**。実File/設定/進捗、LoRAなしbypass/あり制御、能力変更、遅延部分保存、失敗retry、取消旧結果拒否、解放失敗復旧、reload/追加File再選択、未知metadata保存、終了を確認。[画面](verification/browser.png)。
- browserが実取得した28ファイルとrunnerのbytes/hashは、固定source `efab53ce16ab411598e8c7b74ff8356b55407540` のGit objectへ一致。sourceErrors/browserErrors 0。
- [GitHub再取得](verification/REMOTE-ACQUISITION.json): 固定sourceのhost/workspace/UI/runner/APIの5ファイルを接続GitHubから取得し、長さ・SHA-256・実bytes一致。送信側のこの確認を他担当本人ACKとは呼ばず、単体完成の条件にもしていない。
- [独立保存レビュー](verification/WORKSPACE-REVIEW.json): 矛盾宣言・対象差替・unknown required schema等の負例とbinary/trace/evidence保持を6/6確認。

## 必要資源・未受入事項

Node.js 24、Chromium 154.0.8037.57、Playwright、静的File APIを使用した。新管理browserの実測は **29.51秒、Worker生成0/終了0**（参照ownerはmain realm）。実payload8,386,560B、最終native8,388,528B、最終bundle33,643,091B、部分bundle25,222,881B。これらはtensor/保存byte量であり、総RAM必要量ではない。実OS RSS・ORT memory・総peakは未測定null。ownerの論理input allowanceとarchive展開上限もRAM実測へ転用しない。

管理単体の未完事項はない。本物owner同士の接続・実NN数値受入、任意shape/全モデル対応、全81frame workflow、本番生成、全体資源予算は後段の別受入である。`generationReady:false` と製品 `load/predict/sample=NOT_READY` を維持する。コードと制御試験を、生成READYの根拠にしない。

[再現手順](REPRODUCE.md)／[実browser手順](REPRODUCE-BROWSER.md)／[変更23ファイル・source/証拠hash一覧](HANDOFF.json)を参照する。検証用FileとZIPはrunnerで再現でき、元モデルや非公開資材の再取得・再exportは不要。
