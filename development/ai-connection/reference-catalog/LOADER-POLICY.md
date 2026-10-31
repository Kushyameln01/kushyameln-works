版1.0-draft.1／2026年10月31日 JST。状態：文書化した参照規約。管理runtimeへの導入は未実施。

# 目的と正本

loaderが何をどう解釈するかを版付きで特定する。数値式・演算順の正本は数値規則とLoRA/Diffusionの実装に置き、管理はloader ID、variant、dtype、対象shape、source・証拠の対応を照合する。ファイル名やモデルの通称から適合を推定しない。

機械参照用ファイルは `loader-policy.v1.json`。recordIdは本台帳の新設IDであり、native APIへ追加するフィールドではない。

# 規約一覧

| 台帳recordId | native規約 | ownerと用途 |
| --- | --- | --- |
| LOAD-COMFY-LINEAR-DIFF | comfy-lora-b5a4321-linear-diff-v1 | LoRA。Linear down/up・A/B、加算diff・diff_bの限定subset |
| LOAD-LOCAL-SAFETENSORS | 固有profile IDなし | ファイルを読む各owner。ユーザー選択のローカルFile/Blob、明示sourceFactory |
| LOAD-V1-FULL-ONLY | 版付きv1 adapter | LoRA。実initializerかつFULLに限る旧契約互換 |
| LOAD-FP8-BASE | scaled-e4m3fn-scalar-f32-v1 | Diffusion。復号後のowned F32をLoRA境界へ渡す |

# LoRAの読込み・適用条件

標準LinearはDOWN `[rank,in]`、UP `[out,rank]`。A/BではAがDOWN、BがUPに対応する。alphaが明示された場合はalpha/rank、欠落時は倍率1を使う。この欠落規約は上記policyの限定subsetにだけ適用する。alpha=0や負数を欠落と扱わず、rankはfactor shapeから検査する。実際のf32演算順は `NR-LORA-LINEAR-F32` を参照する。

`.diff` と `.diff_b` はstrength×deltaを加算し、rank/alpha倍率を掛けない（`NR-LORA-DELTA-F32`）。`.diff_b` 対応は一般のbias学習形式すべての対応を意味しない。呼出し側はstrengthを明示する。旧workflowのHIGH=3/LOW=1をlight/detailの既定値へ流用しない。

sourceはBF16/F16/F32。baseと出力はF32 row-majorの対応する1D/2Dで、Linear低rankは2Dに限定する。転置・融合・Conv・DoRA/LoHa/LoKr/mid/reshapeや量子化baseの直接入力は拒否する。未知形式をflattenして受理しない。FP8の復号とsource storageの解釈はDiffusionが持ち、LoRAはowned F32を受け取る。

適用や強度変更は常に不変baseから再構築する。SDK v2の `inspect → plan → prepare → stage` を区別し、`stage` はconsumerの検証・commit receiptと照合する。`release/recover/dispose` は各ownerの寿命契約に従う。存在しないv2のapply/detachを新設した契約として書き換えない。外側adapterの `restoreBase` は選択sliceの診断操作である。

# ローカル入力と適合判断

製品入力はユーザーのローカル `.safetensors` File/Blob。過去のlight/detail各HIGH/LOWの4原本は検証例であり、利用の必須取得条件ではない。Google Drive等のURLは資料の受渡し先として区別し、ローカルFile APIの代わりにしない。

sourceFactoryによる明示注入を維持し、DiffusionのFile登録APIだけをLoRA単独利用の必須入口にしない。対象モデル・graph・registry・ファイルhash・対応variantが不明なら、そのedgeはUNVERIFIEDとする。既知の非対応variantや対象shapeの相違はINCOMPATIBLE。inspect成功は適用成功や生成受付の証拠にはならない。

v1 adapterは実initializerかつFULLに限定する。PARTIALやruntime-inputをinitializerへ詰め替えて通さない。`legacy-boolean` の証拠はその水準を維持する。

# mappingと担当境界

full shapeと選択slice、SDK/native registry、sink/consumer取引の対応はLoRA所有の `createDiffusionDiagnosticAdapter` が正本。Diffusionはnative registry/provider/sink/consumerと復号を所有し、管理はrequest・revision・resource bindingを所有する。管理は数値mappingを再実装しない。

管理の `createAdoptedLoraAdapter` がowner adapterを注入する経路と、旧 `createDiagnosticLoraBridge` を重ねない。旧bridgeは固定sourceによる回帰専用経路に限定する。

# 固定出典と残る範囲

- LoRA fc2789a0f649e33f15eb13750e6a983b5c52d170：`docs/shared/inference/lora/CONNECTION_V2.md`
- ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4：`comfy/weight_adapter/lora.py`、`comfy/lora.py`
- 管理28596717182e48aeb23c719c51b6e593edf4e496：`docs/shared/ai-connection/API.md`
- Diffusion 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3：`docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md`

本規約は限定PARTIAL診断と接続判断を整理したもの。全target・実sessionのE5、本番生成と資源予算の受入を追加認定しない。

# 文書の参照先

[総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)／[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)／[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)
