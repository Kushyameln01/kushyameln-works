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

**実Chromiumの管理File経路はPASS**。
実行sourceは `a8771513320117a8d20310af84480978665c6252`、Chromiumは
`154.0.8037.57`、実ORT WASM `1.24.3`とHikeを使用した。
最終配布commitはこの実行sourceへ文書・証拠とCLIの末尾空白修正だけを追記し、PR本文に記録する。
検証したsourceを後のworking tree版へ付け替えない。

[管理経路の独立readback結果](evidence/managed-local-file-verification.json) に、49 source records／
45 HTTP sourceのGit bytes、実選択5 Filesの全体SHA・前後stat、5 caseの全比較と8保存ファイルを記録した。
positiveはローカル選択した既存light HIGHの実File 1件、negativeはDrive 3件から得た実safetensors
4件。他3原本や全baseを入力条件にしていない。

| 検証 | 結果 |
| --- | --- |
| ローカルFile登録→native source→新SDK/owner adapter | 全体hash／元bindingを保持。登録`applied:false`と診断`CONSUMER_APPLIED`を区別 |
| 強度0/1/-1・再適用・取消復帰の5 case | weight409,600・bias80・出力80を保存bytesから独立に再比較し全件PASS |
| 最大絶対誤差 | weight `2.8759927772625815e-8`、bias `0`、出力 `5.960464477539063e-8`。事前gate不変 |
| 実native feed／block | 保存weight/bias bytesからpackage hash・全block hashを再計算しnative receiptへ一致 |
| 保存 | 実filesystemの8ファイル、7 JSONのJCS、実G1C codecで16出力と入力／適用／base／trace／拡張を照合。snapshotはnull |
| 保存破損・欠落 | `ASSET_HASH_MISMATCH`／`REQUIRED_ASSET_MISSING`で拒否 |
| 取消 | 実Hikeの1 block後に`CANCELLED`。manager cohort4の旧feedを明示観測し、失敗selection5を公開せず、次のapplyで復帰 |
| 所有権 | prepared／candidate履歴の解放とsource登録解除後もactive consumerの独立copyで実行。旧sourceは`SOURCE_BINDING_UNAVAILABLE` |
| 追加資料 | 4実Fileすべてがnative `UNSUPPORTED_LORA`。通信エラー等を未対応の成功へ数えない |
| URLを製品Fileに渡した場合 | `INVALID_LORA_BINDING: Expected a local File or Blob`。Drive URLをruntime inputにしない |
| 終了 | in-flight終端後にSDK、consumer、ORT session、File module、browser／serverを終了。process peak改善は未測定 |

codeのNode回帰も **209/209、skip0**。
[実行log](evidence/e1-adopt-tests.log) は最新版owner adapterの実SDK/Hike rank128＋native consumer
fixture、source/target/遅延復帰、G1C codec＋実ファイルpackageを含む。実File browser試験、
owner20ケースの既存証拠、合成unit fixtureは、それぞれのscopeで保持する。

`run-managed-local-files.mjs`はpositive File 1件と選択したnegative Fileだけを要求し、
全4原本/baseは要求しない。全HTTP source/WASMを固定Git blobへ照合するため、
実行用codeをcandidate commitへ固定してからブラウザへ渡す。検証用baseは明示した
`synthetic-manager-control-fixture`、実runtimeはORT WASM/Hike。実base再試験やE5全sessionではない。

## 再現手順

Node24.19／Python3.12＋NumPy2.3.5／PlaywrightとChromiumを使用する。
management clone内へ各固定commitのGit objectsを取得し、native sourceは別directoryへ展開する。
Diffusion tree内の旧LoRA kernelや、LoRA tree内の旧Diffusionを混ぜない。

```sh
git fetch origin feat/lora-hike codex/diffusion-e0-e7 codex/g1c-vae-v1
mkdir -p work/lora0c work/diffusion438 work/codec2c
git archive 0c27874908638afc748ea2455a2779a16736730b | tar -x -C work/lora0c
git archive 438972f30242e0a3bc66edb8591f38eaa0fcd384 | tar -x -C work/diffusion438
git archive 2c171a09ccda65c54899f322ae490f1bfcaac6fb | tar -x -C work/codec2c
node tools/ai-connection/verify-owner-e1.mjs --lora-root work/lora0c --repo .
node tools/ai-connection/run-managed-local-files.mjs \
  --lora-root work/lora0c --lora-commit 0c27874908638afc748ea2455a2779a16736730b \
  --diffusion-root work/diffusion438 --diffusion-commit 438972f30242e0a3bc66edb8591f38eaa0fcd384 \
  --codec-root work/codec2c --codec-commit 2c171a09ccda65c54899f322ae490f1bfcaac6fb \
  --inputs /private/local-file-inputs.json --out /private/new-control-evidence
```

入力JSONの例。pathは利用者が選択するローカルFile、expectedSha256はそのFileの検証値であり、
製品へ特定4ファイルの組を要求するものではない。negativesは選択した資料だけを列挙する。

```json
{
  "fixtureScope": "synthetic-manager-control-fixture",
  "positive": {
    "path": "/local/selected.safetensors",
    "selection": {"pairId": "light", "noise": "high"},
    "expectedSha256": "9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945"
  },
  "negatives": [{"path": "/local/reference.safetensors", "sourceNo": 1, "expectedClassification": "UNSUPPORTED"}]
}
```

CLIは実行HEADのsource/Git blob一致を要求する。実行sourceを変えた再試験は新しい実行版として
記録する。出力先はGitの外の新規private directory。重みや生の比較配列をGitへ収録しない。
Node回帰は旧pinの回帰に既存envを、今回の採用testに
`WORKS_ADOPTED_LORA_ROOT=work/lora0c`、`WORKS_ADOPTED_DIFFUSION_ROOT=work/diffusion438`、
実codecに`WORKS_NATIVE_CODEC_PATH=work/codec2c/docs/shared/inference/tensor.mjs`を指定し、
`node --test --test-isolation=none tools/ai-connection/test-*.mjs`で実行する。

209件をskipなしで再現する場合、追加でLoRA旧pin
`dcb1f504263955ef2a4b1613b7a9d802aebd1c18`を`work/legacy-lora`、VAE公開profile
`7e091192232fae36367b550ca5fada88915a0703`を`work/vae7e`へ同様に展開する。
これらは旧sourceの回帰用であり、原本payloadの要求ではない。

```sh
WORKS_NATIVE_ROOT="$PWD/work/codec2c" \
WORKS_NATIVE_CODEC_PATH="$PWD/work/codec2c/docs/shared/inference/tensor.mjs" \
WORKS_LORA_NATIVE_ROOT="$PWD/work/legacy-lora" \
WORKS_DIFFUSION_NATIVE_ROOT="$PWD/work/diffusion438" \
WORKS_VAE_PROFILE_ROOT="$PWD/work/vae7e" \
WORKS_ADOPTED_LORA_ROOT="$PWD/work/lora0c" \
WORKS_ADOPTED_DIFFUSION_ROOT="$PWD/work/diffusion438" \
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

## 残る検証と各ownerへの確認

- 管理browserで上記制御境界は検証した。既存20ケースの全raw配列は今回未再取得であり、
  新しい管理実base共同試験も未実施。いずれも改訂後の完了gateへ戻さない。
- LoRA/Diffusion owner: 採用factory／修正kernel／full-slice mappingとnative receipt namespaceを
  この固定版で維持する。新しいDiffusion版への採用は別版で照合する。
- 追加参照のowner: Wan 5D Conv/I64 reshape、LTX namespace／loader規約、実base/graph hashが
  揃うまでは現profileに適合としない。未知tensorの除外や名前だけのbase同定で通過させない。
- 全target、元model全session、複数native資源のE5 snapshot共同受入、生成admissionは未完。
  原本4件の全取得をこれらの前提へ戻さない。

管理branch `codex/ai-connection-e0-e4`、Draft PR #7へcode/API/receipt/再現手順を共有する。
実行candidate commitと最終配布commitは区別し、最終PR本文に完全SHAと固定API URLを記録する。
