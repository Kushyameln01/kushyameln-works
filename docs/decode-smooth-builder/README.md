# Decode / Smooth 一括生成

Parameter名を1行に1つ指定し、「生成する」→「unitypackageを保存」で一括生成します。名前は変更せず、空行は無視し、不正な名前や重複は行番号とともに表示します。処理はページを開いている間のブラウザ内で行います。

既存の共有計算poolにTemplate生成とParameter Registrarを割り当て、実際の中間unitypackageを生成します。Tree・ベースController・Safetyの生成後は、専用画面と同じ[Animator Integrator共通API](../shared/animator-integrator/README.md)と専用Workerで統合します。途中の手動アップロードは不要です。

```js
import {createDecodeSmoothBuilder} from './pipeline.mjs';
const builder=createDecodeSmoothBuilder({onProgress:console.log});
try {
  const result=await builder.build(['v2/EyeLidLeft','v2/EyeLidRight'],{inputRevision:1});
  // result.archive: Uint8Array / result.fileName: DecodeSmooth.unitypackage
  // result.summary: 最終packageを再読込みした件数
  // result.integratorReport: 専用APIが返した参照・Layer対応表と検証結果
  // result.intermediates: 元Template・Registrar・Tree・ベース・Maskの実package
} finally { builder.dispose(); }
```

`cancel()`はこの操作が所有する共有poolと専用Workerを終了します。入力変更・取消・画面離脱で古い結果の保存リンクを失効させます。公開用のHTTPサービスや常駐処理は作成しません。

## 出力設定

- 中間素材を`Root_DecodeSmooth`配下にまとめます。`Root_BinaryParameter`と`Root_Smooth_Parameter`のDirectTreeは正規化を無効にし、各childのWeightを`AlwaysOne`とします。
- 全入力ControllerのLayerを保持し、その後ろへ2個のTree用Layerを追加します。Registrarが1名称につき1Layerの現行構成では、最終Layer数は名称数N＋3です。生成されたRegistrarの空Layerだけに、APIの`layerNames`で`Parameters 1`等の名前を明示指定します。
- 新設2StateはWrite Defaults On、全LayerはWeight 1とSafetyを使用します。SafetyはHumanoid全13項目を不許可とし、Transform・ImportRigを追加しません。
- 初期値はIntegratorの中央規則を使用します。`AlwaysOne`はAnimator・Expression両方でFloat・1、完全一致の`EyeLidLeft`・`EyeLidRight`・`EyeLid`はFloat・0.75です。ExpressionからAnimatorへ値を推測して反映する処理はありません。
- 今回のRegistrar入力設定は`defaultValue:0, saved:false, networkSynced:false`です。IntegratorのBinary用規定により、末尾がASCII数字（0〜9）または大文字小文字を区別する`Negative`の名称はExpressionの同期Onになります。続いて、既定ONの独立したVRCFT5値域規定を適用し、`Negative`末尾について元Parameterの公式値域が0〜正の数なら同期Off、負の数〜正の数ならOn、値域不明なら追加変更なしとします。例えば`v2/EyeLidLeftNegative`はOff、`v2/JawXNegative`はOnです。Saved・型・初期値規定と数字末尾の同期Onは維持します。一括生成側に別の同期判定は追加しません。正規化後の同期量がVRChatの256bit上限を超える場合は生成を止め、エラーを表示します。

保存名は`DecodeSmooth.unitypackage`です。統合Controllerは`Assets/DecodeSmooth/Controllers/DecodeSmooth_fx.controller`、ExpressionParametersは`Assets/DecodeSmooth/Parameters/ExpressionParameters.asset`にあります。ExpressionParametersには対応するVRChat SDKが必要です。

Integratorは出力GUID・fileIDを再割当し、参照を変換します。最終構成から到達するMotionとMaskを引き継ぎ、未参照のMotionは省きます。中間packageの全素材数と最終出力数は一致しない場合があります。対応表と実出力に基づき、必要参照・Tree設定・Clip曲線・Mask設定を検証します。汎用Integratorへの任意入力対応をこの一括ツールの検証結果から保証するものではありません。

Layer0はEntryから空の子StateMachineへ進む構造です。AnimatorState・Clip・Motionは新設せず、AnimatorState型の`m_DefaultState`は0です。UnityへのImport、VRChat実動作、Layer0が運用先でEmpty判定されないことは未確認です。

## 開発・検証

ソースをHTTP配信し、`decode-smooth-builder/`を開きます。通常の利用にnpmや再ビルドは不要です。共有Worker bundleを変更する場合は、既存の固定版ビルド手順`node tools/shared-compute/build-worker-bundle.mjs`を使用します。

新規検証は`tools/decode-smooth-builder/test-*.mjs`です。`check-browser.py`は実ChromiumとPlaywrightで生成・保存・取消・両Worker方式を確認し、`verify-output.py`は生成コードをimportせずにgzip/tarとUnityテキストを独立に読み戻します。Unity実動作の試験とは別です。

VRCFT5値域規定の追加について、Codex内では構文・公式規定データ・適用順・参照の静的確認のみ実施します。動的検証はCodex外部で行う前提です。外部実行用の`tools/decode-smooth-builder/test-integration.mjs`と`verify-output.py`も新規定に合わせています。旧Binary用規定だけで作られた出力を照合するときは、後者に`--binary-only`を指定してください。
