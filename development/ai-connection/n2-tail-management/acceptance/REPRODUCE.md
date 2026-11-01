# 返却証拠の再照合

この工程は既存の保持環境実行の照合であり、モデル・prefix・attention・参照の再計算を行わない。
必要なGit objectは管理5c484、引渡し055903、native a49、従前配布beffd、返却508d。
新metadata writer05c684を、過去に実行した5c484へ付け替えない。

repository rootで、返却原本・record直下digest・両sideの比較／manifestを確認できる。

```sh
git fetch origin 508d72cc9036e7f500827465c644b4aed3c5f711
python3 - <<'PY'
import json,hashlib,subprocess
ret='508d72cc9036e7f500827465c644b4aed3c5f711'
manager='5c484a8783ab129a2ff3543a98b2537af9888199'
native='a49aac492cc68e2dd6037e0deb4a6954731a847a'
base='development/ai-connection/managed-n2-tail-return/'
blob=lambda ref,path:subprocess.check_output(['git','show',ref+':'+path])
sha=lambda data:hashlib.sha256(data).hexdigest()
index=json.loads(blob(ret,base+'handoff.json'))
for item in index['files']:
    data=blob(ret,base+item['path'])
    assert len(data)==item['byteLength'] and sha(data)==item['sha256']
raw=blob(ret,base+'result.json')
assert len(raw)==3007028 and sha(raw)=='2d1e4a2205764a251af1357152c37d1fb11153d98bf5ba426d4257f3c0c4c859'
r=json.loads(raw)
profile='bernini-block0-n2-self-attention-residual-f32-v1'
assert r['nativeSource']['commit']==native and r['sourceProof']['executionProfileId']==profile
groups=[(manager,r['managementSource']),
        (native,r['sourceProof']['files']),
        (native,r['buildSourceProof']['files']),
        (native,r['publicReceiptProof'])]
assert [len(items) for _,items in groups]==[19,24,100,15]
for commit,items in groups:
    for item in items:
        data=blob(commit,item['path'])
        assert len(data)==item['byteLength'] and sha(data)==item['sha256']
stage=sha(blob(native,'docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs'))
assert all(item['sourceRef']['sha256']==stage and item['sourceRef']['sha256']!=item['sha256'] for item in r['publicReceiptProof'])
assert r['status']=='PASS' and r['nativeCalls']==2 and len(r['results'])==2
for case,side in zip(r['results'],['HIGH','LOW']):
    evidence=case['validationReceipt']['nativeEvidence']
    assert evidence['side']==side and evidence['scheduleIndex']==(1 if side=='HIGH' else 3)
    assert evidence['executionProfileId']==profile and evidence['blockIndex']==0 and evidence['tokens']==2
    comparisons=case['validationReceipt']['validation']['comparisons']
    assert len(comparisons)==8 and sum(c['values'] for c in comparisons.values())==71680
    assert all(c['failed']==0 for c in comparisons.values())
    assert len(case['validationReceipt']['validation']['parameterComparisons'])==7
    package=case['publishReceipt']['packageReceipt']
    manifest=blob(ret,base+'manifests/'+side+'/manifest.json')
    assert len(manifest)==package['manifestByteLength'] and sha(manifest)==package['manifestSha256']
    assert case['normExecution']['phase']=='published' and not case['snapshotPublished']
    assert not case['generationReady'] and all(case[k]=='NOT_READY' for k in ['load','predict','sample'])
print('Raw packet, 158 source records, HIGH1/LOW3 comparisons and manifests PASS; known nested metadata defect preserved')
PY
```

attention補足、全5出力／reference/gate／parameter／queue／storageの詳細な照合は
`evidence/SOURCE-RECONCILIATION.json.gz` と `evidence/EVIDENCE-RECONCILIATION.json.gz` に記録した。
両者の照合はmetadata/hash/contract検査で、native数値試験を158件／862件実行したという意味ではない。

管理側の保存mirrorは `received-508d72c/`。resultだけはlossless gzipのため、元indexを適用する場合は
一時directoryへcopy後 `result.json.gz` を `result.json` に展開する。
`RECEIVED-INDEX.json` に保存bytesと復元raw bytesのhash・長さ・元commit/path/Git blobを記録した。
元resultは再serialize・補正していない。原本は上のGit objectからも直接取得できる。

future metadata修正の再現は既存のnative rootsを維持して行う。

```sh
node --test --test-isolation=none tools/ai-connection/test-run-norm-required-n2-tail.mjs
```

全回帰は従前 [REPRODUCE.md](../REPRODUCE.md) の全native rootとN2 rootを設定し、
`node --test --test-isolation=none tools/ai-connection/test-*.mjs` を使う。今回459 PASS・skip0。
新たなprivate N2再実行や資材転送は照合の前提ではない。
