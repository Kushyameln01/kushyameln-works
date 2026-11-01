# N2返却パケットの原本・出典照合

判定: **PASS_WITH_BOUNDED_METADATA_EXCEPTIONS**。公開された実行証拠の原本・出典を照合した結果であり、非公開payloadの取得、数値再実行、管理Step3全体の受入を意味しない。

返却commit `508d72cc9036e7f500827465c644b4aed3c5f711` の指定ディレクトリを `git cat-file blob` で抽出した。`RESULT.md` と `handoff.json` は全文確認済み。indexの11ファイルは長さ・SHA256とも一致し、index自身を含む12ファイルすべてが元Git blobとbyte-for-byteで一致する。Git blob IDも内容から再計算して一致した。`result.json` は3,007,028 B、SHA256 `2d1e4a2205764a251af1357152c37d1fb11153d98bf5ba426d4257f3c0c4c859`。返却原本を再serialize・補正していない。

| 記録群 | 固定Gitとの一致 | 配布Gitとの一致 | r7取得済み原bytesとの一致 |
| --- | ---: | ---: | ---: |
| managementSource | 19/19 (`5c484a8`) | 19/19 (`055903a`) | 独立した原copyなし。既存hash inventoryは4/4一致 |
| native sourceProof | 24/24 (`a49aac4`) | 24/24 (`beffdcb`) | 24/24 |
| buildSourceProof | 100/100 (`a49aac4`) | 100/100 (`beffdcb`) | 100/100 |
| publicReceiptProof | 15/15 (`a49aac4`) | 15/15 (`beffdcb`) | 15/15 |

合計158記録のrecord直下のSHA256・長さに不一致はない。重複を含み、固定commit/pathの組は138、相異なるGit blobは134。build100のファイル集合も固定build-infoの集合と同一で、canonical inventoryから再計算したdigestは `bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74`。返却build IDと一致する。

確認した不整合は次の2種類に限定される。

1. `publicReceiptProof[*].sourceRef.sha256` は15件すべてがreceipt自身のhashと不一致で、すべて固定stage.mjsの `ca35f70de8ced5a5c11223b63b98a1f346b1f21118d674195c6abd8c56ee33f3` と一致する。固定runnerがsourceRefを展開してpathだけを上書きする箇所と対応する。repository・commit・pathおよびrecord直下のhash・長さは正しい。nested hashをreceiptの識別値として使用できない。
2. HIGH/LOWとも公開resultの `nativeEvidence.trustedInputs.attention` が欠落する。固定runnerの公開投影がkey名 `attention` を省略することと対応する。補足ファイルの全5 binding hashは、固定 `trusted.mjs` のanchors、固定export receipt、固定capture receiptの3系統と一致する。actualRunのartifact hashは実行resultのasset receipt、input F32 hashはnative evidenceのinputHashesと一致し、既存r7 trusted pin inventoryとも一致する。補足は原resultを置換していない。非公開attention内容の独立取得・再hashは行っていない。

このため、両者は公開metadataに限定された、具体的に範囲を画定できる例外として扱える。source/payload bytesの不一致を示す証拠は見つからない。この出典照合から非公開payloadの正しさ自体を独立再証明したとは扱わない。

captureとreplayの由来も分離して確認した。元配布handoffはr7原本と一致し、HIGH/LOWで同一の各source集合（attention materialization30、capture snapshot3、accepted tail24、tail snapshot4、private save replay23、save driver2、reused admission2）が、固定Git・r7原bytesと全件一致する。captureの旧harness snapshot `28c88468…` とaccepted tailのharness `4242b23a…` を混同していない。保存済み出力のreplayとHASH_VERIFIEDはbit保持の証拠であり、新規数値比較の代用としていない。

追加で、元codec commit `2bdca59ea78580d4fe7a9d31a8de33209b64d029` のGit objectをこの環境で読み取れた。原 `docs/shared/inference/tensor.mjs` と固定管理側の配置codecは同一Git blob `6f428fdfc1a4077b2a5cd568c42011391027cc8e`、8,256 B、SHA256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`。これは今回の管理側追加照合であり、owner返却文の「owner実行時には元Git object未取得」という履歴を変更するものではない。

全記録・個別判定は `SOURCE-RECONCILIATION.json`、抽出時の各blob IDは `packet-acquisition.json`、再実行用の公開source照合手順は `reconcile-sources.py` に保存した。この監査によるリポジトリ変更、private payload取得、モデル全hash、計算再実行、commit/pushはない。
