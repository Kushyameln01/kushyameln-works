# VRCFT Parameter Template

固定TemplateのClip・BlendTree内の文字列値に含まれるParameterを、入力v2/XのXへ置換します。v2系のbinary suffix、Smooth、Function、Proxyも対象です。Unityのフィールド名、計算値、Parameterを含まない機能名は維持します。

直接参照Clipを所有BlendTreeへ内包し、Tree間は別asset参照を保持します。Assets/X直下にX_Binary_Root.assetとX_Smooth_Root.assetを置き、他14TreeはX_Childフォルダへ格納します。16Treeと2folderは毎回新GUIDで出力します。

`node development/parameter-template/test-core.mjs` で7生成と参照整合性を検査できます。
`python development/parameter-template/verify-output.py ORIGINAL.unitypackage OUTPUT.unitypackage v2/EyeLidLeft` は原本との許容差分とbinding CRC32、tar/gzipを独立検査します。原本は公開リポジトリに含めません。

Unity Import・VRChat実動作は未確認です。
