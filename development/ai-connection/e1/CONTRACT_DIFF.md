# E1受領状況とPARTIAL共同診断の接続差分

対象は接続実行計画 `0.2-draft.1` E0/E1、総合仕様 `1.1-draft.1`、Diffusion `f522d9aeff313558c4ef83022a340af9a4c21391`。取得記録は [acquisition.json](acquisition.json)。**実LoRA＋実baseの共同試験はBLOCKEDで、まだ実行していない。**

## 更新：LoRA v2実ソースをGitから受領

`origin/codex/lora-connection-v2` をfetchし、実HEAD **`2bba90785292e42a0c7c8756685b0d8b128b2dcf`** を受領した。実装commit `89b489c6f2595ebff8836fe90b18fc94e3ea086b` がその祖先であることも確認した。これにより **SDK source取得の阻害は解消**。以下の「未push」「SDK未取得」「署名未読」はbranch公開前の取得履歴として保持し、最新状態は本節とacquisition.jsonの `gitSourceReception` を正本とする。ZIP bytes自体の受領・digest検証とは別である。

SDK、planner、state、v1 adapter、loader policy、API文書とHike host/registry/WASMの9ファイルをGit objectから読み、各git blob・bytes・SHA-256を記録した。[実SDK](https://github.com/Kushyameln01/kushyameln-works/blob/2bba90785292e42a0c7c8756685b0d8b128b2dcf/docs/shared/inference/lora/sdk-v2.mjs) はSHA-256 `c425519eb282f798f4296bc97fd1506664afd850dee9addb17af77dd41e39fa0`、[実planner](https://github.com/Kushyameln01/kushyameln-works/blob/2bba90785292e42a0c7c8756685b0d8b128b2dcf/docs/shared/inference/lora/planner-v2.mjs) は `303340db3a6a58b288fbfbf38cb2b53605a6c7cc3f6d00903f881aa825ef92c5`。既にFilesで受領したv2契約・registry対応・原本台帳は、このcommitの各ファイルとbyte同一だった。

実sourceから確定した呼出しと接続条件は次の通り。下の既存adapter条件に大きな矛盾はなく、具体的な変換点が確定した。

- factoryは `createLoraV2({folder,sourceFactory,kernel:providedKernel}={})`。`sourceFactory(selection)` は同期でsourceを返す。planにはsourceの `hash()` が必須で、inspectのheader確認だけではplanにならない。
- `plan(input)` はselection/registry/strength/loaderPolicyId/diagnosticを捕捉する。plannerはregistry/targetの未知fieldを拒否するため、Diffusionのdescriptorを拡張field付きで丸ごと渡せない。full shape/identity transformのSDK registryと、native row-slice/FP8 descriptorの対応を別に保持する。
- `prepare(plan,{baseProvider,sink,blockRows=16,signal}={})` はfull tensor offsetでproviderを読み、sinkには `fullShape` と `slice` を返す。selected `shape` は送らない。dual registry hash、offset/shape変換、detail biasのbase pass-throughは引き続き必要。
- `stage(prepared,target,{signal,isCurrent=()=>true}={})` はtargetのcontractVersion、describeしたSDK registry hash、構造化validationとcommit receiptを厳密に検査する。実SDKのPARTIAL scopeは **`diagnostic-projection`**。対応資料の `single-projection-diagnostic` は説明ラベルで、wire scopeとして流用しない。
- stageのoptions/contextには独立expected・activation・許容差を追加して渡す口がない。adapterがそれらを所有snapshotとして保持し、native `target.validate` へ明示供給する必要がある。native `scope:PARTIAL` の実receiptとSDK scope/plan/source識別を対応付ける。
- commitは `STAGED` または `CONSUMER_APPLIED` と実copy/leaseのownershipを返す必要がある。SDKのpost-commit current検査が終わる前にnative candidateのrollback履歴を捨てない。`release(prepared)` はlease/in-use/recovery中に拒否し、`recover(prepared)` / `recover()` は復帰・sink abortを再試行する。
- v2に `detach` methodはない。解除はDiffusionの不変base候補を独立検証・commitする経路と合意して接続する。旧SDKのdetach呼出しを推測で流用しない。
- state helperはPARTIALのsnapshot公開を拒否し、常にgenerationReady=falseを維持する。v1 adapterはFULL/full-adapter・真のinitializerに限定され、今回のruntime-input/PARTIALを通す経路ではない。
- Hike kernel hostは構築時に32MiB Memoryへgrowし、1MiB以降をworkspaceとして再利用する実装だった。WASM SHAは `da6d56fca5d9bc91173681c22b91cd9337f53ea067d84455b9d659ee7ee52984` と一致した。今回はbyte digestとsourceの確認のみで、kernelを実行した証拠ではない。

4原本payloadは引き続き当環境にない。今回payloadの新download、SDK/kernel実行、vendorコピー、adapter/runtime編集は行っていない。**joint実行0件を維持し、現在の阻害は実4原本の受領（detailの取得経路未提示を含む）である。**

## 受領済みと未受領を分ける

[引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3) を `read_page(view:full)` で取得した（61blocks、保存本文 [handoff-page.md](handoff-page.md)）。次の4点はFiles参照から本文を実取得し、UTF-8 bytesのSHA-256を再計算して返却値・Page値と一致した。原本safetensorsやSDK sourceを受領したという意味ではない。

| 受領物 | bytes | SHA-256 |
| --- | ---: | --- |
| [v2契約](received/connection-contract-v2.json) | 13,748 | `87e132af1739114f171254888c04f3050df27c47cd02e92fd67bc5babe4ac6d2` |
| [registry対応](received/registry-correspondence-v2.json) | 11,895 | `a3a0a6fd7c5d71cbf8c2e4b73f83d4581df47c1a5b8ab09a9cb48778ce81b3ab` |
| [配布receipt](received/delivery-receipt.json) | 1,799 | `8862eb09b9a30862ad37e8b24dab332b7b3529ef1928bd4277b3be01da295492` |
| [原本台帳](received/original-inventory.json) | 495,806 | `97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3` |

SDK実装commit `89b489c6f2595ebff8836fe90b18fc94e3ea086b`、配布commit `2bba90785292e42a0c7c8756685b0d8b128b2dcf` は、Page/receiptでは未push。GitHub connectorで両commitを実照会した結果も各422 `No commit found for SHA`。これはこのrepositoryからの今回の取得結果で、commit自体の不存在とは断定しない。

配布ZIPはFiles metadataで255,467 bytesを確認。報告SHAは `10e4993c3e5c6e6e4ca7cc7bed4bae10cdc21e022b1a8b85d4ec12e95541f1eb`。しかし `read_page_reference` はZIP非対応で、利用可能な汎用Files binary downloadもない。**ZIP bytes・Git bundle・sdk-v2.mjs/planner-v2.mjs本文は未取得で、archive hashも今回未検証。** 可読textpack（base64 JSON等）か、同一commitの取得可能なsource経路が必要である。報告署名からsourceを復元しない。採用vendor/sourceコピーもまだ行っていない。

## 4原本の所在と取得経路

当環境の `/workspace/work/lora` は存在せず、下の4payloadは受領していない。台帳はheaderの情報を保持するが、payloadの代用や今回の全体hash検証にはならない。配布ZIPにも原本を含めないとPageが明記している。

| pair / side | 原本 | bytes | 今回の経路確認 |
| --- | --- | ---: | --- |
| light / HIGH | Bernini-R_LightX2V_high_noise.safetensors | 1,244,141,856 | 既存catalogのHF URLにHEAD200。originのx-linked-etag/sizeは台帳と一致。payload未取得 |
| light / LOW | Bernini-R_LightX2V_low_noise.safetensors | 1,244,141,856 | 同上 |
| detail / HIGH | NSFW-22-H-e8.safetensors | 613,516,752 | catalog URLはnull。取得可能URL/ファイル受渡しは未提示 |
| detail / LOW | NSFW-22-L-e8.safetensors | 613,516,752 | 同上 |

lightの確認済みrepository commitは `c17ea315dcd83e3cd98f852f41be47deb58ad667`、repositoryは `https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras`。固定取得URLはacquisition.jsonに記録した。HTTPの最終ETagをpayload SHAとして流用せず、originの `x-linked-etag` と台帳の一致を**サーバー側宣言**として記録した。今回のローカルpayload hash検証ではない。detailを別の類似モデルで置き換えない。

## native APIとの具体的な差分

Diffusion側は実source `diagnostic-base.mjs`、`diagnostic-consumer.mjs`、`DIAGNOSTIC_API.md` と照合した。LoRA側について確定できるのは取得済みv2契約の記述までで、実sourceの関数引数・callback時機・エラー処理は未読である。下表は**必要なadapter条件**であり、双方が採用・実装・共同検証済みという意味ではない。

| 境界 | LoRA v2契約 | 現Diffusion | 必要な対応 |
| --- | --- | --- | --- |
| factory/planner | `createLoraV2({folder,sourceFactory,kernel})`、`buildPlanV2({inspection,registry,diagnostic,sourceSha256,strength,loaderPolicyId,alphaValues})` | base/consumerは別factory | 実SDK source取得後にprepare/stage等の実署名とsourceFactory呼出しを固定する。旧SDKのcatalog引数を推測して使わない |
| registry | `shape`は元full logical shape、transform identity、module/parameterRole/loaderPolicyId必須 | `shape:[16,5120]` / `[16]`、`fullShape`別、native row-slice、runtime-input/hike-parameter | 元full shapeをLoRA registryへ、実selected sliceをdiagnostic選択へ分離。native row-slice・FP8情報を対照表に保持。full registryへtileを偽装しない |
| hash | SDKが版付きregistry/planを識別 | native registry digestはbase/graph/side/scale/slice等を含む別descriptorのdigest | LoRA registryHashとDiffusion registryHashを別fieldで保持し、同じ値へ付け替えない |
| provider | 不変baseの**full tensor内**element offsetを要求 | selected slice内offset/count。model/graph/native registry三hashが必須 | full→selected offsetの範囲検査・変換とnative identity注入。今回rows0–15でも一般化時の黙示同一視を避ける |
| sink manifest | planId/source/loader/coverage/scope等のLoRA manifest | modelHash/graphHash/native registryHash/side/scope=PARTIALが必須 | 二つのmanifestを紐付けて検査。LoRAのscope文字列をnative scopeへ上書きして証拠を失わない |
| sink block | fullShape・binding付きselected patch block | shapeはselected形、offsetはslice内。exact bytes SHAと全extent、重複/欠落を検査 | key/weightId・binding kind/name・full/selected shape・element offsetを明示変換。graphInitializer経由で通さない |
| biasの被覆 | detailにはbias patchがない。lightは同Qのdiff_bを含む | sinkはq.weightとq.biasの**両方**の完全被覆が必要 | detailのbiasは不変base16値をpass-throughして実行feedを完成。ゼロ補完・架空bias patchは禁止。LoRA計算とpass-throughを区別する |
| validation | contractVersion、valid、coverage、scope、planId、registryHash、sourceSha256を持つ | schemaVersion、valid、scope=PARTIAL、candidate/identity/package/reference hash、誤差と実stage evidence | 独立expected[16]と許容差をnative validateへ渡し、返却実証拠へ対応するSDK identityを付ける。`true`だけに変換しない |
| commit | STAGED / CONSUMER_APPLIED、planId、実copy/lease ownershipが必要 | `committed:true,scope:PARTIAL,modelInference:false,epoch,packageHash` | 実consumer所有bytesへ結ぶ版付きreceiptを作り、管理snapshot公開と分ける。UUIDだけ作ってownershipを証明した扱いにしない |
| cleanup | in-use/lease/復帰未完のreleaseを禁止、recover/disposeで再試行 | candidateはfeedの独立copy、activeはfeed参照を保持。releaseCandidateはrollback履歴を捨てる | SDK復帰可能期間はcandidate履歴を保持し、失敗後のrollback/retryとsink/package解放を対応させる |

SDK契約のscopeは `diagnostic-projection`、registry対応資料のラベルは `single-projection-diagnostic`、Diffusionのnative scopeは `PARTIAL`。実SDKのvalidatorを未読のため、ラベル同士がそのまま送受信できるとは扱わない。coverage=PARTIAL、completeAdapter=false、generationReady=falseを維持した版付き対応が必要である。

## 共同runnerを開始する条件と確認対象

SDK本体・実原本を受領してから、LoRA private SDKを改変せず、実SDK/Hikeを呼ぶ別runnerで接続する。実source未取得の現時点では、呼出し署名や低rank式の代用品を実装しない。

1. SDK source/archive/bundleの実bytes/hash/完全commitを検証する。4原本のFile参照・hash receipt・pair/side対応を確立する。新loadに必要なhashを省略しない。
2. 実SDK sourceから署名・manifest・block・scope・所有receipt・復帰順を固定し、上表のadapterを実装する。Q rows[0,16)、全5120列、light biasの選択と全除外patch/regionを保存する。
3. 実base復号とLoRA加算を分け、固定loader/precisionに基づく独立参照・事前に固定した許容差へ、全選択weight/biasと16出力を比較する。SDK/Hikeを数式の別実装で置き換えない。
4. strength0/非zero/宣言した負数、解除・再適用・二重加算、誤binding、欠落/重複/checksum、中止・失敗復帰・bytes所有/leaseを確認する。detailのbase bias pass-throughも検査する。
5. PARTIAL/runtime-inputをv1 initializer/FULL adapterへ渡した場合の拒否を、取得した実v1-adapterで確認する。管理snapshot/全model/生成成功へ昇格させない。

現段階の共同実行件数は0。LoRA側報告74fixture/パネル12項目と、Diffusion側の実base小block検証を合算してE1合格としない。阻害はSDK本体の取得経路と4原本の受領であり、E0やE6/E7の独立作業を停止する理由にはしない。
