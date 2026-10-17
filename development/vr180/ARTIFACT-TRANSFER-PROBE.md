# 64 / 128 MiB Actions artifact 全回収試験

この専用試験は、公開してよい合成データを Actions から作業側へ全回収できるかを確かめる。既存の 8 MiB ログ転送とは別の試験であり、ブラウザの保存操作、実動画変換、VR 再生、5～10 GB 対応や処理性能を合格にしない。試験コードは `tools/vr180/probe-artifact-transfer.py`。製品配信には含めない。

## 実行範囲と保持条件

- 公開リポジトリ `Kushyameln01/kushyameln-works` の `codex/vr180-plan-*` 候補ブランチを exact commit で実行する。64 MiB を一往復してから、128 MiB を一往復する。合計の生データは 201,326,592 bytes。自動的な繰返しや 5 GB 試験への拡張はしない。
- 新しい公開サーバー、有料 runner、外部ストレージ、キャッシュ、課金設定変更を導入しない。公開合成データだけを artifact に保存する。実素材、秘密、認証情報は含めない。
- `actions/upload-artifact` は公式 v4.6.2 の commit `ea165f8d65b6e75b540449e92b4886f43607fa02` に固定する。`retention-days: 1`、`compression-level: 0`、`if-no-files-found: error`、`overwrite: false` とする。64 / 128 MiB は別 artifact。生成先ディレクトリの内容だけをアップロードする。
- upload step は生成コマンドが成功した場合に限る。`always()` で不完全な生成先を成功用 artifact として公開しない。1 日の期限切れ前に全回収・独立照合を完了する。
- 各 artifact 名は `vr180-transfer-<64|128>mib-<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>`。run ID、attempt、branch、commit を manifest と独立に取得した API metadata で確認する。異なる試行の同名ファイルを混ぜない。
- 現在の接続ツールに artifact 削除 API はない。即時削除を保証しない。API の `created_at` / `expires_at` を回収記録に残し、保持期間が 1 日（時刻丸めの許容 60 秒）を超える場合は受入不可とする。実際の期限後削除の確認は別の観測であり、この試験の PASS に含めない。

計画 1.2 §8.3 は「既存Actionsの条件変更は、保持先と費用・データ公開範囲を確認した別差分として設計する」と定めている。即時 artifact 削除を必須とする記述はない。内部 OPFS の所有権付き清掃や利用者の保存済み MP4 を削除しない契約とは区別する。

## 生成側

```sh
python3 tools/vr180/probe-artifact-transfer.py generate --size-mib 64 --output "$RUNNER_TEMP/vr180-transfer-64-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
```

128 MiB では `--size-mib 128` と異なる出力先を指定する。既存ディレクトリを上書きしない。実行時の GitHub 環境変数、checkout の HEAD、commit 内の試験スクリプトの全 bytes を照合する。

1 MiB の block ごとに `SHAKE256(seed + NUL + decimal-offset)` から実 bytes を生成し、8 MiB の chunk に順次書く。各 chunk を flush / fsync し、すべての実ファイルを読み直して全体 SHA-256 と各 chunk の SHA-256 を確認する。疎ファイルや同一 Blob の参照だけで容量を作らない。seed から計算した期待値だけで全回収成功とはしない。

manifest は試行 ID、commit / branch / run / attempt、スクリプト hash、入力ストリームと書込み後読戻しの bytes / hash、chunk の順序 / offset / length / hash、生成方式、保持設定、制限、空きディスク観測を含む。input は生成ストリームであり、実動画や別の全量入力ファイルが存在したとは記録しない。

データを生成する Python の payload buffer は 1 MiB。これは Python のプロセス全体や upload action のメモリ上限の保証ではない。生成の時間上限は 300 秒。workflow 側にも step / job timeout を設ける。64 / 128 MiB 以外は CLI が拒否する。

## 全回収と独立照合

1. 接続済み GitHub の `fetch_workflow_run_artifacts` で対象 run の artifact を取得し、必要なら名前で絞る。このツールは先頭ページだけなので、試験専用の固有名を指定する。
2. `download_workflow_artifact` へ artifact ID を渡し、返された ZIP 全体をローカルへ取得する。同ツールは一時 redirect を追跡できる。64 / 128 MiB の実転送上限はこの試験で観測し、既存の小 ZIP 成功から保証しない。
3. API が返した artifact object、又は `artifacts` 配列を JSON に保存する。metadata を manifest の内容から捏造しない。
4. 次の受信側コマンドへ、試験開始時から把握している run / attempt / commit / ref を明示する。

```sh
python3 tools/vr180/probe-artifact-transfer.py verify \
  --size-mib 64 --archive /absolute/path/downloaded.zip \
  --metadata /absolute/path/github-artifact.json \
  --run-id RUN_ID --run-attempt 1 --commit EXACT_40_CHARACTER_COMMIT \
  --ref refs/heads/codex/vr180-plan-EXACT_BRANCH \
  --output /absolute/path/new-recovery-directory
```

検査器は ZIP 全 bytes の SHA-256 を独立取得した API `digest` と照合する。ZIP 内の重複名、余分な entry、欠落、ディレクトリ、symlink、暗号化、想定外の圧縮方式やサイズを拒否する。8 MiB chunk を 1 MiB ずつ読み、全 bytes を独立生成した期待値と比較し、各 chunk hash / CRC を EOF まで確認する。全 payload を `reconstructed.bin` へ順序どおり書いて fsync し、完成ファイルをもう一度全読出しして総 hash を照合する。

`ZipFile` を作る前に、末尾最大 65,557 bytes から EOCD を読み、64 MiB なら 9 entry、128 MiB なら 17 entry、単一 disk、central directory 最大 32 KiB、archive 内の連続した directory extent を確認する。bounded directory を独自に走査し、全 entry の期待名・件数・サイズ、name 最大 64 bytes、extra 最大 512 bytes、entry comment 最大 256 bytes、archive comment 最大 1,024 bytes、local header の同じ名前と extra 上限、payload extent を確認する。manifest の展開後サイズも、この段階で 64 KiB 以下を要求する。巨大な件数を `ZipFile` に先に materialize させない。

小容量でも ZIP64 end record を出す実装に備え、固定 56-byte ZIP64 EOCD と 20-byte locator を限定的に受け付ける。拡張 record、複数 disk、矛盾した通常 EOCD、上限を超える count / directory は拒否する。各 entry は 8 MiB 以下であり、central entry の巨大サイズ・offset sentinel は必要ないため拒否する。local header 内の ZIP64 サイズ extra は 512-byte 上限内で受け付ける。`ZipFile` 後にも件数を照合する。

ZIP の格納方式は STORED と DEFLATE の両方を受け付ける。圧縮レベル 0 でも DEFLATE の非圧縮 block として表現される場合があるためであり、ヘッダの method だけでは圧縮レベルを証明しない。レベル 0 の指定は固定 workflow を根拠とする。生成コードの payload buffer は 1 MiB、受信側は読出し block と独立期待値の比較で最大約 2 MiB を使用する。いずれもライブラリやプロセス全体の最大メモリ量とは区別する。

出力は `reconstructed.bin`、元の manifest、`recovery.json`。回収記録は API metadata、ZIP hash、受信先全 hash、実読出し bytes、全 chunk 検査、欠落 / 重複、未検証範囲を保持する。payload を base64 にしてログへ流さない。失敗時には当該呼出しが作った不完全な `.partial` だけを削除し、取得元 ZIP と既存成果物は保持する。

## ディスクと停止条件

両コマンドは作業先の実 `shutil.disk_usage().free` を観測する。入力全量、chunk 全量、ZIP 全量、復元全量の重複を保守的に予約予算へ含め、`4 × payload + 2 MiB + 128 MiB` 以上の追加空き容量を要求する。64 MiB は 386 MiB、128 MiB は 642 MiB。このチェックはファイルシステムの容量予約ではないので、後続 I/O エラーも失敗として扱う。64 / 128 を同一 runner で行う場合も、それぞれの開始時に再観測する。

実装は生成側に chunk 全量、受信側に既存 ZIP と復元全量を保持する。upload action の実装が一時 ZIP を作る可能性を予算から落とさない。ZIP は `payload + 2 MiB` 以下、manifest は 64 KiB 以下。受信も 300 秒を上限とし、各 block 間で期限を確認する。停止中の OS I/O 自体を Python で強制終了する保証ではないため、外側のコマンド timeout も使う。

失敗、quota 拒否、期限切れ、未回収、一部 chunk だけの成功はその容量の全回収 PASS にしない。64 MiB 失敗後に 128 MiB へ拡張しない。試験容量が成功しても 5 / 10 GB 用には入力・出力・OPFS・索引・一時 archive を含む予算を実 bytes で再計算し、runner の実空き容量と全回収経路を別途確認する。

## 確認済みの経路と一次資料

既存 Pages artifact `12094408674`（run `39016378757`）は 3,809,002 bytes の ZIP 全回収と CRC が記録済み。API digest と取得 ZIP の SHA-256 は `a78ae16c306ec4bc9f8b135877b4ec7cb786fbf0a377b1848d2ac075d464d286`。API metadata の保持期限は作成から約 1 日。この証拠は download connector の小容量動作の根拠であり、本試験の代わりにはしない。

- [公式 upload action の固定版入力仕様](https://github.com/actions/upload-artifact/blob/ea165f8d65b6e75b540449e92b4886f43607fa02/action.yml)：保持最小 1 日、圧縮レベル 0、artifact ID / digest 出力。固定 SHA の tag 解決とソース確認日：2026-10-17。
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)：公開 repository の standard runner 利用は無料。private repository の無料枠、artifact / Packages の共有 storage、時間単位の蓄積課金も説明している。アカウントの実残量・請求額は本試験では未取得であり、公開 artifact が無制限という保証にはしない。課金設定を変更しない。
- [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)：公開 repository の標準 Ubuntu runner は 14 GB SSD。これは実行時の空き容量ではない。
- [Artifacts REST API](https://docs.github.com/en/rest/actions/artifacts)：download は Actions read、delete は Actions write。一時 download URL の有効期限は 1 分。API metadata の digest と ZIP 全 hash を照合する。
- [Artifact の削除と保持](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts)：手動削除には write access が必要。今回は保持 1 日を指定し、接続ツールに存在しない削除操作を実行済みとはしない。

現時点の区分：スクリプト設計・局所検証と、実 Actions upload / 全回収試験を区別する。64 / 128 MiB のクラウド試験結果は実行後の `recovery.json` によってのみ更新する。

局所検証では CLI の本番許可容量を変更せず、import した試験プロセス内だけを 1 MiB / 4 chunk に縮小した。ZIP STORED と DEFLATE level 0 の全往復、CRC と API hash を整えた破損 bytes の拒否、offset / chunk hash / API hash / run / attempt / 保持期間の不一致、余分な entry / path traversal、空きディスク不足、期限超過の 13 条件を確認した。これは 64 / 128 MiB のクラウド全回収結果ではない。

レビューで指摘された `ZipFile` 構築前の metadata 上限不足を修正した後、追加の局所 15 条件を確認した。STORED / DEFLATE / 限定 ZIP64 の全回収、EOCD の件数・directory サイズ・offset、archive comment、central name / extra / comment、local extra、manifest 展開サイズ、ZIP64 拡張 record / 100 万 entry、末尾付加 bytes を試験した。不正 metadata の各ケースでは `ZipFile` を呼ぶと即時失敗する置換を使い、上限検査で先に拒否したことも確認した。
