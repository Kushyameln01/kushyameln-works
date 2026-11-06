# Diffusion PR14・994ebb9 取得確認

2026-11-02 JST。固定head `994ebb9ce01c9e95db9cd18eb877a981152693c5` を取得した。**実f76 Text L512を使ったHIGH/LOWのcomposed独立参照receiptは追加されているが、成功したnative P4数値比較の証拠はこのheadにない。** `generationReady:false`、`load/predict/sample=NOT_READY` を維持する。

[取得一覧・hash・判定](ACQUISITION.json) に、前配布27776からの全24公開file、258,272 bytesの固定ref/path/bytes/SHA-256/Git blob、旧runtime50件の照合結果を記録した。各公開sourceは固定Git URLで参照する。source本文と非公開arrayをこのdirectoryへ重複コピーしていない。

## 追加されたもの

| commit | 確認した内容 |
| --- | --- |
| `741f1abe675eda328c7e65bb4e5903885be9ac22` | f76 packet・全512行/mask・既存gateと独立oracleを固定。HIGH/LOWのcomposed25cut receipt |
| `538843e144339c917cfd244724204e8833204fcc` | L512専用native diagnostic入口、実行source検査、binary出力transportと資源計測の準備 |
| `994ebb9ce01c9e95db9cd18eb877a981152693c5` | source inventoryからignored生成fileを除外し、必須entryを明示。未追跡の必須entryは拒否する検査を追加 |

旧P4のbuild `bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b` が列挙する50 sourceは、宣言された全bytes/SHA-256と一致した。各Git blobも7ee・27776・994の間で全件同一だった。新しいL512専用診断sourceの追加と、旧P4数値runtime50件の不変を分けて記録する。

## 参照receiptと実payloadの取得状態

固定入力はText配布 `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`、producer実行 `5537b8932343aa2476b95191817e8913f99dab02`。BLC `[1,512,4096]`、mask512位置（有効3）を保持し、maskはmetadataとして扱う。元WKTの全体SHAは `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`。

管理側に既にあった `/workspace/work/ai-connection/p4-r11/runner/plain-conditioning.wktensor` は8,390,054 bytesと上記SHAが一致した。この作業で新規取得したpacketではなく、hash確認だけでproducer認証やP4実消費を認定しない。

| side | ownerが報告したprivate manifest SHA-256 | 報告bytes / 公開identity数 |
| --- | --- | --- |
| HIGH | `8dd640f0cbf127c149903eec558ea2a5b804a5bc0a4533dab67ae54da86ec97d` | 33,587 / 25 |
| LOW | `530746b1e2d59d0c9cbe82e1ddad6d743ae32eb8fd7029f56cca694b57672be7` | 33,586 / 25 |

公開された各receiptの25個の出力identityとmanifest hashは、公開pre-runtime freezeの記録と一致した。private manifestとF32参照array自体は未取得で、hash照合したとは報告しない。owner指定の `/tmp/p4-real-text-l512/composed/{high,low}/manifest.json`、native入力JSON、元WKTのowner側pathは、この環境では観測時に存在しなかった。上の管理側WKTは別pathにある。

## 実行source538と修正source994を区別する

最新の公開attemptは `REJECTED_BEFORE_CHROMIUM_OR_NATIVE`、source538、native construction0・numerical run0。ignored生成 `latent-space/build/runtime.js` が広いfilesystem inventoryへ混入し、tracked-set検査で拒否された。994はこの入場検査を修正したsourceであり、修正後の実NN成功記録ではない。

公開pre-runtime freezeはsource538を指し、`nativeExecuted:false`。994のdriverはcurrent committed HEADと実行source、freeze内sourceの一致を要求する。538のfreezeを994の新規実行証拠として流用できない。数値参照を再計算したことにする必要もない。既存参照を再利用するなら、元のmanifest・全出力hash・入力・gateを保持し、実行するsourceと結ぶ別の明示的なfreezeが必要になる。

新しい実L512の数値受入に必要なのは、private参照実bytesとidentity照合、994へ結び付いたsource/freeze、実native25cut、ownerが事前宣言した比較scopeの全値比較、lifecycle/resourceの証拠である。旧L4診断や独立した既存P4作業を一括保留する理由にはしない。LoRA ownerのcanonical P4 mappingは、このheadのSTATUSでも未取得のまま。

## 再現

Git objectを取得済みのrepositoryで、公開metadataと固定bytesの確認だけを再実行できる。

```sh
python development/ai-connection/p4-management/diffusion-return/verify.py --repo /path/to/kushyameln-works
```

この作業で保存した全24fileのcopyも併せて確認する場合:

```sh
python development/ai-connection/p4-management/diffusion-return/verify.py --repo /path/to/kushyameln-works --acquired-root /workspace/work/ai-connection/p4-r11/diffusion-994
```

個別の原文は `git show 994ebb9ce01c9e95db9cd18eb877a981152693c5:<path>` で取得できる。verifyはGit bytesと公開receiptを照合するだけで、project sourceをimportせず、private参照を復元せず、NN・export・新しい比較を実行しない。外部送信・commit・pushは行っていない。
