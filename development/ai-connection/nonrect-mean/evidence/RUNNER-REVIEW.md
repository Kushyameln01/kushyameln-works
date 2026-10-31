# 非正方形meanとLoRA共同runnerの独立レビュー

現在の状態: 実行後artifactの独立再照合PASS。以下の静的レビューは実行前の記録で、後記に実行済み結果の確認を追加した。レビュー担当は新たな共同実行や原本全体hashを行っていない。

2026年10月31日 JST。対象はLoRA作業treeの `tools/ai-connection/test-lora-nonrect.mjs`、`joint-browser-cases.mjs` のoptional test-only baseFactory差分、`test-joint-comparison.mjs` の曖昧入力拒否fixture。製品code・原本は変更せず、本レビューで共同runnerは実行していない。親が宣言した専用private出力directoryを使う試験について、静的阻害事項はない。

## 確認した接続と拒否

- CLIはpeer-root、peer-commit、artifact、reference-root、lora-root、outの6明示引数。重複/未知/不足引数と不完全commitを拒否する。新runner自身がHEADのGit blobとbyte同一でなければ実行を拒否し、HTTPで実際に読み込むpeer/own/fixture sourceも完全commitのGit blobと照合する。
- Artifactはsource/peer repository外のrealpath、regular file、group/other accessなしを要求し、709,364 bytesとSHA `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff` をNodeとbrowser双方で照合する。schema/scope/fullFileHashRecomputed:falseを検査し、元original-sized Blobを作らない。
- 参照chainは修正後の `PRIOR_ACCEPTED_COMMIT=0c27874908638afc748ea2455a2779a16736730b` に固定。privateに残る各side reference.json/result.jsonが、その公開固定commitのJSONとbyte同一でなければ拒否する。全expected weight/bias/activation/base配列もその参照のbytes/SHAと照合する。これは計算済み独立NumPy期待値の再利用で、新しい全原本hashや新しい独立数値式を捏造しない。
- Artifactのmodel/registryは旧受入のactual原本記録に一致を要求する。5rangeの順・byte長・canonical base64・実SHAと旧原本参照のrange hashを比較する。選択provider自身がheaderからoffset/scale/profile/registryを再構成して厳密照合する。prior full-file receiptはhistoricalと明記され、新しい全体認証へ昇格しない。
- 既存 `runJointCases` のbaseFactory追加はtest-onlyで、元Fileとfactoryの同時指定、不正factoryをimports/provider呼出し前に拒否する。baseFactory未指定時は元whole-File pathのまま。現試験は実 `createBerniniBlockProvider` だけを注入し、LoRAのSDK/loader/planner/kernel/consumerは現在のown sourceを再利用する。Diffusion側の旧2bba907用v2 adapterを使わない。

## meanと20ケースの意味

- 同じChromium pageで、先に既存native `runE6API` 4casesを実行する。public requestは `input:{tensor}`、exact profile/shape、Worker/Port ownership、NOT_READY維持を既存owner試験で検査する。
- 既存 `runRectCases` をLoRA処理の前後に実行する。Git受領した実F1/Rect mean・manifestと明示codec sourceを読み、独立f32参照で全値を比較する。各runが実mean kernelを作ってdisposeするため、意味は「同一browserでLoRA transactionsの前後に、同一profile/fixture/全値normalized-restored hashを確認」。同じpersistent mean instanceの保持、管理snapshot、共同peak budgetを証明する試験ではない。
- before/afterのprofile、shape、manifest/fixture/normalized/restored hashesと最大往復誤差を比較する。owner body内のpredeclared gate2e-6、F5/Rect同128値の誤shape拒否、ABI、copy/dispose、mixed profile反復を緩めていない。
- HIGH→LOW、各sideのlight/detailを順次実行し、3強度0/1/−1と再適用/取消復帰を合わせて20最終caseを要求する。元Q full5120×5120・先頭16行全列、light明示bias、detail不変base bias pass-through、原本hash・全除外patch/regionを既存helperのまま保持する。
- 現実装のPARTIAL、completeAdapter:false、modelInference:false、generationReady:false、snapshotPublished:falseがreport全体と各joint resultに残る。既存helperによる新File全体hash、旧plan/取消/復帰、prepared/candidate解放後のcopyとold rollbackをそのまま確認する。実native leaseは導入していない。

## I/Oと資源

Private artifactはfile-inputのFileとしてbrowserへ渡し、GET用routeを作らない。raw base64/Q bytesはresultへ入れない。expected F32/F64比較配列はloopback `/reference/` で必要分を配信するため、「全ての数値参照がHTTPを通らない」という試験ではない。original `.safetensors` とartifactのGETがないこと、server/page error、試験前後のartifact stat同一性を確認する。

選択したactual重み/bias/scopeはbounded POSTでprivate out/actualへ保存し、reportにはhash/範囲/native receipt/16診断出力を保持する。公開へ渡す場合はresultとmetadata-only receiptだけとし、private artifactや選択配列をcommitしない。mean fixtureは既に公開sourceにある小さなVAE診断meanで、private Bernini base fragmentとは別である。

meanのMemory/arenaはowner statsで固定量を観測する。LoRAとDiffusion各資源はhelper終端、native APIはowner test終端でdisposeする。RSS/全model/ORT共存peakの計測や生成工程全体の受入とは主張しない。

## 静的レビューの範囲

本レビューの共同runner実行状態はNOT_RUN。直前に別の受領確認として行ったNode27/Chrome27のowner mean試験とnative API4caseのPASSは `/workspace/work/lora/nonrect-mean-contract-audit.md`、`nonrect-received/mean-receiver-verification.json` に別記録され、これから実行する20実LoRA共同caseと合算しない。

参照JSONの自己申告だけでは独立期待値のprovenanceが固定されない点を、親の追加した公開固定commit byte照合で解消したことを再確認した。現範囲で他の阻害事項はない。実行後にactual counts、全16出力/全選択weight-bias比較、loaded source hashes、mean before/afterとprivacy/source error指標を結果から確認する必要がある。

Reviewed working-tree file identities (before parent commit):

- test-lora-nonrect.mjs: 16,535 B, SHA-256 `4881820932e1cb0d906ff4088867bad6311613e6a6a101c82f787261d31681f2`.
- joint-browser-cases.mjs: 17,100 B, SHA-256 `b245520cc1eae8649af0bf9e41e02f9ef97be35ea11c0785d953ff6b46e588db`.
- test-joint-comparison.mjs: 1,543 B, SHA-256 `7bb1b83be77b9f4bf18c16b251450eed8c622124756fe73927ded9d6b44806c2`.

## 実行後artifact独立再照合

2026年10月31日 JST。親の新共同実行 `/workspace/work/lora/nonrect-received/joint-run-1/result.json` を読み取り、保存配列と固定Git objectsから再照合した。親実行sourceは `e66733a74a24405091e25805e7985d11a77683cd`、peerは `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。result SHA-256は `8e34c5ea967ceaed03b3aeca01903cb89e1a36dfd436034d6d072083f403033e`。

**結論: 実行後の証拠照合PASS。残る阻害事項なし。** 独立readback scriptは `nonrect-received/review-joint-readback.py`、機械可読結果は `nonrect-received/joint-independent-review.json`。このscriptは保存配列/JSONとGit blobsだけを読み、.safetensors原本やモデル全量を開かず、SDK/Hike/ORTを再実行していない。

| side | 成功case | weights比較 | bias比較 | 出力比較 | weight最大絶対誤差 | bias最大 | 出力最大絶対誤差 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HIGH | 10 | 819,200 | 160 | 160 | 6.122718332335353e-9 | 0 | 7.450580596923828e-9 |
| LOW | 10 | 819,200 | 160 | 160 | 3.723471309058368e-9 | 0 | 7.450580596923828e-9 |

- 全actual selected weight/bias、base、scope、旧独立参照の計78unique fileについてbytes/SHAを確認した。各caseの全81,920重み・16bias・16出力を独立NumPyで再比較し、失敗件数0と最大誤差がrecordと完全一致した。weight/base/bias/outputの既定gateを追加・変更していない。
- 各caseの実weight/bias hashから、nativeの固定field orderのruntime-feed-set metadataを独立再構成し、実native validation receiptのpackageHashを再計算して一致した。
- 参照JSONと過去receiptは、公開固定 `0c27874908638afc748ea2455a2779a16736730b` のGit blobとbyte同一。参照の各配列のbytes/hashも実fileに一致し、各referenceProofが同じ元registry/model/rangeを記録していた。これは既存独立期待値のreuseの確認で、新しい全原本hashの証拠ではない。
- 実行時に読み込んだ46source/WASM/fixtureの各bytes/SHAを、そのrecordが示す完全commitのGit blobから再計算して一致した。runnerSourceSHAもe66733aのGit blobから再確認した。own LoRAの修正kernelを使い、Diffusion旧2bba907用adapterを代用していない。
- 全caseはPARTIAL、元shape5120×5120、rows0..15/全列、lightの明示biasとdetail base-bias pass-throughを維持。light1,050/detail399の完全除外targetと元regionは保存scopeと一致した。scopeArtifactはpair/sideごと初回caseで一度だけ保存する仕様であり、同じpairの後続caseはその宣言を共有する。
- meanBefore/meanAfterは各7case PASS。profile、shape、fixture/manifest/normalized/restored hash、最大往復誤差が完全一致し、別工程で得た受領側Nodeの実保存mean結果とも一致した。Rect maxAbs2.384185791015625e-7、F1 1.1920928955078125e-7、gate2e-6。node27/browser27の以前の受領確認と、このjointの前後14caseは別の実行scopeである。
- mean各runのMemory1,114,112 B/arena1,024 B、workspaceReuse=true、実WASM bd42d4…を確認。新native API4caseもPASS、BUILD_IDはdiffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20。4caseはnative shape/Worker/Port fixtureで、実VAE NN再実行ではない。
- 各sideのprovider statsはsource:bounded-fragment-artifact、fullFileHashRecomputed:false、fullFileSHA256Verified:false、unprovidedRangesAvailable:false。5rangeのみを読む契約とprior owner historical receiptを保持した。Hike Memory1,572,864 B/arena491,648 B/workspaceReuse=true。
- 全caseでpreparedとcandidate履歴解放後の実consumer run、independent-copy所有receiptを確認。実native leaseはN/A。19 lifecycle/sideを保持し、両sideともold committed epoch17→18の後、旧rollback restored:falseを確認した。
- reportのoriginalModelHTTPRequests/privateArtifactHTTPGetRequests、server/page errorsは全て空、artifactFileUnchangedAcrossTrial=true。公開metadata/resultにprivate artifactのraw base64/dataを組み込む必要はない。期待値F32/F64のloopback GETとprivate artifact未配信は区別する。

これは同一browserにおける実LoRA20case、前後mean14case、native API4caseのそれぞれの境界検証である。これらを全モデルpipelineの38case合格、persistent mean instanceの共存証明、NN/生成寄与、管理snapshot公開、組合せ資源peakの解決とは扱わない。全体reportのcompleteAdapter/generationReady/snapshotPublished/modelInferenceはfalseのまま。
