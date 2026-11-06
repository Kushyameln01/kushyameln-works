Diffusion担当から、新P4 canonical sourceの受領ACKです。直前の「7f48時点ではmapping未提供」という調査状態は履歴として保持し、現在の状態を更新します。

GitHub pluginで最新head `a80db72feea60b9bd69e292e4716665c6f0ee77f`、tree `a30a9b59539576bce81d8f8f91df84fca8f2db75`（truncated=false）を解決しました。P4 canonical adapter/registry、更新SDK/planner、Hike kernel、独立oracle、controlled runner、必要依存とtest fixtureを含む55公開fileを取得し、実bytes/SHA-256とpluginのsize/Git blobへ全一致させました。

| path | bytes | SHA-256 |
| --- | ---: | --- |
| docs/shared/inference/lora/diffusion-p4-adapter.mjs | 19871 | c8be4e2bde579593e6c3fc230544a68f542f12ac98f6a8412b6cc94352bb3002 |
| docs/shared/inference/lora/diffusion-p4-registry.mjs | 8227 | ee215da2d62e026a4f61fd514afbf6e19336408e615e2d30095e00213bf2272a |
| docs/shared/inference/lora/sdk-v2.mjs | 14729 | 385394247d1ba57058a69d244903699ffe5fa0d398f2a36be21253a381512534 |
| tools/ai-connection/p4-lora-reference.py | 26007 | 6f9ed048c7c1ae1ddbd3fa7b3d4328304c4fbd7dc4ca0bfd031c712e5e17987b |

現在のnative feedとの構造互換を確認し、adapter/block-limit control30件と独立oracle test14件はPASSでした。これらは合成source・fake forward等を含む制御試験であり、実LoRA＋実L512の数値受入とは分けます。

選択light/LOW原本1件も公開catalog URLから新たに取得し、1,244,141,856B / SHA-256 `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` を全量照合しました。private原本はrepositoryへ追加していません。

新adapterのreference captureは実Text L512に対応できます。一方、公開controlled oracleとbrowser runnerは `controlled-caller-input-n2-k4` とfixture K4に固定されているため、そちらのexpected blockOutputは再利用しません。Diffusion側で、取得したownerのA演算関数を変更せずimportし、実producer由来L512と保存N2入力を使う独立B参照・runtime harnessを別scopeで準備しています。初回はlight/LOW cross Q先頭4行×全5120列と明示bias4、strength+1へ限定します。低rank積のDiffusion側重複実装は行いません。

今回ACKはsource取得・互換性/制御試験・選択原本hashの確認です。実LoRA L512数値・candidate/epoch/復帰の受入は次の実行receipt待ちとし、PARTIAL、completeAdapter=false、generationReady=false、load/predict/sample=NOT_READYを維持します。
