# 自然N2のMemory・staging観測

固定runtime `e48021d8da29ef3b3b9e9d6161331c282798b6b3`、handoff `78a3268166eca63e5daafb1b21e184224c4d14b1` を変更せず、別のdiagnostic observer/harnessで測定する。受入単位は実Rect meanと固定明示noise、HIGH1/LOW3、実block0 prefixから全2query/all40head attentionのbefore Oまで。元grid、元workflow入力、元production精度、全model、HIGH→LOW受渡しの数値受入を含めない。`load/predict/sample=NOT_READY` を保持する。

## 最終結果

[HIGH receipt](high-browser.json) と [LOW receipt](low-browser.json) は、それぞれprefix14段階・後段11比較を全値でPASSし、失敗0だった。新hidden・座標・source IDのbitsが従来actualと一致したため、正式local参照を再利用した。composed参照は独立prefix由来のまま分けた。artifact自体は新private JSONであり、そのSHAと新producer receiptを保存した。

| 指標 | HIGH | LOW |
| --- | ---: | ---: |
| distinct ORT Memory / 各ownerのORT session | 1 / 2 | 1 / 2 |
| ORT線形Memory容量・high-water | 16,777,216 B | 16,777,216 B |
| prefix active Hike 4個の容量 | 5,046,272 B | 5,046,272 B |
| downstream active Hike 4個の容量 | 4,915,200 B | 4,915,200 B |
| downstream attention / local 最大絶対誤差 | 5.137920379638672e-5 | 2.09808349609375e-5 |
| prefixからのcomposed attention 最大絶対誤差 | 5.841255187988281e-5 | 2.2172927856445312e-5 |
| 未帰属module / 未観測Memory import / 観測失敗 | 0 / 0 / 0 | 0 / 0 / 0 |

各sideで9個のMemory identityを時系列に観測した。これは同時に9個がliveだったという意味ではない。prefix dispose直後も旧4個が見えたため記録へ残し、その後の自然GCで不可視になった箇所をnullで保持した。LOWのdownstream構築時には旧prefixを含む9個・26,738,688 Bを観測した。HIGHでは旧分が先に不可視になり、その時点の全identity容量合計はnullとなる。これらはrealmの線形Memory観測であり、OS/host総peakではない。

prefixの実Linear入力snapshot累積は各side341,319,680 B、downstreamは353,894,400 B。raw/decoded/ORT weight snapshotのextentはphase別に保存し、copy累積をlive RAMへ読み替えていない。最終phaseではnative dispose後もcaller-owned typed arraysとartifact/参照表現の保持を明示する。各side15 phaseへ集約し、2,600回のbounded progress点でcapacityを更新した。

observer12件、実行source・cleanup境界2件、Python入場3件をPASS。固定89 source・28 runtime imports・29 kernel receiptのbuild整合検査もPASSした。[検証記録](verification.json) に最終source/receiptの照合結果を置く。BrowserでのGC強制、full model推論、全量hash/download、大容量allocation、旧receipt変更、commit/pushは行っていない。

## 固定条件と証拠の区別

数値gateは旧prefix計画と旧downstream計画の事前固定値をそのまま使う。新resource計画は最終受入run前にtopology・hash帰属・観測完全性の条件を固定したもので、容量bytesの合否閾値は設定していない。先行探索とsuperseded runがある。source一覧の区別、getter import未観測の明示、cleanupとcaller-owned出力の保持を独立reviewで修正し、過渡receiptはprivate領域に保存した。最終sourceを固定した後に両sideを直列で再実行した。割込みで止めた過渡runも最終受入へ含めない。

旧98 asset/89 source package、旧producer/reference receiptの照合は再利用証拠の整合性確認である。今回の実行sourceは各最終receiptの `actualExecutedSourceSHA256`、新prefix artifactのproducer範囲は `freshProducerReceipt.producerSourceSHA256` に分ける。今回のPython orchestrator、pipeline、observerとfresh realmで実ロードした固定module/WASMを列挙し、旧hidden/head browser harnessを今回実行したとは表示しない。moduleのロードは全exported関数の実行を意味しない。

## 測る値と残る不明点

hashで帰属した実Memoryのimport/export identityをWeakRef/WeakMapで観測し、同一ORT Memoryをsession数から重複計上しない。各tile後に容量を更新し、operator先頭・prefix/downstream完了・dispose barrierに集約したphaseを保存する。任意getterを二重評価せず、未観測importがあれば理由と完全性を報告し、今回の受入では未観測0を要求する。

native ownerのdisposeと物理MemoryのGCは別に記録する。旧prefix Memoryがdispose後もWeakRefで見えればrealm記録から除外しない。見えなくなったMemoryの現在容量はnullとし、過去high-waterを保持する。強制GCは実測browserで使わない。browser closeはside間barrierとして記録するが、owned PSSやprocess終了を測っていないため0 B回収の証拠にはしない。

raw/decoded tile、ORT weight/X snapshot、hidden/QKV/norm/RoPE/contextを同じphaseのnamed spansに列挙する。sourceに基づくextentと既存ownerの実copy累積を区別し、異なる時点のspanを合算してhost peakにしない。dispose後もcaller-owned出力とhidden/座標のtyped arrays、artifactのNumber配列と文字列、private参照JSONが残ることをfinal phaseに明示する。

ORTの線形Memory容量とそのhigh-waterを測る。allocator live bytes、session別allocation、JS allocator/GC、File backing、parsed参照のheap、OS PSS/RSS、全体peakはnullのままとする。fingerprint用byte snapshotとResponse cloneも計測用copyであり、そのhost peakは未測定。実測時間をproduction throughputの予測に使わない。

## 再現

```sh
node --expose-gc --test --test-isolation=none tools/diffusion-models/test-resource-observer.mjs
node --test --test-isolation=none tools/diffusion-models/test-resource-browser.mjs
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-resource-browser.py
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/resource-browser.py \
  --model-dir /private/models \
  --private-hidden-dir /private/prefix \
  --private-heads-dir /private/heads \
  --private-output-dir /private/new-resource-artifacts \
  --output-dir /path/to/new-public-receipts
```

`/private/prefix`には正式receiptに一致する `{high,low}-prefix-reference.json` と従来 `{high,low}-prefix-actual.json`、`/private/heads`には `{high,low}-local-binding-final-reference.json` と `{high,low}-composed-reference.json` が必要。原本はside別の既存safetensors名を使う。出力private dirは新規作成し、artifactもpublic最終receiptも上書きを拒否する。`--validate-only` はbrowser構築前の入場確認だけ行う。

HTTP serverはrepository `docs`だけを配信し、symlink等のescapeを拒否する。原本はbrowserのlocal Fileで渡し、private参照はPlaywright引数で渡す。private arrays/modelをHTTP公開せず、公開receiptはhash・gate結果・metricsだけを保持する。NodeのWeakRef境界テストはGCを使うが、実モデル測定のbrowserではGCを強制しない。
