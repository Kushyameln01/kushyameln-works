# 管理884の実File・真正base共同試験

2026-11-02 JST。固定管理 `8849891f19124df31847bd691503c2491278eaa8` の正本runnerを変更せず実行し、`PASS_MANAGED_FORMAL_DATA_REAL_BASE_PARTIAL_SNAPSHOT` を得た。新規のoutput16 E4保存・実disk読戻し、expected bytesのprepare前拒否、取消・復帰を確認した。独立保存証拠監査は **152項目PASS、blocker0**。

この結果は選択light/HIGHの既存Q16 PARTIAL診断についての管理追加条件の実証であり、新P4 WEIGHT-FEEDへのLoRA適用ではない。従来のdd95/28f/管理60dの記録は変更しない。

## 使用版・入力・範囲

| 項目 | 固定値 |
| --- | --- |
| 実行・runtime配布管理 | `8849891f19124df31847bd691503c2491278eaa8` |
| Native LoRA SDK / canonical adapter / kernel | `fc2789a0f649e33f15eb13750e6a983b5c52d170` |
| Diffusion provider / consumer / Q16 projection | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` |
| owner DATA | `82b21f09cb63926543181b16f0e97ebc6b9fa6be` |
| E4 codec | `2bdca59ea78580d4fe7a9d31a8de33209b64d029` |
| 独立reference / gate | `0c27874908638afc748ea2455a2779a16736730b` |
| 総合台帳 | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、文書 `1.0-draft.1` |

[正本API](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/docs/shared/ai-connection/API.md#joint-p2p3-receiver-runners)と[正本P3手順](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/development/ai-connection/p23-joint-acceptance/P3-REPRODUCE.md)を使用した。実行時に59 source（receiver3、管理28、LoRA12、Diffusion16）を固定Git blob・bytes・SHA-256と照合。owner DATA2 moduleとcodecはorigin/deploymentもbyte一致した。source置換、旧bridge併用、runtimeコード変更はない。

入力は `Bernini-R_LightX2V_high_noise.safetensors` 1 File、1,244,141,856 bytes、SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。新しく捕捉したimmutable browser Fileを1回全体hashし、同一File内だけでcacheを再利用した。過去4原本の取得・hashは要求しない。

真正base断片は709,364 bytes / SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff` の5 ranges。Q full `[5120,5120]` の先頭16行・全入力列と、full `[5120]` のbias先頭16を選択した。weight bindingは `runtime-input:weight`、biasは `hike-parameter:bias`。2 patchを含み、1050 targetと選択外領域を除外し、coverageはPARTIALのまま。全base SHA-256検証はfalseで、旧ownerの全体hash receiptは歴史的証拠に限る。

固定loader `comfy-lora-b5a4321-linear-diff-v1` の選択weightは `linear-down-up`、BF16、rank128、alpha128、scale1。明示Q biasはBF16 `additive-diff-b`。実行base/outputはF32 row-major。alpha省略の規約や未知variantを今回の実原本から一般化しない。両registry、loader詳細、選択sliceと実source識別は[RESULT.json](RESULT.json)に保持した。

## 新実行の結果

| 公開case | strength | 管理revision | SDK input/application | native epoch |
| --- | ---: | ---: | --- | ---: |
| initial-zero | 0 | 1001 | 1 / 1 | 2 |
| initial-one | 1 | 1002 | 2 / 2 | 3 |
| initial-negative | -1 | 1003 | 3 / 3 | 4 |
| reapply-one | 1 | 1004 | 4 / 4 | 5 |
| validation-recovery | 1 | 1006 | 6 / 6 | 6 |
| cancel-recovery | 1 | 1008 | 9 / 9 | 7 |

各公開caseの全81,920 weights・16 bias・16 outputsを既存0c reference/gateと比較し、計491,520 weights・96 bias・96 outputsが合格した。最大絶対誤差はweight `3.72290287486976e-9`、bias0、output `7.450580596923828e-9`。強度1の再適用weight digestも一致した。期待値・gate・reference配列の生成やoracle再計算は0件。

prepare/stageは **7試行＝6公開＋checkpoint取消1**。base復帰1取引は別で、初期baselineも別。baseline後のnative commitは6公開＋base復帰の7件だった。取消checkpointで比較した81,920 weights＋16 biasは公開6caseの数に加えない。

- `wrong-reference` はexpected copyの先頭へ+1し、`NORM_REFERENCE_PAYLOAD_MISMATCH` でnative prepare前に拒否。当該queue invocationはなく、旧feedを維持し、`validation-recovery` が公開に成功した。旧28fのactivation改変によるnative validation失敗とは異なる負例。
- checkpoint取消では元queue targetを指定し、stopConfirmed / originalTerminal / resourceReleased / reusableがtrue、quarantined falseを確認。旧feedを維持し、`cancel-recovery` が公開に成功した。
- 正式bridgeの実preflight→checkpoint→postpublicationを保持。checkpointは実owner.validateと全選択値比較の後に実snapshot targetへ束縛され、公開後は正確なcoordinator/native/queue証拠で監査された。管理revision、SDK局所revision、outside consumer tokenは別々に記録している。
- prepared/candidate解放後とsource capability解放後も、consumerの独立copyが同じ出力を保持した。queue所有の不変base復帰後、直前snapshotは公開済みの事実を保ちつつ `selectionCurrent:false`。最終的に全resourceをdisposeした。

## 新E4保存・読戻し

`initial-one` の16出力を既存writer/reader＋固定codecで新規保存し、実diskから読戻してcompleteを得た。保存tensorはfloat32 `[1,16]`、axes `[N,C]`、meaning `works:diagnostic-q-projection:v1`。nativeのflat16出力と保存payloadのbytes/hashが一致し、実snapshot ID/hashへ束縛されている。

- 出力payload SHA-256: `04f51332b6934ad9a8658f9b52a6aa7000733b7f4ad1d453c8c68bdcabdb3575`
- snapshot hash: `70052e13634e2218092ed167ac41800bf8a1c9ee77726b53592d9fc9870ae108`
- manifest: 2,124 bytes / SHA-256 `6d12468c1ca1348f01f74e023ed09942ea622f25930c03a6fa0ee04d9bd18979`
- 改ざん拒否: `ASSET_HASH_MISMATCH`。snapshot sidecar欠落拒否: `REQUIRED_ASSET_MISSING`。

全8 packageファイルに新実行時のdisk readback記録がある。独立監査でも既存E4 readerによる読戻しがcompleteとなり、同じ16出力bytes/hashと実snapshotを照合した。このoutput16 packageはselected-weight `N-ARTIFACT` の保存受入と別である。

## 証拠と失敗試行の保持

[RESULT.json](RESULT.json)、[公開receipt](evidence/receipt.json)、[manifest](evidence/MANIFEST.json)、[独立監査](evidence/manager884-run-2-independent.md)を参照。完全な実行metadataは[lossless gzip](evidence/run-result.json.gz)に保持した。解凍64,415,767 bytes / SHA-256 `123538bcf1aac5df2f2c26d6d989378b5e04efd2b96260e787ab279c61481d50`、gzip2,053,790 bytes / SHA-256 `d860d9eef7354b29f644f8defcd728e8e0d3758153c4a9f6e9bb0cf16282970e`。原本、raw base、weight/bias/referenceのbinary、E4 package binaryはGitに含めず、私有outへ保持した。

最初のrun1は固定codec commitのGit objectが未取得のためhost検証で停止した。原本load/hash・browser・native取引は0。正本手順どおり同じ2bd commitをfetchし、sourceを変更せず、新空directoryのrun2で上記合格を得た。[失敗記録](evidence/first-attempt.json)を保持し、成功試行へ混ぜない。

独立監査152項目は、source59・artifact26・package8のhash、保存済み16出力と固定0c期待値/gate、実phase/target、取消・copy・復帰、E4読戻しの確認。原本や全base、reference配列の再load/hash、再推論、weight/bias再計算、負例の再実行は行っていない。

管理の正式bridgeがこのruntimeで受け入れた事実と、管理担当本人による返却packet受領・採用ACKは別で、後者は未受領。selected-weight E4、新P4 canonical mapping/適用済みfeed、他pair/side、共同HIGH/LOW atomic snapshot、lease、全target/full model、生成、同時合成は未受入。`generationReady:false`、`currentLiveAdmission:false`、`load/predict/sample=NOT_READY` を維持する。merge・Pages公開も行っていない。
