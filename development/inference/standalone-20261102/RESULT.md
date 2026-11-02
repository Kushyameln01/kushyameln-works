# Text / VAE 単体検証結果

TextとVAEを個別に判定する。TextはT1入力検査とT3終了・保存が完了し、T2は9case中8件が数値合格、全512有効ID一件が固定gate不合格のため単体完成には至っていない。VAEの81×480×832 targetは実WASMのencode・独立raw decode・保存読戻し・取消復帰まで合格した。監視接続の喪失後も同じF80 processが完了し、全1,996,800 mean値・保存・native末尾処理・VAE側資源終了を受入済み。848×848の独立参照と実WASM bothも合格し、本計画のVAE必須選択ケースの受入は完了した。[中断状況と再開条件](STATUS.md) を参照する。

| モジュール | 詳細結果 | 現在の判定 |
| --- | --- | --- |
| Text T1–T3 | [TEXT-RESULT.md](TEXT-RESULT.md) | T1/T3完了、T2未完了。全512有効IDのmaxAbs0.0016480088233947754が事前gate0.001を超過 |
| VAE V1–V4 | [VAE-RESULT.md](VAE-RESULT.md) | target81・source F1/F4/F5・参照16×16/16×848/848×16は合格。必須選択ケースを受入済み。target81・source F1/F4/F5/F80・参照寸法境界、取消復帰・codec・VAE側終了を確認。全domainの網羅や実媒体/生成経路は別scope |

## 配布・実行source

repositoryは `Kushyameln01/kushyameln-works`、branchは `codex/text-vae-standalone`、基点は `498eb25f027666e3cc661a5851288e4aabf39f0a`。[Draft PR #18](https://github.com/Kushyameln01/kushyameln-works/pull/18) は `codex/inference-owner-capabilities` をbaseとする。配布SHAはGitHubの固定commit URLで参照し、各runの実行sourceを最新配布SHAへ付け替えない。

| 対象 | 完全source SHA |
| --- | --- |
| Text9case独立full512参照 | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` |
| Text現Node6件・Browser T3 | `b3e5e34430d58bca3bf69b8938ba87beb196d054` |
| Text block19限定診断 | `5b784339a6caf83728a529522538fd43d5fb68f8` |
| Text既知FAILのID512 canary | `5e6ebe212ca3c079f5d4cf65cf3fd24c4bc6f97f` |
| VAE69-unit export | `a7573012e98b6b94ad2c56788b4c14907f262201` |
| VAE target81独立参照 | `05198dba7959cc95e0c4d770fd85557ad4010a80` |
| VAE target81実WASM | `d578ec006571d82bc50c6c2935d78ae6ea838269` |
| VAE今回source F4/F5/F80・848² queue | `dccb88515775ec8aa86dd16f82e8816c9347ed38` |
| 公開full512 conditioning fixtureの固定配布 | `411210c5ebbd4f4dfb8e72e9dd97bff1a3712a4e` |

各source・原model・manifest・graph・Tokenizer・precision・事前gate・receiptの対応はモジュール別結果に記載した。取得確認のための再推論・再exportは行わない。

## API差分

既存 `works-ai-1` と独立ES module / MessagePort経路を維持する。通常入口は構成済みmanifest/filesとdescriptorを使い、独立参照、過去prompt hash、比較gate、詳細receiptを必須にしない。実行能力は `capabilities()`、通常結果は実shape・dtype・軸・意味・正規化・model/Tokenizer/decoder識別を返す。[API追補](API.md) と [公開API文書](../../../docs/shared/inference/API.md) を参照する。

TextのWorkerとNode参照hostは同じ共有jobを呼ぶ。Nodeの4GiB超model読出しとprepared graph読出しを修正し、同じgraph bytesを単一ArrayBufferへ直接readする。VAEは194の元係数を変更せず69空間symbolic unitとnative causal runtimeへ分割し、一度に一つのORT sessionを保持する。旧固定profileを維持し、stream manifestを別形式として追加した。generated sampleの数値復元はDiffusion側の責任を維持する。

`.wktensor` は供給済みnormalization marker、mask、model/Tokenizer、strict context、latentContract、元frameの末尾処理を保持し、旧markerなしファイルも互換読込する。管理snapshot・owner・trace・詳細receiptは外側packageへ置く。decode後はRGBと `inputDescriptor` を共に保存し、入力raw sampleの来歴を保持する。

## 証拠の再利用と新規検証

以前のP2 Rect、codec marker、固定Hello worldとresource比較、既存F1・5×16×16の受入は当時のsource・shape・入力・gateのscopeで維持する。新規domainの合格へ転用しない。保存済み9case独立Text参照とtarget81独立VAE参照を再利用し、source境界の参照は検証済みcausal prefixとして派生した。派生を新しいvendor推論とは記録しない。

[source再利用境界](evidence/source-reuse-boundaries.json) で、Textの通常runtime/既存harnessと、現在VAEのruntime/受入harnessに数値変更がないことをGit上で照合した。target81はVAE coreの同一性を確認し、caller全体の同一性とは区別する。Text block19の限定診断は既存ALL出力を再現したが最適化無効化の差は小さく、事前停止条件に従って探索を終了した。最終gateは変更していない。

今回の通常経路では全値比較、native codec保存読戻し、取消後の同一API再実行、session/Tensorの終了を検査した。Worker terminate呼出し、CDP可視pthread targetの消失、OSの生存processとzombieは別の証拠として記録する。sampled RSS/PSS、WASM capacity、共有cgroup、tmpfsを単一の必要RAMへ混ぜない。詳細はモジュール別結果と [evidence/index.json](evidence/index.json)。一部の大きいreceiptは元bytes/SHA付きのlossless gzipで保存した。

実L512 conditioning、全mask、選択manifest、来歴と任意の独立参照は [full512-conditioning/manifest.json](text/full512-conditioning/manifest.json) から取得できる。固定411210cのWKT・参照・manifestをGitHubから実取得し、bytes/SHAを確認済み。これは送付側の取得確認であり、管理/DiffusionによるACKやconsumerの数値合格とは別である。

## 実測資源と終了の残件

CPU4・cgroup16GiB、WASM4threadではcross-origin isolationとSharedArrayBufferを使用した。Text Node6件の所有group標本RSS peakは3,242,471,424 B、Browser T3は6,906,658,816 B。VAEの選択ケース中ではF80 encodeのgroup RSS/PSSが9,467,285,504 / 9,220,117,504 Bだった。これらを単一WASM32 heap容量、共有cgroup charge、tmpfsと混ぜて最小必要RAMへ換算しない。各時間・個別shape・WASM容量はモジュール別結果、実sample gapは [cadence観測](evidence/final-sampling-intervals.json) を参照する。

VAE側の既知Worker・sessionと各harnessの追跡browser子群は終了した。後続848 controller・reference/WASM harnessも不在を確認したが、接続喪失をまたいだ旧監視controller PID40303がPPID1のzombie（RSS0）として1件残っている。[最終process観測](evidence/post-run-process-observation.json) に分け、全起動processが無条件に0とは報告しない。

## 再現と未受入事項

[REPRODUCE.md](REPRODUCE.md) にsource固定、元modelとbundle、軽量検査、通常host、参照生成と実WASM受入の手順を記載した。既存assetがある場合はexportや重い推論を繰り返さず、保存済みreceiptとhashを照合する。

Textの全512有効ID数値gate、旧監視controller zombieのreap、未知の実媒体と各slotの実寸法、stream宣言域の全組合せ、Diffusion実generated sampleの復元receiptからのdecode、後段の管理保存・結合・製品生成READYは未受入。過去の全体Python52/53とLoRA公開台帳の不整合は今回の接続fixtureや数値受入の結果へ含めない。全repository試験の合格は主張しない。

PRはDraft、mergeとPages公開は行っていない。単体合格をモジュール間接続・本番生成READYへ読み替えない。
