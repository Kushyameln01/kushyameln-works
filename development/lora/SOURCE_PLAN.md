対象はKushyameln Works内で個別に使える `text_encoder`、`vae`、`diffusion_models` と、手元の2種類のLoRAを扱う独立したLoRAモジュール。LoRAは既存モジュールとAPIでデータを受け渡して接続する。Codexが実ファイルを扱う段階で、HikeによるWASM計算の成立、対象モデルとの互換性、元ComfyUIとの出力・負荷比較を順に判定する。

第一候補は **Hike→WASMの数値計算層と、ONNX Runtime WebのWASM推論層を組み合わせ、重い処理を1件ずつ実行する構成**。HikeによるWASMの積極的利用を設計方針に加える。3つの論理モジュールに実際のHike計算を割り当て、共通のtensor・メモリ・ジョブ管理を用意する。ニューラルネット本体は当初ORTで成立させ、主要演算や部分グラフをHikeへ移す工程も計画に含める。全モデルの同時常駐は既定にしない。

版1.3、2026年10月31日。2種類のLoRAの入力ファイルが `.safetensors` であることを確定条件へ追加し、ヘッダーからの棚卸しとAPIへの受け渡しを具体化。LoRA内部の方式・対象base・互換性、Hikeカーネル、ORT連携、負荷低減は未検証。今回はCodexへ渡す計画の更新までで、サイト改修・公開・ComfyUI設定変更は含まない。モデルとLoRAをこの会話へ添付する必要はない。後続Codexが実ファイルへアクセスできる環境で確認する。

# 目的と確定条件

| 区分 | 内容 |
| - | - |
| 目的 | ComfyUIで高負荷になっている処理を、負荷を管理できるWorksの個別モジュールとして用意する |
| 確定条件 | text_encoder、vae、diffusion_modelsのWASM計画とHikeの積極的利用。手元の2種類のLoRAは `.safetensors` ファイルであり、Hike WASMで扱い、既存モジュールとAPIでデータを受け渡す。Space内資料を参照する |
| 今回の納品 | Codex向け構成案、Hike担当計算、LoRA接続API、実装順、検証・採否基準 |
| 設計提案 | 共通LoRAエンジンと2件のadapter記録、Hikeで適用後重みを準備する初期経路、ORTとの分担、直列実行・段階ロード |
| 未確定 | 実モデルの形式、2種類のLoRA内部の方式・tensor命名規則・dtype、各ファイルの容量と適用先、同一baseへの適合・併用可否、CPU/RAM/VRAM、許容時間、利用経路 |

**実行場所を最初に確認する。** GitHub Pagesはアプリを配信する。利用者のブラウザで実行するWASMは、その端末のCPUとRAMを使う。別端末のCloud browserで実行すれば計算場所も別になるが、素材の受渡し、保持上限、実行時間、結果回収の確認が別途必要。この計画は、Cloud browserを恒久的な推論サーバーとして確保できたものとは扱わない。

ORT WebのWASMはCPU実行。現在のComfyUIがGPUで計算している場合、単純移植でCPU負荷や待ち時間が増える可能性がある。CPU使用率低下、RAMピーク低下、VRAM低下、UIの応答、総処理時間を分けて評価する。[ORT Web公式](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)

同じ出力条件を維持したままの改善を先に検討する。別モデルへの変更、量子化、解像度・ステップ数削減、近似演算、WebGPUへの置換は、影響を示す別候補とする。これらを黙って採用して、元の要件を達成したことにしない。

# 推論基盤とWorksへの配置

初期の基準経路は、実モデルの構造・設定を復元し、対応する計算グラフをONNXへ書き出してORT WASMで実行する構成。モデル重みをそのまま.wasmへコンパイルする工程ではない。Hikeは独立した計算モジュールとしてビルドし、明示したtensor境界で接続する。変換には準備工程としてPython等を利用できるが、納品するブラウザ計算はHike WASMとORT WASMが担当する。任意のComfyUI用ファイルを一つの変換コマンドで処理できるとは仮定しない。[Optimum ONNXのエクスポート仕様](https://huggingface.co/docs/optimum-onnx/onnx/usage_guides/export_a_model)

| 層 | 担当する処理 |
| - | - |
| UIとJSホスト | ファイル選択・保存、モデル対応付け、Worker起動、待機列、入力世代、取消と結果所有者 |
| Hike数値計算層 | 3モジュールのモデル別tensor処理、CFG・scheduler更新等。計測に基づき主要推論演算へ拡張 |
| ORT WASM推論層 | 初期のニューラルネット本体。Hikeへ移した部分は重複実行しない |
| 専用Worker | HikeとORTの呼出し、明示したbuffer受渡し、処理区切り、資源の終了。3モジュールを理由に3並列にしない |
| ローカル素材 | モデル・設定・Tokenizer。公開資材へのモデル同梱や自動アップロードは既定にしない |

推論sessionは `executionProviders: ['wasm']` を明示し、採用するJSとWASMを同じビルドに固定する。SIMD等は能力検出と対象演算で確認する。Worker内へ直接runtimeを読み込む案を先に試し、さらにproxy Workerを重ねる構成は必要性がある場合だけ選ぶ。

Hikeを、初期実装から実際のtensor計算を担当する独立した層に置く。さらに主要推論演算への移植候補を評価し、前後処理だけに恒久的に限定しない。一方、全ニューラルネットをHikeで再実装することは今回の確定条件ではない。ORTを呼ぶだけのラッパー、無関係な小関数、読み込むだけのWASMを「Hikeによる処理」として達成扱いにしない。各処理の担当と本番結果への寄与を記録する。

提案上の配置は `shared/inference/` と、`text-encoder/`、`vae/`、`diffusion-models/`。Hikeのsourceは共通tensor処理と3モジュールの処理へ分け、必要なWASM生成物にまとめる。Hike sourceの分割とWASM Instance数は別に決める。現行リポジトリの構成を確認してから確定し、既存の共有計算API・registry名を推測して増設しない。既存共有計算にAI推論が実装済みとは仮定しない。 LoRAは `shared/inference/lora/` 相当の共通API・Hikeカーネルと、2種類それぞれの形式・対象対応データへ分ける。形式が同じなら計算エンジンを共有し、異なるなら形式別handlerを分ける。2ファイルだから2つの独立した推論エンジンが必要とは仮定しない。

独立利用と連結利用の両方を提供する。連結時は同じページのコーディネーターから3つのAPIを呼び、別タブごとのモデル重複を避ける。UIには入力と実行・取消・出力を置き、詳細なruntime情報は必要なときだけ展開する。

# Hikeが担当する計算と実装段階

Hikeを積極的に使う方針は確定条件。以下の担当範囲はモデル確認前の設計案であり、元workflowに存在し、対象モデルに適合する処理から実装する。未対応処理を追加したり、数学的な意味を変えたりして担当件数を増やさない。

| モジュール | 初期のHike担当候補 | 続く主要演算の移植候補 |
| - | - | - |
| text_encoder | padding・mask生成、出力層選択・embedding配列の組立、元workflowにあるprompt重み処理 | 実測したMatMul、LayerNorm/RMSNorm、活性化、attentionの部分グラフ |
| vae | 画像/tensorのlayout変換・値域変換、latentのscale/shift、対応するtileの切出し・重なり合成 | 実測したConv、正規化、アップ/ダウンサンプリングの部分グラフ |
| diffusion_models | 元モデルに対応するCFG・rescale、schedulerの係数と更新式、noise/latent更新 | 実測したMatMul、正規化、attention等の部分グラフ |

候補名はHikeに既製カーネルがあるという意味ではない。元modelの演算順序・epsilon・dtype・近似方式・乱数列を保持する。乱数生成をHikeへ移す場合も、seed番号だけで同じnoiseになるとは扱わず、まず固定したnoise tensorで照合する。CFGを使わないモデルへCFGを追加せず、モデル内部の正規化と入出力の値域変換も区別する。Tokenizer全体の独自再実装は、元のtoken列との互換性を保つ別候補として判断する。

**先行する実装は配列計算の基盤。** 明示した数値幅、shape/byte長、alignment、入出力capacity、所有者、解放・失効時点をABI表にする。小さい既知配列から実モデル形状へ拡大し、範囲外入力・NaN等の扱いと数値誤差を検証する。Space資料の固定版スカラー教材の成功を、配列・推論演算・SIMDの合格に流用しない。

Hikeの作業bufferは、採用runtimeで実証した再利用方式にする。[Hike資料第4節](https://chatgpt.com/space/page_3146974dd7248191bdcc4ef6bb1ac63d)は固定JS hostのbump allocatorとfree bridgeのno-opを記載している。stepごとに確保を重ね、freeを呼んだだけで解放済みにしない。固定workspaceの再利用等を検証し、grow後のview再取得と借用領域の寿命を管理する。

**主要演算の移植も計画の工程として実施する。** 実測で負荷が支配的な演算を選び、小形状→実モデル形状→部分グラフ→全工程の順に評価する。対象を一度に広げず、候補ごとの正しさ・ピークRAM・総時間・維持費を判断する。SIMDや別backendを採用する際は、対応するcompilerと生成物で確認する。Hike採用を前後処理だけに固定せず、移植候補の採用・保留理由を納品する。

HikeとORTは初期案では別Memoryとして扱う。同じWorker内でも共有されたことにはならない。まとまったtensorで受け渡し、要素ごとの境界呼出しを避ける。ORT内部Memoryへの直接pointer接続やcustom kernel登録を実装済みとは仮定せず、公開APIまたは検証した部分グラフの入出力で接続する。部分グラフ化できないモデルは、その経路を保留する。

**Hikeの採用判定は、担当処理の実行と最終出力への寄与で行う。** WASM/source hash、実呼出し、返却tensorを対応付ける。指定したHike計算が利用不能なら対象経路が失敗し、隠れたJS/ORT処理で成功しないことを確認する。基準実装は明示した比較用として保持する。HikeとORTを合わせたcopy・待機・推論・解放を測り、カーネル単体が速いことだけで軽量化を認定しない。

この設計案の根拠は[Hikeリファレンス第0〜6節](https://chatgpt.com/space/page_3146974dd7248191bdcc4ef6bb1ac63d)。固定commit `3c51fde6675f317453919bd505d0e2d0f638e7f1` の教材を出発点とし、採用compiler版は実装時に固定する。配列ABI、主要推論演算、ORT接続は今回の追加検証対象である。

# 3モジュールの入出力

| モジュール | 入力 | 出力 | 実モデルで照合する項目 |
| - | - | - | - |
| text_encoder | テキストまたはtoken ID、Tokenizer・設定、必要なmask | hidden states、必要なpooled embedding・mask等 | token化、最大長、切詰め、複数encoder、clip skip、重み付きprompt、出力層 |
| vae | 画像またはlatent、encode/decode指定、モデル設定 | latentまたは画像tensor | channel、配列順、値域、scale/shift、圧縮比、色、encode時の乱数・平均値選択 |
| diffusion_models | latent、時刻またはsigma、conditioning、必要な補助tensor | 1回の予測tensor、または指定schedulerで反復したlatent | UNet/Transformer等の構造、予測の意味、conditioning、CFG、noise schedule、更新式 |

3つはフォルダ名に対応する役割であり、どのモデル族にも同一の入出力を強制しない。例えば複数のtext encoderやTransformerを持つ構成もある。[Diffusers FLUXの構成例](https://huggingface.co/docs/diffusers/api/pipelines/flux)

**text_encoder** はTokenizerとmodel/configを一組にする。ComfyUI固有のprompt解釈がある場合は、その処理も比較対象に含める。キャッシュはモデル・Tokenizer・設定・入力のhashをキーにし、上限を持たせる。

**vae** はencodeとdecodeを別APIにする。実装順はdecode先行でも、encodeが必要なworkflowを完了範囲から除かない。タイル処理は対象VAEが対応し、境界・色・画質を比較できる場合の候補。全VAEで同じ方法が使えるわけではない。[VAEタイル処理の条件](https://huggingface.co/docs/diffusers/optimization/memory)

**diffusion_models** は低水準の `predict` と高水準の `sample` を分ける。`predict` はモデルの1回分の予測、`sample` はschedulerと反復を含む。重みだけで生成処理が完成するものと扱わない。LoRAやControlNet、独自ノード等が実workflowに存在すれば、その依存を棚卸しに残す。

画像用の4次元tensorだけを固定前提にしない。実素材が動画モデルなら時間軸・フレーム数・temporal VAEの契約を追加する。未対応を静止画処理へ無断変換しない。

# 2種類のLoRAを接続するモジュール

LoRAは単独で画像を生成するモデルとしてではなく、適合するbase modelの対象層へ変更を適用する独立モジュールとして接続する。利用者が持つ2種類はいずれも `.safetensors` を入力として受け付け、それぞれadapterIdと原本hashで識別する。ファイルの格納形式は確定したが、内部のLoRA方式・対象base・対象層・倍率は個別に確認する。共通エンジンを使えるかは、その結果で決める。

既存側は `text_encoder` と `diffusion_models` のうち実LoRAが対象にするものへ接続する。1つのLoRAが両方を対象にする場合は一つの適用状態として扱う。`vae` もAPI契約自体は利用できるが、LoRA内の対象とVAE側の対応が実際に確認できた場合だけ接続する。全LoRAが3モジュールすべてへ適用できるとは扱わない。2種類の個別適用・切替を先に検証し、同時併用は追加候補とする。

## `.safetensors` 入力とAPIへの受け渡し

2つの原本ファイルをそのまま入力できる構成とし、利用者によるLoRAのONNX変換や事前加工を必須にしない。`.safetensors` はtensorの格納形式であり、標準LoRA・DoRAなどの内部方式や、SD系・FLUX系などの対象モデルを拡張子だけで判定しない。metadataは任意で、対応baseやalphaが必ず記載されるわけではない。alphaがtensorに格納される方式も含め、tensor名・shapeと元ローダーの規約を照合する。

1. **ヘッダーを先に読む。** ホスト側でローカルFileの先頭8バイトからlittle-endianのヘッダー長を読み、続くUTF-8 JSONからtensor名、dtype、shape、data_offsets、任意の `__metadata__` を取得する。offsetはファイル先頭ではなくtensorデータ領域先頭からの位置として扱う。長さ・offsetの範囲と整数の表現範囲、dtype・shapeから求めたバイト数の整合を検証してからtensorを読む。

2. **2件を別々に登録する。** 提案API `lora.inspect(file)` は `containerFormat: "safetensors"`、tensor一覧、metadata、内部方式とtarget対応の確認状態を返す。`lora.register()` はFile参照を保持するtensorProviderとadapterIdを登録する。ヘッダー確認だけで原本hashの照合完了とは扱わず、ファイル全体のhashは別工程で計算する。

3. **必要なtensorを読み、Hikeで計算する。** `lora.plan()` で対象層・A/B・rank・alpha・転置を確定し、`lora.prepare()` からtensorProviderで必要な範囲を読む。ホストがファイルI/Oと索引解析、Hike WASMが検証済みのdtype変換・低rank積・倍率・加算を担う。非対応dtypeや方式は対応範囲として明示する。

4. **既存モジュールへ適用する。** 大きなtensorをJSON配列化せず、binary bufferと記述子で受け渡す。HikeとORTのメモリ間のコピーも負荷計測に含める。適用後は後述のONNX重みパッケージ生成・セッション再構築・revision切替へつなぐ。LoRAを読めたことと、推論へ実際に適用できたことを別々に確認する。

受入条件には、実ファイル2件のヘッダー一覧、対象層への対応表、必要範囲の読出し、元ComfyUIとの1層比較、実推論への適用確認を含める。全tensorを最初から展開せず、ファイル読込み・hash計算・Hike処理・ORT再構築の合計時間とピークメモリを測る。ファイル形式が同じでも2件の併用可否は個別に判定する。

ファイル構造の根拠は [Safetensors公式README](https://github.com/safetensors/safetensors/blob/main/README.md) と [ヘッダー解析の公式資料](https://github.com/safetensors/safetensors/blob/main/docs/source/metadata_parsing.mdx)。WorksとHikeの構成上の前提は本計画のSpace資料に従う。上記APIの返却項目・ホストとHikeの役割分担は実装提案であり、既存実装の存在を示すものではない。

## Hikeで実行する計算

標準的なLinear LoRAを、列ベクトルの `y = W x` という規約へ正規化した場合、`W:[out,in]`、`A:[r,in]`、`B:[out,r]` として、`W_applied = W_base + strength × (alpha/r) × (B × A)` をHikeで計算する。これはrank・alpha・行列順・保存形式の転置を確認した標準方式の式であり、2種類の実LoRAへ無条件に当てはめない。

alphaや倍率情報が欠ける場合は、対象形式と元loaderが規定する既定値を出典付きで確認する。規約不明の値を1等で補わない。層ごとのrank/alpha、fan-in/fan-out、追加bias等も元の意味を保持する。ConvのLoRAを無条件に行列へflattenしない。rsLoRA、DoRA、LoHa/LoKr等の派生形式や追加学習tensorは識別し、対応handlerがないものを標準LoRAとして処理しない。

初期のHike担当は、確認した方式の低rank積、倍率適用、base重みへの加算、必要な数値型・配置変換。読み込むだけのWASMや、既存loaderを呼ぶだけの処理をHike計算の達成としない。dtype対応と積和の精度は採用compilerで検証する。

W全体やΔW全体の巨大な一時配列を作らず、出力行・列のblockごとに計算できるABIを設計する。入力block、A/Bの必要範囲、shape、rank、scale、出力capacity、所有者を明示し、既存のHike workspaceを再利用する。部分読込みと書出しが成立するかはproviderも含めて検証し、細分化によるcopy増加も測る。

## 既存モジュールとの接続API

以下は新たに実装する論理APIの提案。現行Worksに同名APIが存在するという意味ではない。JS/Worker間のモジュールAPIと、Hike WASMのpointer/lengthによるABIは別に設計する。API接続のためだけにHTTPサーバーを必須にせず、同一アプリではES moduleとWorkerメッセージの構成を先に検討する。

| API群の提案 | 受け渡すデータ | 完了条件 |
| - | - | - |
| `target.describe()` と `lora.inspect/register()` | base/model/graphの識別、対象層一覧、対応方式、LoRA manifest、tensor provider | 2件を識別でき、読めた形式と未対応を報告できる |
| `lora.plan(target, selection)` | adapterId・強度・target対応・shape/dtype・倍率・状態revision | 全対象の対応と必要容量を検査し、適用計画を返す |
| `lora.prepare(plan, baseProvider)` | 不変のbase重みblock、A/B、計算予算、jobId | Hikeで計算し、検証可能なprepared weights handleを返す |
| `target.prepareLoad(handle)` と `coordinator.commit()` | graphと重みpackage、期待revision、適用状態のsnapshot | 読込み・小入力検証を終え、対象全体の適用状態を確定する |
| `detach/cancel/release` | baseまたは新しい選択、jobId、所有handle | 解除・取消・資源解放を区別し、旧結果を現在へ戻さない |

target registryには、元モデルの論理層名、module種別、weight ID、shape、dtype、layout、転置、必要なsliceや結合、変換後graphのinitializerとの対応を記録する。例えば元のQ/K/Vと融合後重みの対応や、export時の転置・定数畳込みを考慮する。単なる名前の部分一致・shape一致では適合としない。対応先が消えている場合は適用可能なexportを作るか、その経路を未対応とする。

受渡しの共通envelopeは `apiVersion / buildId / jobId / inputRevision / applicationRevision / modelHash / graphHash / adapterSetHash / planId` を持つ。実際の重みはJSON数値配列へ展開せず、TypedArray/ArrayBufferまたは明示したreadBlock providerで渡す。handleは所有者の範囲内だけで有効とし、別Worker・別Memoryへ生pointerを渡さない。必要なbyte長・hash・有効期間・copy/transferの責任を定義する。

prepared bundleにはbase hash、LoRA原本hash、target対応表の版、各強度・倍率、dtype、生成物hash、graphと外部重みの位置対応、適用計画のhashを含める。session/embeddingキャッシュもこの適用状態で識別する。対象漏れ、不適合、未知tensorは一覧と件数を返し、黙って一部だけを適用して成功にしない。

## 初期経路はHikeで準備した重みを読み込む

処理順は、target registryを取得→2件のLoRAを個別に検査→対象と倍率を確定→Hikeで重みblockを計算→prepared bundleを検査→既存モジュールのloaderで新sessionを生成→小入力を照合→適用状態を確定、となる。

ORT経路では、prepared bundleを実際にロードできるONNX model packageへ整形する。initializerの名前・型・shape、external dataのlocation/offset/lengthと提供するbytesを一致させる。ONNX graph内に重みが埋め込まれている場合は適切な外部化または再出力も必要。重み辞書やhandleを返しただけで接続完了にしない。

ORT Webの既存sessionに任意の重みをそのまま差し替えられるAPIは前提にしない。初期案は `InferenceSession.create()` 時に適用済み重みを渡す。外部重みの読込みと、C/native側のinitializer変更APIや学習用APIは区別する。ブラウザで使う採用版APIを検証する。

元のbase重みを不変に保ち、再適用・強度変更・解除はbaseと選択情報から再構築する。現在の適用済み重みに再加算したり、解除のためにΔWを引き戻したりしない。量子化baseへの適用は、復号・再量子化・誤差・RAM増加を含む専用経路として評価し、浮動小数重みと同じ精度・容量だとは扱わない。

複数モジュールにまたがるLoRAはapplicationRevisionをまとめて確定する。重いsessionをすべて同時常駐させることは条件にせず、検証済みpackageとdescriptorを一組にし、各生成段階で同じsnapshotをロードする。途中失敗時はその生成を失敗として扱い、古い適用状態の結果を混ぜない。

旧・新sessionとprepared bytesを同時保持できる場合は、検証後に切替える。RAM予算を超える場合は実行中jobを完了または取消し、旧sessionを解放してから新sessionを作る。この場合の一時停止を表示し、失敗時は保持した旧descriptorと不変の原本から再ロードする。復帰まで成功したことを確認する。ディスクへblock書出ししても、ORTの読込み時に全量展開・copyが発生し得るため、そのピークは別に測る。

## 内部層へ残差を渡す経路

将来、対象層の入力activationと正しい加算位置をAPIで公開できる場合は、Hikeで `deltaY = strength × scale × B(Ax)` を計算し、base層の結果へ加える経路も比較する。この場合は標準式で `x:[in,N]`、`Ax:[r,N]`、`deltaY:[out,N]`。必要なbiasと後続の非線形演算の順序を保持する。

これは任意のORT内部層へ自動でhookできるという意味ではない。部分graphの分割や入出力追加が成立した場合だけ使う。最終embeddingや最終latentへLoRAを後付けする処理に置き換えない。全対象層のactivation搬送・中間保持・同期時間を測り、重み準備方式と比較する。

## LoRAの受入条件

| 対象 | 必要な確認 |
| - | - |
| 2件の単体対応 | それぞれ形式・base・target・倍率を照合し、実Hikeの1層結果と全workflowを元loaderと比較 |
| 強度と解除 | 強度0、使用する非zero強度、解除、再適用で意図した結果。元重み不変、二重加算なし |
| APIと状態 | schema/hash/revision不一致、target漏れ、切替途中失敗、取消後の旧返信、再ロード復帰 |
| 2件の併用 | 同時利用が必要な場合だけ検証。同一base適合と形式規約を確認し、各個別合格から推測しない |
| 負荷 | Hike計算、package生成・保存、copy、session再生成、推論、解除を分けた時間とRAMピーク |

初期の小行列例は数式とABIだけの確認。実LoRAにおけるtarget対応、モデル読込み、元workflowとの一致まで通ることを最終条件にする。Hike計算済みでも既存モジュールで使えなければ、接続は未完了と報告する。

参照: [SpaceのHikeリファレンス](https://chatgpt.com/space/page_3146974dd7248191bdcc4ef6bb1ac63d)と[Worker・状態管理Tips](https://chatgpt.com/space/page_9f301277a1948191bc8a075d5c954935)のABI・Memory・revision契約を適用する。LoRA形式の補助出典は[PEFT LoRA](https://github.com/huggingface/peft/blob/main/docs/source/package_reference/lora.md)、[DoRA](https://github.com/huggingface/peft/blob/main/docs/source/package_reference/lora_variant_dora.md)、ORT読込みは[external data](https://onnxruntime.ai/docs/tutorials/web/large-models.html)。2026年10月31日に公式資料の該当抜粋を確認。HikeでのLoRA演算、実ファイルの互換性、稼働中sessionの更新対応を実証したものではない。

# メモリと負荷の管理

**初期提案は、HikeとORTを通した重い処理の同時実行1件、ORTのスレッド数1、batch 1。** Hikeはまずnormal modeの小さい配列カーネルから成立させる。HikeのAsync/concurrentという名前だけで並列性を保証せず、CPU使用率を一定％以下に抑える設定とも扱わない。複数スレッドは実配信先の対応とcross-origin isolationを確認してから比較する。PagesやSitesにCOOP/COEPを自由に設定できると仮定しない。[ORTのスレッド設定](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)

| 対策 | 管理対象と条件 |
| - | - |
| 段階ロード | text encoder処理後は必要なembeddingだけ残し、次のモデルへ進む |
| 保持上限 | モデル、session、入力、出力、キャッシュ、待機列を別に管理する。ロード中の旧新モデル二重保持も数える |
| 反復の区切り | diffusionのstep間、VAEの対応タイル間で取消・待機を扱う。単一推論中のCPU率制御とは分ける |
| 解放と再生成 | session解放と参照解除を行う。WASM heapが高止まりする場合は、結果を回収して専用Workerを終了・再生成する |
| ディスクキャッシュ | 任意のOPFS等は再読込みの省略用。実行時RAMが不要になる仕組みとは扱わない |

text encoder→diffusion→VAE decodeの順に処理する例では、各モデルを段階的に入れ替える。VAE encodeが必要なworkflowではその工程が前に入り、再ロード時間も総時間に含める。中間tensorのRAM保持が大きければ、形式と容量を検証したディスク退避を候補にする。

メモリ見積りには、展開済み重み、activation、attention等の一時領域、ORTとHikeそれぞれの作業領域、JSとの境界copy、読み込み中の元bytes、最終出力を含める。ORTからHikeへ移す瞬間の二重保持も数える。既に各WASM heapに含まれる重み等を重複加算しない。保存ファイルの容量だけからピークRAMを決めない。

ORT Webの公式資料にはwasm32の線形Memory上限4GBが記載されている。アドレス空間は4GiBであり、重み以外にも領域が必要なため、実用上のモデル上限はこれより小さくなる。ブラウザ・runtime・プロセス全体の制約も別にある。ONNXのexternal dataは大きい重みを別ファイルにする仕組みで、WASMの実行メモリ上限を消すものではない。[ORTの大容量モデル制約](https://onnxruntime.ai/docs/tutorials/web/large-models.html)

初期の対応判定は、実ファイル、変換後のdtype、ORTとHikeの各演算対応、推定ピーク、最小実行の結果で行う。FP8・GGUF等をFP32へ展開するとサイズが増える場合も含める。単に重みファイルやWASMを分割しただけで巨大グラフが動くとは扱わない。部分グラフのHike移植では、必要な中間tensorと重みを実際に分離できるか、搬送・常駐量・精度を含めて評価する。

browserのJS heap値だけでは全体RAMを測れない。測定できない指標はnullと理由を残す。アプリ内の予算判定はOS全体の厳密なRAM上限ではなく、ブラウザだけでPC全体のCPU率を固定する設計にもできない。

# 共通のデータ契約と状態管理

各モジュールに `inspect / load / run / cancel / dispose` 相当の操作を用意し、VAEはencode/decode、diffusionはpredict/sampleを区別する。名前は提案であり、既存Works APIに適合させて確定する。

モデルmanifestには、schema版、モデル族と役割、原本hash、変換ツールと版、ONNX opset、graphと外部重みの対応、Tokenizer/configのhash、入出力名・dtype・shape、必要な設定、検証済みの実行範囲を記録する。Hikeについてcompiler commit・binary hash・backend・flags・source hash・WASM hash・対応runtime・ABI版・担当演算を加える。未知のモデルに既定のlatent scaleやtoken長を流用しない。 LoRAではadapterId・原本hash・format/variant・対象baseの照合情報・各層のrank/alpha/倍率規約・target対応表・適用強度・変換版を記録する。適用結果にはbase/model/graphのhash、adapter選択全体のhash、生成した重みのhash、applicationRevisionを付ける。

tensorは、dtype、shape、layout、byte長、意味、モデル対応、必要なscale/shift等のmetadataとバイナリを一組にする。巨大な数値配列をJSONへ展開しない。bufferの所有者、copy、transfer、解放時点を定義する。別WASM Memoryのpointer数値だけを受け渡さず、未検証のzero-copyを保証しない。

ジョブにはbuildId、sessionId、jobId、inputRevision、model hashを付ける。入力が変わったら旧結果と保存操作を失効させる。成功でも失敗でも古い返信は現在の状態を更新しない。進捗は実際のロード・変換・step数等から示し、観測できない処理へ架空の進捗率を付けない。 LoRAの選択・強度・適用先を変えた場合はapplicationRevisionも更新し、影響するembedding・latent・sessionのキャッシュを失効させる。1回の生成は同じ適用状態のsnapshotを使い、text encoderとdiffusionで異なるLoRA状態を混在させない。

取消は、待機列からの削除、結果不採用、実計算の停止、資源の解放を区別する。同期WASMが実行中でWorker側がメッセージを処理できない場合、取消フラグだけでは止まらない。専用Worker終了等の成立する方法を使い、次の起動と他ジョブへの影響を検証する。

Spaceの根拠は、[Hikeリファレンス第3〜6節](https://chatgpt.com/space/page_3146974dd7248191bdcc4ef6bb1ac63d)、[Worker実践Tips W03・W04](https://chatgpt.com/space/page_9f301277a1948191bc8a075d5c954935)、[大容量入出力P04](https://chatgpt.com/space/page_fa30d69b9fb48191bee1d3bbd52009dc)。動画処理のストリーミング実績を、ONNX重みも同じ方法で逐次推論できる証拠へ移さない。

# Codexが進める5工程

1. **実素材とHike担当候補を確認する。** 最新のWorksソース・既存指示・Space資料を読み、実ファイルの形式・モデル族・dtype・容量・config/Tokenizer・workflowを棚卸しする。全モデルをロードする前にmetadataから調べる。元ComfyUIの参照tensorと工程別負荷を用意し、Hikeへ移す数値処理と、その処理が元workflowに存在する根拠を対応表にする。実ファイルへのアクセス権がない場合だけ、その不足を実装担当が特定する。 2種類のLoRAは `.safetensors` のヘッダーを先に読み、tensor名・dtype・shape・offsetと任意のmetadataを一覧化する。原本hashは別途ファイル全体から計算し、内部方式・rank・alpha・倍率・対応base・対象モジュールをtensor構造と元ローダーの規約から確認する。「2種類」の違いをモデル名やファイル名だけで推測せず、単体適合と併用可否を別に記録する。

2. **Hikeの配列基盤と大きいモデルの成立性を先に判定する。** SpaceのHike教材を起点に、固定版のcompiler→WASM→ブラウザの一往復を確認し、必要なdtype・配列ABI・反復buffer再利用へ拡張する。同時に各モデルを正しい構造でONNX化し、変換前後と実ORT WASMの最小推論を照合する。最大モデルをUI作り込み前に判定し、Hike→ORT→Hikeの小さいtensor往復も検証する。合成小入力は配管確認にだけ使い、実モデルの合格へ置き換えない。 LoRAは最小の標準行列例でHikeの低rank積を独立期待値と照合し、続けて実LoRAの1対象層で元loaderと比較する。既存モデルのtarget registryから読込み可能な重みpackageまでの対応を先に検証する。

3. **3モジュールのHike実計算を実装する。** 共通runtime・manifest・tensor契約・取消を整え、モデルに適合するtext encoderのmask/embedding処理、VAEのlayout/scale・対応タイル合成、diffusionのCFG/scheduler/latent更新をHikeへ割り当てる。数学的な依存順は元workflowを保持する。ORTは初期のモデル本体を担当する。各段階の実WASM結果を基準tensorと照合し、読込み→処理→保存・読戻し→解放を完成させる。 LoRAモジュールでは、確認した形式に応じてHikeで低rank積・倍率・加算を計算し、APIで渡せる適用後重みbundleを生成する。2種類それぞれについて登録・適合判定・準備・適用・解除を独立に通す。

4. **主要演算のHike移植を評価し、利用経路へ接続する。** 実測で支配的な演算を選び、小形状カーネル→実モデル形状→部分グラフの順にHike実装を比較する。移植を採用できた部分はORT側の対応処理を分離し、二重実行を避ける。採用・保留と根拠を残す。Worksの連結とバイナリ入出力を実装し、元workflowをComfyUI内で継続する場合は対応ノード/bridgeまで確認する。Hikeの接続成立を元の高負荷問題の解消と同一視しない。 LoRA接続はtarget registry照合→Hike重み準備→bundle検証→対象モジュールのsession生成・小入力照合→適用状態確定まで行う。layer内部への残差適用は、その入出力境界を公開できる場合の別候補とする。

5. **Hikeの実使用、正しさ、負荷を別々に判定し、引き継ぐ。** Hike生成物のhash、担当関数の実呼出し、出力が最終結果へ使われたことを確認する。同じモデル・入力・品質条件で元ComfyUI、ORT基準、Hike併用候補の全工程を比較し、初回・再実行、境界copy、CPU/RAM、取消・失敗復帰を記録する。Hike source・再現build・ABI・採否・未対応一覧を納品する。今回の計画だけでは公開しない。 LoRAについて単体2件、強度0、解除、再適用、切替、破損・不適合、取消後の旧結果を検査する。同時併用は要求され対応を確認した場合だけ追加する。

工程2の成果は「3モジュールとLoRA2件の対応可否表」と「Hike担当計算・ABI対応表」。原本→変換物→Hike/ORT実WASM結果の対応、target名から実重みへの対応、阻害要因、対象端末の見積りを記載する。不成立のHike経路を黙ってJSやORTへ置き換えず、影響する担当範囲を未達として残す。独立して成立するモジュールは進める。

# ComfyUIから使う場合の接続境界

現時点ではWorks単独で生成を完結するか、ComfyUIの処理の一部だけを置き換えるかは未確定。まず各モジュールの入出力を確定し、少量の参照tensorで相互変換を検証する。

| 利用経路 | 完成とする条件 |
| - | - |
| Works単独 | 元workflowに必要な3処理と補助処理を連結し、必要な出力を保存・再利用できる |
| ファイル受渡し | tensorとmetadataを保存し、利用先がdtype・shape・意味を保持して読める |
| ComfyUIから直接呼出し | 対応ノード/bridge、ジョブ識別、タイムアウト、取消、接続先照合、結果受信を一往復で確認できる |

直接bridgeを選ぶ場合は、ComfyUIが動く端末とブラウザの所在を区別する。localhostはその端末自身を指す。公開HTTPSページからローカルサービスへ接続できることを前提にせず、対象ブラウザのCORS・local network access等を実確認する。ローカル限定の接続先、許可origin、必要なtoken検証を設計し、全インターフェース公開や認証無効化を既定にしない。

diffusionはstepごとに巨大tensorをComfyUIと往復する構成を避け、可能なら反復を同じ実行側で完結する。ComfyUIが同じ重みを保持し続けると、ブラウザ側の重みと二重になる。置換部分の元推論を止め、不要な保持を解放した状態まで含めて総負荷を比較する。

接続経路が未成立なら、「Worksの単体機能が動いた」と報告し、「現在のComfyUI負荷を解決した」とは報告しない。

# 検証と採否

| 検証対象 | 方法 | 合格に必要な証拠 |
| - | - | - |
| text encoder | 同じpromptと設定でtoken、hidden/pooled等を比較 | token列の一致、各出力のshape・dtype・数値誤差 |
| VAE | 同じ画像/latentでencode/decode。乱数条件を統一 | latentと画像の数値指標、境界・色・細部の比較 |
| diffusion | 同じ初期noise tensor、conditioning、時刻列で1 stepと全反復を比較 | 途中tensorと最終出力。seed番号だけを一致条件にしない |
| 状態と資源 | A取消→B成功→A旧返信、モデル切替、反復、失敗復帰 | 旧結果不採用、実計算停止、参照解放、メモリ推移を個別記録 |
| 負荷と利用 | 元workflowと同じ作業を同じ端末で実施 | CPU平均/ピーク、RAMピーク、必要ならVRAM、ロード・推論・保存・総時間 |

数値の許容誤差はモデルとdtypeに合わせ、候補の結果を見る前に設定する。FP32基準が対象機器に収まらない場合は、その制約を先に残し、同じモデルの既存precisionを基準にする等の比較条件を明示する。元推論の再現と、量子化等による品質変更を混ぜない。最終画像の見た目だけで全段階の一致を判定しない。

メモリはブラウザの全関連プロセス、Worker、必要ならComfyUI/Pythonも含めてOS側から観測する。OS値とJS/WASM内の指標は別に記録し、重複合算しない。クラウド環境の合格と手元PCの負荷軽減は別判定にする。

| 判定 | 意味 |
| - | - |
| 変換合格 | 対象モデルが変換され、基準実装との比較に通った |
| WASM実行合格 | 実ブラウザで対象推論をWASMが実行し、全結果を回収できた |
| 利用経路合格 | Works単独または確定した連携先で結果を使えた |
| 負荷目標合格 | 同じ出力条件で、決めたCPU/RAM等の目標と許容時間を満たした |
| 未検証または保留 | 必要な素材・測定・実行結果がない、または具体的阻害要因がある |

CPU/RAMの数値目標や許容待ち時間はまだ決まっていない。測定値の差は提示できるが、目標未定のまま「十分軽い」と認定しない。必要な判断は実モデルの予測・実測を添えて具体化する。

WASMでは目標を満たさない場合、要因を「モデル不適合」「実行メモリ」「CPU処理時間」「搬送・二重保持」に分類する。WebGPU等は別案として比較できるが、WASM指定の代替採用はこの計画では決定しない。

# 納品物と引継ぎ

| 納品物の提案 | 含める内容 |
| - | - |
| モデル・LoRAとHike担当の対応表 | 原本識別、形式、base適合、target対応、担当演算、上限、未対応と採否 |
| 変換とHikeビルド手順 | 変換ツール、Hike compiler/backend/flags、source・WASM・runtimeの版とhash、ABI |
| 3推論モジュールとLoRA接続 | Hike source、WASM、共通API/schema、target registry、重みprovider、session更新・解除 |
| 検証報告 | Hike実使用、LoRA単体2件、正答、copy・session再生成込み負荷、停止・復帰 |
| 再開用記録 | 採用仕様、対応モデル・LoRA、移植候補、未対応、公開状態 |

実装担当は最新版ソースと参照資料の版を確認し、既存の構成・命名へ合わせる。過去の公開許可や別タスクのcommitを、今回の採用版・公開権限へ置き換えない。検証担当はCloud browserを候補にできるが、入力投入・実行・結果回収が可能な経路を先に確かめる。

計画の静的点検では、未添付でも進められる棚卸し契約、巨大モデルの早期保留、旧返信拒否、WASMから別backendへの無断変更防止、計画と公開の境界を確認する。実装後はこれらを実データと動作試験へ置き換える。CDLCの適用範囲は引継ぎ内容と評価条件の版管理までで、Skillや恒久指示の改変は含めない。

**Codexが最初に行う作業は、実モデル・2つの `.safetensors` のヘッダー・workflowを棚卸しし、Hike担当計算とLoRAのtarget対応表を作ること。** 続けてHike配列・低rank積の最小検証、実LoRA1層の照合、最大モデルの成立性を確認する。大きなUIや全形式対応の独自推論エンジンを先行して作り込まない。

# 参照資料と確認範囲

| 資料 | 版と利用範囲 |
| - | - |
| [Spaceデータ索引](https://chatgpt.com/space/page_3bbbddd716348191a85f249c10467c05) | 現行の案内を取得。資料の入口として使用 |
| [Hike WASM開発リファレンス](https://chatgpt.com/space/page_3146974dd7248191bdcc4ef6bb1ac63d) | 1.0、2026年10月19日。要求、ABI、Memory、Worker、検証の契約を確認。固定compilerの教材実績を推論へ転用しない |
| [技術Tips実践集](https://chatgpt.com/space/page_8eeebbbaa4588191823a3a89c90aca1c) | 1.0、2026年10月18日。Workerと大容量入出力の章を確認 |
| [ブラウザツールの理想状態管理と完了判定](https://chatgpt.com/space/page_cf84110c50fc8191973c8edd5ee62117) | 1.0、2026年10月12日。確定条件・提案・未確認、技術成立と目的達成の分離 |
| Unity WebGL・Hike 技術Tips 統合版と検証報告 | 2.0、2026年10月14日。Space索引の原本参照から01・04・08等を確認。Unity固有のImport等は今回に適用しない |

統合版原本は [技術Tips2.0](https://chatgpt.com/library?file_id=libfile_05955d62e4cc8191bddb276a755965b4\&account_id=personal)、[検証報告](https://chatgpt.com/library?file_id=libfile_4d9b7d2122dc81919405b606da71bede\&account_id=personal)。索引の開発失敗対処ワークフロー添付は、この読取経路では書庫が非対応のため本文未確認。今回の手順の根拠には採用していない。

ORT Web・Optimum・Diffusersの公式資料は2026年10月30日に確認した補助出典。採用するパッケージ版と対象モデルの対応は実装開始時に固定する。SpaceのFT集計におけるWorker速度測定は、これらのAIモデルの高速化を示す証拠ではない。

今回確認したのは資料と計画の整合性。実モデル、利用者端末、公開サイトの推論動作は未検証。モデル添付、ユーザー側ビルド、アカウント・課金設定変更を今回の計画作成条件にはしていない。
