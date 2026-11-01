# R11 管理P4接続・P3追加境界・workflow受渡し

2026-11-02 JST。基点は `5aa5a806f84a875c542b2922fe80ef6faafc7915`。
ユーザー指定の既存catalog／規範／native adapter／queueへ接続する方式を使う。
P2受入、旧N2、LoRA DATAとnative pinsは維持する。演算・層mapping・参照生成はowner担当。

## 確認した前提

- P4元配布7ee、実行5744／base8294。最新994で実Text L512独立referenceが固定された。
  native runtimeの50sourceは同じbytes。最新994は診断runnerのsource admission修正を含む。
- 実Text f76のcaptureと独立referenceの固定は成立。P4 native数値PASSは未成立。
  既存L4 fixtureをL512実Textへ付け替えず、当該実数値dispatch受入は依存待ちにする。
- nativeは同一realm ES入口。captureは同じconditioning moduleのWeakMapで認識される。
  structuredCloneしたcaptureをnativeへ渡さない。native厳密引数へ管理targetを追加しない。
- 25出力はnamed裸F32配列。ownerは25個のmachine nativeMeaningをexportしていない。
  保存wrapperの意味IDは管理側の明示sidecarとし、owner native宣言と偽らない。
  blockOutputはblock0 hiddenであり、Text hidden／VAE latent／sampleへ改名しない。

## 実装する境界

独立P4 candidate catalogを親6dae v1.0-draft.1から作る。親6file／旧N2候補は上書きしない。
有限のP4 shape・source・conditioning・numeric identity比較を既存evaluateEdgeへ追加する。
互換性を決める別判定器は作らない。required missingはUNVERIFIED、既知不一致はINCOMPATIBLE。
既知一致で数値reference／receiptだけ不足する場合はCOMPATIBLE／NOT_VERIFIED／BLOCKED。

外側adapterは同期のowned snapshot、source proof、同一realm conditioning clone、
既存norm実行phase、queueのoriginal factory/run終端、対象取消、owner解放、
release失敗時quarantine／recover／新generationを管理する。
factoryはsource→feed→stageのowner bundleを返し、解放はstage→feed→source。
constructorにsignalを追加せず、取消後も元factoryを待って得られたownerを解放する。
runはownerの `{residual,timeAct1,conditioning,signal,onProgress}` だけを渡す。
owner検証callbackは独立参照と事前gateを使い、管理はtarget/input/output/referenceの結合を検査する。
nativeTextは固定f76の全512行／mask／model／Tokenizer／metadataを保持する。
metadata hashはownerのp4ConditioningMetadataBytesをそのまま呼び、独自encodingやJCSへ置換しない。
K4 fixtureとnativeTextの数値cohortは分離し、欠落を相互代用しない。
実Textの比較範囲は明示comparisonModesでcomposed25またはlocal+composed50へ固定し、
先行owner PASSのscope・参照・全25出力・gateと照合する。未選択のlocal参照を追加要求しない。

25出力と証拠／trace／拡張／入力来歴を既存E4 writer/readerとcodec2bdで保存する。
principal artifactは `#blockOutput`。`output` aliasを26番目のartifactにしない。
保存semantic IDは `works:p4-output:<name>:f32`、
`meaningAuthority:management-sidecar/owner-named-output` と `ownerNativeMeaning:null` を保持する。
複数producer・nativeText mask/Tokenizer・opaque extensionsを失わない。

holding環境用runnerを固定sourceで配布する。private modelや既存input/referenceを暗黙取得しない。
ownerの実Text P4事前数値receipt／独立reference／gate／明示予算が欠ける場合は
native0・browser未起動・BLOCKEDを返す。owner既存compare関数を使い、管理に数学を実装しない。
L512の静的出力extentと、実測WASM容量／RSS／copy／全工程peakを区別する。

## P3の追加3条件

固定管理884正本runnerによるLoRA配布a80の実返却を取得し、次を照合して受け入れる。
過去の60d／owner28fの6ケースは旧scopeで保持し、新しい884実行とsource/tupleを区別する。

1. initial-one実16出力のE4 write/fresh filesystem readbackとsnapshot・application・hashを照合する。
   同packageについてfresh reader内でpayloadを変更／snapshotをnull化したexact拒否を確認する。
   private保存binaryは本環境に未取得であるため、ownerの実disk記録＋公開reader receiptの受領と表記する。
2. 実File・真正base由来registry・正式bridge planで、expectedだけを改変した
   `NORM_REFERENCE_PAYLOAD_MISMATCH` がprepare前であることを確認する。
   新884の6公開case＋取消1のprepare/stage各7と、wrong-reference caseのnative準備0を区別する。
3. request/revision/resource generation/native tuple/snapshot、3phase、取消復帰、owner解放、
   receiptの実行sourceとobserver source、初期化と数値処理、資源計測のscopeを保持する。

既存formal bridgeのprepare前参照拒否の回帰試験を維持する。取得確認のための
実File再hash・再推論・再exportは行わない。全model/P4 LoRA mapping/current sessionの受入へ拡大しない。

## Workflowと共有

元workflow21501B（SHA543865df…）を同一bytesで取得済み。
固定Python/editor sourceからsource/reference/8slot、条件付き供給順、resize/frame規則を整理する。
実媒体のH/W/F／実選択indices/timesは未取得のためnullを保持し、依存処理だけ保留する。
VAEへsource hashes付きhandoffを返す。

固定runnerをGitHubへpushし、owner保持環境へ具体的な実行・返却条件を渡す。
source取得ACKと数値受入、配布SHAと各実行source、再利用証拠と新試験、資源実測と未測定を分ける。
generationReady:false／load-predict-sample NOT_READYは本番必要条件が成立するまで維持。
merge／Pages公開は行わない。
