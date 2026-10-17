# VR180 公開経路への接続案

2026-10-17。**未実装・未公開の設計メモ**。公開ソースの読解基準は `196435c704e1fb2c64dd2076b85546bbc1e17aca`、public build は `vr180-b7-phases1`。同時進行の非公開試験と本メモを、公開製品への反映済みとは扱わない。

まず非公開 5 GB 試験の実生成・加工・保存・全回収・独立検査を判定してから、以下の実装担当を確定する。10 GB profile の有効化には 10 GB 自身の合格が必要であり、5 GB 合格から外挿しない。上限値は当該 profile の合格記録と対応させる。両 profile の成功、公開許可、OS 保存操作や対象 VR プレイヤーの合格を本メモでは宣言しない。

参照資料の固定値（原資料本文は本書に複製しない）：

| 資料 | 版・照合範囲 | 読取本文 SHA-256 |
| --- | --- | --- |
| VR180 改善実装計画 | 1.2、主に §7・§9・§10、P1/P2 の既存契約 | `d329792bbcf23d461dedac658554d6a6a56b1128c8df786ea3beae8b70f48d5c` |
| Unity Hike WASM 技術 Tips 統合版 | 本文 1.2・保存版 2、処理区間・資源所有・世代・配信照合 | `fb6727101501575e034939703824ff821bc5e52ede70bfafbea97b5b45800ad9` |

## 採用する入口

大容量の索引退避は `convert + outputHandle` に追加する。既存の handle なし prepared、copy、OPFS 不要 direct は維持する。計画 §7.1 は能力と上限が異なる経路の追加を認め、§7.3 は外部 writer への最終 metadata と commit を扱うため、この限定は容量拡張の目的と整合する。大容量 prepared 出力まで同時に新設する必要はない。

これは計画全体の完了条件を減らす判断ではない。実写素材、対象 VR プレイヤー、初見操作、長尺 AAC・60fps は、それぞれ独立した未確認事項を維持する。保存ダイアログの API があるだけでは実際の OS 操作成功としない。

`route-profile.mjs` で必要能力・入力/最終出力上限・選択実装を確定する。コピーと解析は codec vendor を取得しない。旧変換は既存 `transform.mjs` だけ、新経路は indexed module と combined fork だけを遅延 import する。同じジョブで元版と fork のクラスを混在させない。必要な OPFS SyncAccessHandle、Web Locks、codec、保存 handle が足りない大容量要求は理由付きで拒否し、巨大な旧経路へ fallback しない。現行上限内の OPFS 不要 direct は引き続き選択可能にする。

## ファイルの担当と変更順序

| 担当案 | 所有する変更 | 出口 |
| --- | --- | --- |
| A：索引実行部・配布 fork | 新 `docs/shared/vr180/indexed/` の index-store、job-owner、input-index、presentation-index、output-index、output-inspect、indexed-transform。VR180 専用 vendor と出典・source・patch・再現 build 記録 | 単一 fork の結果契約、保存観測、清掃、上限が固定 |
| B：利用 API・Worker・回収 | `worker.mjs`、`client.mjs`、新 route-profile/ownership-registry。必要なら codec を import しない recovery Worker | schema 2、能力別選択、永続 ticket と回収の状態遷移が成立 |
| C：画面・説明 | `vr180-studio/app.mjs`、`index.html`、VR180 README | 合格 profile を選べ、必要条件と失敗後の次操作が分かる |
| 統合担当 | `security/public-files.json`、既存 Sites build と `scripts/sync-static.py` による公開検査、配信証拠 | VR180 の明示依存だけを反映し両 origin を検証 |

順序は profile 固定 → A の結果/保存観測契約 → B の registry と routing/receipt → C の UI → 公開対象検査・再現 build → 許可された反映と公開後検証とする。`shared/media-basic/vendor` は置換しない。既存 `file-output.mjs` と `save-record.mjs` は、具体的な不足が出るまで変更しない。

配布する fork は固定元 `0664a57bf2f40e5c4efa176c75ebf1d60df69eb8`、元 source tar、出力/入力 patch、変更後 source、固定 build 入力、配布 module SHA、既存 MPL-2.0 の対応を記録する。公開モジュールから `development/` を import せず、私用 fixture の入力受理 opt-in を製品に移さない。入力は現 public strict inspector を維持し、生成済出力の `cslg` 検査は出力専用の役割に限定する。

## 保存契約の接続

現在の public transform は未 commit の `direct` を返し、Worker が最終タグ付与と保存を行う。private indexed transform は既に commit と保存後検査を済ませて返す。単純な import 差替えでは接続できない。

結果を `legacy-prepared`、`legacy-direct-pending`、`indexed-direct-saved` で区別する。indexed 結果では `file/saved/savedInfo/verification` から schema 2 の direct 試行を構成し、`tagMp4` と `finalizeDirectOutput` を再実行しない。public Worker の `Boolean(outputHandle) === Boolean(direct)` は結果種別に応じた検査へ改める。

private transform の現在の `finally` は、保存後検査が済んでも清掃失敗時に return を例外へ置き換える。このため、全検査が完了した時点で immutable な `savedObservation`（bytes/hash/savedInfo/verification/timings）を確定し、後続の清掃失敗・取消・metrics 通知失敗にも添付する。Worker は verified 試行を保持し、失敗診断にも同世代の output または `preparedBeforeCancel` を残す。現 `save-record.mjs` は output の根拠がない passed 試行を拒否するため、`output:null` だけにしてはいけない。

commit 済みで検査未完なら committed と failed/canceled を分けて残す。全体 SHA は保存後観測値、metadata の SHA は事前期待値との照合として扱う。保存済 MP4 は清掃対象にしない。追加保存・その取消・古い世代からの応答によって完了した保存試行を書き換えない。

## 永続 ticket と清掃

`tools/vr180/probe-indexed-conversion.py` で実証した 2 tickets・各 1 KiB 以下の caller registry を独立 module 化する。対応する index を作る前に write → flush → readback → close → closed File 再読まで await し、operationId/inputRevision/固定 namespace と結んだ通知をページにも返す。0/1/2 tickets の途中失敗を扱う。

正常・失敗とも、live cleanup と handle 終了を待った後、対応する両 job lease を取得して owner と job 不在を再確認してから registry を削除する。Worker が消失した場合は明示 ticket による `cleanupAbandonedIndexJob` を使い、未知 owner、壊れた記録、lease 競合、清掃 HOLD は保持する。明示された自分の registry を上限付きで表示し、選択 job の回収を実行する。期限での自動削除、広範囲なディレクトリ削除、変換再開は追加しない。

`client.cleanupDeadWorker` にある「known commit なら清掃完了」という現 direct 向け短絡は indexed に適用しない。外部保存の unknown と内部索引の清掃は別状態にする。unknown の明示終了も、未清掃 ticket の消去や保存成功への変更を意味しない。registry は所有資源の回収根拠であり、外部保存の結果を推測する台帳ではない。

既存 native registry 証拠は SyncAccessHandle の書込み・再読・正常清掃を検証している。`2026-10-17-indexed-registry-native.json` が未確認とする reload 後保持、製品復旧 UI、UI crash recovery、電源断耐性を、今回の接続で検証せずに達成済みへ変えない。

## 区間・UI・反映

P2 の既存 filePhases を保ち、indexed metadata の期待 hash、保存後 metadata 読戻し・再解析、spool write/seal/flush/close、range read、registry persistence、清掃の duration を区別する。要求 bytes と成功 bytes、索引 budget とブラウザ総メモリ、main と Worker の時計は区別する。重複区間の和を総時間としない。

画面は作成前の保存先選択から合格 profile に到達できる構成とし、保存先必須、能力不足、清掃再試行、保存不明を説明する。profile/fork/索引の詳細は診断へ置く。正常な旧 prepared/direct/copy の利用手順を維持する。

公開では `security/public-files.json` の明示一覧と既存 export/build を通し、VR180 の必要依存だけを追加する。原資料全文や `development/` 全体を公開しない。build ID、相対 URL、module MIME、Worker 起動、Pages/Sites の対象配信 SHA を確認する。配布 bytes、import 回数、起動時間も P2 と同じ条件で記録する。

## 受入試験

1. import/network の観測で legacy は元版のみ、indexed は fork のみ、copy/inspect は両者 0 を確認。OPFS のない上限内 direct を維持する。
2. indexed 成功時にタグ生成と commit がそれぞれ一度だけ実行されることを確認する。
3. verified 後清掃失敗、commit 後照合失敗、各区間の取消、queued result の取消、A→B 入力変更と旧応答、追加保存取消で schema 2 の既知事実を維持する。
4. registry 0/1/2 tickets、partial write、close/remove 失敗、同 ID 衝突、未知 owner、Worker crash、同 origin での再読と明示回収を確認する。
5. 旧 SBS/TB・180/360・4K・AAC 回帰と、profile の最終 bytes、10万 samples、16 MiB metadata、8 MiB 索引の境界を検査する。
6. 公開候補で実 handle 保存・全 bytes 回収・全 frame/packet/PTS/AAC/VR の独立照合を行う。OS picker が操作できなければその項目を NOT VERIFIED とする。
7. private 5/10 GB の根拠と公開 adapter の根拠を分ける。接続差分は小素材と境界から検証し、媒体処理・上限に影響する差分があれば該当する大容量条件を再試験する。反復分布、実写品質、VR プレイヤーや初見操作は別の判定として残す。

本メモの保存による製品コード・上限・配信の変更はない。
