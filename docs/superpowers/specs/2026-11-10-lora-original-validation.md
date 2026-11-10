# LoRA並列化：原本と実証ケースの対応

版: 0.1 / 2026-11-10 JST。設計案v0.4の検証補記。**標準比較値の準備と、並列・製品実証を区別する。**

## 1. 今回の保持環境と準備状態

検証保持環境は本チャットの共有実行環境、`/workspace`の非配信作業領域。原本・base断片・出力F32・私有取得先と全hashの対応表は`work/lora-validation/`に保持し、Pagesの配信rootや公開Gitへ置かない。旧チャットの保存パスは今回の所在証拠へ流用していない。

| 素材ID | 公開済みinventoryでの原本名 | 今回の完全bytes | 実ファイル/標準SDKで確認したpatch数 | 現在の状態 |
| --- | --- | ---: | --- | --- |
| LH | Bernini-R_LightX2V_high_noise.safetensors | 1,244,141,856 | 405低ランク、201weight diff、446bias diff | 今回取得・全体hash計算・SDK登録hash一致 |
| LL | Bernini-R_LightX2V_low_noise.safetensors | 1,244,141,856 | 同上 | 同上 |
| DH | NSFW-22-H-e8.safetensors | 613,516,752 | 400低ランク | 同上 |
| DL | NSFW-22-L-e8.safetensors | 613,516,752 | 400低ランク | 同上 |

lightは取得時に固定したHugging Face commitとLFS SHAにも一致した。detailは既存資料から特定したDrive ZIPを今回取得し、実entry名、展開bytes、CRC、全体hashを確認した。初期添付ZIPと後続Drive ZIPのbyte同一性は証明していない。名前だけの対応や別のWan/LTX素材で代替していない。

四原本の確保は今回の開発検証の状態であり、通常利用に四件の事前取得・登録・検証資料提出を要求しない。

## 2. 実base、registryと比較経路

### 実baseの固定と取得scope

- BH/BLは現行Diffusion ownerが指定するHIGH/LOW原本。各15,574,833,216 bytes。期待full hashはそれぞれ`9ff3d736...fe73f52`、`ce35c070...afb7bbb3`であり、完全値は固定ownerの`lora/weights.mjs`を使う。
- 今回、公開取得元の固定commit/LFS hashがowner期待値と一致することと、取得した181,280-byte headerのSHAが固定ownerと一致することを確認した。
- 両baseで、下表K/N/B/Hの**実payload範囲**と、必要なFP8 scale/comfy_quantを取得した。raw範囲のoffset/length/hash、header hash、取得commit、decode後F32 hashを私有receiptへ保存した。side当たりraw本体245,824 bytes。
- 数値decodeは現行採用Diffusionの未変更Hike bridgeを使用。FP8は既存scalar-scaled E4M3FN profile、F16は同bridgeのDecodeF16。元storage dtypeとF32を混同しない。
- **base全payloadの取得・全体SHA再計算は未実施。** 期待full hashの文字列を今回の全bytes認証としない。限定取得範囲だけを返すimmutable providerを用い、範囲外は拒否する。zero/sparse/fakeの完全モデルは作らない。

| 範囲ID | logical key（native weightIdは先頭のdiffusion_model.を除く） | full shape | 元座標 | base storage |
| --- | --- | --- | --- | --- |
| K | diffusion_model.blocks.0.cross_attn.k.weight | [5120,5120] | rows [1,17)、全5120列 | F8_E4M3＋実scale/quant |
| N | diffusion_model.blocks.0.cross_attn.norm_k.weight | [5120] | elements [1,17) | F16 |
| B | diffusion_model.blocks.0.cross_attn.k.bias | [5120] | elements [1,17) | F16 |
| H | diffusion_model.head.head.weight | [64,5120] | rows [1,17)、全5120列 | F16 |

registryは`bernini-standalone-targets/1.0`、mappingは`bernini-comfy-canonical/1.0`。各sideの期待model identityで未変更factoryから作成し、元shapeとkeyを保つ。限定providerのscopeとregistry/対象範囲を別に記録し、完全モデルproviderと偽らない。

### 標準比較値

比較基準は固定`6d0c8df4cd4992f26745d2d26394f5e194d2567f`由来SDKと、WASM SHA`5117e21d...a0c361`の未変更Hike。`register → compose → prepare → prepared.handle.readBlock`を実行した。元sourceの全体hashはSDK登録でも再確認した。単なる数式のbinary64計算を標準比較値にしていない。

この経路で**各side7件、合計14件・819,264 F32要素・3,277,056 bytes**を回収した。出力本体、source/plan/registry、取得base範囲、適用順・scale、hashと件数を保持し、保存後のhash/件数を再照合した。現在の状態は`REFERENCE_VALUES_CAPTURED`であり、`parallelComparison / normalGeneration = NOT_RUN`、`speedup = NOT_MEASURED`。

## 3. 原本から試験ケースへの一続きの対応

各caseは同じ原本bytes、base F32、registry、範囲、強度、cache条件を標準と候補へ渡す。候補の値は標準F32をUint32として全要素比較し、-0/+0を区別する。件数/範囲不一致や非finiteを比較前に拒否し、最初の不一致座標・両bit列・実行buildを残す。hashだけで件数や範囲の照合を省略しない。

| case | 原本・base・範囲 → 実行経路 | 期待結果 | 今回の観測と、次の観測で決めること |
| --- | --- | --- | --- |
| R1 低ランク | LH/DHをBHのKへ、LL/DLをBLのKへ。lightはdown/up rank128・alpha128、detailはA/B rank64・alphaなし。strength1。標準SDKと候補A/B/Cの同範囲read | 各81,920要素が標準とbit一致。light倍率はalpha/rank、detailは明示loaderの既定1 | 四原本の標準値取得済み。候補の一致確認後に対象演算の同値性を判定。速度の製品主張にはしない |
| R2 weight/bias diff | LH/LLのhead.head.diff→H、cross_attn.norm_k.diff→N、cross_attn.k.diff_b→Bを各sideの実baseへstrength1で適用 | matrix/vector weight diffとbias diffをstrengthだけで加算。rank/alphaを掛けない。各範囲が標準とbit一致 | 各side3件の標準値取得済み。積だけの対応へ縮めず、追加variantをWorker内合成等へ移したときに必ず再比較 |
| R3 合成順・base復帰 | 各sideでlight1→detail-0.5をKへ適用。次に空compositionで同じ不変baseのKを取得 | patchごとのF32丸めとlight→detail順を維持。base復帰は元F32とbit一致 | 各side2件の標準値取得済み。候補比較は未実施。strength変更/片組解除も同じ不変baseからfresh取引として確認 |
| R4 全patchの適用と生成read | 実モデルを通常管理画面でloadし、選択原本をFULL scopeで適用。light各1052、detail各400の実plan対象全範囲を標準/候補でstream比較し、その後も実生成を実行 | 低ランク・201weight diff・446bias diffを漏らさず一致。適用後のlazy readも同じpackage/epochへ結び、生成結果を回収。限定K等だけでFULL合格にしない | **未準備/未実行**。完全base・Text/VAE・生成入力を扱う保持環境を特定して着手。実モデル全体の入手をfixtureで代替しない |
| R5 通常操作の性能 | R4と同じ通常画面で初回、再生成、strength変更、部分read/cache hit、解除を比較。登録・startup・搬送・照合・生成readを含む操作時間 | 結果と入力を保ち、事前に固定した操作/条件ごとに改善・同等・悪化を判定。cold/warmを別掲 | **未実行**。14比較値の回収を速度測定としない。通常操作の時間/資源からA/B/C・autoの採用条件を決める |

R2の元tensor名は実header/実planから確認済み。Hは全201weight diff中のmatrix1件、Nはvector200件の代表であり、全件の数値成立を代表例だけから断定しない。残りはR4のFULL scopeで確認する。

新batch/合成kernelの補助算術試験では、scaleのF32化、patchごとの丸めと順序に加え、product/scale/addの途中で非finiteになる小fixtureを標準と比較する。後段の0強度や打消しで隠さず、同じ段階で拒否・無commitとなることを観測する。これは原本を改変せず別fixtureで行う限定試験である。

## 4. immutable baseとconsumer検査の区別

本番のWorker内合成に渡すbaseは、実weight feedの専用`baseProvider`から取得する。`execution/model-weight-feed.mjs`の同providerはactive LoRAと独立したbaseを返す。`source.readRows/readVector`は適用済みpackageを重ねたeffective sourceであり、baseとして渡さない。

検証では元base範囲のF32 hashを適用前後に照合する。二度目の適用/strength変更でも同じ不変baseから組み立て、既存LoRAへの二重適用や丸め済み差分の逆算がないことをR3/R4で確認する。

現consumerの`validate`は型・全範囲・finite等の受付であり、`comparedElements:0 / numericalComparison:false`。適用receiptが成功しても、外側の標準F32比較checkerを通した証拠にはならない。checkerは開発検証に置き、通常利用者へ参照値を要求しない。

適用時validateのreadと、その後のpredict/sampleによるlazy readを分けて記録する。各readのphase、side/feed/package/consumer epoch、weightId/range、実返却F32を回収する。apply終了でpoolを先に終了せず、生成の独立read leaseが終わるまで有効であることを確認する。

## 5. 今回変更する境界の例外観測

以下は**期待する合格条件**であり、まだ注入・実行していない。全入力×全strategy×全例外の総当たりにはしない。cache/Worker/package境界を変更した実装で該当caseを行い、通常経路では健全な一往復と代表的な失敗回復へ結ぶ。

| case・発生条件 | 変わってはいけない状態と、回収する観測 | 復旧後の確認 |
| --- | --- | --- |
| E1 同じ積の待機者A/BのうちAだけを取消 | 同じ検証済みproduct keyの共有producerへ二つの独立read leaseを待機させてAをabort。Aは取消終端で公開0件、Bは標準bit一致のF32を受領。Bがいる間producer/source/kernel/executorを解放しない。各要求の終端回数1、B終了後のpending数を記録 | Bの結果とleaseが有効。全lease解放後に当該pending/参照が残らず、次の明示readも標準一致 |
| E2 Worker異常/無応答 | W1に依存する要求が失敗終端し、部分結果のcommit/公開は0。W2上の別owner/独立要求は標準一致で成功。失われたW1 cache世代を無効化し、旧世代cache hit/応答採用は0。受付待ちと実行watchdogを区別し、元Promiseが各一回終端 | 新しい明示要求で世代を進めて因子を再配布し、標準一致。失敗した元要求を後から成功へ変更しない |
| E3 旧モデル応答の遅着 | 旧feed F1の要求を取消/終端化し、正規lifecycleで新feed F2を構築。その後に旧packetを遅着させる。F2のmodel/binding、現在のpackage/epoch、snapshot/結果は変更0、旧packet採用/旧世代cache格納0 | F2の正規readは標準一致。retired feedの拒否codeとbefore/after identityを保持。試験用遅延packetだけで本番の終端待ちを回避しない |
| E4 HIGH成功後にLOWのvalidateを失敗 | 通常productの二side適用でHIGH実commit後、LOW commit前を失敗させる。全体Promiseは失敗、productは`restore-required`/`restorationRequired:true`、生成は復帰まで拒否。HIGHの実receipt/epochとLOW未commitを別々に記録。実際にbatch APIを使う経路なら`accepted:false`も確認 | 正規の解除/Base復帰・close/recover後だけbase状態へ戻す。次の適用/生成は標準一致。片side成功を全体成功へ表示しない |
| E5 rollback/release失敗 | 当該cleanupを一度失敗させ、SDK/adapter/queueの実`recoveryRequired`・未解放lease/candidate・再利用拒否を観測。解放済み/回復済みと報告せず、元失敗receiptを残す。feed close失敗ならretained feed IDとcleanup状態も保持 | fault除去後、該当公開recover/retry-closeを実行。元処理とcleanup終端、当該cleanupの未解放数0、正しい再利用/再適用を確認してから回復完了。失敗記録は消さない |

観測には、要求/Worker/世代、source/base/package/registry、範囲、共有待機数、終端回数、consumer commit/epoch、product状態、queue再利用可否、cache失効/保持量を対応付ける。SDK/adapter/productの異なる状態を同一のreceipt fieldと仮定しない。counterやfault barrierは検証側へ置き、通常利用に参照解・故障注入・事前PASSを追加しない。

## 6. 残る準備と判定の範囲

| 項目 | 今回の観測 | 状態 |
| --- | --- | --- |
| 四LoRA原本 | 完全bytes・全体hash・標準SDK登録hash・patch数を照合 | 準備済み |
| BH/BLの選択base | 実header/scale/quant/指定payloadとHike decode F32を保持。範囲外は拒否 | 限定範囲で準備済み |
| R1–R3の標準値 | 実原本・実base範囲・固定標準SDKから14 F32 bufferを回収・hash/件数照合 | 比較元取得済み、候補比較は未実行 |
| R4/R5 | 完全base・Text/VAE・生成入力の現在の実証保持環境を確認中 | 未準備、未実行 |
| E1–E5 | 発生条件→観測→復旧確認を定義 | 未実行 |

このworkspaceの観測時空きは約27.2 GB。二つの完全baseだけで31,149,666,432 bytesあり、LoRAや他の実生成入力を加えた同時保管には不足する。これは原本が他環境にないという意味ではない。保持済み環境を特定し、実browser到達とFile入力・回収手段を確認する。素材の再添付や有料基盤の変更を独自の前提にしない。

静的な「実装方針は進行可能」という判定を、R4/R5の準備・製品完成・性能合格へ広げない。取得済みの原本と標準比較値で進められる実装/検証は、承認された計画の範囲で進める。完全モデル実証の未準備をfixture成功で消さない。
