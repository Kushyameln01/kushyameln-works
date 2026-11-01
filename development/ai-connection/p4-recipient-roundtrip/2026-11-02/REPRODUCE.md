# 取得・受領境界だけの再現

Python 3、Node 24、Git、HTTPS接続を使う。model・ONNX・Tokenizer本体は不要。
下記はfile取得・hash・既存receipt binding・native captureだけであり、元の数値runnerを呼ばない。

## 固定Diffusion成果の再取得

repositoryのrootで実行する。固定7eeのGit objectが必要で、branchのHEADを7eeへ戻す必要はない。

```sh
python development/ai-connection/p4-recipient-roundtrip/2026-11-02/acquire-outbound.py \
  --repository . --output /tmp/p4-outbound-fresh
```

23実取得fileのbytes/hash/Git object一致と、既存manifest union119 pathのchecksumを検査する。
`outbound-files.json` は再取得時刻以外も必ず原receiptと照合する。

## Text packetとP4 capture

元実行で使ったDiffusion sourceは7eeである。再現時も別の固定checkoutを用意し、
現在branchのHEADを実行sourceとして読み替えない。

```sh
git worktree add --detach /tmp/p4-receiver-at-7ee 7ee36228030ba3bb544a90b1d4b528702a7bae32
export TEXT_RECEIPT_DIR=/tmp/text-packet-fresh
export RECEIVER_REPO=/tmp/p4-receiver-at-7ee
mkdir -p "$TEXT_RECEIPT_DIR"
cp development/ai-connection/p4-recipient-roundtrip/2026-11-02/text/acquire.py "$TEXT_RECEIPT_DIR/"
cp development/ai-connection/p4-recipient-roundtrip/2026-11-02/text/prepare_received_inspector.py "$TEXT_RECEIPT_DIR/"
cp development/ai-connection/p4-recipient-roundtrip/2026-11-02/text/capture-probe.mjs "$TEXT_RECEIPT_DIR/"
python "$TEXT_RECEIPT_DIR/acquire.py"
python "$TEXT_RECEIPT_DIR/prepare_received_inspector.py"
git -C "$RECEIVER_REPO" rev-parse HEAD > "$TEXT_RECEIPT_DIR/receiver-head.txt"
git -C "$RECEIVER_REPO" show 7ee36228030ba3bb544a90b1d4b528702a7bae32:docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs > "$TEXT_RECEIPT_DIR/receiver-conditioning.mjs"
node "$TEXT_RECEIPT_DIR/source/tools/inference/text-encoder/inspect_received_conditioning_handoff.mjs" --output "$TEXT_RECEIPT_DIR/packet-inspection.json"
node "$TEXT_RECEIPT_DIR/capture-probe.mjs" "$TEXT_RECEIPT_DIR/capture-receipt.json" "$TEXT_RECEIPT_DIR/packet-inspection.json"
```

Git worktreeは再現者が別の固定checkoutを持っていれば追加不要。
この作業の最初の取得ではGitHub commit/tree/blobを使い、Text用Git checkoutは作成していない。
派生inspectorは元helperのpacket/receipt検査を保持し、HEAD照合だけを固定Git tree/blob照合へ替えた。
元helperとの差分・source hashは `text/received-inspector.patch` と `text/received-inspector-derivation.json` にある。
captureの3 verification flagsはすべてfalseであることを確認する。

## LoRA返却の再取得

新しいLoRA実行は不要。`lora/RECEIVED-AND-P4-MAPPING.json` のfilesを固定commitから取得し、
既存manifestの9 payloadとgzipの展開hashを照合する。

```sh
python - <<'PY'
import gzip, hashlib, json, pathlib, urllib.request
receipt = pathlib.Path('development/ai-connection/p4-recipient-roundtrip/2026-11-02/lora/RECEIVED-AND-P4-MAPPING.json')
d = json.loads(receipt.read_text())
root = pathlib.Path('/tmp/lora-receipt-fresh')
for r in d['files']:
    url = 'https://raw.githubusercontent.com/Kushyameln01/kushyameln-works/' + r['commit'] + '/' + r['path']
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read()
    assert len(data) == r['bytes'], r['path']
    assert hashlib.sha256(data).hexdigest() == r['sha256'], r['path']
    assert hashlib.sha1(('blob ' + str(len(data)) + '\0').encode() + data).hexdigest() == r['gitBlobSHA1'], r['path']
    target = root / r['commit'] / r['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    if r['path'].endswith('/evidence/run-result.json.gz'):
        h, count = hashlib.sha256(), 0
        with gzip.open(target, 'rb') as stream:
            while block := stream.read(1024*1024):
                h.update(block)
                count += len(block)
        assert count == d['compressedReceiptDecodedHashOnly']['bytes']
        assert h.hexdigest() == d['compressedReceiptDecodedHashOnly']['sha256']
print('PASS: fixed LoRA files and existing compressed receipt hashes; inference/export 0')
PY
```

公開された元all-value比較・取引receiptのscopeは旧Q16のまま読む。
上記取得を新P4でのLoRA適用・数値合格や、過去source55件すべての再取得へ読み替えない。
P4 logical mappingと不足境界は `lora/RECEIVED-AND-P4-MAPPING.md` を参照する。
