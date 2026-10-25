# Parameter Registrar API 1

UnityPackage内部に実在する全AnimationClip（class74）・BlendTree（class206）から使用Animator Parameterを集め、新規の最小AnimatorControllerとVRCExpressionParametersを生成するブラウザ用モジュールです。画面は [Parameter Registrar](../../parameter-registrar/) にあります。

Controller・ExpressionのParameter宣言、State・Transition・Driverは入力情報に使いません。拡張子と参照到達性で対象を絞らず、Controllerと同じファイル内のBlendTreeや孤立Clipも処理します。パッケージ外のMotionを取得しません。FBX等のImport時にUnityが生成するClipを再構成する機能ではありません。

## Browser client

```js
import {createComputePool} from '../compute/client.mjs';
import {createParameterRegistrar} from './client.mjs';

const pool = createComputePool({concurrency: 2, moduleReuse: true});
const registrar = createParameterRegistrar({pool});
try {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const collected = await registrar.collect(bytes, {inputRevision: 1});
  const output = await registrar.generate(collected.parameters, {
    name: 'Parameters', defaultValue: 0, saved: false, networkSynced: false,
  }, {inputRevision: 1});
  // output.archive: Uint8Array; output.fileName: *.unitypackage
} finally {
  registrar.dispose(); // このclientの処理だけ終了。借用poolは終了しない。
  pool.dispose();      // poolの所有者が、他の処理も終わってから終了。
}
```

- `collect(bytes, {inputRevision=0, onProgress}={})` → `{version:1, parameters:[{name,type:'Float'}], clipCount, blendTreeCount}`。
- `generate(parameters, settings={}, {inputRevision=0}={})` → `{archive, fileName, parameterCount, bitCost}`。
- `cancel()` はこのclientのscannerと共有pool内の自jobだけを取り消します。PromiseはAbortErrorで終了します。
- `dispose()` 後の再利用はできません。引数なしで作ったclientは自分のpoolも終了します。
- 同じclientで同時に一つの操作を実行します。入力変更時は取消し、revisionを更新し、旧ダウンロードを破棄してください。

返す名前集合と件数は登録に必要な中間値です。全件の使用箇所・出典・coverageレポート、解析レポート保存APIはありません。

## 抽出と生成

BlendTreeは種類に応じて実使用の軸またはDirect Weight名を収集します。Clipは通常のAnimator Float runtime curveとClip自身のbindingを、既存Hike/WASMのAnimatorHashで照合します。Transform・blendShape・特殊Animatorカーブを一律にParameterへ登録せず、Editor曲線の重複を合算しません。整数・参照カーブ、圧縮Clip、対応を確認できない特殊binding、バイナリ対象は黙ってスキップせずエラーにします。

型は対応する使用箇所のFloat制約によります。カーブ値0/1からBoolへ変換しません。初期値・Saved・NetworkSyncedは元宣言や先頭キーから復元せず、新規生成設定として指定します。既定は `0 / false / false`。Float初期値は-1〜1、同期Floatは1件8bit、合計256bitまで、登録は8192件までです。VRChat組込み名はExpressionへ登録できないためエラーになります。

出力名は半角英数字・`_`・`-`の1〜64文字です。出力は `Assets/<name>/` フォルダと、新しいGUIDを持つController／ExpressionParametersの2アセットだけです。Controllerは空のBase Layerを持ち、再生StateやMotionを複製しません。生成元アセットは変更しません。Expressionの利用先にはVRChat SDKが必要です。

## 共有計算と制限

入力展開はclient専用Workerで行い、対象documentだけを8MiB未満のJSONバッチへ分けて既存共有poolに投入します。共有taskは `parameter-collect`／`parameter-generate`、`protocolVersion:1`／`taskVersion:1`。通常は上のclientを使ってください。

package readerは既存Composerと共通です。圧縮入力128MiB、展開1GiB、単体アセット128MiB、メタデータ32MiB、保持対象document合計256MiB等の既存上限を検査します。1documentのJSON搬送が8MiBを超える場合も、対象を示して失敗します。対象全件を処理できないまま部分成果物を生成しません。外部Motion未提供だけでは失敗しません。

Module/bundle Worker双方へ登録し、既存FTの検証済みWASMを使用します。clientから呼出元pool全体をcancel/disposeしません。レポート生成や、処理中に外部へ入力を送信する機能はありません。

## 検証範囲

Nodeのコア・共有pool試験と、ブラウザでの入力→実出力回収→独立読戻しを別々に確認します。Unity Import、VRChat内での実動作は、ブラウザや静的読戻しだけでは確認できません。Sitesへの反映は今回保留です。
