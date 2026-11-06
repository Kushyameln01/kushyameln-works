# 既存VAE受入の再利用範囲

この資料は既存の単体受入を再利用するための索引である。今回の包装でNN推論、独立参照生成、exportを繰り返していない。新しいgenerated Rect部分接続の実NN結果へ、過去の合格を転用しない。

正本は[単体VAE結果](../standalone-20261102/VAE-RESULT.md)、[証拠index](../standalone-20261102/evidence/index.json)、[source再利用境界](../standalone-20261102/evidence/source-reuse-boundaries.json)。これらを取得した固定配布は[`badff7a436b56207a084c4c770e01490899a576c`](https://github.com/Kushyameln01/kushyameln-works/blob/badff7a436b56207a084c4c770e01490899a576c/development/inference/standalone-20261102/VAE-RESULT.md)であり、各runの実行sourceは以下の元SHAを維持する。

## profile・source・数値規則

再利用するprofileは`wan21-raw-f32-stream`、manifest kind `wan21-vae-stream-v1`。RGB `[1,3,F,H,W]`からraw posterior mean `[1,16,1+floor((F-1)/4),H/8,W/8]`を返す。独立raw decodeは`wan21-raw-latent:v1`の`[1,16,T,h,w]`からRGB `[1,3,1+4*(T-1),8h,8w]`を返す。posterior mean、独立raw、実generated sampleを区別する。

- 元VAE: 253,815,318 bytes、SHA-256 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。
- vendor source: Wan-Video/Wan2.1 `9737cba9c1c3c4d04b33fcad41c111989865d315`、`wan/modules/vae.py` SHA-256 `4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498`。
- graph export: `a7573012e98b6b94ad2c56788b4c14907f262201`。
- target81独立参照: `05198dba7959cc95e0c4d770fd85557ad4010a80`。
- 事前gate: `atol=0.002`、`rtol=0.002`、全体`maxAbs≤0.002`。[元計画](../standalone-20261102/vae/predeclared-plan.json)の範囲を保ち、別profileのgateで補わない。
- 保存BF16係数を変更せずFP32へ展開したCPU実行、ORT WASM 1.24.3。元BF16実行との一致、実媒体品質、全domainを保証する証拠ではない。

実行source対応は次のとおり。

| ID | 完全実行source SHA |
|---|---|
| A: target81・診断F5 | `d578ec006571d82bc50c6c2935d78ae6ea838269` |
| B: source F1 | `e0f0dd7cae05aebcfc60214d51fce90df6197ab7` |
| C: source F4/F5/F80・reference 848²・追加raw decode取消 | `dccb88515775ec8aa86dd16f82e8816c9347ed38` |
| D: reference 16²/16×848/848×16 | `cc9b37f82ed855b36261d92429a822528bc24a71` |
| E: reference 16×32・threads4 | `e5e954ac8faa304c5e90b469970b6fd7940d8c08` |

## 合格済みshapeと操作

表のF/H/Wは実際の合成入力であり、未知の実媒体の寸法を推測したものではない。encodeの値はraw mean、decodeの値は独立raw入力からのRGBである。

| scope・source ID | RGB shape | latent shape | encode maxAbs / decode maxAbs | 受入receipt |
|---|---|---|---|---|
| target81・A | `[1,3,81,480,832]` | `[1,16,21,60,104]` | `2.86102294921875e-6` / `5.27501106262207e-6` | [target81](../standalone-20261102/evidence/vae-target81-acceptance.json) |
| source F1・B | `[1,3,1,480,832]` | `[1,16,1,60,104]` | `1.6689300537109375e-6` / `2.1904706954956055e-6` | [F1](../standalone-20261102/evidence/vae-f1-480x832-acceptance.json) |
| source F4・C | 入力`[1,3,4,480,832]`、消費F1 | `[1,16,1,60,104]` | `1.6689300537109375e-6` / F1の同一raw decodeを再利用。F4名での新規decodeなし | [F4](../standalone-20261102/evidence/vae-source-f4-acceptance.json) |
| source F5・C | `[1,3,5,480,832]` | `[1,16,2,60,104]` | `2.1457672119140625e-6` / `3.6656856536865234e-6` | [F5](../standalone-20261102/evidence/vae-source-f5-acceptance.json) |
| source F80・C | 入力`[1,3,80,480,832]`、消費F77 | `[1,16,20,60,104]` | `2.86102294921875e-6` / **T20→F77 decodeはNOT_RUN** | [F80](../standalone-20261102/evidence/vae-source-f80-acceptance.json) |
| source F81・Aの数値alias | targetと同一RGB/raw入力 | targetと同一latent | target受入を再利用、新規source-role NNなし | [同一性](../standalone-20261102/evidence/vae-source81-alias-identity.json)・[NN=0 codec proof](../standalone-20261102/evidence/vae-source81-alias-proof.json) |
| reference F1・D | `[1,3,1,16,16]` | `[1,16,1,2,2]` | `7.152557373046875e-7` / `5.066394805908203e-7` | [16²](../standalone-20261102/evidence/vae-reference-f1-16x16-acceptance.json) |
| reference F1・D | `[1,3,1,16,848]` | `[1,16,1,2,106]` | `1.1920928955078125e-6` / `1.8775463104248047e-6` | [16×848](../standalone-20261102/evidence/vae-reference-f1-16x848-acceptance.json) |
| reference F1・D | `[1,3,1,848,16]` | `[1,16,1,106,2]` | `9.5367431640625e-7` / `1.4603137969970703e-6` | [848×16](../standalone-20261102/evidence/vae-reference-f1-848x16-acceptance.json) |
| reference F1・E | `[1,3,1,16,32]` | `[1,16,1,2,4]` | `7.152557373046875e-7` / `5.662441253662109e-7` | [16×32](../standalone-20261102/evidence/vae-thread4-16x32-acceptance.json) |
| reference F1・C | `[1,3,1,848,848]` | `[1,16,1,106,106]` | `1.9073486328125e-6` / `3.337860107421875e-6` | [848²](../standalone-20261102/evidence/vae-reference-f1-848x848-acceptance.json) |
| copy/継続診断F5・A | `[1,3,5,16,32]` | `[1,16,2,2,4]` | `1.430511474609375e-6` / `1.519918441772461e-6` | [F5診断](../standalone-20261102/evidence/vae-copy-reduced-f5-acceptance.json) |

source F4/F5/F80参照は、target81独立native出力の各channelで時間軸を切り出したcausal prefix参照である。新しいvendor NN推論とは数えない。F1直接参照とのbridgeと元sourceの因果性を条件にした再利用であり、flatten先頭部分の切出しではない。848²は同じ空間shapeで別途直接独立参照を実行しており、小profileから派生していない。

F4は実入力4・latent1・消費1・tail3、F80は実入力80・latent20・消費77・tail3を保持した。tensor.contextは消費frame対応、frameProcessing.sourceContextは元全frame対応を保持する。source81のNN=0 codec確認は元`d578…`実行を別source-role NN成功へ拡張しない。

## 取消・session・Worker・processの範囲

target81 encodeは実chunk完了後cancel、同一APIで通常recovery、全値比較と保存読戻しまで確認した。正常encodeは859/859 session作成/release、decodeは1069/1069、最大同時session1、終了active0。source F4は39/39、F5はencode80/80・decode100/100、F80 encodeは818/818、848²はencode39/39・decode49/49だった。

[独立raw decode取消](../standalone-20261102/evidence/vae-raw-decode-cancel-acceptance.json)はsource C、raw `[1,16,2,2,4]`からRGB `[1,3,5,16,32]`への実chunk後取消・同一API再実行を確認し、全7680値maxAbs `1.519918441772461e-6`。この小診断取消をtarget全decodeの中断確認へ読み替えない。

各新しいreceiptは所有browser子群の最終`liveAfterClose:[]`、`zombiesAfterClose:[]`、ownership errorsなしを記録する。F80は既知の親Worker1+pthread3、848²は親Worker2+pthread6のdestroy/不在を確認した。強制取消されたWorker内のJavaScript finallyが実行したとは主張しない。古いF1/16×32数値receiptは同じ強さのCDP終了観測を持たない。

当時の別queue controller PID40303はPPID1のzombie・RSS0として残り、VAE harness/browser子群の終了とは別scopeだった。[最終process観測](../standalone-20261102/evidence/post-run-process-observation.json)を保持し、現在も生存しているという推測や「全起動process無条件0」という結論を加えない。[host SIGINT受入](../standalone-20261102/evidence/vae-host-sigint-acceptance.json)の`passed:false`も正常NN合格へ混ぜない。

標本group RSS/PSS peakはtarget81 `9,432,653,824 / 9,175,997,440 B`、F80 `9,467,285,504 / 9,220,117,504 B`、848² `6,393,741,312 / 6,140,748,800 B`。これらは追跡browserと子群の標本値で、Python参照/exportを除く。RSSとPSSを加算せず、cgroup/tmpfs/単一WASM容量から最小必要RAMへ換算しない。sampling gap、共有負荷、通信中断の限界は元VAE-RESULTを維持する。

## 受入証拠と実資材の現存を分ける

[threads1 manifest](../standalone-20261102/evidence/vae-stream-manifest.json)は51,613 bytes / SHA-256 `64c57a7aeb5e8fcb5089b8d5771ce293b8355e365f2fd5cfe80df0840ca85345`、[threads4 manifest](../standalone-20261102/evidence/vae-stream-threads4-manifest.json)は51,613 bytes / `532523034a5e5c7590c4fca11d67feec329c6e0e364afd55f472f03ffd8966d2`。実行receipt、partition inventory、sourceとhashは固定Gitで取得できる。

一方、旧`/tmp/kw-vae-stream-export-20261102`等に置いたprivate stream bundleの実bytesは現在失われている。今回`/workspace/work/inference`を探索しても69-unit ONNXディレクトリや対応weight archiveを取得できなかった。71資材・507,834,866 bytesのmanifestが残っていることを、資材bytesの取得確認として扱わない。外部backupは未確認である。

元VAE modelと既存固定Rect/F1/5frameの小bundleは残っている。資材不足は現在そのstream構成で新しい実行を行う条件の不足であり、固定source・入力・gateで完了した既存の実受入を未実施へ書き換える理由でも、全受入を繰り返す理由でもない。再取得・必要差分が生じた場合だけ、実資材照合とその変更境界を検証する。

新しい[generated fixture](generated-fixture/README.md)は別scopeの固定Rect `wan21-raw-f32-1x16x32`を用いる。今回完了したのは実Diffusion Hike復元、native codec保存読戻し、VAE descriptor受理まで。**新しいRect実NN decode・管理保存・実generated producerはこの文書ではNOT_RUN。** 後続の実測結果を別receiptとして追加し、既存mean/raw独立decode合格やfixture復元から推測しない。merge、Pages、LoRA全体実験、製品生成READYも本再利用索引の受入外である。
