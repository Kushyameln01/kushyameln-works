# Bernini単体完成の実装と検証

新計画のD1〜D4を対象とし、目標はtarget `[1,16,21,60,104]`、全contextを含む全N、全40block、最終head、HIGH3→LOW3の6更新、raw sampleである。小入力や部分演算の成功で、この完成条件を変更しない。

通常APIへ独立参照・gate・過去receiptを要求しない。数値比較は開発harnessで行う。既存公開load/predict/sampleは、必要shapeの通常実行・数値・資源条件が成立するまでNOT_READYを保つ。新設model candidate／sampler candidateは実装候補であり、公開通常APIの完成を意味しない。

| 作業 | 実装する単位 | 検証と残る条件 |
| --- | --- | --- |
| D1 | 全1095targetの原本registry／provider、Hike lookup decode、128row norm/RoPE、40head online attention、sequence layout | 実HIGH/LOWの選択値、実tile形状・全key・末尾、独立全値比較。原寸全queryの実行は別受入 |
| D2 | prefix→40block→全N最終head→target unpatchifyの実WASM候補 | 制御したN5は全40block配線を調べる開発case。原寸の代用にしない。必要shapeの完全predictは未完として記録 |
| D3 | 原寸pointwise、generated専用復元、HIGH公開／LOW内部変換、実モデルに束縛する6更新候補 | 2,096,640値の全値比較、保存・読戻し。pointwiseだけでsampling完成とはしない |
| D4 | 公開能力との整合、所有権／取消／解放、必要な実資源の観測 | 原寸NN完走、全工程peak、公開load/predict/sampleとWorkerでの完了が必要 |

原本はローカルFileとして段階的に読む。単一Memoryへ全重みやdense scoreを載せず、全FFN activationを保持しない。選定候補はquery128／key256／全40head、4本のhost hidden store、段階ごとのweight cacheである。cacheはhost上のF32であり、ORT内部でweightを永続保持したとは扱わない。

shape規則は管理5ab651の既存workflow-shapes.mjsを同一path・同一bytesで依存として取り込む。別のshape計算を作らない。保存はText/VAE498の既存tensor.mjsを同一bytesで再利用する。以前のローカルcodecが捨てていたcontext／latentContractを保持するための依存更新であり、Diffusion独自の保存形式は追加しない。

原本計画と共有仕様の取得記録はSOURCE-CONTRACT.json。実資源と処理量はRESOURCES.md/json。参照値、gate、fixtureは実行前にreference/contract.jsonへ固定する。実行sourceをcommitしてからnative NNを実行し、正常出力・取消・解放・保存を確認した範囲を区別して報告する。merge・Pages公開はこの作業に含めない。
