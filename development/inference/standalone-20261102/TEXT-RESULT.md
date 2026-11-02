# Text単体検証結果

**Text全体は未完了。T1の入力契約とT3の取消・復帰・保存は完了したが、T2の全有効ID512 caseが固定数値gateに不合格である。** 計画した数値9caseはすべて実行済みで、8caseがPASS、1caseがFAIL。T1の旧source未記録の結果と、新しいNN0結果の実行後source照合を区別する。別入力の合格で既知FAILを補わない。

| 項目 | 判定 | 確認範囲 |
| --- | --- | --- |
| T1 入力・Tokenizer・拒否 | 完了 | b3e5/ref5954指定で9 valid / 9 reject、Worker0/NN0/export0。記録された配信source全17件は独立した実行後補足でGit/current bytesへ照合 |
| T2 数値domain | 未完了 | 9case実行済み。全有効 `id-l512-all-active` のmaxAbsが0.001を超過 |
| T3 取消・復帰・保存 | 完了 | 実Browserの9controls、同一APIの通常復帰、native WKT保存読戻し、終了後の所有process確認 |
| 固定promptの資源比較 | 既存履歴のscopeを再利用 | 04d/44b/eabの `Hello world` 比較済み。eabはRSS低下・時間増。b3e5での新対比較や一般的な速度向上へ付け替えない |

通常入口は既存の独立ES module API、版は `works-ai-1` のまま。独立参照、比較gate、詳細receiptは任意の開発診断資料であり、通常のconfigure/encodeやconditioning消費の必須入力にしない。[API.md](API.md) と [再現手順](REPRODUCE.md) を参照する。

## 実行sourceと固定契約

| 識別 | 用途 | 完全source SHA |
| --- | --- | --- |
| R | 9case独立full512 FP32参照 | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` |
| N/B | 今回のT1 NN0・Node6case・Browser T3。T1のsource照合は実行後補足 | `b3e5e34430d58bca3bf69b8938ba87beb196d054` |
| D | 先行Nodeの通常empty完了case | `dccb88515775ec8aa86dd16f82e8816c9347ed38` |
| C | 既知FAILの全有効ID512 Browser canary | `5e6ebe212ca3c079f5d4cf65cf3fd24c4bc6f97f` |
| 配布 | GitHubから実取得したfull512 fixture | `411210c5ebbd4f4dfb8e72e9dd97bff1a3712a4e` |
| 既存資源baseline | 固定 `Hello world`、prepacking既定 | `04d1447e3531836adbb013314e716f2403895443` |
| 既存資源候補 | prepacking停止のみ | `44b188633343cc2c93ea6f85aac348059ac42757` |
| 既存資源改善 | incremental hash＋prepacking停止 | `eab4fabfadd133cc97434eed28ea998dca6795c2` |
| 既存資源比較の参照 | 固定 `Hello world` の独立full512参照 | `5537b8932343aa2476b95191817e8913f99dab02` |

配布commit、実NNのproducer source、独立参照sourceを区別する。後日の文書・receipt追加で過去の実行SHAを付け替えない。

| 契約 | 固定値 |
| --- | --- |
| 原UMT5 model SHA-256 | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| Tokenizer SHA-256 | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` |
| 選択manifest SHA-256 | `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f` |
| native出力 | float32 / BLC / `text_hidden_states`、全mask、model/Tokenizer識別を保持 |
| 最終正規化 | 実Hike RMSNorm、`umt5-final-rmsnorm-f32-v1` |
| 比較gate | maxAbs≤0.001、atol=0.001、rtol=0.001。全要素finite、masked行は厳密0 |

原scaled FP8値を展開したFP32診断であり、元GPU FP8演算との等価性は主張しない。plain入力は固定Tokenizerによる通常textのみ。Comfyの重み付きprompt構文・prompt処理やfull workflow品質はこの受入範囲に含めない。

## T1とT2のdomain結果

新T1 NN0 preflightは実行b3e5・参照5954を指定し、9 valid / 9 reject、Worker0/NN0/export0で合格した。ただしharnessのpreflight分岐は起動前のGit一致を強制していない。独立した [実行後source照合](evidence/text-t1-b3e5-served-source-verification.json) が、記録された配信source全17件のbytes/SHA-256を `git show b3e5:...` と実行後のcurrent bytesへ照合した。この補足は13,623 B、SHA-256 `cd2e07d654781ad00afa50204bf65ca98a392d7c53c3db46113b054c6c460572`。これを起動前source guardとは表記しない。Browser/local serverを閉じ、観測owned live/zombie/errorsは空だった。

旧 `/tmp/text-standalone-t1-browser-localhost/browser-results.json` もNN0で9 valid / 9 rejectを確認したが、`executionSourceSha` と `referenceExecutionSourceSha` は両方nullである。この旧結果をRやN/Bへ帰属させず、新しい [T1 receipt](evidence/text-t1-b3e5-preflight.json.gz) と区別する。

IDの合法範囲は0〜256383、返却Lは1〜512。空plain、多言語・改行、EOS込み512、overflow、plainとIDの混在、空ID、全mask0、不正ID・mask・長さを扱う。Worker/NNを開始する前の入力検査と、実NNの数値比較を区別する。固定入力は [predeclared-plan.json](text/predeclared-plan.json) にある。

独立参照Rは各caseをbatch1・未短縮512位置で全24 source blocksへ通し、最終正規化とmasked zeroingの後に要求されたID出力Lへsliceした。9case参照を再利用し、今回のNode/Browser結果に合わせた参照再計算はしていない。

| 数値case | 返却L / 有効位置 | 実行host・source | 全値maxAbs | 判定 |
| --- | ---: | --- | ---: | --- |
| `plain-empty` | 512 / 1 | Browser B。先行Node Dも同値gate合格 | 0.000004172325134277344 | PASS |
| `plain-multilingual-newline` | 512 / 17 | Node N | 0.000005245208740234375 | PASS |
| `plain-long-eos512` | 512 / 512 | Node N | 0.00039987266063690186 | PASS |
| `id-l1` | 1 / 1 | Node N。Browser同一API復帰も合格 | 0.000032901763916015625 | PASS |
| `id-l2` | 2 / 2 | Browser B、block00だけbytes map | 0.0000042691826820373535 | PASS |
| `id-l511` | 511 / 2 | Node N、末尾mask | 0.00011438131332397461 | PASS |
| `id-l512-trailing-mask` | 512 / 2 | Node N、末尾mask | 0.00011438131332397461 | PASS |
| `id-internal-trailing-mask` | 512 / 2 | Node N、内部・末尾mask | 0.000003814697265625 | PASS |
| `id-l512-all-active` | 512 / 512 | Browser C | **0.0016480088233947754** | **FAIL** |

各比較は有効行だけでなく返却tensorの全値を検査した。全有効ID512も全2,097,152値はfiniteだが、maxAbsとallcloseに不合格。L511/512の末尾mask caseは短い有効prefixを使い、密な512位置は長文plainと全有効ID caseで別々に検査した。`id-l1` は合法ID0、`id-l2` はID0と256383を含む。

既知FAILはsource Cのまま保存し、N/Bで無条件に再推論していない。gateの緩和、ID0の禁止、mask・入力の差替え、合格に合わせたsource backendの選び直しは行っていない。bucket一致、block0/SDPA、全24層の局所・伝播traceは原因切分けの診断であり、FAILの解消や数値受入へ読み替えない。

## 全512有効IDの追加診断

[block19限定比較](evidence/text-block19-options-acceptance.json) をsource `5b784339a6caf83728a529522538fd43d5fb68f8` で実行した。保存済みの独立sourceS18、sourceS19、同じgraph19、同じ全512maskを使い、元79d traceのALL local出力SHA `fefbdb6e6f8e9543401dba3c3951a0f232380fcc0b4621b9651b7b3880169aa4` を再現してから、最適化設定だけをDISABLEDへ変えた。graphと入力は各実行の前後で再hashし、変化がないことを確認した。新しいmodel/export/独立参照/full24推論は0。

2,097,152個のraw hidden全値を独立sourceS19と比較した。中間hiddenの尺度は最終conditioningとは異なるため、最終出力用gateをこのraw中間tensorへ適用しない。weighted-normの全値診断は両方へ同じHikeを適用し、別の独立Torch4行参照との照合も保持した。最終conditioningの独立全値比較や最終gateの再評価に読み替えない。

ALL/DISABLEDのrow0 weighted-norm最大誤差は両方 `9.655952453613281e-6`。RMS比は `0.9996249849837958`、方向残差最大値の比は `0.9982180601726074` で、事前の診断停止条件どおり `STOP_MARGINAL_LOCAL_DIFFERENCE` となった。設定探索を終了し、productionの算術・graph・gateは変更していない。既知の全24層FAILは保持する。

実sessionは2作成・2release、run2、Tensor6dispose、最大active1・終了時0、dispose/release errors0。Node自己計測のpeak RSSは3,155,918,848 B、wall104.401581秒で、F80 VAEと並行した診断時間。所有Python/Nodeを実行中に観測し、終了後は両PIDの不在を確認した。[process補足](evidence/text-block19-process-observation.json) にlate observerが終了済みNodeへattachできなかった記録も分けて残す。このjobの全期間RSS/PSS samplingや資源guard合格は主張しない。

## T3の実Browser結果

Browser Bはnormal case `plain-empty` と `id-l2`、取消後の `id-l1` 復帰の計3件を全24層まで完了した。8件の中断jobを含めnative job attemptは11件、観測した実 `Worker.terminate()` 呼出しも11件。9controlsには正常emptyの保存中に行うhost revision取消が含まれるため、control数・中断job数・正常NN件数を混同しない。

| control | 観測した境界・結果 |
| --- | --- |
| `cancel-save` | 実serializerのawait後にhost保存revisionを失効。download公開なし |
| `cancel-file-load` | File読込み開始で取消、旧結果を公開しない |
| `cancel-file-bytes` | Fileのbytes化で取消、旧結果を公開しない |
| `cancel-bytes-map-hash` | block00だけのbytes mapをhashする経路で取消、旧結果を公開しない |
| `cancel-hash` | graph hash境界で取消、旧結果を公開しない |
| `cancel-session-create` | 実ORT session作成境界で取消、旧結果を公開しない |
| `cancel-run` | 実ORT run境界で取消。同じAPIの新revisionで `id-l1` を正常再実行 |
| `reconfigure-session` | session作成境界の再configureで旧jobを失効 |
| `dispose-run` | run境界のdisposeで旧jobを失効 |

9件ともtriggerを観測し、旧download/結果の公開を拒否した。保存取消はhost revision guardであり、moduleの `cancel()` がcodec処理自体をabortしたとは主張しない。各境界はobserverで実際に確認したもので、ORT内部の特定命令で停止したことを意味しない。

復帰 `id-l1` は同一APIのrevision1から2へ進め、元R参照の全4,096値でmaxAbs `0.000032901763916015625` に合格した。実保存した `recovery-cancel-run.wktensor` は16,848 B、SHA-256 `30b38bb5bb0f595a29875dd5f410dabcb17dd639c55cf7e2acb1049db162de6c`。Node Nの同入力WKTと全bytesが一致する。native codecによる全値・descriptor・model/Tokenizer・normalization・全maskの読戻しと、payload/maskの独立所有を検査した。controlが使う未選択の復帰入力もNN前に参照bytes/hashを照合している。

## 資源・終了確認

| 実行 | 全体wall time | own Node RSS peak | sampled所有group RSS sum peak | complete PSS sum peak |
| --- | ---: | ---: | ---: | ---: |
| Node N、6case | 2274.958092233006 s | 3,173,502,976 B | 3,242,471,424 B | 未測定 |
| Browser B、T3全体 | 1353.2021264990035 s | 対象外 | 6,906,658,816 B | 6,620,222,464 B |

Nodeのgroupはharnessと所有Node子process、Browserは起動・正常処理・取消を含むharness descendantsの観測値。RSSは共有pageを重複計上し得る。PSSは取得できた全processが揃うsampleだけでpeakを算出し、RSSへ加算しない。公称sample間隔はNode0.1秒、Browser0.05秒だが、実最大sample gapはNode **5.997645475988975秒**、Browser **3.2571342149894917秒**。短いpeakを逃す可能性があり、端末の最低RAM・専有性能・速度改善の保証ではない。

Node Nは各caseで24 session create/run/release、Tensor dispose72、最大active1・終了時0。全24 graph FDと元source FDが閉じ、元6.735 GB sourceの実読出しは26回・212,992 B、最大slice8192 Bだった。prepared graphだけ単一ArrayBufferへ最大8 MiBずつ読み、小さいassetのnative Blobと元source readerは維持した。Nodeの通常結果は `diagnostics:false` で、session/Hike観測は外側receiptに置く。

Browserの正常2caseと復帰caseも各24 sessionをreleaseした。Browser/local server終了後、両hostの観測owned live process・zombie・cleanup errorはすべて空。強制取消時のWorker内finally実行、CDPによる全Worker targetの閉鎖前不在、物理RAM解放までは証明していない。ここでの取消証拠は実terminate呼出しと旧結果失効、OS process終了確認の範囲に限る。

Node24.19のBlob chunk保持と最終concatによる追加copyは [NN0 read probe](text/evidence/read-probe/README.md) で確認した。同一block00の読込みRSSは約1.586 GBから実production readerの約0.807 GBになったが、全NNの資源改善へ換算しない。

### 固定Hello worldの既存資源比較

公開済みの [Textメモリ比較結果](../text-memory-20261102/RESULT.md) と [SUMMARY](../text-memory-20261102/SUMMARY.json) は、同じplain `Hello world`、有効ID `[23231,3914,1]` と残りmask0、同じmodel・graph・manifest・Tokenizer・5537独立full512参照・gateを使う3runの証拠として再利用できる。今回そのraw receiptを再読し、入力・参照recordが3runで完全一致することを確認した。新しい5954の9case参照やb3e5の実測へ帰属させない。

| 既存run | 意図した変更 | sampled group RSS sum peak | 通常full NN時間 | 全値maxAbs |
| --- | --- | ---: | ---: | ---: |
| baseline04d | prepacking既定、全量WebCrypto hash | 5,708,951,552 B | 117.26390000000596 s | 0.0000034570693969726562 |
| 候補44b | prepacking停止のみ | 6,007,259,136 B | 101.66310000000149 s | 0.000003069639205932617 |
| 最終eab | incremental hash＋prepacking停止 | 4,490,174,464 B | 388.52140000000594 s | 0.000003069639205932617 |

3runとも全2,097,152値・固定gateに合格し、paddingは厳密0、24 session release、全helper終了後のowned live/zombie/errorsは空。baseline→eabはこの固定診断のsampled RSS和が21.35%低下した一方、通常時間は3.313倍だった。prepacking停止のみの44bはRSS改善として不合格であり、速度改善は認定しない。最終RSS和も4 GiBを超える。旧eabのWKTはnormalization fieldがない旧形式のまま保持し、実Hike実行の証拠と今回b3e5のmarker付き保存契約を区別する。旧bytesへ新metadataを追記しない。

共通条件は実File-backed入力、Chromium154.0.8037.57のheadless `--no-sandbox`、service worker block、ORT1.24.3/WASM1thread、graph optimization省略時の既定all、4core quota/16 GiB cgroup・8 GiB task leaseでの各1回の直列比較。baselineのdisable-prepackingは未指定、44b/eabは `'1'` という意図した差がある。RSS/PSS samplerと `plain_memory.mjs` は同一だが、eabではhash observer・module route/source proofも追加され、helper全体のbyte同一や全option同一は主張しない。

OS cache/GCを強制・同一化しておらず、実sample gapはbaseline0.6304837319985381秒、44b0.3894167349935742秒、eab1.1013744600059秒。raw receiptのfull/cancel完全group PSSはnullで、startupの完全PSSをfullへ流用しない。この履歴は固定prompt・過去sourceの資源証拠であり、b3e5の新しい対比較、密な512有効位置、巨大bytes Map、一般端末の予算やfull workflowの資源保証は未実測・未認定である。[元再現手順と制約](../text-memory-20261102/REPRODUCE.md) を維持し、過去比較の再利用だけを理由にNNを追加しない。

## 取得できるfixtureと証拠

[full512-conditioning](text/full512-conditioning/README.md) は、実 `plain-long-eos512` 出力と独立参照を取得できる開発fixture。WKTはfloat32/BLC `[1,512,4096]`、mask512個すべて1、最終RMSNorm markerを保持する。合成plain `a` ×511 + EOSの1caseであり、Bernini・重み付きprompt・full workflow品質の代用ではない。projection・cross-attention・そのFFNの責任はDiffusion側に維持する。

| 実GitHub取得artifact | bytes | SHA-256 |
| --- | ---: | --- |
| [conditioning.wktensor](text/full512-conditioning/conditioning.wktensor) | 8,390,098 | `03b5f0cc3febd68503c56e6f9f8d32a22e1600fb7db4989c35ab475c5a10ea6f` |
| [独立full512参照](text/full512-conditioning/diagnostic/plain-long-eos512-reference.f32) | 8,388,608 | `6d684253cf55507dcb5e5d10b9b35970d271314131954bc614ae1954ed91312e` |

配布411210cからGitHubのmanifestと実binaryを別途downloadし、公開fixtureとの全bytes/hash一致を確認した。[取得receipt](evidence/full512-fixture-411210c-acquisition.json) は送付側の実取得証拠であり、受信者ACKや新しいmodel NNではない。fixture内の途中snapshotにあるhost最終cleanup未確定という記録は、当時のcase抽出時点を表す。完了後のhost判定は本書と下記final summaryで扱う。

| 証拠 | 内容 |
| --- | --- |
| [Node final summary](evidence/text-node-single-array-six-final-summary.json) / [native receipt](evidence/text-node-single-array-six-native.json) | 6case全値・codec・session・FD・終了確認 |
| [Node親receipt gzip](evidence/text-node-single-array-six-acceptance.json.gz) | 元の全progress・資源sample・全値比較。可逆圧縮 |
| [Browser T3 final summary](evidence/text-browser-t3-final-summary.json) / [親receipt gzip](evidence/text-browser-t3-acceptance.json.gz) | 9controls、3正常NN、復帰保存、観測と終了確認 |
| [独立参照receipt](evidence/text-independent-reference-results.json) | Rの9case未短縮full512 source参照 |
| [T1 NN0 receipt](evidence/text-t1-b3e5-preflight.json.gz) / [実行後17 source照合](evidence/text-t1-b3e5-served-source-verification.json) | b3e5/ref5954指定の9 valid / 9 reject。起動前Git強制とは区別 |
| [全24層native trace](evidence/text-fixed-oracle-native-trace.json) | 旧失敗canaryとのbitwise一致と固定gate FAIL。診断実行完了を数値合格へ読み替えない |
| [evidence index](evidence/index.json) | 公開receiptのbytes/SHA-256。gzipは展開後の元bytes/hashも保持 |

新規に完了したNode6case・Browser T3と、再利用した独立R参照・旧empty・既知FAILを分けて記録した。再exportと全9case oracleの再推論は行っていない。[再現手順](REPRODUCE.md) と [固定domain・oracle手順](text/REPRODUCE.md) は実行sourceを指定し、既存証拠を上書きしない新規outputで用いる。Text全domain受入、下流consumer実接続、management保存、製品生成READY・ACKは未認定のままである。
