# Diffusion P4契約・Text packet・LoRA成果の取得返却

2026-11-02 JST。今回は固定manifest/receiptと実bytesの取得照合だけを行う。
NN推論、Text projection、cross-attention/FFN、LoRA低rank積、再exportは実行しない。
native API・kernel・数値gate・受入profileを変更しない。

## 配布と実行source

| 対象 | 固定配布SHA | 元の実行source SHA |
| --- | --- | --- |
| Diffusion P4契約・証拠 | `7ee36228030ba3bb544a90b1d4b528702a7bae32` | 最終F32 feed HIGH `5744f700e17b23d5c18d32315fb6dfbd7c49089a`、base HIGH/LOW `829467c14ec6fd1ab1858dfc175c84605de1ac98` |
| Text実conditioning | `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` | plain encode/独立比較helper `5537b8932343aa2476b95191817e8913f99dab02` |
| LoRA旧Q16正式DATA成果 | `dd95ed05f058930a391f015c11b9a2b963a42db5` | `28f44c3a1b71bef59e2d018a0db736de6d84675c` |

このフォルダはDiffusion担当自身の取得・返却記録であり、上表の新しい数値実行sourceではない。
Textの追補 `a42ad61a7f56667ceefb4f21a9aacde859e00538` は最新Diffusion契約の取得ACKである。
元f76のdata・gate・receiptを変更するものではなく、f76受領への追加条件にもしていない。

## 相手へ渡す新P4契約

以下のpathは固定7eeのtreeを指す。完全URL・bytes・SHA-256・Git blobは
[outbound-files.json](outbound-files.json) にまとめた。
23ファイル・5,060,379 bytesをGitHubから取得して固定Git objectと一致した。
既存handoff/build/APIの重複を除く119 pathは固定Git objectに対するchecksumだけを確認した。

| 相手 | 提出物 | 境界と残件 |
| --- | --- | --- |
| LoRA | `development/ai-connection/p4-cross-ffn/WEIGHT-FEED.md`、`source/registry/weights/stage.mjs` | 元full shape・storage/compute・FP8 scale・実bindingを保持するPARTIAL registry、owned F32 immutable base provider、sink、candidate検証/commit/rollback、実ORT matrix/Hike bias consumer。canonical LoRA mappingと実LoRA新P4適用は未受入 |
| VAE＆TextEncoder | 同 `CONDITIONING.md`、`conditioning-contract.json`、`conditioning.mjs` | F32 BLC `[1,L,4096]`・mask・model/tokenizer・producer来歴を保持。元coreどおり全L行を保ち、maskをsoftmaxへ無断適用せず、行の削除/padding/改名をしない。Text最終RMSNormはText owner、投影/cross/FFNはDiffusion owner |
| 管理 | 同 `catalog-submission.json`、`core/candidate-plan.json`、`verification.json`、`integration/{high,low}-browser.json`、`feed-integration/high-feed-{prepare,browser,comparison}.json` | 新owner候補 `bernini-block0-n2-cross-ffn-f32-candidate-v1`。旧管理候補とは別entry。local .001/.0001、composed .01/.001の事前gate。共通catalog採用・管理snapshot受入とは別 |

上表のmoduleは `docs/shared/diffusion-models/ort-bridge/post-self-attention/` 基準。
完全source closureは固定7eeの `development/ai-connection/p4-cross-ffn/build.json` にある。
matrixは `runtime-input` → actual ORT input `weight`、biasは `hike-parameter` → Hike AddBias。
本registryにmodel weightのinitializer targetはない。
低rank積・alpha/strength・LoRA loader・full shapeからsliceへの対応はLoRA ownerが所有する。
全体待機列・工程・共同snapshotは管理、Diffusion内部の数値演算・feed epoch・資源はDiffusionが所有する。

既存資源receiptを元scopeで渡す。P4単独のWASM capacityは21,102,592 B、旧tailをidleで併置すると
23,986,176 B。3 ORT sessionは1個の16 MiB Memoryを共有する。linear input snapshotは累積
1,811,538,240 B/runで、peak値ではない。host/allocator/GC/全工程peakはnullのままである。
固定N2/K4の時間・容量をL512や本番全工程へ外挿して受入済みにはしない。

## 受領記録

Textは [text/RECEIPT.md](text/RECEIPT.md)、LoRAは [lora/RECEIVED-AND-P4-MAPPING.md](lora/RECEIVED-AND-P4-MAPPING.md) を参照。
両方とも取得path・bytes・SHA-256・元source・確認scope・未取得/未受入を分けている。
受取probe/byte照合の成功を、producerの実行をこちらで再認証したことや新P4の数値合格とはしない。
公開された独立参照・元all-value比較receiptは元scopeのまま受領し、再計算しない。
LoRA原本4個、full base、非公開prepared weightの取得は今回のACKに含めない。

管理の固定N2 ADMISSIONは `8849891f19124df31847bd691503c2491278eaa8` から取得した。
`development/ai-connection/n2-tail-management/acceptance/ADMISSION.json` は54,067 B、
SHA-256 `e9db5fe42d117a0dad32f2497b93d806f3f0af41c5b2136e306db003aec149c6`。
旧profileのHIGH1/LOW3個別受入・保存scopeと既知metadata例外を保持し、新P4/実Text/LoRA後edgeには転用しない。

Text担当の最新7ee取得ACKは [PR14の本人返却](https://github.com/Kushyameln01/kushyameln-works/pull/14#issuecomment-6559891258) と
固定a42の `development/inference/recipient-roundtrip/2026-11-02/DIFFUSION-SOURCE-ACQUISITION.json` で受領した。
16件は最新7ee 13件＋旧829再取得3件であり、こちらの新P4へのText消費ではない。
LoRA/管理の今回7eeに対する本人取得ACKは、取得できた既存PRコメントにはまだない。
今回の送信・相手の取得ACK・数値共同受入を分け、送信先は [DELIVERY.json](DELIVERY.json) へ記録する。

## 未受入

- 実Text L512のP4投影・cross-attention/FFN数値・資源受入。
- 新P4 targetへのLoRA正本adapter、実prepared weight/bias共同適用と独立参照・gate受入。
- 任意producer/任意prompt、元workflowのpositive/negative/ordered contexts、本番precision・shape。
- 全block・最終head、実HIGH→LOW受渡し、生成sample・復元・VAE decode、全体資源予算。
- 管理の新P4 catalog採用・共同snapshot、P2/P3全体の最終共同受入。

`load/predict/sample=NOT_READY`、`generationReady:false`を維持する。
merge・GitHub Pages公開はこの作業で行わない。

## 再現

モデルを取得せず、[REPRODUCE.md](REPRODUCE.md) の取得・probeコマンドだけを実行する。
既存の重い数値runnerやexporterを起動する必要はない。
