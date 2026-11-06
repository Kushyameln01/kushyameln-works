# 原寸caseと公開Workerの段階検証（2026-11-02 JST）

今回の基点は配布 `3aed2f696adf36385b54cfaa5019d447d64984e0`。実装経路の接続、入力域の数値受入、原寸の全工程完成を分ける。実行sourceと各試験の結果は検証完了後の固定receiptに記録する。

## 入力と精度

元workflowで確定しているtargetは832×480・81frames、latent `[1,16,21,60,104]`、target32760 token。sourceは上限81framesであり実frame数ではない。reference_videoは未接続。wired画像3件はmode4、slot保存値2件は実行時の有効stream数を示さない。同じslotのnon-null wired入力が優先し、なければslotファイルを使う。3件と2件を加算しない。

今回の別caseはtarget原寸を維持し、source81frames相当、non-null wired参照848×848を3stream、reference_videoなしと明示した。source32760、各参照2809、合計73947 token。context順序はsource→有効slot0→1→2で、各streamのframe順を維持する。媒体/VAE由来と検証された値ではなく、保存済みcontrolled F32配列を使用する。元動画・画像と同条件の再現証拠ではない。[入力契約](input-contract/README.md)。

実Textは保存済みHello worldの `[1,512,4096]` 全行、mask512件（active3）を保持。maskは元coreに従いprovenanceとして残し、cross-attentionのsoftmaxには新たに適用しない。producerの実final RMSNormに基づきnormalization metadataだけを補い、payloadを再正規化・圧縮しない。元workflowのpromptやnegativeと同一とは扱わない。

保存モデルは固定scaled E4M3FN/F16、固定Hike loaderの復号、現在のF32演算。独立参照はF64 dot/reduction/attentionと元のF32境界を使い、実行前に固定した `abs .01 + rel .001*abs(reference)` で比較する。元mxfp8環境の計算dtype・同等性は未確認だが、今回の単体実装・明示caseの試験を止める条件ではない。

## 再利用した証拠

基点のN5/Text L3、HIGH/LOW各全40block/head、HIGH3→LOW3の6更新、生成sample専用復元・保存は元source・入力範囲に限定して再利用する。新しいL512や原寸の数値結果として再掲しない。旧N65520容量用store・最大FFN tile、限定all-key attentionも元scopeを維持する。

## 変更境界

- 公開load/predict/sampleを実model/sampler ownerへ接続。全体待機列は管理側、数値計算・内部資源はDiffusion側が所有。
- 全Nを128行以下で比較するdiagnoseChunksを追加。stopAfterBlock診断はvelocityや完全predictを返さない。旧diagnoseの128token制限は別に維持。
- 不変重みの最大1MiB read window、owned prepared CPU weight、KV tileをまたぐowned Q/attention state、明示COI4-thread profileを追加。内部ORTコピーの消滅を主張しない。
- capabilitiesの実装済みroute／構造受付と、数値受入domainを分離。90k tokenは計画上限であり検証済み入力域ではない。

## 資源と再現

[資源の分類と容量](RESOURCE-METHOD.md)、[chunk比較runner](reference/CHUNK-BROWSER.md)、[公開Worker runner](../public-worker-20261102/README.md)を参照。実モデル全体をHTTPで配布・全量F32常駐させず、local Fileとbounded重みstagingを使用する。モデル・保存tensorのprivate pathは実行環境の参照であり、相手の取得ACKではない。

## 原寸probeの実測結果

source `0f761f374dce1d447bbb912ad13c08f9bf85c279`、HIGH/t1000、Chromium154、CPU quota4、memory.max16GiB。事前指定した1800秒の運用上のwatchdogで中止し、cleanupを含む1812.227秒でreceiptを確定した。**完全block0は未受入である。停止原因はwatchdogであり、kernelエラー、精度失敗、Memory上限による実行不能を示すものではない。**

| 境界 | 独立比較済み行数 | 必要行数 |
| --- | ---: | ---: |
| patchHidden／post-modulation hidden／K／V | 各73,947 | 各73,947 |
| Text投影 | 512 | 512 |
| Q | 5,248 | 73,947 |
| self-attention／O projection／自己注意残差 | 各5,120 | 各73,947 |
| cross K/V | 0 | 各512 |
| cross Q・attention・残差／FFN／block出力 | 0 | 各73,947 |

比較済み2,485 chunks、1,622,609,920値は失敗0。最大絶対誤差0.000217437744、最大gate比0.01576734（1以下で合格）。5,120 queryは全73,947 key・全40 headを使用し、key末尾219件も処理した。contextは全件K/Vとして参加しているが、比較を終えたqueryはtargetの先頭部分であり、context queryと最終91 queryのtileは未到達。target-onlyで全context対応を受け入れた結果ではない。

nativeでは41 query groupsのattentionが終了し（11,849＝41×289 key tiles）、最後のgroupは独立比較待ちで中止した。そのためQ5,248とself-attention5,120のcoverageは異なる。cross-attention・FFN・最終head、原寸HIGH/LOW完全predict、原寸6更新・raw sample保存へは進めていない。

| 観測対象 | 結果・範囲 |
| --- | --- |
| process tree RSS合算peak | 11,457,220,608B。共有pageを重複計上する |
| process tree PSS合算peak | 11,180,201,984B。browser、driver、独立参照processを含む |
| 観測WASM Memory容量 | 合計178,520,064B、うちORT165,937,152B。allocator live量ではない |
| native hidden storeの宣言span | 4個、合計6,057,738,240B。全ページの物理常駐や全query完成を意味しない |
| 実到達stage weight cache | peak209,715,200B。原寸FFN cache566,231,040Bはこのrunでは未到達 |
| native側計測attention | 474.380秒／41 query groups。内部allocator/copyの全内訳は未観測 |
| native側layout copy | 102.430秒。23,780回のhead-major／row-major配置copy |
| native側Gemm等linear owner | 169.129秒。prefix・K/V・実行済みQ/Oを含む |
| native側math owner | 190.535秒。norm・RoPE・modulation等 |
| native側weight read/decode owner | 8.899秒。この部分runの対象のみ |
| 独立比較server時間 | 622.532秒。参照計算・binary比較。通常APIの必須工程ではない |

これらのtimerは内包関係があり、加算して排他的な総時間にしない。prefix104.851秒／self-attention stage1698.005秒はcallback待ちを含む。資源観測はexec前からcleanup後まで行った。共有cgroupではreclaimを伴うmax eventが増えたが、OOM／OOM killの増分は0。共有file cacheとshmemをnativeの保持量へ加算しない。

nativeのAbortErrorによる取消後、activeHiddenStoreBytesは0、cleanupErrorはなし。独立参照の処理中だった子processを終了し、X/K/Vの3ファイルを削除した。記録のEOFErrorは中断したIPCの終了時イベントで、数値不一致ではない。残る3個のChromium zombieはRSS0で、実行中processとは区別した。

## 最初の未完了境界と必要な対応

最初の未完了境界はHIGH/block0 self-attentionの**全query**である。現構成はquery128／key256／H40／D128のexact online attentionを動かしており、全score行列は保持しない。それでも実測の演算時間とlayout/copyが大きい。41 groupsで観測したattention owner474.380秒を同条件の578 groupsへ単純比例すると約6,688秒になる。これはattention owner部分だけの**見積もり**で、実測の全query所要時間でも、全40block・6更新の所要時間でもない。layout、他operator、独立比較、GCや後続stageは別に必要。

現時点で「WASMでは実行不可能」「shape非対応」とは判定しない。続行には全queryの比較を完了できる実行時間／資源構成と、計測されたlayout・staging・ORT入力copyの改善を評価する必要がある。例えばhead-major K/V保持による再配置削減やnative weight/activation供給の改善は、独立参照・所有権・Memory予算を保った別の変更境界として検証する。未実装の高速化を成果に含めない。

原寸block0が未完のため、原寸のcross-attention・FFN・全40block・最終head・HIGH→LOW6更新の組合せ資源条件は未受入。旧容量試験と今回の部分runを合成して完成扱いにしない。[完全metadata receiptと資源要約](../public-worker-20261102/evidence/full73947-block0/README.md)から停止位置・copy・取消・未観測範囲を取得できる。

## D1〜D4の状態

| 項目 | 実装・成立範囲 | 未完了・未受入 |
| --- | --- | --- |
| D1 実shape／全block演算 | 全1095重み、全40block/headの既存bodyを再利用。新L512/N5の全40・6更新とblock0中間比較、原寸全KVと一部queryを新規検証 | 原寸の全query・末尾query・cross/FFN、全block組合せ |
| D2 完全predict | 公開load/predictを実ownerへ接続。N5/実L512のHIGH complete predict、sample内HIGH/LOW各3回のcomplete predict | 原寸HIGH/LOW各40block・全head・target抽出/unpatchifyの数値・資源 |
| D3 6更新／raw sample | 公開sampleのN5/実L512、HIGH3→LOW3、raw生成sample専用復元、実File保存読戻し。新最終128値fail0 | 原寸6更新・raw出力。新L512の各更新latent/段間全配列の独立比較は別未完で、旧L3scopeを流用しない |
| D4 API／Worker単独 | 他推論moduleを起動せず、保存inputとモデルのみで実行。取消→同じAPIでreload→完走、side切替、dispose、canonical保存。準備失敗時のphysical resetを追加 | 原寸全工程完走・全stage同時保持とcopy/time予算 |

**D1〜D4の原寸での単体完成は未達。** 小入力のAPI完走と、原寸self-attentionの部分受入を完成へ読み替えない。詳細な新規数値・公開API・修正後の状態検証は[公開Worker結果](../public-worker-20261102/RESULT.md)に記録した。

## 元workflowの完全再現に必要な未取得情報

sourceの実frame数・保存context descriptor／manifest、実行時有効slotと参照媒体の実寸法、元mxfp8環境の計算dtype・loader実行記録は未取得。この未取得事項は元workflowの再現性に関するもので、今回の明示caseでの単体実行や公開API実装を止める条件にはしなかった。今回の未完了境界の理由は上記の実測stageと検証未完であり、他担当のACKや完成待ちではない。

## 取得と配布

[実行sourceと配布sourceの対応](EXECUTION-SOURCES.json)、[再現手順](REPRODUCE.md)、[API](../../../docs/shared/diffusion-models/API.md)を参照。GitHub branchは `codex/diffusion-derived-hidden-heads`、Draft PR14を利用する。配布commitはこの文書を含む固定commitとしてPRと最終報告へ記録する。merge・Pages公開は行っていない。
