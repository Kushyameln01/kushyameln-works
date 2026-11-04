# Text／VAEの単体修正と管理部分接続

今回の単体修正と管理APIによる部分接続は合格した。Textの全512有効ID不一致を解消し、長文plainと管理経由plain／IDも独立参照へ全値比較した。VAEは既存単体証拠を再利用し、Rectの新しい管理encode／decode／保存を受け入れた。全体運用の受入とは分ける。

- 実管理source：`e1661e561dfb1a4f20544ff48bc375175b5981d1`。
- 実Diffusion conditioning capture source：`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。
- Rect実管理NN source：`8594722e693bda9901f61cededfc1b3338e66c92`。Text全512有効IDは `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`、長文plain／管理Textは `78954ee92d1b76c6652f50df1668159a55db6dc9`。配布commitと実行sourceは区別する。

初回の `node tools/inference/management-connection/test-bridge.mjs` は5/5 PASS。実native module factoryと実管理adapter／queue／capture／workspaceを使用し、モデルexecutorだけを制御fixtureへ置換した。詳細stdout／stderr／実行日時は [control/result.json](control/result.json) と同directoryのlogに保存した。後段で3件の回帰を追加し、現在8件が合格している。新しいモデル推論0、export0。

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

内部RMSNorm局所試験では、Torchの実SumKernel dispatchがAVX2であることを固定sourceから確認した。実行source `08b4d32d83c81124f2b3bf6f3e2692bcff44238c`。block18/19/20の元入力を使い、各2,097,152値のsquare／正規化出力と全512 mean／inverseを比較した。source順FP32 cascadeは3件すべてbit単位で一致した。元ONNX正規化にはmaxAbs1.5974e-5／1.1206e-5／1.4067e-5の差があった。6 tiny sessionを全release、30 Tensorをdispose、active0。

この集計順だけを両内部norm×24層へ反映し、通常SDKをsource `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3` で実行した。[全値受入](text/norm-accepted/README.md)は2,097,152値のmaxAbs8.52346420288086e-5で、元gate0.001を満たす。元model／Tokenizer／mask／最終RMSNorm marker、codec保存読戻しを保持した。session24/24 release、Tensor72 dispose、active0、最終live/zombie各0。wall1,142.75秒、標本所有群peak RSS3,909,136,384B。metadata置換用のgraph1コピーが資源増加に含まれる。ブラウザ／管理実行とは別scopeである。

採用manifestは[中立status版](text/source-ordered-fp32/README.md)。受入実行manifest40afd…からstatus24件だけを変え、全24の元asset・実行graph bytes/SHA・gateは同一と確認した。採用後も独立参照・品質receiptを通常入力の必須条件にしない。異block混成等の未実行構成へ数値受入を拡張しない。

既存plain／IDの合格は元graphのscopeを維持し、新graphへ無条件に転用しない。初回制御5件に加え、graphBindings、任意evidenceの外側trace保存とcanonical JSON比較の回帰を追加した。現在の制御8件、manifest mapping6件、取消境界2件が合格。graphBindingsや管理情報をstrictなnative tensorへ混入させない。

## 新規：採用manifestでのplainと管理実行

source `78954ee92d1b76c6652f50df1668159a55db6dc9`、採用manifest `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405` を使用した。

- [長文plain](text/plain-long-accepted/README.md)：EOS込み512token・mask全512有効、全2,097,152値のmaxAbs0.000151902437210083。元gate0.001を満たし、保存読戻しでmodel／Tokenizer／最終markerを保持。Node SDKのwall1,417.20秒、標本所有群peak RSS3,960,307,712B、全session終端・所有process live/zombie各0。
- [管理ブラウザ](text/managed-accepted/README.md)：固定`Hello world`のplainと、その同じ512 IDs／binary maskを別API経路で実行。両出力は `[1,512,4096]`、mask512件のうち3有効。各全2,097,152値のmaxAbs2.4437904357910156e-6で元gate0.001を満たす。両WKTはbyte一致し、SHA `6be07864f6c92601b689bfa69e0c4ddc870fdc3be4dc719f3d9c611ec4c1f101`。通常ID契約は入力Lによる `[1,L,4096]` のままである。

管理capture→workspace保存→読戻し→実Diffusion P4 captureで全data／mask／model／Tokenizer／最終RMSNorm、24 graphBindingsを保持した。内蔵verification flagsを上書きせず、4096→5120投影／cross-attention／FFNは実行していない。新長文L512 payloadについても、固定helper `941b2a6e3e956d000a3339ae05c0ef84aafed47e` により実FFE capture／snapshotとbuffer独立性を別途確認した。

管理取消はnorm execution hashのblock0／offset0で発火し、ORT session作成前のWorker終了、元Promise・管理release終端後のplain回復を確認した。成功2Workerは各session24/24 release・Tensor72 dispose・active0。全Worker3/3終了、所有process22件を観測し4件reap、最終live/zombie各0、HTTP/page/console/blocked request各0。APIとstoreはdispose済み。

ブラウザ内処理と保存まで2,036.03秒、controller全体3,312.82秒。後者には大量の診断観測JSONの受信・後処理を含む。長文Node試験と並行したため、この時間やPSSを単独の速度比較に使わない。browser群の標本peak RSS5,344,391,168B／PSS4,945,536,000B。元269,180,893B reportはSHAを保ったlossless gzipへ保存した。原本取得のための再推論は行っていない。

全512有効ID payload・採用manifest・APIはGitHub固定789 URLから[取得確認](recipient-acquisition/README.md)を行った。後から得た長文plain／管理payloadの公開取得確認とは区別する。これはownerによる取得照合で、他担当の別環境ACKとは区別する。通常入口へ固定prompt／payload hash／品質receiptを条件として追加していない。

追加で、pushした固定744の新長文／管理WKTとAPI／HANDOFF本文を[公開URLから取得照合](final-acquisition/README.md)した。各実bytes／SHAは同じ固定Git blobに一致した。これは取得確認で、モデルNN／export／相手環境のACKではない。

診断観測の重複は[lossless NN0 replay](text/managed-accepted/diagnostic-replay/replay-receipt.json)で別に改善した。全18,550観測の全field・順序hashと非観測fieldを保ち、JSON269,180,893→5,359,171Bへ減らした。新しいNN実行時間や推論RSSの改善結果へは拡張しない。最終の変更境界試験は[verification](verification/README.md)、受取手順・契約は[HANDOFF](HANDOFF.md)を参照する。

## 未受入

最終の[対向契約照合](CONTRACT-CHECK.md)では、Diffusion48ffのstrict通常P4が依然 `encoder-final-rmsnorm` を要求し、実Textの `umt5-final-rmsnorm-f32-v1` を拒否することを確認した。FFE captureで実markerを保持できることと、この通常入口で受理できることは別である。Text側・管理側でmarkerを改名せず、Diffusion ownerの正式な受理契約と実装を残件にする。

今回の実管理経路は `createTextVaeAdapter`＋queue＋capture＋workspaceを注入したbridgeである。管理5ab／a543はe166の祖先だが、別の `normal-vae-owner` facadeを使った新しい実NN受入と同一には扱わない。相手環境での当該facade実行は未受入である。

管理読戻しの既定展開budgetは1GiBで、`read(bytes,{maxUnpackedBytes})`で設定できる。最小target81 package約396.6MBは構造上budget内だが、複数cloneを伴う管理81保存の資源・実行成功は未受入。native81の合格を拡張しない。

管理大payload保存資源、実producerと復元receiptを使うtarget最終decode、実媒体slotを含む全体UI運用、他担当の別環境ACKは未受入。実装の対応域はText ID L1..512／plain L512、VAE N1・F1..81・H/W16..848の16倍数（decode T1..21・h/w2..106の偶数）。この構造的対応域と選定した数値試験を区別する。範囲外は対応graph／profileが必要で、無断padding・縮小・frame削減は追加しない。

LoRA送付・全体生成・merge・Pages公開は実施していない。全体接続の実装完了や生成READYは宣言しない。基点の全Python52/53とLoRA公開台帳不整合は、接続fixtureの結果と分けて引き継ぐ。
