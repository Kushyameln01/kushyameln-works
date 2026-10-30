# 検証・対応可否 v0.1

## 結論

担当全体は未完。実装済み・検証済みなのはHikeによるf32配列Euler更新部品と、その実行・ヘッダー検査を呼ぶ同一ページJavaScript/明示MessagePort API。Berniniのpredict/sample、ONNX変換、ORT実モデル推論、TE/VAEとの結合、全体UI、ComfyUI負荷低減は未達。

## 固定した数値処理

取得したComfyUI b5a432157de6b8884f81104cd02926adf4d597e4の `comfy/k_diffusion/sampling.py` の `to_d` と `sample_euler` が基準。churn=0で、d=(x-denoised)/sigma、dt=nextSigma-sigma、次のx=x+d*dtの順にf32計算する。ComfyUI側の当該workflow実行環境の固定版は未提供なので、この取得版を元実行版と同一視しない。

workflowのcfg1/eulerは棚卸し済み。CFGを新規に追加しなかった。simpleのsigma生成、shift5、HIGH/LOW切替、noise生成、conditioning、raw予測からdenoisedへの変換はこの部品に実装しない。固定noiseや元参照tensorなしに同等と判定しない。

## 実行結果

| 項目 | 結果と証拠 |
| --- | --- |
| 素材棚卸し | model-inventory/REPORT.md、inventory.json、各header.json。全量重みロードなし |
| Hike build/ABI | kernel/build-record.json、euler.wat。固定compiler 3c51fde…、WABT normal、importsなし |
| Node | node-results.json。Node24.19.0、13/13ケース合格 |
| HTTP実Chromium | browser-results.json。Chromium154.0.8037.57、13/13、HTTP200/application/wasm、実fetch SHA-256一致、pageerrorなし |
| 反復保持 | 65,536要素×100回でWASM memory.byteLength一定、結果copyが独立。全プロセスRAM/GC/無期限リークは未測定 |
| 大配列入力保持 | raw ABIへ262,144要素を渡し、入力arenaと全出力を検査 |
| Hike必須性 | 欠損/改変WASMを拒否。JS演算fallbackなし。数値部品に限る証拠 |
| Diffusionの外部API | api/test/browser-results.json、実Chromium13項目合格。build/session/job/revision/op照合、実Worker/MessageChannel、実15.57GB File両方のheader hash照合 |
| TE/VAE独立性/API/Hike | API_INTEGRATION.mdに記録。相手実物未取得につきNOT VERIFIED |
| 実モデル単一Memory常駐 | BLOCKED: 元payload15,574,651,928 bytes/モデル > wasm32 4,294,967,296 bytes |
| 分割推論/主要演算移植 | NOT VERIFIED。可能性を否定していない。固定ComfyUIのWan/Bernini構造・quant形式・中間tensor量を調査済み。元precision/参照tensor・分割graph実行は未検証。MatMul [13824,5120]等を候補として保持し、採用していない |
| 変換/推論/利用経路/負荷目標 | 全て未合格。実モデル結果・利用端末での同条件比較なし |

許容誤差: 手計算可能な二進表現の小配列と段階f32丸めのliteralは完全一致を要求。実モデル用の許容誤差は未確定であり、この部品試験の許容値を流用しない。

## 独立レビューと修正

読み取り専用の別担当が初期実装を点検し、3件を指摘。いずれも再現試験の失敗を確認してから修正した。

- caller所有WASM bytesをhash後に変更するとcompile対象が異なる問題: 非同期境界前のsnapshotで修正。
- loop内derivative宣言により固定compilerのstack scratchが入力arenaへ達する問題: scalar storageをloop外へ移動。入力arena保持の試験で失敗→合格。
- sigmaに文字列/null/boolean等を暗黙変換する問題: Number型を明示検査。

修正後の全13項目をNode/実ブラウザで再実行した。追加の独立確認では最大1,048,576要素の変化するf32配列が別の段階f32計算と一致した。これをBerniniの実model形状/推論の合格とは扱わない。

## 未達と再開条件

- 元モデル全体のORT wasm32常駐案は棄却。外部重み分割だけでは実行Memory制約を解消しない。[ORTの大容量モデル制約](https://onnxruntime.ai/docs/tutorials/web/large-models.html)を今回も取得して確認した。
- 分割推論を採用するには、確定した元runtimeの数値precision、LoRA適用、基準tensor、block graph境界・中間量・実CPU/RAM比較が必要。現在の空きディスクで数十GBの変換物を生成しない。元31GB重みを削除して空ける措置も行わない。
- 添付workflowはmxfp8名、保存済みはscaled FP8であり、同等性未確認。LoRA2件、入力動画・参照画像、基準noise/conditioning/latentが未提供。取得できた公開cardの一般的なWan対応説明だけでBernini全構造を断定しない。
- ユーザー回答rev2によりDiffusionModels全体は本担当と確定。独立した同一ページJS/MessagePort APIを本担当が実装する。TE/VAE APIは別担当が確定後に提示するため、結合は実物取得後に照合する。ユーザーへの仕様書書直しやビルド操作の転嫁はしない。
- 負荷目標の具体値と対象端末は未確定。OS CPU/RAM/VRAMと時間はnull/未測定で、改善率や軽量化達成を主張しない。

## 公開状態

公開なし。既存Worksの変更なし。保存済みモデル・workflow原本を維持。別担当のTE/VAE実装へ変更なし。

## 最新のソース調査

model-architecture/architecture-report.jsonに、ComfyUI固定版から復元した40layer/hidden5120/heads40/FFN13824/eps1e-6と、実quant metadataを保存。保存モデルはfloat8_e4m3fnで、MXFP8ではない。取得した公開BerniniStudio実装は元workflowの版と同じだと証明できないため、黙って置換しない。

同サイズsourceを含む65,520 tokensでは、f32 hidden1,341,849,600 bytes、QKV4,025,548,800 bytes、FFN3,622,993,920 bytes、通常self-attention score686,859,264,000 bytes。元workflowと同条件の巨大graphを通常のORT WASMへ載せる根拠は得られていない。必要なtiling/streamingは未実装で、ORT小往復検証も実graph候補確定後の未実施項目として残す。

## APIレビューの是正と残る小項目

異なるbuildの返信を現在buildとラベルし直していた問題を、host/worker双方のsource由来buildIdと完全照合で修正し、wrong/missing build replyの再現試験を追加。入力revision更新時の旧Worker終了と旧PromiseのSTALE_INPUT終端化も試験した。全13項目をroot担当が再実行し合格。

小項目として、ヘッダー内JSON重複キーの厳密拒否は未対応。API説明に形式全体の検証ではない旨を記載し、厳密なモデルimport/推論はNOT_READYのままにした。

## 実重みFP8線形演算の候補検証

`docs/shared/diffusion-models/linear/` に実験用のHike source・生成WASM・再現検査を保存。保存済みLOW/HIGH各モデルの `blocks.0.self_attn.q.weight` 先頭16行と全5,120列、実scalar scale、最初の16個のbiasを利用した。activationは固定した合成配列で、元動画実行のactivationではない。元ファイルから読むpayloadは合計163,912 bytes。全モデル・全行列を展開しない。

実WASMの全32出力は、独立Pythonの段階f32参照とbit一致し、事前設定したdouble参照の許容値 abs1e-4+rel1e-5にも合格。Node/実Chromiumの6ケースはゼロ・signed zero・subnormal・最大有限FP8値、NaN拒否、scale/bias、f32蓄積、native拒否と所有権を検査する。103,488 bytesの固定arena、WASM Memory1,179,648 bytesが各モデル101呼出しで一定。root担当も移行先からbuild・抽出・両runtime試験を再実行した。

これは構造から選んだ主要演算候補の限定検証で、プロファイルで支配的と測定した演算ではない。元FP8 scaled_mmとの数値同等、LoRA、全model predict/sample、実ComfyUIとの負荷低減は未検証・未採用。raw weight tileとfixtureはprivateなignored `linear/work/` のみに置き、commit/配布には含めない。

## 保存と再開

実装の場所は `docs/shared/diffusion-models/`、証拠と担当要件は `development/diffusion-models/`。branch `codex/diffusion-models` のローカル中間成果。公開・pushはしていない。

次に必要な実装は、数値precisionを保つlinear/token tilingとonline-softmax attention、モデル全体の予測を構成するgraph/weight staging、実ORTとの境界比較と元参照tensor比較。その成立前に `load/predict/sample` のNOT_READYを解除しない。TE/VAEは別Codexローカルから公開反映後、指定API.md/RESULT.mdを取得して結合する。終わった部品と未達の最終目的はIDEAL_STATE.mdに分けて保持する。

## 追加の独立レビュー

FP8演算では全254有限E4M3FNコード（負のゼロ含む）と、変化する16×5120配列の独立f32照合も別担当が実施し、阻害問題なし。小項目としてlinear試験はWASM/tileのhashを記録するが期待hash不一致を明示assertしていない。今回の実物は別担当が独立にhash一致を確認し、rootも同じ出力hashを再回収した。将来の試験強化として残す。
