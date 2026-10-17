# P3 独立レビュー記録（非公開試作の最終コードレビュー）

記録時刻: 2026-10-17T13:04:14.596285+00:00
Reviewer: `/root/tips_review`。製品・試作コードは編集していない。Node局所試験だけを独立実行した。実ブラウザ試験は本記録時点で未実行。

## 判定の範囲

公開runtimeへ取り込まない出力索引試作、固定Mediabunny 1.61.5の2ファイルpatch、controller、metadata spool、private output-only parser、Node比較とnative cloud probeを対象とする。公開parser/共有vendorの受入条件の拡大は承認しない。5/10GB、入力索引、WebCodecs変換、VRプレイヤー、大容量全回収の合格には数えない。

## 必須所見と是正

1. **配列viewの背後の保持量**: 旧controllerは6744-byteの有効H.264 key packetが8MiB backingを持っていても受理し、4MiB profileに対しliveChunkBytes=6744と報告した。固定upstreamはpacketをcopyしない。是正版は各保持entryの全buffer.byteLengthを保守的に加算しcapを適用。8MiB subview拒否、共有3MiB buffer二参照拒否の回帰を当方でもPASS確認。copyやchunk順の変更は導入していない。
2. **metadata検査中のdispose**: 旧controllerはstoppedフラグだけでprivate parserの外部signalに取消が届かなかった。内部AbortControllerをstore/parserへ伝搬しdisposeでabortする修正を確認。作者の実fork `p3-output-index-faults-small-v3/probe.json` はmetadata slice=1でAbortError、handle/lease解放を記録。
3. **async書込みの境界**: Writer.flushは外部sinkのackではない。固定StreamTarget chunked1MiB/HWM1で当方が4ms遅延sinkと有効1000 packetを実行: finalize成功、sink8 calls、pending最大2件/2MiB、終端pending0、handle/lease0。2回目sink拒否はSLOW_SINK_REJECTED、finalized=false、pending0。上流cancelがerrored streamへcloseして別errorを返すため、controller清掃は独立finallyで行う。native probeは固定設定と所有者ごとの独立清掃を採用。任意target/HWMへの一般化は未検証。
4. **実行版の証拠**: fork bundle hashだけでは別importのcontroller/store/parser版を特定できない。比較harnessにruntime source hash開始/終了一致のassertを追加したことを確認。最終12比較は `p3-output-index-shared-lease-final/comparison.json` の全12 row PASSを確認。各childの開始/終了runtime hash一致、現ファイルとの一致も直接確認。
5. **I/O増幅**: rootが見つけたIndexStoreキャッシュ無効化による約6.99GB readの対策を独立確認。成功writeのcache重複範囲だけを反映し、他pageを維持。同page appendの連続prefixを延長。partial/cancel失敗後のstore poisonは維持。17試験PASS。

## 独立実行した確認

- `node --test tests/vr180-index-store.test.mjs`: 17/17 PASS。
- `node --test tests/vr180-output-index.test.mjs tests/vr180-output-index-parser.test.mjs`: 9/9 PASS。
- private parser loaderで未変更の `tests/vr180-mp4.test.mjs`: 25/25 PASS。16MiB超stsz、末尾異常、4GiB超range、ctts、取消、拒否条件を含む。
- fixed tarball内2 TS原本、2-file patch、public/private parser、private parser patchのprovenance SHAを直接照合し一致。
- `python -m py_compile tools/vr180/probe-output-index.py`: PASS。ブラウザ実行の代用にはしない。
- 旧6全file+6全packet比較のJSONを読解。全PASS、fork SHA `8346d2bdeda770ec24d73383419b471b8554ce0162b7466161151f6f9be6c233`。改修前の結果は改修後の受入へ流用しない。

## native probeの実cloud前レビュー

`probe-output-index.py` の現版に実行前の必須blockerは見つからない。

- 必要なimport全routeを列挙し、loopback配信を元bytesと照合する。共有harnessがcandidate commit/clean checkout/fixed fixtures/Chrome sandboxを検査する。
- 単一fork、専用Worker、native OPFS/SyncAccessHandle/WebLocksを使用。HWM1/1MiB StreamTargetを固定する。
- 成功はmetadata spool検査→Output.finalize→外部transaction commit→保存metadata hash→保存構造検査→全ファイルdownload→hostのsize/SHA一致。
- 陰性は取消または固定target failureの正確なerror/phaseを要求し、未commit、0-byte、aborted状態を確認する。
- controller budget0、job領域なし、leaseなしを確認。独立finallyで各所有者を清掃。最後の清掃はランダムな自harness namespaceに限定し、残leaseがあれば削除せずBLOCKED。
- Playwright route callbackは1引数lambdaで既知の引数上書き不具合はない。
- 全体hashは保存後観測とhost回収の同一性であり、変換前の期待hash比較とは区別する。独立media acceptanceは明示的にPENDING。
- workflow側で渡すbundleが純core再現gateとfork buildの記録SHAに一致することをrootに依頼した。

## 本記録時点のsource hash

| 対象 | SHA-256 |
|---|---|
| `development/vr180/output-index-prototype/output-index.mjs` | `812d284e501017a634d2852a14b1d2c41cf65b74fe514b41d8883b968941364c` |
| `development/vr180/index-prototype/index-store.mjs` | `a9d6c420e8acd894a0a657120c9f78765766c698103cf52bd18b7793472d0e7d` |
| `development/vr180/output-index-prototype/mp4-output-inspect.mjs` | `d841bab27d299316a890f8b16c628ed486ea803982269293f3faf10fe66ef229` |
| `docs/shared/vr180/mp4.mjs` | `1e7189d7b4d9e55b7502fb4d3b985bf8344a1b905bfa1942a926c388345bb892` |
| `development/vr180/output-index-prototype/mediabunny-output-index.patch` | `0f33762be867a42315b1c3d50a2ef3c990755a7afc72c8238382fc09b86585e3` |
| `tools/vr180/probe-output-index.py` | `ec3ed4778ee672edba1cd4fea73d1b6de2c4c8f791b16c9d2fc73bda50785715` |
| `tools/vr180/compare-output-index.mjs` | `0bb845aa9ddc74ee0ea89f6c6a24c6d1d3c9d15200b9548d195e9df628fc52b1` |
| `tools/vr180/probe-output-index.mjs` | `9942959f15e452d48fec6dbe972df106726a08191d6aa7dbac3b5f14bca58213` |

## 残る受入ゲート

最終runtime版の12比較と小素材Node回帰は完了。native cloud実行・全出力回収・独立media検査は本レビュー後に実施するゲート。計画7.5の長GOP/4GiB境界と実Chrome資源ピーク等は各試験の根拠を別に記録する。出力索引の局所成功から製品統合・上限解除・大容量対応完了を推定しない。

## 最終確認追記

確認時刻: 2026-10-17T13:05:51.424820+00:00

**この固定版の非公開Node試作として、残る必須コード是正なし。native cloud試験へ進める。P3全受入、公開統合、大容量対応完了とは判定しない。**

controller SHA `812d284e501017a634d2852a14b1d2c41cf65b74fe514b41d8883b968941364c`。input/output controllerのouter job排他を共通 `vr180:index-job:<jobId>` へ統一した最終差分を確認。最終版のstore/controller/parser 26試験を当方で再実行して全PASS。

- 最終12比較: `evidence/p3-output-index-shared-lease-final/comparison.json`。5k/25k/100k × 単調/交互cttsの全file size/SHA一致、全packet検査終端到達。forkは固定SHA `8346d2bdeda770ec24d73383419b471b8554ce0162b7466161151f6f9be6c233`。各生成の実行前後runtime hashと現ファイルは一致。
- 最終fault/small: `evidence/p3-output-index-shared-lease-faults/probe.json`。7失敗/清掃条件＋4 SBS/TB・AAC/no-AAC remux、全11条件の記録を読解。metadata scan取消slice=1。小素材は60/155 packetを各条件で照合。Node small loopは初期化後からcontroller/inputのouter finally、output cancel/fd/inputの独立finallyを持つ。
- private parser25回帰は前掲通り独立PASS、同parser SHAに変更なし。native harness SHA `ec3ed4778ee672edba1cd4fea73d1b6de2c4c8f791b16c9d2fc73bda50785715` の静的レビュー・compileに残blockerなし。

同一最終trialの100k測定を以下に抜粋する。1回のNode観測であり速度分布・browserピークの証拠ではない。明示索引buffer予約peakは全6生成で2,062,912 B。sample-table readは6.4MB索引に対し約405MBで、改善後もI/O増幅が残る。

| pattern | generation ms 元/候補 | 終端GC後 heapUsed B 元/候補 | 候補 sample-table read B |
|---|---|---|---|
| monotonic | 867.125 / 3604.548 | 23830016 / 8817384 | 405532864 |
| alternating-ctts | 591.457 / 3972.803 | 30338584 / 8778776 | 405469056 |

## native初回の契約漏れとレビューの訂正

記録時刻: 2026-10-17T13:11:47.651640+00:00

初回cloud run `39035239264` / job `117403610016` は、共有 `emit_evidence` が必須とする `result['runId']` をprobeのreport初期化で設定しておらず、KeyErrorで証拠archiveを回収できなかった。前掲の「実行前blockerなし」レビューは、この呼出し先とのデータ契約を見落としていた。この点をレビュー不備として訂正する。初回の媒体処理成否は、回収不可のため不明のままとする。

rootがrunId初期化を追加し、前提検査で失敗する局所経路でも実 `emit_evidence` を呼び、識別可能なBEGIN/END付き完全archiveが出る回帰を追加。当方も `test_vr180_output_probe.py` 1試験を独立実行しPASS。修正後native harness SHAは `ed8806c80e99d2bc16c666c25cff6973669a08ba5ed9e392cfafea0411f28cbb`。root報告の再試行 `39035356458` は完全archive回収済みで、独立媒体検査は別の受入ゲートとして継続する。


## native 再試行と独立 remux 検査の最終確認

確認時刻: 2026-10-17T13:17:10.042070+00:00

`development/vr180/evidence/2026-10-17-output-index-native.json` と `2026-10-17-remux-oracle-contract.json` を直接読解した。再試行 `39035356458-output-index-1` は完全 archive と全出力を回収し、固定未改変版の reference 再生成について開始・終了の runtime hash 一致、入力／出力 hash、単一 original bundle の記録を持つ。出力 25,601 B の SHA-256 は `c1e060620cb334bfc69f2cc696a15e0267b9d7bcfad1912866ab69e726d8b722`。

独立検査器 `tools/vr180/verify-conversion-large.py` SHA `713a6ff75001b01792645fcf35cc792ce83cb70b833a66321f055754b9dabda5` の追加 remux 分岐をコードで確認。ffprobe/ffmpeg と既存 Python metadata verifier を用い、製品 IndexStore／fork を oracle として使わない。copy の元 mdat・offset・table 同一条件は不変。remux は全 H.264 packet の順序・payload hash・decoder config・flags・side data と PTS/DTS/duration を確認し、画素完全一致を要求する。逐次走査、欠落検出、終端到達、最大時間誤差と packet 位置の記録を保持している。

- 原素材 → native 候補: 既存 convert 条件（180/SBS/eye256、画素幾何の変更なし）で PASS。全 60 frame、全 95 AAC packet、全 RGB、192,512 PCM bytes が一致。全区間走査完了、エラー 0。
- 未改変固定 muxer reference → native 候補: 新 remux 条件で PASS。全 60 H.264 packet、全 95 AAC packet、config／flags／side data、PTS/DTS/duration、全 RGB と PCM が一致。全時間誤差 0、全区間走査完了、エラー 0。
- 原素材 → native 候補の厳密 remux 初回は DTS 1/30 秒差で FAIL（60 件、details 32 + dropped 28）。未改変 muxer も同じ再構成を行うため比較境界を明記し、FAIL 原文を別記録に保持している。これを原 DTS 保存の成功とは読み替えない。

当方は新規実媒体 3 試験を独立実行して PASS、さらに DTS 2ms／flags／payload 変異が拒否される helper 故障注入を確認した。最終 18 試験全 PASS は root の実行記録による。native 証拠と現検査器 SHA の一致を直接照合済み。残る必須 oracle 是正なし。この判定は小素材の private encoded-remux／native OPFS／保存・取消・故障・全回収の範囲に限定し、WebCodecs 変換、実 >4GiB、5–10GB、headset、製品公開の合格へ拡張しない。


## P4 入力索引・combined Node 試作の独立レビュー

確認時刻: 2026-10-17T13:19:14.498071+00:00

**計画 1.2 §8.1 の非公開 Node 試作として、残る必須是正なし。** これは入力／出力索引の局所受入であり、native combined WebCodecs・実大容量・利用先・公開の受入は含まない。

対象を直接読解した: `input-index.mjs`、`presentation-index.mjs`、固定 demuxer patch と作成 script／provenance、build-input-index、input-only／combined 比較 harness、局所試験。固定 source.tgz の demuxer 原本 SHA と patch 適用後 SHA を別の一時ディレクトリで独立照合し一致。

- 公開 strict inspector の範囲走査を default に使用する。元ファイルの sample/chunk offset を保存し、small metadata skeleton から全 sample/timing/chunk/key table を外す。retained codec description は skeleton 全体の backing を保持しないよう切り離す。
- 固定 source の同期 table getter 呼出しを全箇所確認。metadata と packet/time/key/sample-info の既存 async 契約へ adapter を await し、未対応同期 getter は明示拒否する。sample ごとの full 配列への暗黙 fallback はない。
- `(PTS, decodeSampleId)` の固定 workspace heapsort、disk run の fan-in 8 以下 merge、disk inverse rank により同一 PTS の順序と最後の duration を固定版に合わせる。元 DTS・AAC edit offset と packet side data を別に保持する。seek/duration ごとの索引再作成はない。
- 64KiB table/store page、8MiB shared explicit budget、sort 合計 4MiB、pending operation 8、tracks 2、100k total samples の制限を確認。16MiB small metadata 上限等は別枠で明記されており、index budget を browser 全体メモリと読み替えない。OPFS／Web Locks 不足時の in-memory fallback はない。
- input/output outer lease は共通 prefix と別 job ID を使用し、同 ID は所有前に拒否。partial I/O・取消・merge generation・close failure/retry を確認。失敗 store の所有権と retryCleanup を維持し、他 job を削除しない。

レビューで修正した事項:

1. 任意入力に private output parser を適用していた点を修正。default は未変更 public parser、固定 muxer 作成 fixture のみ `fixedMuxerFixture: true` と CLI 明示指定を要する。default cslg 拒否と opt-in profile 記録の回帰を追加。native WebCodecs 入口は別途 public transcodeSafe 条件を維持する。
2. 先行 cancel/dispose/close 例外が後続 owner 清掃を飛ばしていた harness を `cleanupAll` に修正。全 owner を独立試行し AggregateError で失敗を残す。
3. bundle hash だけだった比較記録へ runtime 外部 source 全体の開始／終了 hash と一致 gate を追加。
4. input-only harness の controller 生成後・try 前の Input 構築／hash I/O を cleanup 範囲へ移動。欠損 Input/BlobSource module を実 import する失敗回帰で、job directory 空、lease/handle/budget 0 を確認。

当方独立実行: 最終 `node --test tests/vr180-input-index.test.mjs` **14/14 PASS**。co64、12-byte stsc の page 境界、6000 mapping、negative/equal PTS と多段 merge/inverse、全小 fixture、短 I/O、取消、8-request queue、別 ID/同 ID、budget failure、cleanup retry、default admission と故障 cleanup を含む。

保存比較の直接照合:

- `p4-input-public-2`: 小素材 3 条件、465 packet。
- `p4-input-fixtures-2`: monotonic／alternating ctts × 5k/25k/100k、260,000 packet。
- `p4-combined-public-2`: 小素材 3 条件、465 packet。
- `p4-combined-fixtures-2`: 100k × 2、200,000 packet。

上記 14 条件は全 PASS。各 case の runtime 開始／終了 hash は一致し、レビュー時点の現物とも一致。全 payload／metadata の終端到達、清掃 0 を確認した。combined は同一 fork 内の Input/Output、同一 shared budget、別 ID で実行し、reference 全 file bytes/SHA と全 packet が一致。shared reservation peak 最大 **4,989,240 B**。旧 sort 合計 5,794,304 B の試行は受入から除外され、失敗理由を保持している。

最後の初期化 cleanup 修正では controller/presentation/patch は変更なし。旧 14 比較の結果を旧 harness hash に結び付けたまま保持し、成功経路は `p4-input-cleanup-public-3` / `p4-combined-cleanup-public-3` の各小素材 3 条件で再確認して全 PASS。これら 6 case の開始／終了 hash と最終現物一致を当方でも確認した。巨大な追加反復を要求せず、実変更に対する故障回帰と正常回帰を受入根拠とする。

最終 source SHA-256:

| 対象 | SHA-256 |
| --- | --- |
| input-index.mjs | `7218cbf72e5a7c477af75f891f064d286b13b9e183f64934697bc369ed674bce` |
| presentation-index.mjs | `da4c9c11aae35a5efb07771f7734304879fd0fe9673179809c0360fe5205f55b` |
| mediabunny-input-index.patch | `78d58817a74896e7f1840096c20df67c82d038d5c724c2136f905e6dc9e02feb` |
| compare-input-index.mjs | `cbf52fe8b13f48b40d4dd1bdd54437ec0930f7839161db3f17fd3ef67bb22237` |
| compare-input-output-index.mjs | `8f861f00c5534a1b5e943934a0ae9f4f2ed0c7091b69ee1dfed68d4eb0f5dca9` |
| vr180-input-index.test.mjs | `083fc60833abe617705b31bf54e8bb0fd19de6b1f752fca51353e4117626a6a4` |

未検証を保持する: combined native OPFS と WebCodecs 画素変換、browser 全体資源と速度、save/cancel dialog、実長尺・実 >4GiB・5–10GB の全出力回収、headset／利用先。AAC seek group 未再生成の制約は解消していない。局所 Node 比較で速度優位は主張しない。公開 `docs/` runtime／input acceptance／既存 direct OPFS 不要経路はこの試作で変更しない。


## private indexed transform / native probe の実行前レビュー（修正待ち）

確認時刻: 2026-10-17T13:23:49.869737+00:00

`development/vr180/indexed-transform-prototype/transform.mjs`、patch、provenance、局所試験、`tools/vr180/probe-indexed-conversion.py`、candidate workflow の新 job を読解した。修正前 transform SHA `697abbd742975ae27ca137da62d94ddac895c35f0fc8429ec6c7f4d0ed783223` の局所 9 試験は独立 PASS。実 WebCodecs の代用とはしない。

必須是正:

- 保存後に public input parser を使用しているため、有効な固定 muxer の cslg 付き出力を拒否する。既存 P3 出力 `p3-output-index-shared-lease-faults/small-sbs-true.mp4` に対し、public parser は unsupported cslg で FAIL、既存 private output parser は 60 video + 95 AAC に PASS を当方で再現した。入力は public のまま、保存後だけ既存 private output parser で厳密検査する修正を依頼。stub の 9 PASS ではこの要件を満たしていなかった。
- 作者が固定 MediaSource.close の onTrackClose 未 await を検出し、root 承認で対応中。非同期 closeTrack の reject を finalize へ伝搬し、残 AAC コピーなどで finalize が遅延しても unhandled rejection を出さないことが必要。元拒否 Promise を保持した観測 handler と await の最小変更を検証中。

上記を除き、native probe の実行前必須 blocker は現時点で見つからない。固定 combined bundle の純 core 再現 gate／patch build／source hash、clean exact checkout、配信全 route bytes 一致、単一 Worker/fork、runId、sandboxed Chrome、固定小素材 7 条件（正常 6、取消 1）、全 6 保存出力の再読・SHA/size・download・host SHA/size、取消後同 handle 再実行、index directory/lease/budget 0、専用 namespace の終了清掃を確認。公開経路・OS picker・大容量・利用先の合格は主張せず、独立 media acceptance は PENDING のままとする。

`tests/test_vr180_output_probe.py` の実 emit_evidence を使う前提失敗回帰は当方で 2/2 PASS。以前の runId 見落としを再発させない契約を確認した。

無音 fixture 2 本の入力／出力 SHA と bytes を provenance に照合し、独立 ffprobe で各 60 video packet の PTS/DTS/duration/size/flags/data hash/side data が原公開合成素材と全件一致、音声 track 不在を確認した。公開媒体からの動画 packet copy + 音声除去であり、ユーザーの媒体ではない。

これは修正待ち時点の記録であり、cloud 実行・公開許可や最終 source 受入ではない。修正後に固定 hash と必要な回帰を追記する。


## private indexed transform の最終実行前判定

確認時刻: 2026-10-17T13:24:58.428646+00:00

**指定された小素材の native cloud 試験へ進める。実行前の必須是正は残っていない。** まだ cloud WebCodecs 成功・最終媒体品質・大容量・公開の判定ではない。

修正後 transform SHA `f6d11006a01aad71e678c63cd413bfcdda1efec282415953df79cf149763ea89` を直接読解し、最終 10 局所試験を当方で独立実行して全 PASS。保存後のみ `inspectSavedOutput` が既存 private output parser を呼び、入力 preflight と input index default の public parser は不変。新回帰は未改変固定 module で実 cslg 媒体を生成し、保存後検査 PASS と実 convertStereo 入口の拒否、資源取得 0 を検証する。実 WebCodecs ではない点を維持する。

出力 patch 第 3 source `src/media-source.ts` の差分は onTrackClose の await と元 `_closingPromise` を置換しない catch 観測のみ。close() の void 契約を維持し、finalize/cancel が元の拒否を受け取る。固定 tar の 3 原本 SHA、patch SHA、適用後 3 source SHA を当方で独立照合した。

`probe-source-close.mjs` を読解し、3 種の real IndexStore 故障（遅延 finalize 前 read failure、finalize 待機中 write failure、cancel 待機中 abort）の before/after 証拠を直接比較した。旧版は各 unhandled 1 件、cancel が誤って resolved。新 output／combined は各 3 条件とも unhandled 0、terminal が元 close error と一致して rejected、必要な待機を観測し、清掃後 handle/lease 0。before 記録は保持されている。これは作者の実行記録のレビューであり、当方がこの 6 probe を再実行した主張ではない。

固定 build 2 件の純 core byte 再現 PASS、fork build PASS、保存 bundle の実 SHA を照合した。修正後 output bundle は `5c97e2e45a2e4d4ac659f6574c3862182fe541a36fc861d80f171eb3cd3f8023`、combined は `65a96894f5442fe92d3672e09b80e6841b7a30a745b002b071636352f5b790cd`。修正前 `8346d2…` の native remux 記録と `6860f1…` の input/combined 比較は、その旧 bundle の証拠として保持し、新 bundle の cloud 成功へ流用しない。

実行前に確認した固定値:

| 対象 | SHA-256 |
| --- | --- |
| private transform | `f6d11006a01aad71e678c63cd413bfcdda1efec282415953df79cf149763ea89` |
| transform patch | `ba8608f431e572becbf844aa03231e86e53ee0b4e4ed3bc68381b0c2657ce3ae` |
| 3-source output patch | `b46f0e1a97b0bb5b3527f59ec1db13b0274a40882e204e694f3f98a7552bd35d` |
| native conversion harness | `09c75c5d5abfcca7dc6001448b94931642488ec3e2789cd08398d45cb0d4cca8` |
| source-close harness | `30b0edebc97c3a0ff2d947be7985b1967b2b1580f1dccbf58e6546063ebf671f` |
| indexed transform tests | `4928bb5a821a22d0a17bf6145823014ba181223d860a234be0d823bcf09f60ae` |
| candidate workflow | `0c552faf978a8101b322ff3e664967b5fcdcf4558fbc377be3314137d3b69bc8` |

public transform SHA `7bd8ade1…`、public worker SHA `54104a2e…` は provenance と一致し変更されていない。host 容量復旧中のため追加大出力は生成せず、cloud 後の全出力回収・独立画素／時刻／音声／VR 検査を次の gate とする。
