# 管理部分接続：制御・保存境界

この資料の初回結果はNNなしの制御・保存境界である。実モデルの管理経由実行は `run-browser.py` の別結果を参照し、この試験だけで完了扱いにしない。

- 実管理source：`e1661e561dfb1a4f20544ff48bc375175b5981d1`。
- 実Diffusion conditioning capture source：`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。
- owner側の配布／実行source完全SHAは、rootが固定commitした後の引継ぎに記載する。未commitの作業treeを固定sourceと呼ばない。

`node tools/inference/management-connection/test-bridge.mjs` は5/5 PASS。実native module factoryと実管理adapter／queue／capture／workspaceを使用し、モデルexecutorだけを制御fixtureへ置換した。詳細stdout／stderr／実行日時は [control/result.json](control/result.json) と同directoryのlogに保存した。新しいモデル推論0、export0。

1. Text plain／IDはnativeの別入力経路を通り、実保存full512 tensorの全2,097,152値、mask512件、model／Tokenizer、最終RMSNorm markerが管理captureへ保持された。
2. Rect encode／decodeの実API境界でcontextを保持した。契約fixtureの生成raw入力について、meanへの改名・VAE側復元なしでproducer2件とdecoder bindingを保持し、元raw WKT＋RGBを同管理packageへ保存・読戻した。RGBだけの保存は依存不足で拒否した。native inputDescriptor／bindingは外側traceで一致した。
3. sourceF4／消費F1／未使用末尾3のメタデータfixtureを現codec注入で保存・読戻しし、frameProcessingとsourceContextを保持した。これは新たなF4推論の数値受入ではない。
4. 既存の実full512 conditioningを管理保存・読戻し後、実Diffusion `captureP4Conditioning` へ渡した。全payload／全mask、model／Tokenizer、`metadata.nativeTensorMetadata.normalization` の一致とbufferの独立所有を確認した。投影・cross-attention・FFNは実行していない。
5. 実dispatch後の取消、過去target拒否、再実行とdisposeに加え、queue pump後・native dispatch前のmicrotask取消を検証した。この未dispatch経路のbarrier deadlockを修正し、native呼出0、quarantineなし、後続再実行を確認した。

制御試験はモデルの全値誤差gateを変更していない。native executor fixtureの返値一致はtransport／storageの検証であり、新しいNN出力の数値比較ではない。既存plain full512 fixtureの独立比較は `standalone-20261102/text/full512-conditioning/manifest.json` のscopeを再利用し、別の全512有効IDケースの合格へ転用しない。

既存Rect bundleとPNG mean／RGB参照、既存Text fixtureと独立参照は再利用した。81frame／参照画像の既存受入を再試験・再exportしていない。stream graphの旧private `/tmp` 資材は現環境で未取得であり、この制御試験の成功から資材保有や全域実行可能とは扱わない。

資源面では、制御試験の処理終端・共有lane・capture store残件0を確認した。実ブラウザWorker／ORT session／NNのピークRSS・時間はこの試験の対象外で、別の実ブラウザ結果に記録する。全体生成、実producerのgenerated sample、LoRA実験、merge、Pages公開は未受入である。
