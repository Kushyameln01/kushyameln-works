# 受領照合の再現

Node24／Python3／Gitを使う。モデル・native client・WASM kernelは実行しない。
以下は固定Git原本、既存receipt、実保存packageを読む手順。
作業出力はrepo外の新directoryに置き、元のreceiptを上書きしない。

## 固定原本

管理repoで必要なGit objectを取得する。実行sourceは配布SHAと分けて保持する。

```sh
git fetch origin \
  f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48 \
  dd95ed05f058930a391f015c11b9a2b963a42db5 \
  7ee36228030ba3bb544a90b1d4b528702a7bae32
```

各commitの祖先には、そのownerの実行sourceが含まれる。
別のshallow cloneを使う場合は不足した完全commitを明示fetchする。
管理884／60d、native855／5f／fc、codec2bd、catalog6dae、元参照0c／351の全SHAは
`RETURN-ADMISSION.json`、各原本manifestと検証scriptの固定定数に記載している。

以下の変数を自分の取得済みrepository／repo外作業先へ設定する。

```sh
RETURN_REPO="$PWD"
RETURN_REPORT="$RETURN_REPO/development/ai-connection/p23-joint-acceptance/owner-return"
RETURN_WORK="$(mktemp -d)"
```

## VAE：Git bytesと実packageの読戻し

```sh
python "$RETURN_REPORT/vae/prepare-git-origins.py" \
  --repo "$RETURN_REPO" --output "$RETURN_WORK/vae"
node "$RETURN_REPORT/vae/verify-vae-return.mjs" "$RETURN_REPO" "$RETURN_WORK/vae"
```

最初のscriptは取得receiptの98pathとsource／参照を固定Gitから読取り、194 Git blobを作業先に保持する。
次のscriptは固定884の既存package reader／codecを使い、10 packageを実際に読み直す。
93 index一致、20 management source、mean各128／RGB各1536値、target／revision／取消／解放、
sourceと同一traceの結合がPASSとなることを確認する。
`verification-output.json` と `verification-stdout.json` は元検証とbyte exactだった。
元ownerのNNやmodel全hash処理を再実行したものではない。

## LoRA：管理60dでの6ケースの受領

```sh
mkdir -p "$RETURN_WORK/lora-dd95"
git archive dd95ed05f058930a391f015c11b9a2b963a42db5 \
  development/ai-connection/lora-p2-p3-consumer \
  docs/shared/inference/lora/P2_P3_ACCEPTANCE.md \
  docs/shared/inference/lora/CONNECTION_V2.md \
  docs/shared/inference/lora/MANAGEMENT_ADMISSION.md \
  | tar -x -C "$RETURN_WORK/lora-dd95"
python "$RETURN_REPORT/lora/verify-lora-return.py" \
  --repo "$RETURN_REPO" --received "$RETURN_WORK/lora-dd95" \
  --output "$RETURN_WORK/lora"
```

期待結果は249検査PASS。展開される37,764,410B JSONは既存gzipのlossless復元であり、新しいexportではない。
21取得path、9manifest、55source、DATA2原/deployment、22boundary、6caseの実取引tuple／phaseを照合する。
公開JSON16出力は固定参照・保存hashへ照合する。26 private artifact本体を新たに取得したとはしない。

canonical snapshot hash6件は、同じ原本serializerで確認する。

```sh
mkdir -p "$RETURN_WORK/lora/source"
git show 60d16b64d6020d3d20239f087f8add91268dcaad:docs/shared/ai-connection/canonical.mjs \
  > "$RETURN_WORK/lora/source/60d-canonical.mjs"
cp "$RETURN_REPORT/lora/verify-snapshot-hashes.mjs" "$RETURN_WORK/lora/verify-snapshot-hashes.mjs"
node "$RETURN_WORK/lora/verify-snapshot-hashes.mjs"
```

この受領照合は884の追加E4保存・読戻し／改変拒否／事前reference guardを実行しない。
dd95のactivation改変によるnative失敗と884のexpected改変によるprepare前拒否は、別条件のまま保持する。

## 新P4：候補source・WASM・公開receipt

```sh
python "$RETURN_REPORT/p4/verify-p4.py" \
  --repo "$RETURN_REPO" --received "$RETURN_WORK/p4-originals" \
  --output "$RETURN_WORK/p4"
```

未materializeの公開pathは固定Gitから作業先へ取得する。
期待結果は745検査PASS、50source13,352,427B、unique123file22,427,434B。
配布7ee／final5744／base8294のsource対応、全公開出力identity・事前gate・参照hashを照合する。
candidate moduleやprivate配列を実行しない。
旧固定N2の受入、実Text、canonical LoRA、新管理dispatch、全工程資源予算へ一般化しない。

## 差分と証拠の保持

`ROOT-VERIFICATION.json` は統合担当が配布用scriptを独立再実行した結果。
各receiptの検査件数はmetadata／読戻し検査であり、ownerのNN試験件数へ合算しない。
元の467回帰は既存scopeで再利用し、この受領作業のためにnative試験を繰り返していない。
固定実装・API・参照136pathが884／f34と同じbytesであること、旧N2 ADMISSIONが変更されていないことを確認する。
この作業の差分はdevelopmentの記録と受領検証scriptのみ。
受入範囲と残件は `RETURN-ADMISSION.json`、取得path・bytes・SHA-256は各ownerの取得receiptを参照する。
