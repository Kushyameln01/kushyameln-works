# 最新版採用・専用weight-port所有の結果

**全体接続実装完了・全体運用未検証。今回の固定管理sourceによる実NNは未実行・未受入。** 実APIを呼ぶ経路・順序・参照解決・保存・所有権の実装を完了し、独立レビューの指摘を解消した。通常入口へ独立参照・数値gate・事前PASSを追加していない。モデルを使わない制御成功を、NN成功や生成READYへ拡張しない。

## 固定sourceと配布

- 管理実行source A：`f084790d7f594915c869ef375fcbdc6e44ee56f3`。
- 配布：本RESULT／HANDOFFを含む文書・証拠commit B。完全SHAは[Draft PR #19](https://github.com/Kushyameln01/kushyameln-works/pull/19)の本文と配布報告に記載する。BのSHAを実行sourceへ代入しない。
- branch：`codex/management-full-route`。基点：`9fe2c2e1dd35e17a3063a2c67d3bda676e953c8a`。
- [固定API文書](https://github.com/Kushyameln01/kushyameln-works/blob/f084790d7f594915c869ef375fcbdc6e44ee56f3/development/ai-connection/full-route/API.md)／[固定保持環境手順](https://github.com/Kushyameln01/kushyameln-works/blob/f084790d7f594915c869ef375fcbdc6e44ee56f3/development/ai-connection/latest-adoption/HOLDER-RUN.md)。
- source Aの変更232ファイルを[完全path・bytes・SHA-256](evidence/SOURCE-FREEZE.json)へ記録した。配布Bは実行codeを変更しない。merge・Pages公開は実施していない。

## 採用差分

| 独立した採用entry | 固定owner配布 | 今回の採用内容 |
| --- | --- | --- |
| Text／VAE | `20f640a6e071b6c060a212e89b28f0c8965923f7` | `works-ai-1`の実factory、32 files／14,473,296B、新Text manifest、normLowering、current native codec |
| 全モデルDiffusion | `b6e166478a8e072c9ffd3ce562bfdb0c89634920` | `createDiffusionModels({sessionId})`、専用Worker／ORT／Hikeの相対参照、153 build sourcesを含む164 files／14,473,285B |
| 通常P4 | `b6e166478a8e072c9ffd3ce562bfdb0c89634920` | 全モデルとは別constants／bootstrap／entryで`createBerniniP4Execution`を採用。正規marker対応 |

Diffusionのbuildは`diffusion-models/0.1+e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6`、公開protocolは`diffusion-models/0.1`。owner実行証拠source `6cda0a686d30a4bd748909fc56c61c1acece7bfb`、配布b6、管理Aを区別する。Text manifestは`development/inference/management-20261104/text/source-ordered-fp32/manifest.json`、696,123B、SHA-256 `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。

各entryのsource／build／entrypoint／hashは[ADOPTION-MATRIX.json](ADOPTION-MATRIX.json)。全モデルとP4は現在同じnative treeを共有するが、片方のpin変更で他方を更新扱いにしない。物理的な新規native treeは196 files／28,946,581Bで、P4分を二重計上しない。旧badff／ffe／30eは回帰用として保持し、旧P4 marker拒否は新全モデルの拒否条件へ使わない。LoRA SDKのnative pin `6d0c8df4cd4992f26745d2d26394f5e194d2567f`と演算・mappingは変更していない。

## 新しく接続・修正した操作

1. Text／VAEの通常adapterを最新sourceへ接続。選択manifestの`normLowering`宣言とnative `graphBindings`を照合し、graph bindingはtensorへ混入させずresponse／workspaceのsidecarへ保持する。source-ordered manifestが画面の既定。旧互換manifestの選択は明示して区別する。
2. 通常P4の現在版adapterと画面を追加。`postSelfAttention`の実owner能力照会と既存queue／snapshotを使う。canonical `umt5-final-rmsnorm-f32-v1`、Tokenizer identityを照合する。今回の対応はblock0、residual `[2,5120]`、timeAct1 `[5120]`、conditioning `[1,L,4096]`、L=1..512のowner範囲。maskはowner契約どおり来歴であり、cross-attention softmax maskを実装したとは扱わない。
3. 全モデル`openWeightFeed`を専用queueへ接続。通常`execute`からの同操作は拒否し、返信はclonableな`feedId`／binding metadataだけにする。MessagePortとraw clientは非公開runtime所有で、通常clone・tensor snapshot・JSON・workspaceへ保存しない。`getWeightFeedClient`、`closeWeightFeed`、`retryCloseWeightFeed`で使用・終端を管理する。
4. 管理revision、public session/job/inputRevision、modelSession／epoch、feed generationを別に照合。取消・古い返信・side違い・model世代違いは新しい権限を採用しない。拒否portもnative `closed` protocolを通知して終了する。生のMessagePortは利用者へ公開しない。
5. 解放失敗時は権限を直ちに失効し、旧feedのcleanup-only IDとownerを保持する。model unloadの成功とhost package leaseの解放を分け、`weightFeedCleanupRequired`等を返す。必要なcleanupが終わるまで新load／推論／feed admissionを止め、同じIDのretryで再試行する。旧世代のcleanupが新sideを上書きしない。cached facadeのprepare／validate／commit／readも失効後に拒否する。
6. native clientのbaseProvider／consumerを実LoRA SDKへbinding。登録・合成・prepare／stage／apply・解除・base復帰・保存／読戻しはSDKへ委任する。SDKの`graphBinding:UNBOUND`を管理が書き換えず、実model bindingを別欄へ記録する。consumer leaseが使用中のpackage／kernelを早期解放しない。epoch失効後もinspectは失敗せず、実行準備をBLOCKEDとする。

`predict/sample`の実factory、制御操作、raw生成sampleの意味、取消後reload、controller所有tensorの実File保存・読戻しを保持環境runnerへ接続した。数値演算・scheduler・重み復号・target mappingは追加していない。

## 保存・読戻し

最新owner codecのmarker、Text mask／model／Tokenizer、`frameProcessing`、frame番号・時刻配列、複数producer、decoder binding、restoration状態を実encode／decodeで確認した。strict tensor外のevidence／trace／拡張／graphBindingsは既存workspace packageへ保持する。

旧R17の保存済みZIPも、新controllerで6 artifactとmetadata／snapshot／traceを読める。互換対象は検証済みの旧codec identity一組だけで、任意codecのfallbackではない。旧／新`tensor.mjs`の実bytesは同一、SHA-256 `7a15d721b1bab60cdade8723fd1c4d543a142d236cf2e59b63f1ba33ba14ed78`。writerは新identityを使い、runtime session・File選択・実行権限は復元しない。旧配布のreceiptは元9fe commitのhashへ解決する履歴として保持した。

今回の固定UIで保存した[workspace](evidence/operational-browser/workspace.zip.gz)は輸送用gzipのみを適用した実ZIPであり、展開後9,432,424B。[内部ZIP／輸送ファイルのhash](evidence/operational-browser/workspace-transport.json)とnative WKT読戻し実体を配布する。入力は合成fixtureであり実生成物ではない。

## 今回の新規検証

| 検証scope | 結果・制約 |
| --- | --- |
| 変更境界と既存回帰のNode suite | **841/841 PASS、fail／skip 0**。旧796件を含む。全841件を新SDK接続試験やNNとして数え直さない |
| 固定Aの実管理画面 | **14/14 PASS**。235配信sourceが固定Git bytesと一致、GET 1043、Worker 9/9をbrowser終了前に物理解放。実Hike変換／File／保存／復旧を含むがモデルNNなし |
| 固定Aのport所有・native relay | 実Chromium／native factory／client／serverと合成weight providerでPASS。拒否identity／side／model、対象取消、旧権限拒否、解放失敗／retry、reloadを確認。Worker 10/10の物理終了をPlaywright／CDPの両方で確認。NN・LoRA演算なし |
| P4正規marker能力照会 | 実ownerがSUPPORTED／dispatchSupported:true。3tensor＋maskのlogical bytes 8,450,560B。モデルprepare／NNは未実施 |
| 保持環境runnerの接続 | 実controller→実b6 Worker、root／child target分離、対象取消／復旧、controller保存／native File読戻しをモデルなしChromium試験で確認。実資材を使う分岐のNNは未実行 |
| 固定A source guard | 443 files／32,636,961B、native 153／164・codec32照合PASS。ローカルcheck-onlyは入力・pairのlocal path不足でexit2。保持側資材の不存在を意味しない |
| 独立review | PASS。失効後inspect、P4入力予算、cleanup ID喪失、拒否port通知、旧ZIP読込の指摘を解消 |

詳細：[Node log](evidence/NODE.log)、[固定UI](evidence/operational-browser/result.json)、[port結果](evidence/weight-port-browser/result.json)、[source guard](evidence/holding-preflight.json)、[review](evidence/REVIEW.md)。port試験の初回はfavicon404だけでaggregate失敗となった。private HTMLのfaviconを修正して全件再実行し、最終PASS。runtime codeは両試行で同じA。raw `MessagePort.close()`だけではnative RPCへ終端が伝わらない既知制約も別caseとして記録し、正式管理経路ではnative終端protocolを使う。

## 再利用した証拠

- 管理単体・旧接続・旧codec/package・LoRA SDK全patchの数値証拠は不変source／元入力域の範囲で維持。
- Text/VAE保持側の実管理接続は管理`e1661e561dfb1a4f20544ff48bc375175b5981d1`のbridge。Text実行`78954ee92d1b76c6652f50df1668159a55db6dc9`のHello plain／IDは各2,097,152値、maxAbs `2.4437904357910156e-6`、gate `.001`。Rect実行`8594722e693bda9901f61cededfc1b3338e66c92`はmean128値 `8.642673492431641e-7`、RGB1536値 `3.334134817123413e-6`、gate `2e-5`。新管理AのNN証拠へ付け替えない。生成latent decode fixtureは実Diffusion生成物ではない。
- Diffusion公開portの実model試験source `a23d5276d705605903afa599b1e049f62948d094`は1-thread/no-COIと4-thread/COIのload／取引／取消／reload成功。prediction／sample／linear／attentionは0で、管理AのNN成功とは別。
- 新Text全active／長文の数値修正はowner正本を再利用し、管理へ演算を複製しない。取得資料と実bytesの一覧は[owner取得記録](evidence/OWNER-DOCUMENTS-RECEIVED.json)。

## 実装不足と未受入

レビュー済み対象の未実装code pathは0。現在の新source実NN状態は **NOT_DISPATCHED／EXECUTION_ROUTE_NOT_CONNECTED**。runtimeの`AWAITING_HOLDER_RECEIPT`は受入待ちを表し、保持環境で新jobを起動済みという意味ではない。

Diffusionの完全pair・N5入力、Text／Rect／stream bundleは保持側資料で存在を確認済み。管理環境のlocal不足を資材自体の不存在と記録しない。本セッションには保持側terminal／endpointが接続されていない。固定Aとrunner・返却条件を公開し、担当環境／実行接続先の指定を依頼済み。**保持側によるA取得ACKとAの実NN receiptは未受領**。管理自身のGitHub再取得7ファイル一致は、受領側ACKを代替しない。

未受入は、Aによる実Text／VAE／通常P4／全モデルDiffusion部分接続、実sample・進捗・取消後reload・生成結果保存、実model weight feedの管理境界、およびLoRAを使う全体運用。原寸81frame、任意shape／LoRA、Pages上の実model完走、全工程資源予算も拡大していない。**generationReady:false**を維持する。実装状態と、ownerの対応shape制限／構成未設定／数値検証不足を分ける。

## 環境・資源・再現

Chromium154.0.8037.57／Node24.19.0／Linux x86_64、1-thread/no-COIで固定UIを検証。COIなし4-thread要求は自動fallbackせず拒否。P4画面の16,777,216B allowanceはlogical入力専用で、model／コピー／ORT／workspace／総RAMを含まない。今回の実model RSS・ORT・全工程peakは未測定。Worker終了件数とserved source bytesだけを実測値として扱う。

```bash
git fetch origin codex/management-full-route
git worktree add --detach /tmp/manager-r18 f084790d7f594915c869ef375fcbdc6e44ee56f3
cd /tmp/manager-r18
node --test --test-isolation=none \
  tools/ai-connection/test-text-vae-standalone.mjs \
  tools/ai-connection/test-normal-p4-current.mjs \
  tools/ai-connection/test-diffusion-public-weight-feeds.mjs \
  tools/ai-connection/test-operational-management.mjs
node tools/ai-connection/run-operational-browser.mjs \
  --manager-commit f084790d7f594915c869ef375fcbdc6e44ee56f3 \
  --out /tmp/fresh-manager-r18-ui
```

Node／Playwright／Chromiumの必要配置、通常画面、保存復旧は[REPRODUCE](../full-route/REPRODUCE.md)。全841回帰は履歴owner固定rootが必要なものを含み、上記の新規focused testsとは区別する。保持側は[HOLDER-RUN](HOLDER-RUN.md)の`MANAGER_SHA`へAの完全SHAを入れ、既存NNと同じ16GiBに同時起動せず、終端後に順次実行する。取得ACKのための再推論／再export／全モデル再hashは不要。試験LoRAを今回受領したとは扱わず、全体運用は後段で別に受け入れる。
