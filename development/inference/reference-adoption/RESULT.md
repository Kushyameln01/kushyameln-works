# P0とP2 Rect候補traceの結果

2026-10-31 JST。[新計画1.0-draft.1](https://chatgpt.com/space/page_78c30bebe16481918944e621b8c2a02a)の本文87block、Profile総合管理台帳と担当Profile・管理照合規範・数値規則の本文を取得した。参照JSONは文書版`1.0-draft.1`、固定commit `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、計画固定commitは`0fb553fd081d3bcbbad4ead7accd165679f77d34`。

**P0の静的対応は完了。P2の候補mean数値traceはPASS。P2の正式採用はP1待ちでBLOCKED。** 管理285967には参照loader・norm binding実装がなく、その責任をVAE側へ複製しない。候補診断を既存管理採用entryやgenerationReadyへ昇格していない。

## Sourceと変更範囲

| 対象 | 固定source / 識別 |
| --- | --- |
| VAE/Text native | `855f435120f08eb9e818e51281fc26f0e2633829`。API、codec、数値処理、モデル、UI、Workerは同じbytesを使用 |
| 管理候補 | `28596717182e48aeb23c719c51b6e593edf4e496`。実capture/queue/packageのES moduleを別directoryからimport |
| Diffusion候補 | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。Rect専用ES hostと実Hike ABI `wan21-raw-mean-f32-v3` |
| Diffusion build | `diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20`。固定source buildへの対応。今回全RPC APIを起動した意味ではない |
| 実ロードしたDiffusion Hike | 8210 B、SHA-256 `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d` |
| 明示G1C codec | source `2c171a09ccda65c54899f322ae490f1bfcaac6fb`、SHA-256 `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b` |
| 既存採用組合せ | 管理285967＋Diffusion438972f…。そのentryは上書きせず、新候補を[P2 candidate entry](p2/CANDIDATE-ENTRY.json)へ分けた |

変更はP0 sidecar/証拠index、P2検証harness・生成物・報告、既存ブラウザ受入helperの固定Rect profile選択追加。default F1の入力契約は4件の小さい検査で確認した。native `works-ai-1` API、tensor schema、数値規則とモデルには差分なし。既存profileの再export・原本棚卸し・Text全数推論・参照tensor再計算は行っていない。

## P0とgate

[宣言対応表](p0/DECLARATION-BINDINGS.json)はVAE F5/F1/Rect、Text plain/IDの5宣言と12規範の対応を保持する。[証拠index](p0/EVIDENCE-INDEX.json)の62件・531,578 Bを実bytes/SHAで照合した。nativeと外側sidecar、契約宣言・数値受入・動的resource状態、shape/意味/正規化、model/Tokenizer/decoder、source/build/kernelを区別する。

- VAE manifestの比較gateは元の`0.002`を保持。F1/Rect実受入は別の事前plan `2e-5`。manifestを書換えて受入済み表示へ変えていない。
- Text選択manifestの最終`numericGate`はmaxAbsError/rtolとも`0.001`。ID fixtureの独立比較、plainのshape/mask/finite/制御成功を元scopeで保持する。plain固有の独立全値比較は未取得で、ID誤差を転用しない。
- Diffusion F5の`2e-6`はF5自身の固定合成128値・独立oracle/保存往復sourceから取得した。F1/Rectの値を補完したのではない。F1/Rect meanの`2e-6`も各owner receiptへ結び付ける。

未取得値は理由付きnull。台帳IDをnative profileIdへ挿入していない。詳しい条件と再照合は[P0 README](p0/README.md)。

## P2候補の一trace

profileは`wan21-raw-f32-1x16x32`。raw meanはfloat32 NCTHW `[1,16,1,2,4]`、128値/512 B。RGBは`[1,3,1,16,32]`、1536値/6144 B。元入力は診断PNG W32/H16/F1、source・slot/context/frame `[0]`/時刻`[0]`を保持する。実workflow媒体のprofileと呼ばない。

1. 既存の実VAE encodeで得たRect meanと元報告を再利用。元file SHA `8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8`、payload SHA `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`。
2. 管理の実capture→directory保存→package読戻しを通したraw meanを、Diffusion5fの`NormalizeRawMeanRect`へ渡した。全128値のnormalized payloadは既存ownerの独立oracle比較receiptと同じhashだった。
3. normalizedは意味`wan21-normalized-posterior-mean:v1`とmarker `wan21-comfy-f32-v1`を保ったowner-owned memoryのまま`RestoreRawMeanRect`へ渡した。VAE/管理にmean/stdの式は実装していない。
4. 復元raw meanを管理でcapture/保存/読戻しし、既存Rect bundleの実VAE UIへFile入力した。raw decodeを一回だけ実行し、独立native RGB参照全1536値へ比較した。
5. RGBとdecode evidenceを管理でcapture/保存/読戻し。入力mean・normalized・restored・RGBのpayload hash、profile/model、graph/重みhash、context、operation、候補source/buildとpackage receiptを同一trace IDへ結んだ。

実行traceは[p2/run/trace.json](p2/run/trace.json)、実保存物は`input-raw/`、`restored/`、`rgb/`。snapshotはnull、owner/trace/evidenceは外側に保持。meanをgenerated sampleへ改名せず、model/decoder識別も付け替えていない。

| 比較 | 全要素数 | 最大絶対誤差 | 比較前gate |
| --- | ---: | ---: | --- |
| Rect mean normalize→restore | 128 | `2.384185791015625e-7` | `2e-6` |
| raw decode RGB→元native参照 | 1536 | `4.328787326812744e-6` | `atol/rtol/maxAbs=2e-5` |

RGB RMSEは`6.104514800995174e-7`。normalized/restored payloadはowner既存receiptの全値hashと一致し、管理保存往復では全値と供給metadataが一致した。新たにnormalizedの独立数式oracleをVAE/管理へ実装したわけではない。WKT読戻しで付くschema/byteOrder/payload hash headerと、供給した元metadataの保持を区別して検査している。

## 保存制限と失敗の記録

固定G1Cは有効なnormalized markerを検査するが、その文字列をWKTへ保存しない。追加で試したnormalized中間packageは、管理が`NATIVE_METADATA_MISMATCH`で拒否した。P2で必要なraw mean/RGBの保存は維持し、normalized中間をrawへ改名して通すことなく、owner memoryとtrace上の意味・marker・hashを保持する。normalized中間WKTの完全保全は未受入のまま。このcodec/管理制限を黙って修正・回避していない。

[excluded-trials.json](p2/excluded-trials.json)に、追加normalized保存の拒否、test側のheader追加に関する過剰な同一性要求、sandboxのlocalhost socket禁止による停止を記録した。いずれもVAE推論前に停止。供給全fieldの保持比較へ修正し、実行環境の許可済みnetwork設定を適用して、freshな出力先で実WASMを受け入れた。値のgateやownerの計算は変更していない。

追加の負の確認は、同じ128値の旧F5 guard拒否、Rect decoderへのF5 shape拒否、normalizedをraw decoderへ渡す際の意味拒否、各packageのevidence欠落拒否。queue待ち取消はowner dispatch前に止まり、Hike/native計算を起動していない。稼働中のVAE取消は今回再実行せず、同一native source/profileの既存E6取消・復帰証拠を再利用する。

## 資源終了と検証

今回新規のVAE NNはraw decode一回、Text/encode/exportは0回。Diffusionの実Hike呼出しは受入trace中2回、固定arena1024 B、memory1,114,112 B、入出力copy各1024 B。kernel dispose後の操作拒否も確認。

VAEは実ORT Web WASM1thread/FP32、Hike conv2は17 call。Worker1作成/1終了/live0。VAE sourceは`finally`でoutput/input tensor破棄・`await session.release()`してから結果を返す。今回はsessionの内部release呼出し数を別instrumentationで計測していないため、以前の3/3 probeと件数を合算しない。

Browser子孫のsampled peak PSSは1,334,686,720 B。RSS合計は共有pageを二重計上し得る。decode操作3.486 s（download/save前まで）、pipeline全体7.103 s。Browser helperの所有子孫11件・3件wait回収、生存0/zombie0/errors0。親pipelineの観測14件も生存0/zombie0/errors0。50/100ms samplingで短命forkの全捕捉や端末全体peakを保証しない。helperと観測PIDのctimeも照合して消失を確認した。

小さいprofile helper検査4件、既存接続fixture12件、Python53件は合格。P0照合・source取得・file回収・NN比較・管理採用は別scopeであり、成功件数を合算しない。詳細は[pipeline結果](p2/run/pipeline-results.json)と[Browser結果](p2/run/browser/acceptance-results.json)。

## 未受入と次の条件

- 正式P2は管理P1のreference loader/norm bindingと対象Rectの規範照合・候補採用待ち。今回のdirect ES candidate traceをP1 runtimeの成功へ読み替えない。
- normalized中間WKTのmarker保存、plain固有の独立全値比較は未受入。
- 本番Diffusion load/predict/sample、全session snapshot・全target、実媒体の不足profile、81frame、実generated sampleのproducer→復元→decodeは未受入。P5で実sampleと復元証拠が成立した後、P6で必要profileだけ追加する。
- 元GPU precision・全workflow一致・利用端末の負荷改善は未検証。既存profileを無断で縮小・padding・frame削減して本番へ適用しない。

再現は[REPRODUCE.md](REPRODUCE.md)。モデル原本・大型ONNXは非公開のまま。source/manifest/hash、小さいtensor、実package、測定記録を成果物として共有する。
