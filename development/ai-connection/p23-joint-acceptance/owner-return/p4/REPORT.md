# Diffusion新P4候補の取得・照合結果

2026-11-02 JST。新P4を**旧固定N2とは別の未採用候補**として記録した。配布はPR14の`7ee36228030ba3bb544a90b1d4b528702a7bae32`、base HIGH/LOW実行sourceは`829467c14ec6fd1ab1858dfc175c84605de1ac98`、最終F32 feed HIGH実行sourceは`5744f700e17b23d5c18d32315fb6dfbd7c49089a`。新Profileは`bernini-block0-n2-cross-ffn-f32-candidate-v1`。

`CANDIDATE-RECORD.json`が候補記録、`ACQUISITION-RECEIPT.json`が全path・取得先・実bytes・SHA-256・Git blobを含む取得記録。固定Git実bytesを自分で読み直し、handoffの70件、別50source（WASM含む）13,352,427B、API/README、旧tail export receiptを照合した。重複排除123file・22,427,434B、745検査で不一致0。source inventory SHA-256は`31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b`。元receiverの50/50報告だけを根拠にはしていない。

| 取得対象 | bytes | SHA-256 |
| --- | ---: | --- |
| `docs/shared/diffusion-models/API.md` | 36,545 | `77b06f51da7c100c54507b5972aa553797c6cdcd62fbbf641487b18a41a2ca44` |
| `p4-cross-ffn/build.json` | 10,644 | `b1ecbdb091102337fe6b7988daff5ed2a11bf0911a4f4de5e7bf8fa062d0316d` |
| `post-self-attention/kernel.wasm` | 10,094 | `4d8518e94bd2de3ab9bf50f09b2fd17b69a5c57e7fd45dc65cd062d7fdbdbc4e` |

50sourceは配布7eeと最終実行5744で同一。baseの実要求36件×HIGH/LOW、feedの32件も各実行commit・最終source・配布bytesに一致した。50source中base→finalの差分はfeed-browser公開filterの1fileで、数値owner/kernel/gateは同一だった。

公開receipt間のinput・全25出力hash/shape・参照hash・gate・29重み選択identityを照合した。ownerのbase報告は**HIGH/LOW各local25＋composed25＝50比較、643,072値、failed0**。final-F32は**HIGHのみcomposed25、321,536値、failed0**で、consumerのblockOutput10,240値の検査も同じ実行に属する。件数を追加の独立推論として合算しない。こちらでprivate値から数値を再計算した結果ではない。

conditioningは明示dyadic Text L4 fixture `[1,4,4096]`・mask`[1,1,0,1]`。mask0を含む全行を投影し、cross softmaxへmaskを適用しない。実Text model/tokenizerからのpayloadは未取得。native入口のmodel/tokenizer/mask/capture契約を実Text共同受入へ読み替えない。

F32 feedは実FP8 Q weight先頭4行×5120列とF16 Q bias4値をproviderで復号し、callerが最終F32の2要素のsign bitを変えた限定fixture。sink→candidate→ORT weight/Hike bias、commit epoch1・旧lease保持・package解放後読出し・rollback epoch2をownerが報告した。低rank計算と新P4 canonical LoRA mappingは未実装・未受入。復帰確認は対象tileの再読で、復帰後のblock再計算や最終lease数0の独立観測ではない。

資源証拠はP4単独distinct WASM容量21,102,592B、idle旧tail＋P4で23,986,176B。3 ORT sessionに物理ORT Memory1個16,777,216Bを含む。旧5出力は別途JS保持163,840B/side。これはMemory容量とnamed累積copy観測であり、allocator/RSS/host/GC/全工程peakの受入ではない。本番予算は計算上の見積りで、実行済みではない。

旧固定N2の管理実装`5c484a8783ab129a2ff3543a98b2537af9888199`／native`a49aac492cc68e2dd6037e0deb4a6954731a847a`／配布`beffdcb800b629d0b13ff43bbc90e9f74c659152`／返却`508d72cc9036e7f500827465c644b4aed3c5f711`と既存ADMISSIONのscopeは維持した。新候補へのpin置換、共通catalog採用、manager runtime接続は実施していない。

未取得はprivate model、保存済み旧出力/E4 package body、runtime25配列、独立reference payload、patch payload、実Text値。public hash/receiptを取得したこととprivate本体受領・local decode/readbackは別である。新規推論・参照計算・再export・model取得・mapping復元は行っていない。

残件は実Text payload/referenceと対向owner ACK、新LoRA mappingと実低rank適用、新Profileの共通catalog/管理採用、元workflow/本番shape・精度/全block・実HIGH→LOW・生成/復元/VAE decode、全工程資源である。既知の一致契約で数値証拠だけが不足する境界は`COMPATIBLE / NOT_VERIFIED / BLOCKED`、必要mapping契約自体が不明な新LoRA境界は`UNVERIFIED`を保持する。`generationReady:false`、`load/predict/sample=NOT_READY`。

再照合: `python /workspace/work/ai-connection/returns-r10/p4-review/verify-p4.py`。モデル・ORT・候補moduleは実行せず、固定Git bytesとpublic JSONだけを読む。実行出力は`verification.log`。
