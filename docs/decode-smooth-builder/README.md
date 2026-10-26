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
- 出力Layerは`Base Layer`・`Root_BinaryParameter`・`Root_Smooth_Parameter`の3層です。名称数によらず、Registrarの登録用Layerは生成時の統合対象から外します。生成した空・非同期Layerであることを元packageで確認し、共通APIの`parameterOnlyControllerIds`へRegistrarのControllerだけを明示指定します。除外Layerの空root StateMachineも最終Controllerへコピーしません。Animator Parameter宣言・Clip・BlendTree・Mask・無関係な内蔵データは保持し、LayerをWeight 0などで無効化する処理や、一般の空Layerを自動削除する処理は行いません。
- 新設2StateはWrite Defaults On、全LayerはWeight 1とSafetyを使用します。SafetyはHumanoid全13項目を不許可とし、Transform・ImportRigを追加しません。
- 初期値はIntegratorの中央規則を使用します。`AlwaysOne`はAnimator・Expression両方でFloat・1、完全一致の`v2/EyeLidLeft`・`v2/EyeLidRight`・`v2/EyeLid`はFloat・0.75です。ExpressionからAnimatorへ値を推測して反映する処理はありません。
- 今回のRegistrar入力設定は`defaultValue:0, saved:false, networkSynced:false`です。IntegratorのBinary用規定により、末尾がASCII数字（0〜9）または大文字小文字を区別する`Negative`の名称はExpressionをBoolで登録し、同期Onになります。Animator側の型は保持します。Bool化では初期値の数値を保持し、0・1以外の初期値は丸めずエラーにします。続いて、既定ONの独立したVRCFT5値域規定を適用し、`Negative`末尾について元Parameterの公式値域が0〜正の数なら同期Off、負の数〜正の数ならOn、値域不明なら追加変更なしとします。例えば`v2/EyeLidLeftNegative`はOff、`v2/JawXNegative`はOnです。Saved・Binary対象外の型・初期値規定と数字末尾の同期Onは維持します。一括生成側に別の同期判定は追加しません。正規化後の同期量がVRChatの256bit上限を超える場合は生成を止め、エラーを表示します。

保存名は`DecodeSmooth.unitypackage`です。全出力を親フォルダ`Assets/Merged_DecodeAndSmooth`へまとめます。元の`Assets/X/Y`は`Assets/Merged_DecodeAndSmooth/X/Y`へ配置し、すでに同じ親配下にある入力へは重ねてprefixを付けません。既存の同親フォルダがあればそのGUIDを再用し、なければ親フォルダ1個だけに新GUIDを作成します。

統合Controllerは先頭に指定したベースController、ExpressionParametersは先頭に指定したExpressionの元ファイルを使用し、元の相対階層・ファイル名・GUID・m_Name・root fileID・metaを保持します。現在の一括生成では、ベースは`Assets/Merged_DecodeAndSmooth/DecodeSmooth_Base.controller`、Expressionは最初のRegistrarが出力したファイルです。保存名を既存Assetの名前へ転用しません。ExpressionParametersには対応するVRChat SDKが必要です。

Integratorは、assembly後に受け取ったMotion・Mask・参照素材・フォルダを元ファイル単位で保持します。上記の親フォルダ配置だけをpathの変更として認め、元の相対階層・GUID・meta・Asset本文、内包Clipの同居先・fileID・表示名・document順序を維持します。未参照のTree・Clipやopaqueな素材も省略しません。`Source/Clips`等への分離、hash付きファイル名への変更、既存ファイルへの新GUIDの発行は行いません。Controller統合で追加元のState構造IDが衝突する場合だけ、その構造IDの変更を対応表へ記録します。先頭Controllerの既存構造IDとMotionのIDは保持します。追加Controllerの内包Motionなど、統合と元ファイル保全が両立しない入力は、対象を示して停止します。

保全の比較元は`result.intermediates.motionPackage`です。Template生成時のパラメータ名置換・新GUID発行・Clip内包と、その後のassemblyによる`Root_DecodeSmooth`配下への配置はIntegratorより前の工程です。assembly後の全entryを比較し、pathには独立に導出した親フォルダprefixだけを認めます。例えば`Assets/Root_DecodeSmooth/X/Y`の出力は`Assets/Merged_DecodeAndSmooth/Root_DecodeSmooth/X/Y`です。assembly前のTemplate pathを最終出力との比較元にしません。ControllerとExpressionの統合対象ファイルは内容が変わるため、それ以外の全入力ファイルと分けて検査します。汎用Integratorへの任意入力対応をこの一括ツールの検証結果から保証するものではありません。

Layer0はEntryから空の子StateMachineへ進む構造です。AnimatorState・Clip・Motionは新設せず、AnimatorState型の`m_DefaultState`は0です。UnityへのImport、VRChat実動作、Layer0が運用先でEmpty判定されないことは未確認です。

## 開発・検証

ソースをHTTP配信し、`decode-smooth-builder/`を開きます。通常の利用にnpmや再ビルドは不要です。共有Worker bundleを変更する場合は、既存の固定版ビルド手順`node tools/shared-compute/build-worker-bundle.mjs`を使用します。

外部実行用の検証は`tools/decode-smooth-builder/test-*.mjs`です。`test-integration.mjs`は、元のGUID/path/meta/Asset本文を直接比較し、未参照Motion・opaque素材・フォルダ・Clipの内包構造も検査します。Motionの識別子や参照を正規化して差を消す比較は使用しません。`check-browser.py`は実ChromiumとPlaywrightで生成・保存・取消・両Worker方式を確認し、`verify-output.py`は生成コードをimportせずにgzip/tarとUnityテキストを独立に読み戻します。Unity実動作の試験とは別です。

独立した保全比較では、最終packageに加え、同じ実行で回収した`integrator-report.json`、`source-motion.unitypackage`、`source-base.unitypackage`、`source-mask.unitypackage`、`registration-*.unitypackage`を使用します。`verify-output.py final.unitypackage --targets N --report integrator-report.json --sources-dir <回収先>`で全入力との比較を行います。`template-*.unitypackage`や別の画面操作で保存した最終出力は比較元に混ぜません。

以前の保全修正時点の確認は静的照合のみでした。3層出力への変更（`decode-smooth-integrator-3`）の検証範囲は[変更記録](../../development/decode-smooth-layer-output/RESULT.md)に記載します。Unity Import・VRChat実動作の受入とは区別します。VRCFT5値域規定をOFFにした出力を外部で照合するときは、`verify-output.py`に`--binary-only`を指定してください。Binary対象のBool登録はOFF時も適用します。

BuilderのBase Layer／No Animation／Entry TransitionとRegistrarのStateMachineは`HideInHierarchy`を有効にして生成します。Layer0のEntry→No Animation構造は保持します。非表示設定と、除外した登録用Layerの空StateMachineを出力しない処理は別です。
