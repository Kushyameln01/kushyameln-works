# LoRA normal transaction implementation plan

**Goal:** 独立expected/gateを要求しない通常weight取引をSDK・LoRA正本adapter・Diffusion native validate→commitへ通し、診断比較とcoverageを別に扱う。

**Architecture:** LoRAは原本hash/loader/fullshape/rangeとownerのsource/base適合記録、Hike完成F32を保証する。Diffusionは私有candidateの範囲充足・finite/hash/currentepochを通常検証し、診断modeだけが独立参照と実forward比較を行う。管理のguardだけを外す変更にはしない。

**Tech Stack:** ES modules、既存Hike kernel5051、Diffusion P4 sparse feed、Node tests、既存browser File/Chromium診断host。

**Spec:** 2026-11-02 JSTのユーザー指示『独立参照を要求しない通常取引』。baseline配布c4860579d01d9f704cb16714e364a22668f9d57e、旧実行a80db72feea60b9bd69e292e4716665c6f0ee77f。Diffusion旧consumer7eeと最新9d67561685173de6529d6f22e79088bb75a6a679にはnormalmodeが無いことを原文確認。nativeownerへPR14で共同契約を送付。

## Global constraints

- validationMode normal/diagnosticと実coverage PARTIAL/FULLを別fieldにする。旧Q16/v1/無指定v2の構造とplanhashを維持。
- normalはforward input/conditioning/run/expected/gateを不要にする。diagnosticの独立比較は既存基準を維持。
- 原本のtraining-base metadataは無い。ownerの既知sourceSHA/model/side/loader/fullshape/range bindingとregistryを照合し、名前・shapeだけで適合認定しない。unknownは理由付き未対応。
- 画像F/H/WをLoRA自身のportへ追加しない。mapping・数値演算・shape計算の既存ownerを複製しない。
- 不変base、SDK局所revision・管理revision・nativeepoch、commit直前current/abort、rollback権限、privatecopy/handle/lease寿命を維持。
- 4原本の再取得・全体hash再計算・oracle再生成を一律前提にしない。選択Fileの新loadに必要な検査は維持。
- 全target・他pair/side・任意shape・全model/生成・merge/Pages公開は自動追加しない。

## Implementation and verification

1. [x] 現在のSDK/adapter/nativeconsumer契約と最新peer sourceを取得。baseline Node106/106 PASS、skip0。
2. [x] SDK stageの任意validationMode拡張をTDD。未知mode、明示mode不一致、legacyboolean拒否、旧無指定/v1互換、取消/解放を確認。
3. [x] Diffusion owner48ff155988d995fc2569e495c8d8820273bd472cの正本を取得。native validate=構造admission、diagnose=独立比較、commit=private admittedAtEpochという契約を採用。独自native提案は未配布で廃止。source寿命はowner currentへ結ぶ。
4. [x] 正本P4 adapterのnormal/diagnostic分岐、normal単独factory、capabilities/assessSupportとcompact owner適合recordを実装。未知source/base/range/binding/variant/block等は明示拒否。
5. [x] 既存small control fixtureで通常適用・strength変更・base復帰・stale/取消・oldrollback・prepared寿命を検証。診断pathの既存gate互換を確認。
6. [x] 実lightLOW Fileと保持LOWbaseの既知crossQ4+bias4をnormalmodeで適用し、normalに独立参照を渡していないことを確認。通常出力は診断側の保存済みA/Bへ比較し、新oracle生成せず資源解放まで確認。
7. [x] API/通常結果/制限と詳細診断資料を分けて記録し、fixed source・evidenceの差を保ってfeat/lora-hikeへpush。Draft PR2とpeerへ契約/source/結果を返す。

## Review focus

- expected/gateを単に無視してnormalの自己採点に使わない。明示normalへdiagnostic入力を混入した場合を拒否。
- arbitrary sourceBindingsはowner設定として捕捉し、通常requestで上書きしない。trainingBaseVerifiedを偽装しない。
- candidateが通常検証された後にepoch/owner/abortが変わればcommit不可。旧rollbackが新feedを戻さない。
- package/manifestのcountだけで穴・重複・NaNやsource/base不一致を通さない。
- normal成功でPARTIALをFULL/generationREADYへ変更しない。数値receiptや全中間出力は診断資料へ。

## Owner source update

実装中にDiffusion正本48ffのsplit契約を取得したため、9d上に準備した独自native patchは未配布の対照に留めた。最終140/140 PASSは48ff正本で実行し、旧7eeの26/26回帰は別scopeで保持する。未配布native提案の18件をowner実装の試験として流用しない。
