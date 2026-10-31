# A0 Diffusion source baseline

2026-10-31 JST。Diffusion担当の確認範囲。管理実装/他moduleのprivateコードを変更しない。

| Source | 固定版 / 取得状態 |
| --- | --- |
| 実装計画 添付本文 | 0.1-draft.1、SHA-256 770d1cdc26c07548cbe12b33cba93d3f22ab3b565ff58b0ba978f3983ff9c64d、本文取得・A0/F1/L1採用 |
| 総合仕様 添付本文 | 1.1-draft.1、SHA-256 0744a98219c6ddab4880773029e6318de3e770c8e14e1bb2edbb1bf25c1c3944、旧1.0読了と分離 |
| main/G2/G3 | 029ce9336a61e53bc6172fa4a7b7189b15f2efa0、着手時origin再取得、指定APIに差分なし |
| 原Diffusion調整案 | 9023329b8d803306abcdd9342f24c01ba0df2676。固定archiveとmanifestで取得可能。CORE-CONTRACT-MAPPING.md参照 |
| G1C | 6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095、API/tensor/RESULT/PROFILESをread-only取得。mainへmergeしない |
| core | ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4、実source/hash/行をCORE-CONTRACT-MAPPINGへ固定 |
| BerniniStudio | ca69274a2d2135052489bc0c67a2d79a64225e86は公開候補。元利用pluginとの同一性未確認 |
| Hike/ORT | Hike 3c51fde6675f317453919bd505d0e2d0f638e7f1、既存owner builder、ORT Web WASM1.24.3 |

添付計画の`tools/diffusion-models/build-info.py`はこのbranchには存在しない。正本CLIは `python docs/shared/diffusion-models/api/build-info.py`。source閉包とkernel receiptはそのbuilderで更新し、check-build.pyで再生成一致/全digestを照合する。新しいtest/reference toolsだけをtools/diffusion-modelsへ追加した。

G1C RESULTの旧52/53と最新報告53/53は異なる時点・証拠として維持する。他担当試験を今回再実行したとは扱わない。総合仕様§8の「成功した登録は適用成功ではなくappliedである」はfalse欠落の表記で、native APIのapplied:false/loraApplied:falseを変更する根拠としない。

総合仕様の文書版1.1、共通works-module-contract/1.0-draft.1、保存works-artifact-package/1.0-draft.1、native diffusion-models/0.1、未実装生成案0.2-draft.1、今回の診断registry/consumer0.1は別系列。新診断契約はDiffusion側実装であり、LoRA新plannerとの相互合意・実LoRA比較・共通規格adapter完成とは分ける。

model原本の以前の全file検証は保持manifestから再利用。今回providerの任意File受入はheader/config/scale/range検査でありfullFileSHA256Verified:false。部分のhashを全原本hash証明へ昇格しない。


## E0/E6/E7 追補 2026-10-31 JST

総合仕様Page1.1-draft.1（198block）と接続検証・本番実装実行計画Page0.2-draft.1（133block）をPage閲覧toolで本文取得。添付の各本文も取得し、Page版の取得・旧0.1実装計画を区別した。Page本文canonical UTF-8 SHAは総合f4bd12b8e0b6a58d1b4205f8af12aed701c578937c33f9daf837eea2dee04015、実行計画19c9e29a1087d409fc2edb7c91fbe14cc7e967dea6c847f1b2bdfb00db7cdb2f。

Diffusion取得用Page: https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d 。f522/902のarchiveをUTF-8 base64 JSONpartsでも提供し、提供者localを参照しない独立Page回収・復元がPASS。受領証拠e0/independent-retrieval.json。LoRA担当本人の取得・合意とは分離する。LoRAv2の可読契約等4JSONは受領、SDK ZIPの読出し形式制約とdetail原本経路不足はe1/acquisition.jsonに記録。SDK実装を報告から再構築せず、実共同試験はBLOCKED。

E6は64専用profileとABI/host/kernel/receipt、E7は独立tiled-q実行候補を追加。builderに全新runtime sourceを登録する。2026-10-31の追加指示で作業branch pushとDraft PR作成を許可された。GitHubへのsource提供と、merge/Pages deployment、実model推論成立は別状態である。

GitHub push後、LoRA source `2bba90785292e42a0c7c8756685b0d8b128b2dcf` をGitから受領し9fileのGit blob/bytes/SHAを照合した。可読契約3点も同一bytes。SDK source未取得の阻害は解消し、4原本の受領・実共同試験は引き続き保留。実署名とstrict registry/closureによる期待値供給の差分はe1追補に記録した。
