# 再現手順

実行sourceは `126614a8cf99b6c80243595309ae0e6e704d780f`。配布の結果追加commitへ実行sourceを付け替えない。

## コードのみの変更検証

```bash
git worktree add --detach /workspace/lora-normal-source 126614a8cf99b6c80243595309ae0e6e704d780f
git worktree add --detach /workspace/diffusion-normal-owner 48ff155988d995fc2569e495c8d8820273bd472c
cd /workspace/lora-normal-source
P4_NATIVE_ROOT=/workspace/diffusion-normal-owner node --test tools/lora/test-*.mjs
```

結果140/140、fail/skip0。旧7ee互換26件は旧native checkoutを`P4_NATIVE_ROOT`へ指定し、次の2ファイルだけを実行したもの。

```bash
P4_NATIVE_ROOT=/workspace/diffusion-7ee node --test tools/lora/test-p4-adapter.mjs tools/lora/test-p4-native-protocol.mjs
```

## 今回の実File試行

以下は今回使用した保持環境のpath。LoRA1選択とLOW base、既存oracleを使用する。他3原本、再export、oracle再生成、base全体hashの再計算は前提にしない。初回の未検証baseをsize/headerだけで既存hashと同一認定してよい、という意味ではない。有効な既存全体hash receiptを再利用する場合はBASE-REUSE-RECEIPTのstat bindingも確認する。

```bash
node tools/ai-connection/test-lora-normal-real.mjs \
  --base-file /workspace/work/lora/e1-base-cache/Bernini_LOW_fp8_e4m3fn_scaled.safetensors \
  --file /workspace/work/lora/light-safetensors/Bernini-R_LightX2V_low_noise.safetensors \
  --oracle-root /workspace/work/lora/p4-adapter-task/oracle-a80-run1 \
  --diffusion-root /workspace/work/lora/diffusion-normal-owner-48ff \
  --diffusion-commit 48ff155988d995fc2569e495c8d8820273bd472c \
  --manager-root /workspace/work/lora/manager-884989 \
  --out /workspace/work/lora/normal-transaction-task/new-empty-run \
  --timeout-ms 900000
```

`--out`は新規の空directoryを指定する。manager checkoutは `8849891f19124df31847bd691503c2491278eaa8`。Node/Playwright/Chromiumが必要。hostは既定`/opt/codex/cua_node/lib/node_modules/playwright`と`/usr/bin/chromium`、必要なら`LORA_PLAYWRIGHT_MODULE`/`LORA_CHROMIUM_PATH`を指定する。

LoRA/baseはCDP File inputで渡し、hostによる15GB uploadやHTTP原本配信をしない。hostはfixed Git objectに一致するimport closureのみ配信する。LoRA新loadの全体hashはbrowserで検証。normal factoryにrun/referenceを渡さず、通常validate→commitを実行した後、別のdiagnostic adapterで既存oracleへ2回だけ比較する。

完全な実File数値再現にはprivate original/baseおよび上記a80 oracleが必要。Git配布に原本weightやoracle配列は含めない。oracleのmanifestは21,434B、SHA-256 `04e643dfddf37337c44d210d20c44b9eefe0d2328efbc7833a0903d59c0167ef`。同名の新oracleで置換しない。

## 保存成果物の再照合

再推論は不要。`FILES.json`の各path/bytes/SHA-256を固定配布commitから取得して照合する。`EXECUTION-SOURCE.json`は実ロード47件を、`ARTIFACTS.json`は公開2出力とprivateに残した10 weight/bias成果の識別を保持する。

```python
import gzip, hashlib, json
from pathlib import Path
root = Path('development/ai-connection/lora-normal-transaction')
manifest = json.loads((root/'FILES.json').read_text())
for item in manifest['files']:
    data = (root/item['path']).read_bytes()
    assert len(data) == item['bytes']
    assert hashlib.sha256(data).hexdigest() == item['sha256']
raw = gzip.decompress((root/'diagnostics/real-run1.json.gz').read_bytes())
summary = json.loads((root/'diagnostics/NUMERICAL-RESULT.json').read_text())
assert len(raw) == summary['fullRawReceiptBytes']
assert hashlib.sha256(raw).hexdigest() == summary['fullRawReceiptSHA256']
assert json.loads(raw)['status'] == 'PASS_LORA_NORMAL_REAL_PARTIAL'
```

2出力はlittle-endian F32、各shape `[2,5120]`、40,960 bytes。詳細gate/全出力・W/bの比較件数と失敗数は診断側へ保存した。相手の取得ACKは数値再推論や新規exportを要求しない。
