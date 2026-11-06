# LoRA v2 / E1 の取得と再現手順

作業branchは `feat/lora-hike`、Draft PRは <https://github.com/Kushyameln01/kushyameln-works/pull/2>。native契約は `lora-connection/2.0-draft.1`、外部adapterは `lora-diffusion-diagnostic-adapter/0.1`。モデル原本・選択重み配列はGitHubへ収録しない。

## 固定sourceを取得する

```sh
git clone --branch feat/lora-hike https://github.com/Kushyameln01/kushyameln-works.git
cd kushyameln-works
git switch --detach e1f03a4f6092c3154d5b47f166b77bbd32897ac9
git fetch origin codex/diffusion-e0-e7
git worktree add --detach ../diffusion-e1-peer 438972f30242e0a3bc66edb8591f38eaa0fcd384
```

`e1f03a4f6092c3154d5b47f166b77bbd32897ac9` は共同runnerと必要生成物を含む。実HIGH試験は `4d5fd7363f40f0d743ead448193ef2bf1915bbdc`。両者の製品SDK・adapter・kernel・独立数値参照は同一で、差分はrunnerの旧rollback試験を「古い候補をcommit済み」に強化し、candidateを現在のepochで順にprepareする箇所だけである。結果文書の最終commitと、実行source commitは別々に記録する。peerのpublic registry/provider/sink/consumerを注入し、製品へprivate実装を複製しない。

API正本は `docs/shared/inference/lora/CONNECTION_V2.md`、契約・台帳は `development/lora/contracts/`、E0照合と実PARTIAL結果は `development/ai-connection/`。

## fixtureと互換性を確認する

確認環境は Node `v24.19.0`、Python `3.12.14`、NumPy `2.3.5`。Nodeは組込みtest runnerを使う。

```sh
DIFFUSION_SOURCE_ROOT=../diffusion-e1-peer node --test tools/lora/test-*.mjs tools/ai-connection/test-diffusion-diagnostic-adapter.mjs tools/ai-connection/test-joint-comparison.mjs
python tools/ai-connection/test-lora-reference.py
node tools/lora/check-inventory-plan-v2.mjs
node tools/lora/test-panel.cjs
git diff --check
```

Nodeは97件（従来74＋大行列kernel回帰2＋native consumerを使うadapter契約19＋比較器2）、Pythonは3件、Chromiumパネルは12項目。fixtureのprovider/stageは合成値であり、次の実base共同試験の代わりにしない。inventory検証は保存済み台帳からのschema再構成であり、原本の再棚卸しではない。fixtureのlease試験と実consumerのindependent-copy試験も別である。

Playwrightの既定配置は `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumは `/usr/bin/chromium`。共同runnerでは `LORA_PLAYWRIGHT_MODULE` と `LORA_CHROMIUM_PATH` で変更できる。パネルscriptを別環境で実行する際は、そのscriptの実行依存配置を合わせる。確認時のChromiumは `154.0.8037.57`。全repositoryのgreenを宣言するcommandではない。

## 実原本を準備する

LoRAは利用者が持つ変更していない4原本を、次の配置に置く。`LORA_ORIGINALS` はその親directoryの絶対pathとする。

```text
light-safetensors/Bernini-R_LightX2V_high_noise.safetensors
light-safetensors/Bernini-R_LightX2V_low_noise.safetensors
detail-safetensors/NSFW-22-H-e8.safetensors
detail-safetensors/NSFW-22-L-e8.safetensors
```

全体SHA・bytes・header SHAは `development/lora/contracts/original-inventory.json`。既存台帳を再利用し、新規に捕捉したimmutable FileはSDKのsource capabilityが全体hashを検査する。同じFile内での強度切替ではその検証済みhashを再利用する。

baseは `Comfy-Org/Bernini-R` の固定commit `f7fd9812e54095d0c511d5e7429e6d8f6acc381a` にある。各15,574,833,216 bytes。

| side | 固定URL | 必須SHA-256 |
| --- | --- | --- |
| HIGH | [high_noise_fp8_scaled](https://huggingface.co/Comfy-Org/Bernini-R/resolve/f7fd9812e54095d0c511d5e7429e6d8f6acc381a/diffusion_models/wan2.2_bernini_r_high_noise_fp8_scaled.safetensors) | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` |
| LOW | [low_noise_fp8_scaled](https://huggingface.co/Comfy-Org/Bernini-R/resolve/f7fd9812e54095d0c511d5e7429e6d8f6acc381a/diffusion_models/wan2.2_bernini_r_low_noise_fp8_scaled.safetensors) | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |

HTTP成功・ファイル名・論理size・header一致だけでは全原本の証拠にしない。全byteを取得して上の全体SHAを確認する。実行時は容量制約からHIGHを検証後、task専用の取得cacheだけを除去してLOWを取得した。選択配列・receiptは保存し、利用者のLoRA原本は除去しない。

既に完全取得したbaseに対するreceiptを新しく作る場合は、次を使う。`BASE_FILE`、`SIDE`、`BASE_RECEIPT` を実際の絶対path／HIGHまたはLOWに設定してから実行する。この手順は全体をhashし、前後のstatが同一の原本へ証拠を結び付ける。sparse/zero代用品はhashが一致せず受理しない。

```sh
export BASE_FILE=/absolute/path/to/actual-base.safetensors
export SIDE=HIGH
export BASE_RECEIPT=/absolute/private/path/HIGH-receipt.json
python - <<'PY'
import hashlib,json,os,pathlib
p=pathlib.Path(os.environ['BASE_FILE']); side=os.environ['SIDE']
expected={'HIGH':'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52','LOW':'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'}[side]
def identity(s): return {k:str(getattr(s,'st_'+k)) for k in ('size','mtime_ns','ino','dev')}
before=p.stat(); h=hashlib.sha256()
with p.open('rb') as f:
    for block in iter(lambda:f.read(8*1024*1024),b''): h.update(block)
after=p.stat(); assert identity(before)==identity(after),'Original changed during hash'
assert after.st_size==15574833216 and h.hexdigest()==expected,'Wrong/incomplete original'
r={'schemaVersion':'e1-original-model-acquisition/1','role':side,'expectedBytes':after.st_size,'expectedSHA256':expected,'actualSHA256':h.hexdigest(),'fullFileVerified':True,'status':'COMPLETE_VERIFIED','fileStat':{'size':str(after.st_size),'mtimeNs':str(after.st_mtime_ns),'ino':str(after.st_ino),'dev':str(after.st_dev)}}
pathlib.Path(os.environ['BASE_RECEIPT']).write_text(json.dumps(r,indent=2)+'\n')
PY
```

## 実PARTIAL共同試験を実行する

```sh
node tools/ai-connection/test-lora-diffusion.mjs \
  --peer-root ../diffusion-e1-peer \
  --peer-commit 438972f30242e0a3bc66edb8591f38eaa0fcd384 \
  --side "$SIDE" \
  --base "$BASE_FILE" \
  --base-receipt "$BASE_RECEIPT" \
  --lora-root "$LORA_ORIGINALS" \
  --out /absolute/private/evidence/HIGH-or-LOW
```

同じcommandを該当LOW base/receiptで別の出力先へ実行する。runnerはGit HEADを記録し、HTTPで読み込む全source・WASMを完全commitのGit blobと照合する。peer commitのGit objectも同じrepository内に必要である。Git checkoutが変わった場合は新しい実行sourceとして記録し、旧結果へ混ぜない。

実際の原本Fileをブラウザへ渡す。モデル全体をHTTPへuploadせず、base providerが必要rangeだけを読む。独立Pythonはbase raw FP8＋scalar scale・F16 bias、LoRA BF16を復号し、NumPy binary64で期待値を計算する。固定loaderの規則を独立実装した比較であり、ComfyUI/PyTorch本体やGPU精度の同値試験ではない。

出力先には `result.json`、`reference/pre-execution-gates.json`、全16出力を持つ `reference/reference.json`、選択した全重み・biasの期待値と実値、plan scope、取得receiptが残る。gateは計算前に固定され、失敗に合わせて広げない。実Q `[5120,5120]` の先頭16行×全列だけを扱い、light bias16を含める。detail bias16は不変baseからpass-throughする。強度0/1/−1は明示診断集合[-1,1]で、製品の既定強度ではない。

成功状態は `PASS_DIAGNOSTIC_PARTIAL`。全target、実model全session、管理snapshot公開、生成寄与、二組同時合成は実行しない。取消はbounded Hike/ORT呼出し後の協調停止。leaseを提供しない実consumerにはlease対応を捏造せず、独立copyとprepared解放後の実行を検証する。

## WASMとパネル

必要生成物は `docs/shared/inference/lora/kernel/{lora.wasm,host.mjs,registry.mjs}` に収録済み。WASMは5,051 bytes、SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。旧4,919-byte版のループ内一時変数が大きな入力へ衝突する問題を、同一ABI・演算順で修正した。

Hike原文は `tools/lora/kernel/lora.hike`。再buildは固定Hike commit `3c51fde6675f317453919bd505d0e2d0f638e7f1` と記録されたGo/WABTを配置して実行する。builderは依存を自動導入しない。詳細は `docs/shared/inference/lora/kernel/README.md` と `tools/lora/kernel/build-record.json`。

```sh
LORA_HIKE_TOOLCHAIN=/path/to/prepared-toolchain python tools/lora/kernel/build.py
python -m http.server 8000 --directory docs
```

パネルは `http://127.0.0.1:8000/lora/`。実consumerがない場合は適用できず、旧v1パネルへPARTIAL/staging adapterを直接接続しない。Hike計算・PREPARED・STAGED・診断CONSUMER_APPLIED・管理snapshot公開の状態を別に扱う。

## 非正方形meanと受領fragmentを使う共同試験

新しい受領側CLIとprivate artifact／固定独立参照の配置は [nonrect-mean/REPRODUCE.md](../ai-connection/nonrect-mean/REPRODUCE.md) を参照。元モデル全量の再取得やLoRA native API変更を必要とせず、既存mean profileとPARTIAL診断を別境界のまま検証する。
