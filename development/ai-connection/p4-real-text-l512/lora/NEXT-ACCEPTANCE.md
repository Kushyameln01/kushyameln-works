# 実L512後のLoRA共同受入に必要な入力

実Textを消費したbaseのHIGH1/LOW3は、各local25+composed25の全値比較に通過した。
これはLoRAなしの固定N2/block0受入である。新canonical mappingは下記a80で取得した。実L512のLoRA F32 package・
適用後の独立参照と実受入は次工程として作成・検証する。旧Q16やsignbit fixtureをこの不足の代わりにしない。

最新取得LoRA sourceは `a80db72feea60b9bd69e292e4716665c6f0ee77f`。
新 `createDiffusionP4Adapter` と専用registryを取得した。旧Q16 adapterとpinは別のままであり、LoRA ownerへ
[実装・実資材受渡しを依頼済み](https://github.com/Kushyameln01/kushyameln-works/pull/2#issuecomment-6560391921)。
baseの受入を待たずLoRA側のmapping作業は並行できる。

## そのまま使うDiffusion公開consumer

`docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs` の
`createP4WeightFeed({source})` は新native実行source
`994ebb9ce01c9e95db9cd18eb877a981152693c5` でも固定7eeと同一bytes。
低rank積、alpha/strength、LoRA loader、全shape→sliceのmappingはLoRA ownerが所有する。

| 境界 | 実接続と次に受け取るもの |
| --- | --- |
| registry | `feed.registry()`。PARTIALの12entry、cross q/k/v/o・ffn0/2のweight+bias。original key/full shape、side、model/graph/registry/profile識別を新正本mappingに保持する |
| immutable base | `baseProvider.readBlock(weightId,offset,count,{...identity,fullShape,signal})`。元FP8/F16を実Hikeで復号したowned F32。元full tensorの要素座標、全input列、通常16出力行以下・FFN down4行以下・81920要素以下 |
| LoRA計算 | ownerが不変baseに低rank/alpha/strength/diff/biasを適用し、完成F32と元LoRA/selection/plan/SDK revision/patch範囲・hashを返す。原FP8 bits/scaleとF32を同一視しない |
| sink | `createSink().begin({...identity,patches}) → writeBlock({weightId,offset,count,fullShape,binding,dtype:'F32',sha256,data}) → finish(identity)`。完成F32をowned copy。疎範囲外はimmutable-base pass-through。再scale/再decodeしない |
| actual consumer | matrixはoriginal-key slot→ORT runtime input `weight`、biasはoriginal-key slot→Hike AddBias parameter。model weight initializer targetはない |
| candidate | `prepareLoad(package,{...identity,signal,isCurrent}) → validate(...)`。新LoRA用に固定した独立`blockOutput:F32[10240]`、hash/referenceId、既存composed gate abs.01/rel.001、同一入力/weight/package bindingが必要 |
| 実run | validateの`run(candidateSource,ownedInput)`は`createPostSelfAttention({source:candidateSource})`を作り、既存L512 native capture・N2 residual/timeAct1を渡す。全25cutの独立比較を最終出力検証と別に記録する |
| 切替・復帰 | valid receipt→signal/current/epoch再検査→commit。自分の現active epochだけをrollbackする。prepareBase、再適用、検証失敗、取消、復帰、同時旧leaseと独立copy/retentionの証拠を新scopeで得る |
| 解放 | run中のpinned read lease、package/candidate/active/historyの内側buffer所有を区別する。releaseCandidate、sink.release、abort、feed.dispose、source.disposeの終端を実測する。旧Q16 dense-copy文言を流用しない |

## 実入力と独立参照の固定

Textは [input-freeze.json](../reference/input-freeze.json) の全512行/mask/元headerを使う。
元native JSON SHAは `9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8`。
HIGH1/LOW3の保存residual/timeAct1も同freezeの各sideを使う。HIGH/LOWの共同切替を
今回の個別base受入から推定しない。最初のLoRA共同scopeはlight/HIGHの明示範囲を先行できる。

LoRA ownerから、versioned正本adapterの完全commit/path/hash、元Fileまたは取得可能な非公開の
完成F32 block、LoRA計算の元reference/gate/receiptと選択range、実行/検証に必要なcaller codeを受け取る。
Diffusion保持環境でowner codeを実行する方式、またはowner保持環境から実prepared成果を渡す方式の
どちらも、原本取得と本人ACKを分けて記録する。選択light/LOW原本は既存owner catalogのURLから取得し、1,244,141,856 B／SHA-256 `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` が一致した。

LoRAで変わるweightをbase referenceや旧Q16 expected16で検証しない。LoRA用の入力・完成weight・
model/graph/package identityを先に固定し、Diffusion側の独立投影/norm/attention/FFN referenceへ結ぶ。
`runP4RealTextL512` 診断driverは明示base専用であり、LoRAを外から注入したと主張しない。
旧oracleのpatch数値演算はあるが、a80の公開harness/oracleはcontrolled K4専用なので、実L512・保存LOW入力の別wrapperを設ける。低rank数値演算はowner moduleをそのままimportし、K4 expectedを転用しない。

## 資源と未受入

baseで測った26,825,525,760 Bのlinear snapshot、63,709,184 Bの返却配列、read lease1→0、
WASM21,102,592 Bを、LoRA package/staging/history/旧新candidateの測定へ転用しない。
16MiB/package・64MiB aggregateは疎patch内部の上限で、全体RAM予算ではない。
新LoRAのcopy、同時保持、session/lease、適用後検証・commit/rollbackの時間/メモリは未測定。

実LoRA共同受入、任意pair/side、二組同時合成、全target/model、本番shape、実HIGH→LOW、
生成・VAE decodeは未受入。`load/predict/sample=NOT_READY` を維持する。
