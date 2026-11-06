# 実L512 P4の再現条件

Node24、Python/NumPy、Playwright/Chromium、Gitを使う。既存の大モデルを再exportしない。
原モデルHIGH/LOWは保持済み各15,574,833,216 Bを使い、全file hashは再計算しない。
非公開の保存N2 artifact・prefix guard/E4資材は従来の保持環境が必要である。
公開receiptの要約から値を復元しない。sourceだけの取得をprivate値の取得ACKとは扱わない。
前提pathは元 [P4再現](../p4-cross-ffn/REPRODUCE.md) の保持資材に対応する。

## 軽い変更境界検査

```sh
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/test-prepare-input.py
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/test-run-reference.py
node --test --test-isolation=none docs/shared/diffusion-models/diagnostics/p4-real-text-l512/test-run.mjs
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-p4-real-text-l512-browser.py
```

private packet未配置のときは、その入力を必要とするtestがskip/限定検査となるため結果を区別する。
保持環境の記録ではskip0。全model推論のtest件数へ加算しない。

## 実行sourceと入力

base nativeの元実行sourceは `994ebb9ce01c9e95db9cd18eb877a981152693c5`。
その固定checkoutで実行するか、同一codeを使う新commitの実行として別receiptを作る。
driverの`--source-commit`は実際のHEADと一致しなければならない。

```sh
git worktree add --detach /workspace/work/p4-real-l512-repro 994ebb9ce01c9e95db9cd18eb877a981152693c5
cd /workspace/work/p4-real-l512-repro
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/prepare-input.py --packet /path/to/f76/plain-conditioning.wktensor --output-dir /tmp/p4-real-l512-repro-inputs
```

元WKTは固定f76 `development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor`。
whole90f9aed…/payload107a34…/mask19ab437…をadapterが検査する。
生成native JSONは元と同じ8,604,657 B／SHA9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8になる。

## base参照をnative前に固定する

次のHIGH例をLOW・対応low-tailにも実行する。すべて新しい出力pathを使う。

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/reference/run-reference.py --mode compose --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --text /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --output-dir /tmp/p4-real-l512-repro-composed/high --receipt /tmp/p4-real-l512-repro-high-composed.json
```

両`manifest.json`のSHA、実行source、既存gate/input identityを
`bernini-p4-l512-pre-runtime-reference-freeze/0.1`へ固定する。
保存形式と全値identityは [PRE-RUNTIME-FREEZE.json](PRE-RUNTIME-FREEZE.json) が正本。
`sourceCommit`には再現checkoutの実HEAD、`cases.HIGH/LOW.manifestPath`と`manifestSHA256`には
今回の新referenceを置く。値を見た後にgateやinput identityを変更しない。

```sh
python - <<'PY'
import hashlib, json, pathlib
cases = {}
for side in ('HIGH','LOW'):
    p = pathlib.Path('/tmp/p4-real-l512-repro-composed') / side.lower() / 'manifest.json'
    cases[side] = {'manifestPath':str(p),'manifestSHA256':hashlib.sha256(p.read_bytes()).hexdigest()}
d = {'schemaVersion':'bernini-p4-l512-pre-runtime-reference-freeze/0.1',
     'sourceCommit':'994ebb9ce01c9e95db9cd18eb877a981152693c5',
     'candidatePlanSHA256':'051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600','cases':cases}
pathlib.Path('/tmp/p4-real-l512-repro-freeze.json').write_text(json.dumps(d,indent=2)+'\n')
PY
export P4_BASE_HIGH_REF_SHA=$(python -c "import hashlib,pathlib;print(hashlib.sha256(pathlib.Path('/tmp/p4-real-l512-repro-composed/high/manifest.json').read_bytes()).hexdigest())")
```

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 timeout --signal=INT --kill-after=30s 1800s python tools/diffusion-models/p4-real-text-l512-browser.py --source-commit 994ebb9ce01c9e95db9cd18eb877a981152693c5 --composed-freeze /tmp/p4-real-l512-repro-freeze.json --native-input /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --packet /path/to/f76/plain-conditioning.wktensor --private-dir /tmp/p4-real-l512-repro-runtime --output-dir /tmp/p4-real-l512-repro-receipts
```

外側timeoutはpage.evaluateを拘束するために使う。停止時もPythonのfinallyがbrowserを閉じ、
可能ならprivate failure receiptを残す。手順は元モデル全体のload/predict/sampleではない。
両browserが閉じた後にlocal参照を実行し、benchmark中のcgroup測定へ参照計算を混ぜない。

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/reference/run-reference.py --mode local --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --text /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --runtime-manifest /tmp/p4-real-l512-repro-runtime/high-runtime/manifest.json --composed-manifest /tmp/p4-real-l512-repro-composed/high/manifest.json --composed-manifest-sha256 "$P4_BASE_HIGH_REF_SHA" --output-dir /tmp/p4-real-l512-repro-local/high --receipt /tmp/p4-real-l512-repro-high-local.json
```

LOWも同様に実行する。**CLI exit0だけで判定せず、receiptのpassed:true、local/composedの全25 failed0、
各group15,927,296値、全29 parameter proofを検査する。** 再現checkoutは保持資材と同じ `/workspace/work/` 配下に置く。旧guardのSAVED/OLD_PRIVATE/E4 packageはROOT.parentを使うため、checkoutだけを `/tmp` へ置かない。元の結果は
[HIGH](reference/high-local-receipt.json) / [LOW](reference/low-local-receipt.json)。

## LoRAの追加工程

owner source・原本の取得/検証は [SOURCE-ACQUISITION.json](lora/SOURCE-ACQUISITION.json)、
実L512用の境界は [REAL-L512-PLAN.md](lora/REAL-L512-PLAN.md)。
baseと別のsource/reference freeze・private出力pathを使う。
controlled K4の期待値を実L512へ転用せず、Diffusionで低rank積を再実装しない。
実LoRAの実行と最終receiptは下記。実測は [LORA-RESULT.md](LORA-RESULT.md) に分離した。

### owner正本と原本

数値実行sourceは `db5df292b21366ec385d92bb281b5f3ee74183c4`。
再現checkoutも同じ `/workspace/work/` 配下へ作る。以下の最初の`P4_DELIVERY_REPO`は、
最終配布を取得したcheckoutを指す。source-only checkoutにまだない結果manifestをそこから読む。

LoRA reference wrapperはbaseの原LOW composed manifestを固定path/hashで照合する。
その実manifestのmetadata原bytesのみを最終配布へ同梱した。これはreceipt要約からの復元ではなく、
実行前に生成したmanifestのcopyであり、数値配列本体は含まない。次のstepで正本を配置する。
新しく再生成した別pathのbase manifestだけではこの前提を満たさない。

```sh
export P4_DELIVERY_REPO=/path/to/checkout-at-final-distribution
python - <<'PY'
import hashlib, json, os, pathlib, urllib.request
os.umask(0o077)
manifest = pathlib.Path(os.environ['P4_DELIVERY_REPO']) / 'development/ai-connection/p4-real-text-l512/lora/owner-source-files.json'
raw = manifest.read_bytes()
assert hashlib.sha256(raw).hexdigest() == 'ab3980144681b518cac83af68731adfc814e25fc9f642011e6e20fd70c196d9b'
target = pathlib.Path('/tmp/p4-l512-lora/a80/source')
target.mkdir(parents=True, exist_ok=True)
for r in json.loads(raw):
    assert r['commit'] == 'a80db72feea60b9bd69e292e4716665c6f0ee77f'
    p = (target / r['path']).resolve()
    assert p.is_relative_to(target.resolve())
    if p.exists():
        data = p.read_bytes()
    else:
        url = 'https://raw.githubusercontent.com/Kushyameln01/kushyameln-works/' + r['commit'] + '/' + r['path']
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    assert len(data) == r['bytes'] and hashlib.sha256(data).hexdigest() == r['sha256']
    assert hashlib.sha1(('blob ' + str(len(data)) + '\0').encode() + data).hexdigest() == r['gitBlobSHA1']
(target.parent / 'download-receipt.json').write_bytes(raw)
print('55 owner files verified; no SDK/model execution')
PY
python - <<'PY'
import hashlib, os, pathlib
os.umask(0o077)
delivery = pathlib.Path(os.environ['P4_DELIVERY_REPO'])
raw = (delivery / 'development/ai-connection/p4-real-text-l512/reference/pinned-low-composed-manifest.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == '530746b1e2d59d0c9cbe82e1ddad6d743ae32eb8fd7029f56cca694b57672be7'
p = pathlib.Path('/tmp/p4-real-text-l512/composed/low/manifest.json')
p.parent.mkdir(parents=True, exist_ok=True)
if p.exists(): assert p.read_bytes() == raw
else: p.write_bytes(raw)
PY
```

選択LoRAの取得URLは
`https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_low_noise.safetensors`。
保持済みなら再downloadしない。未配置の場合は選択1fileのみを
`/tmp/p4-l512-lora/original/Bernini-R_LightX2V_low_noise.safetensors` へ取得する。
expected size1,244,141,856 B、SHA-256 `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b`。
rootの旧acquisition receiptを別inode/mtimeのfileへ流用せず、その環境で全bytes/hashを検査してfresh receiptを作る。

```sh
python - <<'PY'
import hashlib, json, os, pathlib
os.umask(0o077)
p = pathlib.Path('/tmp/p4-l512-lora/original/Bernini-R_LightX2V_low_noise.safetensors')
before = p.stat()
h = hashlib.sha256()
with p.open('rb') as stream:
    while block := stream.read(1024*1024): h.update(block)
after = p.stat()
assert all(getattr(before,k) == getattr(after,k) for k in ('st_size','st_mtime_ns','st_dev','st_ino')) and after.st_size == 1244141856
expected = '86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b'
assert h.hexdigest() == expected
d = {'status':'COMPLETE_VERIFIED','destination':str(p),'expectedBytes':after.st_size,'actualBytes':after.st_size,
     'expectedSHA256':expected,'actualSHA256':expected,'fullFileVerified':True,
     'fileStat':{'size':str(after.st_size),'mtimeNs':str(after.st_mtime_ns),'dev':str(after.st_dev),'ino':str(after.st_ino)}}
pathlib.Path('/tmp/p4-repro-lora-original-receipt.json').write_text(json.dumps(d,indent=2)+'\n')
PY
git worktree add --detach /workspace/work/p4-real-l512-lora-repro db5df292b21366ec385d92bb281b5f3ee74183c4
cd /workspace/work/p4-real-l512-lora-repro
```

### A/B→事前freeze→actual SDK/native→local/composed比較

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/lora-reference/lora-reference.py --mode compose --source-commit db5df292b21366ec385d92bb281b5f3ee74183c4 --original-receipt /tmp/p4-repro-lora-original-receipt.json --text /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --output-dir /tmp/p4-repro-lora-ab --receipt /tmp/p4-repro-lora-ab-receipt.json
```

今回できた`/tmp/p4-repro-lora-ab/manifest.json`のSHAと4つのbase input bindingを、
[LORA-PRE-RUNTIME-FREEZE.json](LORA-PRE-RUNTIME-FREEZE.json) と同schemaへ固定する。
`sourceCommit`、owner a80、owner receipt SHAab398…、原本SHA869…、referenceManifestSHA256、
`inputBindings`（独立patch SHAを除くbase4項目）が必要。元のfreeze SHA43881…は元実行の証拠として保持し、
新環境のreference metadata/receiptへ付け替えない。

```sh
export P4_LORA_REF_SHA=$(python -c "import hashlib,pathlib;print(hashlib.sha256(pathlib.Path('/tmp/p4-repro-lora-ab/manifest.json').read_bytes()).hexdigest())")
python - <<'PY'
import json, os, pathlib
m = json.loads(pathlib.Path('/tmp/p4-repro-lora-ab/manifest.json').read_text())
d = {'schemaVersion':'bernini-p4-l512-lora-pre-runtime-freeze/0.1',
     'sourceCommit':'db5df292b21366ec385d92bb281b5f3ee74183c4',
     'ownerCommit':'a80db72feea60b9bd69e292e4716665c6f0ee77f',
     'ownerReceiptSHA256':'ab3980144681b518cac83af68731adfc814e25fc9f642011e6e20fd70c196d9b',
     'referenceManifestSHA256':os.environ['P4_LORA_REF_SHA'],
     'originalLoraSHA256':'86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b',
     'inputBindings':{k:v for k,v in m['inputBindings'].items() if k!='finalF32PatchArtifactSHA256'}}
pathlib.Path('/tmp/p4-repro-lora-freeze.json').write_text(json.dumps(d,indent=2)+'\n')
PY
```

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 timeout --signal=INT --kill-after=30s 1800s python tools/diffusion-models/p4-real-text-l512-lora-browser.py --source-commit db5df292b21366ec385d92bb281b5f3ee74183c4 --execution-freeze /tmp/p4-repro-lora-freeze.json --reference-manifest /tmp/p4-repro-lora-ab/manifest.json --reference-sha256 "$P4_LORA_REF_SHA" --native-input /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --packet /path/to/f76/plain-conditioning.wktensor --private-dir /tmp/p4-repro-lora-runtime --output /tmp/p4-repro-lora-browser.json
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/lora-reference/lora-reference.py --mode local --source-commit db5df292b21366ec385d92bb281b5f3ee74183c4 --original-receipt /tmp/p4-repro-lora-original-receipt.json --text /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --reference-manifest /tmp/p4-repro-lora-ab/manifest.json --reference-manifest-sha256 "$P4_LORA_REF_SHA" --runtime-manifest /tmp/p4-repro-lora-runtime/low-runtime/manifest.json --actual-patches /tmp/p4-repro-lora-runtime/low-runtime/actual-prepared-patches.json --output-dir /tmp/p4-repro-lora-local --receipt /tmp/p4-repro-lora-local-receipt.json
```

local receiptのpassed:true、A20480+4失敗0、local/composed各25cut・15,927,296値失敗0、
preRuntimeBReproducedBitExactly:true、全29SDKbyte消費proof、commit/rollback/lease/session終端を確認する。
SDK actual F32とindependent A-rounded F32のhashが異なる場合も、別artifactのまま数値gateへ比較する。
新しいmodel NNは一回のcandidate検証だけで、commit/rollback後のbyte確認を追加NNへ数えない。
