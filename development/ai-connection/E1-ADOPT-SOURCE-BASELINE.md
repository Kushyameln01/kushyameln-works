# E1 最新LoRA採用の取得正本と境界

2026-10-31 UTC。管理が保持していた旧pinから、今回のPR headを新たに取得し、実装・API・共同試験記録を確認した。取得担当の検証はGit blob／配布hash／差分の静的確認であり、管理側の実原本共同実行はこの文書の検証結果に含めない。機械可読記録は [E1-ADOPT-SOURCE-RECEIPT.json](E1-ADOPT-SOURCE-RECEIPT.json)。

## 今回取得した固定正本

| 所有者 | 今回の完全commit | 比較元の管理pin | 正本 |
| --- | --- | --- | --- |
| LoRA | `0c27874908638afc748ea2455a2779a16736730b` | `dcb1f504263955ef2a4b1613b7a9d802aebd1c18` | [PR #2](https://github.com/Kushyameln01/kushyameln-works/pull/2) の取得時head |
| Diffusion | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` | `438972f30242e0a3bc66edb8591f38eaa0fcd384` | [PR #6](https://github.com/Kushyameln01/kushyameln-works/pull/6) の取得時head |

`refs/pull/2/head` と `refs/pull/6/head` を追加network権限でfetchし、完全commitの `git archive` をそれぞれ `/workspace/work/ai-connection/e1-adopt/native/0c27874/`、`.../5f880fd/` に展開した。全展開blobをGit objectのSHA-1と照合した。全treeはLoRA 1,069 blobs、Diffusion 1,300 blobs。所有範囲の取得receiptは182／413 files、比較元からの変更は52／129 paths。tree全量JSONとtarのbytes／SHA-256もreceiptに保持した。

両branchは他担当の過去ファイルを継承する。**LoRAのowned pathはLoRA正本から、Diffusionのowned pathはDiffusion正本から取得する。** Diffusion最新treeにあるLoRA kernelは旧4,919-byte版であり、新LoRAとして採用できない。

## 採用対象の実装差分

LoRA最新は `docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs` と同階層の `DIFFUSION_DIAGNOSTIC_ADAPTER.md` を追加した。native SDKは `lora-connection/2.0-draft.1`、外側adapterは `lora-diffusion-diagnostic-adapter/0.1`。`createDiffusionDiagnosticAdapter({consumer, baseProvider, isOwnerCurrent})` に実native objectと明示owner現在性を注入する。戻り値は `registry / baseProvider / createSink(plan) / targetForPlan(plan,reference) / finalize(plan) / restoreBase(input) / run(input) / describeBinding()`。native SDKへ架空のapply/detach/resetを加えていない。

full tensor内element offsetとnative selected slice内offsetを検査付きで変換し、native registry hashとconnection registry hashを別に保持する。lightは明示Q diff_bを計算し、detailはLoRA biasを捏造せず実base bias16値をhash付きpass-throughとしてsinkへ渡す。native validate／commitの実receiptにplan・source・scopeを結び、実consumerによる独立copyの所有権だけを `CONSUMER_APPLIED` に対応する。callerがconsumer、stage、baseを所有し、その順で終了する。`finalize(plan)` はstage終端後にrollback履歴を解放する。

新LoRA kernelは **5,051 bytes／SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`**、ABI `lora-block-f32-v1`、Hike `3c51fde6675f317453919bd505d0e2d0f638e7f1`、backend `wabt-normal`。実bytesをregistryと照合した。SDK planのbuildIdはこのkernel SHAであり、Git commitやAPI版とは別である。旧kernel `da6d56fca5d9bc91173681c22b91cd9337f53ea067d84455b9d659ee7ee52984` は大BF16 decode時にloop内temporaryがstackを進め、host arenaへ衝突した。初回HIGH強度1の81,920値中66,071値が事前gateを超過した記録を保持し、変数をloop外で再利用する修正と大行列回帰で解消した。ABI・演算順・gateは変更していない。管理が実原本試験へ進む際に旧kernelを再利用してはならない。

Diffusion最新は `lora/v2-adapter.mjs` に別の外側bridge `createLoraV2DiagnosticAdapter({base,stage,includeBias,reference,isCurrent})` を実装している。こちらはnative consumerを自ら所有し、LoRA側adapterとはfactory／ownership／cleanup APIが異なる。二つのbridgeを重ねたり同じfactoryとして扱わない。最新Diffusionの `tools/ai-connection/test-lora-diffusion.mjs` はなおLoRA `2bba90785292e42a0c7c8756685b0d8b128b2dcf` と旧kernelのhashを固定しており、今回の修正済み実原本試験を再現する入口としてそのまま使えない。

Diffusion native protocolは `diffusion-models/0.1`、最新buildは `diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20`。生成済みbuild-infoに列挙された52 source hashが現在の配布bytesと全て一致した。LoRA所有者の実共同試験で使用した対向版は旧pin **`438972f30242e0a3bc66edb8591f38eaa0fcd384`** である。438→5fの診断base／consumer／ORT stageを起点とするlocal import・asset closure 15 filesは全てbyte同一であることをGitと配布bytesで確認した。新head全体のbuild／新機能まで実共同検証済みと読み替えない。

## 最新の実PARTIAL結果の読取

最新 [JOINT-LORA-RESULT.md](https://github.com/Kushyameln01/kushyameln-works/blob/0c27874908638afc748ea2455a2779a16736730b/development/ai-connection/JOINT-LORA-RESULT.md)、matrix、HIGH／LOW-result、source proof、独立比較、kernel reviewを取得した。古い合成試験成功や未取得状態で代替せず、以下を**所有者報告と取得済み公開証拠**として採用する。

- HIGH実行sourceは `4d5fd7363f40f0d743ead448193ef2bf1915bbdc`、LOWは `e1f03a4f6092c3154d5b47f166b77bbd32897ac9`。最新0cの製品SDK／adapter／kernel／oracleは成功版とbyte同一であり、runnerの旧rollback手順と文書を更新している。
- light/detail × HIGH/LOWの実原本4件、各side10成功case、計20。選択Q full shape `[5120,5120]` のrows `[0,16)` × 全5120列、81,920 weightと16 bias／16出力に限定する。lightの他1,050 patches（全201 diffを含む）、detailの他399 patches、未選択rowsは除外表に保持する。全target適用や同時合成ではない。
- 独立NumPy binary64 oracleはraw FP8／F16／BF16から計算し、実Hike F32／ORT WASM `1.24.3` Gemm／Hike biasと比較した。strength `{0,1,-1}` は明示診断集合。base全値はF32 bytes厳密一致、weight gate `1e-5 + 1e-4*abs(ref)`、biasはF32厳密一致、全16出力 gate `1e-6 + 1e-5*abs(ref)`。各side819,200 weight／160 bias／160出力、失敗要素0。最大weight絶対誤差はHIGH `6.122718332335353e-9`、LOW `3.723471309058368e-9`、出力は両side `7.450580596923828e-9`。
- preparedとcandidate履歴の解放後も実active feedで一致し、再適用は不変baseから同じhashへ戻る。prepare取消、consumer協調取消、stale plan、validation失敗のrollback、commit後かつSDK返却前の取消からの復帰を確認したとの記録がある。HIGHの旧rollbackは未commit候補、LOWはcommit済みepoch17候補→epoch18新commit後の旧rollback `restored:false`。HIGHで後者まで測定したとは扱わない。実consumerのleaseはN/Aである。
- `coverage:PARTIAL`、`completeAdapter:false`、`generationReady:false`、`snapshotPublished:false`。全model session、生成寄与、管理snapshot、両side原子的切替は未実行。管理自身の現在性／revision／取消／保存を含む試験は別に行う。

## 原本とprivate evidenceの取得境界

現在のworkspaceで最新報告とrunnerの**正確な6 pathsのみ**を改めて確認し、2 baseと4 LoRAの実Fileは存在しなかった。これは今回の取得時点の確認であり、所有者側での成功や別環境の保管を否定しない。fresh HTTP metadataとrange/header probeで、4 LoRAは公開・ungatedの固定URLへ到達し、LFS全体hash／サイズと取得header hashが所有者inventoryに一致した。全payloadを取得・全体hash再計算したという結果ではない。

| 原本 | 固定repository／revision | bytes | 全体SHA-256 |
| --- | --- | ---: | --- |
| light HIGH | `rzgar/Bernini-R-LightX2V-4step-loras@c17ea315dcd83e3cd98f852f41be47deb58ad667` | 1,244,141,856 | `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945` |
| light LOW | 同上 | 1,244,141,856 | `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` |
| detail HIGH | `Apraxas/general-nsfw22-wan@95bbe05a72e6f643f09bdd5cabe440b80c5656ef` | 613,516,752 | `34e2144d3cd65360f97d09ccbe03e1c39a096df6c9234af5fe3899d1b63cda39` |
| detail LOW | 同上 | 613,516,752 | `d6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db` |
| base HIGH | `Comfy-Org/Bernini-R@f7fd9812e54095d0c511d5e7429e6d8f6acc381a` | 15,574,833,216 | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` |
| base LOW | 同上 | 15,574,833,216 | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |

正確なresolve URL／fileName／header hash／HTTP probe／private pathはreceiptへ記録した。所有者のbase全体取得receiptは全byte coverage・全体hash・immutable Fileのsize/mtimeNs/ino/devを結ぶ。そのstat receiptを新環境で取得したFileへ流用せず、新取得Fileについて作る。nativeの `fullFileSHA256Verified:false` を外側receiptの代わりにtrueへ書き換えない。

LoRA [引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3) は取得時sequence5。HIGH-fixed ZIPは5,046,473 bytes／SHA `62fdd108602295c8fa4510cbe82a0b7b02229172b70ecda7f26278f94440e6c8`、LOW-fixed ZIPは5,008,603 bytes／SHA `9386dd0c9907b73f6c2bea0308f70fb6a148723acbefd3e382ce04c807082a8a`。private Library参照はreceiptに保持した。今回はPage metadata／公開Git結果を取得したが、binary ZIP payloadは回収していないためarchive hash独立照合済みとはしない。ZIPは選択weight・期待値・結果の数値証拠であり、元モデル全体／4 LoRA原本の代わりではない。

最新Diffusionは `lora/base-block.mjs` の `createBerniniBlockProvider({artifact,side,hikeBytes?,signal?})` を追加し、genuine raw rangesから同じnative provider境界を提供する。`bernini-diagnostic-base-block/0.1` はheader・Q weight・bias・scale・configの原本offset／length／rawSHAを保持し、元15.57GBのFileを偽造しない。公開文書に記された実two-side artifactは709,364 bytes／SHA `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。公開Gitにraw payload／Library参照はなく、文書上のprivate recipient共有状態は未完了である。別経路で取得する場合もdelivery hashと来歴を確認し、`fullFileHashRecomputed:false` を維持する。現LoRA owner CLIは完全File＋stat結合receiptを要求するので、このfragmentを無断でその入力へ差し替えない。

## 管理への適合と再現の前提

新LoRA adapterと修正済みkernelを固定し、管理の実owner識別へ `isOwnerCurrent` を結ぶ。manager revision、SDK local input/application revision、native epochを別に保持する。独立source roots、両registry hash、plan／source／bundle／package hash、PARTIAL scope、copy ownership、取消・復帰終端をそのまま記録する。

LoRA ownerの `tools/ai-connection/test-lora-diffusion.mjs` は `--peer-root /fixed/diffusion --peer-commit <40hex> --side HIGH|LOW --base <full-original> --base-receipt <current-bound-receipt> --lora-root <originals-root> --out <private-output>` を受ける。independent oracleは `tools/ai-connection/lora-reference.py`。実Fileをbrowserへ渡し、served bytesを完全commitのGit blobで照合する。owner CLIは自分のrootで `git rev-parse HEAD` するため、`.git` のないarchiveからそのまま実行できない。detached worktreeか、Git objectで照合する管理の明示runnerを使う必要がある。

この取得工程ではruntime joint test／GB原本downloadを実施していない。source取得は完了、原本URLは判明しており、管理の次の検証は実bytes／自分の全体hashとstat receipt／固定sourceを揃えて行う。private raw配列やモデルbytesをrepositoryへ追加しない。
