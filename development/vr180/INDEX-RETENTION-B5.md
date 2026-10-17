# Mediabunny 1.61.5 索引保持量の計測（b5）

2026-10-17。**次の改修対象は、出力muxerの全sample・chunk参照の保持と、入力demuxerのctts用PTS索引である。** 保存先へpayloadを逐次出力しても、これらは残ることを、固定ソースの配列件数と独立Nodeプロセスの実測で確認した。製品コード・vendor・上限は変更していない。5〜10 GBの加工・保存・実ファイル回収を目指す方針は維持する。本計測だけで大容量対応完了や上限解除とは判断しない。

## 対象と再現手順

- 計測script: [`tools/vr180/measure-index-retention.mjs`](../../tools/vr180/measure-index-retention.mjs)。Node `v24.19.0` / Linux x64。実測日は2026-10-17、確定結果は `index-retention-b5/run-2`。
- Mediabunny **1.61.5**。公式固定commit `0664a57bf2f40e5c4efa176c75ebf1d60df69eb8`。同梱moduleは `docs/shared/media-basic/vendor/mediabunny.mjs`。
- 作業開始時の製品commitは `f0e6d32f3b90e92fa76958e17175da67b6248d0b`。原記録の `baselineCommit` は計測終了時のHEAD `2bf0441f118329674c7612323ec141c98d51ae44`。この間のvendorとfixtureに差分がないことを確認した。全製品の結合試験を行ったという意味ではない。
- 5,000 / 25,000 / 100,000 samples、2種類の時刻列、muxとdemuxをそれぞれ新規 `--expose-gc` プロセスで計測した。12計測と、入力MP4生成用の独立6プロセス。各子プロセスのtimeoutは180秒。

リポジトリrootで実行する。出力先は毎回新しいディレクトリにする。生成ファイルの上書きは拒否する。

```sh
node tools/vr180/measure-index-retention.mjs \
  --out-dir evidence/index-retention-b5/new-run \
  --counts 5000,25000,100000
```

入力源は既存の合成fixture `docs/vr180-studio/fixtures/stereo180-sbs.mp4`。先頭の実H.264 key packet（6,744 bytes）と次のdelta packet（456 bytes）、元decoder configを使用する。`monotonic` はkey packetの反復と単調な1/30秒刻みのPTS、`alternating-ctts` はkey/deltaの反復で隣接PTSを入れ替える。**packet bytesを利用した合成索引負荷であり、実写素材や再生可能性を検証した動画ではない。** 音声はなく、復号・画素変換・符号化・VR再生は行っていない。

## 測定範囲

出力は `fastStart:false`、1 MiB chunkの実 `StreamTarget`。writeの位置・bytesを数えて破棄し、メディア全量を保持しない。同期 `onMoov` を有効にしてlibraryのtracking経路を通すが、callbackは長さと位置だけを保持する。製品側metadata captureのmoov複製は含まない。別プロセスで同じ負荷を位置指定file writeへ流し、demux用ファイルを作成した。

入力はNodeのdisk-backed `openAsBlob()` と未変更 `BlobSource` を使用。`maxCacheSize:1 MiB, useStreamReader:false` を指定し、生成メディア全量を読込まず、metadataと最初・最後のpacketのmetadata-only照会を行った。読取りbytesはsourceのreadイベントで計数し、moov・mdat payloadとの範囲重複も記録した。先行するtop-level box header走査はこのカウンタに含まない。Chromeのstream reader経路やnativeメモリと同一ではない。

各工程で2回の明示GCとイベントループへのyield後に `process.memoryUsage()` を取得した。処理時間とGC時間は別記録。muxは生成前／packet追加後／finalize後、demuxはmetadata取得前／metadata取得後／sample索引取得後を記録した。以下の増分は最終値から最初の値を引いたものであり、索引オブジェクトだけを分離した厳密な占有量ではない。各点1回で、JIT・GC・allocator・OS cacheの影響を受ける。finalize中の一時的な最大値は未計測。

## 3点の比較

最終GC後の `heapUsed` 増分（**MiB = 1,048,576 bytes**）。

| 経路と時刻列 | 5,000 samples | 25,000 samples | 100,000 samples |
| --- | ---: | ---: | ---: |
| mux / 単調PTS | 1.069 | 2.920 | 14.055 |
| mux / 交互ctts | 1.804 | 5.348 | 20.072 |
| demux / 単調PTS | 0.349 | 0.575 | 1.229 |
| demux / 交互ctts | 0.946 | 3.515 | 12.562 |

各工程の最終GC後の**絶対値**（MiB）。`external` は `arrayBuffers` を含むため加算しない。RSSはNodeプロセスの常駐量であり、索引専有量、CPU・GPU総量、システム全体の使用量を示さない。

| 経路 | 時刻列 | samples | heapUsed | external | arrayBuffers | RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| mux | monotonic | 5,000 | 8.375 | 2.684 | 0.177 | 84.730 |
| demux | monotonic | 5,000 | 7.089 | 2.708 | 0.386 | 37.352 |
| mux | monotonic | 25,000 | 10.225 | 2.681 | 0.177 | 125.008 |
| demux | monotonic | 25,000 | 7.315 | 2.898 | 0.577 | 42.398 |
| mux | monotonic | 100,000 | 21.360 | 2.681 | 0.177 | 180.016 |
| demux | monotonic | 100,000 | 7.969 | 3.502 | 1.180 | 42.914 |
| mux | alternating-ctts | 5,000 | 9.110 | 2.684 | 0.177 | 60.766 |
| demux | alternating-ctts | 5,000 | 7.686 | 2.764 | 0.442 | 42.125 |
| mux | alternating-ctts | 25,000 | 12.654 | 2.684 | 0.177 | 108.398 |
| demux | alternating-ctts | 25,000 | 10.255 | 3.355 | 1.033 | 48.316 |
| mux | alternating-ctts | 100,000 | 27.377 | 2.684 | 0.177 | 192.355 |
| demux | alternating-ctts | 100,000 | 19.302 | 5.078 | 2.756 | 66.559 |

muxの `arrayBuffers` 増分は全ケースで −1 MiB。これはfinalizeで固定stream bufferが解放されたためであり、sample索引のメモリが負になったことを意味しない。各工程の全生値とGC時間は `run-2/summary.json` に保存した。公開用[結果JSON](evidence/2026-10-17-b5-index-retention.json)は出力ディレクトリをartifact相対表記にし、終了時HEADの意味を注記した。数値は同一である。

処理時間（ms、明示GCを除く）とmetadata量。muxの準備時間は別の生記録にある。これらはpacket-onlyの所要時間であり、frame処理速度や60 fpsの保持能力ではない。

| 時刻列 | samples | moov bytes | mux packet追加 | mux finalize | demux metadata | demux 索引作成・照会 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| monotonic | 5,000 | 22,013 | 40.850 | 5.571 | 4.321 | 1.166 |
| monotonic | 25,000 | 107,345 | 150.060 | 13.615 | 4.493 | 3.839 |
| monotonic | 100,000 | 427,345 | 553.607 | 45.037 | 5.000 | 6.676 |
| alternating-ctts | 5,000 | 72,173 | 37.773 | 11.347 | 5.086 | 3.652 |
| alternating-ctts | 25,000 | 357,909 | 133.037 | 38.428 | 5.268 | 12.776 |
| alternating-ctts | 100,000 | 1,429,337 | 416.376 | 121.753 | 7.415 | 47.558 |

## 保持と読取り量を判断した根拠

全muxケースでfinalize後の `samples.length` とchunk内sample参照の合計は入力件数と一致した。sample payloadを保持する要素は全て0件だった。交互cttsのcomposition run数も5,000 / 25,000 / 100,000と一致する。したがって、全メディアを保持しないtargetへ変更しても、sample・chunk・ctts索引の保持はなくならない。

入力の単調PTSではsampleSizesがN件、PTS配列・逆引き配列は未作成だった。交互cttsではcomposition entries、presentationTimestamps、presentationTimestampIndexMapが各N件、keySampleIndicesがN/2件。100,000件の交互cttsでは、metadata取得後から索引作成・照会後だけでheapが12,890,760 bytes増加した。件数の観測と3点の増加はsample数に応じて保持が増える根拠になるが、任意の映像に対する厳密な比例係数や長時間のピーク保証ではない。

入力のreadイベントから得た累計値（bytes）。prefetchでmdat payloadも一部読まれており、metadata-onlyはpayload読取りゼロを意味しない。

| 時刻列 | samples | 読取り総量 | 最大1回読取り | moovとの重複 | mdat payloadとの重複 |
| --- | ---: | ---: | ---: | ---: | ---: |
| monotonic | 5,000 | 253,161 | 131,072 | 22,013 | 231,112 |
| monotonic | 25,000 | 345,405 | 196,608 | 107,345 | 238,024 |
| monotonic | 100,000 | 658,557 | 330,877 | 427,345 | 231,176 |
| alternating-ctts | 5,000 | 311,961 | 180,889 | 72,173 | 239,752 |
| alternating-ctts | 25,000 | 573,633 | 245,953 | 357,909 | 215,688 |
| alternating-ctts | 100,000 | 1,636,741 | 1,309,061 | 1,429,337 | 207,368 |

100,000件の交互cttsではmoov 1,429,337 bytesを読み、最大1回のreadは1,309,061 bytesで1 MiBを超えた。demuxerはmoovSliceを保持する。したがって `maxCacheSize:1 MiB` を単一読取り・全metadata・全索引の上限として扱えない。

固定公式ソースもこの観測と一致する。参照は [demuxerのmoov保持](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/isobmff/isobmff-demuxer.ts#L400)、[全PTSの作成・sort・逆引き](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/isobmff/isobmff-demuxer.ts#L654)、[muxer](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/isobmff/isobmff-muxer.ts)、[writer tracking](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/writer.ts#L69)。

## 次の改修対象と解除条件

1. **出力索引を先に分割する。** sample/chunk/ctts記録を上限付きページまたはdisk journalへ移し、最後のmoovも逐次構築する単位を設計する。StreamTargetの置換やpayload解放だけでは本計測の保持部分は解消しない。同期onMoov用全量bufferと製品captureの複製も別に扱う。
2. **入力索引も解決する。** moov全量保持とsampleSizes等の展開、ctts時の全PTS sort・逆引きを、必要範囲の取得と上限付き索引へ変更する設計が必要。出力改修だけでは長尺入力の成立を保証しない。
3. 改修後に同じ12ケースを再計測し、保持量・読み取り量・cancel応答・失敗清掃を比較する。少なくともsample件数、offset、PTS/DTS/duration、AAC、VR metadataの既存照合を維持し、製品上限の変更は別の受入判定にする。
4. 実Chromeの対象環境で5〜10 GBの実bytes、継続時間、sample数、metadata量を記録し、加工・保存・実ファイル回収と独立検証まで成立してから容量対応を判定する。VRプレイヤー互換性、実写品質、使いやすさ、速度は別に評価する。

今回の結果はNode内の合成packet索引計測であり、Chrome、長尺の画素変換、音声保持、60 fps、VR再生、5〜10 GBの完走は未検証。既存製品の上限は維持し、この計測のために上限外の製品経路は開放していない。

## 証拠の識別と初回失敗

初回attemptでは、交互PTSを全てkey packetとして投入し、MediabunnyのGOP時刻規則により5,000件のmuxが拒否された。failure JSON、stderr、`attempt-1-script.mjs` を初回記録として保存した。元のkey/delta pairへ計測入力を修正した `run-2` の12計測だけを本書の確定結果として使用する。vendor検査を迂回したり、失敗を成功として混ぜたりしていない。

固定ファイルのSHA-256：

| 対象 | SHA-256 |
| --- | --- |
| 計測script（本測定実行時） | `f20ca5c884c8d9e329698515dbcaef6e904cae7d62babe192d4cbbafcee7fdf1` |
| 同梱Mediabunny module | `5c3514965f106dd165cc6474979ba302ef85d8c84935a0ad3ea5202ccedfe51b` |
| 同梱Mediabunny 1.61.5 source.tgz | `95c03a00ca69a7d5ed9805e424349ffeb0cdecbe8cabd0e17749a39e8117802f` |
| 入力元stereo180-sbs.mp4 | `4c5b2725f625ea6f30f3f69afaa28644b8f954d60d5964bff712778ebdc86e83` |
| key packet | `5dd68f042fb14ddc03faf6441e68eacba133f91d41779f9f8f28f5da3e63e78d` |
| delta packet | `42cd4b8f8cc20e4e349528e6794dc0d4a554db19a6df681e4d7425cb3a3d655d` |

生成6ファイルは非公開のローカル証拠として保持する。全体hashは計測完了後の別工程で1 MiBずつ逐次計算し、statと生成記録の実bytesを照合した。[生成ファイルmanifest](evidence/2026-10-17-b5-index-fixtures.json)に結果とhash所要時間を記録しており、上の処理時間やメモリ計測には含めていない。ファイル名はartifact内の `run-2/fixtures/` からの相対名である。

| ファイル | 実bytes | 全体SHA-256 |
| --- | ---: | --- |
| monotonic-5000.mp4 | 33,742,057 | `34646431f20a3082c8062b27cd47850fef93e6777f4338c0e01182f4ac3d359b` |
| monotonic-25000.mp4 | 168,707,389 | `842e98bbecc9a32beab137e72a830c6906c9cb6a8edf0aad3439f017b4060bc6` |
| monotonic-100000.mp4 | 674,827,389 | `3f2e409c70076b15a322aebb30fc6e3ea2cbc775c4523968108b6d23a318b8ba` |
| alternating-ctts-5000.mp4 | 18,072,217 | `bd75b6e26c3cdef8993180e20a1484ad2920870d80d1ca3cc9f3af84aecf89b7` |
| alternating-ctts-25000.mp4 | 90,357,953 | `508813f91cce8bb47739cca6eec95fc1ba1d3394f6a279126903babbba54ccdb` |
| alternating-ctts-100000.mp4 | 361,429,381 | `318ce03dd3320035312ee410e4e25f35399b987038dc38b728cf18047cb63115` |
