# 新codecの管理保存経路への採用

新codecを管理の実保存経路へ採用した。実装checkpointは `830e58bbe1e9d783910cfc0a9c6bf8cf45071c58`。最終配布commitはDraft PR#7のhead、実行結果・file hashは `ADOPTED.json` を参照する。

## 固定した実装と配置

| 対象 | 完全commit・規格 |
| --- | --- |
| owner codec | `2bdca59ea78580d4fe7a9d31a8de33209b64d029:docs/shared/inference/tensor.mjs` |
| owner引渡し | `3571c5fe8a4b2c3a31754607e424e64d24d798e5`、PR#13 |
| 実bytes | 8256 bytes、SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`、Git blob `6f428fdfc1a4077b2a5cd568c42011391027cc8e` |
| 管理deployment | `docs/shared/ai-connection/codecs/tensor-2bdca59.mjs`、原本とbyte exact |
| 管理factory | `docs/shared/ai-connection/codecs/wktensor.mjs`、adapters/indexからも公開 |
| 保存形式／共通規格 | `WKTSR001/schemaVersion1`、`works-module-contract/1.0-draft.1`、`works-artifact-package/1.0-draft.1`を維持 |

ownerの4 exportはdecodeTensor、encodeTensor、requireTensor、snapshotTensorMetadata。原本を改変せず同梱した。新しい演算・marker推測・独自codecを追加していない。同repositoryのowner sourceとして出所を固定し、未記載のライセンス宣言を補っていない。

`createAdoptedWktensorCodec()` が返すsourceRefを、manifest.codecとregistry.codecsへ同一に登録する。`verifyAdoptedWktensorSource()` は実bytesの長さとSHAを検査する。owner原本のsourceRefと管理側deployment/Git commitは別に記録する。

## 実際に接続した経路

- Rect管理runnerの入力decode、cache、4つのE4保存経路。normalized中間packageも保存・実読戻しを行い、回収したowned tensorを既存ownerのrestoreへ渡す。
- 規範必須RectのNode preflightとbrowserのinput decode／RGB保存。native VAE855のsource closureとは別に、新storage codecの実bytes検査とsource proofを保持する。
- managed LoRAのlegacy・snapshot-candidate両scenario。codec引数を省略した場合は同梱2bdが既定。既存codec-root/codec-commitの両方を明示した場合は外部codec注入を維持し、mode/sourceを記録する。legacyというscenario名は旧storage選択を意味しない。

generic package/diagnostic-package coreは、明示されたtrusted codecを使う既存APIのまま。native SDK/kernel、VAE855 worker内の旧4c依存、旧取得source・package reader回帰、過去receiptを一括置換していない。新しい保存sourceをpersistenceCodecSource/storageCodecとして分離した。

## 検証

全Node回帰 **371/371 PASS、fail0、skip0**。新codecのbyte exact、marker往復、旧unmarked wireのbyte一致・読取り、source改変拒否、実E4保存・読戻し、active両LoRA selectorと外部codec両flags制約を確認した。旧codecの明示回帰環境変数は旧4cのまま維持した。

固定checkpointからRect管理runnerを実行し、raw mean・normalized mean・restored mean・受領RGBの4packageがすべてcomplete。normalized128値とmarker/model/context/evidenceを保持し、native全file SHAは `f7b2b158096937648a14a224ca4961543eace129a24ae3b88394a810f6c18840`。既存ownerのnormalize/restoreは2呼出し、128値の独立参照一致と従来gateを維持した。旧writerは明示legacy probeでNATIVE_METADATA_MISMATCH・書込み0、現在の保存を塞ぐedgeからは外した。store/cache残留0。

LoRAは既存ローカルFileを新規取得せず再利用し、固定sourceから実browserの管理経路を確認した。sourceやbaseのscope、各scenarioの結果とpackage hashは `ADOPTED.json` / `active-evidence/` に記録する。ここでのbaseはsynthetic-manager-control-fixtureであり、真正baseの新受入ではない。新保存codecの採用を、LoRA全target・本番model sessionの受入へ拡張していない。

規範必須Rectのpreflightも新codec8256 bytes/d82を実検査した。decoder3assetが当環境にないため、実VAE decodeはnative0/browser0。今回確認した受領RGB保存やbrowser保存fixtureは、新管理からの実NN出力ではない。

## 互換性と残る別scope

新writerは供給された有効markerを保持し、markerなし旧WKTを推測で補わず読む。旧writerがmarkerを落とす負例、旧sourceRefを要求するpackage readerは旧pinで維持する。genericな読取registryへ新sourceを旧source名で登録することはしない。

本件の保存codec採用は完了。新管理の実Rect NN/decode・対象取消復帰・owner解放・その実RGB保存、Text plain独立全値、本番production hidden・全query/head/stage・組合せ資源予算・generated sample/81frame/全sessionは別の未受入scopeとして保持する。保存完備や診断snapshot公開で生成受付を解除しない。

再現は `ADOPTED-REPRODUCE.md`。同branch/Draft PR#7へpushし、main merge/Pages deployは行わない。
