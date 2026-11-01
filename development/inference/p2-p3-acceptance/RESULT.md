# VAE/Text 担当分 P2・plain・conditioning・P6準備

2026-11-01 JST。管理提供の規範必須入口をVAE owner環境の既存bundleで実行し、plain専用独立比較と実conditioningを追加した。P3 LoRA全取引やDiffusion cross-attention本番を完成扱いにしない。配布commitはこの文書の固定Git URL／PR headで示し、以下の実行sourceへ付け替えない。

## 実行sourceとAPI差分

| 対象 | 固定実行source |
| --- | --- |
| P2/Plain検証helper・実行checkout | 5537b8932343aa2476b95191817e8913f99dab02 |
| 管理の新規範必須Rect入口 | 60d16b64d6020d3d20239f087f8add91268dcaad |
| 実VAE Worker closure | 855f435120f08eb9e818e51281fc26f0e2633829 |
| 採用永続codec | 2bdca59ea78580d4fe7a9d31a8de33209b64d029、module SHA d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5 |
| 実mean normalize/restore owner | 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3、実Hike WASM bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d |
| Plain独立PyTorch source | ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4、T5Block/最終norm、Wan masked-zero方針 |

`works-ai-1`、Text/VAE独立API、native tensor/latent契約に変更はない。新規CLIは検証と受取bytes照合用であり、管理へ数値計算を実装していない。source/hashの詳細は[P2-SOURCES.json](P2-SOURCES.json)、[plain source記録](plain/source-bindings.json)、各run内の実served-source記録にある。管理CLIの`managementSource.commit:null`はそのまま保持し、実sourceReceiptsを固定60d16のGit bytesと別に照合した。

独立reviewで検証helperのlate保存/close/source-stat失敗後にPASSが残り得る経路を発見し、両helperのexceptで失敗へ戻すguardを修正した。[制御試験](plain/failure-controls/RESULT.md)は旧5537で3件RED→修正後GREEN。元の正常終了・数値証拠は影響を受けず、NN再実行もしていない。修正後の配布sourceを元5537の実行sourceへ付け替えない。

## P2の新規検証

profileは`wan21-raw-f32-1x16x32`。元raw mean `[1,16,1,2,4]`をDiffusion owner Hikeへ渡し、normalized tensorを管理が採用したcodec2bdで実E2/E4保存・回収した。供給marker `wan21-comfy-f32-v1`、全128値、model/context/frame配列を保持。回収tensorを同owner Hike restoreへ渡し、元rawとの差は最大`2.384185791015625e-7`、事前gate`2e-6`以内だった。

復元mean全file SHAは`dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612`、payloadは`71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063`。既存の同じ復元meanとbyte exactであり、shape一致だけで代用していない。元351のinput identityと新Hike操作は別記録に保持した。

新管理入口から実native855をdispatchし、正常decodeと取消後の復帰decodeでRGB `[1,3,1,16,32]`を新しく得た。両方とも1536値すべてを既存独立参照と比較し、最大絶対誤差`4.328787326812744e-6`、事前`atol=rtol=maxAbs=2e-5`以内。両出力payload SHAは`aacf932664139862197c2dab5c087ce76305b2622bf02b3f5bde44eb73392d85`。RGBの実capture→disk write→readbackがcompleteとなり、入力mean・model/decoder・contextとの結び付きを保持した。

管理のN-IDENTITY/N-SHAPE/N-EVIDENCE/N-TRANSACTION/N-ARTIFACTはdeclaration→validated→publishedを通過。ここでのpublishedはartifact保存の管理状態であり、GitHub Pages配信や生成snapshot公開ではない。生成readiness/snapshotPublishedはfalseのまま。

取消は実Workerがrunning/creating-sessionに入った境界で実施。取消caseを推論完了として数えず、元Promise終端・対象Worker close・queue/owner release後に別Workerで復帰した。正常側Worker1/1、取消復帰側2/2が実close、live0。全helper子processはPID+ctimeで観測し、終了live0/zombie0/errors0。観測間に終了した未観測forkの完全監査ではない。

[P2全trace/receipt](p2/run/joint-result.json)、[正常decode](p2/run/decode/result.json)、[取消復帰](p2/run/cancel-recover/result.json)、[marker/restore](p2/run/prepare/prepare-result.json)。全体12.057秒、100ms sampled process-tree RSS和peak1,824,894,976 B。2GiB事前見積り・8GiB task budgetと実測を分ける。これはこのowner環境での診断受入で、相手環境への重み移送や利用端末の改善を認定しない。

## Text plainの新規検証

固定入力`Hello world`。選択manifest原本aeb7986…、原model c3355d…、Tokenizer e3909a…、最終norm weight31ec55…／epsilon1e-6を維持した。Python SentencePieceと実browser Tokenizerの全512 IDs/maskが一致した。

独立referenceは未短縮512位置をpinned PyTorch全24層とsource最終norm、Wan masked-zero方針へ通して新規計算した。ONNX/Hikeや既存ID出力をreferenceに使わない。対する実plain APIは既存compactionでeffective3を処理し、実Hike最終normとpaddingを経て `[1,512,4096]`を出力した。

全2,097,152値の比較はPASS、最大絶対誤差`3.4570693969726562e-6`。元manifestの`maxAbsError=.001 / rtol=.001`を変更せず、strict maxAbsと全値allcloseを確認した。padding2,084,864値は厳密0。実24 session create/release、最大1常駐、72 Tensor dispose。別のblock1後取消ではcheckpoint時点1 session/3 Tensor解放と、対象Workerの実終了を確認した。

source oracleは74.45秒、sampled RSS peak1,759,371,264 B。browser helperは93.61秒、process-tree RSS和peak6,333,726,720 B、最大単一process5,664,215,040 B。4GiB事前目安をbrowser実測が超過したため、資源改善・端末予算の受入は行わない。RSS和は共有pageを重複計上し得る。固定prompt数値診断であり、任意prompt・512有効token性能・元GPU FP8精度・元ComfyUI conditioning全体の保証ではない。

[plain詳細結果](plain/RESULT.md)、[数値/資源receipt](plain/RECEIPT.json)、[source/出力index](plain/EVIDENCE-INDEX.json)、[実conditioning](plain/evidence/plain-conditioning.wktensor)、[独立参照](plain/evidence/plain-reference.f32)。

## Conditioning引渡しとP6準備

[conditioning manifest](conditioning/manifest.json)は実8,390,054-byte .wktensor、全file/payload SHA、mask512、元prompt/IDs、model/Tokenizer、最終norm/gate、数値receiptを結ぶ。実dataは未投影4096-channel Text hiddenであり、latentや5120-channel projected contextへ改名していない。native metadataと外側source/trace/evidenceは分離している。

[契約](conditioning/CONTRACT.md)と[受取手順](conditioning/RECEIVER.md)をDiffusion担当へ渡す。現tail508d72…/実行a49aac…は固定N2自己注意残差のみで、Text引数を受け入れない。現validatorのTokenizer検査/返却保持不足も明記した。元の完全tensor/sidecarを維持し、cross-attention投影・K/V・本番消費の追加実装と数値責任はDiffusion ownerへ残す。

P6は[source/reference/slot/final shape表](p6/SOURCE-SLOT-SHAPES.md)と[不足条件](p6/requirements.json)を追加した。workflow設定gridのRGB `[1,3,81,480,832]`／latent `[1,16,21,60,104]`と、未取得の実媒体・前処理後寸法を区別する。静止画F1、非正方形reference、元動画、最終decodeを別項目にした。既存3診断profileは再exportしていない。N1/F=4n+1/H,Wは16以上の16倍数を維持し、無断の縮小/padding/frame削減は準備に含めない。

## 再利用証拠・受領確認・未受入

既存export/原本/graph、351の元encode、既存独立RGB参照、元model/Tokenizer identityを再利用した。今回VAE encode/export/大shape再推論は0。新規はowner mean Hike2callsとmarker保存、新管理の実decode2成功＋取消1、plain全値独立比較、実conditioningと必要shapeの整理。既存接続12件等のfixture結果と新NNを合算しない。

管理ownerの[codec受領ACK](receiver-ack-prior/RECEIVER-ACK.json)、[manifest受領ACK](receiver-ack-prior/MANIFEST-RECEIVER-ACK.json)、[既定storage採用](receiver-ack-prior/ADOPTED.json)は固定管理60d16から取得した実record。受領実行0239、採用実装830eのscopeを維持する。これらは今回の新conditioning dataや新配布SHAのACKではない。こちらのmanager source取得・GitHub push・自己検査も相手ACKに代用しない。

この成果物の固定source/dataに対する管理・Diffusionの新recipient-owned取得確認と、管理担当による返却receiptの最終照合は別に記録する。cross-attention本番消費、P3 LoRA全取引、P5実generated sample復元/decode、実媒体/slotに不足するprofile、81frame/大shape、全工程UI、資源改善は未受入。mergeとPages公開は行っていない。

再現は[REPRODUCE.md](REPRODUCE.md)。
