# 取得照合と既存P3 package読戻し

以下は保存済み公開bytesの照合だけを行う。新しいNN、モデルexport、原本hash、oracle生成、package生成、native prepareは実行しない。

```sh
python verify-receipt.py \
  --repo <repository-with-fixed-Git-objects> \
  --received <acquired-tree-with-repository-relative-paths> \
  --output <separate-verification-directory>
```

配布 `c4860579d01d9f704cb16714e364a22668f9d57e` のDELIVERY-MANIFEST全86pathとmanifest自身を、repository-relative階層を保って取得する。runtime a80、Diffusion7ee、管理884、codec2bdのGit objectも必要。verifierはPython標準library、Git、Node24を使い、source42件を固定Gitへ読み直して照合する。独立399＋76は既存の記録として点検し、P4配列の数値比較は繰り返さない。

verifierから次のhelperを呼び、追加公開された元P3 package8filesだけを実filesystemから読戻す。

```sh
node read-existing-p3-package.mjs \
  --repo <repository-with-fixed-Git-objects> \
  --received <acquired-tree-with-repository-relative-paths>
```

helperは既存884のreader／diagnostic schema宣言／codec module closure8件を一時directoryへGit byte exactで配置し、既存2bd codecのorigin/deployment一致も確認する。registryは既存diagnostic-package.mjsと保存済みextensionsのschemaを使い、新しいcodecやpackageを作らない。fresh `fs.readFile`でcomplete、output64 bytes、manifest/snapshot bindingを検査する。

負例は新しく読み出した返却byte cloneだけを変更する／snapshot結果を返さないreader wrapperである。元8filesを変更せず、前後hashも再確認する。正式なE4再import→native prepare入口やlive admissionは呼ばない。

最後に `ACQUISITION.json`、`VERIFICATION.json`、`CLASSIFICATION.json`、`P3-PAYLOAD-READBACK.json` を出力する。現在の結果は224/224 PASS。固定公開packetに直接再出力すると観測日時が変わるため、独立照合には別output directoryを使う。
