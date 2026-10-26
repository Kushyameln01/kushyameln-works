# VRCFT Parameter Template

生成器1.4.0では、下記revision2の原本保持と文字列変換に加え、生成時に`Binary_Root`から既存`Decode_Root`へDirect childを1本追加します。Weightは`AlwaysOne`、Time Scaleは1です。元のJSON・既存の子・Clip値・asset配置を変更せず、Tree間参照だけを追加します。すでに接続済みの場合は追加しません。出力は引き続き16Tree・30内包Clipで、Motion参照は48本です。

旧生成物との独立比較は`python3 development/parameter-template/verify-binary-connection.py BEFORE.unitypackage AFTER.unitypackage`でも実行できます。パスで対応付けて新規GUIDだけを正規化し、追加した1本を除く本文・meta・全Clipフィールドの完全一致を検査します。

ツール1.2.0は、Template revision 2を使用します。変更していない原本から、Clip・BlendTreeの次の文字列値を完全一致で一度だけ置換して同梱しています。

| 原本の値 | 改訂Templateの値 | 入力v2/Xでの生成値 |
|---|---|---|
| `v2/Parameter` | `Decode/Parameter` | `Decode/X` |
| `Smooth/Parameter` | `v2/Parameter` | `v2/X` |
| `Smooth/Parameter_Function` | 保持 | `Smooth/X_Function` |
| `v2/Parameter0`、`1`、`2`、`4`、`8`、`Negative` | 保持 | `v2/X0`、`1`、`2`、`4`、`8`、`Negative` |

新しく作られた`v2/Parameter`を再び`Decode/Parameter`へ変換しません。`Smooth/Parameter_Function`のprefixも変えません。改訂時にはClipのFloat/Editor曲線属性と対応するCRC32 bindingを更新します。

生成時は従来どおり、同梱TemplateのClip・BlendTree内の文字列値に含まれるParameterを、入力v2/XのXへ置換します。Function・Proxy等もこの名称置換の対象です。Unityのフィールド名、計算値、Parameterを含まない機能名は維持します。表示名の規則、UI、入力条件は変更していません。

直接参照Clipを所有BlendTreeへ内包し、Tree間は別asset参照を保持します。Assets/X直下にX_Binary_Root.assetとX_Smooth_Root.assetを置き、他14TreeはX_Childフォルダへ格納します。16Treeと2folderは毎回新GUIDで出力します。

`template.json`の`sourceSha256`は変更していない原本のhashです。改訂JSON自身のhashではありません。`templateRevision: 2`と`valueRemap`に改訂を記録します。coreは旧revisionのTemplateを拒否します。

## 再生成と検証

既存の抽出scriptがなかったため、`extract-template.py`を追加しました。固定SHA-256の原本を読み、16Treeと直接参照20Clipだけを抽出します。原本へ書き込まず、archive memberもファイル展開しません。原本は公開リポジトリに含めません。

```bash
python3 development/parameter-template/extract-template.py ORIGINAL.unitypackage
python3 development/parameter-template/extract-template.py ORIGINAL.unitypackage --check
DECODE_TEST_OUTPUT=/tmp/parameter-template-check node development/parameter-template/test-core.mjs
python3 development/parameter-template/verify-output.py ORIGINAL.unitypackage /tmp/parameter-template-check/EyeLidLeft.unitypackage v2/EyeLidLeft
```

抽出先の既定は`docs/parameter-template/template.json`です。`--check`は書き込まず、原本から導いた改訂Templateとのbyte一致を確認します。Nodeでは固定の改訂期待値・CRC32と7生成を検査します。独立Python比較は抽出script、JavaScriptの生成処理、同梱JSONを使わず、原本から今回の完全一致置換と従来の名称置換を導いて、全フィールドの許容差分、binding CRC32、参照、tar/gzipを検査します。

Unity Import・VRChat実動作は未確認です。
