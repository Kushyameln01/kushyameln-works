# 正式DATA bridge・実File／真正base試験の再現

実行sourceを `28f44c3a1b71bef59e2d018a0db736de6d84675c` に固定する。対象はlight HIGHのローカルFile1件、Q先頭16行・全5120列と明示bias16のPARTIAL診断。後続の文書配布commitと実行sourceを分ける。

## private入力

1. `Bernini-R_LightX2V_high_noise.safetensors`：1,244,141,856 bytes、SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。新しいブラウザloadで実際にheaderと全体hashを検査し、同じimmutable Fileだけにdigestを再利用する。
2. [Diffusion受領base断片](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d) `base-blocks.json`：709,364 bytes、SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。privateなsource repo外へ保存し、permissionを600にする。元15GB全baseは不要で、whole-file hashは再計算しない。
3. 既存の独立HIGH参照directory：`reference.json`、`pre-execution-gates.json`、必要な配列9件、親directoryの`result.json`。JSON／gate／旧結果は0c固定Git blobへ、配列は各長さ・hashへ照合する。実行時の既存配置は `/workspace/work/lora/e1-joint/HIGH-fixed/reference`。

参照archiveの受領入口は [LoRA引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3) の既存「Nonrect mean and original LoRA joint receiver evidence」。旧archiveは10,088,369 bytes、SHA-256 `693f76570cf9915be07f258a4248c7618754b99f6dc4f8c11f013a8af053002f`。必要なHIGH固定参照をprivateに展開し、新しい期待値やgateを生成しない。

原本とbase断片はFile pickerからブラウザへ渡す。raw `.safetensors`、raw base artifact、生の選択weightをGitや公開HTTP assetへ置かない。試験CLIのlight/HIGH固定は参照が対応する診断範囲であり、製品の4原本allowlistではない。

## 固定sourceと環境

```sh
git clone https://github.com/Kushyameln01/kushyameln-works.git lora-data-real
cd lora-data-real
git fetch origin 28f44c3a1b71bef59e2d018a0db736de6d84675c 60d16b64d6020d3d20239f087f8add91268dcaad fc2789a0f649e33f15eb13750e6a983b5c52d170 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 82b21f09cb63926543181b16f0e97ebc6b9fa6be 0c27874908638afc748ea2455a2779a16736730b
git checkout --detach 28f44c3a1b71bef59e2d018a0db736de6d84675c
git worktree add --detach ../manager-60d16 60d16b64d6020d3d20239f087f8add91268dcaad
git worktree add --detach ../owner-fc278 fc2789a0f649e33f15eb13750e6a983b5c52d170
git worktree add --detach ../diffusion-5f880 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
```

Node `v24.19.0`、Chromium `154.0.8037.57`、Playwright、ORT WASM `1.24.3` と固定Hikeを使用した。Playwrightの既定pathは `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumは `/usr/bin/chromium`。別環境では実在するpathを `LORA_PLAYWRIGHT_MODULE`／`LORA_CHROMIUM_PATH` で指定する。ブラウザ試験の期待値再生成にPython／NumPyは使わない。

source treeの各実bytesは完全commitのGit blobへ照合する。管理同梱DATA2はさらに原82bの元path／Git blob／長さ／hashへ照合し、ブラウザでも `verifyLoraAdmissionDataSources` のruntime proofを作る。DATAとnative SDKのpinは分ける。receiverのhost/browser/helperも実行HEADへcommit済みである必要がある。

## browser試験

```sh
node tools/ai-connection/test-lora-data-real.mjs \
  --manager-root ../manager-60d16 \
  --lora-root ../owner-fc278 \
  --diffusion-root ../diffusion-5f880 \
  --artifact /absolute/private/base-blocks.json \
  --reference-root /absolute/private/HIGH-fixed/reference \
  --file /absolute/private/Bernini-R_LightX2V_high_noise.safetensors \
  --pair light --side HIGH \
  --expected-sha256 9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945 \
  --out /absolute/private/new-empty-formal-data-run
```

入力とoutは全source repositoryの外に置く。outは新しい空directoryを使う。実行時はdirectory0700、生成物0600を要求し、既存証拠へ上書きしない。後続の文書HEADから同じコードを実行する場合、`receiverCommit`はそのHEADになる。UUID・計時値は変わるため、receipt全体のhash一致を再実行の合格条件にしない。

期待する終端は `PASS_LORA_DATA_REAL_BASE_PARTIAL_SNAPSHOT`。6公開case（0、1、-1、1再適用、検証失敗後の1、取消後の1）、`generationReady:false`、`currentLiveAdmission:false`、source55件、生成物26件を記録する。正式bridgeがcheckpoint／brand付き公開後監査を自動処理し、receiverの旧norm hookを重ねない。

outの`actual/`には6公開case各4件のweight/bias/output/scopeと、取消checkpointのweight/bias2件を保存する。全weightは独立f64参照へ `1e-5 + 1e-4*abs(reference)`、biasはF32数値完全一致、各16出力は `1e-6 + 1e-5*abs(reference)` で比較する。公開分の491,520 weight・96 bias・96出力と、非公開取消候補の81,920 weight・16 biasを分けて数える。

検証失敗の負例はvalidation activation copyの先頭値を`+1024`にする。独立expected16と事前gateは変更しない。実 `NATIVE_VALIDATION_MISMATCH` を受け、旧feedを保持して次の選択で復帰する。取消はpending checkpointのexact queue targetに対して行い、元task終端・stop確認・release・再利用可能まで待つ。cancel用SDK revision観測は失効させ、次のpublic planで新しい実tupleを観測する。

最後にsource能力を解除してもnative独立copyで実行できることを確認し、同じqueueから不変baseへ復帰する。base bytesを変える前にsnapshotをuncurrentとし、終端・afterTerminal・release後のbase16出力を検証して終了する。過去snapshot factが存在してもlive適用とは扱わない。

## focused確認と配布receipt

```sh
WORKS_LORA_DATA_MANAGER_ROOT=../manager-60d16 node --test tools/ai-connection/test-lora-data-real-inputs.mjs
cd ../manager-60d16
node --test --test-isolation=none \
  tools/ai-connection/test-lora-admission-data-sources.mjs \
  tools/ai-connection/test-lora-data-source-proof.mjs \
  tools/ai-connection/test-loader-norm-fields.mjs \
  tools/ai-connection/test-lora-data-phase-bridge.mjs
```

receiver4件と管理41件の宣言／source／bridge境界確認であり、実数値試験と合算しない。既存の管理合成joint2件や旧20／6実数値も、それぞれ元scopeのまま再利用する。

公開配布は [evidence/receipt.json](evidence/receipt.json)、[evidence/run-result.json.gz](evidence/run-result.json.gz)、manifest、独立読戻し／source reviewを使う。gzipは生の原本・weight配列を含まず、完全metadata receiptをそのまま圧縮したもの。展開確認は次のとおり。

```sh
gzip -dc run-result.json.gz > run-result.json
```

展開後は37,764,410 bytes、SHA-256 `50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032`。gzipは1,211,308 bytes、SHA-256 `29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754`。これらは配布済みの当該実行receiptの照合値であり、新しい再実行receiptへ強制しない。

原本・native計算を再実行しない読戻しは [evidence/independent-readback.json](evidence/independent-readback.json) のscopeに従う。別pair/side、新tail、全target／全model session、selected-weight E4、lease、生成・公開はこの再現手順へ自動追加しない。
