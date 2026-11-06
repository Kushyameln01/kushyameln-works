# P4限定診断の再現

実行sourceはbase `829467c14ec6fd1ab1858dfc175c84605de1ac98`、最終F32 consumer `5744f700e17b23d5c18d32315fb6dfbd7c49089a`。最新5744ではbaseの実行36 sourceも全て同一bytesであり、そのsourceで以下を実行できる。GitHubから普通のGit clone/fetchで取得する。保持環境guardが過去固定commitの`git show`も使うため、sourceだけを置いた非Gitディレクトリや履歴不足のshallow checkoutは数値実行の前提を満たさない。

## 環境と非公開入力

- Node `v24.19.0`、Python/NumPy、Python Playwright、Chromium `/usr/bin/chromium`（実行時154.0.8037.57）。ORTは同梱WASM・1thread。
- 元モデルは既存`/workspace/work/retained/bernini/`のHIGH/LOW各15,574,833,216B。再download・全file hashは不要。
- 受入済みtail出力は`/workspace/work/diffusion-private-tail-saved-outputs-20261101/`。
- upstream guardが参照する既存`diffusion-private-hidden`、`diffusion-private-heads`、`diffusion-private-tail-attention-20261101`、`diffusion-private-tail-reference-final-20261101`と旧E4 package `managed-n2-execution-8xrdkeqy/run/`を保持する。sourceだけの受領でこれらのprivate値を取得したとは扱わない。
- 全private出力は`/tmp`の新しいdirectory0700、file0600にする。元出力を上書きしない。HTTP serverは`docs/`だけを提供し、modelはFile input、private入力はPlaywrightのJSON**文字列**で渡す。正負ゼロをcanonicalizeしない。private出力JSONは`-0.0`を保持する。

以下は保持環境で実行したpathの再現例。別環境では既存資材の実在pathを対応させる。未取得のText値・LoRA値・referenceをreceipt要約から復元しない。

## source/buildと軽い境界検査

```sh
python tools/diffusion-models/p4-cross-ffn-build.py --check
node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/post-self-attention/test-*.mjs docs/shared/diffusion-models/diagnostics/p4-cross-ffn/test-*.mjs
python tools/diffusion-models/test-p4-cross-ffn-reference.py
python tools/diffusion-models/test-p4-cross-ffn-browser.py
python tools/diffusion-models/test-p4-cross-ffn-feed-browser.py
```

新owner42 Node、reference13、browser13、最終feed9を別scopeで確認する。browser/feed手順testの安価な実Chromium検査は符号付きゼロの両方向transportを照合し、WASM/modelを起動しない。build検査は新50と旧native100 source、Hike source/build/kernelを照合する。Hike再buildが必要な場合だけ、既存pinned compilerを`DIFFUSION_TOOLCHAIN`で指定し`post-self-attention/build.py`を使う。compiler/provenance不一致の代替buildを合格へ置き換えない。

## base HIGH／LOW

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/p4-cross-ffn-browser.py --private-dir /tmp/p4-repro-base --output-dir /tmp/p4-repro-public/base
```

各sideで保存残差・timeAct1・旧E4・producer/source/hashを検査し、明示L4 fixtureを投入する。取消first-tile、busy、入力保持、出力保持、dispose終端、workspace固定、旧tail idle併置も実行する。旧tail/prefixの数値計算はしない。直後は`numericalAccepted:false`で独立参照待ちとする。

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python tools/diffusion-models/p4-cross-ffn-reference.py --models /workspace/work/retained/bernini --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --runtime-cuts /tmp/p4-repro-base/high-runtime-arrays.json --output-dir /tmp/p4-repro-reference --receipt-dir /tmp/p4-repro-public/reference
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python tools/diffusion-models/p4-cross-ffn-reference.py --models /workspace/work/retained/bernini --side LOW --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/low-tail-outputs.json --runtime-cuts /tmp/p4-repro-base/low-runtime-arrays.json --output-dir /tmp/p4-repro-reference --receipt-dir /tmp/p4-repro-public/reference
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/p4-cross-ffn-browser.py --compare-only --private-dir /tmp/p4-repro-base --reference-dir /tmp/p4-repro-reference --output-dir /tmp/p4-repro-public/base
```

入力hash、全25保存arrayのnative F32 hashをモデル/参照計算前に検査する。各sideのlocal25/composed25の全値と29原本選択証拠が全て通った場合だけ、限定数値受入とする。失敗したgateを変更しない。

## final-F32 provider/sink/consumer

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/p4-cross-ffn-feed-browser.py --prepare --side HIGH --source-commit 5744f700e17b23d5c18d32315fb6dfbd7c49089a --private-dir /tmp/p4-repro-patches --output-dir /tmp/p4-repro-public/feed
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python tools/diffusion-models/p4-cross-ffn-reference.py --models /workspace/work/retained/bernini --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --patches /tmp/p4-repro-patches/high-final-f32-patches.json --output-dir /tmp/p4-repro-patched-reference --receipt-dir /tmp/p4-repro-public/patched-reference
```

`--prepare`は実FP8 Q weight first4rowsとF16 Q bias4値のowned provider・独立decodeを照合し、テストcallerの最終F322blockをprivate出力する。低rank計算ではない。次の例のreference hashとbase blockOutput hashは、同じ固定資材・fixtureによる今回の値である。新しい資材では実file/receiptのhashへ対応させる。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/p4-cross-ffn-feed-browser.py --validate --side HIGH --source-commit 5744f700e17b23d5c18d32315fb6dfbd7c49089a --private-dir /tmp/p4-repro-patched-actual --patches /tmp/p4-repro-patches/high-final-f32-patches.json --reference /tmp/p4-repro-patched-reference/high-composed-reference.json --expected-reference-sha256 8c3f09398cbedcfb8cb5286fa315d343f3d3691636e4e6bc4cf9dd0b44ca2dfc --base-output-sha256 46fd4e5a8ab6896bda805d553e0e961221049fc109ac073efdd5f40ceecb118d --output-dir /tmp/p4-repro-public/feed
```

実stage実行→独立blockOutput/gate→commit1→旧lease/active bytes→handle解放→rollback2→base再読→cleanupを検査する。private25出力の保存hash、全29原本raw/final-F32とpackage/patch/input bindingも照合し、公開filterまで成功したreceiptを取得する。

追加のcomposed25全値検査は、モデルを再実行せず次で再現できる。

```python
import importlib.util, json
from pathlib import Path
p = Path('tools/diffusion-models/p4-cross-ffn-reference.py')
s = importlib.util.spec_from_file_location('p4ref', p)
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
a = json.loads(Path('/tmp/p4-repro-patched-actual/high-runtime-arrays.json').read_text())
e = json.loads(Path('/tmp/p4-repro-patched-reference/high-composed-reference.json').read_text())
for name, shape in m.ARRAY_SHAPES.items():
    shape = [4 if axis == 'L' else axis for axis in shape]
    actual = m.f32_array(a['arrays'][name], shape)
    assert m.identity(actual)['sha256'] == a['evidence']['outputHashes'][name + 'SHA256']
    result = m.compare(actual, m.f32_array(e['expected'][name], shape), m.load_plan()['gates']['composed'])
    assert result['failed'] == 0, name
print('25 composed cuts PASS; candidate scope only')
```

## 今回の実行と受領確認

実際のprivate出力はbase `/tmp/p4-baseline-829467c`、その参照`/tmp/p4-reference-baseline-829467c`、patch `/tmp/p4-feed-prepared-829467c`、patch参照`/tmp/p4-reference-patched-829467c`、最終actual `/tmp/p4-feed-actual-5744f70`。同名を再利用せず、新しいpathで再現する。公開結果の完全性は[handoff.json](handoff.json)の各path/bytes/SHA256で確認する。

受領確認は独立環境`/tmp/p4-receiver-5744f70`でGitHubの固定source50file・公開API契約を再downloadし、source closure/hash/lengthとpure境界を検査した。[receipt](receiver/receipt.json)は外部ownerのACKや実数値共同試験を主張しない。

全query/K、本番conditioning/precision/contexts、全block、HIGH→LOW、generated latent/VAE decode、全体peak/負荷はこの再現の対象外。`load/predict/sample=NOT_READY`を維持する。
