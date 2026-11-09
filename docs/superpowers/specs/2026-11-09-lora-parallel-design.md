# 既存LoRAの並列計算拡張 — 設計案

版: 0.2 / 2026-11-09 JST / **設計承認待ち・実装前**

## 1. 目的と確定範囲

最終目的は、DLP-LoRAの並列計算を参考に、Kushyameln Worksの既存LoRA処理を高速化すること。公開先は既存の `Kushyameln01/kushyameln-works` とし、既存LoRAモジュールの拡張として接続する。

ユーザーは「既存WASM内の最適化に、複数Workerの並列計算まで含める」方式を選択した。以下の具体的なAPI、配置、数値上限、性能判定値は実装担当の設計提案であり、ユーザーが個別に指定した値ではない。

維持する条件:

- 入力File/source、HIGH/LOW、light/detail、strength、明示registry・対象行範囲の意味。
- 不変baseからの再構築、既存のF32積和・patch適用順、finite検査。
- source・package・要求範囲・実行世代の対応、取消、rollback、commit、独立lease。
- 同じ入力を扱えること。キャッシュ上限を新たな素材上限へ読み替えない。
- 並列処理が成立したこと、LoRAの実処理時間が短縮したこと、モデル全体の推論が速くなったことを別々に判定する。

今回、新しいLLM分類器、top-pによる自動選択、学習、ブラウザ操作エージェントは追加しない。既存の選択を入力として受け、計算経路を拡張する。画像・動画や他モジュールの処理結果をLoRAへ偽装して渡す変更は行わない。

## 2. 根拠と現在の計算経路

調査・設計基準は Works commit `36b28b18ede71122e94bc1b3d5802b0369f7d937`。隔離作業領域もこの版から作成した。採用ownerは `6d0c8df4cd4992f26745d2d26394f5e194d2567f`、WASM SHA-256は `5117e21d789d01b5dd49d7e8cf9bc8d2f78a51f7d3810aab56e4a40588a0c361`。

| 根拠 | 確認したこと | この設計への適用 |
| --- | --- | --- |
| 添付論文 arXiv:2410.01497v1、§3.3、pp.4–5 | A/Bの連続配置、選択済みLoRAと係数の索引取得、並列行列演算 | 有界な連続配置・検索索引・ブロック演算へ応用する |
| DLP-LoRA commit `d68fd38f36d9762f3e60041472193d379257cfb9`、`src/LoraModel.py` | 公開経路は選択LoRAを個別に呼び、結果を加算する。論文のpacked GEMM/HBM hash tableを明示実装した経路は確認できない | 公開コードの完全移植ではなく、論文を参考にしたWorks向け実装として説明する |
| `native/lora-6d0c8df/.../owned-package.mjs:146–171` | consumerが要求する重み行のdense差分を計算。積とdown因子のキャッシュ、light→detailの逐次加算、逐次block生成 | asyncなpackage読取り境界で並列化する |
| 同 `kernel/streaming/{host,registry}.mjs` | 既にSIMD128 strict-f32の`LoraProduct16`。Memory 32 MiB。down常駐機能は単一handleだがpackageでは未使用 | SIMDを新規導入したとは説明しない。既存WASM演算を使い、ホスト側の常駐配置・搬送を拡張する |
| `adapters/lora-standalone/{native,adapter,management}.mjs` | byte固定のowner採用、同期kernel、side内queue、HIGH/LOW一括処理の既存順序、currentness/epoch照合 | 固定原本を書き換えず、新版採用入口を追加する |
| `shared/compute/{README.md,pool.mjs}` | 既存共有poolはjobごとにWorker/Instanceを終了する | 因子を保持するLoRA専用poolを追加する。共有poolを改造・置換しない |

現行LoRAはactivationや自然言語tokenを入力にした分岐演算ではなく、必要な重み行を遅延計算する。DLP-LoRAのtoken制約の削減は、モジュール間の`activeToken`やrevision照合を省く根拠にはならない。HBMもブラウザAPIから本設計が選択・保証できる記憶域ではない。

## 3. 比較した方式と採用案

| 方式 | 利点 | 費用・限界 | 判断 |
| --- | --- | --- | --- |
| 既存WASM内で索引・因子常駐・行batchを最適化 | 再転送とJS/WASM往復を減らせる。Worker起動費用がない | 複数CPUコアへ仕事を分配しない | 比較基準として残す |
| 上記に独立した行ブロックの複数Worker計算を追加 | 同じ要素の加算順を変えずに並列計算できる | 起動・転送・因子複製・結果待ち合わせ・Memoryが増える | **ユーザーが選択。採用案** |

activationごとのLoRA枝を実モデルへ挿入する別方式は、現在の重み読取り契約を越えてconsumerを変更するため、この設計の実装対象にしない。CUDA/HBMの性能倍率を本設計の見込み値には使わない。

## 4. 構成と接続

### 4.1 追加する責務

1. **新版owner由来SDK/package**: plan検証、source/baseの所有、対象索引、raw積cache、async executorへの依頼、既存Hikeによる適用順どおりの加算、完成blockの検査を担当する。
2. **LoRA executor**: 有界な先読み、job管理、Worker選択、因子の配布・退避、応答照合、要求順への復元を担当する。
3. **LoRA Workerと同期kernel host**: Worker固有のMemoryへ因子を連続配置し、既存Hikeの`LoraProduct16`/`LoraAdd`/decode/finiteを呼ぶ。JSで数値演算を代替しない。
4. **管理adapter**: 採用する実行profileと正しいsourceRefを選び、既存のstage・commit・rollback・snapshotを維持する。

提案配置:

| 配置 | 内容 |
| --- | --- |
| `docs/shared/inference/lora-parallel/` | 6d0c8dfから派生した開発正本。SDK/packageの限定拡張、executor、protocol、worker、kernel host、由来台帳、README |
| `docs/shared/ai-connection/native/lora-parallel-v1/` | 検証済み配布snapshotと独立した`SOURCE.json`。採用元・差分・全file hashを保持 |
| `docs/shared/ai-connection/adapters/lora-standalone/` | 新版bootstrapと既存adapterの限定されたprofile選択追加 |
| `docs/ai-connection/lora/` | 既存画面に「標準／並列」の選択を追加。同じFile選択と操作を使う |
| `tools/lora-parallel/` | 同値性・protocol・寿命・実ブラウザ・性能の検証 |

旧`lora-6d0c8df`のbytes・SOURCE検証・旧SDK・旧bridgeは保持する。新版を旧版sourceとして報告しない。巨大な汎用job frameworkは作らず、追加poolのprotocolはLoRAのブロック計算に限定する。

### 4.2 profileと注入境界

既存の`createLoraManagementSide`へ、構築時だけ指定する`executionProfile`と、呼出し元所有の`blockExecutor`を追加する案とする。省略時は現行の標準profile。並列指定時は検証済み新版SDK factoryを選択する。操作ごとの`register/compose/prepare/stage/apply`引数は維持する。

新版`createLoraStandalone`から新版`createOwnedLoraPackage`へexecutorを渡す。**同期`kernel.product()`の戻り値をPromiseへ変える改造はしない。** asyncな`readBlock()`内部でexecutorをawaitする。標準SDKのfactoryや任意sourceの動的注入は公開しない。

executorには次の3実行profileを用意する。`batched-inline`は開発比較用で、製品画面の選択肢を増やさない。

- `standard`: 既存SDK・既存kernel host。
- `batched-inline`: 新版package・索引・常駐配置・batch、同一realmで実行。
- `parallel`: 同じ新版packageと数値演算を複数Workerで実行。

並列profileの公開候補は明示選択式にし、既存既定値は標準のままとする。ユーザーが選んだ並列機能は実装・画面接続まで含め、性能結果だけを理由に実装自体を省略しない。

画面でのprofile変更は**次の明示的な適用操作**から有効にし、選択だけで現在のモデルへ自動適用しない。UIはsession内で保持している元File/独立sourceを使い、新adapter/SDKへ必要なsourceを登録する。登録が全部成功するまで旧adapterを置換せず、失敗時は旧profile・現在のconsumer epochを保持する。成功後、idleかつ回復待ちでないことを確認して既存`replaceSide`を使い、同じ明示適用を新adapterへ渡す。新適用が失敗したら既存rollback/recoverを使い、別profileで自動再試行しない。旧packageを保持するconsumer/read leaseは旧SDK dispose後も有効である。選択予定profileと、最後に成功した適用receiptのprofileを混同しない。プログラム利用では呼出し元が元sourceを新factoryへ明示登録し、旧SDKのopaque handleを流用しない。

### 4.3 データの流れ

package作成時に、既存の検証済みoperationを`weightId → 適用順のoperation群`へ索引化する。sourceとscopeは既存のものを使用し、索引で意味を変更しない。

`readBlock(weightId,offset,count)`は元の要求の行境界・最大1,048,576要素を維持し、不変baseをhostで取得する。独立した行tileへ分け、対応するup範囲とdown因子をexecutorへ渡す。`blocks()`は既存の返却blockRows（既定16、1–256）を維持しつつ、有界に先読みする。generatorの早期終了・失敗では、そのgenerator専用の先読みを取消し、全ての元Promiseの終端を回収してから終了する。別の有効leaseやcache共有利用者を巻き込まない。Workerへ移すだけで投入が逐次のままになる構成は採らない。

Worker内ではshape/rankに合う因子を16-byte境界で連続配置し、descriptorにoffset・length・dtype・shapeを保持する。rankが異なるlight/detailを無条件に同形状tensorへstackしない。配置順やpaddingでrankや対象行を変更しない。全モデルの全因子を一度に常駐させず、現在の選択と対象tileに必要な分だけを扱う。

既存Hike WASMのbytesと数値ABIは最初の実装では変更しない。新kernel hostは複数down因子の常駐handleとarenaの境界・重複検査を実装する。連続するup行や独立積を有界batchとして送り、因子の再uploadとWorker往復を減らす。数値kernelの再ビルドや演算変更が必要になった場合は、この設計の同値性・保存互換性への影響を再提示する。

**Workerの応答はpatchごとのstrength非依存raw積であり、base加算済みの完成blockではない。** raw積cacheとin-flight共有は従来どおりhost/package側の所有とする。cache hitはWorker計算を省き、missのproducerだけがexecutorへ計算を依頼する。Workerはdown因子を保持するがdense raw積の別cacheは持たない。hostが回収した積を既存cacheへ渡し、`light → detail`の順に既存Hikeの`apply`で不変baseへ適用して、完成F32 blockを返す。diff/biasの復号・加算も従来のhost Hike経路を使う。batchでまとめた積の返却は、元cache keyの行範囲ごとに切り分け、加算順へは影響させない。

この境界は、raw積の転送を残す代わりに既存cacheの意味と保存契約を保つ設計判断である。raw積を返さず完成blockだけを返すWorker内融合は今回の実装には混ぜない。各cache miss producerのsource/kernel/executor leaseは計算終端まで保持し、ある利用者の取消で、同じin-flight積を待つ別利用者の計算を取り消さない。

raw積cacheはstrengthに依存させず、source hash、WASM hash、因子名・shape、対象行で識別する。現行のcopy所有権、LRUと同一計算のin-flight共有を保つ。cacheや入力source所有のbufferをtransferしてdetachせず、pool所有のsnapshotだけを渡す。

## 5. 数値結果と要求対応の維持

現在の記法に合わせ、各patchの差分は`up[rows,rank] × down[rank,cols]`。結果は不変baseへ**light、detailの順**で適用する。

並列にするのは独立した出力行・対象weightであり、同じ出力要素のrank方向の積和順、scaleのF32化、patch間の丸め順を変えない。AとBをそれぞれ足して掛けるような、交差項を発生させる置換はしない。異なるWorkerの完了順でpatch加算順を決めない。

数値受入は、同じ固定Hike数値buildを使った標準経路との**F32 bytes一致**とする。signed zeroを含む。finite/overflowの拒否結果も対応させる。独立した手計算可能ケースとF32参照でも確認する。誤差許容へ変更して合格にする場合は、根拠と影響を別途提示する。

各jobは、最低限以下を保持・照合する。

- protocol版、executor build、WASM hash、pool/Worker世代、jobId。
- package handleの世代・packageHash・registryHash・side・base identity。
- weightId、元要求ID、offset/count、tile index、因子identityと適用順。

応答のdtype・要素数・範囲・finiteを確認し、同じ要求の同じtileとして一度だけ受理する。逆順完了、重複、旧世代、範囲違いの返信を別要求へ流用しない。結果は呼出し元へ元の行順で返す。管理層のrevision・activeToken・consumer epoch検査はそのまま通す。

## 6. 寿命、取消、保存、資源上限

### 6.1 所有と終了

executorは呼出し元所有、packageは独立executor leaseを持つ。SDKのdisposeやprepared creatorのreleaseだけで、consumerがretain中のpackage/read leaseを壊さない。旧leaseの正当な読取りと、取消された操作への古い返信を区別する。

取消対象は当該operation/read/job。SDK cancelをpool全体の停止へ直結しない。待機jobは終端化し、実行中jobの停止が必要なら、そのjobを実行しているWorkerだけを終了して世代を進める。失われた因子は次の明示要求時に再配布する。他のWorker・別leaseの読取りを取り消さない。

jobは成功・失敗・取消のいずれかへ一度だけ終端化する。Worker異常やtimeoutで未解決Promiseを残さず、失敗を透過的な成功再試行へ変えない。途中までの出力をcommitしない。元要求は関連jobの終端と転送所有参照の整理を待ってsettleする。既存SDKのrollback/recover・管理queueのterminal barrierへ接続する。

通常のlease releaseでは利用中因子を退避しない。最後のleaseとin-flight readが終了した後に、因子・cache・Worker・event handler・timeout参照を解放する。root executorがclosingでも既存の有効leaseを許可し、rootからの新規leaseを拒否する。終了失敗は回復必要状態として残す。

### 6.2 有界化の提案値

| 対象 | 初期設計値・扱い |
| --- | --- |
| Worker数 | pool全体で既定2、明示設定1–4。HIGH/LOWで共有し、sideごとに無制限に追加しない |
| WASM Memory | Worker当たり現行と同じ32 MiB。常駐因子はその内側に含まれる |
| 常駐因子cache | Worker当たり16 MiBを初期capとする。未使用handleをLRU退避し、使用中は退避しない |
| 先読み | 最大`2 × Worker数`tile。pool所有の転送待ち・応答待ち・並べ替えbuffer合計64 MiBも同時に守る |
| 要求とjob | 公開read上限は現行維持。1 Worker当たり同時演算1件。内部tileはarenaと搬送budgetに合わせて分割 |
| timeout | job受付から30秒を初期案とする。失敗を返し、当該Workerを終了。端末で適合を検証する |

16 MiBはcache上限であって因子入力上限ではない。常駐capを超える因子は、退避後の一時workspaceへ載せて処理し、常駐させない。複数patchが同時に入らない場合はpatch群を分け、同じ出力を既存順に更新する。追加workspaceのために既存入力を拒否する場合は、**投入前のbudget判定**で当該tileを標準Hike経路へ振り分け、理由を計測記録へ残す。数値失敗・identity不一致・Worker異常をfallbackで隠さない。既存経路も扱えない入力は既存の拒否条件を維持する。

固定WASM容量は`32 MiB × Worker数`に加え、生存する各sideのcontrol kernelも別途必要。例えばcontrol kernelが2個なら、Worker2個のとき計128 MiB、4個なら192 MiBであり、これにJS heap・source snapshot・caller保持結果等が加わる。64 MiBのpool buffer上限をブラウザ総RAM上限と説明しない。root/lease/Worker/cache別の保持量とhigh-waterを記録する。

### 6.3 保存互換性

recipe manifestへWorker ID、runtime handle、実行profileやexecutor版を混入しない。数値WASMの`buildId`、registry、source、適用順と保存形式を維持する。新executor/host/protocolの版とhashは**実行証跡**で別に記録する。

標準で保存→並列でfresh SDK open/stage、並列で保存→標準でopen/stageを実bytesで試験する。manifestの一致検査やsource hash検査を省略しない。互換性が成立しなければ、その原因を直すまで互換対応済みとは扱わない。数値buildや保存形式の変更が必要なら別の版と明示移行が必要。

## 7. 評価と完了判定

### 7.1 機能・同値性・寿命

| 検証 | 合格条件 |
| --- | --- |
| 数値とmapping | 両side、二組/片組/なし、負/0/正strength、異rank、BF16/F16/F32、diff/bias、行端・block境界で標準F32 bytesと一致。重複選択と不正shapeは既存と同様拒否 |
| 非同期対応 | 実際に複数jobを投入し、逆順完了でも全出力が一致。旧世代・重複・範囲違い・破損応答を受理しない |
| 寿命と失敗 | 取消・timeout・Worker異常・再生成・新revision・旧read lease・disposeの組合せで、commit取り違えと未終端Promiseがない。最後のlease終了後、専用資源の参照が残らない |
| budget | 常駐/搬送/先読みcap、cache miss/hit、退避、大因子の非常駐経路、予算による標準tile振分けを検証。既存入力の対応範囲を狭めない |
| 保存と接続 | 標準↔並列のfresh open/stage、既存管理queue/snapshot/rollbackとHIGH/LOW一括成否を回帰検証。UIでFile投入から結果読戻しまで実行 |

実ブラウザでModule Worker・実WASM・File入力・結果buffer回収を確認する。Nodeやmockだけの合格をブラウザ合格としない。外側のreceiptだけでなく、実F32全出力をstreamingで照合する。継続利用・終了の資源counterを併記し、無期限のリーク不存在は主張しない。

### 7.2 性能比較

標準、batched-inline、parallel 1/2/4 Workerを同じ入力・対象範囲・cache条件で比較する。選択済みの全出力をconsumerが読んで検査し終わるまでを主指標とし、kernel単体の短縮だけでは合格にしない。

事前に固定する代表課題は、少なくとも次の範囲とする。

- 既存canonical targetの5120×5120全行、light/detail相当の異rank（例16/64）の二組。入力が作成fixtureなら明記する。
- 同じ条件の片組、strength変更後の再利用、小さい行要求、cache退避が起きる複数対象。
- 利用可能な実LoRA原本と実base/consumerがある場合は、同じ条件で実素材・実接続を別枠で測る。fixtureを実素材と呼ばない。

測定区間:

1. **初回LoRA操作**: File/sourceの登録開始からcompose/prepare/stage、consumerによる宣言範囲の実読取り・検査、操作Promise回収まで。起動、hash、転送を含む。
2. **再利用時のLoRA操作**: 登録済みsourceから、同じ対象を適用・読取りして結果回収するまで。cache状態を明記する。
3. **内訳**: 準備、source読取り/復号、因子搬送、待機、演算、結果搬送/並べ替え、検査。重なる区間を単純加算して主指標を捏造しない。
4. **モデル全体の推論**: 実モデルconsumerが接続できる場合の別指標。未接続ならNOT VERIFIED。

端末・browser・CPU/Worker数、commit/hash、入力hash、scope、cold/warm、失敗を含む各試行を保存する。比較順を入れ替え、各順序でウォームアップ後5回以上を測る。中央値と分布を提示し、並列区間の重複も記録する。成功試行だけを選ばない。

**初期の速度目標案**は、登録済みsourceから全選択出力を計算・consumer検査する重いLoRA操作（上記2）で、標準に対し総時間中央値10%以上の短縮を比較の両順序で確認すること。主評価ではdense raw積cacheを空にし、実際に積を計算する。**Workerが未起動の初回と、Worker/因子を再利用する後続の両条件でこの目標を満たす**ことを要求し、起動を測定外へ隠さない。source登録/hash自体を含む上記1、dense raw積cache hit、小入力の結果は必ず別掲し、主評価の短縮をそれらへ一般化しない。これら副評価に未達の効果を主張しない。

batched-inlineとの差も示し、Worker追加の寄与を判定する。主評価の入力・scope・cache条件は最適化前に固定する。達成しない条件を後から除外したり閾値を緩めたりして「高速化済み」としない。

結果の判定は以下を分ける。

- 並列モジュール実装・接続: 機能/同値性/寿命/保存が合格。
- LoRA側の高速化: consumerの実読取りを含む総時間で速度条件が合格。
- 実素材・実モデルでの効果: 対象の実計測が合格。未接続や素材不足なら未確認のまま残す。
- 公開反映: 配信commit/hash、HTTP/Module Worker/WASM読込み、公開先の入力→出力回収が合格。

`generationReady:false`を本改修だけでtrueにしない。全モデルbindingや推論成立を実測せずに報告しない。最終目的をmicrobenchmark合格へ置き換えない。

## 8. 実装・配布の進め方と保留事項

設計承認後に実装計画を作成する。機能を段階的に接続し、同値性の失敗は性能評価より先に直す。既存Hike bytes、所有権、通常操作の成功判定を保つ。

新版owner/host/executor/protocolのhash台帳、旧版との差、検証結果、既知の性能不利条件、標準profileへの復帰方法をそろえて、既存GitHub内へ配布する。既存のSites仮実装への変更は今回の必須工程へ追加しない。公開先では同じ候補の配信・実処理を確認する。

CDLCは、実行契約を定義→同値性/境界/旧版/破損/取消を評価→版付き配布→実利用の遅延・失敗・保持量を観測→該当部分だけ改訂する流れに適用する。モデルの学習やSkill原本の恒久変更は行わない。

現時点で承認が必要なのはこの設計案。未実施なのは実装、試験、性能測定、配布。Worker数・メモリcap・10%速度目標は今回の提案値として明示し、実装中の測定結果だけで無断変更しない。細かな内部関数名、test fixtureの追加例、測定器の表示形式は、上記契約を守る範囲で実装担当が決める。

### 設計点検で明確化した判断

実装可能性の別担当点検を受け、v0.2で以下を明記した。いずれもユーザーの新しい指示ではなく、この設計案の具体化である。

- Workerはraw積を返し、既存host cacheとHike加算を保持する。
- profile変更は次回の明示適用で行い、sourceの新登録が成功するまで旧adapterを保持する。
- 速度の主評価は登録済みsourceの全選択出力の実計算とconsumer検査。cold/warm Workerの両条件を判定し、登録/hash全体とcache hitを分ける。

v0.2の再点検では、実装計画を妨げる重要な未確定事項は残っていないとの回答を得た。別の目的・手順監査も設計提出を妨げる問題を確認しなかった。これは設計の静的点検であり、実装・数値・性能の試験結果ではない。

公開参照:

- https://arxiv.org/abs/2410.01497
- https://github.com/MeCuping/DLP-LoRA/tree/d68fd38f36d9762f3e60041472193d379257cfb9
- https://github.com/Kushyameln01/kushyameln-works/blob/36b28b18ede71122e94bc1b3d5802b0369f7d937/development/ai-connection/lora-standalone/API.md
- https://github.com/Kushyameln01/kushyameln-works/blob/36b28b18ede71122e94bc1b3d5802b0369f7d937/docs/shared/compute/README.md
