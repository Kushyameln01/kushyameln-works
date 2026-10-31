# E1 private base fragmentの独立受領

2026-10-31 JST。Pages Filesの明示参照を`read_page_reference`で実取得し、受領者専用folderに保存した。提供者local原本、Gitモデル、原本pathは取得元に使っていない。

- 受領JSON 709,364 bytes。
- SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。
- HIGH/LOW各5range、合計10rangeのbase64復号後bytes/SHAとfile範囲を検査。
- 受領header各1,815descriptorからweight/bias/scale/configのabsolute offset・dtype/full shapeを照合。
- 各registryのcanonical metadata digestを独立Pythonで再計算一致。正の有限F32 scale、有限E4M3FN code、有限F16 bias、comfy_quant formatを確認。

公開receiptはmetadata・hash・offset・件数だけで、raw Q、header bytes、bias bytes、base64を含まない。private受領実体は`/workspace/work/diffusion-e1-receiver/base-blocks.json`。このpathは結果の保持先であり対向の取得方法ではない。

取得手段はprivate Page file tool。private fileのリンク公開は承認待ちであり、この公開receiptには取得用の生referenceを記載しない。

これはPARTIAL実base断片の受領・整合検査である。保持済みfull modelの過去owner receiptは独立認証せず、今回full hashも再計算していない。LoRA原本4つの受領、SDK/Hike計算、実ORT出力、実LoRA共同試験成功は本検査から認定しない。
