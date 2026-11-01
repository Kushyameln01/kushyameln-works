# 固定公開receiptの受領だけを再確認する

Python3の標準ライブラリだけを使う。モデル原本、private weight、LoRA File、Unity、Node、ORT/Hikeは不要。推論・数値試験・export・期待値生成は行わない。

同じディレクトリに`verify-fixed-receipts.py`と`fixed-receipt-files.json`を置き、新しい保存先を指定する。

```sh
python3 verify-fixed-receipts.py --out ./lora-fixed-public-receipts
```

全URLは`https://raw.githubusercontent.com/Kushyameln01/kushyameln-works/<完全commit>/<path>`に固定されている。index自身のSHA-256、33公開ファイルのbytes/SHA-256/Git blob SHA1、既存manifest9件を照合する。gzip receiptは展開後の37,764,410-byte streamをhash確認するだけで、展開ファイルは書かない。

既存受領ディレクトリだけをネットワークなしで検査する場合:

```sh
python3 verify-fixed-receipts.py --check-dir ./lora-fixed-public-receipts
```

成功表示は`PASS_FIXED_PUBLIC_RECEIPT_BYTES`。これは既存receiptの受領bytesの合格であり、新しいLoRA適用・新P4共同試験の合格ではない。33件には配布dd95のAPI文書・runner3件と実行28fの同一runner3件を両方保持する。既存runtime source55件のうち8件を直接再取得した。過去26private artifact・原LoRA・全base・bounded-base payload・独立reference配列は未取得。

固定indexは10,813 bytes、SHA-256 `1bcc24b0bc618ff56934d84585835f3554ae20ede48de2a6bf5889c49e079179`。
