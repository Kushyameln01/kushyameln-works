# 管理884 P3 source取得・返却契約照合

2026-11-02 JST。管理P3の本文と固定sourceを取得し、既存LoRA実証との同条件部分・追加条件を照合した。**新runnerは実行しておらず、新しいE4保存・読戻しや管理数値受入は成立していない。** 既存60d記録は変更しない。

## 取得した正本と版

| 用途 | 完全commit |
| --- | --- |
| 管理の実行source | `8849891f19124df31847bd691503c2491278eaa8` |
| 管理の配布・証拠追補 | `f34bf10a67c91f462ab46dec033eaeb2110facf1` |
| 返却する既存LoRA成果 | `dd95ed05f058930a391f015c11b9a2b963a42db5` |
| 既存実行source / 使用管理 | `28f44c3a1b71bef59e2d018a0db736de6d84675c` / `60d16b64d6020d3d20239f087f8add91268dcaad` |

管理の[API本文](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/docs/shared/ai-connection/API.md#joint-p2p3-receiver-runners)、[P3実行・返却条件](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/development/ai-connection/p23-joint-acceptance/P3-REPRODUCE.md)、host・browser・declarationを読了した。[固定136-file receipt](https://github.com/Kushyameln01/kushyameln-works/blob/f34bf10a67c91f462ab46dec033eaeb2110facf1/development/ai-connection/p23-joint-acceptance/CHECKPOINT-SOURCE-RECEIPT.json)の全136件について、宣言されたbytes/SHA-256と884のGit blobが一致し、f34の同pathも全件同じbytesだった。f34との差分はdevelopment配布証拠9ファイルの追加のみ。今回の確認はsource取得であり、管理の既存467件試験やP3を再実行した記録ではない。

sourceごとの完全commit/path/bytes/SHA-256/Git blob IDと136件の読戻し結果は[機械可読の比較記録](MANAGEMENT-884-COMPARISON.json)の `reproductionOfThisComparison` に収めた。`manager-api` は60,758 bytes / SHA-256 `12bf22010239fa5ab33adc9a9fc87496413b25797063ad066160febfcecdb31c`、136件receiptは30,379 bytes / SHA-256 `26a54c8dcb723aec6c863460b3a9cd78b01a4098fab36b83f3b5bc3bacdc941a`。

## 既存6caseをそのまま参照できる条件

既存[RESULT](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/RESULT.json)・[完全receiptの公開メタデータ](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/evidence/receipt.json)は、実行28f・管理60dの証拠として再利用する。管理884と60dの正式DATA bridge、adopted adapter、snapshot、queue、package、規範実行・reference loader・codec等13ファイルはbyte単位で同じだった。この一致は、新runnerの実行完了を意味しない。

| 条件 | 既存証拠と照合結果 |
| --- | --- |
| canonical mapping・native pins | LoRA `fc2789a0f649e33f15eb13750e6a983b5c52d170`、Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、DATA `82b21f09cb63926543181b16f0e97ebc6b9fa6be`。`createDiffusionDiagnosticAdapter` を正本とし旧bridgeを重ねない |
| 選択入力 | ローカルlight/HIGH 1 File、1,244,141,856 bytes、SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。旧loadで検査・全体hash済み。新loadの検査を免除せず、過去4原本は必須にしない |
| 真正baseと領域 | 709,364 bytes / SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff` の5 bounded ranges。Q full `[5120,5120]` の先頭16行・全入力列、bias先頭16。2 patchを含み1050 targetを除外。full base hashはfalseのまま |
| 数値とreference | 既存0c reference/gates、strength0/1/-1、6公開caseで491,520 weights・96 bias・96 outputs。最大誤差weight `3.72290287486976e-9`、bias0、output `7.450580596923828e-9`。再適用digest一致 |
| 正式3phase | source宣言のみのpreflight、実owner.validate後の全選択値比較checkpoint、実公開後のcoordinator証明。旧receiptに実target・manager/resource・SDK局所revision・別namespace consumer bindingを保持 |
| 取消・復帰・所有権 | checkpoint取消のstop/original terminal/release/reuse、旧feed保持、次case公開を確認済み。prepared/source解放後の独立copy、queue所有の不変base復帰、旧snapshotのuncurrent化、最終disposeを確認済み。取消checkpoint81,920 weights+16 biasは公開6caseの比較数へ加えない |

両registry hashはnative `b1142c55f5f43ac78cd1b167ceed5be0d7f8e9b87b21047ff565d08d38c4c87b`、connection `cc6a329b0cffbdf3c2a50914843da33e7d402a815921e206ddf5f8b0fea4c806` のまま。PARTIALをFULLへ変更せず、SDK局所revisionを管理共通revisionへ転用しない。

## 新runnerで別途必要な返却

| 新条件 | 既存証拠での扱い |
| --- | --- |
| 管理owned runnerでの実行 | 新status `PASS_MANAGED_FORMAL_DATA_REAL_BASE_PARTIAL_SNAPSHOT` は未取得。旧status `PASS_LORA_DATA_REAL_BASE_PARTIAL_SNAPSHOT` と実行source28f/管理60dを884へ付け替えない |
| expected bytesの拒否 | 新 `wrong-reference` はexpected copy先頭へ+1し、native prepare前に `NORM_REFERENCE_PAYLOAD_MISMATCH` を要求。旧試験はactivation copy先頭へ+1024、期待値/gateを維持して `NATIVE_VALIDATION_MISMATCH` に到達した。異なる負例なので代用しない |
| 試行counter | 新契約は6公開+1checkpoint取消=7 native prepare/stage、wrong-referenceは0、base restore1は別、baseline別、oracle再計算0。旧queue metadataには6公開+native validation失敗+取消の8試行とrestore1がある。新counterの実測として流用しない |
| output16 E4 | `initial-one` の実output16を、codec `2bdca59ea78580d4fe7a9d31a8de33209b64d029` のorigin/deployment検査付きで新規保存し、実diskから読戻す。実snapshot/target/output hash、package receipt、各file bytes/hash/readbackを返す。旧26 artifactやnative `packageHash` はこのdisk保存証拠ではない |
| E4負例 | 改ざん `ASSET_HASH_MISMATCH` とsnapshot sidecar欠落 `REQUIRED_ASSET_MISSING` は新route上で未実施。output16 packageとselected-weight `N-ARTIFACT` を分ける |
| 新取引traceと取消 | 各caseの実planTarget/request、manager/resource generation、SDK tuple、outside consumer token、snapshot target、owner validation、original queue targetを新実行で返す。checkpointのrunning/nonterminal slot、cancelのstop/terminal/release/reuse、旧feed保持、次の公開を同一実行へ結び付ける |
| private返却と受領 | 完全result JSON、artifact/package length/hash manifest、固定source取得ACKが必要。source取得、実行返却、管理受入、対向によるdd95 packet受領は別事実 |

API末尾の `jointTraceId` / `currentInputLink` はRect/P2 runnerの契約であり、LoRA P3 runnerに存在しない同名fieldを追加必須として扱わない。LoRAは上表の実snapshot/request/queue/owner/phaseの対応を保持する。

管理f34の記録は `BLOCKED_OWNER_INDEPENDENT_REFERENCES`、reference arrays未受領、base-only preflight PASS、native LoRA transaction0、formalBridgeAccepted false。保存されたmissing-input probeは `executedSourceCommit:null`、sourceBytesVerified false、referenceRoot不足であり、規範評価やCOMPATIBLE判定を実行した証拠にもならない。管理の取得済みowner handoffは旧 `82cd9bb3d6792fa20a5305f52198efca5a30459f` を指すため、今回返すdd95 packetの受領へ更新するACKは別途必要。

## 今回の完了範囲と保留

今回成立したのは固定source取得と契約本文の照合まで。推論、export、原本load/hash、reference配列読取り、browser、試験の実行は0件で、既存60d実行記録を変更していない。管理f34の `OWNER-HANDOFF.json` が記録した「ACKなし」はその読取時点の事実であり、今回の文書だけで外部コメント送信や相手による受領完了を主張しない。

新884の実File transaction、新E4保存・読戻し、expected-payload負例、同一runの取消/復帰trace、私有result/package返却、管理の新数値受入は未受入。`generationReady:false`、`currentLiveAdmission:false`、`load/predict/sample=NOT_READY` を維持する。selected-weight E4、他pair/side、HIGH/LOW共同atomic snapshot、lease、全target/full model、生成、新P4向けLoRA mapping/適用済みweight feed、merge/Pages公開も今回へ追加しない。
