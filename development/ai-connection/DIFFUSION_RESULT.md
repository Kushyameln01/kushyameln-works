# Diffusion A0/F1/L1 first delivery

2026-10-31 JST。添付実装計画0.1-draft.1と総合接続仕様1.1-draft.1に基づくDiffusion担当の初回成果。A0の正本取得、F1の具体的成立性判断、L1の実base診断用公開契約と実行受口を実装・検証した。L1全体の実LoRA低rank計算との共同照合、L2/D1、全生成の完成ではない。

## Source and scope

- 原902完全commit: `9023329b8d803306abcdd9342f24c01ba0df2676`。原文archive `a0/9023329-source.tar.gz`、SHA-256 `3464794167492e1440a918ab38e9823e6d9d030d141e58fb596fae7b482fdbb0`、32file/73,134B。manifest/再現builderを同時に渡す。GitHubへpush済みとは扱わない。
- 着手時main `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`、公開API3点に新差分なし。作業branch `codex/diffusion-l1-wasm`。最終完全commit/変更path/配布hashは外側delivery receiptに固定する（自己commitへの循環参照を文書へ作らない）。
- core原本行/hashと現実装差はCORE-CONTRACT-MAPPING、取得状態はSOURCE-BASELINE、対向責任はCONTRACT-MAPPING。
- 共通snapshot・queue・prompt組立ては管理所有。Diffusion内部数値、base/registry/feed-set/候補切替・資源はDiffusion。LoRA低rank/plannerはLoRA、VAE profile/decoderはVAE。

## F1 result

SUPPORTEDは限定した実Q16×5120 projection。保存はE4M3FN scalarF32 scaleとF16 parameterで、診断ではweight復号・bias変換をHikeF32、GemmをORTF32、biasをHikeF32に固定。元実行のFP8 activation/scaled_mm/compute dtypeやMXFP8 workflow同等性は未確認で、本番計算dtypeを推測固定しない。

単一Memory全量常駐と、dense attention/全token1blockをそのまま実行する案は容量阻害が確定。payload15,574,651,928B/model、parameter全F32仮定57,153,966,336B/model。target-onlyでもdense score全40head171,714,816,000B。scoreなしのweight+residual+QKV+outも4,760,201,216Bでwasm32 4GiBを超える。source同shape例は8,114,825,216B。旧新package/session/copy/activationとMemoryを分けた内訳はFEASIBILITY.md/feasibility.json。

Linear/FFN tileとstream attentionは未実装・数値未照合の候補。file分割、external data、pointwise chunkだけで本番graph成立とはしない。load/predict/sampleのNOT_READY、pointwise1,048,576、mean固定128要素は維持。

## L1 delivered surface

`docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md` が公開契約。

- `diagnostic-base.mjs`: immutable File、厳密header/size、実config/scale、original fullshape＋selected rows、scopePARTIAL、owned F32 block、identity/range/abort/release。現在任意Fileのfull hashは再計算せず、その事実をfalseとして返す。
- `diagnostic-identity.mjs`: registry全metadataのcanonical digest、疎配列/不正Unicode/非有限拒否。
- `diagnostic-consumer.mjs`: runtime-feed-set sink、被覆/checksum、候補ownedcopy、実stage/reference比較、current/epoch切替、取消後rollback・旧rollback拒否、base復帰、candidate/package/dispose寿命。
- `ort-bridge/stage.mjs`: actualORT weight runtime-inputへF32を渡すrunF32とHike bias。initializerへ偽装しない。
- `ort-bridge/kernel`: bounded実Hike DecodeF16追加、既存FP8/scale/bias維持。fixed Memory1,572,864B/arena491,648B。providerとstageは別Instanceで各このMemoryを持つ。
- `api/index.mjs/worker.mjs`: 既存0.1へlinearProjectionF32追加。host dispatch前compact/nonshared/detached/finite検査。JS/Port・owned Worker取消に対応。loraAppliedはfalse。

candidateはfixed実graphへ渡す独立feed-setであり、新しい14B sessionではない。validateは構造化PARTIAL receiptで、SDKv1のboolean validateへ無断接続しない。LoRA側新binding/partial planner adapterとの採用合意は保留。

## Fresh verification

| 検証 | 結果と限界 |
| --- | --- |
| 902 archive | PAX commit、32fileのblob/SHA、別出力先再現一致。a0-verification.json |
| F1容量 | 62項目の独立整数照合。NN/OSピーク実測ではない |
| Hike half | 9case、有限half全63,488bit厳密一致、Inf/NaN/signedzero/workspace/grow/所有/解放、FP8 1,016比較。half-green.json |
| 実base provider | 6case。LOW/HIGH各81,920weight＋16bias全F32bytesを独立Python参照hashと照合、誤side/range/identity/config、canonical規則。base-green.tap |
| Consumer契約 | 19case。明示test stageによる契約試験。実ORT/model/LoRA試験とは別。consumer-verification.json |
| 実Chromium API | 4case。実Worker・Port・ORT/Hike、F32出力寄与/入力保持、形/有限/非compact/detached拒否、Worker取消/再実行/NOT_READY維持 |
| 実Chromium base/consumer | 4scope case。HIGH/LOW native15.57GB Fileから小rangeのみ読出し、Hike→ownedF32→sink→realORT→Hike全16出力、独立参照、切替/base復帰/取消rollback/固定workspace。l1-final-browser.json |
| 既存回帰 | Euler/scheduler/mean/kernel/LoRA原本/source/parserと既存API browserが成功。regression-commands.json、api-regression.json。fresh結果を旧実績へ上書きせず分離 |
| source/build | 所有builder再生成一致、39source閉包・4kernel digest一致。build-verification.json |
| 独立review | read-onlyでidentity/所有/cancel/release/PARTIALを照合、指摘をRED再現後に修正。修正後consumer/provider再実行PASS |

実browser版154.0.8037.57、ORT1.24.3、pageErrorsなし。実base候補・明示F32変更の結果比較は最初に固定したabsolute1e-6/relative1e-5。明示F32変更はconsumer試験用であってLoRA演算結果ではない。件数を合算して生成/LoRA適用成功とはしない。

Node24のopenAsBlobは15.57GB file.sizeを32bitで切詰めたため、Nodeの実base試験はstat同一性を検査するbounded fs test adapterを使用した。実browser Fileでは15,574,833,216Bと4GiB超offsetのconfig読出しを確認済みであり、Nodeの問題をbrowser Memory成立性の根拠へ流用しない。

## Reproduction and handoff

```sh
python tools/diffusion-models/l1-reference.py --models <original-model-directory> --output development/ai-connection/l1-reference.json
BERNINI_MODELS_DIR=<original-model-directory> node --test --test-isolation=none docs/shared/diffusion-models/lora/test-diagnostic-base.mjs
node --test --test-isolation=none docs/shared/diffusion-models/lora/test-consumer.mjs
node docs/shared/diffusion-models/ort-bridge/test-half.mjs
python tools/diffusion-models/test-l1-browser.py --models <original-model-directory> --mode all --output development/ai-connection/l1-final-browser.json
python tools/diffusion-models/check-build.py
```

原本ディレクトリには指定名の保持済みHIGH/LOWを用意する。今回fullモデルNN/巨大package生成や31GB再hashは行っていない。WASM compilerを再実行する場合はABI.mdの固定toolchain/owner builderを使う。

LoRAへ: DIAGNOSTIC_API、実HIGH/LOW registry例JSON、base/provider/sink/candidateとscope付きreceipt。次は実LoRA原本＋LoRA所有演算＋版付きpartial plannerを接続し、独立参照と共同比較する。現在のSDKv1へruntime-input名をgraphInitializerとして渡さない。

VAEへ: G1C schema取得済・mean/生成分離・復元owner維持。本番shapeと実sample/復元trace/decodeは未達。管理へ: 原902archive、source/core対応、F1判定、能力/制約/所有/取消、partial診断と生成snapshot禁止、parent/child queue条件。共通規格や別moduleの実装を変更していない。

公開asset台帳・main・GitHub Pagesは変更せず、push/merge/deployなし。新モジュールの公開配信は別工程。OS/RSS・ORT全Memoryピーク・本番compute precision・全graph・実LoRA共同適用・全生成は保留である。
