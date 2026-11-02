# VAE 単体検証結果

VAE の単体検証は実行環境 unavailable により中断している。target の **81×480×832 encode と独立 raw latent decode は、通常 API・実 CPU WASM・全値比較で PASS** した。source F1、F4 encode、F5 both、reference の非正方形を含む下表のケースも PASS している。source F80 encode は接続喪失により成否未確認、reference F1 848×848 は最後の観測時点で未着手。VAE 全体の完了は宣言しない。[中断と再開条件](STATUS.md) を参照する。

ここでの受入は、明示した合成入力、元の BF16 係数を FP32 に展開した演算、固定したモデル・graph・実行 source の範囲に限る。実媒体、元実装の BF16 演算との一致、Diffusion からの実生成結果、全 workflow の受入は含まない。証拠の入口は [evidence/index.json](evidence/index.json)。

## 通常 API と入力契約

通常の入口は `createVaeModule()` または共通 hub の `createInferenceAPI()`。`configure({ manifest, files })` に実際の全 asset の FileMap を渡し、`encode` / `decode` を使う。既定の `diagnostics:false` で返るのは `{ tensor, inputDescriptor, binding, processing }`。比較用 reference や検証 report は通常 API の必須入力ではない。詳細は [API.md](API.md)。

stream manifest の kind は `wan21-vae-stream-v1`、profile は `wan21-raw-f32-stream`。構造上の対応範囲は以下のとおりで、対応宣言と各形状での実測受入は区別する。

| 操作 | 正確な入力 shape | 正確な出力 shape |
|---|---|---|
| encode | float32 NCTHW `[1,3,F,H,W]`、整数 `1≤F≤81`、H/W はそれぞれ 16〜848 の 16 刻み | `[1,16,T,H/8,W/8]`、`T=1+floor((F−1)/4)` |
| 独立 raw decode | float32 NCTHW `[1,16,T,h,w]`、整数 `1≤T≤21`、h/w はそれぞれ 2〜106 の偶数 | `[1,3,1+4*(T−1),8h,8w]` |

正方形の制約はない。encode の `raw-decoder-rgb` は [-1,1]、`rgb-unit` は [0,1] を Hike で `2x−1` に変換する。出力は未標準化・未サンプリングの `raw-posterior-mean`。独立 decode は `wan21-raw-latent:v1` を受け、encode 出力や生成 producer receipt を要求しない。正規化済み mean を raw として読み替えず、decode RGB を clip しない。

source は実際に渡された F を保持し、最初の 1 frame と、その後の完全な 4 frame 群を消費する。owner 内で入力を短縮、pad、downscale しない。

| 実入力 F | latent T | 消費 frame | 未使用 tail |
|---:|---:|---:|---:|
| 1 | 1 | 1 | 0 |
| 4 | 1 | 1 | 3 |
| 5 | 2 | 5 | 0 |
| 80 | 20 | 77 | 3 |
| 81 | 21 | 81 | 0 |

source/reference の resize と slot 対応は管理側で行う。形状の基準は管理 baseline `5ab651395e245e35f9472ca1b24f5e61550a9957` の `docs/shared/ai-connection/workflow-shapes.mjs`（Git blob `bcd35f37114c792c55af4f016f1b378465ba9249`）。reference は長辺 848・stride 16・ties-to-even の規則に従う。VAE は前処理済みの正確な tensor を受ける。

`capabilities({operation,input})` は data を持たない正確な descriptor で照会でき、NN や Worker を起動しない。F>81、範囲外または非 16 刻みの RGB 空間、異なる N/C/dtype/layout/meaning はこの manifest の domain 外。実行環境、asset の欠落・サイズ、実行時の bytes/hash・graph metadata も別に検査する。threads は 1 または 4 で、4 には実際の cross-origin isolation と SharedArrayBuffer が必要。1 thread への黙示 fallback は行わない。domain 内という宣言だけで、すべての形状の数値やメモリを受入済みとは扱わない。

## モデル・source・graph の同一性

| 対象 | 固定した同一性 |
|---|---|
| 元モデル | `wan_2.1_vae.safetensors`、253,815,318 B、194 keys、SHA256 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` |
| 独立 oracle の元 source | Wan-Video/Wan2.1 `9737cba9c1c3c4d04b33fcad41c111989865d315`、`wan/modules/vae.py`、SHA256 `4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498` |
| graph export source | `a7573012e98b6b94ad2c56788b4c14907f262201` |
| target81 独立 CPU reference 実行 source | `05198dba7959cc95e0c4d770fd85557ad4010a80` |
| target81 実 WASM 実行 source | `d578ec006571d82bc50c6c2935d78ae6ea838269` |
| source F4/F5 実 WASM 実行 source | `dccb88515775ec8aa86dd16f82e8816c9347ed38` |
| ORT / Hike | ORT WASM 1.24.3、Hike `tensor.wasm` SHA256 `9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8` |
| threads=1 manifest | [vae-stream-manifest.json](evidence/vae-stream-manifest.json)、51,613 B、SHA256 `64c57a7aeb5e8fcb5089b8d5771ce293b8355e365f2fd5cfe80df0840ca85345` |
| 実受入の threads=4 manifest | [vae-stream-threads4-manifest.json](evidence/vae-stream-threads4-manifest.json)、51,613 B、SHA256 `532523034a5e5c7590c4fca11d67feec329c6e0e364afd55f472f03ffd8966d2` |

BF16 で保存された係数を変更せず FP32 に展開している。[partition-inventory.json](vae/partition-inventory.json) は 69 ONNX unit graph と Hike 用 `conv2.weight` / `conv2.bias` の 2 asset、合計 71 asset・507,834,866 B（manifest 除外）の ID、bytes、SHA256、入出力、元 key との対応を列挙する。192 graph initializer と外部 2 keys が元の 194 keys を重複・欠落・名前/shape 不一致なく覆う。これは静的な対応確認であり、inventory 自体は initializer 全値比較や NN 実行ではない。

[threads4 derivation](evidence/vae-threads4-derivation.json) の変更は `inference.threads:1→4` だけで、graph/weight bytes の変更も再 export もない。その記録内の `PENDING_ACTUAL_WASM` は作成時点の状態であり、後述の実行 receipt を置き換えるものではない。

実装は causal history を job ごとの host memory に保持し、必要な unit だけを ORT に渡す。空間 Conv2D は各 feature frame を batch=1 で処理し、空間 attention の範囲は保つ。空間 tile、画素省略、重み変更は用いていない。69 unit の構成と WASM32 の容量に対応した分割理由も inventory に記録している。

## 独立 reference と数値受入

[事前計画](vae/predeclared-plan.json) の gate は `atol=0.002`、`rtol=0.002`、全体 `maxAbs≤0.002`。この FP32・合成入力・新しい形状範囲用に比較前に宣言した値で、小さい既存 profile の tolerance を転用していない。すべて有限か、全要素が allclose を満たすか、最大絶対誤差が gate 内かを確認する。frame/channel/画素の抜き取りは行わない。

独立 oracle は、hash を確認した元 vendor class に 194 keys を strict load し、CPU FP32、Torch threads=2 / interop=1、raw scale `[0,1]` で実行した。stream program や ONNX を oracle にしない。RGB 入力は `((c*71+t*13+y*5+x*3)%257−128)/128`、decode 用の独立 raw 入力は `((c*17+t*11+y*7+x*5)%257−128)/512`。decode 入力は encode の mean や posterior sample ではない。[target81 独立 reference](evidence/vae-target81-independent-reference.json) の native encode は 1,574.515397 s、raw decode は 2,993.330169 s、全体は 4,571.703656 s だった。

下表の時間は通常呼出しまたは cancel 後の通常 recovery の時間。数値は保存した native WKT tensor の全値 readback と独立 reference の比較に基づく。`PASS` は該当する操作だけを指す。

| 入力ケース・H×W | 操作と出力 | 比較要素数 | maxAbs | 通常時間 s | 結果・receipt |
|---|---|---:|---:|---:|---|
| target F81・480×832 | encode → T21 mean | 2,096,640 | 2.86102294921875e-6 | 6,043.998785 | [実 WASM PASS](evidence/vae-target81-acceptance.json) |
| target・独立 raw T21 | decode → F81 RGB | 97,044,480 | 5.27501106262207e-6 | 11,385.054235 | [実 WASM PASS](evidence/vae-target81-acceptance.json) |
| source F1・480×832 | encode → T1 mean | 99,840 | 1.6689300537109375e-6 | 164.829000 | [実 WASM PASS](evidence/vae-f1-480x832-acceptance.json) |
| source・独立 raw T1 | decode → F1 RGB | 1,198,080 | 2.1904706954956055e-6 | 243.850050 | [実 WASM PASS](evidence/vae-f1-480x832-acceptance.json) |
| source F4・480×832 | encode → T1 mean、tail 3 | 99,840 | 1.6689300537109375e-6 | 115.565880 | [実入力 F4 で PASS](evidence/vae-source-f4-acceptance.json) |
| source F4 に対応する独立 raw T1 | decode → F1 RGB | 1,198,080 | 上記 T1 と同じ受入 | — | F1 と同一 shape/raw 入力/reference を再利用。F4 名での新規 decode 呼出しはなし |
| source F5・480×832 | encode → T2 mean | 199,680 | 2.1457672119140625e-6 | 631.024105 | [実入力 F5 で PASS](evidence/vae-source-f5-acceptance.json) |
| source・独立 raw T2 | decode → F5 RGB | 5,990,400 | 3.6656856536865234e-6 | 1,058.420245 | [実 WASM PASS](evidence/vae-source-f5-acceptance.json) |
| source F80・480×832 | encode → T20 mean、tail 3 | 予定 1,996,800 | — | — | **成否未確認・未受入（環境 unavailable）**。target の計算 prefix を実入力 F80 の呼出しに代用しない |
| source F80 に対応する独立 raw T20 | decode → F77 RGB | — | — | — | **NOT_RUN**。今回選択した source RGB F80 encode 範囲の必須操作には含めない |
| source F81・480×832 | target F81 と同一の数値入力・reference | mean 2,096,640、RGB 97,044,480 | target の受入を再利用 | — | 新規 NN なし。下記の同一性確認と source-role codec fixture を併記 |
| reference F1・16×16 | encode / 独立 decode | 64 / 768 | 7.152557373046875e-7 / 5.066394805908203e-7 | 7.999845 / 8.210600 | [実 WASM both PASS](evidence/vae-reference-f1-16x16-acceptance.json) |
| reference F1・16×848 | encode / 独立 decode | 3,392 / 40,704 | 1.1920928955078125e-6 / 1.8775463104248047e-6 | 14.893255 / 14.508905 | [実 WASM both PASS](evidence/vae-reference-f1-16x848-acceptance.json) |
| reference F1・848×16 | encode / 独立 decode | 3,392 / 40,704 | 9.5367431640625e-7 / 1.4603137969970703e-6 | 9.260885 / 16.694420 | [実 WASM both PASS](evidence/vae-reference-f1-848x16-acceptance.json) |
| reference F1・16×32 | encode / 独立 decode | 128 / 1,536 | 7.152557373046875e-7 / 5.662441253662109e-7 | 2.344680 / 3.148980 | [実 WASM both PASS](evidence/vae-thread4-16x32-acceptance.json) |
| reference F1・848×848 | encode / 独立 decode | 予定 179,776 / 2,157,312 | — | — | **未実施・未受入**。独立 native reference と実 WASM both が残る |
| 診断 F5・16×32 | encode / 独立 decode | 256 / 7,680 | 1.430511474609375e-6 / 1.519918441772461e-6 | 8.735490 / 8.184140 | [実 WASM both PASS](evidence/vae-copy-reduced-f5-acceptance.json)。continuation と copy/cleanup の診断 |

source F1 の実行 source は `e0f0dd7cae05aebcfc60214d51fce90df6197ab7`（threads=1）。reference 16×16 / 16×848 / 848×16 は `cc9b37f82ed855b36261d92429a822528bc24a71`、reference 16×32 の threads=4 は `e5e954ac8faa304c5e90b469970b6fd7940d8c08`。診断 F5 は target と同じ `d578ec006571d82bc50c6c2935d78ae6ea838269`。各 receipt の served-source hash はその実行を固定し、後続 commit に結果を無条件で移さない。[診断 F5 の bitwise regression](evidence/vae-copy-reduced-f5-bitwise-regression.json) では copy 変更前後の WKT bytes 一致も確認した。

### causal prefix の再利用範囲

source F4/F5/F80/F81 の独立 reference は、受入済み target81 の native 出力から NCTHW の各 channel の axis 2 を正確に切り出した [derived reference](evidence/vae-derived-source-f80-reference.json)。causal source 構造と、別途実行した直接 F1 reference に対する全値 bridge を条件とし、単純な flatten prefix は使わない。receipt は `DERIVED_CAUSAL_PREFIX_REFERENCE`、新規 native NN=0 を維持する。実入力 RGB は F4/F80 の未使用 tail も含む正確な shape/hash を持ち、短い入力への symlink 置換は行わない。

[reference contract validator](../../../tools/inference/vae/reference_contract.py) は元実行 commit にある計画・tool bytes の hash を確認し、選択ケース、モデル、vendor source、精度、gate、pattern、時間方向の契約を照合する。無関係な診断ケースの追加では古い native reference を無効にしないが、元 receipt の hash や意味を現在値に書き換えない。この reference 再利用は、source F4/F5/F80 の通常 API 実呼出しを済ませたという意味にはならない。

### source F81 の数値 alias と NN=0 codec fixture

[同一性確認](evidence/vae-source81-alias-identity.json) と [NN=0 proof](evidence/vae-source81-alias-proof.json) は、target81 と source81 の RGB/raw 入力、mean/RGB reference の同一 shape・記録 hash・実ファイルの device/inode を確認した。小さい mean/raw は改めて hash を読み、約 388 MB の RGB 2 ファイルは native parent の記録 hash と hardlink 同一性を用いた。大きい RGB を再 hash したとは記録しない。

実 target mean の全 2,096,640 値を source81 独立 mean と比較し、maxAbs `2.86102294921875e-6` で PASS。さらにその実 payload を native codec で保存・読戻しし、合成の source-role context、81 個すべての indices/times、重複 index/time、`frameProcessing.sourceContext` を保ったまま全値 bitwise 一致を確認した。payload SHA256 は `808db65cbf9b34f1ed1af5db04f2e3948b8207c7bcd52f080463d1355f3ecb46`。

これは新しい source-role NN 呼出しや threads=4 / COI の Node 検証ではない。codec 固定 source は `b971adc7930bd42e081ff446a0d6a70b7ff1dc28` で、実 producer `d578…` の codec とも bytes が一致した。実行 helper はその commit 内のコードと偽らず、独立した 9,308 B・SHA256 `b9f9bedc9efa3b917f99aa45e2541006b252f944b16e75a2cc4c6bda2298975f` として [script](vae/evidence/scripts/source81-alias-codec-fixture.mjs) / [archive 記録](evidence/vae-source81-alias-source-archive.json) に残した。

## context・保存・中止・解放

native tensor codec は `WKTSR001` schema 1、little-endian FP32、payload SHA256。normal encode/decode の WKT 保存と readback で全数値、shape/layout/meaning/model、context、存在する frameProcessing を確認している。context は既知の native fields に限定し、管理用 trace を tensor の必須項目にしない。

encode の tensor.context は実際に消費した frame の対応を表し、`frameProcessing` の `policy:'wan21-causal-floor-v1'`、`sourceFrames / latentFrames / consumedFrames / unusedTailFrames` と `sourceContext` に実入力全体の対応を残す。F4 の実試験では入力 F4・tail3、出力 context1、sourceContext4 を保存した。重複 index/time も保持する。来歴のない独立 raw T20 decode は自然な F77 を表し、それだけで source F80 の来歴を作らない。元の source80 frameProcessing が供給される場合は、77 frame の decode 処理と、80/77/tail3 の来歴を区別して保持する。

| 実試験 | session 作成 / release（通常成功結果） | 最大同時 session / 終了時 active | 制御・終了確認 |
|---|---:|---:|---|
| target81 encode | 859 / 859 | 1 / 0 | 最初の実 chunk 完了後 cancel、同じ API で通常 recovery、その結果を全値受入 |
| target81 decode | 1,069 / 1,069 | 1 / 0 | 独立 raw の全 81 RGB frame を受入 |
| source F4 encode | 39 / 39 | 1 / 0 | 実入力 F4 の tail と context を確認 |
| source F5 encode / decode | 80 / 80、100 / 100 | 各 1 / 0 | 新たな通常呼出しで both 受入 |
| 診断 F5 encode / decode | 80 / 80、100 / 100 | 各 1 / 0 | first-chunk cancel / same-API recovery、継続 chunk、copy と lifecycle を確認 |
| 追加の独立 raw T2 decode 制御 | 100 / 100 | 1 / 0 | decode の実 first-chunk 完了後 cancel、同一 API で全 F5 RGB を再実行・保存 |

target/F4/F5 の receipt では session create/run/release と Tensor dispose の observer errors はなく、所有する browser 子プロセスは最終 `liveAfterClose:[]`、`zombiesAfterClose:[]`、ownership `errors:[]`。既知の親 Worker / pthread target は browser close 前の destroy または不在を CDP で観測した。対象列挙には限界があり、未列挙の thread や物理メモリの即時返却まで証明しない。古い F1 / 16×32 receipt は同じ強さの CDP settlement 証拠を持たないため、数値結果と新しい終了観測を混同しない。

通常終了では active session/tensor の `finally` 解放と job history の破棄を行う。cancel は所有 Worker を terminate するため、強制中断した Worker 内の JavaScript `finally` が実行されたという主張はしない。reconfigure/dispose 後に旧処理結果を採用しない契約と、通常成功結果の解放、中断時の Worker 終了、host が追跡した子の reap は別々の確認である。

独立raw decodeの取消境界も、source `dccb88515775ec8aa86dd16f82e8816c9347ed38` で追加確認した。[raw decode control receipt](evidence/vae-raw-decode-cancel-acceptance.json) は F5・16×32、独立raw T2からの実chunk完了後に取消し、同じAPIで通常再実行した。全7,680値のmaxAbsは `1.519918441772461e-6`。保存WKTは31,538 B、SHA256 `0c5c82ee526b6f799c386b2ba9f5b9710eb6b669bc36389ef6f7846ac7274375` で既存copy修正後の保存物と全bytes一致した。正常recoveryは100session/175run/615Tensor dispose、終了時active0。既知の親2・pthread6の全8targetのdestroyとbrowser close前の不在、OS終了後のowned live/zombie/errorsが空であることを記録した。通常recovery52.844680 s、全体91.382865 s。source F80の別jobと同時の小診断であり、過去の専有時間との速度比較に使わない。新profile/export/独立参照の再生成は0。generated sampleの受入ではない。

## 観測した資源と限界

下表は bytes 単位の標本最大値。RSS/PSS は browser の追跡プロセス群の合計、WASM は observer が見た単一 linear memory の最大容量であり、同じ量ではない。native source は別の CPU worker を測った。

| 実行区間 | peak RSS B | peak PSS B | 最大 single WASM capacity B |
|---|---:|---:|---:|
| target81 独立 native reference | 9,432,432,640 | 9,429,231,616 | — |
| target81 encode recovery | 9,432,653,824 | 9,175,997,440 | 2,110,652,416 |
| target81 decode | 9,140,424,704 | 8,861,404,160 | 2,108,948,480 |
| source F4 encode | 3,840,720,896 | 3,599,718,400 | 1,856,634,880 |
| source F5 encode | 8,453,115,904 | 8,190,453,760 | 1,856,634,880 |
| source F5 decode | 8,334,876,672 | 8,060,002,304 | 1,857,880,064 |

根拠は [target resources](evidence/vae-target81-resources.json)、[F4 resources](evidence/vae-source-f4-resources.json)、[F5 resources](evidence/vae-source-f5-resources.json) と各 acceptance receipt。target 全体 17,624.836507 s は cancel、recovery、both、比較、codec、終了処理を含む。F4 全体は 122.613556 s、F5 全体は 1,704.312799 s。時間は専用環境の benchmark ではなく、同じ環境の別作業による負荷を含みうる。thread 数による速度差や他端末の所要時間は推定しない。

観測環境は CPU 4、cgroup 上限 16 GiB。`/tmp` の tmpfs 約 8.8 GiB は RAM に算入される。native reference の shared cgroup raw charge は最大 17,179,869,184 B、`current−inactive_file` の working-set 推定は最大 15,156,654,080 B だった。これらは他プロセス、cache、tmpfs を含み、各最大値は同時刻とは限らない。guard は観測した `inactive_file` だけを差し引き、shmem/tmpfs は差し引かない。256 MiB reserve はこの運用の余白であり、モデルの必要 RAM ではない。

RSS と PSS を加算せず、shared cgroup charge や 4 GiB の単一 WASM32 上限を OS 全体の使用量に置き換えない。sample は瞬間 peak を逃しうる。この結果から最小 RAM、全 domain の容量、別 browser/端末の成功を保証しない。

## 再構築・再実行と残る範囲

graph の再構築、依存 version、private model/bundle、native reference、通常 browser API の実行方法は [REPRODUCE.md](REPRODUCE.md) と [export tool](../../../tools/inference/vae/export_stream.py)、[independent reference tool](../../../tools/inference/vae/stream_reference.py)、[acceptance tool](../../../tools/inference/vae/accept_stream.py) を参照する。再実行には receipt の固定 execution source と served bytes、同じ元モデル hash、manifest/asset hash、実環境の thread 条件を合わせる。約 3.16 時間の target decode を含むため、短いケース用 timeout をそのまま用いない。モデル・graph・巨大 tensor payload は private に置き、公開 evidence は hash と検査結果を中心にする。

接続回復後に残るのは、実入力 source F80 の encode 全値受入と、reference F1 848×848 の独立 native reference / 実 WASM both の受入。F80 の最終正常観測は17:37:55 UTC・15chunk完了、index15処理中。接続喪失後のprocess・保存・終了は未確認。F80 と848×848の最終reportを回収・照合するまで上表のpendingをPASSに変えない。source81 は明記した数値 alias と合成 context codec の再利用範囲を保つ。

実物の画像・動画の原本は今回の実行環境で取得できておらず、合成 pattern を用いた許可範囲で検証した。実 Diffusion producer の生成 latent と normalization restore 契約、generated-sample decode の実値比較、管理側 consumer、Diffusion、全 workflow、実媒体の品質は未受入。`wan21-raw-generated-sample:v1` の API 契約が存在することは、その経路の数値受入を意味しない。これらを VAE の完了に加算せず、他 owner の ACK を単体実装の仮の前提にも置かない。
