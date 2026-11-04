# 管理画面への実モジュール接続：配布結果

管理画面から固定版Text／VAE・base Diffusion・mean utilityを選択、設定、実行、取消、再実行、保存・読戻しする実API経路を実装した。**全体接続の実装は未完了**。固定DiffusionにLoRA完成重みを受ける公開consumerがなく、実モデルの管理接続NNも未受入のため、「全体接続実装完了・全体運用未検証」とは宣言しない。新しい試験LoRAは要求・受領しておらず、全体運用実験は開始していない。

## 固定版・成果物

| 役割 | 完全SHA |
| --- | --- |
| 今回の管理実行source | `71fdfca480f0a7500798cf4f3beb6364264b8421` |
| 管理基点／前回配布 | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| 採用した最新Text／VAE配布 | `badff7a436b56207a084c4c770e01490899a576c` |
| 維持したDiffusion公開版 | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |
| 維持したLoRA単体SDK | `6d0c8df4cd4992f26745d2d26394f5e194d2567f` |

branchは`codex/management-full-route`、[Draft PR #19](https://github.com/Kushyameln01/kushyameln-works/pull/19)（baseは既存管理branch）。この記録・証拠を追加する配布commitと上記実行sourceは別。配布完全SHAは納品報告とPR headを正本にする。自己のcommit SHAをファイル内へ再帰的に埋め込まない。

新画面は`docs/ai-connection/modules/index.html`。既存管理入口から移動できる。固定sourceの[API差分](https://github.com/Kushyameln01/kushyameln-works/blob/71fdfca480f0a7500798cf4f3beb6364264b8421/development/ai-connection/full-route/API.md)、[再現手順](https://github.com/Kushyameln01/kushyameln-works/blob/71fdfca480f0a7500798cf4f3beb6364264b8421/development/ai-connection/full-route/REPRODUCE.md)、[owner依存](OWNER-DEPENDENCIES.md)を参照する。merge／Pages公開は行っていない。

## 同一checkoutへ採用した実体とAPI差分

Text／VAEの最新版API／TEXT-RESULT／VAE-RESULT／STATUS本文をGitHub固定commitから取得し、Git objectと実bytesを照合した。[DOCUMENT-RECEIVED.json](verification/DOCUMENT-RECEIVED.json)にpath／bytes／SHA-256／Git blobを記録。APIは`works-ai-1`を維持している。

新しい`native/text-vae-badff7a/`に27ファイル／13,746,814Bを元相対treeのまま採用。実factory、client／Worker、ORT、Hike／WASM、codec、license、公式manifestを含む。全bytesを固定owner Git objectへ照合し、bootstrapでもSOURCE.jsonと各sourceを検証する。モデル／graph payloadは含まず、選択Fileのbytesはnativeが検証する。旧固定graph／Rect／normal VAE接続のsourceやpinは差し替えていない。

Diffusionの既存150 source／14,330,041Bを維持し、公開`createDiffusionModels({sessionId})`を使うadapterを新画面から呼ぶ。`diffusion-models/0.1`、buildは`diffusion-models/0.1+9c5d8d18e9a7b046d7768c8c32ca6a48eaa084c900e916d59d63e735ebeb2a20`。

今回の実行source差分は44ファイル（新規43、既存管理入口のlink／表示変更1）。[SOURCE-FREEZE.json](verification/SOURCE-FREEZE.json)に全path／bytes／SHA-256を記録。旧mean／P4／LoRA実装は変更していない。GitHubから固定API、controller、画面、adapter、native API、runnerの7ファイルを再取得して一致を確認した：[REMOTE-ACQUISITION.json](verification/REMOTE-ACQUISITION.json)。これはコード取得の確認であり、資材保持担当のACKやNN成功ではない。

## 実装した管理経路

- 新画面からmoduleごとにmanifest File、相対pathの資材フォルダ、必要な元UMT5、HIGH／LOW pairを選択できる。公式の`prepared-model-manifest.json`や`vae-stream-manifest.json`を改名せず指定できる。
- `createOperationalManagement()`が実factoryを既定値としてlazy生成する。既存queue、`compilePipeline`、共有workflow shape正本、native snapshot、既存packageを利用する。数値演算、shape式、mapping、schedulerを複製していない。
- 参照JSONで前段のtensor、全mask、Tokenizer、native metadata、noise配列を後段へ渡す。循環・未解決参照・不正pathをnative呼出し前に拒否。VAE contextには共有shape正本の`requirementId`だけを明示bindingでき、shape／dtype／意味／正規化／payloadを書き換えない。
- 正常request終端とモデルpair解放を分ける。管理revision、child adapterのrevision、公開API session/job/inputRevision、modelSession/epochを混同しない。Diffusion Workerの取消による失効時はreloadを要求し、Text／mean取消で健康なDiffusion pairを失効させない。
- 解放失敗のownerを保持して再試行する。生成中factoryも終端まで待ってからdispose成功とする。問題を起こしたownerの復旧が終わるまでqueue隔離を解除せず、無関係なmoduleのrecoverで迂回しない。progress subscriber間も取消後の通知を止める。
- 入力はqueue待機前に独立copyし、共有backing storeを含むcaller変更を取り込まない。成功dispose後にはFile／byte構成の参照も解放する。
- native tensor保存は実codecでencode→decodeし、元fieldの消失・変更を検出したら`NATIVE_SAVE_METADATA_LOSS`で拒否してworkspace保存を案内する。workspaceは実payload、任意metadata、別tensorを含む拡張、execution、inputMetadata、snapshot／trace、画面設定を保存。fresh読戻しではFile権限やmodel sessionを復元しない。

## 接続ごとの成立範囲

| 接続 | 実装と今回の管理検証 | 未受入 |
| --- | --- | --- |
| 最新Text／VAE単独 | 実factory／公式manifest設定／native能力・資材不足・不正入力拒否、外側queue／取消／解放／保存を接続 | 新管理からの実encode／decode NNは未実行。owner既存数値結果とは別。 |
| Text→Diffusion | 全tensor・mask・model/Tokenizer・normalizationを参照で渡す実経路。制御試験で保持・順序を確認 | 実Text出力での管理NN結合。 |
| VAE context→Diffusion | raw meanを変更せず渡し、requirementIdをslotへbinding。正規化はDiffusion owner。任意の小mean utilityを全contextの必須段にしない | 実VAE contextでの管理NN結合、全shapeの網羅。 |
| Diffusion sample→VAE | raw生成sampleとlatentContractをそのままdecode入力へ渡す。追加復元・mean改名なし | 実sample→実decode→RGB保存の通し。 |
| base Diffusion公開操作 | load/status/predict/sample/unload/disposeの実adapterをUIへ接続。無効pairの失敗／Worker廃棄、status／取消／reload必要状態、native保存codec制御を確認 | 実pair正常load、predict／sample完走、NN中取消→reload、実生成結果の保存読戻し。 |
| LoRA完成重み→Diffusion | **未実装edge**。固定public Worker／samplerにconsumer入口がないことを実source・拒否probeで確認 | owner新版consumer採用・実行順／取引／lease接続。その後の試験LoRA受領と全体実験。 |

## 新規検証

最終Nodeは**796/796 PASS、fail／skip0**。旧739件＋新57件（Text/VAE16、mean2、controller39）。旧739件を今回のNNや新接続の数値証拠へ数え直していない。初回の外部source root未設定runは11fail／36skipであり、既存固定root・fixture bytesを照合して設定後に最終全体を実行した。環境台帳と最終ログを同梱する。

固定管理source `71fdfca480f0a7500798cf4f3beb6364264b8421` の実画面Chromium試験は**13/13 PASS**。実factoryを既定値で使い、注入service／隠れたglobal fallbackはない。

| scope | 観測 |
| --- | --- |
| 実UI／File | raw128・masked Textの合成native Fileを選択し、frame／context／maskを保持。 |
| 実Text/VAE | 公式manifestを実Fileからconfigureし、native能力・資材不足・不正token／shape拒否を確認。asset bytes未検証、encode/decode未呼出、NN0。 |
| 実Hike | 小shapeのnormalize→restore、参照route、取消・旧出力不採用・recover。非対応full shapeはowner理由で停止。 |
| 実Diffusion Worker制御 | modelStatus、4-thread/no-COI拒否（fallbackなし）、無効8B pairの準備失敗・再試行／reload状態。正常モデルloadではない。 |
| 実保存／fresh復旧 | native tensor download→disk File再選択・bit／mask一致。bundle download→fresh page/controller読戻し→設定・inputMetadata／frame保持→モデルFile再選択。 |
| 固定source／解放 | 全211取得source／28,695,188B、791 GETを固定bytesへ照合。9 Workerすべてbrowser終了前に実close。source／page／consoleエラー0。 |

result.jsonは182,996B、SHA-256 `8283c69ac3908568d46ca01552f19ab3e7adfc87346c00be7d2c6b466d35940f`。Chromium154.0.8037.57、COI:false、SAB:false。所要15,353.07msは制御／小Hike試験時間でありNN時間ではない。RSS／ORT／総peak RAMは未測定。

Text／VAE・controllerの成功推論を返すNode double、UIだけの状態回帰doubleは制御専用と識別している。独立レビューでadapter3件、controller4件のP2を修正し、原再現で解消を確認した。初回所見と最終PASSは[レビュー記録](verification/FULL-REVIEW.md)に両方残す。

## 再利用した数値証拠・単体の入力域

Text／VAE ownerの単体結果を元source・入力域で再利用する。Textはplain `[1,512,4096]`、IDs `[1,L,4096]`、1≤L≤512、全maskとHike最終RMSNorm。Text T2の9case中8PASS／全512有効IDの1case gate未達は未受入として残す。通常入力へそのgateやreceiptを必須化しない。

VAE ownerのtarget81・source F1/F4/F5/F80・参照最大848の選択scope、causal tail／frameProcessing、raw独立decodeの既存結果を再利用する。全domain網羅や実generated sampleの成功へ拡張しない。実行sourceはText `b3e5e34430d58bca3bf69b8938ba87beb196d054`、VAE target81 `d578ec006571d82bc50c6c2935d78ae6ea838269`、残る境界／848² `dccb88515775ec8aa86dd16f82e8816c9347ed38`。配布badffへ過去の実行SHAを付け替えていない。

Diffusionの旧N5／実L512 predict／6step sampleの数値証拠は、元の4-thread／COI、F32、Euler/simple6/shift5/split3、CFG1、LoRAなしのscope。sample実行sourceは`0f761f374dce1d447bbb912ad13c08f9bf85c279`で、最終raw128値の比較（全中間比較ではない）。今回の管理／1-threadの成功とはしない。旧P2/Rect、旧mean/P4、LoRA SDKの既存単体成果も元scopeで維持する。

## 未取得・未受入と次の順序

完全なHIGH／LOW pairは各15,574,833,216B、合計31,149,666,432B。N5 manifestと実資材保持環境の接続先は未受領。既存HIGH partialは穴があり、header一致を完全取得の証拠にしていない。

公開固定取得先とローカル容量を確認したところ、workspace空き15,563,165,696Bに対し、partial割当済み領域を再利用してもpair完成には追加22,658,166,912Bが必要だった。`/tmp`も8.8GiB程度のtmpfsでLOW単体が収まらない。download再開・代替モデル・他資料削除は行わず、許可済みの保持環境方式を利用する。[MODEL-ASSET-CONSTRAINT.json](verification/MODEL-ASSET-CONSTRAINT.json)に観測を分けた。

残件は(1)公開LoRA consumerを備えた固定Diffusionの採用と管理取引への接続、(2)保持環境で固定sourceを動かす実モデル部分受入。両者に依存しない今回の実画面・制御実装を止めていない。全体実装の完成を確認した後に必要な試験LoRA／受渡し先を明示し、入力→重み適用→生成→実VAE decode→保存を一つのtraceで運用検証する。

`fullImplementationComplete:false`、`generationReady:false`を維持。原寸81frame、実媒体、任意LoRA、生成品質、全体資源予算、PagesでのNN成功、全体運用成功は未受入。Draftを維持し、merge／Pages公開は別の状態として未実施である。
