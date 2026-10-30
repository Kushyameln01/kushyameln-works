# DiffusionModels 現行の検証結果

現行は [revision 3の結果](REV3_RESULT.md)。全体を推測で認定せず、全体モデル推論も行わず、計画書の明示項目に沿って確認・部分実装を進めた。

- 独立TE/VAE・JS/Port・Hike使用を固定公開sourceと実制御で確認。
- Hike→ORT WASM→Hike、scheduler/CONST、wktensor保存/読戻し・境界、外部APIを実装・検証。
- load/predict/sampleはNOT_READY。元precision/全shape/全体負荷の合格にはしていない。

過去の7ea64f6時点の記録はHISTORY-0.1.md。
