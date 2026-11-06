# 固定N2 self-attention tailの管理接続仕様

根拠は今回のユーザー指示と、配布 `beffdcb800b629d0b13ff43bbc90e9f74c659152` の
`development/ai-connection/self-attention-tail/handoff.json`、同 `RESULT.md`、
`docs/shared/diffusion-models/ort-bridge/self-attention-tail/README.md` の取得本文。
管理基点は `03e18b6116c3d778197e4d34ba0364a7dbe918f6`、実行sourceは
`a49aac492cc68e2dd6037e0deb4a6954731a847a`。

対象は `bernini-block0-n2-self-attention-residual-f32-v1` のHIGH1・LOW3を個別に実行する経路。
旧N2 attentionと正式82b LoRA DATA bridgeの受入を上書きしない。
意味は自己注意後token hiddenであり、mean、生成latent、sampleに読み替えない。
attention/patchHidden/o/gated/residualはF32 `[2,5120]`、timeAct1/gateProjection/gateはF32 `[5120]`。

実sourceのmodule/WASMと公開receipt・gateをbyte/hash/長さで固定する。
公開receiptと非公開の入力・独立参照・保存済み出力・元モデルの実体を別々に受領確認する。
他環境の絶対pathやhashだけでpayload取得済みとしない。保持環境で固定管理sourceを実行できる
runnerを用意し、実payloadを受領するまでは実数値実行edgeをUNVERIFIEDで止める。
prefix全体、独立参照、元モデルを理由なく再計算・再取得しない。

nativeは同realmの独立ES `createSelfAttentionTail` とそのownerの `run()` を使う。
constructor引数はfile/side/trustedInputs/bridgeBytes/mathBytes、run引数は
attention/patchHidden/timeAct1/signal/onProgressに限る。管理target等は外側に保持する。
RPC operationやLoRA bridgeを追加・流用しない。trustedInputsの固定prefix/attention receipt・
artifact・配列hash・side/block0/scheduleを照合し、任意入力やLoRA後の入力へ証拠を付け替えない。

既存evaluateEdgeを唯一の互換性判断に使い、未対応必須規範はUNVERIFIEDとする。
元catalogと既存6規範文書のbytesは保持し、新tailは別候補catalog/record/entryへ登録する。
事前宣言、実検証後の数値receipt、保存・取引receiptを順に照合する。
既存queue/package/cacheを再利用し、モデル演算・独立数値judge・新mappingを管理に追加しない。

管理targetの取消、遅延旧結果の不採用、元factory/run Promise終端、owner解放を検証する。
constructorはsignalを受けないため取消時も元factoryを待って得られたownerを解放する。
解放失敗はqueueを隔離し、recoverで同じownerの解放を再試行する。
native recoverはownerを終了するので、新規実行には新ownerと新resource generationが必要。

保存は5出力を識別し、LC/C shape、hiddenの意味、来歴・evidenceを読戻しで確認する。
対応済みcodecが条件を満たす場合だけ既存E4へ渡す。非対応なら保存edgeを保留する。
受領済み保存artifactの全file hash確認は、新runの数値gate比較と分ける。

資源予算はN2 tail診断専用として明示入力する。tail単体のHike2883584B・
ORT共有Memory16777216Bは元observerの観測であり、総RAMや全工程予算へ転用しない。
native evidenceのORTMemoryBytes等のnullをその定数で埋めない。中止条件と未知の総peakを記録する。

cross-attention、FFN、全block、実HIGH→LOW、本番生成、任意LoRA、全体資源予算は対象外。
generationReady:false、load/predict/sample=NOT_READYを維持する。
成果・実source・再利用証拠・新規検証・未受入を分けて同作業branchとDraft PRへpushする。

## ユーザーが確定した保持環境での実行順

1. 管理が、実adapter・規範照合・保存経路を通るrunnerを完全commitに固定する。
2. Diffusion担当が実資材保持環境で実行し、固定入力・独立参照との照合結果を返す。
3. 管理が両者のSHA・Profile・実証拠を照合して、管理接続の受入を記録する。

今回の管理側配布で1を完了し、2・3は返却待ちとして明示する。公開receiptや制御fixtureの
合格を、保持環境でのHIGH1/LOW3実数値・実保存受入の代わりにしない。
