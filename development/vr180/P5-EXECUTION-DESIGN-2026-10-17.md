# P5実行設計：校正から大容量受入へ

2026-10-17。環境消失後の再構成版。計画1.2 §8.3/§9とTips版2（SHA fb6727101501575e034939703824ff821bc5e52ede70bfafbea97b5b45800ad9）を適用する。大容量合格・公開能力拡張を意味しない。

## 現在実行する範囲

まず非公開試作で1024×512 SBS180、30fps、300frame/10秒の決定的合成素材を生成し、WebCodecsで変換する。独立ノイズ、左右の識別印、両眼の29/30/31frameの短い赤イベントを含む。要求bitrateは32→32Mbpsと48→24Mbpsを別試行とする。実decoder configuration、全packetのpayload bytes、最大packet、実timeline、実bytes、全hash、処理区間、資源予約を採る。要求値を実効bitrateへ読み替えない。

入力・出力の各上限80MiB、合計120MiB、OPFS空き見積り512MiB、runner空き2GiBを校正前に検査する。書込み時にも実上限を検査し、quota見積りを予約保証としない。原入力を実commit・読戻ししてから変換する。元の1GiB最終出力・10万sample・16MiB metadata上限を変更しない。

固定Ubuntu FFmpeg package、実行PATH上のffmpeg/ffprobeのSHA、linked libraryとpackage情報、NumPy版、独立検査器のimport成立を媒体生成前に確認する。source commit、fork、controller、harnessの開始/終了hashを保存する。cloudで全検査した後も入力・出力の全bytesをartifactから回収し、GitHubのarchive digest、ZIP CRC、manifest、各全hash、受信後readbackを確認し、hostの独立検査器でも全走査する。

完全走査した品質FAILは媒体を回収してFAILとして保存する。`READY_FOR_ARTIFACT_RECOVERY`は品質PASSではない。依存不足、時間切れ、未回収、不完全走査、清掃不明を合格にしない。試行を変えて失敗履歴を消さない。

## 校正の時間と資源

workflowは標準公開Actions、contents read、固定action、保持1日、圧縮level0。課金・アカウント設定変更を行わない。全job21分、依存4分、再ビルド2分、媒体step11分（内部600秒）、artifact2分。ブラウザ操作は360秒、独立検査は180秒以内。上限到達時は新しい証拠なしに時間枠を繰返し増やさず、原因と各区間を確認する。

明示buffer予約、Node heap、ブラウザプロセスRSS、GPUを別々に扱う。RSSを観測できても共有pageの二重計上とsampling間の見逃しがあり、厳密なpeakやGPU内訳とはしない。未観測項目はnull/未確認とする。

## 大容量profileの審査条件

以下の要求bitrate・4.8GB出力を使った仮案は履歴として残す。実行には末尾「校正後の設計」を適用する。仮案を採用済みとは扱わない。

短尺の全回収・独立品質PASS後に、実効bitrate、生成/変換/検査時間、最大packetとchunk、native資源量から長尺の実行期限を見積もる。5GB/10GBは10進の実媒体payloadで達成する。free padding、疎ファイル、同じBlob参照の水増しは採らない。下表は要求bitrateによる設計値であり実測ではない。

| 入力目標 | 仮の要求bitrate | 仮の長さ | 30fps video samples |
|---|---:|---:|---:|
| 5,000,000,000 B | 32,000,000 bit/s | 1,250秒 | 37,500 |
| 10,000,000,000 B | 48,000,000 bit/s | 約1,666.67秒 | 50,000 |

この校正は無音。10GB候補に48kHz AACを追加すると総sample数が10万を超える見込みなので、AACや60fpsへ一般化しない。0.5秒chunkの平均量が小さくても、最大packet・backing bufferが4MiB以内とは限らない。

最初の大容量候補は入力上限5.1/10.1GB、最終出力上限4.8GBを審査対象とする。最終出力上限の変更だけを独立したprivate profile差分にし、sampleとmetadataの公開上限を一緒に緩めない。実4GiB超出力の保存・全回収・独立検査がなければ、その出力能力を公開しない。

## 全回収と容量の保守的見積り

長尺用の回収コードは校正後に別差分で実装・審査する。128MiBのartifact輸送経路は過去に全bytes確認済みだが、大容量媒体自体を回収した証拠ではない。

runnerは入力と出力の3組相当（OPFS、回収ファイル、artifact包装余裕）＋2GiB＋64MiBを保守的に確保する。受信側は入力と出力1組＋同時に2個までの128MiB断片＋2GiB＋32MiBを確保する設計。順序付き断片を全ZIP検査後に逐次組み立て、確認済み断片だけを削除し、全体を再hashする。全体ZIPと全展開ファイルを同時に保持する方式へ黙って変えない。

| 候補 | runner必要空き | 受信側必要空き | 128MiB断片数上限（metadata 1含む） |
|---|---:|---:|---:|
| 入力5.1GB＋出力4.8GB | 31,914,592,512 B | 12,349,473,536 B | 75 |
| 入力10.1GB＋出力4.8GB | 46,914,592,512 B | 17,349,473,536 B | 113 |

開始直前に実空き容量とOPFS quotaを再確認する。過去の空き容量記録を再利用しない。5GBの受入後、10GBの前にも残存物込みで再判定する。容量・実行期限・回収のいずれかが不足すれば当該profileをBLOCKEDとし、公開上限を維持する。

## 完了と未確認

各profileの入力確認→変換→最終保存→全回収→全frame/packet/時刻/音声/VR情報の独立検査がそろった条件だけPASSとする。1往復から性能分布や長期安定性を主張しない。OS保存ダイアログ、対象VRプレイヤー・端末、実写品質、初見操作、左右別ファイル同期、長尺60fpsは個別に未確認として残す。

## 校正32の結果による設計の保留点

Actions39039504709 / a581d96d68ad7bb57744dfb5570b6a71e718c913では、入力58,952,806B・出力58,862,233Bを全回収し、cloud/hostの全300frame独立品質検査がPASS。要求32Mbpsに対し実payloadは47.1604872/47.0880288Mbpsだった。上記4.8GB出力capの仮案は、5GB入力にも足りない可能性があるため採用しない。48→24条件の校正後、実効量から再審査する。

同試行のrunner空き91,484,504,064Bに対して、非永続browser contextのOPFS事前quotaは10,737,418,240B、usage0だった。保存後はquota10,855,233,831B・usage117,815,591Bで、表示上のquotaが変化している。長尺で利用可能な上限をこの2点から確定できない。既存contextで入力と出力20GBを同時保持できるとは仮定しない。通常の所有persistent profileを使う案は、別の能力・保存試験と設計審査を行う候補であり、quota制限を無効化するflagは導入しない。

## 校正後の設計（大容量実行前の条件）

32→32は短尺300frameのcloud/host全検査PASS。48→24は全回収しても両眼PSNR約25.82dBでFAILとなり、不採用。以下は32→32だけから算出した仮説で、長尺実測ではない。実packet payloadが目標へ到達するまで生成し、実file sizeを別途上限で止める。指定bitrateやpaddingを容量達成の証明にしない。

| 条件 | 入力payload目標 | 入力/最終出力file上限 | 推定frame数/長さ | runner空き必要量 | 受信側空き必要量 |
|---|---:|---:|---:|---:|---:|
| 5GB | 5,000,000,000B | 5.1/5.2GB | 約25,446 / 848.2秒 | 33,416,582,400B | 12,749,473,536B |
| 10GB | 10,000,000,000B | 10.1/10.2GB | 約50,891 / 1,696.4秒 | 63,416,582,400B | 22,749,473,536B |

runnerはfile上限合計の3組＋64MiB索引＋32MiB証拠＋2×128MiB輸送＋2GiB余裕。受信側は1組＋32MiB証拠＋2×128MiB輸送＋2GiB余裕。開始直前の実空きで判定する。5GB組と10GB組を同時保持する空きは確認していないため、5GB全検証と証拠固定後、自己生成媒体の保管・清掃を判定してから10GBに進む。

private profileで最終出力上限だけを分離する。30fps・無音、10万sample、16MiB metadata、共有8MiB索引、4MiB同時sort、4MiB chunk/backing等は維持する。公開b7の1GiB上限と共有vendorは変更しない。

所有する新規persistent profileを通常のsandbox付きChromeで使う。先に16MiBの実書込み→close→全読戻し→正常終了→同profile再起動→全読戻し→清掃を試す。この合格は大容量や障害耐久性を保証しない。`storage.estimate()`の表示は容量予約やenforced quotaの証明に使わず、実書込み・close・QuotaExceeded時の失敗清掃で確認する。quota変更flagは使わない。

固定公式`@actions/artifact 2.3.2`をlocal actionから通常のruntime認証で呼ぶ。source全hashを保持し、128MiBの実partファイルを1個だけ作り、圧縮0・保持1日・同時upload1で送る。全part成功・原本全再読一致後だけcompletion manifestを最後に送る。5GBは最大78、10GBは最大153 artifacts（completion含む）。上限200 partsとし、先に8MiB part×16件＋completionと、新経路の128MiB単独を実サービス上で全回収する。

受信側は独立に回収したcompletion receiptとGitHub metadataを照合し、各ZIP digest・CRC・raw part hash・連続offsetを検査して逐次再構成する。全体を再読してwhole hashを確認し、全frame/packetを独立検査する。受信待ちを成功へ読み替えない。署名URLやruntime tokenは証拠・ログへ保存しない。artifact保持1日は即時削除の約束ではない。

短尺からの線形試算は5GBの生成417/変換448/cloud検査426秒、10GBの834/896/851秒、host検査313/627秒。転送・起動等を含む実測ではない。初回jobの候補期限は5GB90分、10GB120分、生成/変換各15/25分、検査15/25分、upload20/30分。全jobは標準Actions上限内とする。新輸送試験の実効速度・artifact固定費を確認してから実行枠を確定し、不足時は理由を記録して停止する。受信側期限は各120分以内。性能向上の証明には使わない。

根拠：Chromiumのquota表示提案 https://groups.google.com/a/chromium.org/g/blink-dev/c/7q0YGQNVkjs/m/BJH9kfmIEgAJ 、公式artifact仕様 https://docs.github.com/en/rest/actions/artifacts 、固定upload action https://github.com/actions/upload-artifact/tree/ea165f8d65b6e75b540449e92b4886f43607fa02 、Actions上限 https://docs.github.com/en/actions/reference/limits 。各実行は保存されたsource hashと実測証拠へ結び付ける。

## 受信ホストの変更と追加受入（128MiB試験後）

通常profileの16MiB再起動、16分割120MiB、単独128MiBは実サービスで全量受入済み。単独128MiBの最初の回収経路は58.217秒、そのうちdata取得は35.708秒だった。操作間隔を含む値であり純通信速度ではない。仮にdata取得時間だけを152回へ線形に延ばしても約90.5分となり、10GBの回収＋独立検査を120分で終える保証はない。同時2取得による短縮も128MiBでは未実測である。

単独128MiBは最初のroot全量照合後・独立レビュー前に作業領域が消失した。同じ原artifact2件を再取得（35.853秒）し、別担当がZIP/CRC/全134,217,728B/独立式を全走査して合格を確認した。履歴と原記録は`evidence/2026-10-17-segmented-128.json`に保存し、新receiverの受入とは区別する。

さらにCodex側の作業ディレクトリが2回消失したため、長尺の全回収を続けながら全原本を保持できる保証がない。計画1.2 §8.3の全量回収・独立検査は維持し、受信ホストを生成jobとは別の新規Actions jobへ移す。これはrootローカルへの全量回収とは報告しない。単なるproducer判定の再利用ではなく、別hostで全ZIP・全媒体を実際に読み直す。課金・アカウント・権限設定を変更せず、通常runtimeと`contents: read`の範囲を保つ。

同runの`needs` outputからproducerのrepo/commit/run/attempt/jobとcompletionのID/name/ZIP digest/raw bytes/raw hashを受ける。無認証の公開REST APIから実metadataを取得し、run/commit/branch/expiryを別に照合する。SDKの内部metadataにはこれらのREST fieldsがないため、同等の応答へ作り替えない。固定SDK2.3.2の同run ListArtifacts/GetSignedArtifactURL経路を限定的に使い、unzip先をraw ZIPの逐次保存へ変更したprivate adapterとしてsource・差分・license・依存を固定する。新しい認証情報や署名URLをログ・証拠に保存しない。

receiverは全ZIP digest・全entry CRC・part SHA・連続offsetを検査してから追記し、fsync後に状態を更新する。全体hashを再読し、小容量では独立生成式と全byte比較する。長尺を有効にする場合は同じ固定FFmpeg/NumPy検査器で全frame/packet/PTS/左右/イベント/画質/VR情報を走査する。producerの品質FAILをreceiverのbyte PASSで上書きしない。完全FAILは証拠を保存し、欠落・時間切れ・不完全走査・清掃不明はPASSにしない。

追加受入は(1)16分割120MiB、(2)単独128MiB、(3)短尺媒体の全回収・独立検査、(4)identity不一致・欠落・破損・期限・完全品質FAIL・不完全走査の拒否である。既存root回収の受入を転用しない。まずwrapperとreceiverは小容量profileだけ許可する。小容量job25分、receiver内部20分、1artifact120秒＋終了待ち、同時取得1。実測後に長尺期限を再審査する。原bytesはreceiver runner終了まで保持し、rootへは元記録・service metadata・全hash・全走査件数・失敗・終了状態を含むbounded証拠を回収し保存する。

長尺producerの全体期限は5GB60分、10GB85分を候補とし、各生成/変換/検査上限より全体期限を優先する。upload20/30分とjob90/120分の余裕を残す。期限後はcompletionを発行しない。各stage上限を単純加算した所要時間を、job枠内に収まると誤認しない。新receiver受入が終わるまで5/10GB実行はBLOCKED。公開b7の1GiB上限と未確認事項は変わらない。

公式根拠：https://docs.github.com/en/actions/tutorials/store-and-share-data 、https://docs.github.com/en/rest/actions/artifacts 。受信主体の変更は全量検査を省略するためではなく、全量を保持して独立検査を完了するための変更である。

## 別receiverの短尺媒体ゲート

新規Actions receiverの16分割120MiB（39044433711）と単独128MiB（39044958599）は、全ZIP・全byte・独立生成式の照合に合格した。前者の受信37.130秒、後者7.940秒は各1観測であり、長尺への速度保証に使わない。元記録と独立レビューは `2026-10-17-actions-receiver-service.json` と `2026-10-17-actions-receiver-128.json` に固定した。

次に `[vr180-receiver-media]` による同runの2jobで、元の32→32校正を新規実行する。元校正コードは変更せず、wrapperが原媒体・原metadataを全hashで照合して新規所有出力へ包装する。原校正にはjob IDがないため、jobとの結び付けは固定workflowの同job連続実行による事実と明記する。repo/commit/run/attempt/caseの一致は原記録自身でも検査する。原品質の完全FAILも保持し、不完全走査は送信しない。

送信は入力・出力の2part、8MiB以下の証拠bundle、completionの計4artifact。bundleは元検査記録を原bytesのまま含み、空stderrもhash対象とする。receiverはcompletion→証拠→媒体の順に取得し、ZIP全検査、原記録全hash、固定source closure、同runの公開REST metadataを照合する。別hostの固定FFmpeg/NumPyが全300frame/packet/PTS/左右/短いイベント/PSNR/VR情報を再検査し、検査器の全媒体bytes/hashも回収結果へ結び付ける。生成側と受信側の両方が品質PASSの場合だけ `PASS_COMPLETE_MEDIA`。完全品質FAILは `COMPLETE_MEDIA_FAIL` として残し、取消・欠落・不完全走査は `FAIL` とする。

短尺producer job40分、元校正内部600秒・step11分、包装内部180秒・清掃余裕込みstep4分、upload内部600秒・step11分。receiver job30分、内部20分・step21分、各artifact120秒＋子process終了待ち。取消は検査器の通常例外捕捉に吸収されない専用例外で中断し、runtime close後に失敗証拠を残す。包装の清掃は所有物ごとに継続し、不明物と撤去失敗をHOLDとして記録する。これらの期限は成功条件を延ばす目的で自動更新しない。

局所試験では実wrapper→senderの模擬SDK連携を品質PASS/完全FAIL両方で確認した。receiverは4ZIP統合、破損・未知metadata・rawhash不一致、完全FAIL・不完全走査、実SIGTERMで後続stage未開始とruntime closeを確認する。実クラウドの媒体生成・回収・独立品質は別ゲートとして記録する。短尺ゲート合格後も、長尺向け証拠包装とreceiver上限・独立全走査を別差分で審査するまで5/10GBは実行しない。
