# P4の実base・最終F32 weight consumer契約

native API `diffusion-models/0.1`の独立ES module
`docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs`。
`createP4WeightFeed({source,includeTextEmbedding:false})`を使う。
profileは`bernini-block0-n2-cross-ffn-f32-candidate-v1`、registryは
`bernini-p4-f32-feed-registry/0.1`。coverageは常に`PARTIAL`であり、
full model、canonical LoRA adapter、生成受入を宣言しない。

## 対象と実演算へのmapping

| original key（weight/bias） | 元weight full shape | storage | 実weight binding |
| --- | --- | --- | --- |
| `blocks.0.cross_attn.q/k/v` | `[5120,5120]` | F8_E4M3、各自scalar F32 scale | runtime-input |
| `blocks.0.cross_attn.o` | `[5120,5120]` | **F16、FP8 scaleなし** | runtime-input |
| `blocks.0.ffn.0` | `[13824,5120]` | F8_E4M3、固有scale | runtime-input |
| `blocks.0.ffn.2` | `[5120,13824]` | F8_E4M3、固有scale | runtime-input |
| `text_embedding.0`（明示選択時） | `[5120,4096]` | F16 | runtime-input |
| `text_embedding.2`（明示選択時） | `[5120,5120]` | F16 | runtime-input |

biasは各output幅のF16 vectorをHikeでF32へ復号し、`hike-parameter`として渡す。
registryのbinding.nameはoriginal keyと同じ実program slotである。各matrix slotは
`operatorBinding.graphInput:'weight'`へ対応し、`stage.mjs`がoperatorのkeyごとに
最終F32 tileを取り、`linear.run({x,weight:tile.values,...})`を呼ぶ。
ORT graph自身の入力名を架空の多層名へ改名していない。

新registryにmodel weightの`initializer` targetはない。score graphのscale/axes定数は
LoRA targetではない。norm3、QK norm、time projection、modulationは原本sourceに存在するが、
本patch registryでは対象外である。未選択target・範囲は明示したimmutable-base pass-through。

各entryはoriginal key、`diffusion_model.`付きkey、weightId、元full shape、
storage/compute dtype、row-major/transpose:false、原本offset、選択範囲、
scale/configのbyte hash、FP8 profile、実operator bindingを持つ。
base model/header、Gemm graph、registry、execution profileを別identityで結ぶ。
原本full-file hashは既存識別を参照し、今回全量hash済みとはしない。

## 所有担当

| 境界 | ownerと責任 |
| --- | --- |
| immutable original | Diffusion `createP4WeightSource`。元Blobだけを読み、header/size/各entryを検査。F16/FP8→F32は実Hike |
| base provider | `feed.baseProvider.readBlock(weightId,offset,count,{...identity,fullShape,signal})`。元tensorの要素座標、全input列を保つ行範囲。compact owned F32を返す |
| LoRA計算 | LoRA owner。loader、full-shape→slice mapping、低rank積、alpha/strength/diff/bias計算。Diffusionで再実装しない |
| sink/package | Diffusion。呼出し側が完成させた最終F32を所有copyし、宣言した疎範囲を漏れなく受ける |
| candidate検証・切替 | Diffusion。実ORT/Hike実行、独立expected・固定gate・入力/weight/graph/package binding、epoch付きcommit/復帰 |
| 全体選択・待機列 | 管理。HIGH/LOW pair選択、工程、共通snapshotと保存。native feedの内部epochと管理revisionを同一化しない |

元FP8 bitsやscaleをLoRAのF32 baseと直接同一扱いしない。providerのF32は
`scaled-e4m3fn-scalar-f32-v1`または明示F16 decodeの結果であり、元GPU FP8 activation精度とは別。
sink受領後のF32へ再scale・再decode・再加算をしない。

## 取引の順序

1. `registry()`から`modelHash,graphHash,registryHash,side,executionProfileId,scope`を取得する。
2. `baseProvider.readBlock`へ同identityと元fullShapeを渡す。matrixは全列を含む連続rowで、
   通常16行以下、FFN downは4行以下、復号81920要素以下。返却baseはfeed適用後も不変。
3. LoRA ownerが完成させたweight/bias F32を、`sink=feed.createSink()`の
   `begin({...identity,patches:[{weightId,offset,count}]})`で宣言した範囲へ入れる。
4. `writeBlock({weightId,offset,count,fullShape,binding,dtype:'F32',sha256,data})`を順にawaitする。
   誤binding・shape・hash、重複・重なり・範囲外、非有限、未宣言範囲を拒否する。
5. `finish(identity)`は完全coverageを検査しopaque package handleを返す。
   `prepareLoad(handle,{...identity,signal,isCurrent})`がcandidateを所有する。
6. `validate(candidate,{...context,input,expected,expectedSHA256,referenceId,gateId,tolerance,run})`を使う。
   `run(candidateSource,ownedInput)`は実`createPostSelfAttention`を呼ぶ。
   `expected:F32[10240]`は独立referenceのblockOutputで、byte hashを検査する。
   gateはregistryの`p4-cross-ffn-composed-f32-v1`、abs0.01＋rel0.001に固定し、任意の緩和を拒否する。
   実runtimeのprofile/graph/package、入力data/mask/metadata、出力全値を照合する。
7. validなreceiptがあるcandidateだけを`commit`する。直前にsignal/current/epochを再検査し、
   active feedを一括切替する。`rollback`は自分がactiveにしたepochだけを戻す。
   古いcandidateの復帰で新activeを上書きしない。
8. `releaseCandidate`、`sink.release(handle)`、`sink.abort()`、`feed.dispose()`は別の寿命を持つ。
   packageの解放だけでactiveやrun中のimmutable leaseを壊さない。feedのdisposeはleaseを失効させ、
   pending read/hashの終端を待つ。base source自体は呼出し側が所有し、最後にdisposeする。

stageのrunは最初のawait前に`captureSource()`のimmutable read leaseを取る。
途中のactive切替が同じrunのweightへ混ざらない。候補の検証ではconditioningのprivate captureを
登録済みのまま所有cloneし、rawなstructuredCloneでcapture認識を失わないようにする。

## 容量と受入範囲

全6層のweight/biasをdense F32で持つだけで985,819,136Bになるため、疎なowned blockだけを保持する。
per-package16MiB、package/candidate各4、read lease16、同時transaction4、所有patch bufferの
aggregate64MiBを明示した別予算とする。共有するpackage/candidate/history/active/lease/transactionの
backing bufferはidentityで重複排除し、pending hash copyは別に計上する。
これらは内部の選択patch資源の上限であり、ORT/ブラウザ/File/全modelのRAM予算ではない。

actual direct-F32 feed診断では、providerが返す実baseの小blockから、テスト用callerが明示した
最終F32 weight/biasを作り、sink→candidate→実ORT/Hike→独立参照へ渡す。
このfixtureはLoRA原本・低rank積の共同受入ではない。現LoRA canonical adapterは
旧self-attention Q16専用のため、新P4 target registryへのLoRA owner mappingと実LoRA共同試験は未受入。
固定Q16、正式82b bridge、N2 tailの従前証拠とpinを変更しない。

実producer、元workflowの本番K/N、全target、元precision、段間受渡し、組合せ資源が成立するまで
`load/predict/sample=NOT_READY`、generationReady=falseを維持する。
