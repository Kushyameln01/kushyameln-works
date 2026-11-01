# P3追加条件のowner返却受領・照合

2026-11-02 JST。LoRA配布 `a80db72feea60b9bd69e292e4716665c6f0ee77f` を取得し、**管理884のP3追加3条件を、返却証拠の照合により受け入れた**。今回の照合は **186/186 PASS**。管理側で実Fileを再hashしたり、native診断を再実行したりする必要はない。

| 区分 | 固定commit |
|---|---|
| 今回取得した配布・新P4候補の所在 | `a80db72feea60b9bd69e292e4716665c6f0ee77f` |
| 返却されたP3の実行source・runtime配布 | `8849891f19124df31847bd691503c2491278eaa8` |
| 当該P3が使用したnative SDK／adapter／kernel | `fc2789a0f649e33f15eb13750e6a983b5c52d170` |
| 当該P3のDiffusion provider／consumer | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` |
| DATA／codec／独立reference | `82b21f09cb63926543181b16f0e97ebc6b9fa6be`／`2bdca59ea78580d4fe7a9d31a8de33209b64d029`／`0c27874908638afc748ea2455a2779a16736730b` |

a80をP3実行sourceへ付け替えていない。従来のdd95配布／28f実行／管理60dの6件も元の版・scopeのまま保持した。今回返却された884のSDK instance、plan、snapshotは旧cohortと別である。

## 受入範囲と追加3条件

選択light/HIGHの真正bounded base・Q先頭16行×5120列・bias16だけを扱うPARTIAL診断である。884の新6公開caseは各81,920 weight・16 bias・16出力を比較した記録を持つ。prepare/stageは7試行＝6公開＋checkpoint取消1、base復帰1と初期baselineは別。これを全model受入や旧6件の再命名に使わない。

1. **output16 E4の新規保存と実disk読戻し**：正本884 writer/readerとcodec2bdを通ったcomplete記録、全8ファイルのlength/hash/readbackCount、独立監査による既存E4 readerのcomplete読戻しが一致した。保存payloadのSHA-256は `04f51332b6934ad9a8658f9b52a6aa7000733b7f4ad1d453c8c68bdcabdb3575`、実snapshot hashは `70052e13634e2218092ed167ac41800bf8a1c9ee77726b53592d9fc9870ae108`。
2. **改変・snapshot欠落拒否**：`ASSET_HASH_MISMATCH` と `REQUIRED_ASSET_MISSING` の実行receiptを正本sourceへ照合した。884の方法は、実diskから読み出したbytesをreader内で変更する／snapshotのreader結果を欠落させる負例である。物理的な負例copy directoryを保存したとは扱わない。
3. **prepare前の参照hash guard**：`NORM_REFERENCE_PAYLOAD_MISMATCH`、manager revision1005にOWNER_PREPAREDもqueue invocationもないこと、合計prepare/stage7、旧feed保持、validation-recovery公開を確認した。expected copyだけを変更する正本884の負例であり、旧28fのactivation改変によるnative validation失敗と区別した。

同じsourceのP3追加条件が返却されたため、未実行の管理側delta試作runnerによる重複実行は行わない。取得ACKと、この限定された返却証拠の受入は別項目として記録した。ownerへの実際の送信はroot側の作業であり、このpacket作成によって送信済みとはしていない。

## 今回独立に照合した内容

13配布pathの全bytesとGit blob、manifest9件、実行source59件、entrypoint5件、DATA2とcodecのorigin/deployment、6件のphase・snapshot・native tuple・copy所有権・terminal/release、保存済み96出力の64-byte F32 hashと固定期待値/gateを照合した。6 snapshotのcanonical hashも、884正本serializerによって再確認した。preflightはreceipt-freeであり、保存された未来receiptを新しいadmissionへ差し込んでいない。

gzipは2,053,790 bytes／SHA-256 `d860d9eef7354b29f644f8defcd728e8e0d3758153c4a9f6e9bb0cf16282970e`。lossless展開は64,415,767 bytes／SHA-256 `123538bcf1aac5df2f2c26d6d989378b5e04efd2b96260e787ab279c61481d50`。compact公開receiptも原resultの対応項目へ一致した。run1のcodec Git object不足による停止も、native0／File load・hash0の別試行として保持した。

実1,244,141,856-byte Fileを新しいimmutable browser loadで全体hashした証拠はowner884の記録である。header-only inspectionを全体hash証明にしない。今回の受領担当は原本を読み直していない。私有のartifact26／E4 package8のbinaryは受領しておらず、現在の独立検査による再読戻しとも呼ばない。ownerと別監査者の実disk読戻し152項目PASSは、今回の186項目と分けて保持した。publication runtime brandもJSONから再生成していない。

資源はowner観測としてLoRA kernel容量33,554,432 bytes、bounded-base Hike容量1,572,864 bytes、限定projection時間などを記録する。全OS／browser／device／全工程peakはnullであり、この値を総予算の受入へ広げない。今回の追加native実行、File全体hash、推論、export、私有package読戻し、oracle生成は全て0。

## 同配布の新P4は別候補

以下のGit bytes/hashも取得したが、P3で使用されたfc/5fの置換や管理採用は行っていない。

| 新P4候補path | bytes | SHA-256 |
|---|---:|---|
| `docs/shared/inference/lora/P4-API.md` | 18731 | `a13d62a861c8453f6cb0153b517948f28dcd83078538bcfc903053d049b9def2` |
| `docs/shared/inference/lora/diffusion-p4-adapter.mjs` | 19871 | `c8be4e2bde579593e6c3fc230544a68f542f12ac98f6a8412b6cc94352bb3002` |
| `docs/shared/inference/lora/diffusion-p4-registry.mjs` | 8227 | `ee215da2d62e026a4f61fd514afbf6e19336408e615e2d30095e00213bf2272a` |

新P4 mapping／適用済みWEIGHT-FEED、selected-weight N-ARTIFACT、他pair/side、HIGH/LOW atomic snapshot、lease、全target/model/session、生成は未受入。`generationReady:false`、`currentLiveAdmission:false`、load/predict/sample `NOT_READY` を維持する。

機械可読の取得・判定・検査結果は `ACQUISITION.json`、`ACCEPTANCE.json`、`VERIFICATION.json`。private絶対pathを含む原receipt/auditやraw binaryは本packetへコピーしていない。`OWNER-RESULT.md`／`OWNER-MANIFEST.json`／`OWNER-SOURCES.json`／`OWNER-RUNTIME-ENTRYPOINTS.json` は安全な公開原本のbyte-exact copyである。
