# P2 Diffusion Rect mean接続結果

2026年10月31日 JST。新実行計画 `1.0-draft.1` とProfile台帳の固定source `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` に基づく、**Diffusion担当部分の候補検証**。既存のRect kernel/guard/APIを変更せず、実VAE保存meanを管理の実adapter・queue・capture/packageとDiffusionの実Worker/Portへ接続した。

P1規範runtimeの採用、管理UI全工程、VAEの新たなdecode、生成sampleの受入は含めない。LoRAをmean処理の通過点に追加していない。`load/predict/sample=NOT_READY`、E8=BLOCKEDを維持する。

## 固定sourceと再利用

| 対象 | 固定source / 照合 |
| --- | --- |
| 管理の実code | `28596717182e48aeb23c719c51b6e593edf4e496` の `adapters/{artifacts,core,diffusion}.mjs`、queue/package/canonical/descriptor等。HTTPで実際に読んだbytes/hashとGit blobを `green/result.json` に保持 |
| VAE codecと実mean | `855f435120f08eb9e818e51281fc26f0e2633829` の `docs/shared/inference/tensor.mjs`、`development/inference/e6/fixtures/png-mean.wktensor` とbundle manifest |
| VAE855実mean | file SHA `6539204ef61dc0f706238b74e2bcabf8bbcce971f5056d0b0d7e288811516b71`、payload SHA `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`、contextなし |
| 既存受領Rect mean | file SHA `8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8`。宣言した診断contextが付くためfile hashは異なるが、payload bytesはVAE855と厳密同一 |
| 既存独立参照 | `development/ai-connection/e6/reference-received.json` / `RECT-RESULT.md`。同一payloadの128値normalize/restoreと事前往復gateを再利用 |
| 変更差分 | VAE `tensor.mjs`、`vae.mjs`、`vae-api.mjs` は7e091→855で全bytes同一。`source-acquisition.json` に各hash/長さを記録 |

Diffusionは現worktreeで読んだowner sourceとWASMの実bytesを全HTTP要求ごとに記録し、基準Git commitとの差も保持する。最終BUILD_IDは `green/result.json` / `green/receipt.json` が正本。5fの既存証拠へ新実行を付け替えず、候補の新receiptとして扱う。

## Rect専用の数値経路

- native profileは `wan21-raw-f32-1x16x32`、float32 NCTHW **`[1,16,1,2,4]`**、128値。model hashはVAEの `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。
- 正常経路の入口で `requireWanRawLatentRect` を使う。RPCの既存 `normalizeRawMean/restoreRawMean` をexact Rect shape/profileへ渡し、固定hostが **`NormalizeRawMeanRect/RestoreRawMeanRect`** へrouteする。旧F5 guardは拒否試験だけに使い、正常入口として代用しない。
- Hike ABIは `wan21-raw-mean-f32-v3`、kernel SHA `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d`。channelはfloor(i/8)、source順のf32差→積→除算、逆変換の積→除算→加算を維持する。
- 独立Python `struct` のf32 oracleをbrowser実行前に固定し、normalize/restore **全128値厳密一致**。往復gateは前もって **maxAbs≤2e-6**。観測maxAbsは `2.384185791015625e-7`。このgateをF5・大shape・generated sampleへ転用しない。
- normalized payload SHAは `4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5`、restored payload SHAは `71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063`。

## 新たに検証した境界

実Chromiumの5case群がPASS。`green/result.json` に実build、WASM evidence、入出力hashと実requestを記録した。別reviewerも同じharnessを独立に実行して5case PASSを確認した。

1. **実Rect mean→管理保存→live正規化→管理保存→live復元→管理保存**。管理の実 `createDiffusionAdapter` と `createInvocationQueue` が明示native input `{tensor}` を渡す。snapshotはnull、診断専用registryとして扱う。
2. **明示MessagePort**。実Worker/Hikeで全128 normalized値を照合。caller配列を変更・detachせず、結果は独立所有buffer。終了時に両Portを閉じ、未終端requestがないことを確認。
3. **metadata保全**。元実meanのcontext不在を維持する。別のmetadata宣言fixtureでは既知frame番号 `[9,2,9]` と時刻 `[0.9,0.2,0.9]` の順序・重複をHike/codec/package越しに保持する。この宣言を元実媒体の真正性証明にしない。任意の未知metadataは外側のnamespaced extensionへ置き、順序・重複を保持する。
4. **拒否**。同128値の不適合shape、F5 profileId、generated meaning、未知のnative context fieldを拒否。padding、reshape、meanへの改名を行わない。
5. **取消と寿命**。実queue→owner adapter→APIが所有Workerだけを取消。取消ACK、元Promise終端、結果不採用、calculationStopped、resourceReleased、reusableを別にassertし、次jobでWorkerを再生成して全値一致を確認。最後はstore参照0、queue非quarantine/idle、queue/adapter/Worker disposal完了。

`transformEdges` と各package traceに、同じchainIdに対する **入力artifactId/payload hash → 実operation/job/build → 出力artifactId/payload hash** を保存した。3artifactを並べただけで未実行edgeを成立済みとする形式ではない。

G1C codecはoptional `normalization` markerをnative fileへ保存しない。normalized meaningは版付きのまま保存/読戻しし、ownerの元tensor metadata（markerを含む）は外側evidenceへ保持する。codec表現とowner応答を別に記録し、normalizedをrawへ改名しない。restoreは現ownerの「marker省略可、あれば一致」の契約に従い、保存済みnormalized payloadを実変換する。

## 再現と共有物

```sh
git fetch --no-tags origin 855f435120f08eb9e818e51281fc26f0e2633829
git fetch --no-tags origin 28596717182e48aeb23c719c51b6e593edf4e496
python tools/diffusion-models/p2-rect-browser.py --output /tmp/p2-rect-repro
```

Playwrightと`/usr/bin/chromium`を使う。loopback HTTPへ固定codeと小fixtureを提供し、外部requestを拒否する。model graph・巨大重み・原本の暗黙downloadはない。必要なsource Git objectがない場合はその取得だけを行い、別commitの同名fileで代用しない。

`--diffusion-commit 438972f30242e0a3bc66edb8591f38eaa0fcd384` で旧採用版を指定すると、Rect専用guard非exportでREDになる。記録は `red-baseline/result.json`。これは旧438のF1/旧F5合格を否定する結果ではなく、追加Rect境界の差分である。

主な成果は `green/{result,receipt,reference}.json` と `green/package/`。packageには実writerが生成し、実readerが回収したraw/normalized/restored meanとmetadata fixtureのWKT、descriptor、evidence、trace、extensions、snapshot=null、manifest/receiptを保存する。raw model weight payloadやprivate base artifactは含まない。

## 未受入と次担当

- 管理のnorm catalog runtime採用、generic connected-edge包装、UI全工程、候補entryの製品採用は管理担当との別受入。今回は既存adapterの明示 `{tensor}` input経路だけを使用した。
- **新restored mean→VAE raw decode** は未実行。855の記録済みRGBは元raw mean payloadを入力としたもので、新restored payloadとはhashが違う。既存RGBを新restoreのfresh decodeへ付け替えない。VAE担当は `restored-real` artifact、同じRect profile/decoder binding、事前gateを受け取り、そのdecodeとRGB保存のedgeを検証する。
- 128要素の数値live/bufferは小境界の証拠。pointwise上限1,048,576と3つのmean ABIを変えておらず、本番latent2,096,640要素や81frameの資源条件は未成立。
- generated producer/復元/decode、全native sessionのsnapshot、predict/sample、元GPU精度と端末負荷改善はこの結果から受入へ昇格させない。
