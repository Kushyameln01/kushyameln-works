# P0 Diffusion owner宣言の対応結果

2026-10-31 JST。Profile/規範/数値規則の固定原本 `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`（版1.0-draft.1）と、Diffusion owner `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` の原本をGit objectsから取得して照合した。新計画のP0に対するDiffusion分であり、管理runtime導入やP2/P4の新規数値受入とは分ける。

公開handoffは `docs/shared/diffusion-models/profiles/p0-bindings.json` と [P0.md](../../../docs/shared/diffusion-models/profiles/P0.md)。4numeric/3mean/1generated依存の8record、関連12normを、native field path・固定source/build/kernel・全軸shape・既存gate/oracle/receipt・scopeへ結んだ。固定6daeの7JSONを原byteコピーし、catalog記載の長さ/hashと一致した。管理のnative採用pin438はowner5fから暗黙更新していない。

既存build52sourceの閉包と関連oracle/receipt、元F5出典を含むbaseline71assetを記録する。baseline整合試験で受領したcode/referenceは78file・13,429,937 B。候補commitを指定した場合の追加code実体は検証JSONに別計上する。元15.57GBモデルやLoRA payloadを読み直していない。旧数値PASSはfreshRun=falseとし、既存scopeのまま再利用した。

F5のgate不足は元F5 source `1317758bbba2b13603752d8c910ae2c6e77f78c5` のREADME/test/receiptを取得して補足した。元F5合成fixtureのmaxAbs≤2e-6と独立JS staged-F32全128値比較を確認し、F1/Rectや実VAE NNのgateとして転用していない。原本の完全path/bytes/hashと、5fで維持したF5回帰の別receiptはsidecar/evidence indexに保持する。固定catalogの旧未確認status自体は書き換えていない。

新規の整合境界は12case成功。旧kernelへの差替え、同128値のF5/Rect shape/export交換、台帳IDのnative化、PARTIAL/freshness/生成READYの昇格、catalog改変、入力hash待ち中のbuffer変更を拒否または所有copyで隔離した。gateだけ不足するケースは契約COMPATIBLEを保持してNOT_VERIFIED/BLOCKEDとして追跡できる。

独立レビューで、宣言内buildIdをprofile側と同時変更すると通る初期不足を再現した。`p0-build-identity-red.log` のRED後、ハッシュ検証済の実build-infoからBUILD_ID/BUILD_SOURCE_SHA256/BUILD_SOURCESをevalせず取得し、全sourceのcommit/path/digestを厳密に結ぶ検査へ修正した。欠落・重複closureと候補buildの偽識別も拒否する。生成済builderの記法以外を勝手にevalするfallbackは設けない。

generatedの台帳recordはVAE consumer契約であるため、Diffusion native restoration未実装と分離した。LoRA mappingはLoRA正本adapterへ委ね、Diffusion旧adapterは回帰専用。nativeが許可するcontext keyの範囲と、管理/codecが外側へ保全する任意metadataも明示した。

再現は `python tools/diffusion-models/build-p0-bindings.py`、`python tools/diffusion-models/test-p0-bindings.py`。新build sourceのcommit後は `--candidate-commit <完全SHA>` で候補欄を別記できる。これはcode/build観測だけで、baselineの数値receiptや管理採用を候補へ付替えない。

未受入は管理の新候補採用/P1、管理経由のP2/P3、実generated復元、全session、元production FP8精度、本番shapeと全工程資源予算。`load/predict/sample=NOT_READY`、generationReady=falseを維持する。新しい数値規則・判定器・LoRA mapping・NN再実行はこのP0成果へ含めていない。
