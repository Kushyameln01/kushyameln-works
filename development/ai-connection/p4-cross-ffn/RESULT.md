# P4 cross-attention・FFN・最終F32 consumerの限定受入

2026-11-01 JST。固定N2自己注意残差を再利用し、実Bernini重みのText投影→cross-attention→FFNを一つの接続候補として実装・検証した。HIGH1／LOW3は各50比較・643,072値で失敗0、原本選択29件のraw/F32復号identityも一致した。別のHIGH実行では、実FP8 Q weightとF16 Q biasを最終F32へ変換し、sink・candidate経由で実ORT/Hikeへ渡した。検証・切替・旧lease保持・package解放・base復帰まで成立した。

受入scopeは**保存済みN2・block0＋明示Text fixture K4のF32部品候補**である。実Text producer、実LoRA canonical mapping、本番shape/precision、全model/生成を受入した意味ではない。`load/predict/sample=NOT_READY`、generationReady=falseを維持する。

## 配布と実行source

| 区分 | 固定commit / 識別 |
| --- | --- |
| 最新実行・提供source | `5744f700e17b23d5c18d32315fb6dfbd7c49089a` |
| HIGH／LOW baseの実行source | `829467c14ec6fd1ab1858dfc175c84605de1ac98` |
| 数値owner実装の初回source | `3ae9b934ffcd2cf092171699fd7a5b55110f1197`。後続はtransport/検査/公開filterの修正で、数値ownerとkernelは同一 |
| 従前の固定tail | 実行`a49aac492cc68e2dd6037e0deb4a6954731a847a`、配布`beffdcb800b629d0b13ff43bbc90e9f74c659152`、返却`508d72cc9036e7f500827465c644b4aed3c5f711` |
| 従前tailの管理受入 | `60d16b64d6020d3d20239f087f8add91268dcaad`。固定scopeの受入を今回も維持 |
| native API | `diffusion-models/0.1`、独立ES entryを追加 |
| 新Profile | `bernini-block0-n2-cross-ffn-f32-candidate-v1` |
| 候補build | `bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b`、50 source |
| Hike kernel | 10,094B、SHA256 `4d8518e94bd2de3ab9bf50f09b2fd17b69a5c57e7fd45dc65cd062d7fdbdbc4e` |

配布commitは、この報告を取得した固定Git commitおよびDraft PR14で特定する。[handoff.json](handoff.json)が成果物hash index、[build.json](build.json)がsource/build closureである。base実行の36件/sideとF32 feedの32件の実要求sourceについて、最新5744のGit bytesへの一致も確認した。旧native100-source buildを新候補へ改名せず、別closureとして認証した。

実sourceは[固定5744 tree](https://github.com/Kushyameln01/kushyameln-works/tree/5744f700e17b23d5c18d32315fb6dfbd7c49089a)、基準baseは[固定8294 tree](https://github.com/Kushyameln01/kushyameln-works/tree/829467c14ec6fd1ab1858dfc175c84605de1ac98)から取得できる。

## API差分・conditioning

| 追加入口 | 責任と範囲 |
| --- | --- |
| `createP4WeightSource` | original Blobのheader/size/entry検査、bounded read、実Hike F16/FP8→F32復号 |
| `captureP4Conditioning` | Text float32 BLC `[1,L,4096]`、Uint8 mask `[L]`、model/tokenizer/metadataのowned capture |
| `captureP4FixtureConditioning` | fixtureId/sourceRefを持つ別capture。Text model識別を偽装しない |
| `createPostSelfAttention` | residual F32 LC `[2,5120]`、timeAct1 `[5120]`、選択conditioningから25中間配列とblockOutputを返す |
| `createP4WeightFeed` | registry、owned base provider、疎F32 sink、candidate validate/commit/rollback、immutable read lease |

[API](../../../docs/shared/diffusion-models/API.md)、[module README](../../../docs/shared/diffusion-models/ort-bridge/post-self-attention/README.md)、[conditioning契約](CONDITIONING.md)、[consumer契約](WEIGHT-FEED.md)に例・schema・所有権・取消/解放を記録した。新しいWorker/MessagePort opは追加していない。同一ページの公開ES関数を利用する。管理が全体queue/工程を所有し、Diffusionが内部計算・資源・weight epochを所有する。

取得したproducer sourceはText `d2e9e3cba6269464bf556acc73c0b97030f75b5f`、VAE Rect `855f435120f08eb9e818e51281fc26f0e2633829`。共通仕様本文は1.1-draft.2、実行計画0.2-draft.3、Profile/規範/数値規則は1.0-draft.1・固定`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`を実取得した。[取得記録](spec-acquisition.json)と[Page checkpoint](page-checkpoints.json)に対応する。

Text最終RMSNormはText ownerの適用済み出力として受け取る。Diffusionがtext_embeddingの2層とGELUを行い、mask0を含む全L行を保持する。cross softmaxのmaskやRoPE、暗黙padding/compactionを追加しない。正負は別artifactで、管理が呼ぶbranchを選ぶ。既定ではtokenizer欠落を拒否し、明示legacy policyでもunknownのまま保持する。旧`encodeWanConditioning`のtokenizer保全差は既存APIを変更せず記録し、新入口で保全する。

VAE raw meanはfloat32 NCTHW、Rect `[1,16,1,2,4]`、meaning `raw-posterior-mean`、producer normalizationなし。専用Rect正規化/復元はDiffusion ownerの既存操作であり、Text conditioning、今回のhidden、生成sampleとは別である。新コードでVAE raw meanや生成sampleへ改名しない。旧pointwise1,048,576、mean128固定ABI、FP8 decode81,920、新GELU27,648の上限を混同・引上げしていない。

**実Text payloadは未取得。** 公開24-layer `[1,4,4096]` receiptの存在から値を復元していない。今回のfixtureはdyadic L4・mask `[1,1,0,1]`、独自producerであり、本番Textではない。VAE/Textとの新P4 boundaryの対向owner ACK、実payloadを使う共同数値受入は保留である。

## 元core・実演算との対応

保持したComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の`comfy/ldm/wan/model.py`を参照した。保存sourceのSHA256は`17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`。報告要約から元coreを再構成していない。

1. Text: Linear4096→5120 → GELU(tanh) → Linear5120→5120。
2. 保存self residual → affine LN(norm3) → cross Q/K/V → full5120 QK RMSNorm → 40head×128 attention → O → ungated残差。
3. cross residual → nonaffine LN → e[3] shift/e[4] scale modulation → FFN5120→13824→5120・GELU(tanh) → e[5] gate → cross residualへ加算。

全norm epsilonは1e-6。crossはno RoPE/no masked softmax。FFN gateに`+1`はなく、modulation scaleにだけ`+1`を使う。FFN downは全13824列×4出力行、他matrixは16出力行tileで、inner reductionを分割しない。cross O/text/timeはF16、cross QKV/FFNは各自のscalar FP8 profileである。F32計算を元GPUのFP8 activation/fused precisionと同一扱いしない。

## 再利用した証拠

- saved tail residual: HIGH `72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9`、LOW `0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6`。LC `[2,5120]`、meaning `block0-self-attention-residual-token-hidden`を確認。
- saved5出力/sideとE4をbit照合し、全60ファイルのhash/長さを確認。timeAct1と上流producer/source/side/timestepの固定guardを再利用。
- prefix・QKV・RoPE・self-attention・旧tailの数値計算は再実行していない。旧tailは資源併置のため構築するが`run()`は呼ばない。
- 元modelの既存full-file識別receiptを参照し、今回の実size/headerと選択rangeを照合。model再download・全量hash・全量常駐案の再実装をしない。未選択rangeの現在の内容を今回再認証したとはしない。
- 固定Q16・正式82b DATA bridge・旧tailの実装と受入pinを変更しない。
- 元workflowのEuler/simple6steps/shift5/split3を変更していない。

## 新規数値・接続検証

| ケース | 独立参照・全値比較 | 失敗 | 選択重み証拠 | elapsed |
| --- | --- | ---: | --- | ---: |
| HIGH1 base・N2/K4 | local25＋composed25、643,072値 | 0 | 29/29、原本raw＋独立復号F32 bit一致 | 63,990ms |
| LOW3 base・N2/K4 | local25＋composed25、643,072値 | 0 | 29/29、原本raw＋独立復号F32 bit一致 | 64,191ms |
| HIGH final-F32 fixture | composed25、321,536値。consumerもblockOutput10,240値を検査 | 0 | 29/29、原本raw＋消費final-F32 bit一致 | 63,858ms |

事前gateはlocal `abs0.001 + rel0.0001*abs(ref)`、composed `abs0.01 + rel0.001*abs(ref)`。元plan hash`051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600`とfixtureを固定し、結果後に緩めていない。独立Python/NumPy binary64と独立F16/FP8 decoderを使う。base最大誤差はHIGH local3.0517578125e-5/composed3.814697265625e-5、LOW両方3.4332275390625e-5。changed-F32 composed最大3.814697265625e-5。

baseは[HIGH](integration/high-comparison.json)・[LOW](integration/low-comparison.json)、changed-F32は[consumer receipt](feed-integration/high-feed-browser.json)・[25出力比較](feed-integration/high-feed-comparison.json)。source/kernel/事前gateだけの検査、小さい制御fixture、実数値件数を合算して全生成合格にはしない。focused Node42、reference13、browser手順13、feed手順9、旧tail11の検査は別scopeの[preflight](preflight-s2/verification.json)/[publisher回帰](preflight-s3/verification.json)として残した。

最終F32試験はcross Q weight（FP8）のfirst4rows/full5120columnsとQ bias（F16）の4値を使う。実Hike providerと独立原本decodeのbit一致、owned copyを変更してもbaseが不変であることを確認した。テストcallerが作った最終F32の2要素のsign bitを明示変更し、sink→candidate→実ORT weight / Hike biasへ渡した。低rank積・alpha/strengthの計算は実装しておらず、実LoRA適用の共同受入ではない。canonical adapterの新P4 mappingはLoRA ownerの未完事項である。

commit epoch1、旧base lease維持、package handle解放後のactive読出し、rollback epoch2、base provider不変を確認。復帰後は対象tileを再読し、block全体の復帰再計算はしていない。復帰直後statsの旧base lease1は歴史snapshotで、finallyで解放する。最終lease数0の独立counter観測は主張しない。

## 資源条件

| 観測・内訳 | 値 / 範囲 |
| --- | --- |
| P4単独のdistinct WASM容量 | 21,102,592B |
| 旧tail idle＋P4のdistinct WASM容量 | 23,986,176B。旧5出力は別にJS保持。3 ORT sessionsだが物理ORT Memoryは1個16,777,216B |
| 新P4 Hike | decode1,572,864＋math1,638,400＋stream1,114,112 = 4,325,376B |
| 旧tail Hike | 2,883,584B、数値再計算なし |
| 最大raw weight read / decoded tile | 163,840B / 327,680B。FFN down tileは221,184B |
| 1 numerical runの選択原本payload | 524,489,728B、factoryのheader/config読出しは別計上 |
| 実Gemm / score tile | 5,024 / 40 |
| linear入力snapshot累積traffic | 1,811,538,240B / base run |
| 25返却配列 / 旧5配列保持 | 1,286,144B / 163,840B |
| feed内部patch予算 | package16MiB、aggregate64MiB、package/candidate各4、lease16、transaction4 |

[詳細verification](verification.json)と各browser receiptは、単独→旧owner併置→計算→dispose/出力保持の観測を分ける。Memory容量をallocator live/RSS/総peakへ読み替えない。copyは計測したnamed categoriesの累積で、完全なhost copy inventoryではない。caller/File/reference/ブラウザ/GC/allocator、後処理probeや旧prefix/self-attentionを含む全工程peakは未測定。dispose後もMemoryがGCまで生存する可能性を保持し、即時RAM回収を主張しない。

このクラウドのChromium154、Node24、ORT WASM1threadでの限定診断であり、利用者端末の負荷目標を受入していない。[production-budget-estimates.json](production-budget-estimates.json)は本番N32760/65520・K512の**計算上の内訳**で、実行済みではない。診断用25配列保持やN2単位の反復weight traversalを本番方式として採用せず、staging/cache/全境界の組合せ予算を先に成立させる。

## 再現・受領・未受入

[REPRODUCE.md](REPRODUCE.md)に実command、必要な非公開資材、source固定、比較、copy/取消の検査手順を記録した。private model・activation/reference・patch payloadはGit/HTTPへ公開していない。実行sourceと必要WASM/build生成物はGitで取得できる。

[最終receiver receipt](receiver/receipt.json)は固定5744から50/50ファイルを新しい受領環境へネットワーク取得し、13,352,427Bのhash・長さ、import/assets closureと公開契約を照合した。[source版差分](receiver/source-version-proof.json)も提供する。これは委任した独立receiverの取得確認であり、外部のText/VAE/LoRA/管理担当の合意ACKや共同実行を代行したものではない。

初回の`+0→-0`輸送と`-0`保存欠落は[attempt1](attempt-1-signed-zero-transport/STATUS.json)に原receiptを未変更で保持し、byte契約は未受入とした。S2で両方向を修正し入力/保存25出力のbit照合を追加した。S2feedの公開filter誤拒否は[attempt2](attempt-2-feed-publication/STATUS.json)へ分離し、最新sourceで完全なconsumer receiptを取り直した。数値owner・kernel・gateは変更していない。

未受入は、実Text payload/owner ACK、新LoRA canonical mapping/実低rank適用、正負/ordered contextを含む元workflow、81frame・本番query/key shape、production precision、全block/最終head、実HIGH→LOW、predict/sample、生成sampleの復元/VAE decode、全工程資源・利用端末の負荷目標、新Profileの共通catalog/管理採用である。[catalog-submission.json](catalog-submission.json)は新しいowner候補であり、旧候補の受入scopeを変更しない。

本作業は作業branchへのpushとDraft PR14更新まで。**merge・GitHub Pages公開は本作業では行っていない。**
