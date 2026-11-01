# DiffusionModels 通常実行契約

API `diffusion-models/0.1`への追加。通常はdescriptorと実装能力で接続を判断する。固定サンプルのpayload hash、保存済み数値receipt、独立参照、誤差gateを通常実行の条件にしない。model／tokenizer／kernel／registry／packageの識別・整合性検査は保持する。

`describeExecutionCapabilities()`が操作ごとのshape・dtype・意味・正規化状態・容量を返す。`checkExecutionSupport(descriptor)`はpayloadを読まない対応判定で、`{supported,reasons:[{code,message,requiredExtension}]}`を返す。対応判定の正本は[capabilities.mjs](capabilities.mjs)。メタデータの対応は、有限性・mask・buffer所有権・package・資源確保など実行時の検査を省略する許可ではない。

## 単独で使うP4 owner

```js
import {
  createBerniniP4Execution, describeExecutionCapabilities,
  checkExecutionSupport
} from '../api/index.mjs';

const owner = await createBerniniP4Execution({file: lowModelFile, side: 'LOW'});
const descriptor = {
  operation: 'postSelfAttention',
  model: owner.model,
  blockIndex: 0,
  contextLatents: [],
  inputs: {
    residual: {
      dtype: 'float32', shape: [2,5120], layout: 'LC',
      meaning: 'bernini-block0-post-self-attention-hidden:v1', normalization: 'none'
    },
    timeAct1: {
      dtype: 'float32', shape: [5120], layout: 'C',
      meaning: 'bernini-time-embedding-silu:v1', normalization: 'none'
    },
    conditioning: {
      dtype: 'float32', shape: [1,L,4096], layout: 'BLC',
      meaning: 'text_hidden_states', normalization: 'encoder-final-rmsnorm',
      modelSha256: textModelSha256, tokenizerSha256
    }
  }
};
const support = owner.checkSupport(descriptor);
if (!support.supported) throw new Error(JSON.stringify(support.reasons));
const request = {...descriptor, inputs: {
  residual: {...descriptor.inputs.residual, data: residualF32},
  timeAct1: {...descriptor.inputs.timeAct1, data: timeAct1F32},
  conditioning: {...descriptor.inputs.conditioning,
    data: textF32, attentionMask: maskUint8}
}};
try {
  const {tensor, state} = await owner.run(request, {signal, onProgress});
  // tensor: owned F32 LC [2,5120], bernini-block0-output-hidden:v1, normalization:none
} finally {
  await owner.dispose();
}
```

`L`は整数1〜512。`signal`と`onProgress`は省略可能な実行optionsであり、数値入力へ混ぜない。`model`・`operation`・`blockIndex`・`contextLatents`はownerの既定値を省略可能。flatな`residual/timeAct1/conditioning`も受け入れるが、`inputs`との同時指定は拒否する。`checkSupport`と`run`は同じ正規化・契約判定を使う。

通常入力はcompactな非共有のnative Float32Array、maskはUint8Array。値の有限性、入力寸法、maskの0/1と有効位置、masked Text行がzero-out済みであることを検査する。Textは公開UMT5 model `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、tokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`へ束縛する。`Hello world`など特定promptやpayload hashには束縛しない。Textの最終RMSNormを再適用せず、全L行とmaskを保持する。元coreに従いcross softmaxへmaskやRoPEを追加しない。

residualはblock0自己注意後のhidden、timeAct1はSiLU後のtime embeddingであり、raw mean・post-modulation hidden・生成latentで代用しない。新しい意味名はownerの通常契約であり、管理側の既存診断semanticIdへ自動的に読み替えない。

同じ数値stageが通常／診断を実行する。通常`run`は最終tensorと簡潔なstate／資源容量だけを返す。不要になった中間配列の参照を順次外し、中間値の保存や範囲hash計算を要求しない。入力は最初の非同期境界までに所有snapshotを取り、callerの配列を変更・detachしない。出力の実解放時期はJS GCが決めるため、最大host live量やGCピークを保証したとは扱わない。

`owner.diagnose(request, options)`は同じstageから25cutと詳細evidenceを返す明示的診断入口。独立参照・gate・全値比較・保存は診断harnessが行う。通常の`run`がこの診断成功や過去receiptを要求することはない。旧固定診断harnessのhash拘束は、その回帰scopeを保って残す。

## 対応範囲と非対応理由

- P4：HIGH／LOWの保存済みscaled E4M3FNモデル、**block0、2token、contextなし**。residual/output LC `[2,5120]`、Text BLC `[1,L,4096]`、L1〜512、FFN幅13824、40head×128。storageは登録entryごとのF16またはscalar-scaled E4M3FN、計算はF32。元GPUのproduction precisionを受入済みとはしない。
- P4 decodeは最大81,920要素／read163,840 B。通常weight出力row tileは16、FFN downだけ4row・inner13824を丸ごと使う。queryは2、key chunkは1〜64。この制約はkernel／graphの制約であり、descriptorの上限変更だけでは拡張できない。
- 元81frame target `[1,16,21,60,104]`、contextを含む全N、全block、head、実HIGH→LOW、全samplingは未対応。対応には対象kernel／graph・producer境界・precision・staging／copy／同時保持予算の検証が必要。
- pointwiseは1,048,576要素。Text検査の2,097,152要素とは別予算。mean変換はF5 `[1,16,2,2,2]`、F1 `[1,16,1,2,2]`、Rect `[1,16,1,2,4]`の専用ABIだけ。同要素数の別shape・paddingは不可。

詳細な既存guardの差もdescriptorに残す。raw normalizeはnormalization marker不在を要求する。raw validationのF1／Rectもmarker不在を要求するが、F5の旧metadata validatorの範囲とは異なる。restoreはversion付きnormalized posterior-meanの意味と、指定された場合の正しい正規化IDを要求する。生成sampleをposterior meanへ読み替えない。

`supported:false`は理由と必要拡張を返す。全体資源peakは未確定であり、partial演算が成功しても`load/predict/sample=NOT_READY`、`generationReady:false`を保つ。

| requiredExtension | 必要な対応箇所 |
| --- | --- |
| operator-shape-extension | P4 stageのquery loop、linear score graphの固定2query、Hike norm/attention ABI、stagingと同時保持予算。hostのN上限だけを変更しない |
| context-latents | 上流のordered latent／patch concat／source_id・RoPEとの境界、全queryへの拡張。現在のP4入口へlatentを直接追加しない |
| posterior-mean-shape-profile | latent-spaceのchannel/軸対応、Hike ABI、host guard、capacity・hash・試験。raw/normalizedの意味を保つ |
| pointwise-capacity | 対象primitiveのWASM workspace・copy・公開予算の検証。graph分割とは別扱い |
| model-binding / dtype-conversion-or-operator | 対象base/header/storage profile、Hike復号、compute dtypeと誤差条件の明示。未知のmxfp8等を無断変換しない |

前段prefix／QKV／自己注意tailの固定診断factoryを、この通常P4入口へ統合したとは扱わない。それらの固定診断・既存sourceの受入範囲は保持し、通常descriptorへ未登録の操作はUNSUPPORTED_OPERATIONで返す。今回追加した通常neural操作はpost-self-attentionからcross-attention・FFNまでの境界である。

## Workerと明示MessagePort

既存`createDiffusionModels().request(envelope)`へ以下を追加した。session/job/revision/buildの照合、stale返信の排除、専用Workerの所有は維持する。

| op | input | 結果 |
| --- | --- | --- |
| capabilities | `{}` | 既存field＋`executionDescriptor`と通常P4 control能力 |
| checkSupport | 上記descriptor | payloadを読まない対応判定、ownerを生成しない |
| prepareP4 | `{file:Blob,side:'HIGH'または'LOW'}` | source・feed・2 ORT sessionを所有するpartial ownerを準備。model/header/schema/kernelを照合 |
| runP4 | 上記通常request | 最終tensor/state/resources。source、function、capture token、独立参照は不要 |
| releaseP4 | `{}` | ownerを解放し`released,activeORTSessions,readLeases`を返す |

MessagePortでは既存adapterへ同じenvelopeを渡す。tensorはstructured cloneし、関数やAbortSignalをportへ入れない。取消は既存`cancel`で専用Workerを終了し、対象requestをCANCELLEDで終端化する。その後のP4実行は**再prepareが必要**。未prepareのrunは`P4_NOT_PREPARED`。owner準備済みの再prepareは`P4_ALREADY_PREPARED`で拒否し、先にreleaseを要求する。

単独ownerではAbortSignalを使い、取消後にread lease／pending tensorを解放して同じownerを再利用できる。`dispose`は実行中stageの終端化を待ってstage → feed → sourceの順に解放する。返却tensorはcaller所有となるためowner破棄でdetachしない。全体待機列・工程管理は管理側に置く。

## LoRA weight feedの通常検証

単独ownerの`weightFeed`が既存registry／不変base provider／sink／candidate consumerを公開する。低rank積とcanonical mappingはLoRA担当が所有する。通常側は完成F32 weight/biasのみ消費する。

`sink.begin/writeBlock/finish`はmodel／graph／registry、対象、元full shape、宣言range、有限性、重複・欠損・package完成を検査する。`prepareLoad(handle,context)`でnative owner内部へcandidateを保持し、`validate(candidate,context)`が構造・取引の検証結果を返す。`commit`はnative内部のepochに束縛されたadmission状態を要求し、callerが作った成功receiptを採用しない。

`context`はregistryから得た`modelHash,graphHash,registryHash,side,executionProfileId,scope`、`isCurrent`、任意signalを含む。range／package integrity hashは固定サンプルhashではなく、現在のpackage内容の整合性検査である。公開handleにはweight配列を出さず、package handleをreleaseした後もcandidate／active feed／read leaseが必要なbytesを保持する。stageはcaptureしたepoch/packageのsourceを実ORT weight入力とHike bias入力へ渡す。

独立数値比較は`weightFeed.diagnose(candidate,{...context,input,expected,expectedSHA256,referenceId,gateId,tolerance,run})`へ分離した。成功・失敗は通常candidateのadmissionを変更せず、commit条件にもならない。registryの`validationGate`は通常構造検証、`numericalDiagnostics`は従来の事前gateを表す。

この変更でregistry hashとvalidate結果の契約は変わる。旧a80の診断専用LoRA adapterが新通常契約を受入済みとは扱わない。新adapterでは通常validateに参照値を渡す必要をなくし、診断時だけdiagnoseを呼ぶ対応が必要。旧sourceでの数値受入はそのまま保存する。新通常Worker RPCへのweight feed取引操作は未追加で、LoRA接続は同一realmのowner handleを利用する。
