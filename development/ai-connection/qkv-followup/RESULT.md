# N2共通catalog登録と実行資源の追加検証

2026-11-01 JST。branch `codex/diffusion-derived-hidden-heads`、Draft PR14。開始時にremote同branchが `78a3268166eca63e5daafb1b21e184224c4d14b1` と一致し、作業treeがcleanであることを確認した。固定Page本文の取得記録は [spec-acquisition.json](spec-acquisition.json)。今回の完全source SHA・成果hash・取得URLは [handoff.json](handoff.json) にまとめる。

## 完全SHAと実行source

- 数値runtimeは **`e48021d8da29ef3b3b9e9d6161331c282798b6b3`** のbytesを維持する。既存handoffは **`78a3268166eca63e5daafb1b21e184224c4d14b1`**。
- Native APIは `diffusion-models/0.1`、buildは `diffusion-models/0.1+148a33420c9b87accd25b92d94f8160bbc7e14298e6ef7cdd4b5b65d70701c10`。main89sourceと元kernel、scheduler、pointwise/mean上限は変更していない。
- 新規実行sourceは登録generator/testと、`resource-browser.py`・`diagnostics/resource-observer/pipeline.mjs`・`observer.mjs`。新しいsourceの完全commitとbyte照合はhandoffに置く。
- 旧98assetの整合確認とmain89sourceのpackage identityは、今回実際にロードしたmodule一覧と別に記録する。旧harnessを今回のdriverとして実行したと表示しない。

## 新QKV Profileを共通catalogへ渡す形

[登録説明](../../../docs/shared/diffusion-models/profiles/registration-QKV-N2.md) と [registration-qkv-n2.json](../../../docs/shared/diffusion-models/profiles/registration-qkv-n2.json) は、独自owner proposalだけでは不足していた共通record/rule/norm/category mappingを補う。新しい独立entryは `CANDIDATE-DIFFUSION-DERIVED-N2-ALL40-F32-V1`。

| 追加内容 | ID |
| --- | --- |
| shape | `SHAPE-BERNINI-DERIVED-N2-ALL40` |
| QKV/all-head実行 | `EXEC-BERNINI-DERIVED-N2-ALL40-F32` |
| 全5120 Q/K RMSNorm | `NORM-BERNINI-QK5120-N2-F32` |
| 実Rect prefix依存 | `EXEC-BERNINI-RECT2-PREFIX-F32` |
| 管理規範 | `N-DERIVED-N2-ALL40-DIAGNOSTIC` |

新4record・5数値規則・1管理規範を追加したpreviewは **25 Profile / 19 rule / 14 norm**、提案版 `1.0-draft.3`。原本6daeの18/10/12、N16案の21/14/13、旧管理採用entry・N16候補・各source/build宣言を保持する。共通catalog正本や管理runtimeへ取り込んだという意味ではない。

N2 native guardのHIGH1/LOW3、sigma/timestep、block0、LC `[2,5120]`、grid `[1,1,2]`、厳密2座標/source0/contextなし、依存prefix、false/NOT_READYを明示した。prefixのLayerNorm、Q/KのRMSNorm、Rect mean正規化を区別する。SiLU/LayerNorm/QK normの入場上限、演算順・FP8/F16保存とF32計算、事前gate・local/composed独立参照・受入scopeを固定sourceへ結ぶ。

Standalone packageの `mainBuildCommit` は完全SHA e48021…へ解決した。source141asset・main89closure・保持N16 preview・既存plan/結果/referenceを、固定handoff hashに遡って認証する。proposal SHA256は `da456cc58fde7159ad2cb82d8ef54b61f9dab30e046aa29abb8f052569ab04ea`、preview catalogは `36352a751037d59db3fee3911f237561b629db6453e7ab7bbee9e678f7a4db05`。[登録検証と再現](registration/RESULT.md) を参照。

## 実block/timestepと限定attentionの対応

既存source契約と受入を保持する。実VAE Rect raw mean `[1,16,1,2,4]` と明示noiseから、実patch/time embedding・block0 modulation・全5120 LayerNormでpost-modulation hiddenを得る。元BLC `[1,2,5120]` は暗黙batch1のLC `[2,5120]`、座標 `(0,0,0),(0,0,1)`、source0、contextなし。16tokenへのpadding/反復や、本番入力への改名は行わない。

実QKVは全5120 Q/K RMSNormを経て、全2query×全40headのRoPE/attentionへ接続し、O projection前 `[2,5120]` で止める。計算は明示F32診断であり元production precisionとの一致は未受入。HIGH index1とLOW index3は独立した試験で、実HIGH→LOW受渡しではない。

## 新規のMemory・staging・copy観測

[資源結果](resources/RESULT.md) と side別 `resources/high-browser.json` / `low-browser.json` は、新harnessをfresh Chromiumへ導入してHIGH→browserclose→LOWを直列に実行した記録である。prefix.dispose→downstream構築の元barrierを維持し、元N2のgateで各sideのprefix14stage・下流11比較を確認する。新private artifactは別SHAを持ち、旧artifactを上書きしない。

| 指標 | 今回の観測scope |
| --- | --- |
| ORT | 各phase2 sessionで共有1 Memory。線形Memory容量/高水位16,777,216B |
| prefix Hike | active4 Memory、計5,046,272B |
| downstream Hike | active4 Memory、計4,915,200B |
| realm観測 | LOWのdownstream構築時は旧prefixを含む9 identity・26,738,688B。HIGHで旧分が追跡不能となった時点の全体合計はnull |
| weight staging | prefix raw163,840B/decoded327,680B、下流raw81,920B/decoded327,680B、ORTへのowned weight snapshot等をphase別に列挙 |
| copy | 実source/Hike/Gemm/RoPE/attentionカウンターの累積交通量。live RAMへ加算しない |
| host/allocator/OS | named spansの重なり・未回収GC・ORT allocator live・File/reference/計測器heap・OS peakは未測定としてnull |

source由来named host spanは直接観測した総peakではない。module fingerprintのcopyとResponse clone等の計測overheadも分離する。ORT session数をMemory数として乗算せず、disposeを即物理解放と扱わない。強制GCやfullmodel実行を計測条件へ暗黙追加しない。未観測importやhash失敗を0 bytesとして通過させない境界も試験する。

元32760/65520の3H容量probe、全query/headのcall/traffic・旧新session・5H/6H予算は既存scopeのまま再利用した。新N2で観測した16MiBを3Hへ足して本番全工程が成立したと扱わない。全queryの素朴Q16/K64拡張は、32760でも41,943,040 ORT score呼出し/blockと最低KV交通量約2.75TB/blockを要し、採用を保留する。

## 証拠の再利用範囲

[REUSE_SCOPE.md](REUSE_SCOPE.md) に固定source・件数・禁止する昇格を整理した。登録工程は既存N2のprefix14stageと下流11比較を再利用し、モデル数値を再実行しない。旧N16・旧postnorm fixture K32760・host3H probe・native22caseは、それぞれ元のscopeを維持する。

今回新しく行ったのは、N2共通形式の登録整合性/negative16試験、observer12試験・source/cleanup2試験・private参照改変/上書き拒否等のPython3試験、実N2のMemory/staging/copy観測と各side25比較である。rootも33試験を再実行し、失敗0を確認した。source/参照/新artifact hashは新receiptとverificationに記載する。

再現入口:

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/build-qkv-n2-registration.py
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-qkv-n2-registration.py
node --expose-gc --test --test-isolation=none tools/diffusion-models/test-resource-observer.mjs
node --test --test-isolation=none tools/diffusion-models/test-resource-browser.mjs
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-resource-browser.py
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/check-build.py
```

実modelを使う資源観測のCLIは [resources/RESULT.md](resources/RESULT.md) に記載する。公開generatorとobserver単体試験に巨大modelは不要。harness入場試験/実測には、明示したprivate参照とローカル原本modelが必要である。

## 未受入事項

正式catalog登録/管理runtime採用、元81frame latent/context/noise、元production精度、ordered contextを含む実QKV→全key、元Nの全query/head数値、O/残差/cross/FFN/全block・timestep、実HIGH→LOW handoff、生成sample→復元→VAE decode、全工程のMemory/staging/copy/time予算は未受入。条件は [BOUNDARIES.md](BOUNDARIES.md) に示す。

今回変更したのは登録資料/検証工具/計測器/文書であり、数値runtimeと元Euler/simple6steps/shift5/split3を維持する。全体queue・工程管理は管理、Diffusion内部の数値計算・資源は本担当。LoRA低rank積、他ownerのAPI、管理判定器を重複実装していない。`load/predict/sample=NOT_READY` を維持し、merge・Pages公開を実施しない。
