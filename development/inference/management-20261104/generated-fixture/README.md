# Generated raw保存入力の接続fixture

**実生成ではないsynthetic fixtureを、実Diffusion Hike復元APIへ渡し、raw WKTとして保存・読戻しした証拠。NN decodeと管理経由実行はこの資料では`NOT_RUN`である。** 実NNの後続結果を空欄の成功として扱わない。

実装と再現手順は[generated-fixture.md](../../../../tools/inference/management-connection/generated-fixture.md)、既存VAE受入の再利用範囲は[REUSED-EVIDENCE.md](../REUSED-EVIDENCE.md)。ファイル単位のbytes/SHA-256は[index.json](index.json)に記録する。

| ファイル | 内容 |
|---|---|
| [normalized-generated.json](normalized-generated.json) | normalized meaning、marker、producer binding、context、payload識別、syntheticであることの明示 |
| [normalized-generated.f32](normalized-generated.f32) | 独立に作った128値、float32 little-endian、512 bytes。既存meanの改名ではない |
| [raw-generated.wktensor](raw-generated.wktensor) | 実Diffusion復元後の128値、1475 bytes、native generated raw契約 |
| [fixture-manifest.json](fixture-manifest.json) | 入出力descriptor、復元owner統計、Rect descriptor受理、既存asset receipt、未受入範囲 |
| [diffusion-source-acquisition.json](diffusion-source-acquisition.json) | 固定Diffusion sourceの実取得記録。11ファイル、123,082 bytes。各path/bytes/SHA-256と固定GitHub URL |
| [tests.json](tests.json) / [tests.log](tests.log) | 完了済み3試験の結果を保存したもの。今回の包装で再実行していない |

## sourceと責任境界

Diffusion配布・実行sourceは[`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`](https://github.com/Kushyameln01/kushyameln-works/tree/ffeeeedb6b57d182a977c3ac02c042ce235fc87a)。`origin/codex/diffusion-derived-hidden-heads`のfetch後、固定git objectからstatic import closureと専用WASMを実取得した。環境内の絶対pathだけを取得証拠にはしない。一方、新規GitHub HTTP取得や受領側ACKを実施したという意味でもない。receiptの各固定URLから同じbytesを取得して照合できる。

実ownerは`createGeneratedLatentSpace({wasmBytes,targetShape:[1,16,1,2,4]})`で作成し、`restore()`を1回実行した。WASM SHA-256は`8763d5ec82fd71e31597bb620729c5393383abed478395a2aaaf0d71f85a9b80`。数値復元はDiffusionが所有し、fixture helperとVAEへ重複実装しない。

HIGH/LOWのhashはsynthetic入力の契約検査用bindingであり、そのモデルの推論による値ではない。この事実は外側の`fixtureScope`に残す。native context/latentContractへ管理独自fieldは入れない。raw WKTは`wan21-raw-generated-sample:v1`、decoder VAE識別、元producer配列、Diffusion復元状態、contextを保持する。top-level normalizationはない。

復元前のgenerated normalized marker/producer配列は現在の共有WKT codecの保存対象ではないため、入力はJSON descriptorとF32に分ける。新しいnormalized generated WKT規格を実装したとは扱わない。復元後のraw WKTだけが既存codecを通る。

## 確認済みと保留

3試験では実Hike復元、全128値とnative metadataの保存読戻し、Rect VAE descriptor受理、非対応producer拒否、事前取消を確認した。取消時Hike呼出し0回、dispose後ownerのWASM memory参照0 bytes。成功時もworkspace消去とdispose後0 bytesを確認した。owner公開メモリ容量とRSS/GC/Worker/session終了は別であり、後者を今回測定したとはしない。

Rect decodeに必要な3資材のbytesはローカルstatと既存manifestに一致した。asset hashの出典は既存受入manifestであり、今回大きいgraphの全hashを再計算していない。これだけで管理環境への資材取得や実NN成功を示さない。

| 後続項目 | この包装時点の状態 |
|---|---|
| 保存rawからの実VAE NN decode | **NOT_RUN** |
| 管理の実APIによる受渡し・RGBとinputDescriptorの保存 | **NOT_RUN** |
| 実Diffusion producerのgenerated sample | **NOT_RUN** |
| LoRA付き全体運用、生成READY | **未受入** |

Text/VAE owner helperは基点`badff7a436b56207a084c4c770e01490899a576c`への未commit差分で試験した。試験した正確なfile bytes/hashを`tests.json`に記録し、後から配布commitを実行sourceとして偽装しない。最終配布SHA・PR・公開状態は親の報告で別記する。
