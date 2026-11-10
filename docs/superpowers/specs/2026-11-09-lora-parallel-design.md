# 既存LoRAの並列計算拡張 — 設計案

版: 0.3 / 更新: 2026-11-10 JST / **設計承認待ち・実装前**

基準: Works `36b28b18ede71122e94bc1b3d5802b0369f7d937`。v0.2へのユーザーレビューを反映。

## 1. 利用者の目的と完成条件

最終目的は、DLP-LoRAの並列計算を参考に、Kushyameln Worksで利用者が行うLoRA適用・推論の待ち時間を短くすること。公開先は既存の `Kushyameln01/kushyameln-works`、既存LoRAモジュールの拡張として実装する。ユーザーは複数Workerの並列計算を含む方式を選択した。

完成条件には、**通常の生成管理画面で実行設定を選び、実モデルに結ばれたLoRA adapterへその設定が届き、実操作で効果を確認できること**を含める。LoRA単独画面や計算benchmarkだけの完成で代替しない。並列経路は実装・通常経路への接続まで行い、inlineが一部条件で有利でも省略しない。

数値結果、入力範囲、所有権と取消等の必要な互換性を保ち、cache配置・計算境界・Worker数は目的に応じて選ぶ。新しいLLM分類器、top-p選択、学習、ブラウザ操作エージェントは対象に加えない。

## 2. 検証した現状とv0.2の訂正

| 対象 | 確認事実 | 設計への意味 |
| --- | --- | --- |
| DLP-LoRA論文 arXiv:2410.01497v1、§3.3 | 因子の連続配置、選択済みLoRAの索引取得、行列計算の集約・並列化 | ブラウザの有界な配置・batch計算に応用する。CUDA/HBMの速度をブラウザへ一般化しない |
| 公開実装 `d68fd38f36d9762f3e60041472193d379257cfb9` | `ParallelSpdUp`は個別LoRAを呼び出して加算。論文のpacked GEMM/HBM hash tableの明示実装は確認できない | 論文を参考にしたWorks向け実装として扱う |
| 採用LoRA owner `6d0c8df...` | 必要な重み行のdense差分を遅延計算。既存SIMD128 strict-f32、raw積/因子cache、light→detail加算 | 既存経路を比較基準にする。host cacheの配置自体は固定要件にしない |
| 通常画面 `docs/ai-connection/modules/` | LoRA適用ボタンと生成時の両方がproduct controllerを呼ぶ | 両入口から実行設定を渡す必要がある |
| `product-management.mjs:88–103,145` | 現在は毎適用でBase復帰・feed閉鎖・再構成・再登録する | 同一入力/同一bindingでの再利用も高速化候補。再登録費用を測定から隠さない |
| `operational-management.mjs:302–314` | 実feedのregistry、guarded baseProvider/consumerから標準LoRA adapterを構築。並列設定の受渡しはない | **不足は並列設定の接続。実consumerのコード接続は既に存在する** |
| 採用Diffusion ownerの `api/weight-port.mjs` | 実consumerがpackageをretainし、`readBlock`をRPC経由で読む | 通常経路のデータ搬送も含めて測る。試験consumerへ置換して製品合格にしない |
| `shared/compute/pool.mjs` | 共有poolはjob終了時にWorkerを終了する | 因子を保持するLoRA用の有界poolを追加し、既存共有poolの意味は変更しない |

v0.2の調査はLoRA単独経路に偏っていた。「実consumer未接続」という一般化は、この基準版には適用しない。ただし接続コードの存在、通常生成の実行合格、並列化の実測合格は別であり、現時点では後二者を実施済みとはしない。

5120×5120のF32積は100 MiB。二組の全行をcache missから計算して返す場合、対象weight一つ・片sideでraw積の累計転送は200 MiBとなる。同時保持量ではなく、cache hitや部分読取りに一律適用する値でもない。この費用を残すか減らすかを比較する。

## 3. 守る契約と調整できる条件

| 区分 | 内容 |
| --- | --- |
| 製品で維持 | File/source、HIGH/LOW、light/detail、strength、対象registry/行範囲、不変base、F32積和とpatch順、finite検査、要求/世代対応、取消・rollback・commit・独立lease、既存保存データの利用 |
| 実測で調整 | Worker数、pool/Memory/cacheの配分、tile/先読み、deadline、因子/積cacheの配置、Workerがraw積か完成blockを返す境界、通常の再適用時の再利用 |
| 検証用 | 固定fixture、独立F32参照、全値比較、比較回数、重負荷条件、個別の速度主張条件。利用者へ参照解・事前PASS・benchmark合格資料を要求しない |
| 製品の完成判定 | 通常管理画面→実feed→LoRA適用→生成・結果回収→Base復帰/終了が成立し、その利用操作で性能と残留資源を評価する |

上限は必要だが、v0.2のWorker最大4、各cap、受付から30秒、cold/warm双方10%は確定要件ではない。参考値を製品の恒久制限や全操作共通の合格閾値にしない。通常consumerの型・形状・finite・現在性検査は維持する。

## 4. 通常の生成管理経路への接続

### 4.1 実際の呼出しと変更範囲

| 場所 | 接続内容 |
| --- | --- |
| `docs/ai-connection/modules/index.html` のLoRA欄 | 「自動／単一処理／並列」を選べるようにする。単一処理も最適化候補の製品経路。詳細な資源設定は必要時だけ扱い、DiffusionのWASM threadsと混同しない |
| 同 `main.mjs` | 適用ボタンと生成runの両方へ、選択LoRAと別にLoRA実行設定を渡す。workspaceのsettingsFieldsにも追加 |
| `shared/ai-connection/product-management.mjs` | 選択と実行設定を別々に検証し、操作開始時にcapture。`applyLora(selections,{execution})`と`run({...,loraSelections,loraExecution})`の両方に対応。既存一引数APIも維持 |
| `operational-management.mjs` | `configureModule('lora',{feedIds,execution})`から`createBoundLora`へplainな設定を渡す。ここでexecutor/SDKを生成し、実feedのregistry・guarded base/consumerに束縛する |
| `adapters/lora-standalone/` | 検証済み新版ownerと実行戦略を選択。requested/actual mode、Worker数、cache/計算境界、理由と実行buildを観測可能にする |
| `docs/ai-connection/lora/` | 同じ実行設定・SDKを使う補助入口。ここだけの完成を製品経路完成としない |

executor、File権限、feed/session/lease等のruntime capabilityをJSON設定へ埋め込まない。現在のplain入力検査と所有権の境界を維持する。旧固定ownerのbytes・SOURCE検証・旧bridgeは残し、新版のsourceRefを旧版と偽らない。

### 4.2 設定のcapture・再構成・復旧

設定変更は次の明示的な適用/生成から有効にし、実行中のpoolや現在のpackageをその場で変更しない。通常controllerのBase復帰→feed close確認→再構成という既存経路を互換基準として残す。

同じモデル世代、live feed、registry、元sourceの検証済みsnapshot、実行build/資源設定が一致し、回復待ちでなければ、既存SDK・登録・因子を再利用する候補を実装・比較する。strength変更でも不変baseからfresh compositionを作り、前回の丸め済み差分を逆算しない。File名やsizeだけで同一性を推定せず、差替えsourceは正規登録で検証する。異なるside/source/feedや不確実な状態には同一性条件なしで再利用しない。

profileやbinding変更時は、既存のlifecycle直列化・元操作終端・rollback/recoverへ接続する。Base復帰やfeed closeに失敗したら回復必要状態を保持し、失敗を別戦略の自動再試行で隠さない。Diffusion再設定/再読込で旧feedを失効させ、旧Worker結果を新モデルへ受理しない。モデル全体の再読込を、LoRA戦略の切替だけのために一律要求しない。

workspaceにはplainな選択設定だけを保存する。読戻し後の次のapply/runに実際に渡す。File/session/feed/Worker/leaseは復元せず、既存の再選択手順を保つ。旧bundleで設定が欠ける場合の既定は`auto`とし、実際に選んだ経路を観測できるようにする。旧固定profileは互換確認・復帰用に残す。

## 5. 計算境界とcache配置を比較して選ぶ

開発正本は `docs/shared/inference/lora-parallel/`、採用snapshotは `docs/shared/ai-connection/native/lora-parallel-v1/` と独立SOURCE台帳を提案する。既存SDKの同期`kernel.product()`をPromise返却へ置換せず、新版packageのasyncな`readBlock/blocks`境界からexecutorを使う。対象operationはpackage生成時に索引化する。

### 5.1 実装・比較する候補

| 候補 | 処理境界 | 比較する費用と利点 |
| --- | --- | --- |
| A: host raw積cache | Workerはstrength非依存raw積を返す。hostがcacheし、既存Hikeでbaseへ適用 | 従来cacheとin-flight共有を引き継ぎやすい。dense積転送とhost加算/copyが残る。比較基準であり最終方式には固定しない |
| B: Worker内合成/cache | 不変baseの要求blockとLoRA descriptorを渡し、Workerが既存順で積・scale・加算を行い完成F32 blockを返す。raw積cacheはWorkerまたは計算所有者側へ配置 | raw積のhost往復を減らせる。base搬送、cache配置、再利用、Worker affinity、解放の費用が増える場合がある。新しい加算順や交差項は作らない |
| C: batched-inline | 同じ有界配置・索引・まとめた計算を同一realmで実行。A/B相当の意味を保つ | Worker起動/転送を避けられる。小要求や低資源端末の製品候補にする |

A/B双方の同値性・寿命を確認し、通常操作で採否を決める。Bを未比較のまま除外しない。Cもbenchmark専用へ隔離しない。不要に異なるcache配置を全部製品へ残す必要はなく、選択根拠と戻せる基準経路を保持する。

既存Hike/WASMは最初の比較基準として利用する。必要なら新しいHikeのbatch/合成entryやhostのMemory配置も実装候補とし、ソース・toolchain・WASM・ABI・数値buildの対応を検証する。既存binary維持そのものを性能改善の制約にしない。JS数値fallbackへは置き換えない。

### 5.2 cacheが守る意味

配置がhostかWorkerかにかかわらず、raw積はsource内容hash、数値build、因子名/shape、対象行で識別し、strengthに依存させない。完成blockのcacheにはbase/registry、composition/strength/適用順と対象範囲のidentityも必要。cache hitを別のbaseや要求へ流用しない。

有界な退避、copy/transferの所有権、同一計算のin-flight共有、独立lease、終了時解放を保つ。Workerが落ちたらそのcacheの失効を記録する。ある待機者の取消で、他の生存待機者が共有する積を取り消さない。cache破棄をsourceや保存済み成果の削除へ波及させない。callerが渡したcacheを無断で移動・detachしない。新版cache capability/配置を明示的に選び、既存API利用者の所有を保つ。

### 5.3 並列性と数値順序

独立した行/対象を複数Workerへ分配し、`blocks()`は有界に先読みする。逆順完了は要求順へ復元する。generator早期終了では自身の先読みを取消し、全元Promiseの終端を回収する。

shape/rank別のdescriptorで因子を連続配置し、異rankを同形状と偽装しない。全モデルの全因子を一度に保持する必要はない。行の分割と、同一要素のrank方向の積和・F32丸め・light→detailのpatch順を変えることを区別する。A/Bを個別に平均して掛ける等の交差項を生む置換はしない。

候補は標準経路の完成F32 bytes・既存拒否規則と一致することを検証する。Worker内加算や新batch entryでも同じ規則を守る。数値意味/許容誤差を緩めて合格にする場合は別の仕様判断として提示する。

## 6. 実行戦略、資源、待機・timeout

### 6.1 自動と明示設定

製品の`auto`は、同値性・寿命を確認したinline/parallel等の候補から、要求規模、利用可能な資源、cache状態と検証済みの性能根拠で選ぶ。未知の端末や条件では保守的なinline/基準経路を使える。操作ごとの比較benchmarkを勝手に走らせず、常時の最適化用ポーリングや外部テレメトリを追加しない。

明示`parallel`を無断でinlineへ変えて成功扱いにしない。Worker利用不可や資源不足は、要求したmodeと実際の能力・理由を返す。`auto`内の資源理由による変更は、計算前に決めて実行証跡へ残す。計算失敗、非finite、identity不一致、stale応答を戦略変更で隠さない。複数Workerの実計算と通常画面への設定伝播は専用に受入確認する。

### 6.2 上限を可変にしても有界性を守る

Worker数、resident/cache/転送/並べ替えbuffer、tile/先読みは一つのresource policyから解決する。使用中モデル/他モジュールの資源と併せて扱う。hardwareConcurrency/deviceMemoryはhintであり、実空きRAMや実コア性能の証明には使わない。

初期比較では1/2/4 Worker、現行32 MiB/Instance、resident 16 MiB等を参考条件に使えるが、製品の恒久最大値にはしない。実装時に有限の既定値と設定範囲、admission計算、計測したpeak/失敗条件を台帳へ記録する。上限なしのWorker生成や無制限queueにはしない。hint欠測時は保守的な有限policyを使う。

resident capを超える因子は一時workspace、tile/patch群の分割、退避で扱う。cache capを入力上限へ転用しない。既存の公開read上限・row alignmentは維持する。予算に収まらない場合のautoの再計画は投入前に行い、明示modeは成立しない理由を返す。通常対応入力を一律拒否する改修はしない。

WASM容量、host/Worker heap、転送用snapshot、raw/完成cache、先読み・caller保持結果を分けて計測する。例えば現行WASMを使う場合の容量は`32 MiB × Worker数`にcontrol kernel分が加わる。pool内の論理byte上限をブラウザ総RAMと呼ばない。

### 6.3 queue待ちと実行の期限

queue待ちと実行を別state・別計時にする。**受付から一律30秒で正常な待機を失敗させる規則は廃止する。** 既定のqueueは容量で制御し、利用者の取消・owner終了に応答する。呼出し元が明示した全体deadline/queue期限がある場合だけ、その意味で期限を適用する。

実行deadlineはWorkerの実行開始後に計時し、startup/因子準備も区分する。正常な大きい入力はtile分割等で処理できるようにし、端末の計算時間に無関係な固定job上限を製品条件にしない。実行watchdogの既定値・変更範囲は代表端末の検証結果からresource policyへ定める。無応答Workerは当該jobだけ失敗終端化し、世代を進める。長い待ち時間を純粋な演算遅延として報告しない。

## 7. 取消・所有権・保存互換性

executorは呼出し元所有、packageは独立executor leaseを持つ。SDK disposeやprepared creator releaseだけで、consumerの有効な旧package/read leaseを壊さない。旧leaseの正当な読取りと取消操作への古い返信を区別する。pool全体の停止へSDK cancelを直結しない。

protocol/build、jobId、Worker世代、package/registry/base/feed identity、weightId、元要求、offset/count、適用順を照合し、dtype・要素数・finite・現在性を検査する。重複/旧世代/範囲違いを受理しない。各jobと元操作のPromiseは一度だけ成功/失敗/取消へ終端化し、関係する実処理と解放の終端を待って既存queue/snapshotへ返す。

feed閉鎖・モデル再構成・recover/disposeへpoolの終了を接続する。使用中の因子や有効なleaseを退避しない。最後のleaseとin-flightが終わった後、Worker・因子/cache・event/timeout参照を解放する。終了失敗は回復必要状態を保持し、再利用可能と偽らない。

保存には選択/入力/registry/数値build/保存形式の正しいidentityを保持する。Worker IDやruntime handleを保存しない。executor/host/protocol版は別の実行証跡へ記録する。

同じ数値buildでは標準/inline/parallelの保存→fresh open/stageを相互確認する。新しいHike buildを採る場合も、既存保存dataを新版readerで検査・利用できる経路を同時に用意する。manifest/hash検査を省いたり新buildを旧buildと偽ったりしない。旧固定runtime向けのexportが必要なら、検証済みの互換形式へ明示変換し、変換元/先を記録する。未知buildを旧SDKが無条件に読めるとはしない。保存意味の変更やデータ損失を必要とする案は別途判断を求める。

## 8. 製品受入と検証を分ける

### 8.1 通常操作を主評価にする

最適化前に同じ入力・操作・開始/終了点・cache状態・比較順を固定する。下記の操作を通常画面から実feed・実consumerへ通す。どれを優先するかは実装前の評価台帳に明記し、結果を見て不利な操作を削除しない。

| 操作 | 主に確認すること |
| --- | --- |
| 初回のLoRA適用→生成 | startup、source検証/登録、転送、LoRA適用、推論時の要求読取り、結果回収までの待ち時間 |
| 同じFile/設定で再生成 | cache再利用と不用な再登録/再転送があるか。warmに実用的な改善があるか |
| strength変更、片組/二組/解除 | 正しいfresh compositionと再利用、Base復帰の時間、他sideへの影響 |
| 小要求・部分読取り・低資源条件 | inlineとparallelの交差条件、autoの選択、過大な起動/搬送費用 |
| 取消→再実行、設定変更、保存読戻し、終了 | 正しい設定が次回へ届くこと、失効/回復、体感待ちと保持資源 |

通常UI→`main`→productのapply/run→operationalのconfigure→実モデルfeedに結ばれたadapter→package実読取り、というtraceを記録する。基準と並列で同じモデル/source・prompt・shape・対応する保存noiseを使用し、推論入力を合わせる。未対応seedや形状・schedulerを試験都合で補作しない。設定表示だけでなく、実際の戦略、Worker jobと返却F32値を回収する。

主要時間は、利用者の操作開始から当該操作の正しい結果を回収するまで。モデル読込、LoRA準備/適用、推論、cache、queue、startup、搬送、照合の内訳を分ける。実モデルの推論中に発生する`readBlock`の回数・量・実時間も測る。重なった区間を単純加算しない。単独のGEMM短縮を操作全体の短縮へ置き換えない。

cold/warm双方を測るが、両方に同じ10%を要求しない。初回は同程度でも反復が明確に速い実装の価値を評価する。主張は操作/端末/入力/cache条件ごとに、改善・同程度・悪化・未確認を示す。測定順を入れ替え、揺らぎと失敗を含む生データを残す。比較回数や統計判定は検証台帳の条件であり、通常利用者への通過条件にはしない。

### 8.2 補助検証

5120²全行・異rank・積cache miss等の固定重負荷、独立F32参照と全値比較は、演算の正しさ、転送量、並列性、限界や回帰を調べる補助検証にする。通常利用の代表であると決め付けない。

数値/mappingは両side、二組/片組/なし、負/0/正strength、異rank、BF16/F16/F32、diff/bias、行端とblock境界、拒否入力を確認する。protocolは逆順/重複/stale/破損、寿命は共有in-flightと取消、旧read leaseと再構成、Worker異常・再生成、generator終了とdisposeを確認する。新しい計算境界ごとに行う。

実ブラウザでModule Worker・実WASM・File投入・実F32出力回収を確認する。Node/mockや試験consumer成功を通常の実モデル接続の代わりにしない。fixture、実LoRA原本、実モデルを区別する。利用可能な接続資料・素材は既存の許可内で調査/確保し、存在する実feed経路を未接続と扱って試験を省かない。実素材等が取得できない特定範囲はBLOCKED/NOT VERIFIEDとして残し、製品完成へ読み替えない。

### 8.3 完成と速度主張

- **機能完成**: 並列/inline等の候補、必要な互換性・寿命・保存、通常UIから実feedへの設定伝播と実操作が成立する。
- **目的への効果**: 事前に選んだ通常操作で、入力/結果を保った待ち時間短縮を実測する。遅くなる条件も示し、auto/profile選択へ反映する。
- **採用**: 正しさの条件を通した候補について、端末/操作/総時間/メモリの根拠で製品戦略を選ぶ。10%という一律の製品公開gateは置かない。
- **公開反映**: GitHub Pagesの配信commit/hash、Module/Worker/WASMの読込み、通常管理経路の投入→回収と終了を確認する。

実装ができたことと高速化できたことは別。効果が未確認なら「高速化済み」としない。現在の`generationReady:false`等を本改修だけでtrueへ変えない。コード接続があることを実生成受入や性能合格の証拠へ転用しない。

## 9. 実装・評価・配布の進め方

設計承認後に実装計画を作る。まず通常経路の現状時間と搬送を記録し、A/B/Cを同値性・寿命から比較、通常操作の総時間と資源で選ぶ。選んだ計算境界/cache配置、調整した有限policy、比較結果、不利条件、互換/復帰方法、source/build/hashを台帳へ残す。調整可能とした数値の校正のたびにユーザーの再承認を求めない。意味/対応入力/保存契約を変更する場合は区別する。

GitHub内のレビュー用ブランチで実装・検証してから、既存許可と確認済み差分の範囲で公開する。原本資料・私有sourceをHTTP配信rootへ混入させない。既存Sites仮実装の改修は新たな必須工程にしない。CDLCは実行契約を定義→評価→版付き配布→実利用の観測→該当部分の改善へ適用し、Skill原本を無断で恒久変更しない。

## 10. v0.2へのコメントの処置

| 指摘 | v0.3での処置 |
| --- | --- |
| host raw積cacheに境界を固定 | Worker内合成/cacheとの実装・比較を明記。守るのは数値/所有/再利用の意味であり配置ではない |
| batched-inlineを開発専用に限定 | 通常製品の選択/auto対象に変更。複数Worker機能は残す |
| Worker4やcap/受付30秒の過度な固定 | 有限resource policyで校正。queueと実行を分離し、一律の受付30秒を廃止 |
| cold/warm双方10%、固定重負荷が主評価 | 通常操作を主評価、cold/warm別判定。固定重負荷・独立全値比較は補助検証 |
| 通常生成管理経路が設計範囲外 | UI/product/operational/実feed/consumerまでの変更点、操作、trace、性能・終了を完成条件へ追加 |

現状は設計改訂のみ。実装・実ブラウザ実行・性能測定・製品公開は未実施。コメントを実測結果やv0.2の実装承認として扱わない。

v0.3は別担当の実装可能性点検と、目的・手順の監査を受けた。計画を妨げる重要な未確定事項や、設計提出を妨げる目的逸脱は確認されなかった。これは設計の静的確認であり、動作・性能の合格ではない。

公開参照:

- https://arxiv.org/abs/2410.01497
- https://github.com/MeCuping/DLP-LoRA/tree/d68fd38f36d9762f3e60041472193d379257cfb9
- https://github.com/Kushyameln01/kushyameln-works/blob/36b28b18ede71122e94bc1b3d5802b0369f7d937/docs/shared/ai-connection/product-management.mjs
- https://github.com/Kushyameln01/kushyameln-works/blob/36b28b18ede71122e94bc1b3d5802b0369f7d937/docs/shared/ai-connection/operational-management.mjs
