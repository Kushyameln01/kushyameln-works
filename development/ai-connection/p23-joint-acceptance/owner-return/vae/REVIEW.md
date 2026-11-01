2026-11-02 JST。対象配布は `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`。提案は **P2 固定profile診断の限定 ACCEPT**。取得ACKは別ファイル `acquisition-receipt.json` に保存し、取得だけでP2を承認した扱いにはしていない。

受領側で実施した確認:

- 原本Git 98 files / 6,592,142 bytesを取得し、各pathのbyte length・SHA256・Git blobを記録。updated-884のindexは93/93一致し、宣言どおりindex自身だけを除外する。
- 実行884の20 sourceをGit原本と照合し、配布f34の同20 pathsとbyte exactを確認。旧60dとの比較17件は15同一・2変更。旧成功結果を新884へ付け替えず、今回のnormal/cancel-recover resultとsourceCheckpointを使った。codecは原本2bdの8,256 bytes / SHA256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`。catalogは6dae9a6のv1.0-draft.1を維持した。
- 既存E4 package readerと採用codecで実配布10 packagesを読み、すべて `complete`。scenarioごとにraw mean、marked normalized mean、restored mean、歴史RGB、今回の実RGBを区別した。manifest/receipt/descriptor/native間の不整合は検出しなかった。
- mean `[1,16,1,2,4]` 各128値は、固定5fのraw/normalized/restored参照に一致。marker `wan21-comfy-f32-v1` は保存後も保持。roundtrip maxAbsは `2.384185791015625e-7 <= 2e-6`。復元fileは歴史351原本とbyte exactだが、今回のmeanResult SHAとjointTraceを追加で照合した。
- 実RGB `[1,3,1,16,32]` はnormal/recovery双方の実保存物を読み、各1536値を固定855参照と再比較。maxAbs `4.328787326812744e-6 <= 2e-5`、全値allcloseも通過。実RGB file SHA256は両方 `4de752c8a7d6df05fed012065bfd222b2f41d4c1c93c2cf8be58edfa24a46d72`、payloadは `aacf932664139862197c2dab5c087ce76305b2622bf02b3f5bde44eb73392d85`。VAE `normalizationApplied:false`、model/profile/context/frame arrays、decode入力hash、E4 receipt、N-IDENTITY/N-SHAPE/N-EVIDENCE/N-TRANSACTION/N-ARTIFACTのpublished判定が同じtraceに結び付く。
- normal traceは `works:p2:joint:fc24f1eb-a752-45c7-acd6-4a7fd6b07318`、cancel/recovery traceは `works:p2:joint:23cdb4ac-bab0-4909-9cf3-23295abc1f3f`。取消はrunning/creating-session観測後で、元Promiseは `rejected/INVOCATION_CANCELLED`、元resultAcceptedはfalse。対象tokenの実close、originalTerminal、queue/owner releaseの後に別token・別request・revision2で復帰する。Worker close数はnormal 1/1、cancel/recovery 2/2、live0。取消caseをdecode成功へ加算していない。

今回管理環境で独立確認したのは、実配布bytes、E4読戻し、全値比較、固定Git sourceと記録間の結合である。owner環境でのNN実行・元disk write/read・286,313,363-byte decoder等のfull-file hashing・process観測はowner evidenceとして受領した。model bytesを取得せず、native client/kernelを実行していない。再推論・再export・model downloadはいずれも0。

メタデータと失敗記録の扱い:

- `SOURCE-COMPARISON` の5537/60dという上位scopeは旧source調査の履歴。新実行はscenario内884 sourceCheckpointで確認する。`SOURCE-REPORT` の私有path参照・旧未実証記述も冒頭の履歴注記の範囲に限定する。
- 歴史 `mean/received-rgb` のnative contextは存在しない。これは過去受領RGBであり、今回のNN/currentInputLink受入に使わない。今回の両decode RGBには正しいcontext/frame arraysがある。
- early-source-failure原本は保持した。固定5fの不完全cacheに `reference-received.json` がなく `loadRectCandidate` のsource取得中にENOENT、NN前に終了したもの。後続の成功は完全な同5f Git treeを使う。884 runnerの変更やreference/model再生成による修復ではない。

P2の受入は `wan21-raw-f32-1x16x32` 診断と今回の受領済みnormal/cancel/recovery/E4証拠に限定する。mean prepareの `BLOCKED/NOT_VERIFIED` はbounded owner診断の設計どおり保持し、full phased mean-adapter再設計の承認へ広げない。別profile・実媒体/slot・P3 LoRA全取引・P5生成sample・P6不足条件/81frames/大shape・cross-attention本番消費・全工程UI・資源改善・生成readiness・merge/Pages公開は未受入。

実行証拠は `verification-output.json`。再確認手順は以下の2コマンド（モデルを使用しない）。scriptsと `acquisition-receipt.json` を同じdirectoryに置く。公開するのはreceipt/report/scriptsであり、抽出した約21MBのGit原本はpushしなくてよい。原本時刻はGit evidence内の値をそのまま保持した。

```sh
python prepare-git-origins.py --repo /workspace/kushyameln-works --output /workspace/work/ai-connection/returns-r10/vae-review/portable-recheck
node verify-vae-return.mjs /workspace/kushyameln-works /workspace/work/ai-connection/returns-r10/vae-review/portable-recheck
```

出力先をrepo外の新directoryへ指定して再実行し、同じPASSと10 package checksを確認した。`verification-output.json` と `verification-stdout.json` は初回出力とbyte exact。省略時は従来どおりscriptのdirectoryへ書き出す。Pythonの旧positional repo引数も維持する。

| script | bytes | SHA256 |
| --- | ---: | --- |
| prepare-git-origins.py | 4216 | `473c86f492dc2ef068338c18b9fa6945741cc60c6698309d81507ddc4b2b428b` |
| verify-vae-return.mjs | 22066 | `506f08a5c4b4e146649288208f50700a8bccfd1a7fa3d0258c087b653b917369` |
