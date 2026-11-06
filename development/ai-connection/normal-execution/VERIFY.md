# 変更境界の検証再現

通常の実native再現は [REPRODUCE.md](REPRODUCE.md) を使う。以下のunit／boundary試験は、owner doubleと既存の実coreを組み合わせ、数値処理を管理へ複製しないこと、宣言／状態／所有権と取消を確認する。

```bash
node --test --test-isolation=none \
  tools/ai-connection/test-workflow-shapes.mjs \
  tools/ai-connection/test-workflow-normal-requests.mjs \
  tools/ai-connection/test-snapshot-normal.mjs \
  tools/ai-connection/test-normal-operation.mjs \
  tools/ai-connection/test-normal-diffusion-owner.mjs \
  tools/ai-connection/test-run-normal-operation.mjs
git diff --check
```

全AI接続回帰を今回実行したworkspaceの資材配置で再現するコマンドを示す。別環境では各pathを同じ固定native版の取得先へ置き換える。これらは旧診断試験のfixtureであり、通常データの利用者へ要求する入力ではない。

```bash
WORKS_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/2c171a0 \
WORKS_NATIVE_CODEC_PATH=/workspace/work/ai-connection/resume/native/2c171a0/docs/shared/inference/tensor.mjs \
WORKS_LORA_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/dcb1f50 \
WORKS_DIFFUSION_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/438972f \
WORKS_VAE_PROFILE_ROOT=/workspace/work/ai-connection/resume/native/7e09119 \
WORKS_ADOPTED_LORA_ROOT=/workspace/work/ai-connection/e1-adopt/native/0c27874 \
WORKS_ADOPTED_DIFFUSION_ROOT=/workspace/work/ai-connection/resume/native/438972f \
WORKS_RECT_DIFFUSION_ROOT=/workspace/work/ai-connection/e1-adopt/native/5f880fd \
WORKS_RECT_VAE_ROOT=/workspace/work/ai-connection/profile-adopt/native/855f435 \
WORKS_SNAPSHOT_LORA_ROOT=/workspace/work/ai-connection/profile-adopt/native/fc2789a \
WORKS_SNAPSHOT_DIFFUSION_ROOT=/workspace/work/ai-connection/e1-adopt/native/5f880fd \
WORKS_NORM_RECT_NATIVE_ROOT=/workspace/work/ai-connection/profile-adopt/native/855f435 \
WORKS_NORM_RECT_INPUT=/workspace/work/ai-connection/vae-dispatch-discovery/restored.wktensor \
WORKS_LORA_ADMISSION_ROOT=/workspace/work/ai-connection/owner-data-r6/82cd9bb \
WORKS_N2_TAIL_NATIVE_ROOT=/workspace/work/ai-connection/n2-tail-r7/native/a49aac4 \
P4_NATIVE_SOURCE_ROOT=/workspace/work/ai-connection/p4-r11/native-source \
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

最終回帰は576/576 PASS、FAIL／SKIP 0。[全出力](verification/ROOT-SUITE.log)と[実行中162fileのbytes不変記録](verification/SUITE-SOURCE-RECEIPT.json)を保持した。実native normal／取消の達成範囲はこのunit合格から推定せず、別の実行receiptで確認する。

## VAE／P4／独立診断の追加後

上記旧native変数に、以下を追加して同じ `test-*.mjs` 全体を実行する。rootは固定498のproduction16、固定30eのBUILD_SOURCES113＋generated build-infoを各repo相対pathで保持する。

```bash
export NORMAL_VAE_NATIVE_ROOT=/workspace/work/ai-connection/normal-r13/runner/native-vae-498
export NORMAL_P4_NATIVE_SOURCE_ROOT=/workspace/work/ai-connection/normal-r13/runner/native-p4-30e
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

最終634/634 PASS、FAIL／SKIP 0、173file bytes不変。[追加後の全出力](verification/FINAL-ROOT-SUITE.log)と[source照合](verification/FINAL-SUITE-SOURCE-RECEIPT.json)を保持する。新実NN共同受入の未取得と、unit／実metadata queryの合格を分ける。
