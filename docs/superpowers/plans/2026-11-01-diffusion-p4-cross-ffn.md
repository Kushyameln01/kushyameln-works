# P4 cross-attention・FFN接続候補の実装計画

> **For agentic workers:** Use subagent-driven development with disjoint files, review each boundary, then integrate and review the whole candidate. Steps use checkbox tracking.

**Goal:** 保存済みN2自己注意残差から実baseのcross-attention→FFNへ進む独立候補を実装し、conditioning・LoRA weight feed・複数stage資源の成立範囲を示す。

**Architecture:** 固定N2 tailとそのhash検査は変更しない。新しい`post-self-attention` ownerが入力を所有コピーし、Text投影・cross norm/QKV/全40head/O・FFN chunks3–5を実Hike/ORTで実行する。元baseのHike復号と疎な最終F32 patch供給を別ownerにし、変更後weight/biasを実ORT/Hikeへ渡す。低rank積はLoRA側のまま維持する。

**Tech Stack:** 既存ES modules、ORT Web WASM F32 Gemm/attention graph、Hike WASM、独立Python/NumPy reference、Chromium/Playwright。

**Spec:** 今回のユーザー指示1–4、既存共通仕様・接続実行計画、Profile台帳1.0-draft.1（固定6dae9a6fac3e9ad29ea941f22211edbe4aa894ad）、保持した元ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4 core。

## Global Constraints

- 着手HEAD/remote Diffusion: `508d72cc9036e7f500827465c644b4aed3c5f711`。管理latest `60d16b64d6020d3d20239f087f8add91268dcaad`は既存tailを限定受入済み。過去resultを書き換えない。
- 固定tail実行source `a49aac492cc68e2dd6037e0deb4a6954731a847a`、profile `bernini-block0-n2-self-attention-residual-f32-v1`を回帰として維持。
- 新候補profile `bernini-block0-n2-cross-ffn-f32-candidate-v1`。HIGH1/LOW3は個別検証、実HIGH→LOWではない。
- core順序: affine LN(norm3)→cross QKV/full5120 RMSNorm→40×128 attention(no mask,no RoPE)→O→ungated残差→nonaffine LN→e3/e4 modulation→FFN up/GELU(tanh)/down→e5 gate→cross残差。
- epsilon=1e-6。cross O/text/timeはF16、cross QKV/FFNは各自scaleを持つF8_E4M3→Hike F32。FP8 activation/GPU precisionとは別。
- N=2、実full hidden5120/FFN13824。既存decode上限81920要素を維持。FFN downは全13824列×4出力行でtile化し、inner分割による別のreductionを持ち込まない。
- Text BLC `[1,L,4096]` float32とmask・producer・model/tokenizer識別を所有コピー。全L行を保持し、masked行を削除せず、mask付きsoftmaxや暗黙paddingを追加しない。
- 実Text payloadは着手時未取得。実producerとの共同数値受入だけ保留。明示fixtureによる別入力候補を本番入力と呼ばない。実Textを受領した場合も新しいinput/reference bindingで追加検証する。
- 入力・重み・reference・package・sourceを実bytes/hashへ結ぶ。model全量hash/download・prefix再計算はしない。private値・scale・配列はGit/HTTPへ公開しない。
- `load/predict/sample=NOT_READY`, generationReady=falseを維持。merge/Pages公開を行わない。

## Review Focus

1. masked Text行・tokenizer欠落を黙って補完しない。Lを保ち、情報がないproducerにはunknownを保持。
2. fixed residualとLoRAで変わった別residualを同じ証明として扱わない。候補は意味・source・input hash・独立referenceを別に固定。
3. cross OをFP8として読まない。registryはoriginal full shape、actual bindingとFP8/F16 profileを個別保持。
4. cancel後の元ORT Promise終端とsession/tensor解放を待つ。stale candidateをcommit/rollbackさせない。
5. stage別peakや累積copyを足して全工程peakと呼ばない。実同時保持を測り、unknownはnull。

## Task 1: Conditioning契約

**Files:** 新規`docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs`・同test、`development/ai-connection/p4-cross-ffn/CONDITIONING.md`と機械契約。

**Interfaces:** `captureP4Conditioning(tensor, {expectedModelSha256, expectedTokenizerSha256})`。UMT5のF32 BLC/meaning/mask/識別を検査しowned snapshotを返す。fixture用入口は別名・別producerにし、Text model識別を偽装しない。runtimeとの返却形は実装前にrootへ通知。

- [ ] 取得したText d2e9e3cba6269464bf556acc73c0b97030f75b5f、VAE855f435120f08eb9e818e51281fc26f0e2633829と実receiverの差を記録。
- [ ] shape/meaning/mask/tokenizer欠落・共有/変更入力の失敗testを先に実行し、境界実装で成功へ。
- [ ] producer ownerのfinal RMSNorm、Diffusion ownerのtext_embedding/latent変換を明記。対向担当の未確認事項を共同受入としない。

## Task 2: 不変base/provider・疎F32 sink/consumer

**Files:** 新規`post-self-attention/source.mjs`、`weights.mjs`・test。

**Interfaces:** `createP4WeightSource({file,side,bridgeBytes})`→`describe/readRows/readVector/addBias/stats/dispose`（既存tail sourceと同形）。`createP4WeightFeed({source})`→明示registry・owned F32 provider・patch sink/candidate・epoch付き切替。runtimeはfeedの`readRows/readVector/addBias/describe/stats`を使い最終F32をORT/Hikeへ渡す。詳細signatureはownerからroot/runtimeへ通知。

- [ ] 既存Q16/82bのsourceを変更せず、actual original key/full shape/binding/map/scale profile/base graph registry識別を新規定義。
- [ ] 誤binding・範囲外・欠落coverage・重複・変更bytes・abort/release・stale commitの失敗test→実装→成功。
- [ ] patch対象外はimmutable-base pass-through。低rank積を実装しない。consumerでの最終F32実feedをbrowserで検証。

## Task 3: 実cross-attention→FFN owner

**Files:** 新規`post-self-attention/{stage,linear,math,registry}.mjs`, `math.hike/build.py/kernel.wasm`・focused tests。

**Interfaces:** `createPostSelfAttention({source, ...owned wasm/graph resources})`→`run({residual,timeAct1,conditioning,signal,onProgress})`、`stats/dispose/recover`。2×5120 residualと5120 timeAct1からnamed intermediate/output arrays・hash・source/copy/capacity/timing evidenceを返す。conditioning表現はTask1との確定形に従う。

- [ ] Hike mathのLN affine/GELU(tanh)/RMSNorm/gating、ORT inner13824の正しい失敗test→実装→成功。
- [ ] 既存score graph/stream accumulatorを全40head・実Kへつなぐ。tail/prefix ownerのfixed hashを変更しない。
- [ ] stageごとの入力・weight snapshot・返却arrayとHike/ORT Memoryを数え、workspace再利用・cancel/disposeと実feedを検証。

## Task 4: 独立reference・結合実行と資源

**Files:** 新規`tools/diffusion-models/p4-cross-ffn-reference.py`, reference境界tests、`p4-cross-ffn-browser.py`/runner、`development/ai-connection/p4-cross-ffn/`のgate・結果・再現。既存の同名prefix `p4-reference.py` / `p4-browser.py` は旧候補用のため変更しない。

- [ ] 数値実行前に独立referenceの計算順/precision、各cutとcomposedの事前gate、fixture source/shape/meaning/coverageを固定。
- [ ] 実保存残差/意味/hashとtimeAct1を照合、元weightsから実Hike復号→ORT→Hike→cross→FFNを実行。prefixは再計算しない。
- [ ] HIGH/LOWを別受入とし全値比較。dynamic caller context/F32 patch候補を固定回帰から分離し、変更後referenceへ照合。
- [ ] 旧tailを保持した同時live/新stage単独/結合保持の各資源条件を区別し、staging/copy/Memory/timeと本番shapeへの未成立条件を報告。

## Task 5: 公開・取得照合

- [ ] API追加差分、source/build/kernel hash、再利用証拠、新規検証、未受入、再現手順を記録。
- [ ] 実行sourceをcommitしてfreeze後に必要な数値検証を実行し、証拠は別配布commitにする。
- [ ] private値なしの成果物を既存作業branchへpushしDraft PR14を更新。GitHubの固定sourceを別receiver checkout/readerで取得し実bytesを照合。対向の実Codex ACKは取得確認と区別する。
- [ ] 全必要境界と組合せ資源が成立するまでP5のpredict/sample受入へ昇格しない。

## 変更判断の記録

本計画は今回の具体的な実装指示を実行するための分担記録である。元coreから離れる代替推論方式は採用しない。固定診断を一般化する案は固定receiptを失うため棄却し、独立candidateを追加する。単一Memory全量常駐・単なるfile分割案は再実装しない。実Text未取得の依存edgeのみ保留し、明示fixtureの候補検証を本番合格として納品しない。
