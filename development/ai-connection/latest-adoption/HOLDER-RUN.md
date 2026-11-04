# 保持環境での固定管理source実行・返却条件

資材の存在はDiffusion／Text/VAE保持資料で確認済み。本書はモデルの再送・再取得を要求しない。未接続なのはこのチャットから保持側を実行するterminal／endpoint／セッションへの経路であり、資材自体の不存在ではない。

管理実行sourceは`f084790d7f594915c869ef375fcbdc6e44ee56f3`。配布文書commitやDiffusion owner SHAを代入しない。保持側の取得ACKと、実行receiptはそれぞれ未受領である。

## source取得と独立checkout

```bash
MANAGER_SHA=f084790d7f594915c869ef375fcbdc6e44ee56f3
git fetch origin codex/management-full-route
git fetch origin b6e166478a8e072c9ffd3ce562bfdb0c89634920
git fetch origin 20f640a6e071b6c060a212e89b28f0c8965923f7
git worktree add --detach /workspace/work/ai-connection/manager-r18-holding "$MANAGER_SHA"
```

実行中owner checkoutは切り替えない。source取得ACKはNN再実行なしで返せる。取得path／bytes／SHA-256を、固定manager Git object、採用native153source／164files、Text/VAE32files、SOURCE／buildへ照合する。管理・owner・保存入力のSHAを混同しない。

## Diffusion保持環境

確認資料にある資材：

- `/workspace/work/retained/bernini/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`、15,574,833,216B。
- `/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors`、15,574,833,216B。
- `/tmp/d1-d4-real-l512-n5-inputs/inputs.json`、43,223B、SHA-256 `11d345729b9132dd600b3fa73b61fd5e686b3f5a0ed7b72ef12e3a83791307e9`。

既存のraw入力、noise、real L512 payload／maskをそのまま再利用する。conditioningを最新Text結果へ差し替えた別caseと、元N5保存入力のcaseを混ぜない。モデル全hashを取得ACKのために再計算しない。

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit "$MANAGER_SHA" \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --wasm-threads 1 --coi false --check-only
```

check-onlyはsource・保存入力・statの確認だけで、browser／NNを起動しない。資材保持環境の原寸runが進行中なら、同じ16GiBで並列NNを起動せず、終端・資源解放後に順番に実行する。再利用資源やtmpfsを総RAM合格へ足し替えない。

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit "$MANAGER_SHA" \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --mode sample --cancel-before-run \
  --wasm-threads 1 --coi false \
  --private-output /tmp/manager-r18-private/UNUSED-values \
  --output /tmp/manager-r18-UNUSED-result.json
```

private parentは0700、output名は未使用にする。runnerはactual operational controller→管理adapter→b6 factory→専用Worker→model ownerを呼ぶ。root target／revisionとpublic API target／revisionは別に記録する。実patch取消、元Promise終端、物理Worker close、reload、旧model拒否、sample6更新、raw sample／latentContract、controller保存とnative File再読、unload／disposeを確認する。

`--base-weight-probe`を明示追加した場合だけ、専用feedでimmutable cross-Qの1row／5,120 F32を読み、feedを閉じてからNNへ進む。receiptはidentity／hash／状態のみでraw重みを公開しない。これはbase-only port境界の確認で、新しい試験LoRAの送付・登録・低rank演算・全体実験ではない。通常例はflagなしである。

4-threadは別caseで`--wasm-threads 4 --coi true`を明示し、実COI／SABを確認する。1-thread/no-COIの実行結果へ4-threadの既存成功・時間・資源を転用しない。

## Text/VAE保持環境と通常P4

保持側の選択Text bundleは`/workspace/work/inference/management-20261104/text-source-ordered-bundle`、元Text modelは`/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`。Rect bundleは`/workspace/work/inference/e6-rect/accepted-bundle`、復旧stream bundleは`/workspace/work/inference/management-20261104/vae-stream-recovered`。元管理e166 bridgeの実Text／Rect結果は既存scopeで再利用する。

今回sourceの実UIは`docs/ai-connection/modules/index.html`。Textは既定の採用版manifest（source-ordered-fp32、696,123B／420ebccc…）を選び、資材フォルダと元モデルFileを設定する。実plain／ID encode、graphBindings、mask／model／Tokenizer／normalization、取消／再設定／終了、native保存／workspaceを今回sourceのtraceとして返す。参照配列・gate・数値receiptは通常入口へ入れない。

VAEは公式Rect manifestと既存bundleを選び、既存のraw／RGB入力を使う。実decode・取消・再実行・保存／fresh読戻しを変更境界に絞る。元encode証拠を再利用した場合はそのsourceとdata identityを明記する。生成sample契約fixtureと実Diffusion producerのsampleを区別し、fixture decodeを実生成の最終decodeと呼ばない。

通常P4は専用File／sideとcanonical markerのconditioningを設定する。全モデルとは別pin／entryであり、P4のquery／実dispatch／取消・解放を別scopeで返す。UIの16MiB allowanceはlogical inputだけでモデルRAMではない。旧30eの拒否caseは回帰専用。

旧Text owner harnessは管理e166を固定している。そのまま実行した結果を新sourceへ付け替えない。今回sourceのUI／controllerまたはその実factoryを通る新harnessで実行したことをserved path／bytes／hashで証明する。再取得ACKのためのNN・再export・大参照の再生成は不要。

## 返却receipt

1. 配布SHA／実行manager SHA／Text20f／全モデルb6／独立P4 pinとbuild／schema、取得path・bytes・SHA-256。未取得は別欄。
2. 実環境、COI/SAB/threads、入力manifestとpayload/mask/shape/metadata identity。実Fileのstat継続と全hash再計算を区別。
3. root request/revision/resource generation、native API session/job/inputRevision、modelSession/epoch、feed side／generation。
4. actual progress、対象取消、元Promise終端、物理Worker close、reloadと旧権限拒否。
5. native tensor／raw意味／decoder・producer群／normalization／frameProcessing、snapshot／trace、実保存Fileの全hashとfresh読戻しbit一致。
6. port／package lease／kernelの終端、失敗解放IDの保持・再試行、最終資源と未測定指標。
7. 再利用した数値証拠と今回新規実行・比較を分離。旧owner comparatorが別receipt schemaを拒否する場合は、無断でgateやadmissionを緩めずschema-aware受入を別に扱う。

固定source取得ACK、部分接続の実NN受入、全体運用受入は別の判定で返す。試験LoRA受領・LoRAを使う全体実験は指定順序どおり後段とし、本handoffから前倒ししない。
