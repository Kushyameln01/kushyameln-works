# E2/E4：実測済み64要素meanとRGBの管理保存往復

2026-10-31 JST。前回の`7e091192232fae36367b550ca5fada88915a0703`を引き継ぐ。最新の総合仕様1.1-draft.1（198 block）、実行計画0.2-draft.2（134 block）、Diffusion引継ぎPageの本文とGitHub実sourceを再取得した。管理a268、Diffusion438、main029に前回からのcode差分はない。既存のNN受入、64要素Hike検査、管理の75件を再利用した。

今回進めたのは、実測済み出力を管理の実capture adapter・queue・packageへ通し、保存した実bytesから回収する境界である。管理UIやnative operationを起動した試験ではない。native API・codec・Hike数値処理と管理実装は変更していない。

## 固定原本と入力

| 対象 | 完全commitまたはhash |
| --- | --- |
| 管理正本 | [`a26879057d169cb2eecff30503d64adba5057c52`](https://github.com/Kushyameln01/kushyameln-works/tree/a26879057d169cb2eecff30503d64adba5057c52) / Draft PR #7。前回取得済み32fileの実bytes/hashを今回も照合してからimport |
| Diffusion正本 | [`438972f30242e0a3bc66edb8591f38eaa0fcd384`](https://github.com/Kushyameln01/kushyameln-works/tree/438972f30242e0a3bc66edb8591f38eaa0fcd384) / Draft PR #6。新たな数値変更なし |
| G1C native codec | source54bfeadbd83f1fea074c503c0e05ec478aba5cfb、SHA-256 `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b`。本branchも同じbytesを保持 |
| 実64 mean | `../current-peers/restored-still64.wktensor`、843 B、SHA-256 `133ec18d70bbdb1d8cf999328a04865b79e6aa9dbcb03e47f7b8164184ccc0cb` |
| 実RGB出力 | `../current-peers/restore64-rgb.wktensor`、3658 B、SHA-256 `c8e521a29dabec3fb5f3bf41d755e98d39791ca423764d9d77a8448a9400d966` |
| 元decode証拠 | `../current-peers/joint64-acceptance-results.json`、SHA-256 `844f702dcacc3faa3c5bbbdb6c065a4d43b8729364b0c67c1a8448f943a22a26` |

meanはfloat32 NCTHW `[1,16,1,2,2]`、`raw-posterior-mean`。RGBはfloat32 NCTHW `[1,3,1,16,16]`、`raw-decoder-rgb`。両方とも元VAE SHA `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`を保持する。元Wan sourceは`9737cba9c1c3c4d04b33fcad41c111989865d315`。新しいproducer、generated meaning、decoder hashへの付替えはない。

## 保存と回収の結果

`captureNativeTensor({tensor,response,...})`でnative tensorと元evidenceを所有コピーにし、管理の実`createInvocationQueue`でfile処理を直列化した。元WKTは再encodeせず、そのまま`writeArtifactPackage`へ渡した。実directoryへ書き、`readArtifactPackage`で全bytesを回収し、2artifactとも`complete`になった。

- mean全64値、RGB全768値とnative metadataは元WKTと完全一致。これは保存往復のbit一致であり、新たなNN比較値ではない。
- contextのinput/slot、frame番号`[0]`、時刻`[0]`を保持。元contextは診断用宣言であり、元実媒体の真正性を新たに証明したものではない。
- RGBの外側evidenceへ元decode evidenceをそのまま保持し、入力meanと出力RGB両方のwhole-file hashを明示した。元model、profile、graph/外部重み識別、正規化なしの証拠を失わないよう、元報告・Diffusionの結果・元F1 manifestもpackageへ保存した。
- strict native context/latentContractへ管理fieldを追加していない。descriptor、owner、trace、evidenceは外側に保存。snapshotは明示的`null`で、生成snapshotを作成した扱いにしない。
- evidence欠落は`REQUIRED_ASSET_MISSING`、native header改変とpayload改変はそれぞれ`ASSET_HASH_MISMATCH`で拒否。faultは読取り境界にだけ注入し、保存した原本bytesは変えていない。

packageの`complete`は、この診断registry・必要file・sidecarが回収できた状態を示す。producerの真正性、モデル適合、全体生成の受入を意味しない。今回のregistryはG1C strict metadataを検査する専用診断宣言で、製品共通registryへの採用とは区別する。

`package/`が実際に回収した生成物、`results.json`が全file hash・shape・比較・拒否結果、`process-resources.json`が今回のfile検査資源記録である。元モデル・大型ONNXは含まない。

## 資源と検証scope

モデル推論、export、原本棚卸し、参照tensor再計算は0回。Browser/Worker/ORT sessionの起動もない。queueの同時file処理は最大1、全処理後にstore参照0、queue dispose完了・quarantineなし。

単独Node childのLinux最大RSSは44,249,088 B。数値は今回のmodule読込みとfile保存検査のもので、端末全体やモデル推論のpeakではない。直接子processは終了・wait済み。50msの所有子孫観測では生存0、zombie0、error0。以前のNN/browser資源記録とは合算しない。所要時間・CPUとPID/ctimeは機械可読記録を参照する。

新しいharnessと既存接続fixture12件が合格した。初回のCLI確認は既存manifestのfilenameを誤って指定し、入力読取りでENOENTになった。正しい`bundle-manifest.json`へ修正後に成功し、別のfresh出力先で資源観測付きの受入を行った。これはモデルや判定gateの変更ではない。

## 残る条件と次担当への受渡し

- E2：Textのplain `[1,512,4096]` / ID `[1,L,4096]`、mask/Tokenizer、複数producerとdecoderの既存fixture成果を維持。今回はText NNや新しいgenerated sampleで再検証していない。
- 管理：live native operationを通すChromium全工程、E5 snapshot/cache、生成受付は未受入。既存exampleの`decode-mean`等をnativeの`decode`へ無断流用しない。
- Diffusion：438の64 mean専用対応は受入済みのまま。非正方形`[1,16,1,2,4]`は引き続き非対応、旧codecのcontext/Tokenizer欠落も残る。明示G1C codecまたは情報を保持する外側packageが必要。
- VAE：既存F1正方形・非正方形診断profileを維持。実slot媒体の寸法、81frameと最終generated decodeは未受入。実producerが成立するE8/E9までgenerated sampleをmeanへ改名して通さない。数値復元はDiffusion所有。
- 全担当のGitHub共有・こちらの実取得・境界検査・相手本人のACKは別状態。今回の確認だけで相手本人の受領/合意を代弁しない。

再現は[REPRODUCE.md](REPRODUCE.md)。API差分はない。`works-ai-1`、connection-1と従来mean経路を維持する。
