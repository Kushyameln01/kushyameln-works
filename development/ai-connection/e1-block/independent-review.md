# E1 provider / LoRA v2 adapterの独立確認

2026-10-31 UTC。runtimeは変更せず、固定LoRA SDK `2bba90785292e42a0c7c8756685b0d8b128b2dcf`との境界、private Page file toolから独立受領したartifactによるHike復号、実ORT境界を確認した。対象worktreeの基点は`438972f30242e0a3bc66edb8591f38eaa0fcd384`。未commitの対象コードは`independent-review.json`の各SHA-256で固定している。

- 実SDK/Hike + synthetic source/base + CONTRACT_TEST_ONLY stageのNode試験は20/20、skip 0。
- 実HIGH/LOW断片 + Hike providerのNode試験は8/8、skip 0。入力は提供者local原本ではなく独立受領artifact 709,364 bytes / SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。
- 同じartifactをChromium `154.0.8037.57`へFile入力し、Q `[16,5120]`とbias `[16]`について不変baseのHike復号→owned F32 provider→変更していないconsumer→実ORT 1.24.3 WASM→Hike biasをLOW/HIGHとも確認。独立referenceとの差は最大絶対誤差0。範囲外・誤identityを拒否し、取消後の再実行、出力の所有、Hike workspace再利用も確認。page errorと元model requestは0。
- provider Hike Memoryは各1,572,864 bytes。ORTを含むOS全体ピークは未測定であり、この試験をモデル全体のMemory成立根拠には用いない。

reviewで見つかったfinish/prepareLoadの失効時割当て保持、restoreBaseのBUSY時candidate保持は作者が修正した。restoreBaseは独立の小さな再現で、修正前の「rollback BUSYで所有参照を失う」REDから、元例外とcleanup例外を保持し、`RECOVERY_REQUIRED`で再利用を止め、`recover()`後に復帰するGREENへ変わった。readonly reviewの対象範囲に未解消の阻害指摘はない。

SDK/native registry digestの分離、元full offset→選択slice offset、runtime-input weightとhike-parameter bias、detailの不変bias通過、lightの明示bias patch、manifestの各識別、await前の所有入力snapshot、PARTIAL限定、rollback epoch/current判定を確認した。低rank演算は固定LoRA SDK/Hikeが担当する。

実LoRA原本4つ、実LoRAとの共同数値試験、生成sample、全モデル推論、管理snapshot受入れは未確認。`load/predict/sample`のNOT_READYをこの確認から解除しない。full model hashは再計算せず、過去owner receiptは独立認証していない。公開成果はmetadataだけであり、private payload・base64・private fileの生referenceは含めない。private fileのリンク公開は承認待ち。
