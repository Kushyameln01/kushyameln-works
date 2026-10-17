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
