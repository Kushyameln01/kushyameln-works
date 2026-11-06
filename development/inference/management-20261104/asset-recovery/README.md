# 受入済みVAE stream資材のexact復旧

**欠落していた71資材・507,834,866 bytesを、元の固定export sourceと元modelから再現し、既存manifestの全bytes/SHA-256に完全一致した。** 新profile追加、81frame推論、独立参照生成、実WASM再受入は行っていない。既存の数値受入は[REUSED-EVIDENCE.md](../REUSED-EVIDENCE.md)の元scopeを保って再利用する。同資料の「private stream資材未取得」は復旧前の観測であり、この新しいreceiptが現存状況を更新する。

## 固定sourceと復旧経路

- 追加作業のowner基点: `e03b920e539ebee0535403f0daf532791476ab50`。本体sourceは変更していない。
- 実export source: [`a7573012e98b6b94ad2c56788b4c14907f262201`](https://github.com/Kushyameln01/kushyameln-works/tree/a7573012e98b6b94ad2c56788b4c14907f262201)。固定git objectから5ファイルを取得し、現在のowner sourceおよび実行用private複製とbytes一致を確認した。各path/bytes/hash/固定GitHub URLは[source-byte-proof.json](source-byte-proof.json)。
- 元model: Wan2.1 VAE、253,815,318 bytes、SHA-256 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。固定exporterがload前に全model hashを検査した。modelの再取得や重み変更はない。
- 依存: torch `2.6.0+cpu`、onnx `1.17.0`、numpy `2.3.5`。元manifestと一致。safetensors `0.5.3`、einops `0.8.1`も記録した。
- 出力先: `/workspace/work/inference/management-20261104/vae-stream-recovered`。公開directoryや旧bundleへ上書きしない新規private出力を使った。

先にGitHub Releasesが空、export commitのActions runが0、最新runのartifactが空であることを読取り確認した。一般artifact一覧endpointはconnectorの400で取得できなかった。persistent保管にも対応unit/archiveが見つからなかったため、既存REPRODUCEが指定する「bundleがない場合だけ元modelからexport」の復旧経路を実行した。これを公開binaryのdownloadや相手側取得ACKと記載しない。

## 全資材の照合とmanifest

[expected-assets.json](expected-assets.json)は既存manifestの71資材をそのまま列挙する。[asset-comparison.json](asset-comparison.json)では再現した各fileの全bytesを読み、サイズとSHA-256を照合した。**71/71一致、差分0、未知のasset file 0**。model/source/program/domain/precision/versions/全asset descriptorを含むmanifest全体も、`exportSeconds`を除いて一致した。

新しいexportの経過時間は非決定的なので、新生成manifestを[new-export-manifest.json](new-export-manifest.json)として別に保存した。そのSHA-256は`85fba0b711d16bb8f8bce8321a70cf369f66c46cab1519b8ca68b1b8b0d0707c`。元manifestに新しい実行時間を付け替えていない。

全資材一致後に、受入済みの元manifest bytesをprivate bundleへ採用した。同じ71資材に対して次のいずれかを明示選択できる。graphやweightを重複保存しない。

| private file | threads | bytes | SHA-256 |
|---|---:|---:|---|
| `manifest.json` | 1 | 51613 | `64c57a7aeb5e8fcb5089b8d5771ce293b8355e365f2fd5cfe80df0840ca85345` |
| `manifest-threads4.json` | 4 | 51613 | `532523034a5e5c7590c4fca11d67feec329c6e0e364afd55f472f03ffd8966d2` |

threads4にはCOOP/COEP・cross-origin isolation・SharedArrayBufferを提供するhostが必要。暗黙threads1 fallbackや元manifestのshape変更は追加しない。profileは既存`wan21-raw-f32-stream`のままである。

## 管理へ渡す資材

[provider-receipt.json](provider-receipt.json)にmanifest選択、71個すべての取得path・bytes・SHA-256を記録した。管理は選択した一つのmanifestと、その`assets`に列挙された実Fileを名前で`files:Map`へ渡す。runtime用に元safetensorsを渡す必要はない。新生成manifestは復旧記録用であり、通常configureには上の固定manifestを選ぶ。

```js
const manifest = JSON.parse(await selectedManifestFile.text());
const files = new Map(assetFiles.map(file => [file.name, file]));
api.vae.configure({manifest, files});
```

これは既存通常APIの利用手順であり、この復旧作業で新しい管理実行や81frame処理を済ませたという例ではない。送付側のexact復旧・ローカル照合と、相手環境での資材取得・運用ACKは分ける。

## 実行・資源・終了

実コマンドとPID・exit codeは[export-run.json](export-run.json)、完了logは[export.log](export.log)、標本は[resource-samples.json](resource-samples.json)。固定exporterは各unitの2×2example確認とPyTorch ONNX tracingを実行するため、演算0とは扱わない。一方、81frameの元workflow推論、元vendor参照生成、browser/ORT WASM再受入は0回である。

- wall時間: `17.759512031999748 s`、exit code 0。
- 所有exporter群の標本peak RSS: `1,009,291,264 B`、PSS: `1,006,956,544 B`。
- 子process rusage peak RSS: `1,011,707,904 B`。標本RSS/PSSとは別測定。
- 所有PID `4536`をwait/reap後、追跡live process 0、zombie 0。browser/Worker/sessionは起動していない。
- 出力後の空き容量: `659,996,672 B`。共有環境の一時点であり、必要最小ディスク/RAMや他jobの成功を保証しない。

復旧の再現が必要な別環境では固定5file closure、同model/hash、同依存versionを使い、新しいprivate出力先で元`export_stream.py`を実行してから全expected asset hashを比較する。既に今回のexact bundleを取得できる環境で再exportを繰り返す必要はない。元の数値受入を新しい実行sourceへ付け替えず、新しいreceiptは資材復旧のみを証明する。

未実施は受領側ACK、今回の資材による新しい管理実行、実generated producerからの最終decode、LoRA全体運用、merge/Pages公開。本体の全体接続や製品生成READYの判定とは分ける。
