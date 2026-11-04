# 固定配布744af89の最終取得確認

**push済み固定commit `744af89c861484b577acbc681f31d033589e9d45`のGitHub URLから、実conditioning 2件とAPI/HANDOFF本文を取得し、固定local git blobとbytes/SHAを照合した。** branchは`codex/text-vae-management-20261104`、[Draft PR #20](https://github.com/Kushyameln01/kushyameln-works/pull/20)。これはowner self-checkであり、相手担当の別環境ACKは未取得のままである。

[binary-acquisition.json](binary-acquisition.json)に2つの固定raw URL、HTTP200、保存path、実bytes/SHA、固定git blobとの全bytes/hash一致を記録する。GitHub pluginのbinary非対応という既存の理由に従い、継承proxy・TLS検証を保つraw HTTPSをstream取得した。

| 保存物 | bytes | SHA-256 |
|---|---:|---|
| 新しい長文plain WKT | 8390098 | `18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a` |
| 管理browser plain WKT | 8390098 | `6be07864f6c92601b689bfa69e0c4ddc870fdc3be4dc719f3d9c611ec4c1f101` |

前者は全512token有効の新plain Node出力、後者はL512・active3の管理browser出力。取得確認だけで両caseのscopeを統合したり、別の新規推論結果へ読み替えたりしない。

API/HANDOFFはroot ownerがGitHub pluginで本文を実取得し、JSで固定git本文と全文一致を確認した。[metadata-acquisition.json](metadata-acquisition.json)はこの完了済み取得証拠と、照合値を受領して包装した記録である。同一bytesのprivate保存は固定git objectから行い、新しいHTTP取得として数えない。

| 本文 | bytes | SHA-256 |
|---|---:|---|
| `docs/shared/inference/API.md` | 42824 | `45891a00dca969f1ab5ed9bd791bb07987dca44738dae6279cc0ea69ce16564a` |
| `development/inference/management-20261104/HANDOFF.md` | 7792 | `f35709ec85a3bc29afccffac623a6b91e741f5045d803260299417e072093084` |

取得物はprivate `/workspace/work/inference/management-20261104/final-acquisition-744af89/`へ保存し、Gitへ本文や8MB binaryを重複追加しない。各固定URL・保存path・bytes/hashをreceiptに残し、絶対pathの存在だけを取得済みの根拠にしない。

## 管理コードの取得scope

既存の[management-acquisition.json](management-acquisition.json)も保存した。実試験の管理source `e1661e561dfb1a4f20544ff48bc375175b5981d1`に対して15file・339,154 bytesが全て一致し、`5ab651395e245e35f9472ca1b24f5e61550a9957`と`a54382935423186dd3121d61a8b886b58cb08612`がその祖先であることを照合した。

実行した管理経路は`createTextVaeAdapter`・queue・capture・workspaceであり、新しい`normal-vae` facadeを実行したという証拠ではない。facadeのfile自体が同じでも関連normal-operationの変更は別にあるため、今回の受入を別経路へ拡張しない。ownerの取得確認と管理担当本人の別環境ACKは分け、後者は未取得のまま保持する。

この作業のNN/export/参照再生成は0。配布sourceは744だが、元の数値実行sourceやcapture/replay sourceを744へ付け替えない。相手担当へのコメントはこの作業では送信していない。peer ACK、追加の実API運用、Diffusion全体生成、merge/Pagesの確認を含めない。
