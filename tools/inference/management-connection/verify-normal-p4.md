# 固定P4通常契約のNN0再現

`verify-normal-p4.mjs`は、保存済みの実Text L512を使い、通常P4のmetadata対応判定とnative入力snapshotだけを確認する開発用CLI。model factory、投影、cross-attention、FFN、NN、exportは呼ばない。

| 対象 | 固定source |
|---|---|
| Diffusion通常契約 | `b6e166478a8e072c9ffd3ce562bfdb0c89634920` |
| 共有codec | `20f640a6e071b6c060a212e89b28f0c8965923f7` |
| 元Text数値実行 | `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| 採用Text manifest SHA-256 | `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405` |

入力は元の`development/inference/management-20261104/text/plain-long-accepted/plain-long-eos512.wktensor`。8,390,098 B、whole SHA-256 `18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a`、F32 BLC `[1,512,4096]`、mask512件すべて1を保持する。この固定hashは診断再現用で、通常owner APIの接続条件ではない。再encode・参照生成・元graphのexportは不要。

取得receiptの`acquisition.json`（`fixedDistributionSha`、`files`、任意の`runtimeAssets`）を使ってsource closureを復元する例。既存receiptや元私有probeは上書きせず、新しい保存先を使う。

```sh
P4_OWNER_ROOT=/path/to/owner-checkout
P4_ACQUISITION=/path/to/acquisition.json
P4_DIFFUSION_ROOT=/path/to/new-private-diffusion-source
git -C "$P4_OWNER_ROOT" fetch --no-tags origin b6e166478a8e072c9ffd3ce562bfdb0c89634920
python - "$P4_OWNER_ROOT" "$P4_ACQUISITION" "$P4_DIFFUSION_ROOT" <<'PY'
import hashlib,json,pathlib,subprocess,sys
repo,receipt,destination=sys.argv[1:]
acquisition=json.loads(pathlib.Path(receipt).read_text())
sha='b6e166478a8e072c9ffd3ce562bfdb0c89634920'
assert acquisition['fixedDistributionSha']==sha
for entry in acquisition['files']+acquisition.get('runtimeAssets',[]):
    relative=pathlib.PurePosixPath(entry['path'])
    assert not relative.is_absolute() and '..' not in relative.parts
    raw=subprocess.check_output(['git','show',sha+':'+str(relative)],cwd=repo)
    assert len(raw)==entry['bytes']
    assert hashlib.sha256(raw).hexdigest()==entry['sha256']
    target=pathlib.Path(destination,*relative.parts)
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists(): assert target.read_bytes()==raw
    else: target.write_bytes(raw)
PY
```

CLIは取得全fileのbytes／SHA-256／指定されたGit blob、relative JS import closureの欠落、固定Git objectとの一致をimport前に検査する。`owner-root`のGitには固定Diffusionとcodecのobjectが必要。上のfetchはDiffusion source用であり、保持済みmodelの再取得ではない。

```sh
node "$P4_OWNER_ROOT/tools/inference/management-connection/verify-normal-p4.mjs" \
  --diffusion-root "$P4_DIFFUSION_ROOT" \
  --acquisition "$P4_ACQUISITION" \
  --tensor "$P4_OWNER_ROOT/development/inference/management-20261104/text/plain-long-accepted/plain-long-eos512.wktensor" \
  --owner-root "$P4_OWNER_ROOT" \
  --output /path/to/new-normal-contract-nn0.json
```

`--output`は未作成のfileを指定する。receiptにはhelper自身のbytes／hashとcheckout SHAを残し、実bytesがそのcommitと一致する場合だけ`helper.scriptSourceSha`を設定する。固定codeの実行証拠を作るときはhelperをcommitした後に実行し、`uncommittedAtExecution:false`を確認する。新しいhelperのSHAを元Text数値実行、codec、対向sourceのSHAへ付け替えない。

合格条件はLOW／HIGHのstrict `checkExecutionSupport`、wrong marker／Tokenizer不足の拒否、通常の`snapshotP4NativeConditioning`とprotected capture/snapshotでの全word／全mask／model／Tokenizer／`umt5-final-rmsnorm-f32-v1`の保持、buffer独立所有、decoded入力と保存fileの不変。最終RMSNormを再適用せず、verification flagsはfalseのまま保持する。P4数値・全工程資源・相手本人ACKの受入には拡張しない。

CLIとsource改変／closure欠落の負例だけを確認するには、次を使う。実tensorの再実行は含まない。

```sh
node --test tools/inference/management-connection/verify-normal-p4.test.mjs
```
