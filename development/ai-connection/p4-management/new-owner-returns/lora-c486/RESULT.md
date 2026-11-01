# LoRA c486 新P4候補と追加公開P3 packageの受領

2026-11-02 JST。配布 `c4860579d01d9f704cb16714e364a22668f9d57e` を取得し、**224/224項目がPASS**した。新P4の分類は `NEW_SEPARATE_LORA_P4_CANDIDATE`。ownerの実controlled PARTIAL数値結果を受領した段階であり、管理P4規範catalog／三段階hook／snapshotへの共同採用は行っていない。

新P4の実行sourceは `a80db72feea60b9bd69e292e4716665c6f0ee77f`、Diffusionは `7ee36228030ba3bb544a90b1d4b528702a7bae32`、外側queueは管理884である。c486は証拠・契約の配布commitであり、実行sourceへ付け替えていない。API18731 bytes、adapter19871 bytes、registry8227 bytesを含むruntime sourceはa80と同じbytesである。

## 今回の照合

DELIVERY-MANIFEST全86pathの取得bytes・SHA-256・Git blobを確認した。manifest自身は20,981 bytes／`5e0442e31e445ee533d65e753907f673f91a551fce60defd04ed95c7da8b1cd5`。loaded40／preverified42の重複を除く42 source、8 role pin、P4 APIと接続契約0.1の8参照も固定Gitへ一致した。

完全receipt gzipは881,221 bytes／`8b01ef4b5fc8190a07c4a4737e1707f9573235017c7cbf463be1509b0f95a7dc`。lossless展開35,805,981 bytes／`f07081581e46d8252c207fd945f676b888bf35dbca888bd03a019dfd56bdb6b0`を照合した。原本・base・prepared weight/biasの私有配列は受領していない。公開された出力／oracle filesはmanifestのbytes/hashを確認し、今回P4の数値再比較やoracle生成は行っていない。

ownerの独立監査399項目とphase/lifetime/resource76項目は、それぞれ元記録のPASSとscopeを確認した。これらを今回の224項目へ合算したり、新しいnative試験としたりしない。

## 新P4候補の限定scope

選択light/LOWのcross-attention Q weight full `[5120,5120]` の先頭4行・全5120列と、明示bias `[5120]` の先頭4値だけを変更する。2 logical patchの選択領域を含み、1050 targetと選択外行を除外したPARTIALである。strength0／+1／−1と再適用・復帰の7成功caseを記録している。

入力cohortは `controlled-caller-input-n2-k4`、`producerAuthenticated:false`。caller supplied residual/timeAct1とK4 conditioningを使う。自然P2/N2、実Text L512、別side/sliceや全modelには拡張しない。管理revision、SDK input/application revision、native epochは別namespaceのまま保持した。

owner資源観測は `PARTIAL_SAMPLED_OBSERVATION`。host約1,321,938ms、500ms samplingによる所有process RSS和peak1,472,950,272 bytes、Node high-water RSS648,708,096 bytesを別値として保持する。不完全sample1、VmRSS unavailable2、shared-page重複や短いpeakの取りこぼしがあり、全工程／device／allocator peakはnullのままである。

## P3は元受入を保持し、公開された実8filesを新たに読戻した

a80で受入済みの管理884 P3元13pathは、c486でも全てbyte-identicalだった。旧dd95／28f／60d、a80配布／884実行のscopeと判定は変更しない。

c486が追加公開した元output16 E4 packageは8files／32,171 bytes。今回、**既存管理884のE4 reader＋既存codec2bdで、取得先filesystemから独立にfresh readbackしcomplete**を確認した。builder・writer・再exportは呼んでいない。

- manifest：2,124 bytes／`6d12468c1ca1348f01f74e023ed09942ea622f25930c03a6fa0ee04d9bd18979`
- decoded output：64 bytes・16 values／`04f51332b6934ad9a8658f9b52a6aa7000733b7f4ad1d453c8c68bdcabdb3575`
- actual historical snapshot：`70052e13634e2218092ed167ac41800bf8a1c9ee77726b53592d9fc9870ae108`
- reader返却byte cloneの変更：`ASSET_HASH_MISMATCH`。snapshot reader結果の欠落：`REQUIRED_ASSET_MISSING`。元8filesは前後不変。

これはc486時点の新しい実payload読戻しreceiptであり、以前の「package未受領・metadataのみ」の受領時点を書き換えない。新しいlive publication brand、native prepare、snapshot公開も作っていない。私有のselected-weight等26生成物は引き続き未受領である。

**E4 packageの正式な再import→native prepare入口は別の未成立edge**であり、source/API未取得の `DEPENDENCY_WAITING` を維持する。readerのcomplete／改変拒否を、その入口の受入へ読み替えない。

今回のNN実行、モデルexport、実File全体hash、oracle生成、新P4数値受入実行は0。`generationReady:false`、`currentLiveAdmission:false`、load/predict/sample `NOT_READY` を維持する。取得ACK草案は `ACK-BODY.md`、機械可読分類と新P3実読戻しは `CLASSIFICATION.json`／`P3-PAYLOAD-READBACK.json`。本packetにはprivate絶対pathや巨大raw receiptをコピーしていない。
