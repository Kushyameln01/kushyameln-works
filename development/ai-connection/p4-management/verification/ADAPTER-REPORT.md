# P4 adapter / E4 publisher 実装報告

2026-11-02 JST。root SPEC/PLAN Task2の4fileだけを実装した。source hash/bytesは`SOURCE-FREEZE.json`。

- `adapters/norm-required-p4-cross-ffn.mjs`: source brand、同期owned入力/capture clone、owner固有metadata bytesの5input hash、既存norm/evaluateEdge/queue、original factory/run終端、取消・stale拒否、release失敗quarantine、recover→new generationを管理する。factoryは外側bundle、owner.runはnative5keysのみ。
- `adapters/p4-cross-ffn/package.mjs`: manager semantic IDの25artifact、principal blockOutput、codec2bdのE4 write/actual filesystem readbackとrawF32 hash確認。output aliasは保存しない。外側provenance/lineage/trace、input mask/model/tokenizer metadata、opaque JSON/TypedArray extensionsを保持する。
- `test-norm-required-p4-cross-ffn.mjs` / `test-p4-cross-ffn-package.mjs`: 実loader/norm/queue/package/codecを使い、外部の重い数値ownerだけを明示boundary fixtureへ置いた。固定公開51sourceの実bytes proofと既存conditioning moduleのcapture/clone/snapshot/encodingを使う。

`conditioningMetadataBytes` capability追加はroot承認済み。owner encodingを再実装したりJCSへ置換したりしていない。通常のf76 JSON metadataはfieldを保持し、raw graphがJSONに載らない場合は既存owner encodingの全bytes/hashをopaque attachmentとして残す。返却`metadataStorage`は`rawJsonPreserved:false`と`operationalReplay:'NOT_VERIFIED'`を明示する。これをoperational replayや新しいnative受入へ昇格しない。非JSONのouter metadata/extensionは黙ってflattenせず拒否する。

最初のREDはmissing adapter/publisher、追加REDは同期snapshot・trace保持・owner循環metadata。packageのprovenance/lineageは共通capture helperがnative tensorから初期化するため、新publisherの明示outer sidecarを保存metadataへ戻した。共通helperは変更していない。

検証結果:

- focused最終: 20 tests / pass20 / fail0 / skip0（`comparison-modes-green.log`）。
- 関連回帰: 133 tests / pass131 / fail0 / skip2（`regression.log`）。skipは既存optional public54b codecの2ケース。採用codec2bdで新P4 package6ケースはskipなし。
- 調査時のNode child-process Git取得はEPERMとなったため、rootが固定Git bytesをmaterializeした`P4_NATIVE_SOURCE_ROOT`をread-only利用した。source verification自体は51件のSHA/bytesを実計算している。

新しい数値演算/LoRA mapping/参照/gate生成、private model fetch、実native/model runは行っていない。実Text P4 prior PASS/referenceが欠ける現在のcohortはfactory未呼出しで`COMPATIBLE / NOT_VERIFIED / BLOCKED`になる。K4 fixtureをnative Textへ付け替えていない。nativeText gateはowner提供numeric gateとprior PASSのgate一致を要求し、K4 gateをfallbackしない。

旧N2/P2/LoRA/native pins、generationReady:false、load/predict/sample=NOT_READYを維持。commit/pushなし。全AI接続suiteの最終実行はrootの統合freeze後の1回へ委任する。

Root audit追補: nativeTextの管理sidecar `comparisonModes`は明示`['composed']`または`['local','composed']`だけを受け、comparisonCount=25×mode数と実shapeの値数、priorOwnerPassの同じmode配列を結ぶ。欠落・local-only・逆順・重複・count不一致・prior不一致を、private input capabilityを読む前に拒否する追加RED→GREENを確認した。schema負例はtest-only宣言で、受領owner PASSや実数値を捏造したものではなくfactory0。既存fixtureは50比較scopeのまま。関連回帰133件はこの小変更前の記録で、最終full suiteはrootの全担当freeze待ち。
