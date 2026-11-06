# 新版LoRAの管理接続 受入結果

**管理→実新版LoRA SDK/Hike→準拠provider/consumerの通常接続を完了した。** File選択・登録、合成、適用、強度変更、片組解除、再適用、base復帰、stream保存・新SDK読戻し、取消・回復・lease終端まで確認した。実Diffusion全モデルへのbinding・実適用・生成結果の共同受入とは分ける。

## 固定版と取得確認

| 区分 | 完全SHA／版 |
| --- | --- |
| 管理基点 | `92942230fbefe6ff727ba0b6f78f59591c46756e` |
| 今回の管理実行source | **`9a5a3574e25b4c352d7483ff1811d14c256dab10`** |
| 採用LoRA配布 | **`6d0c8df4cd4992f26745d2d26394f5e194d2567f`** |
| owner算術証拠R1 source | `4a3419c768e2b4b38b081314abe2cfaaeed6b14b` |
| owner制御証拠R2 source | `986b66b3dd54ef26d98f99a1db92a2933f3e31aa` |
| 新契約／payload | `lora-standalone/1.0-draft.1`／`lora-owned-package/0.1-draft.1` |
| 旧契約（変更なし） | `lora-connection/2.0-draft.1` |

branchは`codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。この結果・証拠を含む配布commitの完全SHAはPRと配布報告に記録する。merge・Pages公開は今回実施していない。

指定[owner API](https://github.com/Kushyameln01/kushyameln-works/blob/6d0c8df4cd4992f26745d2d26394f5e194d2567f/docs/shared/inference/lora/STANDALONE.md)と[owner結果](https://github.com/Kushyameln01/kushyameln-works/blob/6d0c8df4cd4992f26745d2d26394f5e194d2567f/development/lora/standalone/RESULT.md)の本文を今回取得した。owner FILES.jsonの83項目・6,444,720Bを実Git bytes/長さ/SHA-256へ照合し、採用runtime/reference-host closureの14ファイルがR2とbyte同一であることを確認した。[取得照合](verification/OWNER-EVIDENCE-VERIFIED.json)／[path・bytes・SHA-256台帳](HANDOFF.json)を参照。

bootstrapは別配置の固定source・WASMを内部検査する。旧adapterのpin差替えではなく、新規native adapterとして採用した。旧bridgeと新SDKを同じ取引で二重実行しない。[固定API差分](https://github.com/Kushyameln01/kushyameln-works/blob/9a5a3574e25b4c352d7483ff1811d14c256dab10/development/ai-connection/lora-standalone/API.md)に全引数・戻り値を示す。

## 接続した操作・入力域

- local Fileのregister、compose→prepare→stage、apply、強度変更、light/detailの片組・二組・なし、restoreBase。
- SDK saveの実source streamとnative manifest、openPackageのfresh SDK authority、cancel／recover／release／dispose。
- HIGH/LOW別SDKと、sideごとの明示registry/base/consumer/kernel/cache。一side・片組なら選択したFileだけでよく、常に4Fileを要求しない。
- 一括片側失敗はBATCH_FAILED。SDK recover→新取引restoreBaseを要求sideへ行い、別receiptのBASE_RECOVEREDで確認する。元失敗を成功へ変えず、旧candidateでatomic rollbackしたとも記録しない。

既存queue・evaluateEdge・normal snapshotを再利用した。File/plan/prepared/leaseをtensorや画像meanへ偽装せず、native handleは内部保持し、外側にはopaque ID、plan/manifest、操作receiptを返す。snapshotの所有対象は管理control receiptであり、全weightの独立copyや実model適用ではない。SDK実receiptと管理生成ackは別fieldにした。

key正規化、mapping、rank/alpha、decode、light→detail順、不変baseからの再構築、完成F32/range/finite/所有権検査はSDKとconsumerの正本へ委任した。独立参照・gate・事前PASS・学習base証明を通常入力へ要求していない。

## 使用File・base・consumer

[開発fixture](verification/REFERENCE-FIXTURES.json)はF32 rank1のfull factor `[1,5120]`／`[5120,1]`を持つ約41KBの有効な`.safetensors`であり、実4原本ではない。LoRA ownerのcanonical registryからq.weight、**full `[5120,5120]`**を採り、元座標row1の1行・全5120列を明示選択した **PARTIAL** 接続である。full shapeを小行列へ変更していない。

baseはownerの非zero dyadic独立provider、consumerはbyte同一のowner standalone reference host。consumer自身が選択範囲の完成F32を検査する。HIGH/LOWの宣言modelHashは仮の`a`/`b`各64桁であり、実モデルhash・学習base適合を主張しない。fault controlsは外側だけで、SDK/Hike・consumer本体をmockへ置き換えていない。

programmatic adapterはowner規約のregistry/provider/consumerと対応targetを受ける。browserの開発hostは上記1行範囲であり、実4原本・全モデルをそのまま入力して適用できたという報告ではない。未登録pairや不一致registryを一律に通していない。

## 再利用証拠と新規検証

| 区分 | 結果とscope |
| --- | --- |
| owner数値証拠の再利用 | R1の全2,904 patch・18ケース・255,748,547,328要素の独立比較と、R2の全stream hash照合を元scopeで再利用。算術・mapping・kernelは同一。R1→R2差はowned-packageの取消/終端修正で、管理で全件再計算していない |
| **今回の新規Node** | **31/31 PASS、FAIL/SKIP 0**。bootstrap、adapter、coordinator、stream I/O、leaseの接続・状態・所有権 |
| **新SDK固定browser** | **14/14 PASS**。実File→SDK/Hike、二組→片組、強度/再適用/base、別side、取消/旧target、失敗回復、一括片側失敗、OPFS実保存・fresh page新SDK open/stage、lease保持/解放 |
| 既存管理Node回帰 | **689/689 PASS**。新規31と合わせ全720/720 PASS。新SDK接続の件数へ数え直していない |
| 既存管理browser回帰 | **14/14 PASS**。従来のtensor管理M1〜M3であり、新LoRA適用の証拠とは分離 |

[固定Node](verification/FIXED-CONNECTION-SUITE.log)／[全回帰](verification/FULL-REGRESSION.log)／[新SDK browser未加工結果](verification/NEW-SDK-BROWSER.json)／[従来browser回帰](verification/EXISTING-BROWSER-REGRESSION.json)／[画面](verification/new-sdk-browser.png)。両browserは同じ固定source `9a5a3574e25b4c352d7483ff1811d14c256dab10` を使用した。新経路の取得sourceとrunner/fixture計36ファイルのbytes/hashが固定Git objectへ一致し、source/browser errorは0。[GitHub再取得](verification/REMOTE-ACQUISITION.json)でもAPI・adapter・coordinator・storage・UI・runner・実WASMの7ファイルが一致した。受信clientの取得確認であり、他担当本人ACKではない。

独立レビューで発見した3境界も負例で修正した。dispatch前取消の未解決barrier、consumer commit後のcleanup ACK消失、action完了とqueue受入の混同を防ぐ。commit試行の結果が未確定ならpublicationDiverged/BLOCKEDを維持し、SDK recoverだけでは解除せず、fresh適用/base復帰成功後に解除する。[独立レビュー](verification/INDEPENDENT-REVIEW.md)は元の再現・実base読戻し・最終解放を確認した。native SDK sourceは変更していない。

## 保存・所有権・資源

SDK source streamをchunkごとにFileSystemWritableへ書き、一括Blobを作らず全payload完了後にmanifestを保存した。browserのHIGH二組payloadは **41,199B＋41,195B＝82,394B**。管理JSONは別sidecarであり、実payloadやnative manifestの代わりではない。Nodeでは実filesystem、browserではOPFSへ保存して実Fileを読戻した。

新SDK open時は元の登録数0、新instanceのlocal revision1、consumer epoch0。保存planId/packageHashはdurable identityとして保持し、sdkInstanceId/transaction/resource generationは新規で再適用した。古いhandle・適用権限は復元しない。強度変更で新composeする場合は、読戻した実payload Fileを新SDKへ登録する。

prepared creatorのrelease/SDK dispose後もconsumerのactive/read leaseから完成値を読め、最後のleaseまでbase/kernelを保持した。Node明示終端でSDK/source/candidate/read/package/kernel lease、pending work、cacheを終了した。browserはLOWをreload前に明示解放し、fresh HIGHの全終了でもcandidate/read/inFlight/pending/kernel lease/cacheが0、kernel memoryBytesが0。未観測の旧page unload counterを0と推定していない。

実WASMは **7,036B**、SHA-256 `5117e21d789d01b5dd49d7e8cf9bc8d2f78a51f7d3810aab56e4a40588a0c361`。1instanceのHike memory **32MiB**、開発cache capはsideごと **1MiB**。選択出力block20,480B、観測kernel workspace high-water61,440B。新SDK browser実測 **6.67秒、Worker0**（same realm）。OS RSS・総peak RAMは未測定nullであり、kernel/cacheやpayload量を全体RAM合格へ転用しない。

## 実Diffusion接続の残件と具体的障害

今回の管理→実SDK→準拠開発provider/consumerの接続範囲に未完事項はない。後段には以下が残る。

1. logical targetと実Diffusion graph/operator/runtime slotの明示binding。
2. 真正なモデルbase値と、その寿命・identityを扱う実base provider。
3. standalone契約を受け、完成範囲と所有権を満たす実model consumer。旧P4 consumerを新版へ読み替えない。
4. 実model/session適用、生成結果、本番HIGH→LOW・全工程資源の共同受入。

既存通常P4の非空targetRefsは **`NORMAL_P4_LORA_ROUTE_NOT_AVAILABLE`** のまま。この拒否を一律解除せず、base P4にもLoRA条件を強制していない。`graphBinding:UNBOUND`、`trainingBaseVerified:false`、`generationReady:false`、製品load/predict/sample=NOT_READYを維持する。対応consumer待ちを今回の管理接続の完了条件にはしない。

[API](API.md)／[再現手順](REPRODUCE.md)／[browser再現](REPRODUCE-BROWSER.md)／[完全hash台帳](HANDOFF.json)。検証用Fileはrunnerで生成でき、全4原本の管理環境複製・再exportは不要。
