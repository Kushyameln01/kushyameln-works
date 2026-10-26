# Parameter Template 公開API

他のブラウザツールは、このAPIへParameter名を指定してください。内部のデータファイルを直接読み込んだり、内容ハッシュ・素材件数・出力名からRootの役割を推測したりする必要はありません。

```js
import {generateTemplate,isTemplateResult} from './api.mjs';
const result=await generateTemplate('v2/EyeLidLeft');
if(!isTemplateResult(result,{target:'v2/EyeLidLeft'}))throw new Error('Invalid API response');
// result.bytes: Uint8Array（生成した実unitypackage）
// result.roots.binary / result.roots.smooth: {guid,fileId}
// result.rootFolder: {guid,path}
// result.treeCount / result.clipCount: 実際の生成件数
```

`apiVersion:1`は入出力形式の版です。`buildId`は生成器の版を記録する情報で、利用側で特定値との一致を要求しません。`validateTarget(target)`は入力検査、`isTemplateResult(result,{target})`は入力との対応・API形式・非空のbytes（最大128MiB）・非負の安全な件数・GUID/fileID・フォルダ情報を確認します。fileIDは数値へ変換せず10進文字列のまま扱ってください。

データ読込み・生成・出力検査はTemplate側が担当します。データは生成時に`cache:'no-store'`で取得し、特定の内容ハッシュとは照合しません。schemaVersion1・templateRevision2の構造、GUID、Unity class、Binary・Smoothの両Root、Motion参照の解決は引き続き検証します。件数そのものを16・20・30等へ固定せず、現在の素材から計数します。

Rootの表示名や配置から役割を再推測せず、返されたGUID/fileIDを読み込んだpackageで照合してください。共有計算のbundleもこのAPIを外部importとして保持します。対応するTemplateデータ・生成器の編集で、利用側のハッシュ更新や生成器の再bundleは不要です。API形式そのものを変更する場合は、別途互換性を確認してください。

専用画面のWorkerと共有計算アダプターは同じ`generateTemplate`を呼びます。APIは新しいWorkerを内側で作成しません。共有計算へ割り当てる場合は既存の`parameter-template-generate`タスクを利用できます。生成内容のUnity Import・実動作の確認とは別の契約です。

生成器1.4.0から、`Binary_Root`の子Motionに既存の`Decode_Root`を接続します。追加する子のDirect Blend Parameterは`AlwaysOne`、Time Scaleは1です。既存の子MotionとClipの値を保持し、すでに同じ参照があれば重複追加しません。`Decode_Root`は別assetのまま参照し、Clipの再配置・複製はしません。元のTemplate JSONはrevision2のまま変更しません。

開発用の静的確認は`python tools/parameter-template/check-public-api.py`です。生成APIの回帰試験は`node --test tools/parameter-template/test-api.mjs`です。API導入時の確認は静的照合のみでした。1.4.0では生成APIと一括生成後の参照を実行検証しています。Unity Import・実動作の確認とは区別してください。
