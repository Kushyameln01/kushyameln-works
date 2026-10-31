# 規範必須入口・LoRA/VAE新receiptの受領結果

管理基点は `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。実装checkpointと実検証bytesの対応は `RESULT.json` / `CHECKPOINT-SOURCE-RECEIPT.json` に固定する。最終配布commitはDraft PR#7のheadを参照する。

今回の受入は、3宣言の比較、段階別の規範必須入口、新owner receiptの版付き受領、および新管理Rectの実dispatch用経路・制御境界まで。**新管理からの実VAE decode・その実出力の取消復帰／保存は未受入**である。

## 正本と取得版

| 対象 | 今回確認した本文／固定commit | 用途 |
| --- | --- | --- |
| 新実行計画 | Page `page_78c30bebe16481918944e621b8c2a02a`、`1.0-draft.1`、`0fb553fd081d3bcbbad4ead7accd165679f77d34` | P0–P3と変更境界 |
| Profile総合管理台帳 | Page `page_7036da19567881918356235b7aa82b83`、`1.0-draft.1`、`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` | 担当Profileと固定catalog |
| 管理照合規範／数値規則 | Page `page_7972cb392a3481918a1ceb0b7501bb76` / `page_7c42180e8e888191ac93c1d344169a3a`、同版／同固定commit | 必須宣言・数値receipt・段階の対応 |
| LoRA新receipt | PR#2、`40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68` | 実light/HIGH・選択Q16の6公開取引、管理監査 |
| VAE新receipt | PR#11、`e86d17f8fe3310875d3578ce838e1fc2c32271dc` | 管理eddaでの2境界・9負例、既存実NN証拠の再受領 |

固定catalogの実bytesは8,343、SHA-256は `14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c`。元7 JSONと `runtimeIntegrated:false` を保持する。取得metadata全114件（commit/pathの重複を除き103件）、VAE manifest31件のGit blob・bytes・SHA、LoRA runtime49 blobを照合した。詳細は `SOURCE-RECEIPT.json` / `OWNER-RECEIPTS.json`。旧文書の読了や旧実行を今回の実行証拠へ付け替えていない。

## 実装差分と判断例

共通schemaは `works-module-contract/1.0-draft.1`、packageは `works-artifact-package/1.0-draft.1` を維持する。新しい段階制御はschemaを置き換えず、既存 `evaluateEdge` の入力を組み立てる。

| 入力／段階 | 互換性 | 検証・実行準備 |
| --- | --- | --- |
| loaderの `baseDtype:F32` / `outputDtype:F32` / `layout:row-major` が固定規範と一致 | COMPATIBLE | 他の明示条件を引き続き検査 |
| 上記のいずれかを省略 | UNVERIFIED | BLOCKED、該当field pathとN-LOADERを返す |
| F16／BF16／column-major等の既知衝突 | INCOMPATIBLE | BLOCKED、同じfieldの根拠版・期待値・観測値を返す |
| validated段階で契約は一致するが必要な数値receiptがない | COMPATIBLE | NOT_VERIFIED / BLOCKED |
| declarationへ数値・取引の未来JSONを渡す | 互換性は契約から判断 | evaluatorは未来scopeをpending扱い。規範必須入口は未来receipt入力自体を拒否 |
| publishedに旧request／revision／resource generationの取引receiptを渡す | COMPATIBLE | 取引NOT_VERIFIED / BLOCKED |

比較の追加箇所は `norm-bindings.mjs` の固定loader bindingのみ。F32やrow-majorを汎用tensorの固定条件にはしていない。3項目の特定根拠はLoRA `manager-p0-p1-audit.json` の `LOADER-FIELDS`。

`norm-execution.mjs` は verified ReferenceSet・固定policy・必要norm・不変の事前宣言を必須とする。数値処理を追加せず、declaration → 実validate後のvalidated → 実公開後のpublishedの順で同じevaluateEdgeへ渡す。失敗した検証cohortは後のPASSで救済できず、数値scopeに予約済み `norm:` 名を使って取引段階へ先送りする入力も拒否する。

`adapters/norm-required-lora.mjs` は元adapterのplan／prepare／実validate checkpointを再利用する。元snapshotの全commit・finalizer・前世代retire後に、coordinatorの実公開capabilityから自動照合する。任意のJSONは公開capabilityにならない。公開後の失敗は公開の事実を保持してRECOVERY_REQUIREDとし、再commit／rollbackをせず同じreceiptを再照合する。破棄時の資源解放は照合合格と区別する。

`adapters/norm-required-rect.mjs` とCLI/browser harnessは、新規native APIを作らず既存 `configure → decode` を呼ぶ。raw mean・既存encode/restoreのhash・model/profile/context・decoder・現在のtargetを対応付ける。管理revisionとnative local revisionは別値。queueの対象取消、実Worker close、元Promise終端、owner解放をbarrierとし、保存中の取消・破棄でも古い出力を採用しない。E4の実write/read後に取引／package receiptを照合する。ブラウザで選択した入力も固定351原本の全bytes/hashを再検査する。

## receiptと実行moduleの区別

| receipt配布commit | 元の実行／受領コード | 実行module pinと受領範囲 |
| --- | --- | --- |
| LoRA `40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68` | receiver `25e5b56feeb070594110bb292d9de21e4e234f0a`、管理 `edda43f9ea69c5b3ab1af3c6eb82295f2912887c` | LoRA `fc2789a0f649e33f15eb13750e6a983b5c52d170`、Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。実light/HIGH1原本・真正なbounded base・6公開PARTIAL取引の元scope |
| VAE `e86d17f8fe3310875d3578ce838e1fc2c32271dc` | 元NN証拠 `35151d1f447d6bba30931a8c28636b2d5d9c3820`。e86自身は管理eddaでの再評価、NN/Hike/export0 | 元NNは管理285・VAE `855f435120f08eb9e818e51281fc26f0e2633829`・Diffusion5f・codec `2c171a09ccda65c54899f322ae490f1bfcaac6fb`。tensor bytesのhashは4c6992a7… |

候補台帳のnative module配列は基点と完全一致する。receiptのcommitをSDK/kernel/VAE/codecのpinへ機械的に代入していない。LoRAの元6取引でweight491,520値・bias96値・output96値が照合済みであることはowner証拠の受領として保持し、ここで原本配列を再計算したとは報告しない。base全fileの再hashはfalse。旧PARTIAL20ケース・旧bridgeは元pin／scopeの回帰用である。

## 検証結果と未受入

最終件数・hash・checkpoint対応は `RESULT.json`。新しいLoRA規範必須入口では、実SDK/Hike/ORT・consumer、実validate・commit・queue終端・公開後照合を通した。23 runtime objectをGit/SHA照合し、選択weight81,920＋bias16値、output16値を検査した。これは合成BF16 source/baseの診断試験であり、実原本／真正baseの新管理受入ではない。

Rect制御15件とCLI原本境界は、明示fixture／実原本検査のscopeで記録する。実VAE855 Workerの初期化・実close観測はモデル0回で合格。新管理のNN decodeは必要な3asset、合計286,314,451 bytesがこの環境にないためBLOCKED/native0/browser0である。必要asset・hash・固定コードからの共同再現手順は `RECT-OWNER-HANDOFF.md`。既存encodeを再実行せず、新decode・取消復帰・解放・その出力のE4実読戻しだけを追加受入する。

未受入は新管理／実LoRA原本＋真正baseの規範付き取引、新管理／実VAE decode・取消復帰・その実RGB保存、正規化markerの中間wire保存、実generated-sample／81frame／全session、現在deviceの明示推論RAM予算。PARTIAL・STAGED・診断snapshot公開・package完備から生成受付を解除しない。no-LoRA/base経路にLoRA固有policyを適用しない。

VAE担当には固定新管理checkoutから `decode` と `cancel-recover` のreceipt、元encode証拠との対応、実Worker close・owner解放・RGB全値比較・E4読戻しを確認する。LoRA担当には新しい必須入口を用いた実原本／真正baseの同scope受入を確認する。Diffusionの実行kernel/sourceは5fのまま照合し、別の最新版候補へ自動変更しない。

実装とAPIは `docs/shared/ai-connection/`、実行・試験は `tools/ai-connection/`、採用と証拠は本directory。再現は `REPRODUCE.md`。mainへのmerge／Pages公開は行っていない。
