# 実L512 P4共同数値検証 Implementation Plan

> **For agentic workers:** reference、native browser runner、LoRA owner接続、資源reviewを並行担当し、rootが事前固定・実行・公開を統括する。

**Goal:** 受領済み実Text L512を固定N2/block0のP4 baseへ渡して独立参照と全中間値を比較し、実LoRA適用は別scopeで接続する。

**Architecture:** 固定L4診断・旧Q16・旧N2 tailは元scopeで保持する。既存P4 coreと独立reference演算を再利用し、実packet専用の入場検査・入力identity・診断runner・資源receiptを追加する。新LoRA正本mappingはLoRA ownerから取得し、既存Diffusion F32 consumerへ渡す。

**Tech Stack:** Python/NumPy independent binary64 reference with declared F32 boundaries、Node、Playwright/Chromium、ORT WASM、Hike。

**Spec:** user指示2026-11-02 JST、固定`27776abb234fc12733c600b1dabd2fdab70e27ae/development/ai-connection/p4-recipient-roundtrip/2026-11-02/HANDOFF.md`、同treeのP4 CONDITIONING/WEIGHT-FEEDとcore/candidate-plan。

## Global Constraints

- 原Text配布 `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`、元encode/独立比較source `5537b8932343aa2476b95191817e8913f99dab02`。
- WKT whole SHA `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`、payload SHA `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`、8,388,608 payload bytes。
- float32 BLC `[1,512,4096]`、mask Uint8[512]全位置（有効3）、mask SHA `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62`。行削除・implicit padding・signed-zero変更禁止。
- model SHA `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizer SHA `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`、元header/producer/finalNorm/receiptを外側bindingとnative metadataに保持する。
- core/candidate-plan SHA `051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600`。local abs.001 rel.0001、composed abs.01 rel.001。結果を見て緩和しない。
- 元core順: Text Linear4096→5120/GELU(tanh)/Linear5120→5120、cross norm3/QKV/full5120 QK RMSNorm/40×128 attention/O/残差、FFN norm/modulation chunks3–5/up13824/GELU/down/gate/残差。
- crossにRoPE・masked softmaxを追加しない。全512行を消費し、Text最終RMSNorm済み入力を再正規化しない。
- 保存済みN2 self-attention residual/timeAct1をhash/意味付きで再利用し、prefix/attentionを再計算しない。HIGH1/LOW3は個別受入、実HIGH→LOWではない。
- 実モデル重み・scale・source/build/kernelは既存正本を使う。全モデル再download/全hash/全量常駐を行わない。
- `load/predict/sample=NOT_READY`、generationReady:false。本番shape・全block・全体資源・生成受入へ拡張しない。

## Review Focus

1. L4 fixtureへ実Textを改名して通さず、専用入口で元WKT/payload/mask/native metadata identityを照合する。
2. 独立referenceと入力identityをnative実行前に固定する。local referenceはruntimeの独立確認済み入力cutを使い、composedは保存N2+実Textだけから計算する。
3. 全512行のprojection/KV/normと全40headを比較する。mask0の509行もbias後に消費される。
4. F32 JSONまたはprivate binary transportの入出力を全bytes照合し、非公開値を公開receiptへ混ぜない。
5. 累積copy、max staging、実live span、WASM capacity、process RSS、cgroup current/peakを別欄に置く。測っていない全工程peakはnullとする。

## Task 1: 実packet入場と独立参照の固定

**Files:** `development/ai-connection/p4-real-text-l512/reference/`。元oracle `tools/diffusion-models/p4-cross-ffn-reference.py` の数値定義を変更しない。

- [x] 元WKT/header/data/mask/source/元receiptと保存N2 residual/timeAct1のhashを検査する。
- [x] bit-preserving native input artifactと全意味を含むsidecarを作り、F32 roundtripを検査する。
- [x] 既存gate・source/build・実行scope・入力identityを固定し、commit/hashを得る。
- [x] composed25cut独立参照を先行計算し、runtime前に出力hashを固定する。

## Task 2: 実L512専用native runnerと資源測定

**Files:** `docs/shared/diffusion-models/diagnostics/p4-real-text-l512/`、`tools/diffusion-models/p4-real-text-l512-browser.py`。

- [x] 誤model/Tokenizer、L4、誤mask、payload/metadata改変の事前拒否をnative constructor前に検査する。
- [x] 全512行のnative capture→既存createPostSelfAttentionへ接続し、入力/出力identityを保持する。
- [x] 実HIGH/LOWを別browserで実行し、25cut・全head・全parameter selectionを参照へ照合する。
- [x] 入力保持、workspace再利用、取消/終端、session解放、read lease寿命を測る。
- [x] copy/staging/live spans/WASM capacity/RSS/cgroup/timeをsourceと実行環境へ結ぶ。

## Task 3: LoRA正本mapping接続

**Files:** `development/ai-connection/p4-real-text-l512/lora/`、必要な公開接続moduleは取得したowner契約に基づいて決める。

- [x] 最新LoRA sourceを取得し、新canonical P4 mappingの存在・source/hashを確認する。
- [x] 未提供なら具体的なowner接続条件をPR2へ渡し、依存工程だけ保留する。Diffusionが低rank積を実装して埋めない。
- [x] 提供されたmappingをimmutable baseProvider/sink/package/実ORT matrix/Hike biasへ接続する。
- [x] 適用後独立参照・入力/weight/package identity・gateを固定して実行する。
- [x] candidate検証/切替/旧lease/復帰/解放・実copy/資源を別scopeで受け入れる。実LoRA取消は今回未受入として分離する。

## Task 4: 結果の返却

- [x] base実Textと実LoRAを別scopeでRESULT/API差分・source/build・reuse/new・未受入へ整理する。
- [ ] 固定sourceの取得path/bytes/SHA-256・公開manifest・再現手順を付けてGitHubへpushし、Draft PR14と管理/LoRA/Textへ返す（最終返却工程）。
- [x] merge・Pages公開を別記し、送信/本人ACK/数値受入を分ける。
