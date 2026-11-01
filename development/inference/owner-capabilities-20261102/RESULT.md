# 通常owner能力照会とText/VAE実行

2026-11-02 JST。通常入口から構成済みVAEの完全shape・graph bindingと非対応理由を返し、Textの実L/mask/識別/最終正規化を取得できるようにした。通常実行は参照・gate・固定prompt hash・過去receiptを要求しない。既存Rectと固定plainの新しい通常実行で、既存独立参照に対する全値比較・保存読戻し・取消・解放を確認した。生成READYはfalseのまま。

## 配布と実行source

配布SHAはこの文書の固定Git URL/作業branch head。基点は`5b0da96b71708d56d3226a4bd4cb353aa30fbe3b`。同担当のremote headもこのSHAであることを着手時に確認した。mainは`029ce9336a61e53bc6172fa4a7b7189b15f2efa0`で、当担当の後続codec/受入/Text資源修正を含まないため自動mergeしなかった。

| 実行 | 完全source SHA | 範囲 |
| --- | --- | --- |
| 最初のharness起動 | `2013244a993b24e388771615edea966e81275c95` | Pythonイベントcallback登録で推論前に失敗。NN 0。owned live/zombie 0を確認し記録保持 |
| 新規の通常実WASM | `b2541fd2e3b7edcecd810f5215b1bd9f86afc0f4` | Rect取消/復帰encode/decode、Text plain一件、Text早期load取消、保存読戻しと全値比較 |
| 監視終了修正の実ブラウザ確認 | `94e1d5f2a28880a514bdec53059342a03e04a83f` | 推論0・Worker0で同じFile設定/能力照会/終了。sampler errors=0、owned live/zombie=0、2.6712秒 |
| 再利用した独立Text oracle | `5537b8932343aa2476b95191817e8913f99dab02` | 既存の未短縮full512 FP32参照。今回再生成0 |

通常NN実行後に修正したのは診断harnessの監視終了順序と推論なし確認optionだけで、production moduleや数値演算は変更していない。両source差分はharness一件、実配信production closure 16ファイルのbytes/hash一致を確認した。修正後の推論なし確認は別receiptへ分離した。servedSourcesには各固定sourceの取得path・bytes・SHA-256とcommitとのbyte一致を保持する。環境内の絶対pathだけを取得証拠にしない。

## API差分

- API版`works-ai-1`、文書revision`OWNER-CAPABILITIES-1`。既存`capabilities({operation,input})`を拡張し、VAEは設定したmanifestのencode/decode完全shape、dtype、NCTHW、意味、正規化条件、model/decoder、graph assetを返す。descriptorの検証は実dispatchと共通化した。
- `support={supported,code,reason,requiredChanges,scope}`で非対応理由を返す。構成契約との適合と`runtime[operation].verified`を分け、実asset SHA/ORT metadata/出力全次元を確認した操作だけ実行済みbindingを記録する。再configure/disposeで消す。Profile名allowlistや別shape計算器は追加しない。
- `configure({manifest,files,diagnostics=false})`。通常結果に詳細evidenceはない。診断UI/harnessは`diagnostics:true`で従来のevidenceを取得する。低層runVaeにも同optionを追加した。モデル/graphのhash検査を省略する変更ではない。
- Text通常結果は`{tensor,attentionMask,inputMode}`。plain L512とID入力Lを区別し、tensorに実L・float32/BLC・mask・model/Tokenizer・`normalization:'umt5-final-rmsnorm-f32-v1'`を保持する。Hike weighted RMSNorm、epsilon1e-6とmasked rows=0の数値処理は変更していない。
- VAE通常結果は`{tensor,inputDescriptor,binding}`。RGBになった後も外側inputDescriptorで元mean/sampleのproducer/decoder/restored契約・contextを保持する。raw mean・normalized mean・generated sampleの区別とDiffusionの数値復元責任は維持する。
- codecはText markerを保持する。旧markerなしファイルを読み、新markerを推測せず旧bytesを保つ。既存normalized marker、複数producer、decoder、frame/time/contextの保存は維持する。管理独自fieldをnative context/latentContractへ入れない。

## 通常実行の結果

今回の実構成はRect `wan21-raw-f32-1x16x32`。encode RGB `[1,3,1,16,32]`→raw mean `[1,16,1,2,4]`、decodeはその逆。両操作とも実graph metadataと返却shapeを確認した。同じ要素数で縦横を入れ替えた要求と、式上成立する81frame `[1,3,81,480,832]`をNN/Worker起動前に拒否した。manifestの式条件だけで別graphへ接続していない。

| 新しい通常出力 | 比較数 | maxAbs | 既存事前gate | 結果 |
| --- | ---: | ---: | --- | --- |
| Rect raw mean | 128 | 8.642673492431641e-7 | atol/rtol/maxAbs 2e-5 | 全値PASS |
| 同meanからのRect RGB | 1,536 | 3.334134817123413e-6 | atol/rtol/maxAbs 2e-5 | 全値PASS |
| plain Hello world | 2,097,152 | 3.069639205932617e-6 | atol/rtol/maxAbs 0.001 | 全値PASS、512 mask一致、mask0行厳密0 |

FP32診断経路の固定fixture受入であり、任意prompt・元GPU FP8/BF16・元Bernini conditioning全体の同等性ではない。Textは有効token3でも返却L=512。既存oracleをそのまま使い、別Profileのgateや合格を流用していない。今回ID入力の新しい実モデル推論や全512有効token性能検査は行わず、既存動作とlifecycle/metadata fixtureを保持した。

Textの保存ファイルは8,390,098 B、全体SHA-256 `9ba794d71142dd4741102c34ed1f8bc5b431dcbc27c3259c0bc5f0db17123dbd`。payload SHAは`6bb54eb36f06802f6ffa0b59edc2d515f24b5d40993a08a587348d9ee6537386`で既存数値出力と同じ。markerを追加したため旧ファイル全体hashとは異なる。Text/Rectの保存・読戻しでpayloadとmetadataの一致を確認した。8MiB payloadは非公開出力に保持し、Gitへ重複同梱しない。

## 取消・解放と資源

VAEは実running進捗で取消し、busy拒否後に再encodeを成功させた。Textの2回目は最初のgraph hash中、ORT session作成前に取消した。Textの24層完走は一件だけ。推論Worker 5件は全てterminate済み。完走Textはsession 24作成/24release、最大同時1、Tensor dispose 72、active 0。Rect完走encode/decodeは各session1作成/1release。各module dispose後の再実行・再configureを拒否した。

100ms sampled browser treeのphase peakは次のとおり。RSS和は共有pageを二重計上し得る。旧harness/別phaseの数字と比べて性能改善を認定しない。

| phase | RSS和 peak B | PSS和 peak B |
| --- | ---: | ---: |
| Rect recovery encode | 1,390,682,112 | 1,112,817,664 |
| Rect mean decode | 1,581,633,536 | 1,306,364,928 |
| Text full | 4,272,291,840 | 3,994,459,136 |

browser内phase区間はRect取消6.3454秒、encode3.6820秒、decode3.9041秒、Text full252.2199秒、Text取消5.3634秒。比較・保存を含む区間であり、純粋なNN時間ではない。helper全体274.7626秒。Textは引き続き重いgraph読込み/検証を行い、任意端末の資源予算を満たしたとは扱わない。

owned childは13 identityを観測し、途中のzombieとreap3件を区別した。終了後live=0、zombie=0、owner errors=0、HTTP server終了を確認した。観測に出なかった短命processまで捕捉したという意味ではない。

**生のharness集約結果はfalseのまま保持する。** 数値・通常API・保存・取消・session/Worker・owned child終了はPASSだが、ブラウザ終了後もRSS samplerを動かしていたため、complete phaseで消えたPIDを3回エラー扱いした。これを数値失敗や残存processとは混同しない。monitorをbrowserより先に止める修正と、モデル推論なしの実ブラウザ終了検証を別に記録し、実NNを再実行してこの履歴を隠さない。詳細は`diagnostics/normal-admission.json`、`normal-b2541fd-browser-results.json`、`normal-b2541fd-resource-measurements.json`を参照する。

## 再利用証拠・境界検査

元model/graph/manifest、Rect独立参照、Text full512独立参照、P2 updated884のmean保存/復元/decode・normalized markerの受入を元scopeで再利用した。新export0、oracle生成0、Diffusion全生成0。source/model/manifestの対応は`diagnostics/reused-evidence.json`に分けた。

新規owner境界8件、Text marker5件、既存接続12件、normalized marker6件、Text lifecycle10件とcontroller/外部API/VAE API/Hike/tensor検査を確認した。PythonはText14件、VAE10件、全体53件すべてPASS。引数必須の過去E6 CLIを誤って0引数起動した記録は診断側へ分離し、合格数に加算していない。独立レビューで見つかった疎配列shape/不正maskによる照会とdispatchの差はRED→GREENの回帰試験を付け、共通descriptor検証で修正した。

## 未受入と管理への返却

能力は**構成した固定graph**に限定する。従来の5×16×16、F1正方形16×16、Rect16×32の診断受入を保持するが、今回の新しい実モデル通常実行はRectとplain一件。81×480×832、実参照媒体のF/H/W・slot、任意ratio、実generated sampleと対応final decodeは未受入。異なるshapeには対応profile/graphを追加し、元前処理後寸法と当該gateで別に受け入れる必要がある。自動補完・縮小・frame削減を実装していない。

管理には[MANAGEMENT-HANDOFF.md](MANAGEMENT-HANDOFF.md)で既存descriptor/adapterとのfield対応と保存境界を返す。管理packageの実装と、外側inputDescriptor/owner/traceの永続化、横断executor直列化は管理側。管理別環境の取得・実adapter受入は送付側のself-checkと区別する。投影/cross-attention/FFN、生成sampleの数値復元はDiffusion側であり、本変更で重複実装していない。

再現は[REPRODUCE.md](REPRODUCE.md)、通常APIは[API.md](../../../docs/shared/inference/API.md)。作業branchへpush/Draft PRで配布し、merge/Pages公開は行わない。
