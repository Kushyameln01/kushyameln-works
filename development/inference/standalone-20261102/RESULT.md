# Text / VAE 単体検証結果

この記録は作業途中の固定証拠をまとめる。Text T1–T3、VAE V1–V4を個別に判定し、単体完成、モジュール間接続、製品生成READYを分ける。未完了caseを既存の小shapeや別promptの合格で補わない。

## 配布と実行source

配布branchは `codex/text-vae-standalone`、基点は `498eb25f027666e3cc661a5851288e4aabf39f0a`。初回push済みSHAは `3ea4ca34d50aef0da434985965b0b01105bbb8d8`、[Draft PR #18](https://github.com/Kushyameln01/kushyameln-works/pull/18)。その後も検証・実装を継続しており、最終配布SHAとpush後の取得照合は終了時に別記する。ここに記載したsource SHAは実際に各runへ渡したものを保持する。

| 作業 | 完全source SHA |
| --- | --- |
| Text9case独立参照 | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` |
| VAE69-unit export | `a7573012e98b6b94ad2c56788b4c14907f262201` |
| Text512 canary | `5e6ebe212ca3c079f5d4cf65cf3fd24c4bc6f97f` |
| VAE16×32単体受入 | `37c269aefe6e829ea1bff35019e19c472273813c` |
| VAE F1・480×832単体受入 | `e0f0dd7cae05aebcfc60214d51fce90df6197ab7` |
| Text SDPA演算診断 | `05198dba7959cc95e0c4d770fd85557ad4010a80` |
| Text全24層参照checkpoint照合 | `79d62327b47056fff0e3f8d5ea0ebd2e183048c3` |
| Text全24層native局所/伝播trace | `79d62327b47056fff0e3f8d5ea0ebd2e183048c3` |
| VAE threads4小規模実WASM | `e5e954ac8faa304c5e90b469970b6fd7940d8c08` |
| VAE threads4・F5診断と参照寸法境界 | `cc9b37f82ed855b36261d92429a822528bc24a71` |
| VAE明示threads1/4実装 | `bcb3274e3ab31d51910c40064cb895ac6ab667f0` |

原本はUMT5 SHA `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、VAE SHA `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。VAE独立参照sourceはWan commit `9737cba9c1c3c4d04b33fcad41c111989865d315`、`wan/modules/vae.py` SHA `4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498`。係数hashを付け替えて別modelと互換扱いしていない。

## Text T1–T3

**Textの単体数値受入は未完了。** 独立参照9caseの作成とNN0の入力照合は完了した。512有効tokenの実WASM canaryはgateに不合格であり、残る数値case・取消復帰suiteを完了扱いにしない。

| 新規検証 | 結果・scope |
| --- | --- |
| T1 NN0 preflight | 9 valid / 9 reject、Python/browser Tokenizer ID・mask・overflow・混在入力を確認。Worker/NNなし |
| 9case独立全値参照 | PASS。各caseを未短縮batch1/full512で24 source blocksに通し、最終norm・masked zero後に必要なID出力Lへslice。275.989秒、source RSS peak2,373,406,720 B |
| `id-l512-all-active` 実WASM | 24層・全2,097,152要素がfinite。maxAbs **0.0016480088233947754**、固定maxAbs/atol/rtol0.001を超過、allclose=false。462.204秒 |
| bucket / 最終norm切り分け | bucket全262,144要素は一致。単一final norm倍率だけで差を説明できない。合格へ読み替えない |
| block0 / SDPA診断 | default sourceはTorch CPU FLASHと一致。ONNX最適化無効化・unscaled T5演算への置換は誤差改善が小さく、製品変更の根拠として採用しない |
| 全24層native局所/伝播trace | 診断実行完了。実Node ORT WASMの最終出力は失敗Chrome canaryとbitwise一致、固定gateは引き続き不合格。836.691秒、Node process RSS peak3,215,273,984 B |

失敗canaryのgroup sampled RSS sum peakは4,520,603,648 B、complete PSS sum peakは4,238,017,536 B。RSSの共有page重複を含み、PSSへ加算しない。観測した24 sessionはcreate/run/releaseが各24、Tensor dispose72。browser/local server終了後に観測owned live process・zombieは残らなかった。実行途中に観測したzombieと回収記録は保持する。

canaryは全512位置有効でID0も合法入力である。gateを緩める、ID0を禁止する、入力を差し替える、参照backendを合格に合わせて選び直す処置はしていない。全24層のsource checkpointは既存5954参照と全digest・最終全値が一致した（108.860秒、process RSS peak1,710,813,184 B）。native traceは各層でnative直前出力と同一source直前出力を別々に渡し、局所演算差と伝播差を分離した。18〜23層では局所差に比べ伝播差が大きく、最終8要素がmaxAbs0.001を超過した。単一の修正原因が確定したとはせず、製品の数値実装は変更していない。

native traceは24 sessionをcreate/releaseし、同時active最大1・終了時0、実run47回・Tensor dispose141回。診断を実行できたことを表す `passed:true` と、数値受入の `finalFixedGatePassed:false` を区別する。source checkpoint/native traceはVAE target81独立参照CPU2と並行しており、時間は専有条件の性能比較ではない。残る7caseと9controlsは、後述の資源停止を受けて直列実行へ切り替えた。未完了分の合格は先取りしない。

Textの既存Hello world、選択manifest、Tokenizer、独立参照、最終Hike正規化、P2/codec成果は元scopeで維持する。今回の9case合格へ流用しない。graphの再exportと全9case参照の再推論は行っていない。

## VAE V1–V4

**新stream runtimeは下記caseを受け入れた。81frameと参照848×848の単体受入は未完了。** encodeと独立raw latent decodeは別入力で比較しており、encode meanを生成sampleへ改名していない。

| 実WASM case | encode全値 maxAbs / 要素数 | 独立raw decode全値 maxAbs / 要素数 | 通常処理時間 |
| --- | --- | --- | --- |
| F1・16×32 | 7.152557373046875e-7 / 128 | 5.662441253662109e-7 / 1,536 | encode3.212秒、decode2.758秒 |
| F1・480×832 | 1.6689300537109375e-6 / 99,840 | 2.1904706954956055e-6 / 1,198,080 | encode164.829秒、decode243.850秒 |
| threads4・F5・16×32診断 | 1.430511474609375e-6 / 256 | 1.519918441772461e-6 / 7,680 | encode4.618秒、decode7.450秒 |
| threads4・F1・16×16参照境界 | 7.152557373046875e-7 / 64 | 5.066394805908203e-7 / 768 | encode8.000秒、decode8.211秒 |
| threads4・F1・16×848参照境界 | 1.1920928955078125e-6 / 3,392 | 1.8775463104248047e-6 / 40,704 | encode14.893秒、decode14.509秒 |
| threads4・F1・848×16参照境界 | 9.5367431640625e-7 / 3,392 | 1.4603137969970703e-6 / 40,704 | encode9.261秒、decode16.694秒 |

新domain用gateは比較前に固定したatol/rtol/maxAbs0.002。いずれも全要素finite・allclose・global maxAbsに合格し、WKT保存/読戻しで全値とmetadataが一致した。小profileの過去gateを後付けで大shapeへ転用していない。参照inputは明示した合成RGB・独立raw latentであり、取得できていない実媒体の代用を実媒体受入とは表記しない。

F1・16×32では最初の実chunk完了後の取消、同一APIの通常再実行、再configure、dispose、保存読戻しを確認。F1・480×832は通常encode/decodeを実行した。各runのencode session39/39 release、decode49/49 release、最大active1、終了時active0。両runともbrowser終了後の観測owned live/zombieは0。強制cancel時のinner finally実行までは主張しない。

threads4・F5・16×32は別scopeの継続cache診断であり、target81の代わりにはしない。正常encode/raw decode、最初のchunkで取消、同じAPIで再実行、保存読戻し・現codec metadataが合格した。正常encodeは80 session、decodeは100 sessionを全releaseし、最大active1・終了時0。CDPで取消親+子3、復帰encode親+子3、decode親+子3の計12 targetを観測し、全destroy eventとbrowserを閉じる前の不在を確認した。終了直後は約2秒のsettlementを待っている。CDP非公開Workerや物理RAM解放までを証明する結果ではない。

F1参照3境界は各encode39/decode49 sessionを全releaseし、実WKT保存読戻しの全値・metadataが一致した。各8 target（encode親+子3、decode親+子3）のdestroyとbrowser閉鎖前の不在を確認。追加4runとも閉鎖後の観測owned live process/zombieは0。初期threads4・16×32 runの最終decodeは直後にbrowserを閉じたという古い記録を変更せず、新しいsettlement付き受入と区別する。

| 追加threads4 run | browser sampled RSS / PSS sum peak（B） |
| --- | --- |
| F5・16×32診断 | 929,447,936 / 637,145,088 |
| F1・16×16参照境界 | 884,838,400 / 609,377,280 |
| F1・16×848参照境界 | 846,217,216 / 569,409,536 |
| F1・848×16参照境界 | 844,226,560 / 567,684,096 |

追加threads4 runと参照作成はtarget81の元vendor CPU2実行と並行している。上表の時間はその条件での観測値で、thread1からの専有速度改善を示す比較ではない。cgroup値には他の実行も含まれ、上記browser所有processのRSS/PSSと分けている。

F1・480×832のencode sampled browser RSS/PSS sum peakは4,479,012,864 / 4,208,588,800 B、decodeは4,096,307,200 / 3,831,917,568 B。source独立参照は47.686秒、RSS peak4,082,147,328 B。生のcgroup chargeが16GiB近くてもinactive_fileを含み、これをモデル常駐量と扱わない。guardは観測 `memory.current-inactive_file`、shmem/tmpfsは引かず、操作上のreserve256MiBをモデル必要量と区別して記録する。

69 graph + Hike conv2 weight/biasのexportは507,834,866 B、8.810秒、RSS peak1,011,138,560 B。原194 keysをstrict loadし、192 ONNX initializersと外部2 assetが重複なく対応する。symbolic空間軸・program構造の静的確認は [vae/partition-inventory.json](vae/partition-inventory.json) に保存した。静的検査だけで任意寸法の数値合格とはしていない。

target81の元vendor独立参照は全量作成済み。source d578の実WASM encodeは全2,096,640要素の比較に合格し、maxAbsは2.86102294921875e-6だった。独立raw decodeは実行中で、最終receipt・全資源終了の判定は未完了。source F4/5/80の実入力境界とF1参照848×848も残る。小診断やencodeだけの結果をtarget全体の成功へ繰り上げない。sourceF81はtarget81が完了した後、完全に同じdescriptor・全tensor bytesの証拠をaliasとして再利用する予定で、別NNとは数えない。

既存11caseのplanにF5・16×32診断を追加した。`reference_contract.py` は参照作成時commitのplan/toolのbytes/hash、選択case、model/source/precision/gate/patternなどの共有数値規則が不変であることを検査し、無関係なcase追加だけで旧参照を作り直さない。causal prefixからの派生参照は `DERIVED_CAUSAL_PREFIX_REFERENCE` / 新規NN0と明記する。未完了targetの部分receiptを親に使わず、派生を別の元vendor推論と数えない。

## API・保存差分と再利用境界

- 固定VAE manifestとmean経路を保持し、`wan21-vae-stream-v1` と独立raw decode meaning `wan21-raw-latent:v1` を追加した。
- `.wktensor` に任意 `frameProcessing` を保持し、F80→処理77と元80frame contextを保存後も追跡できる。compatible固定decodeでこのmetadataを落とさない修正を含む。commit `44429cd329736ed0c8d9f81a923f37e7c66a3ce6` ではnormalized meanとrestored generated sampleにもこのfieldを保持し、供給済みmarker・複数producer・decoder binding・復元条件を弱めない。関連27軽量検査を保持し、実Diffusion復元の新規NN受入へ数えない。旧markerなし互換とnormalized marker保持は維持する。
- 通常入口は従来どおり独立参照・gate・詳細receiptを不要とする。管理packageとstrict native codecの責任境界を変えない。
- 既存5×16×16、固定F1・16×16、固定Rect16×32の合格は旧graph/sourceのscopeで再利用する。新69-unit graphの合格には新しい全値比較を用いる。
- metadata/制御のhelper double、小channel source等価性試験、real ORT Add helperは開発検証であり、元VAE weightsの81frame NN受入へ数えない。

## 固定証拠の所在とhash

取得可能な原本receipt・manifestは[evidence/index.json](evidence/index.json)にbytes・SHA-256とともに同梱した。下表のlocal原本と対応する。graph重み・大tensor payloadは非公開出力先に保持し、再現手順と全asset hashを提供する。絶対pathや送付側self-checkだけで相手側取得済みとは扱わず、他担当のACKも今回単体作業の待機条件にしない。

| 原本 | bytes | SHA-256 |
| --- | ---: | --- |
| `/tmp/kw-vae-stream-export-20261102/manifest.json` | 51,613 | `64c57a7aeb5e8fcb5089b8d5771ce293b8355e365f2fd5cfe80df0840ca85345` |
| `/tmp/kw-standalone-text-oracle-20261102/reference-results.json` | 300,107 | `1e280a723574475f9d9eef70834547db8574baebf1b7d245b882c0cd45a6f617` |
| `/workspace/work/inference/standalone-20261102/text-canary/browser-results.json` | 20,210,391 | `ef6ce1974731759dd27201b8171e15ec06be01b1993c2b5bebe62b32e74d9ad8` |
| `/tmp/kw-vae-wasm-16x32-20261102/acceptance-results.json` | 111,687 | `238280382bc8166b58f79168dff962833ec78b232cfe08fd5b026f3bbcb147fe` |
| `/tmp/kw-vae-wasm-f1-target-spatial-20261102/acceptance-results.json` | 104,261 | `d9e3de01634a83c5c11119da85181ceceed927e71311783d0ee1e5a20b718a0d` |
| `/tmp/kw-text-sdpa-20261102/sdpa-results.json` | 58,263 | `fca6b28a59aea01196c29a400921ea2fdd2efdd1ec8f8f017765d6ca6005f853` |

## 対象外・残件

実generated sampleの復元・最終decode・管理保存は今回の独立raw decodeと別工程。復元の数値責任はDiffusion側に維持する。他担当のACKを単体完成の前提にはしない。

広範囲 `node --test tests/*.test.mjs` の別試行ではtechnical-library/VR180関連に5失敗と2未終了を観測した。今回のText/VAE専用検査へ混ぜず、変更前由来であるとの断定もしない。全repository test合格とは報告しない。

merge・GitHub Pages公開・製品生成READYは今回更新していない。

## 継続記録：参照全量とcopy境界

81frameの独立参照はsource `05198dba7959cc95e0c4d770fd85557ad4010a80` で作成完了した。encode1574.515秒、独立raw decode2993.330秒、全体4571.704秒、source process sampled RSS peak9,432,432,640 B／PSS9,429,231,616 B。worker exit0、reserve停止なし。途中に他の診断が並行しており、専有条件の速度比較ではない。これは参照作成の完了で、実WASM全値比較の合格ではない。

source F4/F5/F80/F81の参照は、完了した81frame参照と独立F1全値bridgeからNCTHWの軸2をchannelごとに取り出した。全ファイルhash・pattern・原model/source・既存gateを検査し、`DERIVED_CAUSAL_PREFIX_REFERENCE`／新規NN0を保持する。F4入力4／処理1、F80入力80／処理77を保存し、短いsourceを別途vendor実行したとは表記しない。実WASM側の各source受入は残る。

中間tensorをCHW frame配列で保持するcopy削減を `d578ec006571d82bc50c6c2935d78ae6ea838269` に実装した。数値graph・194 keys・Hike演算・gateは変更していない。固定ORT1.24.3のowned CPU配列のみをadoptし、不明な所有権・SAB・subviewはcopyする。最終全出力のfinite検査を保持する。F5・16×32の新しい実WASM／取消復帰／保存読戻しは合格し、同じthreads4の旧cc9実行とencode/decodeのWKT全byteが一致した。詳細copy counterは診断evidenceに限定する。

旧5f7 sourceの81frame実行はcopy改修の適用のため途中で中断した。数値不合格や81frame受入として数えない。新しいd578 sourceで全量を再開中。受入hostは開始時に固定commitと照合したsource bytesを保持して配信し、後の作業tree編集で実行sourceが変わらない。起動後の作業treeがそのcommitに一致するとの主張ではない。

Text短文suiteの並行試行は共有cgroup working-set監視14.5GiB超過で送付側が所有browserだけを停止した。controller観測15,719,948,288 B、39.495秒。数値gate FAILと区別し、source参照は維持する。全owned live/zombieは回収済みで、残りcaseとcontrolsを資源が空いた状態で実行する。

Text/VAEの完了callback内で再configure/disposeされた旧結果が返るraceを `5f7db87d2800e98eeca28484bf1a209eb06bcc39` で修正した。実client＋合成Workerの8検査で旧結果をAbortErrorとして拒否し、通常成功のpayload/bindingを保持した。これはNN受入の追加ではない。

## 継続記録：Text通常出力・保存と直列再開

Node参照host source `dccb88515775ec8aa86dd16f82e8816c9347ed38` の `plain-empty` は通常 `diagnostics:false` で完了した。出力[1,512,4096]の全2,097,152要素を独立5954参照と比較し、maxAbs4.172325134277344e-6・固定gate0.001に合格。mask無効行は全て厳密0、native WKT encode/decodeのmetadata・mask・normalization・全値が一致した。24 session create/release、run24、Tensor dispose72、active0、最大active1、457.790秒。元6.735GB sourceは64-bit readonly positional reader、prepared graphはnative Blobを使い、NN・Tokenizer・重み・gateは変更していない。

その後の多言語caseはblock8で資源guardにより中断した。共有working set16,405,098,496 Bで、PID/create timeを照合した所有Nodeだけを停止した。controller632.053秒、harness630.769秒、harness+Node sampled RSS sum peak3,983,347,712 B。これはVAEとの並行時の値で、専有benchmarkやモデル固有必要RAMではない。完了emptyの証拠を保持し、未完了5caseは合格にも数値FAILにも数えない。終了後の観測owned live/zombie/errorsは空だった。強制停止時のJS finally・fd明示closeまでを主張しない。

残る5caseと長文plainを、target VAE終了後に新source `153c864e22927b24902ad5343f5438b895459bf6` で直列実行する。既存emptyとall-active ID512 canaryを無条件に再推論せず、独立参照5954は再利用する。Browser T3はempty・ID2 bytes・ID1同一API復帰の3完全推論と9controlsを別に実行する。emptyのBrowser再実行は保存取消の実経路に必要な範囲とし、Node受入をBrowser取消へ転用しない。

153cの検証hostは、通常出力に加えて取消復帰WKTも別保存し、native codecで全値・metadataを読戻してから公開する。復帰caseを含む独立参照を最初のNN前にhash検査する。読戻し中に保存ownerのrevisionが変わった場合も公開を拒否する。関連する合成制御・保存試験は合格したが、実Browser T3の新規NN受入とは別である。

受入hostのSIGINT/SIGTERMはmodel演算を変更せず通常API cancelへ委譲する。source `2f5ff3be69e2ff347f3bcb382a0e1be7f864dff8` の実WASM診断で、chunk開始後のSIGINTを受け `INTERRUPTED_HOST_REQUEST` / exit130 /11.324秒で終了した。数値実行はattempted、正常完了operationは空。owned live/zombie/errorsは空だった。旧target中断時のPlaywright停止と子process回収記録は別receiptに残し、通常取消やtarget数値合格へ数えない。

sourceF81の追加NNを行わず、target/source81の4参照tensorについてshape・bytes・記録済みhashと実hardlink identityの一致を確認した。実meanの全2,096,640値はsource81独立参照ともgateに合格し、maxAbs2.86102294921875e-6。source用のsynthetic contextに変えたnative codec fixtureは全値bitwise一致、payload SHA `808db65cbf9b34f1ed1af5db04f2e3948b8207c7bcd52f080463d1355f3ecb46`、81件のframe番号・時刻・重複・sourceContextを保存後も保持した。model hash・meaning・normalizationは変更していない。このNN0証拠はsource-roleの別NN、target raw decode、target最終終了の受入とは区別する。

NN0 fixtureのcodec sourceは `b971adc7930bd42e081ff446a0d6a70b7ff1dc28` のtensor.mjs。実行したad-hoc runnerは当時そのcommitに含まれておらず、script SHA-256 `b9f9bedc9efa3b917f99aa45e2541006b252f944b16e75a2cc4c6bda2298975f` で識別する。実行bytesを [archive](vae/evidence/scripts/source81-alias-codec-fixture.mjs) に変更せず保存し、入力identity・proof・source archiveをevidence indexから取得できるようにした。元の大RGB2組のhashは、親の記録と実hardlink identityを再利用したもので、新しい全file hash計算とは表記しない。
