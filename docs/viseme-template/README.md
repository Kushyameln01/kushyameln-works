# Viseme Template

Mesh名称（初期値 `Body`）を入力し、「起動」→「unitypackageを保存」で生成します。
AnimatorからMeshまで階層がある場合は `Face/Body` のように相対パスを入力できます。
名前の空白・大文字小文字を自動変更しません。空欄・制御文字・不正な相対パスは拒否します。

## 出力

```text
Assets/Viseme/
  Viseme_Base.controller
  Viseme_none.anim
  BlendTree/
    aa.asset … sil.asset … th.asset（15個）
```

各BlendTreeは専用Clipを1個内包します。15個のTreeから共有される
`Viseme_none.anim` は直下に1個だけ保存し、全Treeがその同じClipを参照します。
`Animation`フォルダとAvatarMaskは出力しません。

Controllerの1 Layer・15 State・15 Entry遷移・15 State遷移、
Voice（Float）とViseme（Int）の宣言、初期値、fileID、配置を保持します。
元からController内にある空Clipと未参照StateMachineも保持します。
AvatarMask除外と外部GUID再割当以外のController本文は変更しません。
Clipは実行用・Editor用CurveのMeshパスとgenericBindingのパスCRC32だけを更新します。
BlendShape名、キー値、補間、Tree設定、StateのWrite Defaultsは保持します。

全出力ファイル・フォルダに新規GUIDを発行します。ファイル名・配置先はTemplateに基づく
固定名なので、既存の `Assets/Viseme` と同じパスになります。Import時の既存資産との
競合はUnity側で確認してください。GUIDの更新だけで既存パスとの共存を保証しません。

## 包括的ツールから呼ぶ

生成器がTemplateの読込み・検査を管理します。呼出し側はTemplate JSONの形式や
URL、GUID、固定件数を複製せず、公開APIまたはWorker clientを使用してください。

```js
import {createVisemeGenerator} from './client.mjs';
const generator=createVisemeGenerator();
try {
  const result=await generator.generate('Body',{inputRevision:1});
  // result.bytes: Uint8Array / result.fileName: Viseme.unitypackage
  // result.controller: {guid,fileId,path,...}
  // result.mapping: 元GUID→出力GUID/fileID/配置先、除外したAvatarMask
  // result.execution: jobId、inputRevision、generation、poolBuildId、実行metrics
  // result.treeCount / clipCount / embeddedClipCount / externalClipCount
} finally { generator.dispose(); }
```

既存poolを共有する場合は `createVisemeGenerator({pool})` を使います。
`cancel()` と `dispose()` は自分のジョブだけを取り消し、借用pool全体を終了しません。
同じclientの同時生成は拒否します。取消後は再実行できます。入力変更時は呼出し側で
取消と保存済み結果の失効を行ってください。dispose後は新しいclientを作成します。
`timeoutMs` は共有基盤の1〜30000 ms、既定30000です。

低位の共有poolへは以下を投入できます。

```js
const response=await pool.submit({
  protocolVersion:1,taskType:'viseme-template-generate',taskVersion:1,
  jobId:'viseme-1',inputRevision:1,payload:{meshName:'Body'}
}).promise;
// statusを確認してresponse.resultを回収。delivery-onlyなのでgetResultには保持しません。
```

結果は `kind:'viseme-template-package'`、`apiVersion:1`、入力名、package bytes、
出力参照・件数・対応表、生成器buildId、Template元ファイルSHA-256を含みます。
共有poolはmodule/bundle両方に対応します。入力は最大UTF-8 1024 byte、出力は4 MiBまで。
bytesはWorkerから所有権を移して回収します。結果を保持する場合の寿命管理は呼出し側の責務です。

専用Worker内などでは `generateVisemeTemplate(meshName='Body')` を `api.mjs` から
直接呼ぶこともできます。このPromise APIは自動ダウンロードしません。
中断には任意の `{signal}` を渡せますが、同期生成中のCPU停止にはWorker終了が必要です。

## 実装・確認範囲

既存Hike/WASMの `FtCrc32Step` でMeshパスのBinding値を計算し、テキスト編集と
GNU tar/gzipは既存JavaScript hostで処理します。共有poolの既存ABIを使い、
新しいWASMや常駐Workerは追加しません。Templateの元ファイルは
SHA-256 `c0d6510bf1fcd0cb806924a556c91c042aa6da0858785b6015b9b0dedfe20f77` です。

Template更新時はproducer内の `template.json` と検査hash・変換条件を一緒に見直します。
共有pool adapterはTemplate内部のhashや件数を固定しません。

試験: `node --test tools/viseme-template/test-*.mjs`。
独立したpackage検査: `python tools/viseme-template/verify-output.py SOURCE OUTPUT --mesh Body`。
Unity EditorへのImport・型認識・VRChat実動作はブラウザ検証の対象外で、未確認です。
