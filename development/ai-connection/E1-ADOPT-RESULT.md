# LoRA最新版の採用と管理File経路の検証

2026-10-31 JST。ユーザーの追加指示に従い、製品入力はローカル選択の`.safetensors` Fileとする。
既存4原本すべての取得・再試験、全baseの再取得を完了条件にしない。Drive 3件は開発用参照であり、
製品runtimeへDrive/URL取得を追加しない。

## 最新版と既存20ケースの受領

LoRA配布 `0c27874908638afc748ea2455a2779a16736730b` をGitHubから実取得し、
SDK・owner adapter・修正kernel・必要生成物・機械可読契約・実PARTIAL証拠を照合した。
実績組合せのDiffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384` を採用する。
最新版Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` は別候補として差分を記録し、
診断閉包15ファイルが同byteでも、この採用版のcommitを暗黙に差し替えない。
[source台帳](E1-ADOPT-SOURCE-BASELINE.md) と [595件receipt](E1-ADOPT-SOURCE-RECEIPT.json)。

LoRAのnative APIは`lora-connection/2.0-draft.1`を維持しているが、Hikeには大行列時の
stack累積修正がある。採用WASMは5051 bytes、SHA-256
`3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。
旧4919-byte版のABI/版一致だけで同じ数値実装と認定しない。

`verify-owner-e1.mjs`で20成功caseの公開証拠を独立に照合した。
[機械可読結果](evidence/owner-e1-verification.json) は、公開28ファイル、実行source56記録と
計72 Git objects、全20caseの320 actual/expected出力、plan/package/両registry hash、
原本hash・shape/slice・PARTIAL・copy ownership・38 lifecycle終端を検査する。
追加224 lifecycle出力も再比較した。20caseの最大出力誤差は両side
`7.450580596923828e-9`で固定gate内。

weight1,638,400値については、公開JSONの比較件数・事前gate・failed=0とhashの整合を確認した。
private ZIP内の全weight/bias配列は今回未再取得であり、全配列を新しく再計算したとは扱わない。
旧担当による実base×実LoRAの成功、今回の公開証拠照合、新しい管理制御試験を別scopeで記録する。

## 管理への採用

`adapters/adopted-lora.mjs`の`works-adopted-lora/0.1-draft.1`は、LoRA ownerの
`createDiffusionDiagnosticAdapter`（`lora-diffusion-diagnostic-adapter/0.1`）を明示注入する。
元full shape/slice offset、detail bias pass-through、native/connection registry、consumer
transactionの実装をowner側へ委譲し、旧管理bridgeを重ねて使わない。

source/kernelと対象commit、要求ID、manager revision、SDK local revision、resource owner /
generation、opaque handle、native copy ownerを保持する。stage終端後の同じenvelopeだけを
finalizeでき、遅い成功・rollback失敗は未完了資源を保持して明示recoverする。
旧bridgeは旧pinの回帰用として維持し、新経路の成功証拠へ混ぜない。

`diagnostic-package.mjs`は既存E4を再利用し、実出力bytes/hash/feed package/epoch、入力Fileの
hash・name・size、native receipt、manager/local revision、所有権、base証拠を束ねる。
原本Fileの埋込み・runtime handleのJSON化は行わず、再選択必須と記録する。
保存成功・PARTIAL・CONSUMER_APPLIEDからE5受入や生成受付を解除しない。

## 追加参照と適合判断

[登録台帳](REFERENCE-INPUTS.json) と [分類根拠](REFERENCE-INPUTS.md) に、Driveの3ZIP、
全ファイルhash、内部tensor型・loader variant・rank・target shape・base/graphの確認状態を残した。
ZIP/CRC/パス検査を通し、workflow/コードは実行していない。直接添付版は別referenceとして保持し、
同名だけでDrive版とのbytes同一性を認定しない。

| 参照 | 現行5120幅Bernini Linear診断への判断 | 根拠 |
| --- | --- | --- |
| Wan Depth | INCOMPATIBLE / native handler未対応 | 1536幅240 Linear＋5D patch embedding、I64 reshape marker。平坦化・無視しない |
| Wan Tile | INCOMPATIBLE / native handler未対応 | 同上。実LoRA v1.1とworkflow v1.0参照の不一致、未同梱cfgdistillも保持 |
| LTX depth（2namespace） | INCOMPATIBLE / 別family target | 4096/16384幅、LTX transformer_blocks namespace。Wan名への付替えをしない |
| 各参照の学習base/graph identity | UNVERIFIED | metadata/workflow filenameだけでは実base/graph hashを確定できない |

## 管理経路の検証状態

codeのNode回帰は209/209、skip0。最新版owner adapterを実SDK/Hike rank128とnative consumerへ
注入したfixture、source/target/遅延復帰、G1C native codec＋実ファイルpackage読戻しを含む。
これは管理browserのローカルFile試験前のsource checkpointであり、実行結果は次のcommitへ追記する。

`run-managed-local-files.mjs`はpositive File 1件と選択したnegative Fileだけを要求し、
全4原本/baseは要求しない。全HTTP source/WASMを固定Git blobへ照合するため、
実行用codeをcandidate commitへ固定してからブラウザへ渡す。検証用baseは明示した
`synthetic-manager-control-fixture`、実runtimeはORT WASM/Hike。実base再試験やE5全sessionではない。

## 残る検証

- 管理browser File登録→source→owner adapter→実ORT/Hike、File差替え・拒否・保存・取消の
  実行結果はsource checkpoint後に記録する。
- 既存20実共同証拠で管理自身の全制御経路が試験済みとは扱わない。
- 全target、元model全session、複数native資源のE5 snapshot共同受入、生成admissionは未完。
  原本4件の全取得をこれらの前提へ戻さない。

管理branch `codex/ai-connection-e0-e4`、Draft PR #7へcode/API/receipt/再現手順を共有する。
実行candidate commitと最終配布commitは区別し、最終PR本文に完全SHAと固定API URLを記録する。
