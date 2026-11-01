# Diffusion conditioning契約の取得・固定Text packetとの照合

取得日時: 2026-11-01T15:06:36.797386+00:00。対象はDraft PR14、repository `Kushyameln01/kushyameln-works`。この報告は公開sourceの実取得と固定Text packetの読み取り照合であり、Diffusion担当本人の受領ACKを代行しない。新NN実行・native module import・export・WKT変換は0。元f76のdata/evidence/契約を変更していない。

## 固定した版

| 対象 | 完全SHA / 版 | 根拠 |
| --- | --- | --- |
| 今回GitHubから取得したDiffusion配布head | `7ee36228030ba3bb544a90b1d4b528702a7bae32` | PR14 metadataのhead_sha。Draft/open |
| P4最新実行・提供source | `5744f700e17b23d5c18d32315fb6dfbd7c49089a` | 最新RESULT.mdの原文 |
| HIGH/LOW base実行source | `829467c14ec6fd1ab1858dfc175c84605de1ac98` | 最新RESULT.mdの原文 |
| P4数値owner初回実装source | `3ae9b934ffcd2cf092171699fd7a5b55110f1197` | 最新RESULT.mdの原文 |
| 当Text packet固定配布 | `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` | ローカルworktree HEADと固定packet |
| 当plain Text実encode・独立比較 | `5537b8932343aa2476b95191817e8913f99dab02` | f76 manifestのactualEncodeExecution |

Diffusionのnative APIは `diffusion-models/0.1`、文書タイトルは「diffusion_models 外部API 0.1」。API.mdには独立した `docRevision` フィールドや文書改訂番号は記載されていないため、文書の版は取得commit/path/bytes/SHA256/Gitblobで固定する。取得API.mdは36,545 bytes / SHA256 `77b06f51da7c100c54507b5972aa553797c6cdcd62fbbf641487b18a41a2ca44`、Gitblob `ebdf8d5206ae08ad589a5205944be23607ead817`。P4 Profileは `bernini-block0-n2-cross-ffn-f32-candidate-v1`、候補buildは `bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b`。この取得headを過去の実行sourceへ付け替えない。

## 829467からの差分

f76 manifestに保存済みの829取得記録と、今回7eeから取得した実bytesを比較した。以下4 sourceは長さ・SHA256・Gitblobすべて同一。前回のP4構造対応とfixture限定受入の区別は変わらない。

| 役割 | path | bytes | 829→7ee |
| --- | --- | ---: | --- |
| native capture | `docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs` | 18,862 | 同一 |
| generic stage | `docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs` | 21,978 | 同一 |
| diagnostic runner | `docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs` | 21,215 | 同一 |
| native reference | `tools/diffusion-models/p4-cross-ffn-reference.py` | 40,251 | 同一 |

API.md、CONDITIONING.md、browser.pyについても今回829と7eeの両固定SHAから取得し、Gitblobの同一を確認した。公開receiverのsource-version-proofは、5744対829の候補50-source closureで変更1件・同一49件と報告する。変更は `tools/diffusion-models/p4-cross-ffn-feed-browser.py` の公開publisher部分である。この50件全量は今回独立再取得しておらず、receiver原文の記録として扱う。

## f76 native L512との対応

固定packetの正本は[f76 manifest](https://github.com/Kushyameln01/kushyameln-works/blob/f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48/development/inference/p2-p3-acceptance/conditioning/manifest.json)、[f76 CONTRACT.md](https://github.com/Kushyameln01/kushyameln-works/blob/f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48/development/inference/p2-p3-acceptance/conditioning/CONTRACT.md)、[f76 RECEIVER.md](https://github.com/Kushyameln01/kushyameln-works/blob/f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48/development/inference/p2-p3-acceptance/conditioning/RECEIVER.md)。固定promptは `Hello world`、positive diagnostic一件であり、negative/Bernini prefix/元workflow conditioning全体を受入したものではない。

当方は元WKT・maskを読み取り、以下を実bytesで確認した。元plain数値比較のNNや独立referenceは再実行していない。

| 項目 | f76実値 | 最新P4契約との対応 |
| --- | --- | --- |
| dtype/layout/meaning | `float32 / BLC / text_hidden_states` | native captureが要求する値に一致 |
| shape | `[1,512,4096]` | `1<=L<=512` の上限に対応。5120 hidden/latentへの改名はしない |
| data | 2,097,152値、全有限。payload 8,388,608 bytes | L×4096の実data。native JS typed-array admission/capture自体は未実行 |
| mask | Uint8 512 bytes、有効位置0/1/2。headerと別file全512位置一致 | native mask0/1・1位置以上有効の規則に対応 |
| mask0 hidden | 2,084,864値、すべて数値0。全payloadの負zero bit数0 | native captureのmasked row=0規則に対応 |
| Text model | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` | capture既定識別と一致 |
| Tokenizer | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` | WKT headerに保持。capture既定識別と一致 |
| whole WKT | 8,390,054 bytes / `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` | 元G1Cを保持 |
| payload SHA256 | `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7` | 別形式へ移す場合も元payloadとの対応を保持 |
| mask SHA256 | `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` | maskを独立に結合 |

Text最終affine RMSNorm/epsilon1e-6はText owner適用済み出力として保持する。元Text gate `.001/.001`、元receipt・独立full512 reference・実行5537・選択manifest・Tokenizer・外側evidence/traceは元packetのまま。captureの構造適合はproducer実行認証ではなく、返却verificationの `producerAuthenticated / realExecutionVerified / jointlyAccepted` はすべてfalse。tensor外のevidence/receipt/traceをcaptureが復元することもない。private sealは同一module instance/realmに限定され、保存読戻し/転送後はreceiverがcaptureし直す必要がある。

Diffusionが `text_embedding.0 → GELU(tanh) → text_embedding.2` による4096→5120投影、K/V/Q・norm、cross-attention・FFN、P4事前gate/独立referenceと資源受入を所有する。全L行を保持し、maskは来歴metadataとして保持する。softmax mask・RoPE・mask0行削除・暗黙padding・Text再正規化を加えない。biasにより投影後の元zero行が非zeroになるため、行削減は元演算を変える。

Generic stageは認識済みnative captureと全Lをsource上受け取れるが、現 `runP4CrossFfn` とbrowser比較は固定 `[1,4,4096]` dyadic fixture・専用hashを要求し、`captureP4FixtureConditioning` を使用する。当L512をこの診断runnerへ無変更で通せるとはしない。実L512のP4数値・資源受入は未確認。

Native referenceの `--text` はG1C WKTとは別のprivate JSON `bernini-p4-native-text-input/0.1`。dtype/layout/meaning、shape、flat data、mask、producer.module=text_encoder・producer.sourceCommit=元実行5537、model/Tokenizer識別を保持する必要がある。JSON自身の全UTF-8 hashを元WKT whole/payload/mask hashの代用にしない。変換するときは元bit列と元packet evidence/gate/sourceへの対応を外側に結ぶ。今回は変換していない。

## 取得確認と受領ACKの状態

| 確認対象 | 今回確認できた状態 |
| --- | --- |
| 当方によるDiffusion公開契約/source取得 | 下記11 primary＋補足2 fileを7ee固定で取得・保存しGitblob照合。ACK本人性なし |
| 公開P4 receiver receipt | 5744から50/50・13,352,427B取得の記録。scopeは独立委任receiverの公開source/static reviewのみ。`externalOwnerACK:false`、`jointNumericalAcceptance:false`、`modelInferenceExecuted:false` |
| Diffusion担当本人による当f76/dd3401 Text data受領ACK | 未確認。PR14 discussion全5件を専用コメントAPIで取得したが、Text送付6556642375・追補6557043498に対する本人data取得/照合ACKは見つからない |
| 当Text L512のP4実消費・数値比較 | 未受入。最新RESULTは実Text payload未取得、conditioning-contractはretainedRealPayload:null/jointNumericalStatus:BLOCKED_MISSING_REAL_TEXT_PAYLOAD |
| 生成・HIGH→LOW・VAE decode | 今回受入外。`load/predict/sample=NOT_READY`、`generationReady:false`を維持 |

新receiver receiptをText担当やDiffusion担当の本人ACKへ読み替えない。今回の同host読み取り・内部調査の保存も相手ACKを満たさない。必要なのはDiffusion側自身の固定f76またはdata不変のdd3401の取得/照合範囲・data/mask/Tokenizer/元gate・未消費scopeを明記した返信またはrecipient-owned記録である。

## 取得したprimary 11 source

すべて配布 `7ee36228030ba3bb544a90b1d4b528702a7bae32` の完全UTF-8原文。取得原文の私有保存先は取得記録のlocalPath、公開再取得先は固定remoteURLに示す。原文runtimeをこの追補へ重複同梱していない。GitHubの返却blob SHAと計算Gitblobは全件一致。完全SHA/path/bytes/SHA256/Gitblob/remoteURLは [DIFFUSION-SOURCE-ACQUISITION.json](DIFFUSION-SOURCE-ACQUISITION.json) に記録する。

| path | UTF-8 bytes | SHA256 |
| --- | ---: | --- |
| [docs/shared/diffusion-models/API.md](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/API.md) | 36545 | `77b06f51da7c100c54507b5972aa553797c6cdcd62fbbf641487b18a41a2ca44` |
| [development/ai-connection/p4-cross-ffn/CONDITIONING.md](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/CONDITIONING.md) | 14562 | `cde2297294f80ffba1c3beeb40dd3f64c827dc9520e90ac9e501427e688192f0` |
| [docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs) | 18862 | `b4518ea35ca35e63e6ba8cdbe67e5d9fea0fa2125dac7dac0f5d4ac6c83ac7c2` |
| [docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs) | 21978 | `ff184acbabc589472a95b0bbf0eb2d3949b4478ecc0b19266817e8c313e7826d` |
| [docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs) | 21215 | `ddf216d4be56e7f1a424285718c91d825241f4de4e3a98d46794bf61b164d0b3` |
| [tools/diffusion-models/p4-cross-ffn-reference.py](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/tools/diffusion-models/p4-cross-ffn-reference.py) | 40251 | `66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf` |
| [tools/diffusion-models/p4-cross-ffn-browser.py](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/tools/diffusion-models/p4-cross-ffn-browser.py) | 29759 | `141ab992ec58f3b985e739ec00f79ec98b03d0bbfc4d1581bc4131a3c986707b` |
| [development/ai-connection/p4-cross-ffn/REPRODUCE.md](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/REPRODUCE.md) | 8442 | `f894eaa2763d226e981be1cdb565ea12320cbe003a20ed98b58f290049798da7` |
| [development/ai-connection/p4-cross-ffn/RESULT.md](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/RESULT.md) | 13819 | `b6facd051419efa6654a2a8c4d8fc37716769caed05c5eaa41557e725eec2ad7` |
| [development/ai-connection/p4-cross-ffn/receiver/receipt.json](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/receiver/receipt.json) | 31666 | `2a2ba6d6bde6ebc1310e64ee00053049246e2e02d3d624480511f8ade7e38b10` |
| [development/ai-connection/p4-cross-ffn/conditioning-contract.json](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/conditioning-contract.json) | 9175 | `8bf18c043a24b95f81fcc93eac0f30db7290c67a9f786ad7af618f0e7ac54e76` |

補足の受取案内・receiver版差分も同じ配布headから取得した。

| path | UTF-8 bytes | SHA256 |
| --- | ---: | --- |
| [docs/shared/diffusion-models/ort-bridge/post-self-attention/README.md](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/README.md) | 1867 | `d668fb1cf94db2235077295b1637c2cac060569705e4fe453c5e2644e045c7e0` |
| [development/ai-connection/p4-cross-ffn/receiver/source-version-proof.json](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/receiver/source-version-proof.json) | 865 | `953016e47567c6807764bb2079486840d51ce2d09347fe68f6445b2b971401eb` |

829再取得3件を含む取得記録は計16件。私有取得記録側のPR本文/コメントは `pr14-metadata.json` / `pr14-comments.json`、当packetの読取結果と4source比較は [CONDITIONING-BYTE-CHECK.json](CONDITIONING-BYTE-CHECK.json) に保存した。元f76側への書込み・commit/push・外部コメント送信は本調査では行っていない。

主要出典: [APIのP4境界](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/API.md#L252)、[conditioning契約](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/CONDITIONING.md)、[最新RESULTのsourceと未受入](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/RESULT.md)、[receiver receipt](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/receiver/receipt.json)、[receiver版差分](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/receiver/source-version-proof.json)。
