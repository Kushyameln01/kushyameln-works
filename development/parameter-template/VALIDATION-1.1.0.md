# Parameter Template 1.1.0 公開検証

2026-10-25 JST。今回の追加指示により、Clip・BlendTreeの全Parameter文字列値を置換する。前版で保持したProxy・Function・Smooth系も対象。Unityフィールド名、計算値、接続は保持する。

出力はAssets/X直下にX_Binary_Root.asset、X_Smooth_Root.asset、X_Childフォルダ。他14TreeはX_Child配下。Clipは所有Tree内、Tree間は外部参照。16Treeと2folderへ新GUIDを発行する。

- Pages実装commit: 8d9fdf1387164bb9800f63d03994044333e5084c
- Sites version92 / source: 590ec855bd0f5f6ed4d8ac691cc7ea0a88f57d3c
- Node7生成、独立Python6対象合格。ParameterTestの二重置換、日本語CRC32、全曲線属性、2Root/14Child配置を検査。
- 独立コードレビュー・要件監査に公開を止める指摘なし。
- Sites build: 332承認静的ファイル/388 artifact files。公開変更はcore.mjsとindex.htmlのみ。Pagesの厳密exportも通過。
- 公開Pagesの変更2ファイルはHTTP取得bytesと承認ソースが一致。
- 両公開HTTPS画面のCloud browserで実入力・生成・ファイル回収後、独立Pythonで原本全フィールドと比較。18entries、30内包Clip、47Motion参照、全Parameter値、CRC32、GNU tar/gzip、新GUID、数値保持に合格。

|環境|対象|実ダウンロードSHA-256|
|---|---|---|
|Pages|v2/EyeLidLeft|158da68b00d610b2095ff111f18c5cc24e8221e7b4f7d35e6a3f8ad0b0ef48be|
|Sites|v2/JawOpen|829b13c1727d2e8ceec2a69fde93eedde97b11b2a2d41e67be5eed02d939cc22|

Unity ImportとAnimator/VRChat実動作は未確認。前版の旧relocation検査はVALIDATION.mdを参照。本改修では共有WASM/loaderを変更していない。画面のAX状態は新説明・生成完了を確認済み。画面画像は共有領域への同期に失敗したため、この記録には添付しない。
