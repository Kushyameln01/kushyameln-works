# LoRA formal DATA 実数値共同試験 — 独立source review

- review日: 2026-11-01 UTC
- 判定: **PROCEED_SOURCE_REVIEW**
- 実行source: `28f44c3a1b71bef59e2d018a0db736de6d84675c`
- 比較元: `dc70fa8aa48285e9f68095909ac0fcf6b1edc08c`
- review時の作業tree: clean
- reviewer: 実装担当と別のread-only reviewer
- 数値・browser実行結果: **PENDING_ROOT_EXECUTION_RESULT**。この文書はsource受入判断であり、実数値成立のreceiptではない。

## 対象sourceと固定依存

| path | SHA-256 |
|---|---|
| `tools/ai-connection/test-lora-data-real.mjs` | `2cbe3833d980ebd4941f43a821f7cfc2600cd99a11c4d0bdbfc3df0e18eea8f9` |
| `tools/ai-connection/lora-data-real-browser.mjs` | `8d950bc009c635a679074536c4d7e35a2dc688a1a5da3d9b0974e0dbed26e9b9` |
| `tools/ai-connection/lora-data-real-inputs.mjs` | `555333b028c7e832d243962567a63c66ee88416b1e14f392d00e126fece47eaa` |
| `tools/ai-connection/test-lora-data-real-inputs.mjs` | `f23ae31e3be52b383f92b2385f31079a3c5ad93687960a2463a9daecf8d68c5d` |

固定依存は管理 `60d16b64d6020d3d20239f087f8add91268dcaad`、LoRA native `fc2789a0f649e33f15eb13750e6a983b5c52d170`、Diffusion native `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、owner DATA `82b21f09cb63926543181b16f0e97ebc6b9fa6be`。実行時に各checkoutのHEAD・実ファイルと固定Git blobを照合する。receiver自身のhost/browser/helperも実行commitに一致しなければbrowser起動前に拒否する。

管理へ配置されたDATA 2 moduleは原82bのpath/bytes/SHA-256/Git blobとの一致を要求する。native kernelは5051 bytes、SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24` に固定される。遅延import・WASM・参照catalogもloopback serverで固定sourceとして検査する。既存の別receiver norm hookや旧diagnostic bridgeを重ねない。

## formal phase契約

1. predeclarationはactual source/header/両registryと事前のreference/gateを宣言し、`evidence:[]`・`requiredScopes:[]`を保つ。未来の数値成功・snapshot target・transaction receiptを捏造していない。
2. `createLoraDataPhaseBridge`の正式plan入口を通し、actual SDK plan返却時のpublic native revision tupleを観測する。外側の選択token、manager revision、SDK-local input/application revision、consumer epochを共通revisionへ混同していない。
3. actual native validation checkpointで全81920 weight値と16 bias値を独立期待値へ比較する。exact plan/source/strength/両registry/referenceと成果物hashを比較receiptへ結ぶ。実native receipt・外側owner validation・actual snapshot targetは管理bridgeが対応付ける。
4. snapshotのSTAGED中にconsumer feedが変わらないことを確認してから明示publishを行う。実native commit後のterminal、ownership受領、管理公開、finalize/prepared releaseを既存manager/ownerが処理する。
5. 公開後はcoordinatorが発行するbrand付きpublication contextを使い、自動afterPublication auditでexact target、queue invocation、native receipt、独立copy ownerを照合する。closed staging contextを公開後currentnessの代用にしていない。

## currentnessの差分再確認

dc70→28fの指定4ファイル内の差はbrowser選択境界のみ。新application開始時に旧`currentApp.selected=false`へ変更し、snapshot callbackに`currentApp===app`を追加し、旧snapshotが即座にuncurrentとなるassertを追加した。先の軽微なreview指摘は解消した。

resource lifetime用の`resourceCurrent`はmanager session/resource generation/owner lifetimeを観測し、最新選択revisionへ結び付けていない。これにより旧active feedの所有権と失敗時cleanupを新選択によって失効させず、snapshot選択のcurrentnessを別に扱う。

## 原本・baseの検査範囲

対象はlight/HIGHの選択1 File。Q full shape `[5120,5120]` の先頭16行・全入力列と、lightの明示Q bias16を維持する。PARTIAL、included patches、除外1050 targetsと除外領域を保存する。二組同時合成・LOW側の新規実数値受入・全targetは含まない。

source上のhash予定は次のとおり。これは実行回数の観測報告ではなく、実行前の経路確認である。

- 新規選択File: incremental `sha256Blob`を最初の成功時に1回行い、同一immutable browser Fileのdigestだけを後続planへ再利用する。既知expected hashをそのまま返す代替はない。
- 過去4原本の再取得・全体hash再計算: 要求しない。
- 元full base modelの新規load・全体hash再計算: 行わない。
- 709,364-byte bounded artifact: hostとbrowserが受領hashを検査する。これは元full modelの新しい全体hash証明ではない。

bounded artifactはSHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`、schema・PARTIAL・fullFileHashRecomputed=falseを要求する。HIGHの5 raw rangesについて長さ・hash・絶対offset・原headerを既存独立referenceと旧receiptへ照合し、native registryも旧receiptへ一致させる。実Hike復号後の全weight/biasを独立base arraysと比較し、F32 bytes hashも照合する。historical full-model receiptと今回のbounded proofを分けて記録する。

## 数値・取消・所有権の確認構成

strength 0/1/-1、1の再適用、native validation失敗後の復帰、checkpoint取消後の復帰を通す構成。成功caseでは各16出力を独立期待値へ比較し、再適用のprepared weight/package hash一致も確認する。

validation失敗の負例はexpected payload/gateを維持し、validation activation copyの1値を変更してactual `NATIVE_VALIDATION_MISMATCH`を要求する。数値成功caseへ数えない。取消はreal pending checkpointでqueueのstopConfirmed/originalTerminal/resourceReleased/reusableと非quarantineを要求し、元taskの協調停止・終端後に復帰する。古いmanager requestの拒否も確認する。

prepared解放後にactual consumer runを行い、source capabilityを拒否状態にした後も同じ出力を要求する。採用方式はnative independent-copyであり、lease受入へ拡張していない。source capabilityの解除はFile/OS memoryの物理解放やGC回収の測定ではない。

解除は同じactual queueを介して不変baseから再構築し、actual phase target・queue target・公開snapshot参照・native local tupleと終端/afterTerminal/releaseを記録する。適用済み重みへの再加算や差分引戻しはない。

## private payloadと資源境界

Fileとbase artifactはbrowser file picker入力であり、raw `.safetensors`/raw base artifactを配信するGET経路はない。source配信はfixed Git blob、reference配信は明示された独立参照arraysに限られる。選択weight/bias/outputとraw診断reportはprivate outputへ限定し、ディレクトリ0700・成果物0600を要求する。source repositoryへprivate input/outputを置くことを拒否する。

resource宣言は実際に保持するcomparison buffersの限定された容量に限る。native/ORT/RSS/device/full-model peakの受入へ拡張せず、total OS peakは未測定と記録する。cleanup中にthrowした場合はhost側FAILとなり、正常終了の成功receiptへ取り替えない。

## 新N2 tailとの依存関係

Diffusion PR14返却 `508d72cc9036e7f500827465c644b4aed3c5f711`、native execution `a49aac492cc68e2dd6037e0deb4a6954731a847a`、holding/distribution `beffdcb800b629d0b13ff43bbc90e9f74c659152` の新profile `bernini-block0-n2-self-attention-residual-f32-v1`は、本試験のconsumerとして読み込まない。

原文調査では新tailは原本Blobから内部source/linear sessionを作り、canonical adapterが必要とする外部provider/sink/prepareLoad/validate/commit/rollbackを公開していない。任意LoRAは管理・Diffusion両PRの受入外である。本試験は既存fc/5f Q16のformal DATA共同接続であり、新tailへの実適用・QKV/attention/tailのLoRA影響下の新規参照・全model session・生成結果の寄与を証明しない。

## reviewの実施範囲と残る判定

reviewerは指定4ファイル、管理60d16のformal bridge/mandatory entry/native ownerと固定契約をread-onlyで照合し、dc70→28f diffとコードhashを確認した。コード編集・fixture実行・browser/native実行・原本/base payload読取り・原本hash計算は行っていない。このreceiptの新規保存だけを実施した。

source上の重大blockerは確認されなかった。実File/hash検査、実SDK/Hike/ORT計算、正式phaseの実runtime成立、取消・復帰・所有権のruntime合否はrootの実行結果で別に確定する。`generationReady:false`、native `snapshotPublished:false`、管理のdiagnostic snapshot公開を分けて報告すること。
