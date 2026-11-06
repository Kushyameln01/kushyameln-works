# P2・P3共同受入と固定N2入力契約の継続

管理基点: `60d16b64d6020d3d20239f087f8add91268dcaad`。
今回のユーザー指示を実行する。配布SHA・実行source・API差分・再利用証拠・新規検証・未受入・
再現手順を分け、固定sourceの受領側取得確認と共同実行返却までを追跡する。
mergeとPages公開は別状態であり、この作業で実施しない。

## 固定条件

- N2の既存ADMISSIONを唯一の受入記録とし、管理5c484/native a49/返却508d/build/Profile/
  catalog1.0-draft.1と全入出力identityを追加対応付けする。既存2runを追加実行へ数え直さない。
- tailは固定自然N2/block0/HIGH1・LOW3診断。任意module/P4への新edgeは別contract/adapter/profile/
  owner evidenceを必要とし、今回の受入で自動接続しない。P4演算・対象層mappingはDiffusion owner担当。
- 元catalog6dae、既存LoRA DATA82b/nativefc/consumer5f、VAE855とcodec2bdを一括置換しない。
- 数値・対象mappingはownerの既存実装を使う。管理に新演算／別judge／duplicate mappingを追加しない。
- contract一致・数値証拠だけ不足の場合はcompatibleを維持しNOT_VERIFIED/BLOCKED。
  未知の必須contract/schema/宣言はUNVERIFIED。phase準備許可は数値受入・生成許可とは別。
- generationReady:false、load/predict/sample=NOT_READYを維持する。

## 分担と実装境界

### 1. N2固定受入の追記

担当p23_acceptance。既存 `n2-tail-management/acceptance/ADMISSION.json` に実行時catalog/schema/
文書版・gateRef・3入力と5出力・各side reference・phase別norm状態・storage/source identityを結ぶ。
既存raw packet・過去scopeは保持し、必要な説明とevidence manifestのみ更新する。

### 2. P2の一trace

担当p2_joint。既存Rect管理runのowner normalize→marked E4→readback→owner restore→E4/readbackと、
既存規範Rect runnerの実native855 decode→RGB E4/readbackを外側のorchestratorで接続する。
traceIdとcurrentInputLinkに、今回のraw/normalized/restored package・payload/model/profile/context/
source/evidenceを束縛する。旧encode351の証拠は条件確認付きで別に再利用する。
復元fileは既存dd483の固定guardと一致するためguardを緩めない。
既存のreceived-owner-RGBは新decode結果へ付け替えない。
通常decodeとcancel-recoverを別fresh outputに実行し、元Promise・Worker stop・owner release・保存を照合する。
NN asset3原本286314451Bは保持環境で使用し、管理へ無用に転送しない。
joint入口では各mean owner呼出し前に既存evaluateEdgeで有限の静的宣言を照合する。
未来の数値／取引receiptは付けず、未知必須・既知不一致を停止する。
数値だけ未検証のCOMPATIBLE/NOT_VERIFIED/BLOCKEDはbounded診断prepareのscopeに限定し、
数値受入・生成受付を解除しない。既存meanの全面phase設計変更は行わない。

### 3. P3の真正取引

担当p3_joint。単一の選択local Fileとownerが検証する真正bounded artifactを、正式82b DATAbridgeの
plan/preflight/checkpoint/postpublicationに通すdevelopment runnerを追加する。
native fc adapterと5f `createBerniniBlockProvider` の既存mapping/decodeを使う。
public describeBinding・inspection・実File hashからpredeclareし、正式入口前のnative plan迂回は行わない。
元709364B bounded artifact（5raw ranges）と9参照arrayは、既存owner hashへ照合する。
bounded artifactはPage JSON原本から取得し、長さ・全hashを照合済み。9参照arrayは未取得であり、
新formal bridge実取引は保持環境で実行する。
partial base fileの欠けた範囲を推測しない。全4原本・fullmodelの取得は入口条件にしない。
request/revision/resource generation・native local tuple・実取引・共同snapshotを照合する。
output16 packageはselected-weight N-ARTIFACTと別scopeで保存する。
wrongExpectedを使う負例は現正式入口のpredeclared reference rejectionとして扱い、旧試験のerrorを捏造しない。

### 4. 共同実行・受領確認

rootが既存Page/PRのowner原本・コメントを確認し、実資材保持者へ固定管理sourceと具体command・
返却条件を渡す。sourceをpushする前の曖昧な実行依頼は行わない。
受領側のactual fixed SHA/source bytes取得確認を記録し、その後実行返却を照合する。
owner実資材が本環境にないことと、契約互換性・保持環境での実行可否を分ける。
初期探索はVAE3assets/LoRAbounded+refsの所在と既存受入条件の確認に限定し、全model再取得しない。

## 検証と完了の条件

各担当は必要な負例を先にRED確認し、最小変更でGREENにする。既存queue/package/cache/owner演算を再利用。
変更sourceを凍結後、影響する旧LoRA/N2/Rect回帰を実行。新private数値試験件数とmetadata検査件数を分ける。
P2の一trace通常実NN＋取消解放、P3の真正File/base新bridge取引、受領確認が揃うまで完了扱いにしない。
固定記録・runnerを先行配布した場合は実受入待ちを明示し、時間経過や自分のGitHub読戻しをowner取得確認にしない。
