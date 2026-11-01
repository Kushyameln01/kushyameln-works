# 目的と数値ownerの境界

版1.0-draft.1。状態はdocumented-draft。NUMERIC-EXECUTION.mdとnumeric-execution.v1.jsonは既存の数値実行条件を参照する台帳であり、製品演算・native APIの変更ではない。runtimeIntegrated=falseは台帳の未組込みを表す。

管理が照合する最小項目は、operation/ES入口、native契約とprofileの有無、source/build/kernel、入力のshape/dtype/意味、scale・配置・binding、数値精度、許容差と参照、coverage、所有権と取消終端、証拠scopeである。管理は式の実行やbase復号を代行しない。LoRAの低rank積・diff/bias加算はLoRA、FP8復号・ORT/Hike射影・scheduler・attention候補はDiffusionが所有する。

recordIdは新台帳内の参照ID、nativeProfileIdはnative原文で確認したIDである。nativeProfileId=nullの記録へ正式IDを発明せず、precisionProfile・入力schema・native API版を実行profile IDと混同しない。

# F32の固定Q診断

recordIdはEXEC-BERNINI-Q16-F32、native実行profileはbernini-q16x5120-f32-wasm-v1、registry契約はbernini-diagnostic-registry/0.1。native RPCの部分入口はdiffusion-models/0.1のlinearProjectionF32である。独立consumerと低水準RPCは、同じ数値演算を使っても状態・識別契約が異なる。

| 項目 | 固定条件 |
| --- | --- |
| 元対象 | blocks.0.self_attn.q.weight、full [5120,5120] |
| 選択weight | 16連続row・全5120列、F32 row-major [16,5120]、81,920値 |
| bias / activation / output | F32 [16] / [5120] / [16] |
| 実計算 | ORT Web1.24.3 WASMのF32 Gemm、その後Hike F32 bias加算 |
| binding | weight=runtime-input:weight、bias=hike-parameter:bias |
| graph SHA-256 | af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0 |

数値上の境界はy_r=Σ_c W_rc x_c+b_rである。ORTの積和とHikeのbias加算の順序を保持し、元GPUのFP8 activation量子化やscaled_mmと同じprecisionだとはしない。原本storage→F32の規則は次章の別profileで照合する。

native providerはrowStart0..5104の16連続行を扱うが、現在のLoRA共同診断はrow[0,16)に限定される。full shapeを[16,5120]へ書き換えず、選択shape・元座標・native selected-slice座標をadapterで対応付ける。biasの元full shapeは[5120]である。

入力はcompact・非shared・非detached・有限のFloat32Array。caller入力を保持し、ORT非同期実行前にstageが所有copyを取る。consumer検証には独立expected[16]と明示的な有限非負の許容差を使う。許容差を結果に合わせて緩めない。consumer候補はfeed-setであり、新しい全model sessionやinitializer変更ではない。

native packageHash・native registryHash・LoRA connection registryHash・管理snapshotHashは別identity。低水準linearProjectionF32が値を返すだけで、model binding、LoRA適合、consumer切替、生成公開が成立するわけではない。実LoRA4原本の20ケースはPARTIALの既存証拠、管理のLocal File制御試験はsynthetic-manager-control-fixtureのbaseを使う別scopeとして保持する。

# FP8復号profile

recordIdはEXEC-FP8-SCALAR-F32、native IDはscaled-e4m3fn-scalar-f32-v1。数値ownerはDiffusionであり、LoRAへは独立所有のF32 blockを返す。

| 項目 | 規則と根拠 |
| --- | --- |
| storage / compute | F8_E4M3 / F32 |
| scale | F32のper-tensor scalar、有限かつ厳密に正 |
| config | UTF-8の27 bytes、原文は {"format": "float8_e4m3fn"} |
| weight復号 | HikeのE4M3FN復号値へF32 scaleを乗算する |
| bias | 元F16 biasを別のHike DecodeF16経路でF32へ変換する |

tensor descriptor、scaleのkey/shape/dtype/value/hash、config、side、元byte offsetとrow mapping、model/graph/registry hashを対応付ける。NaNコード、不正scale、別の量子化方式、未確認転置を無視して通さない。per-channel/block scale等へ一般化せず、再量子化は採用済みとしない。

bounded providerは必要rangeとheaderを検証する。modelHashが期待する全原本hashであることと、全ファイルを今回再hashしたことは別である。既存の正当なowner receiptは結び付いた不変原本に限って再利用し、断片検証から未提供rangeへアクセスできるとはしない。

この復号profileの成立は、LoRAが量子化baseを直接受理すること、元production FP8/GPU精度、全parameter常駐、full推論の成立を意味しない。

# 固定schedulerと数値primitive

recordIdはEXEC-BERNINI-SIMPLE6-SHIFT5、native IDはbernini-comfy-simple6-shift5-v1、native契約はdiffusion-models/0.1。ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4を固定参照とする。

shift5、1000 timepoints、steps6、splitStep3、multiplier1000の固定profileである。table indexは[999,833,666,499,333,166]、最後へsigma0を加え7境界を返す。HIGHはsigmas[0:4]、LOWはsigmas[3:7]で共通境界を持つ。modelTimestepsは選択6sigma×float32(1000)。これだけでHIGH/LOW全samplingが実装済みになるわけではない。

Hike原文のtable生成は各中間値をfloat32として、t=(j+1)/1000、t=t*1000、t=t/1000、sigma=(5*t)/(1+4*t)の順で計算する。代数上同じ式でも、中間の乗除を削除して同じ丸めと扱わない。

| primitive | 原文のF32演算順 |
| --- | --- |
| noiseMix | scaledNoise=noiseScale*noise、noisePart=sigma*scaledNoise、latentPart=(1-sigma)*latent、out=noisePart+latentPart |
| inverseNoiseScale | out=latent/(1-sigma)。sigma1は特異点として拒否 |
| flowDenoised | product=velocity*sigma、out=input-product |

sigmaは有限の[0,1]、noiseScaleは有限非負でfloat32化後も有限、tensorは有限で対応するshape/長さを検査する。PRNGを実装しておらず、noiseは明示入力。seed番号の一致をnoise tensor一致の根拠にしない。別profileやstep数、APG/CFGを自動追加しない。

公開pointwise予算1,048,576要素と、内部scheduler-kernelのMAX_ELEMENTS=4,194,304／CHUNK=4096は別層である。内部能力を公開RPCの上限引上げと解釈しない。元latent2,096,640要素は現在の公開pointwise予算を超える。さらにEulerの公開経路の65,536分割も、神経graph分割やモデル対応の証拠ではない。

# 選択query 一headのstream attention候補

recordIdはEXEC-ATTENTION-Q16-ONEHEAD。正式なexecutionProfileIdは確認できずnativeProfileId=null。独立ES moduleのcreateStreamAttentionを使い、native RPCへpredict/sampleの代わりとして送らない。

| 識別と境界 | 取得済みnative宣言 |
| --- | --- |
| descriptor schema | works-stream-attention/0.1 |
| 入力source schema | works-postnorm-rope-qkv/0.1 |
| precisionProfile | f32-ort-score-exp-hike-recurrence-v1 |
| scope | EXPLICIT_Q16_ONE_HEAD_ALL_KEYS |
| Q / K,V | post-QK-norm/RoPEのF32 Q[16,128]、一headのK/V[keyCount,128] |
| keyCount / tile | 1..32760、最大64key、32760の場合の末尾は56keyを正しいshapeで処理 |
| mask / dropout | none / 0 |

score scaleはMath.fround(1/Math.sqrt(128))。ORTはQK積・scale・row max・安定化expと旧maxのrescale係数を計算し、Hikeはその係数に従うsum/value累積と最終正規化を担当する。全score配列を一括保持しないことと、本番全体のMemoryが成立することは別である。

source.describe/readKVによるbinding・offset/count・shapeを検査し、入力はcompact・非shared・非detached・有限F32とする。許可provenance.kindはexplicit-fixtureまたはprecomputed-tensorsだが、このラベルだけで本番QKV生成・resident bytes・正しいRoPE実行を証明しない。末尾を64へpaddingしてphantom keyを作らない。

productionQKVVerified=false、fullHeadCountVerified=false、originalProductionPrecisionVerified=false、E8=BLOCKEDを維持する。全query/head、production Q/K/V生成とnorm/RoPE、他stageと組み合わせたstaging/copy/Memoryは未成立。内部source schemaやprecisionProfileを、全attention対応を示す正式実行profileへ昇格させない。

# 管理が照合する版と証拠

管理285967はLoRA0c278とDiffusion438972の組合せを採用している。owner5f880のRect、tiled Q、stream attentionの能力を同じnative API名という理由で採用済みにしない。LoRA最新版側の同browser mean/20ケース診断も、管理snapshotの共同受入ではない。

COMPATIBLEは当該port/profileの契約整合。validation scope、現在resource readiness、generationReadyは別に判定する。PARTIAL、CONSUMER_APPLIED、保存package completeをfull session・生成公開へ昇格させない。未知の実行規則をshapeや名前から補完せず、ownerの固定sourceを参照する。

# 根拠と未受入範囲

固定repositoryはKushyameln01/kushyameln-works。実演算の正本ownerはDiffusionであり、この文書へ転写した式を管理側が別実装する根拠にはしない。

- owner5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3：docs/shared/diffusion-models/API.md、lora/DIAGNOSTIC_API.md、lora/diagnostic-base.mjs。
- 同commit：docs/shared/diffusion-models/scheduler/scheduler-kernel.mjs、scheduler/scheduler.hike。
- 同commit：docs/shared/diffusion-models/ort-bridge/stream-attention/stage.mjs、graph.mjs。
- 管理28596717182e48aeb23c719c51b6e593edf4e496：development/ai-connection/E1-ADOPT-RESULT.md。採用peerは438972f30242e0a3bc66edb8591f38eaa0fcd384。

20ケース共同受入、管理209件、Local Fileの管理制御、ownerのmean同browser試験、tiled Qとstream attention候補は個々のscopeの証拠である。実model全graph、全target、生成sampleの実producer/復元/decode、本番E5 snapshot、元GPU精度と利用端末の負荷改善をこの台帳作成で合格へ変更しない。

# 文書の参照先

[総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)／[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)／[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)
