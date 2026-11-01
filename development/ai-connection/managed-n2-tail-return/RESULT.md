# 固定管理sourceによるN2自己注意残差の保持環境実行

実行日: 2026-11-01 UTC。管理が固定したrunnerをDiffusionの実資材保持環境で実行し、終了コード0、`status:PASS`、`nativeCalls:2`、`actualNumericalAccepted:true`を得た。HIGH1とLOW3を別realmで実行し、それぞれ元ownerの8比較・71,680値・7 strict parameter checksで失敗0となった。5出力のE4保存・実disk読戻しも両sideで成立した。

これは固定N2・block0のO projection → chunk2 gate → 元`patchHidden`への残差という限定診断の実行返却である。管理の正式なStep3受入は、以下の元resultとmetadata上の確認事項を管理側が照合した後に判断する。`generationReady:false`、`load/predict/sample=NOT_READY`を維持する。

## 固定sourceと配布

| 役割 | 完全commit / 識別 |
| --- | --- |
| 管理基点 | `03e18b6116c3d778197e4d34ba0364a7dbe918f6` |
| 実行した管理source | `5c484a8783ab129a2ff3543a98b2537af9888199` |
| 管理引渡し文書 | `055903abd667535e189ef50eb7dd70a0229a7efe` |
| Diffusion checkout・従前配布 | `beffdcb800b629d0b13ff43bbc90e9f74c659152` |
| Diffusion実行source | `a49aac492cc68e2dd6037e0deb4a6954731a847a` |
| Profile | `bernini-block0-n2-self-attention-residual-f32-v1` |
| native API | `diffusion-models/0.1` |
| build | `diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74` |

取得先:

- [管理HANDOFF](https://github.com/Kushyameln01/kushyameln-works/blob/055903abd667535e189ef50eb7dd70a0229a7efe/development/ai-connection/n2-tail-management/HANDOFF.json)
- [実行runner](https://github.com/Kushyameln01/kushyameln-works/blob/5c484a8783ab129a2ff3543a98b2537af9888199/tools/ai-connection/run-norm-required-n2-tail.mjs)
- [管理browser source](https://github.com/Kushyameln01/kushyameln-works/blob/5c484a8783ab129a2ff3543a98b2537af9888199/tools/ai-connection/norm-required-n2-tail-browser.mjs)
- [実Diffusion stage](https://github.com/Kushyameln01/kushyameln-works/blob/a49aac492cc68e2dd6037e0deb4a6954731a847a/docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs)
- [従前配布API](https://github.com/Kushyameln01/kushyameln-works/blob/beffdcb800b629d0b13ff43bbc90e9f74c659152/docs/shared/diffusion-models/API.md)

管理sourceは専用detached worktreeで固定し、実行前後のHEADと`git status --short`が同一・cleanであることを記録した。Diffusion checkoutも実行前後は同じHEAD・cleanだった。今回の配布差分は返却証拠と説明だけで、実行source、API、catalog、正式82b DATA bridgeのpinを変更していない。

管理19・native24・build100・公開receipt15の計158照合レコードについて、各record直下のSHA256・長さを現在の実ファイルと固定Git bytesの双方へ照合した。これは重複を含むレコード数であり、158個の相異なるファイルという意味ではない。採用codecの配置bytesも固定管理Git bytesと照合した。codecの元commit `2bdca59ea78580d4fe7a9d31a8de33209b64d029` のGit object自体は今回独立取得していない。

## 返却する元ファイル

次の3ファイルはrunner出力からbyte-for-byteでコピーし、再serialize・redact・補正をしていない。

| ファイル | bytes | SHA256 |
| --- | ---: | --- |
| [result.json](result.json) | 3,007,028 | `2d1e4a2205764a251af1357152c37d1fb11153d98bf5ba426d4257f3c0c4c859` |
| [HIGH manifest](manifests/HIGH/manifest.json) | 8,720 | `d87c1a36270d40a57c218a1bc2eaf2bc6fac5f6ad01e66dc304a76a180bbeaa7` |
| [LOW manifest](manifests/LOW/manifest.json) | 8,709 | `346a6c580f56ff91a25e504b25bc21fb0ecdb147f95237bdb561d7a7fea4fa75` |

[handoff.json](handoff.json)に返却全ファイルのpath・hash・長さを収録した。index自身の自己hashは含まない。[execution-context.json](execution-context.json)は実行command、Node版、実行前後のHEAD/status、終了コード、元resultのhashを記録する。[verification.json](verification.json)と[readback-audit.json](readback-audit.json)は実行後の追加監査であり、元resultを置換しない。

非公開のモデル・activation・独立reference・保存済みoutput・E4 packageのpayload/evidence sidecarは保持環境内に残し、Gitへ追加していない。manifestはそのファイル配置とhashを示す。返却した公開ファイルは他担当がGitHubから取得でき、提供環境の絶対pathだけを取得先としていない。管理環境への非公開資材の複製や、その環境での数値再実行は本返却の実績に含まない。

## 新規検証結果

| 条件 | HIGH / schedule1 | LOW / schedule3 |
| --- | --- | --- |
| block / token数 | block0 / N2 | block0 / N2 |
| 元ownerの全値比較 | 8比較 / 71,680値 / 失敗0 | 8比較 / 71,680値 / 失敗0 |
| strict parameter checks | 7 / PASS | 7 / PASS |
| 数値判定 | `actualNumericalAccepted:true` | `actualNumericalAccepted:true` |
| 管理規範付き経路 | `normExecution.phase:published` | `normExecution.phase:published` |
| E4保存・実disk読戻し | 5出力 / complete | 5出力 / complete |
| 実行後の追加読戻し | 32 disk reads / issuesなし | 32 disk reads / issuesなし |
| 元Promise・queue | completed / fulfilled | completed / fulfilled |
| 解放・再利用可能 | `resourceReleased:true / reusable:true` | `resourceReleased:true / reusable:true` |
| native tail elapsed | 約8,248ms | 約8,332ms |

各realmで管理adapterから同じrealmのnative ownerを呼び、Diffusion担当の固定gate・独立参照・比較関数をそのまま使った。低rank積や数値判定を管理側へ再実装していない。返却outputは`o [2,5120]`、`gateProjection [5120]`、`gate [5120]`、`gated [2,5120]`、`residual [2,5120]`のF32である。元`patchHidden`を残差元にする演算順を保持する。

保存後に、固定管理reader `readN2TailOutputPackage`を使ってmanifest・receipt・各side30ファイルをもう一度実diskから読んだ。10出力すべてのF32 hash・shape・layout・meaningが実行resultと一致し、復元descriptorの`ownership.mode`は`copy`だった。HIGH residualは`72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9`、LOW residualは`0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6`。

今回の成功経路では取消・recoverは発生していない。`stopAcknowledged:false`は自然完了の記録で、取消試験に合格したという意味ではない。元Promise終端後にactive invocationとqueueが空、quarantineなしであることは確認した。`snapshotPublished:false`であり、全工程snapshot保存の新規受入も行っていない。

## 既存証拠の再利用範囲

- 同じ実モデルのfull-file識別receiptを再利用し、実ファイル長とbounded headerを確認した。約31GBのmodel pairの全量hash・再downloadは行っていない。
- 実Rect meanと明示noiseに由来する保存済み自然N2 prefix、実attention、固定独立local/composed referenceを再利用した。prefix・QKV・attentionの数値計算自体は今回再実行していない。
- 10個のprivate JSONの全bytes/hash、およびprefix・attention・保存済みtail出力に定義されたF32 hashを事前照合した。参照JSONはfile hashで固定され、個別のexpected F32 hashをpreflightで再計算していない。保存済みtail出力のhash受領は`HASH_VERIFIED`として分け、今回の新規tail数値比較の代わりにしていない。
- 元Hike/ORT実装、既存gate、source/build/hash、正式82b DATA bridgeの受入scopeを維持した。

## 容量・copyと測定の限界

事前予算は[diagnostic-budget.json](diagnostic-budget.json)のtail専用値である。Hike容量2,883,584B、ORT shared Memory宣言容量16,777,216B、返却5配列163,840B、tail実行期限120,000msを指定した。

native counterには、入力snapshot102,400B、raw weight tile最大163,840B、decoded weight tile最大327,680B、tileとdecode copies最大655,360B、1 sideあたりselected weight read78,673,920B/643回、linear入力snapshot累積229,376,000Bなどが残る。詳細は元resultとverificationの`nativeCapacityAndTrafficCounters`を参照する。累積trafficは同時live量ではない。

今回の管理runnerには独立Memory observerがない。`observedORTMemoryBytes`、`nativeORTMemoryBytes`、`totalPeakBytes`を`null`のまま返した。16MiBは宣言容量であり、今回観測したMemory値ではない。ブラウザ・caller・reference・allocator・GCや旧工程との同時liveを含む全体peakは受入していない。

## 固定runnerのmetadata確認事項

1. **公開receipt15件のnested hash**: 固定runnerは`N2_TAIL_SOURCE`を展開して`path`だけを上書きするため、`publicReceiptProof[*].sourceRef.sha256`全15件にstage.mjsのhashが残る。各receiptの実bytes照合にはrecord直下の`sha256`・`byteLength`を使った。nested hashを各receipt自身のhashとして扱うことはできない。このmetadata不整合は正式管理照合時の確認事項として返却し、元resultを修正していない。
2. **attention metadataの公開投影**: 固定runnerの`publicN2TailReceipt`はkey名が`attention`の値を省略するため、`trustedInputs.attention`のhash metadataも公開resultから省略される。固定sourceのpin、attentionArtifact受領hash、実入力F32 hashを照合して対応を確認した。[attention-binding-supplement.json](attention-binding-supplement.json)は既存の固定公開export receiptからのhash metadata補足であり、未取得private内容の復元やresultの補正ではない。

## 再現・管理側への引渡し

取得と再現の正本は[固定管理REPRODUCE](https://github.com/Kushyameln01/kushyameln-works/blob/5c484a8783ab129a2ff3543a98b2537af9888199/development/ai-connection/n2-tail-management/REPRODUCE.md)。保持環境の既存資材を使い、新規の非公開出力先を指定する。Node `v24.19.0`、既存Playwright 1.57、Chromium `154.0.8037.57`を利用した。今回実行したcommandは次のとおり。

```sh
cd /workspace/work/manager-n2-tail-5c484a8
node tools/ai-connection/run-norm-required-n2-tail.mjs \
  --native-root /workspace/work/diffusion-models \
  --assets /workspace/work/managed-n2-execution-8xrdkeqy/assets.json \
  --diagnostic-budget /workspace/work/managed-n2-execution-8xrdkeqy/diagnostic-budget.json \
  --out /workspace/work/managed-n2-execution-8xrdkeqy/run
```

再実行時は`--out`を別の未使用pathにする。private資材の役割別pathと固定hashは管理runnerとその再現文書に従う。公開packetの完全性は次のように確認できる。

```sh
python3 - <<'PY'
import hashlib, json, pathlib
root = pathlib.Path('development/ai-connection/managed-n2-tail-return')
for item in json.loads((root / 'handoff.json').read_text())['files']:
    data = (root / item['path']).read_bytes()
    assert len(data) == item['byteLength'], item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
print('Return packet hashes PASS')
PY
```

管理担当には元result・manifest・context・hash index・上記確認事項を渡し、固定Git bytes、catalog、trusted input、gate、reference、保存境界、終端・解放を正式Step3で照合してもらう。LoRA/VAEへ新たに拡張した受入範囲はない。HIGH1/LOW3は個別の限定受入であり、実HIGH→LOW受渡しではない。cross-attention、FFN、全block/timestep、本番81frame/context、production/fused precision、生成・VAE decode、任意LoRA、全体資源予算は未受入。`load/predict/sample=NOT_READY`を維持する。
