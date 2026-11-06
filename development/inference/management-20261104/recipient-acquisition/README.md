# 固定78954eeの取得確認

**ownerが受領側の取得手順を実行し、GitHub固定URLからテキスト9件と実ID conditioning WKTを取得した。全bytes/SHA-256が固定commitと公開manifest/indexに一致した。** 取得対象の配布・実装sourceは`78954ee92d1b76c6652f50df1668159a55db6dc9`（[固定tree](https://github.com/Kushyameln01/kushyameln-works/tree/78954ee92d1b76c6652f50df1668159a55db6dc9)、[Draft PR #20](https://github.com/Kushyameln01/kushyameln-works/pull/20)）。merge/Pagesを実施したという資料ではない。

実行者はVAE/TextEncoder ownerで、これは**owner-run recipient acquisition**である。管理/Diffusion担当が別の実環境で取得・運用したACKの代用とはしない。相手環境のACKは未取得。この作業では通常API呼出し、NN、export、参照再生成を行っていない。

## 実際の取得と照合

[plugin-acquisition.json](plugin-acquisition.json)に9件の固定URL・取得path・実bytes/SHA-256・固定git objectとの一致を記録する。本文はGitHub pluginの`github_fetch`で実取得した。テキスト合計848,447 bytesで、次を含む。

- `docs/shared/inference/API.md`
- `docs/shared/inference/management-adapter.mjs`
- `development/inference/management-20261104/API.md`
- Text `source-ordered-fp32/manifest.json`と`artifact-index.json`
- Text `norm-accepted/index.json`
- Rect `e6/fixtures/bundle-manifest.json`
- streamの固定threads4 manifest
- stream復旧の`asset-recovery/provider-receipt.json`

8MB WKTはpluginがUTF-8テキストのみ対応しbinary downloadを提供しないため、固定raw HTTPSへ切り替えた。継承したproxyとTLS検証を保ち、HTTP200で8,390,098 bytesを取得した。SHA-256は`efaed289fbeeb69a1fb6ab172d35d8e2f09bf164bedba5a360787cc29f4e4e29`で、取得済み公開`norm-accepted/index.json`と一致した。[binary-acquisition.json](binary-acquisition.json)に固定URL・HTTP情報・bytes/hashを保存する。

初回の通常sandboxではsocket作成が`PermissionError[Errno1]`となり、HTTP到達前に停止した。正規のnetwork追加権限で再実行して取得した経緯を残す。pluginやネットワークエラーを成功として省略していない。

## manifest・payloadの対応

[contract-cross-check.json](contract-cross-check.json)は受信物同士の照合結果をまとめる。

| 対象 | 取得・照合結果 |
|---|---|
| Text source-ordered manifest | 696,123 bytes、SHA-256 `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。同じ固定commitから取得したartifact-indexと一致 |
| 実ID WKT | 8,390,098 bytes、SHA-256 `efaed289fbeeb69a1fb6ab172d35d8e2f09bf164bedba5a360787cc29f4e4e29`。公開受入indexと一致 |
| Rect manifest | 4,820 bytes、SHA-256 `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`。RGB `[1,3,1,16,32]` ⇔ latent `[1,16,1,2,4]`を宣言 |
| stream threads4 manifest | 51,613 bytes、SHA-256 `532523034a5e5c7590c4fca11d67feec329c6e0e364afd55f472f03ffd8966d2`。同時取得したprovider receiptと一致 |
| stream資材記述 | manifestとprovider receiptの全71件のfile/bytes/SHA-256が一致。合計507,834,866 bytes。資材本体のremote取得ではない |

取得したWKTのheaderはfloat32 BLC `[1,512,4096]`、meaning `text_hidden_states`、最終marker `umt5-final-rmsnorm-f32-v1`、512個のmaskが全て1。model `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`とTokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`を保持している。

これは全512有効**ID入力**の実出力であり、plain・system/negative組立て・ComfyUI prompt重みを含むconditioning全体ではない。4096次元hiddenのDiffusion投影・cross-attention・FFNを実行した証拠でもない。

## sourceと数値受入を区別する

今回取得したsourceは78954eeだが、既存Text数値受入の実行sourceは`c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`、独立参照sourceは`5954d48e0fb6df1d6977964fd8a7ba2a242b6eff`である。現行source-ordered manifestの取得を、元数値実行manifest `40afd296805a8ecfbadcca1602cea2d1d93421f93db3af9b9b196b9a7af2e3af`でのrunを書き換える根拠にしない。status採用時の再利用説明と今回の取得確認は別scope。

同様に、streamの固定manifest/復旧receiptを取得できたことと、71資材のbytesを受領したこと、別環境で81frame実行が成功したことは分ける。元model、大きいText24graph、private VAE71assetは今回remoteから取得していない。既存owner環境のexact復旧は[asset-recovery](../asset-recovery/README.md)を参照する。

取得本文・binaryはprivate `/workspace/work/inference/management-20261104/recipient-acquisition-78954/`へ保存した。ここへは小receiptとindexだけを追加し、既存sourceや8MB WKTをGitへ重複保存していない。絶対pathは回収先の案内であり、取得済みの根拠は固定GitHub URL・実bytes/hash・公開index照合である。

未取得・未受入は、相手担当の独立環境ACK、大きいmodel/graph/stream資材のremote取得、新規通常API運用・数値比較、Diffusion全体接続、LoRA全体実験、生成READY。今回の確認は再推論・再exportを必要としない取得確認の範囲で完了した。
