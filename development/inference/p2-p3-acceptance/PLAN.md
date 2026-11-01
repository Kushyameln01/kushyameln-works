# P2・plain比較・conditioning・P6準備

2026-11-01 JST。基点3571c5fe8a4b2c3a31754607e424e64d24d798e5、作業branch codex/p2-p3-plain-acceptance。

## 取得した正本と境界

新計画1.0-draft.1、総合仕様1.1-draft.2、既存実行計画0.2-draft.3、Profile台帳/規範/数値規則1.0-draft.1を参照。規範sourceは6dae9a6fac3e9ad29ea941f22211edbe4aa894ad。管理runtimeは60d16b64d6020d3d20239f087f8add91268dcaad、既存P2 native VAEは855f435120f08eb9e818e51281fc26f0e2633829、採用storage codecは2bdca59ea78580d4fe7a9d31a8de33209b64d029。数値mean operationは既存Diffusion5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3。新P4 tail508d72cc9036e7f500827465c644b4aed3c5f711とは別のoperator sourceとして保持する。

## 実行順と完了条件

1. source取得・実byte/hash、対象input/reference/gate、current resource budgetを固定。管理のcodec/manifest receiver ACKは取得済みscopeで保持し、新NNや新conditioningの受領証拠へ転用しない。
2. plain専用計画の独立oracle/full512→既存plain API/実WASM→全2,097,152値比較→取消/終了を直列実行。P2実NNと並行しない。gate/Tokenizer/最終normの出典を保持。
3. 実Rect raw mean128値を既存owner Hike normalizeへ渡し、採用codecと実管理E4でnormalized markerを保存・読戻す。owner Hike restoreを回収tensorへ適用し、全128値と既存の同じ復元meanを照合。VAE側に数値復元を実装しない。
4. 同じ復元meanを新管理の規範必須入口からnative855へ渡す。既存decode3assetで新たに実decodeし、RGB1536値を既存独立参照・事前gate2e-5と比較、実管理capture→disk保存→回収を確認。normal decodeと対象取消/復帰は別のfresh directory。encode/export/参照再計算はしない。
5. Textの実conditioningをnative .wktensor/mask・元text・model/Tokenizer・参照/gate/受入receiptと共に渡す。raw Text4096とDiffusion側の投影/KV、固定self-attention tailの非対応を分ける。P3 LoRA全体またはcross-attention本番消費済みとはしない。
6. P6は実source/reference/slotとworkflow処理grid・最終decodeを分け、必要shapeと未取得理由を記録。既存3診断profileを実媒体の代用にしない。不足profileの準備までとし、P5前のgenerated sample decodeを受け入れない。
7. 実行sourceを固定して実施し、成果/再現・原本/graph識別・全値/資源/終了・未受入を配布。GitHub push後に相手が利用する固定sourceの取得確認を照合。自担当cloneを相手ACKにしない。merge/Pagesは別工程。

## P2の事前固定

- profile wan21-raw-f32-1x16x32、mean[1,16,1,2,4]、RGB[1,3,1,16,32]。F5の同128要素に置換しない。
- 元raw input file SHA8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8、payload289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3。
- 同復元mean file SHA dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612、payload71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063。
- mean往復gate2e-6。RGB独立reference SHA44cf55e9ea5896f985a0ccf26f61cbb52650fd1a53d3fe80fc3e03aaae545c29、1536値、atol=rtol=maxAbs=2e-5。manifest既定.002とは別の事前受入gateを維持。
- current deviceはcgroup RAM16GiB、CPU4core枠。P2は旧同profile sampled peak RSS約1.62GBを根拠に2GiBを事前見積りとし、task budget8GiBを明示する。予算は動的readinessで、数値gateではない。実測peakと推定を混ぜない。
- source/ref/graph/codec hash、request/revision/resource generation、所有buffer、Promise終端、Worker close、session、子processのPID+ctime/live/zombie、peak/timeを保持。profile/model/producer識別を便宜的に付け替えない。

## 既存証拠の保持

原本・graph・旧manifest/receiptは変更しない。新sourceに旧実行を付け替えず、Text ID比較をplain比較に流用しない。既存source/reference/Norm/bridgeを第二の数値実装で置換しない。新しいgate・縮小/padding/frame削減・weights公開・自動merge/Pages公開は追加しない。
