# 固定N2受入とP2・P3共同接続の配布記録

**N2受入記録の固定と共同runnerの実装・pushを完了した。P2の実VAE decode、
P3の新正式bridge実取引、受領側の新固定source取得ACKは未完了。**
該当edgeを保留し、生成受付は解除していない。

## 配布と実行source

- branch: `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。
- 管理実装・固定mean診断の実行source: `8849891f19124df31847bd691503c2491278eaa8`。
  最終配布SHAはこの報告を含むcommitで、PRと引渡し報告に記載する。固定実行sourceのruntimeは変更しない。
- [固定commitのAPI](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/docs/shared/ai-connection/API.md#joint-p2p3-receiver-runners)。
- [136ファイルのGit bytes照合](CHECKPOINT-SOURCE-RECEIPT.json)、[source pin](SOURCE-PIN.json)、
  [機械可読結果](RESULT.json)。GitHubから再取得した主要4ファイルも固定Git bytesと一致した。
  これは管理自身の読戻しであり、ownerの取得ACKと区別する。

| 役割 | 完全commit | 今回の扱い |
| --- | --- | --- |
| LoRA正式DATA | `82b21f09cb63926543181b16f0e97ebc6b9fa6be` | 採用済み三段階bridgeを再利用 |
| LoRA SDK／正本adapter／kernel | `fc2789a0f649e33f15eb13750e6a983b5c52d170` | 実行pin維持 |
| Diffusion Rect／base provider／consumer | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` | 実行pin維持 |
| VAE | `855f435120f08eb9e818e51281fc26f0e2633829` | 実decode候補pin維持 |
| 採用codec | `2bdca59ea78580d4fe7a9d31a8de33209b64d029` | marker保存を含む既定codecを維持 |
| 規範参照 | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` | 文書・schema版 `1.0-draft.1` |
| LoRA最新証拠 | `82cd9bb3d6792fa20a5305f52198efca5a30459f` | 取得済み証拠source、native pinとは別 |
| VAE最新証拠 | `e86d17f8fe3310875d3578ce838e1fc2c32271dc` | 既存encode等の再利用根拠、native pinとは別 |

## API・実装差分

1. N2の唯一の受入正本 [ADMISSION.json](../n2-tail-management/acceptance/ADMISSION.json) に、
   実行catalog／gate版、各sideの3入力・5出力identity、独立参照、phase別規範・保存receiptを結んだ。
   既存値と元resultは保持。158 source記録、6catalog body＋parent、入出力、24manifestを再照合した。
   新たな数値実行としては加算しない。
2. `run-joint-rect-management.mjs` を追加。既存mean runnerとmandatory decodeを
   一つの `jointTraceId/currentInputLink` で結び、今回の3mean packageを実diskから再読して
   restored入力・source・model・Profile・context・queue終端へ照合する。
   各owner変換前には既存 `evaluateEdge` で静的規範宣言を比較する。
   欠落はUNVERIFIED、既知の衝突はINCOMPATIBLE。未来receiptは付けない。
3. `run-managed-lora-data-real.mjs`、browser harness、外側宣言helperを追加。
   単一light/HIGH File＋真正bounded base＋既存独立参照を正式82b入口に通す。
   preflight→実validation後checkpoint→実publish後receiptの順序、管理／native tuple、
   取消・復帰・独立copy・診断snapshot・output16 E4の返却を準備した。
   対象mapping・復号・演算はownerを使用。selected-weight N-ARTIFACTとoutput16保存scopeは別。

native API、math、kernel、codec、queue／package／snapshot／cacheのcoreは変更していない。
旧bridgeは回帰専用のまま。製品入力はローカルFile、全4原本や全baseの取得を入口条件にしていない。
変更pathの全一覧は固定実装commitのdiff、およびsource receiptを参照。

## 再利用した証拠

- N2管理実行 `5c484a8783ab129a2ff3543a98b2537af9888199`、native実行
  `a49aac492cc68e2dd6037e0deb4a6954731a847a`、配布beffd、返却
  `508d72cc9036e7f500827465c644b4aed3c5f711` のHIGH1／LOW3各8比較・71680値・失敗0。
  固定Profile `bernini-block0-n2-self-attention-residual-f32-v1`、保存・自然終端解放のscopeを維持。
  元resultのnested hash／attention metadata例外と独立補足も保持し、原本を書き換えていない。
- Rectの元encode `35151d1f447d6bba30931a8c28636b2d5d9c3820`、同model／Profile／context、
  raw payload・独立mean/RGB参照を照合して利用。元encodeと将来の新decodeの時刻・sourceは別。
- LoRAの実PARTIAL20ケース、旧6snapshot、元0cの独立配列identity／事前gateを元scopeで保持。
  新82b実取引の成功件数に読み替えない。

## 新規検証と結果

| 検証scope | 結果 |
| --- | --- |
| 全回帰 | **467/467 PASS、fail0、skip0**。旧459＋変更境界8件。実行中136ファイルhash不変 |
| P2重点／P3重点 | 37／40件PASS。全回帰と重複するため合算しない |
| 固定8849891でのP2 mean経路 | owner WASM2呼出し、全128値の既存参照／gate、raw・marked normalized・restoredのE4実保存読戻しPASS。cache／store残留0 |
| 同runの事前規範 | normalize／restoreともCOMPATIBLE、数値not-verified、readiness blocked。限定診断prepareであり生成許可ではない |
| 同runのsource | 管理closure20ファイルが完全commitのGit bytesと一致。mean／decode入口のsource commitを明示 |
| 実VAE decode | 3asset不在でBLOCKED、NN0、browser0。取消・実RGB保存の共同受入も保留 |
| 真正bounded base原本 | Pageの709364B JSONを取得、全SHA25a845…一致。保持payloadはGitへ追加していない |
| 固定owner5f provider | 11sourceをGit照合、weight81920＋bias16を復号して既存digestと一致。実dispose終端を確認。LoRA取引0 |
| 新P3 runnerの実入力probe | 実Fileと真正baseは存在、独立9配列が欠落してBLOCKED/native取引0。oracle再生成0 |

base-only probeの外側scriptは未commitで、receiptの実script hashと固定owner5f sourceを明示する。
これを8849891の新LoRA実取引や全model検証として扱わない。
P3の早期missing-input probeは契約判定前に停止しており、実行commitをnullとして保持する。
契約判定を行っていない結果にCOMPATIBLEを捏造しない。

証拠は [Node log](evidence/node-tests.log)、[固定P2元JSONのlossless gzip](evidence/p2-fixed-8849891.json.gz)、
[base-only実証](evidence/base-provider-preflight.json)、[P3停止結果](evidence/p3-private-inputs-blocked.json)。
P2元JSONは769594B、SHA-256 `f7be6de3299639e6f44e8687285898f6fe82ed33e4ee5d90ff1921e730dda0a2`。

## 共同受入待ちと再現

固定source・command・返却条件を [VAE PR #11](https://github.com/Kushyameln01/kushyameln-works/pull/11#issuecomment-6556248492)、
[LoRA PR #2](https://github.com/Kushyameln01/kushyameln-works/pull/2#issuecomment-6556249765) へ送信し、読戻し確認済み。
[Diffusion PR #14](https://github.com/Kushyameln01/kushyameln-works/pull/14#issuecomment-6556251247) へ固定N2記録とP4境界を共有した。
旧60d sourceの受領表明は新8849891のACKとして扱わない。
今回の受領側ACK・共同実行resultの返却・管理照合は未取得。

[再現手順](REPRODUCE.md) と [P3詳細](P3-REPRODUCE.md) に従い、保持環境で
P2通常／取消復帰の2runと、P3新bridgeの実File/base取引を実施する。
管理は両者の完全SHA・規範・input/output・gate・現在target・保存receiptを照合して該当edgeだけ更新する。
契約一致・数値証拠だけ不足ならCOMPATIBLE／NOT_VERIFIED／BLOCKEDを維持する。

P4はDiffusion ownerの別候補。任意module、新consumer、任意LoRAへの接続、全block／実HIGH→LOW／
本番生成、ORT／総peak／組合せ資源予算、selected-weight保存受入は今回の合格外。
`generationReady:false`、`load/predict/sample=NOT_READY` を維持。
**Draft PRで共有済み。mainへmergeせず、Pages公開も実施していない。**
