# Text graph読込みのNN0 probe source

Node v24.19.0 / Linux x64で、prepared `block-00.onnx` 1個の読込みだけを測ったad hoc scriptを、実行時のbytesのまま保全する。ORT、Hike、model NN、export、独立oracleは実行していない。通常APIの数値受入・Browser File/Worker・取消・全24層NNの資源受入は、このprobeの範囲外である。判定範囲と後続計画は [RESULT.md](../../../RESULT.md) と [REPRODUCE.md](../../../REPRODUCE.md) を参照する。

対象は771,822,917 B、manifest SHA-256は `7fe493343e5a3d9c196284b1a64525c1296ac4f4a56a5d6239e6047cd3fb8807`。3回とも全出力byteをこのhashへ照合し、size・mtimeNs・inode・deviceが変わっていないことを確認した。元6.735 GB modelや他graphは読んでいない。

| 読込み経路 | sampled own RSS peak | 読込み後のArrayBuffers | read時間 |
| --- | ---: | ---: | ---: |
| native `fs.openAsBlob().slice().arrayBuffer()` | 1,586,036,736 B | 1,543,809,353 B | 8.003 s |
| ad hocの単一ArrayBuffer + 最大8 MiB positional read | 805,216,256 B | 772,006,196 B | 0.552 s |
| 実production `openPreparedGraph()` | 806,547,456 B | 772,006,664 B | 4.135 s |

Node組込み `internal/blob` は、`buffers` 配列にread chunkを保持し、EOFで `concat(buffers)` している。chunk群と最後の連続bufferが共存する実装と、約2個分のArrayBuffers測定が一致する。単一ArrayBufferへ直接読む経路は、同じUint8Array viewを `FileHandle.read()` へ渡す。実production readerは93回、最大8,388,608 Bで読み、終了時のpendingは0、FDはclosedだった。

比較はBlob→ad hoc positionalの順に別Node processで直列実行した。production readerはその後の別probeである。cacheをdropせず、同時にVAEの実WASM推論が動いていたため、read時間はcache・実行順序・CPU/I/O競合を含む。速度の倍率や全NNのpeak低下へ換算しない。共有cgroup working setは他jobを含むため、表のown RSSとは別指標である。

controllerは20 ms間隔で、`max(0,memory.current-inactive_file)` が16,000,000,000 Bを超えた場合、または所有NodeのRSSが1,720,000,000 Bを超えた場合に、その子processだけを停止する。これはsamplingによるguardであり、hardなRAM上限ではない。今回の3 processはguard停止なしのexit0で、終了後に残っていない。他jobへsignalを送らず、fileの書換え・cache drop・fadviseも行っていない。

## 実行sourceの識別

下表は実receiptに記録したad hoc scriptのbyte数とSHA-256である。実行前にcommitされていたscriptとは扱わない。production probeがimportしたNode hostも実行時は未commitの固定bytesで、後からcommit `b3e5e34430d58bca3bf69b8938ba87beb196d054` と一致することを照合した。後日の文書commitで、当時のsource SHAを付け替えない。

| 保存file | bytes | SHA-256 |
| --- | ---: | --- |
| [adhoc-comparison/read_probe.mjs](adhoc-comparison/read_probe.mjs) | 3,992 | `fa7d16c17e6d9132495acca3d92bbe4c0906462a2d6d671121566a6363ad872b` |
| [adhoc-comparison/controller.py](adhoc-comparison/controller.py) | 4,650 | `4f330b969b9155421257a1ddae30b7584fa59b57efe51b0f36b04e7f90a5955b` |
| [production-reader/read_probe.mjs](production-reader/read_probe.mjs) | 1,978 | `004e6ef1e64aa2cfcb4dbdafa9d38008ed25d8d0c2c1dda6ede51f45a525040e` |
| [production-reader/controller.py](production-reader/controller.py) | 4,743 | `846a300f46366d6e1e8317830d4b615cc2f9ea345b18c5f4264ccc2d91ff50ad` |
| [production-reader/node_sdk_host.executed.mjs.txt](production-reader/node_sdk_host.executed.mjs.txt) | 24,747 | `1ee7d4c14c1ab785b70a04b5b4477e35eadb41acbce89c58d78f1d7e16c17d40` |

組込みsourceの確認は `process.binding('natives')` のreadonly参照だけで行った。`internal/blob` は14,470 B / SHA-256 `d609c6919b357bdbf1256ae4a1e242e7ef65295dfde0c7cdddf99e25dacb7df2`、該当箇所は434–459行。`internal/fs/promises` は36,749 B / SHA-256 `13e788399ddc3b2caa2778a726841d33a5587d74631d854da4846ba666e6607b`、755行で供給されたbufferをnative readへ渡す。この組込みsourceの確認はmodel payloadを読まない。

## 再現

実行場所・bundle・repoの絶対pathは元環境のまま保存している。production scriptは元repoの `node_sdk_host.mjs` をimportするため、先に上表のhost bytes/SHAとの一致を確認する。`.mjs.txt` は実行時bytesのsnapshotであり、依存moduleを含む代替hostではない。別環境に合わせてprivate copyのpathを変えた場合は、その新しいbytes/SHAと結果を別runとして記録する。

repoの証拠directoryへ出力しないよう、script/controllerを新しいprivate directoryへcopyしてから実行する。controllerは自身のdirectoryへreceiptとstdout/stderrを書き、既存fileを上書きするため、再試行ごとに新規directoryを使う。以下は読込みprobeだけを再実行する例であり、資源余力を確認してから2件を直列に実行する。

```sh
READ_PROBE_ARCHIVE=development/inference/standalone-20261102/text/evidence/read-probe
READ_PROBE_COMPARISON=$(mktemp -d /tmp/kw-text-read-probe-repro.XXXXXX)
cp "$READ_PROBE_ARCHIVE/adhoc-comparison/read_probe.mjs" "$READ_PROBE_COMPARISON/read_probe.mjs"
cp "$READ_PROBE_ARCHIVE/adhoc-comparison/controller.py" "$READ_PROBE_COMPARISON/controller.py"
python "$READ_PROBE_COMPARISON/controller.py"

READ_PROBE_PRODUCTION=$(mktemp -d /tmp/kw-text-prepared-reader-repro.XXXXXX)
cp "$READ_PROBE_ARCHIVE/production-reader/read_probe.mjs" "$READ_PROBE_PRODUCTION/read_probe.mjs"
cp "$READ_PROBE_ARCHIVE/production-reader/controller.py" "$READ_PROBE_PRODUCTION/controller.py"
python "$READ_PROBE_PRODUCTION/controller.py"
```

元のprivate保存先は `/tmp/kw-text-read-probe-20261102` と `/tmp/kw-text-prepared-reader-probe-20261102`。このarchiveはscript/controllerとhost bytesを保存し、実receiptの収録・索引とは分ける。b3e5固定sourceのNN0 preflightによる18件のsource照合・24 graph FD close・graph/source read0 Bも別試験であり、このad hoc probeにGit commit検証を遡って付け足すものではない。
