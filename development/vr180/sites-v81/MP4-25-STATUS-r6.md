# MP4 25項目の現状 — r6

2026-10-18／固定候補版の監査整理。対象は`vr180-mp4-candidate-r6-20261018`、build `vr180-b14-mp4-compatibility-r6`。目的はVR180に加工できる素材の対応幅を広げること。診断・安全停止は処理対応の成功に数えない。旧評価`MP4-25-REASSESSMENT.md`は履歴として残す。製品完成の宣言ではない。

**R＝読取、C＝再圧縮なしの保持・VR付与、T＝画素加工後の保持・更新。** 「限定」は記載profile内だけの判定。「未実装」と「実装はあるが未検証」を区別する。

現証拠は小さい合成素材による**C出力28本PASS**、Nodeの実WorkerコントローラーによるC出力2本PASS、通常direct／indexedの**packet mux部分検証12本PASS**、AAC依存表の補足出力6本PASS。**r6のWebCodecsによる切出し・配置変換・再圧縮は未検証**であり、T完遂PASSは付けない。以下の「T部分検証」はpacket mux部分を指す。

| # | 構造 | R：読取 | C：保持 | T：編集更新と具体的な残件 |
| --- | --- | --- | --- | --- |
| 01 | meta/keys/ilst/data | ISO/QuickTime・mdtaを限定対応 | 限定PASS：raw・多値・順序保持 | **部分検証**：記述metadataのraw移送。WebCodecs未検証。幾何・時刻・ID依存値の更新は未実装 |
| 02 | tref/chap/tmcd/cdsc | ID列・参照先を限定対応 | 章／時間コード参照でPASS | **補助track T未実装**。出力track、ID再割当・参照更新、時間対応が必要 |
| 03 | udta/独自タグ | mdir/mdta/chpl等を限定対応 | 許可metadata保持で部分PASS | **記述metaは部分検証**。未知の旧ISO mdirは省略記録あり、保持完了ではない。独自タグの意味別規則が必要 |
| 04 | uuid/メーカーBox | 既知Spherical V1のみ | V1→V2意味移行の実装。未知UUID拒否 | 一般UUID更新は**未実装**。UUID別の位置・時刻・ID依存仕様が必要 |
| 05 | 時間付き撮影情報 | tmcd/tc64限定 | 時間コードでPASS | **時間コードT、gpmd/camm等は未実装**。補助sample出力、時刻・座標系変換が必要 |
| 06 | 64bit Box/size=0 | 安全整数内extended size、末尾mdat size=0 | 小さいsize=0でPASS。巨大sizeは条件付き実装 | size=0正規化実装、WebCodecs未検証。4 GiB超は隣接free/skip 8byteが必要（Cのみ置換旧moovも可）。領域なしの方式は未実装 |
| 07 | stco/co64 | 両表を限定対応 | 小さいco64／複数mdatでPASS | 新offset生成実装。4 GiB境界を含むr6実File出力は未検証。表拡大・再配置の独立照合が必要 |
| 08 | moov移動/Fast Start | 前／後置を読取 | 旧moovをfree化し末尾追記する方式でPASS | 末尾moov出力実装。**先頭移動は未実装**。全位置依存表の更新が必要 |
| 09 | 複数mdat/stsc/stsz/stz2 | stz2 4/8/16bitを追加、両readerあり | stz2・padding・複数mdatでPASS | packet読取／stsz再生成の部分試験あり、WebCodecs未検証。通常／indexedのT回収が必要 |
| 10 | dref/iloc | 自己完結url限定 | 外部参照／ilocは未対応 | **未実装**。extent解決・基準位置更新・利用者指定の外部入力対応が必要 |
| 11 | stts/VFR | 正deltaとrun数を限定対応 | 元表・時刻保持は部分検証 | sample時刻使用の実装あり。非等間隔VFR、終端と音声同期のT回収は未検証 |
| 12 | ctts/DTS/PTS/cslg | ctts v0/v1。cslg v0＋signed cttsの完全一致profileを追加 | 限定cslgのC追加1本PASS | **packet mux部分検証**。PTS/duration・出力表整合を確認。一般cslg解釈は未実装、WebCodecs未検証 |
| 13 | edts/elst | v0/v1、C向け複雑editを読取 | 受理editの保持実装、限定照合 | 単純edit・正確なAAC端点のみ。**複数／empty／dwell／rate／trimのTは未実装**。movie時間への対応処理が必要 |
| 14 | timescale/長時間 | v0/v1・安全整数を限定対応 | 小素材の時刻保持で部分検証 | muxの57600 grid等の制約あり。丸め境界・長時間・r6新構造のGB処理は未検証 |
| 15 | stss/sdtp/sgpd/sbgp | sync／roll・prol限定 | 受理表の保持実装 | **AAC限定実装・raw移送検証済み**。通常／indexed mux12本とroll/prol v0/1/2補足6本でsample・表を照合。新映像へ旧映像表をコピーしない。**seek・WebCodecs未検証** |
| 16 | fMP4 | 処理parser未対応、診断識別のみ | 未実装 | **未実装**。init＋fragment、tfhd/tfdt/trun/defaultからsample iteratorを構築する必要 |
| 17 | sidx/mfra/tfra | 処理parser未対応 | 未実装 | **未実装**。fragmentの位置・時刻・相対offset再計算が必要。索引削除で対応扱いにしない |
| 18 | codec/sample entry | avc1/hev1/hvc1/AAC限定、1 entry/track | 限定HEVC/AACでPASS | 既存SDR入力→H.264経路、WebCodecs未検証。複数description／新codecは未実装。無断で追加しない |
| 19 | 複数音声/字幕/代替track | video1＋AAC0/1＋章／時間コード限定 | 限定補助trackでPASS | **補助track T・一般複数音声／字幕は未実装**。track選択・言語・alternate・IDとindexed 2track契約の拡張が必要 |
| 20 | 暗号化 | 処理parser未対応、診断のみ | 未実装 | **未実装**。暗号補助情報・位置保全、画素加工には正当に利用可能な復号経路が必要。鍵取得やDRM回避を追加しない |
| 21 | tkhd回転/反転 | identity限定 | 非identity未対応 | **回転・反転T未実装**。表示座標、眼分割、VR方向、出力行列を一致させる必要 |
| 22 | pasp/clap | 1:1 pasp限定、clap拒否 | 非正方／clean aperture未対応 | **未実装**。有理数の表示領域からcrop/scaleを計算し、出力pasp/clapを更新する必要 |
| 23 | colr/HDR | HEVCの限定色Boxを読取 | 保持実装、HDR色再現は未検証 | **HDR T未実装**。SDR経路の色整合も別検証。bit depth・transfer・色域管理が必要。10bit入力だけでHDR成功としない |
| 24 | st3d/左右配置 | mode0/1/2を限定読取 | 限定SBS宣言でPASS | SBS/TB→SBS実装、r6 WebCodecs未検証。新構造と実画素の眼順を照合する必要。mono/custom等は未実装 |
| 25 | sv3d/proj/equi/mesh等 | equi/限定V1。meshは種類識別のみ | 180equi限定でPASS | 正面360→180・pose0の実装。**mesh/fisheye/camera補正は未実装**。投影・姿勢仕様と画素写像が必要。VR player未検証 |

## 現証拠と判定範囲

以下のパスは**引継ぎbundleのルート起点**。独立検証記録の共通prefixは`evidence/r6/independent/`。文書の置き場所からの相対リンクには依存しない。

- **Node：183/183 PASS、失敗・skipなし**。末尾空白修正後に再実行した`evidence/r6/final/node-tests.json`を確認。対象68ファイルの試験前後hashと現在の候補実体が一致。metadata producerの29ファイルは実行前後一致。現物との差は試験ファイル127行目の末尾ASCII space 1字削除のみで、製品runtime source・試験の意味は不変。前ファイルと前後hashは`evidence/r6/final/test-formatting-only-change.json`に保存し、過去の実行hashは書き換えていない。
- **C：28本・2,196 packet**。`copy-outputs-fixed/summary.json`（27本）と`cslg-copy-output-fixed/summary.json`（1本）は全件PASS。圧縮sample、時刻、対象metadata、VR情報を独立照合。
- **Worker C：2本・110 packet**。`worker-outputs-fixed/summary.json`。製品コントローラーをNodeで使用しMP4/JSONを回収。schema 2、operationId/inputRevision、prepared状態と清掃を照合。receiptの`saveCompleted=false`をブラウザ保存成功へ変更しない。
- **packet mux部分：12本・1,860 packet・計720 frame分**。`metadata-transfer-final/summary.json`。記述metadataのscope/raw保持、AAC依存表、PTS/duration、AAC時刻、ctts/cslg整合、FFmpeg復号frameの内容・表示時刻一致を確認した記録。**画素変換、WebCodecs、ブラウザ保存のPASSではない。**
- **AAC補足：6本・570 packet**。`audio-dependency-final/summary.json`。roll/prol各v0/v1/v2とsdtpのraw表・sample順・payload・時刻を独立照合。AACのみを出力する補足試験で、動画加工の成功件数には加算しない。seek再生品質は未検証。
- **独立oracle対照：24件PASS**。`metadata-transfer-final/oracle-controls.json`。誤ったsample／metadata／時刻等を見逃さないための対照結果。
- **初回FAILを保全**。`metadata-transfer/summary.json`の12件FAILは残す。T契約にない「入力映像DTS同一」を検査へ追加していた。両muxerのDTSは+1/30秒、PTS/duration不変。ctts/elst/cslgの表現変更を説明し、時刻表と全frameを照合して解消した。単なる許容幅拡大ではない。

本監査は上記summary・照合記録を読み、**48出力MP4の実体hash/size**、Workerの世代・状態、固定source graphを独立に照合した。**本監査自身がFFmpeg復号や製品試験を再実行したわけではない。**

## 残る実装・検証と統合条件

1. **補助track T（02/05/19）を次の実装対象として残す。** 時間軸不変の章・時間コードsample出力、track ID/参照維持、indexedの2track契約・出力parserの拡張が必要。fMP4、回転、HDR、mesh等も上表の依存を伴う未実装であり、ブラウザ環境だけの問題ではない。現在の拒否を永久対象外へ変更しない。
2. **T全経路を検証する。** 新構造を含む入力からWebCodecsによる画素加工・保存・出力回収までを結び付ける。AAC raw表保持とseek品質、metadata保持とVR player互換性はそれぞれ別に判定する。
3. **現行Worksへ差分統合する。** 変更対象の現行hashと基準hashを確認し、差があれば内容を統合する。v75の全Siteで現行を上書きしない。この候補の限定受入は、25項目全体・製品完成・公開完了の宣言ではない。

AAC helperの合計16 MiB、flags、sgpd v2 default indexに関する新たな受入制限は撤回済み。既存parserの受入を保ってraw表をpage単位で移す。これを全sample-group形式への対応拡大とはしない。未知の旧ISO mdirや巨大padding付きmetaを省略する既存経路も、省略記録を残し、保持済みと報告しない。

元1.98/6.54 GB動画は未受領。本r6新構造の5〜10 GB、実写、60fps、VR player、ブラウザ加工・OS保存は未検証。別候補での既存5/10 GB結果は保持し、本r6への証明には転用しない。Sites編集・ビルド・保存・公開、main/Pages反映、権限・課金・sandbox変更は本監査の対象外で、実施していない。

固定sourceの代表SHA-256（完全一覧は`evidence/r6/final/node-tests.json`）：

| `static-src/shared/vr180/`内 | SHA-256 |
| --- | --- |
| mp4.mjs | 170f9ba1ebcf0b1ca96f99bcd87ebaaf45d24836436b044a0d67c7b2f01c143a |
| container-metadata.mjs | 8d5863e67df44cc512a4a3f24e16d526369163af5d8692de964aedc8fb9644b4 |
| audio-dependency.mjs | 92c54dc3ce5d9855796b67f88822e398d1ba504c68c7ec6b4254827f50c8f761 |
| worker.mjs | a86dd942ee6130a6bfe0862492737ae18f21a60b7692762cd48768b206d2766f |

最終Node記録SHA-256：`3e975c388c0ae15bce27dec213b03a4cb4067d289f8ab01e6b821163f571a608`。最終mux記録SHA-256：`f166122511b04b52df5a5d7e2458809b66679682770bacde8423debe2cca2bcb`。
