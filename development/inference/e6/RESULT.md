# E0・E2 mapping照合とE6 非正方形profile受入

2026-10-31 JST。総合仕様Page本文 **1.1-draft.1**、実行計画Page本文 **0.2-draft.1**を取得した。添付本文も取得し、SHAはそれぞれ`0744a98219c6ddab4880773029e6318de3e770c8e14e1bb2edbb1bf25c1c3944`と`9ceb3f2538f5145edfc697be5ea9b7cb8db28db2d250f01912c8d6b67f2e8897`。既存F=1・16×16のexport/棚卸しは再実行していない。

**E6の非正方形診断profile一件は、fresh export・元VAE FP32参照・実Hike/ORT WASM・保存/取消/終了を受入済み。管理の実adapter共同確認、Diffusionの新shape変換とmetadata保全、E9の実generated sampleは未受入。** 取得・提供・source照合・共同受入を同じ完了状態にしない。

## 対象profileと識別

| 項目 | 確定値 |
| --- | --- |
| profile | `wan21-raw-f32-1x16x32`、N=1、F=1、H=16、W=32 |
| RGB | float32 NCTHW `[1,3,1,16,32]`、1,536要素、6,144 B |
| latent | float32 NCTHW `[1,16,1,2,4]`、128要素、512 B、`raw-posterior-mean` |
| 用途 | 新たな非正方形診断fixture。実workflowの参照媒体ではない。native32×16のRGB8 PNGを作成し、resize/padding/frame削減なし |
| PNG SHA | `46305e1cecc1c97a6d90bde022d5495cde6537c8e17a6e4d905dd3ba25a1a34a`。生成規則は`fixtures/generate.py` |
| 既存前処理式 | BerniniStudio `ca69274a2d2135052489bc0c67a2d79a64225e86` の長辺式へ32×16を入れてもscale=1、H16/W32。元PROFILESの根拠を再利用し、別の補間を追加していない |
| VAE原本SHA | `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` |
| 元source | Wan2.1 [`9737cba9c1c3c4d04b33fcad41c111989865d315`](https://github.com/Wan-Video/Wan2.1/blob/9737cba9c1c3c4d04b33fcad41c111989865d315/wan/modules/vae.py)、SHA `4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498` |
| precision/runtime | 元BF16値をFP32展開。opset17、ORT Web1.24.3 WASM・1 thread、graph optimization disabled。元GPU精度・速度との同等性は主張しない |
| 事前gate | accepted export前に`atol=2e-5, rtol=2e-5, maxAbs=2e-5`を[plan](acceptance-plan.json)へ固定 |

実媒体の`132123.mp4`や実slot画像は今回の添付/取得経路に無く、寸法不明のまま保持した。非正方形診断でそれらを代替受入していない。初回の準備スクリプトにSyntaxErrorがあり、exportだけが先行した試行は受入から除外した。そのgraphコピーは削除し、manifest/resource記録を`excluded-preflight/`へ保持した。正しいplan/fixture確定後、`accepted-bundle/`へ新たにexportした結果だけを以下で採用する。

| 資材 | bytes | SHA-256 |
| --- | ---: | --- |
| `encode.onnx` | 212,362,391 | `0105bc12f13d3aceb35d1765681c427643bf04cc4ce5978c7339e04beff09e0d` |
| `decoder-body.onnx` | 286,313,363 | `6674457d2170352760b3aa73543ee1d2bf5713e6bf4d7ea6bf63d8f9703ac27e` |
| `conv2-weight.f32` | 1,024 | `9ce97eaf137ab64ae409384b6f6177a7b07e593faf103e7e986c0c99d0a1316f` |
| `conv2-bias.f32` | 64 | `1a79fbc83c80584e46d5683d49df3482b575ffb4aca99c843a0e8a2aef9df9cd` |
| manifest | `fixtures/bundle-manifest.json` | `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a` |

合計498,676,842 Bのmodel資材は非公開の`/workspace/work/inference/e6-rect/accepted-bundle/`に保持する。ONNX重みは埋込initializer、external-dataファイルは0。conv2は別のF32資材として識別する。入力shapeは固定、ONNX output型metadataの一部はsymbolicだが、元PyTorch参照と実SDKが全runtime出力shapeを厳密に照合した。manifestのshape書換えで通していない。

## 数値・保存・終了の受入

Chromium154.0.8037.57、localhost GETのみ。`browser-results.json`の4 phaseが合格した。既存`browser-cases.mjs`も実Hike/ORTで実行し、missing-Hike・破損weight hashの拒否を確認した。

| 実検査 | 全比較要素数 | 最大絶対誤差 |
| --- | ---: | ---: |
| PNG encode→mean、実UI download | 128 | `8.642673492431641e-7` |
| 保存meanを実UIで読戻し→raw decode→download | 1,536 | `3.334134817123413e-6` |
| API取消後の回復、context付き保存読戻し | 128 | `8.642673492431641e-7` |

synthetic encode/decode参照も実SDKで全出力比較した。Hike kernelは`9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8`、PNG encode値域変換とdecode実conv2が出力へ寄与する。全WKTのheader・payload SHA・ファイル全体SHAを確認し、入力保持、busy拒否、実run進捗での取消、回復、dispose後拒否を確認した。

実session計測probeでは3作成/3 release、active=0（通常synthetic encode/decodeと実run後のAbortError）。UI/API全sessionの計数と混同しない。5 Workerを作成/終了しlive=0。Hike dispose後の再利用も拒否する。元5-frameとF1正方形のモデル再推論は行わず、完全commit `54bfeadbd83f1fea074c503c0e05ec478aba5cfb`の受入証拠を保持した。新profileの元194キーstrict loadはexportに必要な検査として行い、別の棚卸しを作り直していない。

| 資源工程 | 実測 |
| --- | --- |
| accepted export | 8.879 s、child最大RSS1,689,120,768 B、child終了をwait済み |
| native参照/graph確認 | 全process6.502 s、推論0.620 s、最大RSS2,456,014,848 B |
| 実UI encode | 操作/保存2.134 s、sampled browser-tree PSS最大1,093,451,776 B |
| 実UI decode | 操作/保存2.356 s、PSS最大1,347,944,448 B |
| API取消・回復 | 3.135 s、PSS最大1,157,031,936 B |
| session/abort計測 | 4.002 s、PSS最大1,952,205,824 B |
| browser受入全体 | 13.350 s |

browser PSS/RSSは約100ms sampling、export/nativeは別processのRSS high-water mark。共有pageを含むRSS合計とPSSを加算せず、単一tensor容量・厳密瞬間peak・端末全RAMや負荷改善と読み替えない。

今回のhelperは起動前から自分の子孫PID/ctime/親PIDを約50msで観測した。browser工程で**11 childを観測、helperへ引き取った直属child3件をwaitpidで回収、生存0・zombie0**。他ownerのprocessはkill/reapしない。export/nativeのchildもwait済みで、3 helper自身の終了はcoordinatorからPID＋ctimeで確認した。極短命で未観測のforkを全て捕捉した保証ではない。旧F1記録のzombie2件は歴史的観測として変更していない。

独立レビュー後、既知のowned zombieが残ればcleanupを合格にしないgateを追加した。過去の実測zombie記録によるRED→GREENと実子processの計6試験、今回の保存済み終了記録へのgate replayを通し、神経推論の無用な再実行はしていない。

## E0提供・E2情報保全・Diffusion照合

G1C-MAPPING、F1受入報告、API全文、実manifest、実64要素meanのWKT/base64を65,702 BのJSONで実行計画Pageへ添付し、E6にcommentした。SHAは`5213ac04e36a4f0ddfdc9576e2b9b4a50a9a2bbf3564be4e3feeeddf034493c1`。Filesへ再読込みしてhash一致を確認した。[handoff-delivery.json](handoff-delivery.json)が実ref/thread/messageを保持する。提供と当窓口の再取得は完了したが、対向本人のACKではない。

Diffusionの`f522d9aeff313558c4ef83022a340af9a4c21391`と`9023329b8d803306abcdd9342f24c01ba0df2676`は、初期422の後にpushされ、再取得できた。902 archiveも73,134 B・指定SHA・全32ファイルを照合した。現在の正本取得を未完とは扱わない。API0.1と次期0.2案を混同しない。

| 確認したedge/差分 | 現状とowner |
| --- | --- |
| F1 `[1,16,1,2,2]`、64要素 | f522のraw validator/normalize/restoreでshape拒否。VAE raw decodeの単独受入をDiffusion結合としない |
| 非正方形 `[1,16,1,2,4]`、128要素 | **実VAE出力**も拒否。既存`[1,16,2,2,2]`と要素数が同じでも互換ではない。拒否時Hike変換0 call |
| 旧128要素mean | 実Hike normalize→保存読戻し→restoreの数値経路を維持。2 call、最大誤差`3.5762786865234375e-7`≤`2e-6` |
| metadata | f522 mean変換/codec/wrapperはcontextを落とす。conditioning保存wrapperはmask/modelを保持するがTokenizer識別を落とす。**共同metadata保全は未受入** |
| 管理 `21e77f292c2540975d1846e7efe320fe89625e23` | GitHub422/404、Spaceからも実source/adapterを未取得。5schemaやnative→共通→nativeの実adapter合格とは報告しない |

6-file数値依存closureが679版と同一であることをSHAで照合し、先行12境界検査を再利用した。加えて実rectangle拒否とmetadata欠落を再現した。公開の`test-peer-boundary.mjs`は同じclosureをhash検査してから、実保存64/rectangleと旧128 synthetic数値fixtureを扱う。metadata欠落の観測成功を「情報保全成功」と合算しない。

Text plain `[1,512,4096]`／ID `[1,L,4096]`、mask、model/Tokenizer、全producer、別decoder、context配列の順序/重複、evidenceはG1Cで保持する。管理は原native artifactを残し、snapshot/owner/graph/build/trace/evidenceとnative全file hashを外側packageで結ぶ。strict native context/latentContractへ管理fieldを挿入しない。対向が必須metadataを落とすedgeは、ownerによる版付き対応/receipt・往復確認まで保留する。管理packageをこちらで代替実装しない。

正規化/復元の数値実装はDiffusion所有。VAEに追加・重複していない。実producer・復元・対象decode profileの成立後にE9でgenerated sampleを受け入れる。実slot/reference、81frame、全sampling、本番precision/負荷改善は未受入。sourceと診断artifactのみを作業branchへpushし、モデル/ONNXの非公開指定とmain/Pagesを維持する。
