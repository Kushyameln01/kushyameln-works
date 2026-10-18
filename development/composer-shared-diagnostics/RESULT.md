# Animator Composer 共有診断追加 — 実装・公開・検証結果

2026-10-18。**初期機能は実装・公開済み。保全計画の全体受入は未完了**。旧版の保存済み出力との比較（C01）と性能測定の残件（C12）を残している。

公開先: <https://kushyameln01.github.io/kushyameln-works/animator-composer/>

## 実装した内容

現行SitesのComposerを基準に、選択読込、構造統合、CompositionPlan復元、Unitypackage生成を保持し、任意の共有診断を追加した。診断対象は選択済み入力または直近の生成Asset。共有File SDKとcompute poolを利用し、参照、Parameter型、共有参照、明示的に保持した基準との構造・ファイル差分を表示する。

診断の成功/失敗はComposerの生成可否とは独立している。SDK以外の準備段階で失敗してもoperationIdと対象revisionを残し、未実施・実行中・成功・失敗・取消を区別する。成功以外はsdkReport:null。入力全範囲の診断と、取得したレポートの全件JSON保存を別々に記録する。

全入力とmetaをコピー前に検査する。元bufferを移譲せず、SDK内部やWorker転送用のコピーが存在することも契約に明記した。fileIDはsigned64十進文字列、原文offsetはUTF-16コード単位を維持する。JSONサイズは結果確定時に算出し、全文整形は表示/保存時に行って再利用する。画面は50件単位だが保存対象を絞り込まない。

共有SDK、WASM、既存の生成処理の出力形式を変更していない。AAC対応は操作型/保存型/登録有無を分ける設計契約として記録した。DSL、AAC移植、新しいReset操作、SIMD、常駐Workerは実装対象に加えていない。

## 固定した版と公開経路

| 対象 | 識別情報 |
| --- | --- |
| 保全元Sites | v69 / source `56ae07b48a819dad41dcbd098c8e7db4fdae7f63` |
| 同時更新への追従 | v70 / source `c36d5987ed1c368434474fbbf3a6dcbdd9e33cea`。Composerはv69と同じ。VR180更新を保持して統合 |
| 今回Sites公開 | v71 / source `724388539aaa4b3e92752f8da2a6cd7ed7ec644c`、deployment `appgdep_6ad476d438148191a4709b6b6bb19141` succeeded |
| Pages製品コード | `691e0a34df232b6f2c52509f23139779e7696e07` |
| Pages公開成功 | [workflow 39108281713](https://github.com/Kushyameln01/kushyameln-works/actions/runs/39108281713) |
| 後続の並行更新 | `85e64d5c1695a8561ca3a64e8f524a1a4e69db8c` / workflow 39108631412成功。変更はVR180側。Composer・Unity SDK・compute・FTは同一 |

公開前には構文・参照・hash・配信投影の静的確認のみを行った。Pages公開成功後に固定cloneを取得し、公開HTTPSとの照合、Node Worker検査とクラウドChrome操作を行った。主要5ファイルとSDK等18ファイルは配信実byteと一致した。照合対象を超えて全配信資産一致とは主張しない。

原「開発手順確認」チャット全文は取得できていない。ユーザーの直接指示、取得済み計画、保全計画、適用スキルに従って作業したが、原チャット全文との完全一致は認定していない。

## 検証結果

| 検証 | 結果と限界 |
| --- | --- |
| 境界回帰 | 17ケースPASS。同期/非同期失敗、取消、旧通知、preflight、JSONキャッシュ、文字列fileID、UTF-16。SDK境界mockを含む |
| 既存機能回帰 | 生成試験PASS、選択読込12群PASS。現行WorkerをNode VMで検査し、ブラウザ表示と混同しない |
| 共有GUID/JSON回帰 | 公開版8ケースPASS。GUID大小文字だけの削除＋追加を防止、曖昧性と原文値を保持 |
| 実SDK容量境界 | 実Worker/WASMでsnapshot上限とreport上限による失敗を確認。sdkReport:null、入力hash不変、同じserviceからの再開成功 |
| 実ブラウザ入力診断 | 14ファイル、14objects、36references。独立JSONを回収 |
| 実ブラウザ生成物診断 | 25ファイルの診断JSONを回収。unsupported/partialなどの未確認範囲を残す |
| 明示比較 | 同一入力は構造・ファイル・曖昧項目の差分各0。選択を1Asset外すと14→12ファイル、unselected1を記録 |
| 診断前後の生成 | 同じ公開版・同じPlanによる2packageは6510 bytesで完全一致。SHA-256 `d8c433981df08edc0e06fef9e85ed31068dc5076fd9d5cf19db2b9eed84b1a2e`。旧新版比較ではない |
| 多件数UIと保存 | 107Asset/214ファイル。512表示項目を50件ずつページ送り。missing絞込み1件でも、保存JSONには512項目全件を保持。compact 4,412,146 bytes、整形JSON 8,706,224 bytes |
| 取消・復帰 | 実ブラウザの取消JSONはcancelled/sdkReport:null。リロードせず再実行成功。生成ボタンは使用可能 |
| Composer受付範囲 | 4 MiB超textを含む8AssetをComposerは受け付け、診断はTEXT_BYTE_LIMIT。生成は成功して6518 bytesのpackageを回収。その後通常素材へ戻して診断成功 |

多件数素材にはpartial101・opaque1が含まれる。全ファイルが入力台帳に対応することと、全内容を解析できたことは別である。整形JSONの8.7 MBはSDKのcompactレポート8 MiB制約と単位・対象が異なる。

## 計測結果の読み方

実ブラウザはWorker2、moduleReuse=false、parseBatchSize8。単発記録として、通常入力の画面操作から表示まで1130.8 ms、呼出し側1128.7 ms、準備58.8 ms、SDK呼出し789.1 msを得た。多件数は画面全体5131.0 msだった。別の通常入力再開は1324.3 ms、同画面での追加実行は294.8 ms。ウォーム状態や各種キャッシュの影響を分離した比較ではない。

SDKのtotalMsは最後の容量検査・freezeを含まない。呼出し側のsdkCallMsはSDKのsettlementまで、callerElapsedMsは準備込みでenvelopeのサイズ算出前まで、UI時間は結果表示までを含む。これらは入れ子なので加算しない。容量計算のみの独立時間、診断なし/ありの同条件反復、初回読込み、ピークmemoryは未測定。速度改善・性能非劣化・メモリリーク不存在を認定しない。

## 試験時に解消した問題

- 最初の選択読込試験はテスト用harness-worker.mjsの未同梱で失敗した。現行SitesのharnessをPages配置へ対応させ、再試験12群PASS。製品ファイルは変更していない。
- 容量境界の追加試験は初回、比較payloadに対してtargetをinputにした試験コードの誤りでINPUT_FILE_COUNT_LIMITとなった。target:compareへ修正後、意図した実SDKレポート上限と復帰を確認。失敗ログも保存した。
- Sitesは初回push時に並行更新を検出した。最新版を取得し、生成manifestとpublicAssetsの統合だけを調整、VR180を保ったビルドを公開した。拒否された初回commitを公開版として扱わない。

## 完了判定と継続条件

**必須証拠が揃っていないため、全体完了とはしない。** 未解決の製品FAILを確認していないことと、全必須検証の合格は別である。

1. **C01 保全比較**：固定された旧版の保存済み出力と、その入力・Plan・revisionを確保する。現行公開版で対応する生成物を作り、Asset/metaを比較する。旧版生成器を実行して基準を作る代替手順は行っていない。
2. **C12 計測**：同じ入力・選択・Planと画面設定で診断なし/ありを反復し、容量計算区間を分けて記録する。初回表示とピークmemoryは取得可否も記録し、取得できなければ未測定とする。未測定値を推定で補わず、メモリ削減や上限保証を主張しない。反復と独立区間の未実施によりC12はPARTIALのままとする。

Unity Editor/MA/VRChat上の動作、全Unity情報の無損失編集は今回の初期範囲外。上記必須残件と混同しない。

## 証拠

- [受入条件と判定](VALIDATION.md)
- [契約](CONTRACT.md) / [作業ログ](WORKLOG.md)
- [証拠manifest](evidence/manifest.json) / [ブラウザ操作記録](evidence/browser-actions.json)
- [証拠ZIP](evidence/evidence.zip)：合成素材、Plan、回収JSON/package、ログ、公開取得記録、画面
- [公開版画面](evidence/published-proof.jpg)

入力は検証専用の合成素材。実ユーザーのUnity素材や認証情報は証拠に含めていない。
