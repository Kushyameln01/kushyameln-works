# Textメモリ改善・実L512引渡し・VAE入力待ち

2026-11-02 JST。固定Hello worldのFile-backed診断で、sampled RSS合計peakは21.35%、最大renderer RSSは24.48%減った。一方、full時間は117.26秒から388.52秒へ3.313倍となった。メモリを減らす代わりに遅くなる実装であり、速度改善・一般prompt/端末予算の受入とはしない。RSS合計は4GiBを超える。実装・API・小証拠を作業branchで共有し、merge・Pages公開は行わない。

## 配布と実行source

配布SHAはこの文書の固定Git URL／Draft PR headで特定する。以下の実行sourceへ、後続の文書・証拠追加commitを付け替えない。

| 区分 | 完全実行source SHA | scope |
| --- | --- | --- |
| 新しい計測baseline | `04d1447e3531836adbb013314e716f2403895443` | 計測helper追加、Text runtimeは基点a42と同一 |
| prepack停止だけの候補 | `44b188633343cc2c93ea6f85aac348059ac42757` | 数値PASS、RSS改善は未達として保持 |
| incremental検証＋prepack停止 | `eab4fabfadd133cc97434eed28ea998dca6795c2` | 今回の固定plain数値・メモリ受入 |
| 再利用した独立full512 oracle | `5537b8932343aa2476b95191817e8913f99dab02` | 既存PyTorch reference。再計算0 |

基点配布は `a42ad61a7f56667ceefb4f21a9aacde859e00538`、元conditioning配布は `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`。管理P2は884/observer e150、native VAE855/mean owner5f/codec2bdの元記録を保持する。最新の管理受入とDiffusion取得ACKは[PEER-RECEIPTS.json](PEER-RECEIPTS.json)へ結んだ。新しいText実行を、元P2・元f76 data・Diffusionの数値実行へ加算しない。

## 実装・API差分

`works-ai-1`、plain `[1,512,4096]`／ID `[1,L,4096]`、mask、model/Tokenizer識別、元graph・重み・Hike最終RMSNorm・epsilon1e-6・元比較gateは維持する。変更は共有staged loaderへ適用されるため、ID入力にもロード方針は及ぶが、今回の実数値/資源受入は固定plain一件に限定する。

1. ORTの一度ずつ使うsessionで `extra.session.disable_prepacking='1'` を指定する。graph optimization既定all、WASM1thread、同時session上限1は維持する。
2. 約772MBのgraphを全量WebCrypto digestへ渡す検証を、既存 `shared/vr180/sha256.mjs` のincremental SHAへ変更した。8MiB以下のsubarray viewごとに更新し、task yieldとload/run signal・dispose検査を行う。全byteの元manifest SHA検査を維持し、末尾の破損もORT前に拒否する。
3. graph全体の読込みとORTへの全量コピーは残る。8MiBはhash更新viewの上限であり、モデルを8MiBだけ読む方式ではない。小さいembedding rowのWebCrypto検査は変更しない。

新しいアプリES依存は `shared/vr180/sha256.mjs`。既存repoのbyte同一実装を再利用し、新しい暗号実装・外部依存は追加していない。モデルのconfigure/files Mapは変更しない。sourceを複製するhostは同originでこのmoduleも配信し、source closureへ含める必要がある。新Text moduleを使うappの静的importは実Chromiumで確認した（NN/Worker0）。旧P2の固定native855 hostを一括置換しない。[API](../../../docs/shared/inference/API.md)の文書revisionはTEXT-MEMORY-1。

## 原因の切り分けと実測

約771,822,917B×24graphを読む。元6,735,906,897BのUMT5原本は実Fileで保持し、今回のembedding読込みは有効3tokenの3×8192B。active hiddenは49,152B、出力は8MiB、row-hash表は8,204,288B、finalNormは16,384Bで、大容量graphとは区別した。configureのFile Mapはhandle保持であり、API disposeで解放する。File-backed測定を巨大Uint8Array Mapのstructured-clone負荷へ一般化しない。

baselineとprepack停止だけの候補はいずれも、約772MB graphのdigest区間でRSS peakになった。ORTはJSのgraphをWASMへコピーし、session releaseでsessionは解放しても、runtimeの拡張済みWASM容量はWorker存続中に縮まない。prepack停止だけではWASM容量と時間が減ったが、RSSは増えた。その候補を高RSS改善と認定せず、残るhash入力snapshotの境界へ対処した。

| full診断の実測 | baseline04d | prepackのみ44b（RSS未達） | 最終eab |
| --- | ---: | ---: | ---: |
| RSS合計peak B | 5,708,951,552 | 6,007,259,136 | 4,490,174,464 |
| 最大renderer RSS B | 5,025,157,120 | 5,330,010,112 | 3,795,189,760 |
| 最大renderer PSS B | 4,989,235,200 | 5,293,516,800 | 3,758,624,768 |
| ORT WASM拡張容量 B | 2,526,806,016 | 2,191,261,696 | 2,191,261,696 |
| full秒 | 117.2639 | 101.6631 | 388.5214 |
| 取消秒 | 8.7556 | 8.5418 | 25.4765 |
| 全helper秒 | 131.6699 | 115.6597 | 419.9150 |

読込みは最終runも30calls/18,536,543,569B、ORTへ渡したmodelは24件/18,523,750,008B。全26manifest hash（norm・row表・24graphs）をincremental検査し、graph各93更新・全771,822,917B・最大8,388,608Bの連続範囲を確認した。synchronous hash updateの実測合計は244.113秒、yieldを含むhash区間合計256.761秒だった。WebCrypto全量snapshotを避けたことと引き換えのCPU時間増加を隠さない。Chrome内部の正確なcopy枚数やGC解放時点は測定していない。

各1回ずつ、同じinput/graph/manifest/Tokenizer/reference/gate、Chromium154、ORT1.24.3/1thread、CPU4core quota、16GiB cgroup・8GiB task budgetで直列実行した。RSS/PSS samplerと `plain_memory.mjs` は同一で、最終runには新hashの観測hook・固定module route/source proofが追加されている。計測source全体がbyte同一とは表現しない。OS file cache/GCは強制・同一化しておらず、一般benchmarkではない。

50msは待機設定で、sample取得時間を含む実最大gapはbaseline0.630秒、最終1.101秒。短いpeakを見落とし得る。RSS和には共有pageの重複があり、WASM capacityをresident RAMやallocator liveへ読み替えない。rawのfull/cancel完全PSSはnullで、startupの完全PSS値をfullへ流用しない。SUMMARYには、各sampleのrow RSS和がgroup RSSと等しく、非zero RSSの全rowへPSSがある条件で導出した「観測resident集合PSS和」も別名で記録した（最終peak4,208,209,920B）。未読0RSS/transient process等を除く観測集合であり、OS/端末全体RAMの認定ではない。

## 新規数値・終了検証

元の独立PyTorch full512 reference `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9` を再利用し、元gate `maxAbs=atol=rtol=.001` を維持した。最終runは全2,097,152値PASS、最大絶対誤差 `3.069639205932617e-6`、全512 IDs/mask一致、padding2,084,864値は厳密0。Text最終正規化は実Hikeで行い、投影/cross/FFNは追加していない。

最終WKT全file SHAは `ed9bb076172a9529e99594987a966646e70e48dd363a2584206d5ccc740552d3`、payloadは `6bb54eb36f06802f6ffa0b59edc2d515f24b5d40993a08a587348d9ee6537386`。prepack停止候補の出力とbyte同一だが、元f76の `90f9aed…` とは異なる。元f76を新しい値やsourceへ上書きせず、別artifact・実行receiptとして保存した。双方とも元independent gate内であり、model/Tokenizer hashを便宜的に付け替えていない。

各runで24session作成/release、最大同時1、72Tensor dispose、fullとblock1後取消のWorker2/2終了を確認。取消を正常推論として数えず、対象Promise終端とclient cancelled/disposedを確認した。helperが起動した子processをPID/ctimeで観測・回収し、終了live0/zombie0/errors0、全helper exit0。途中のzombie観測と最終残存は別に記録する。Worker終了直後のOS RAM即時回収や未観測の短命fork全件監査は主張しない。

小fixtureでは旧runtimeの既存5PASS/新4FAILから、incremental版9PASSへ変化した。9MiBの独立SHA、全viewと末尾破損、task取消/disposeのORT前停止を確認した。既存SHA11、接続契約12、plain checker/late-failure6もPASS。これは実モデル数値とは別の38件であり、新Profile受入やP4消費へ加算しない。[検証境界](validation/incremental-hash-controls.md)、[module-only browser smoke](validation/browser-smoke.json)、[機械可読比較](SUMMARY.json)。

## 実L512・Profile・P5の残件

管理は既存P2を固定Rect診断scopeで受入済み。Diffusionは元f76実L512の27files/17,083,779B取得とcapture/snapshot/owned copyを確認した。最新の実L512 consumer入口・独立参照・事前gateも提示され、Diffusion担当の数値試験が進行中である。今回の新Textメモリ出力へ入力を無断で差し替えない。Text最終RMSNormは当方、4096投影/cross-attention/FFN/P4 referenceとgateはDiffusionの責任を維持する。

管理からの実媒体・slot・前処理後exact F/H/W、P5実generated raw sampleとDiffusion所有の復元receiptは、取得したscopeにまだ提示されていない。[必要入力と不足Profileの差分](PROFILE-READINESS.md)へ記録し、相手へ確認依頼済み。診断Rectやworkflow設定gridを代入せず、依存するexport/実WASM/profile受入だけを保留する。今回のVAE推論・Profile export・Text export・oracle再計算は0。

新規の実plain fullは3件、取消は3件。既存P2/N2/ID/LoRAの合格を新source・新Profileへ移さない。実P4共同数値、正確な媒体依存Profile、P5実sample復元・raw decode・管理保存、全有効512token/別prompt/encodeIdsの新数値・資源、速度改善、全工程/利用端末予算は未受入。generationReadyはfalseのまま。再現は[REPRODUCE.md](REPRODUCE.md)、証拠file一覧は[INDEX.json](INDEX.json)。
