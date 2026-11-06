# Text memory return 5b0da96 — 取得と分類

2026-11-02 JST。Text担当の配布 `5b0da96b71708d56d3226a4bd4cb353aa30fbe3b`（Draft PR16、`codex/text-plain-memory`）を取得した。**固定plainのメモリ改善候補として別に受領し、既存P2のnative855/codec2bd、旧Text f76、P4固定入力と参照は差し替えない。**

[取得一覧](ACQUISITION.json) に固定Git URL、実bytes/SHA-256/Git blob、ownerの実行sourceと報告scopeを記録した。INDEXは2,868 bytes、SHA-256 `860c01f481ad68596b4820cf698c8727f4952e0fb22f6612dad8fef447061972` と一致。INDEXの14 fileすべてを実取得し、INDEX込み9,334,824 bytesを照合した。API文書・変更されたText loader・追加依存の3 fileも取得した。source本文・tensor・gzip本文は公開manifestへ重複同梱していない。

## 実受領したtensorと旧入力

新しい `runs/incremental/plain-conditioning.wktensor` は8,390,054 bytesを実受領した。receiptの記載だけで受領済みとは扱っていない。全体・payload・header・maskのhash、BLC `[1,512,4096]`、model/Tokenizer、512位置のmaskを確認し、原packetをそのまま保持した。

| identity | 旧f76 / P4固定入力 | 新5b0d / eab出力 |
| --- | --- | --- |
| whole SHA-256 | `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` | `ed9bb076172a9529e99594987a966646e70e48dd363a2584206d5ccc740552d3` |
| payload SHA-256 | `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7` | `6bb54eb36f06802f6ffa0b59edc2d515f24b5d40993a08a587348d9ee6537386` |

両者は別のbytesである。P4が固定したf76入力やcomposed参照を新しい出力へ自動的に結び直さない。旧f76の管理側原本も未変更のまま保持した。

## Ownerの固定診断報告

baseline実行sourceは `04d1447e3531836adbb013314e716f2403895443`、prepack停止だけの実行は `44b188633343cc2c93ea6f85aac348059ac42757`、最終実行は `eab4fabfadd133cc97434eed28ea998dca6795c2`。独立reference実行sourceは元5537を再利用し、新export・reference再計算0と報告されている。実行sourceと、参照artifactの配布f76を区別する。

Ownerは各run全2,097,152値を既存gate .001/.001でPASS、最終maxAbs `3.069639205932617e-6`、padding 2,084,864値厳密0、512 IDs/mask一致と報告している。24 session作成/解放、72 Tensor.dispose、full/cancelの2 Worker終了、owned live/zombie/errors0も元scopeで引用する。これはownerが行った数値検証の記録である。今回の公開verifyは管理側の数値演算やgate判定を実装せず、新しい推論を行わない。

3 gzipの圧縮bytesと展開後JSONのbytes/SHA-256（計20,627,437 raw bytes）を照合した。最終実行で報告されたsource22件は実行eabと配布5b0dのGit bytesに全件一致し、PEER-RECEIPTSの13原文も各元commitのbytes/SHA/Git blobに一致した。peer資料の取得は、新たな対向合意やP4数値受入を意味しない。

| Owner測定の固定plain full | baseline | 最終incremental |
| --- | ---: | ---: |
| sampled process RSS合計peak | 5,708,951,552 B | 4,490,174,464 B |
| 最大renderer RSS | 5,025,157,120 B | 3,795,189,760 B |
| ORT WASM capacity | 2,526,806,016 B | 2,191,261,696 B |
| 所要時間 | 117.2639 s | 388.5214 s |

Ownerの評価はRSS合計21.35%減、renderer24.48%減、時間3.313倍。prepacking停止単体ではRSSが増えて未達として保持されている。各一回の限定比較であり、sampled値をOS全体peakにしない。最終の実最大sample gapは約1.101秒、raw full complete PSSはnull。速度改善、全process 4GiB以内、一般端末や全工程の資源予算は未受入である。

## Source境界と保持するpins

新Text loaderは全量WebCrypto snapshotを既存incremental SHAの8MiB以下view更新へ変え、task yieldとsignal/dispose検査、ORT prepacking停止を加えている。元graphの全量read、全manifest SHA検査、ORT copyを維持するというowner仕様を確認した。共有loaderの変更はID経路にも及ぶが、新しい実数値・資源受入は固定plain一件に限る。

追加アプリES依存 `docs/shared/vr180/sha256.mjs` は6,970 bytes、SHA-256 `cbf39a47d19ef1a0a150ad5219dd8a49e2ee5fc67d2550640ce33c73d08da36c`。Text loaderの `../vr180/sha256.mjs` から同originで配信する必要がある。APIは `works-ai-1` を維持し、文書revisionはTEXT-MEMORY-1。今回この候補を管理runtimeへ採用・配置したわけではない。

VAE、VAE API、client、Workerの確認した4 fileは旧855と同じbytes。tensor codecは855内の旧bytesとは異なるが、既存f76/a42および別pin `2bdca59ea78580d4fe7a9d31a8de33209b64d029` と同じbytesであり、今回のmemory差分で新しく変わったものではない。native/API、保存codec、Text実行、artifactを一つのsourceへまとめない。

実媒体・slot・前処理後exact F/H/W、P5の実sampleと復元receiptに依存するVAE profile/raw decodeは未受入のまま。`generationReady:false` を維持する。新出力によるP4比較や共通snapshotへの採用は、必要なowner契約と別candidateの証拠で判断する。

## 読取り検証の再現

```sh
python development/ai-connection/p4-management/new-owner-returns/text-5b0d/verify.py --repo /path/to/kushyameln-works
```

実取得copyも確認する場合は `--acquired-root /workspace/work/ai-connection/p4-r11/text-5b0d` を追加する。verifyは固定Git bytes・gzip integrity・WKT header/mask metadata・peer/source identityを読むだけで、F32値を復号して数値判定する処理やproject moduleのimportを含まない。NN、reference生成、export、runtime編集、comment送信、commit・pushは行っていない。
