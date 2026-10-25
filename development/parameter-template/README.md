# VRCFT Parameter Template

固定Templateから v2/Parameter と 0/1/2/4/8/Negative を置換し、直接参照Clipを所有BlendTreeへ内包します。Tree間は別asset参照を保持し、毎回新GUIDで出力します。計算値と指定外の機能名は維持します。

`node development/parameter-template/test-core.mjs` で7生成と参照整合性を検査できます。
`python development/parameter-template/verify-output.py ORIGINAL.unitypackage OUTPUT.unitypackage v2/EyeLidLeft` は原本との許容差分とbinding CRC32、tar/gzipを独立検査します。原本は公開リポジトリに含めません。

Unity Import・VRChat実動作は未確認です。
