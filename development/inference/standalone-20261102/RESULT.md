# Text / VAE 単体検証結果

この記録は作業途中の固定証拠をまとめる。Text T1–T3、VAE V1–V4を個別に判定し、単体完成、モジュール間接続、製品生成READYを分ける。未完了caseを既存の小shapeや別promptの合格で補わない。

## 配布と実行source

配布branchは `codex/text-vae-standalone`、基点は `498eb25f027666e3cc661a5851288e4aabf39f0a`。**最終配布SHA・Draft PR・push後の取得照合は未記入**。ここに記載したsource SHAは実際に各runへ渡したものを保持する。

| 作業 | 完全source SHA |
| --- | --- |
| Text9case独立参照 | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` |
| VAE69-unit export | `a7573012e98b6b94ad2c56788b4c14907f262201` |
| Text512 canary | `5e6ebe212ca3c079f5d4cf65cf3fd24c4bc6f97f` |
| VAE16×32単体受入 | `37c269aefe6e829ea1bff35019e19c472273813c` |
| VAE F1・480×832単体受入 | `e0f0dd7cae05aebcfc60214d51fce90df6197ab7` |
| Text SDPA演算診断 | `05198dba7959cc95e0c4d770fd85557ad4010a80` |
| Text全24層参照checkpoint照合 | `79d62327b47056fff0e3f8d5ea0ebd2e183048c3` |
| VAE threads4小規模実WASM | `e5e954ac8faa304c5e90b469970b6fd7940d8c08` |
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

失敗canaryのgroup sampled RSS sum peakは4,520,603,648 B、complete PSS sum peakは4,238,017,536 B。RSSの共有page重複を含み、PSSへ加算しない。観測した24 sessionはcreate/run/releaseが各24、Tensor dispose72。browser/local server終了後に観測owned live process・zombieは残らなかった。実行途中に観測したzombieと回収記録は保持する。

canaryは全512位置有効でID0も合法入力である。gateを緩める、ID0を禁止する、入力を差し替える、参照backendを合格に合わせて選び直す処置はしていない。全24層のsource checkpointは既存5954参照と全digest・最終全値が一致した（108.860秒、process RSS peak1,710,813,184 B）。この診断だけVAE独立参照CPU2と並行しており、時間は専有条件の比較ではない。層ごとの局所誤差と伝播誤差のnative traceは進行中。

Textの既存Hello world、選択manifest、Tokenizer、独立参照、最終Hike正規化、P2/codec成果は元scopeで維持する。今回の9case合格へ流用しない。graphの再exportと全9case参照の再推論は行っていない。

## VAE V1–V4

**新stream runtimeの受入は下記2caseまで。81frameと参照寸法境界の単体受入は未完了。** encodeと独立raw latent decodeは別入力で比較しており、encode meanを生成sampleへ改名していない。

| 実WASM case | encode全値 maxAbs / 要素数 | 独立raw decode全値 maxAbs / 要素数 | 通常処理時間 |
| --- | --- | --- | --- |
| F1・16×32 | 7.152557373046875e-7 / 128 | 5.662441253662109e-7 / 1,536 | encode3.212秒、decode2.758秒 |
| F1・480×832 | 1.6689300537109375e-6 / 99,840 | 2.1904706954956055e-6 / 1,198,080 | encode164.829秒、decode243.850秒 |

新domain用gateは比較前に固定したatol/rtol/maxAbs0.002。いずれも全要素finite・allclose・global maxAbsに合格し、WKT保存/読戻しで全値とmetadataが一致した。小profileの過去gateを後付けで大shapeへ転用していない。参照inputは明示した合成RGB・独立raw latentであり、取得できていない実媒体の代用を実媒体受入とは表記しない。

F1・16×32では最初の実chunk完了後の取消、同一APIの通常再実行、再configure、dispose、保存読戻しを確認。F1・480×832は通常encode/decodeを実行した。各runのencode session39/39 release、decode49/49 release、最大active1、終了時active0。両runともbrowser終了後の観測owned live/zombieは0。強制cancel時のinner finally実行までは主張しない。

F1・480×832のencode sampled browser RSS/PSS sum peakは4,479,012,864 / 4,208,588,800 B、decodeは4,096,307,200 / 3,831,917,568 B。source独立参照は47.686秒、RSS peak4,082,147,328 B。生のcgroup chargeが16GiB近くてもinactive_fileを含み、これをモデル常駐量と扱わない。guardは観測 `memory.current-inactive_file`、shmem/tmpfsは引かず、操作上のreserve256MiBをモデル必要量と区別して記録する。

69 graph + Hike conv2 weight/biasのexportは507,834,866 B、8.810秒、RSS peak1,011,138,560 B。原194 keysをstrict loadし、192 ONNX initializersと外部2 assetが重複なく対応する。symbolic空間軸・program構造の静的確認は [vae/partition-inventory.json](vae/partition-inventory.json) に保存した。静的検査だけで任意寸法の数値合格とはしていない。

現時点の未受入はtarget81×480×832、source F4/5/80/81の選定大shape、F1参照16×848・848×16・848×848等、targetでの取消/再実行/保存と資源、明示4 threadの大shape実速度・最終解放。threads4・16×32は新規にencode/raw decode・取消復帰・保存読戻しに合格し、計13.861秒。比較は全値で上表と同じmaxAbsだった。cancel親+3子pthreadとencode親+3子pthreadのdestroyを観測したが、最終decodeは直後にbrowserを閉じており、その終了を閉鎖前確認済みとはしない。改修した診断hostは次のrunからCDPの可視Worker消滅を待って記録する。target81独立参照は進行中で、成功結果へ繰り上げていない。

## API・保存差分と再利用境界

- 固定VAE manifestとmean経路を保持し、`wan21-vae-stream-v1` と独立raw decode meaning `wan21-raw-latent:v1` を追加した。
- `.wktensor` に任意 `frameProcessing` を保持し、F80→処理77と元80frame contextを保存後も追跡できる。compatible固定decodeでこのmetadataを落とさない修正を含む。旧markerなし互換とnormalized marker保持は維持する。
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
