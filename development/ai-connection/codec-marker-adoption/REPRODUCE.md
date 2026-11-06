# 追補の再現

完全management checkpointは `RESULT.json`。共通規範と旧native回帰pinは前回から維持する。

## 規範付き入口

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-loader-norm-fields.mjs \
  tools/ai-connection/test-norm-execution-boundaries.mjs \
  tools/ai-connection/test-norm-execution.mjs \
  tools/ai-connection/test-norm-required-lora.mjs \
  tools/ai-connection/test-norm-required-rect.mjs
```

必須loader binding＋3宣言の同時削除、side/representation衝突、無関係なprofileによるRect shape比較の回避を拒否する。既存の未来receipt・live失効の拒否も維持する。全native回帰と元owner宣言probeは `../norm-receipt-adoption/REPRODUCE.md` の別pin/環境変数を使用し、今回のcheckpointで実行する。未設定によるskipは合格件数に含めない。

## codec原本と当管理E4

owner evidence commit `d8a19f684f75fdf2f772d64754cba9d08b8f5c82` を取得し、次のpathをrepository-relativeに保って別directoryへ展開する。重み・graphは含まれない。

- `docs/shared/inference/tensor.mjs`
- `tools/inference/fixtures/tensor-2c171.mjs`
- `development/inference/codec-marker-handoff/`
- `development/inference/reference-adoption/p2/run/input-raw/native.wktensor`

元helperと `E4-SOURCES.json` のhashはSOURCE-RECEIPTで確認する。helperは変更せず、固定management checkoutとfresh出力directoryを指定する。

```sh
node "$CODEC_OWNER_ROOT/development/inference/codec-marker-handoff/test-manager-e4.mjs" \
  --manager-root "$FIXED_MANAGEMENT_ROOT" \
  --output "$FRESH_CODEC_E4_DIRECTORY"
```

Node24.19.0で確認。期待値はpassed true、新registryで128値/marker一致・8files実読戻し、旧registry unverified、旧writer mismatch/書込み0、store残留0。モデル/Worker/NN/取消は0。helperの依存5管理moduleは元eddaと同bytesであり、内部managerCommit表記は元実装pinのまま。receiverの実checkout対応は別source receiptで照合する。

新codec sourceは `2bdca59ea78580d4fe7a9d31a8de33209b64d029` / SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5` を明示する。旧registry/default native pinを暗黙置換しない。元のmarkerなしbytesとVAE855/raw経路はそのまま回帰対象とする。

## 実NNの受入

上記の保存試験では完了しない。既存decoder3assetと明示device予算がある環境で、`../norm-receipt-adoption/RECT-OWNER-HANDOFF.md` の新管理 `decode` / `cancel-recover` を実行し、現在のsource/request/local revision/owner終端/解放/実RGB保存receiptを返却する。既存encodeをやり直さず、今回のcodec receipt/configure成功を実dispatchへ付け替えない。
