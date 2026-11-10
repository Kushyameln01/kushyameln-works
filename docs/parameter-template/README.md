# Parameter Template 公開API

他のブラウザツールは、このAPIへParameter名を指定してください。内部のデータファイルを直接読み込んだり、内容ハッシュ・素材件数・出力名からRootの役割を推測したりする必要はありません。

```js
import {generateTemplate,isTemplateResult} from './api.mjs';
const target='Custom/EyeLidLeft'; // EyeLidLeft、v2/EyeLidLeftも指定可
const result=await generateTemplate(target);
if(!isTemplateResult(result,{target}))throw new Error('Invalid API response');
// result.bytes: Uint8Array（生成した実unitypackage）
// result.roots.binary / result.roots.smooth: {guid,fileId}
// result.rootFolder: {guid,path}
// result.treeCount / result.clipCount: 実際の生成件数
```

`apiVersion:1`は入出力形式の版です。`buildId`は生成器の版を記録する情報で、利用側で特定値との一致を要求しません。`validateTarget(target)`は入力検査、`isTemplateResult(result,{target})`は入力との対応・API形式・非空のbytes（最大128MiB）・非負の安全な件数・GUID/fileID・フォルダ情報を確認します。fileIDは数値へ変換せず10進文字列のまま扱ってください。

入力は`[文字・数字・_・-]{1,120}`を`/`でつないだ名前です。Unicodeの文字・数字を使用でき、`v2/`などの固定接頭辞は必須ではありません。空の成分、先頭・末尾の`/`、空白、`.`、制御文字等は受け付けず、入力のtrimや接頭辞の自動補完は行いません。例：`EyeLidLeft`、`Custom/EyeLidLeft`、`Other/Avatar/EyeLidLeft`、`v2/EyeLidLeft`。

生成器1.5.0から、Templateの`v2/Parameter`とそのBinary末尾を、入力した完全名と同じ末尾へ置換します。Clipの属性文字列と数値binding hashには同じ対応付けを使います。入力名に含まれる`Parameter`は再置換しません。`Decode/`・`Function/`・`Proxy/`・`Smooth/`の補助名では既存互換のため先頭の`v2/`だけを除き、その他の名前空間はそのまま残します。例えば`Custom/EyeLidLeft`からは`Custom/EyeLidLeft8`、`Function/Custom/EyeLidLeft`、`Smooth/Custom/EyeLidLeft_Function`を生成します。`v2/EyeLidLeft`の既存の補助名・配置・ファイル名は変わりません。

物理ファイル・フォルダ・表示名には補助名用の文字列を使い、その中の`/`だけを`%2F`へescapeします。これはParameter名とは別です。例の出力フォルダは`Assets/Custom%2FEyeLidLeft`、保存名は`Custom%2FEyeLidLeft.unitypackage`です。物理名のWindows予約名と、UTF-8で255 byteを超える生成ファイル名は拒否します。入力に`%`を許可しないため、namespaceのescapeが別の入力の`%2F`と混同されることはありません。既存の`v2/`互換により`v2/EyeLidLeft`と`EyeLidLeft`の物理名は一致します。同じ一括生成で指定すると、assemblyが出力パスの衝突を明示して停止し、黙って統合・改名しません。

データ読込み・生成・出力検査はTemplate側が担当します。データは生成時に`cache:'no-store'`で取得し、特定の内容ハッシュとは照合しません。schemaVersion1・templateRevision2の構造、GUID、Unity class、Binary・Smoothの両Root、Motion参照の解決は引き続き検証します。件数そのものを16・20・30等へ固定せず、現在の素材から計数します。

Rootの表示名や配置から役割を再推測せず、返されたGUID/fileIDを読み込んだpackageで照合してください。共有計算のbundleもこのAPIを外部importとして保持します。対応するTemplateデータ・生成器の編集で、利用側のハッシュ更新や生成器の再bundleは不要です。API形式そのものを変更する場合は、別途互換性を確認してください。

専用画面のWorkerと共有計算アダプターは同じ`generateTemplate`を呼びます。APIは新しいWorkerを内側で作成しません。共有計算へ割り当てる場合は既存の`parameter-template-generate`タスクを利用できます。生成内容のUnity Import・実動作の確認とは別の契約です。

生成器1.4.0から、`Binary_Root`の子Motionに既存の`Decode_Root`を接続します。追加する子のDirect Blend Parameterは`AlwaysOne`、Time Scaleは1です。既存の子MotionとClipの値を保持し、すでに同じ参照があれば重複追加しません。`Decode_Root`は別assetのまま参照し、Clipの再配置・複製はしません。元のTemplate JSONはrevision2のまま変更しません。

開発用の静的確認は`python tools/parameter-template/check-public-api.py`です。生成APIの回帰試験は`node --test tools/parameter-template/test-api.mjs`です。API導入時の確認は静的照合のみでした。1.4.0では生成APIと一括生成後の参照を実行検証しています。Unity Import・実動作の確認とは区別してください。

1.5.0の名前対応は静的確認のみです。外部実行用の`node --test tools/parameter-template/test-parameter-names.mjs tools/decode-smooth-builder/test-input.mjs`に、接頭辞なし・別namespace・従来のv2名・literal Parameter・Clip hash・境界・不正入力の未実行ケースを用意しています。
