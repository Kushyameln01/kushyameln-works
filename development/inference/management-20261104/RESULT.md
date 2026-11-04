# Text／VAEの単体修正と管理部分接続

進行中。VAEのRect実管理部分接続は合格した。Textの全512有効IDは固定gate未達で、単体完成とは扱わない。以下の初回制御試験と、末尾の実NN結果は分けて読む。

- 実管理source：`e1661e561dfb1a4f20544ff48bc375175b5981d1`。
- 実Diffusion conditioning capture source：`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。
- Rect実管理NN source：`8594722e693bda9901f61cededfc1b3338e66c92`。Text倍率候補実NN source：`e03b920e539ebee0535403f0daf532791476ab50`。配布commitと実行sourceは区別する。

`node tools/inference/management-connection/test-bridge.mjs` は5/5 PASS。実native module factoryと実管理adapter／queue／capture／workspaceを使用し、モデルexecutorだけを制御fixtureへ置換した。詳細stdout／stderr／実行日時は [control/result.json](control/result.json) と同directoryのlogに保存した。新しいモデル推論0、export0。

1. Text plain／IDはnativeの別入力経路を通り、実保存full512 tensorの全2,097,152値、mask512件、model／Tokenizer、最終RMSNorm markerが管理captureへ保持された。
2. Rect encode／decodeの実API境界でcontextを保持した。契約fixtureの生成raw入力について、meanへの改名・VAE側復元なしでproducer2件とdecoder bindingを保持し、元raw WKT＋RGBを同管理packageへ保存・読戻した。RGBだけの保存は依存不足で拒否した。native inputDescriptor／bindingは外側traceで一致した。
3. sourceF4／消費F1／未使用末尾3のメタデータfixtureを現codec注入で保存・読戻しし、frameProcessingとsourceContextを保持した。これは新たなF4推論の数値受入ではない。
4. 既存の実full512 conditioningを管理保存・読戻し後、実Diffusion `captureP4Conditioning` へ渡した。全payload／全mask、model／Tokenizer、`metadata.nativeTensorMetadata.normalization` の一致とbufferの独立所有を確認した。投影・cross-attention・FFNは実行していない。
5. 実dispatch後の取消、過去target拒否、再実行とdisposeに加え、queue pump後・native dispatch前のmicrotask取消を検証した。この未dispatch経路のbarrier deadlockを修正し、native呼出0、quarantineなし、後続再実行を確認した。

制御試験はモデルの全値誤差gateを変更していない。native executor fixtureの返値一致はtransport／storageの検証であり、新しいNN出力の数値比較ではない。既存plain full512 fixtureの独立比較は `standalone-20261102/text/full512-conditioning/manifest.json` のscopeを再利用し、別の全512有効IDケースの合格へ転用しない。

既存Rect bundleとPNG mean／RGB参照、既存Text fixtureと独立参照は再利用した。81frame／source／参照画像の数値受入は[元scope](REUSED-EVIDENCE.md)で維持する。旧private stream資材は制御試験時に未取得だったが、その後[exact復旧](asset-recovery/README.md)を完了した。元source・model・依存版から既存資材だけを再構成し、全71件507,834,866 bytesの既存hash一致を確認した。新tracing/export準備は明示し、81frame NN・独立参照・実WASM受入を繰り返したとは記さない。

資源面では、制御試験の処理終端・共有lane・capture store残件0を確認した。実ブラウザWorker／ORT session／NNのピークRSS・時間はこの試験の対象外で、別の実ブラウザ結果に記録する。全体生成、実producerのgenerated sample、LoRA実験、merge、Pages公開は未受入である。

## 新規：VAEの実管理部分接続

[Rect実結果](rect/README.md)はRGB `[1,3,1,16,32]` とraw latent `[1,16,1,2,4]` を対象とする。実管理queue→実native API→実Worker→ORT/Hike WASM→管理保存読戻しを呼んだ。新encode mean全128値のmaxAbsは8.642673492431641e-7、同じ保存restored meanからの新decode RGB全1,536値は3.334134817123413e-6。元gate2e-5を満たした。

Diffusion自身の復元APIを一度だけ通したsynthetic generated sampleも、意味を変えずraw decodeし、元rawとRGBを同じ管理packageへ保存・読戻した。producer／decoder／復元状態は元rawに、inputDescriptor／bindingは外側traceに保持する。posterior meanへの改名、VAEでの追加復元はない。実P5生成sampleや、そのRGBの独立数値受入ではない。

取消はsession-created／run0の境界でWorkerを終了し、元Promise・管理release終端後に同じAPIから回復した。取消Worker内のfinally/releaseは観測していない。成功3Workerは各session1/1 release・active0。Worker4/4終了、最終live0。所有process20件を観測、4件をreapし、最終live/zombie各0。wall51.0577秒、標本browser群最大RSS1,584,381,952B／PSS1,308,856,320B。

初回e481実行はcanonical JSONのobject key順をharnessが誤比較したためFAILとして残す。構造比較へ直し、shape配列順序やhash変更は拒否する回帰試験を追加した。実管理APIを取得したowner環境の準拠hostでの合格であり、管理担当の別環境ACKではない。

## 新規：Text全512有効IDの調査

元独立oracle5954の最終referenceを復旧し、全24 checkpointと最終SHA `e1fc114f15240de2d39cd02b111dfebaa6621250e90543444659053a860c62a4` が元記録に一致した。旧WASM出力はmaxAbs0.0016480088233947754で失敗を再現した。gate0.001、ID0を含む合法入力域、元model／Tokenizer／mask／最終RMSNorm規約を維持する。

SDPA倍率候補は通常SDKで全24層を実行したが、maxAbs0.0017351508140563965で不合格だった。採用していない。[不合格原本](text/rejected-scaling-acceptance.json)は実行・codec・資源終了と数値gateを区別する。全2,097,152値を元独立referenceへ比較し、wall1,106.81秒、標本所有群peak RSS3,194,269,696B、session24/24 release・最終live/zombie各0だった。

内部RMSNorm局所試験では、Torchの実SumKernel dispatchがAVX2であることを固定sourceから確認した。実行source `08b4d32d83c81124f2b3bf6f3e2692bcff44238c`。block18/19/20の元入力を使い、各2,097,152値のsquare／正規化出力と全512 mean／inverseを比較した。source順FP32 cascadeは3件すべてbit単位で一致した。元ONNX正規化にはmaxAbs1.5974e-5／1.1206e-5／1.4067e-5の差があった。6 tiny sessionを全release、30 Tensorをdispose、active0。この局所一致だけで全24層の最終gate合格とは扱わず、両内部normへの反映を準備している。

既存plain／IDの合格は元graphのscopeを維持し、新graphへ無条件に転用しない。Textの実NNを管理経由で完了したとはまだ報告しない。初回制御5件に加え、graphBindingsの外側trace保存とcanonical JSON比較の回帰を追加した。graphBindingsをstrictなnative tensorへ混入させない。

## 未受入

管理読戻しの既定展開budgetは1GiBで、`read(bytes,{maxUnpackedBytes})`で設定できる。最小target81 package約396.6MBは構造上budget内だが、複数cloneを伴う管理81保存の資源・実行成功は未受入。native81の合格を拡張しない。

Text全512有効IDの最終gateと修正後の通常管理実行、管理大payload保存資源、実producerと復元receiptを使う最終decode、全体運用は残件である。LoRA送付・全体生成・merge・Pages公開は実施していない。基点の全Python52/53とLoRA公開台帳不整合は、接続fixtureの結果と分けて引き継ぐ。
