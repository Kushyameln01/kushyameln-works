# 非正方形 posterior mean 契約監査と受領側確認

2026年10月31日 JST。LoRA担当の受領側作業。静的監査の後、親担当の追加指示により既存owner試験だけを実行した。製品code、モデル原本、codecを変更せず、新規NN推論・generated sample・全モデルhash・巨大weight取得は行っていない。

## 結論

非正方形meanはDiffusion/VAEのposterior-mean境界である。LoRAはbase parameterと低rank/diff/biasを扱い、meanのnormalize/restoreを担当しない。新固定Diffusion sourceはRect profileを実装済みで、受領側の既存試験でも成立した。LoRA側では新source/buildを受領記録へ追加し、Q provider/consumer接続とmeanの受入を別scopeで保持するのが必要差分である。LoRAのtarget shape/validatorをmean用に緩める根拠はない。

指定Pageの709,364-byte artifactはHIGH/LOWのQ先頭16行・bias・header/scale/configを持つ `bernini-diagnostic-base-block/0.1` であり、meanデータではない。artifact本人受領/hash/range照合は親担当の別作業。本監査のmean成功でその証拠を代用しない。

## 固定sourceと旧版差

Repository: `Kushyameln01/kushyameln-works`。

- 新Diffusion: `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。
- 旧受入Diffusion: `438972f30242e0a3bc66edb8591f38eaa0fcd384`。
- VAE mean出典: `7e091192232fae36367b550ca5fada88915a0703`。
- LoRA現source: `0c27874908638afc748ea2455a2779a16736730b`、native `lora-connection/2.0-draft.1`、外側 `lora-diffusion-diagnostic-adapter/0.1`。
- 旧Diffusion BUILD_ID: `diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`。
- 新Diffusion BUILD_ID: `diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20`。

旧438のmean kernelはABI `wan21-raw-mean-f32-v2`、WASM SHA `6b9cb9f0617da373e63275354ac42f7843fb455019ed3988df7364173bc775b4`。新5f880はABI v3、Rect専用2exportと厳密profileを追加する。native API版 `diffusion-models/0.1` とrequest envelopeは維持し、BUILD_IDを別に扱う。

| code | 新Git blob SHA-1 | 旧438との差 |
| --- | --- | --- |
| latent-space/latent-space.mjs | 0094a8b9aa354948add1316809c4752790531d6d | 616066eaf54c9982c6424e2c020395410377bb34から変更 |
| latent-space/kernel-registry.mjs | f725449ba21b3b5562f71bd14cda5ad5d81b20c9 | 8f9c558f3a3ef58c0e8a530943bc7309ac219fd9から変更 |
| tensor-interop.mjs | 65a85c2c726daffd369f3666212259246817fdbe | 00923e5aafb29adf391c700b7c5b4f71b9715890から変更 |
| api/index.mjs | 549628afea0e9a76480907c64a6e9a570714c95e | 62163fa39b2578c4cb7689c40bb1aa4db17e089aから変更 |
| api/worker.mjs | 03f45061e617e0ed4de4cd17c43d3ab0dbd3a5e4 | b1ecef24294431c2b184526d74ed7c1ca25654f2から変更 |
| lora/diagnostic-base.mjs | eac3ef89b032c59dd1d39a5e12358f20c25e7234 | byte同一 |
| lora/diagnostic-consumer.mjs | 6f87d6e14b0d2243983741130b673c4f9f20df3e | byte同一 |

表の相対pathは `docs/shared/diffusion-models/` 基準。新codeを固定GitHub contentsから取得し、旧比較値は旧438のGit objectを直接確認した。その後、親担当が用意した `/workspace/work/lora/nonrect-peer-5f880` の完全checkoutから同じsourceを試験した。受領source・kernel・fixture・codec計11fileについて実bytesと新5f880 Git blobを再照合し、bytes/SHA-256を `nonrect-received/mean-receiver-verification.json` に保存した。

## mean契約とroute

| profile | NCTHW | 値数 | channel index | exports |
| --- | --- | ---: | --- | --- |
| wan21-raw-f32-5x16x16 | [1,16,2,2,2] | 128 | floor(i/8) | NormalizeRawMean / RestoreRawMean |
| wan21-raw-f32-1x16x16 | [1,16,1,2,2] | 64 | floor(i/4) | NormalizeRawMeanF1 / RestoreRawMeanF1 |
| wan21-raw-f32-1x16x32 | [1,16,1,2,4] | 128 | floor(i/8) | NormalizeRawMeanRect / RestoreRawMeanRect |

RectはRGB `[1,3,1,16,32]` に対応する。dtype `float32`、layout `NCTHW`、raw meaning `raw-posterior-mean`。VAE producer SHAは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。Bernini HIGH/LOW model hashでは代用できない。profileIdは任意だが、指定すればexact shapeから選んだidと一致しなければ拒否する。

`requireWanRawLatentRect` は専用guard。旧 `requireWanRawLatent` はF5のみ、F1 guardも64値のみのまま。同128値の未知shape `[1,16,2,1,4]`、RectへのF5 profileId、wrong producer、normalized/generated metadata、text maskを拒否する。padding、F5へのreshape、mean→generated-sample改名はしない。

同一realm入口は `createLatentSpace(wasmBytes)` → `normalizeRawMean(tensor)` / `restoreRawMean(tensor)`。factoryはWASMを所有snapshotし、SHA/importsと6exportsを検査する。hostはexact shape/id allowlistから専用ABIへrouteし、count128だけでF5/Rectを選ばない。

native APIは `api.request({protocolVersion,buildId?,sessionId,jobId,inputRevision,op,input:{tensor}})`。対象opは `validateRawLatent` / `normalizeRawMean` / `restoreRawMean`。tensorを直接inputに入れるgeneric mappingは非互換。validateはmetadataだけ、normalize/restoreは `{tensor,normalizationApplied:true,evidence}` を返す。`capabilities.rawMeanProfiles` に3profileを宣言する。

正規化後meaningは `wan21-normalized-posterior-mean:v1`、normalization markerは `wan21-comfy-f32-v1`。後者は省略可だが不一致は拒否する。固定ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の16channel mean/stdと別々のf32演算順を維持し、raw0を特別扱いしない。

## encoding・所有権・取消

- 結果Float32Array、shape、許されたcontextのidentifier/frame index/time配列は所有copy。入力を変更せず、WASM pointerを外へ返さない。
- generated sampleはmeanと別。`latentContract` を拒否する。contextはschemaVersion1、contextId/inputId/inputSha256/slotId/sourceFrameIndicesと任意sourceFrameTimesSecondsだけを扱う。
- 旧 `encodeWanRawLatent/decodeWanRawLatent` はF5専用codec wrapperのまま。Rectをそこへ入れて完全保存できたとは扱わない。今回の既存owner試験は `development/ai-connection/e6/source/g1c-tensor.mjs` を明示したcodec境界でmetadata保存を検査した。新codecは作成・mergeしていない。
- Memory1,114,112 bytes、arena1024 bytes。input512 B/output512 Bのdisjoint slotを再利用し毎回zero。F1は各slot256 B使用。これは論理WASM量であり、RSS/ORT/全工程peakでも、本番latent2,096,640値の受入でもない。
- direct mean kernelは同期128値までのbounded call。native cancelは所有Worker終了・元Promise終端化・次requestで再生成。MessagePort detachをdispose/cancelと同一視しない。入力clone、Worker結果transfer、Port結果cloneを維持する。

## 受領meanとfresh確認結果

新5f880固定commitの `development/ai-connection/e6/received-7e091/` から、既存の実保存meanとmanifestを使った。709,364-byte base fragmentとは別の資料。

| 実fixture | SHA-256 |
| --- | --- |
| rect-manifest.json | 450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a |
| rect-mean.wktensor | 8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8 |
| f1-manifest.json | fa219b8e7e0b6b0be37c598d3dfedadb29505ad1407fe3f8270d8655dd46828c |
| f1-mean.wktensor | ab1c7fb141607c8560b9dfa67767b76e282eb25db15921228366e60f5655c9bc |

新mean kernel ABI `wan21-raw-mean-f32-v3`、WASM SHA `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d`、Hike source SHA `bd51d724b5a4fbad545670674701f316343a17e63916a57daf144bd763cfd81e`。全11実fileが固定Git objectとbyte同一。親の受領先以外へ生成物を書いていない。

| fresh scope | 結果 |
| --- | --- |
| Node owner Rect7/F1 10/legacyF5 10 | 全27 PASS |
| Chromium154.0.8037.57 同owner試験 | 全27 PASS。page/console/blocked errors0 |
| 実保存F1/Rect mean→実Hike→明示G1C codec→実Hike | 全64/128値を独立f32参照と比較。Node/Chromiumのnormalized/restored hashが完全一致 |
| Rect roundtrip | maxAbs2.384185791015625e-7、事前gate2e-6以内 |
| F1 roundtrip | maxAbs1.1920928955078125e-7、事前gate2e-6以内 |
| guards/専用ABI | same128未知shape・wrong profile/producer/generated拒否。raw count64/capacity127/NaNをRect ABIが拒否し、拒否時output不変 |
| Memory/ownership | mixed F1/Rect/F5反復でMemory一定。arena1024 B、出力/context copy、dispose後拒否 |
| native API browser | 4cases PASS。`input:{tensor}`、capabilities3profile、F1 direct/PortとRect Worker変換/拒否、predict/sample NOT_READY |

native API4caseは合成meanを使うfixtureであり、実VAE保存meanの全値比較は前二群で確認した。実VAE graph再実行、Rect decode、generated sample、管理全工程を新規実施したとは扱わない。旧ownerの限定VAE decode記録は相手証拠のまま。

## 実行commandと出力

作業cwd: `/workspace/work/lora/nonrect-peer-5f880`。Nodeは既存のexportされた `runRectCases` / `runF1Cases` / `runCases` を直接importし、元のwrapperがtracked結果JSONへ書く部分だけを避けた。数値・guard・codec試験sourceは変更していない。read callbackは `fixture/` を `development/ai-connection/e6/received-7e091/`、他を `docs/shared/diffusion-models/latent-space/` に対応する。結果は下のprivate出力へJSON保存した。

```sh
python tools/diffusion-models/e6-api-browser.py \
  --output /workspace/work/lora/nonrect-received/mean-native-api-browser.json
```

Rectブラウザowner scriptにはoutput引数がないため、次のin-memory report出力先置換だけを行って実行した。既存test bodyとallowlist/browser条件は維持し、製品fileは変更していない。

```python
from pathlib import Path
p = Path('docs/shared/diffusion-models/latent-space/test-rect-browser.py').resolve()
source = p.read_text()
old = "(evidence/'rect-browser-results.json').write_text"
new = "Path('/workspace/work/lora/nonrect-received/mean-browser-owner-tests.json').write_text"
assert source.count(old) == 1
exec(compile(source.replace(old,new),str(p),'exec'),
     {'__file__':str(p),'__name__':'__main__'})
```

| private output | bytes / SHA-256 |
| --- | --- |
| mean-native-api-browser.json | 2475 / 7c146180e36cfe13c13102a657a31b128d3861cc641e72fd753eed06fd75a26a |
| mean-browser-owner-tests.json | 9876 / 258c5f44cd6f910135afbd2d10097d8f185ba1b4cf130bd174ed03576014cf64 |
| mean-node-owner-tests.json | 完全hash/bytesはmean-receiver-verification.jsonに保持 |
| mean-receiver-verification.json | source11file、試験件数、output identity、Node/Chromium全値hash照合を保持 |

各stdoutは同名`.log`。親taskの指示どおり全て `/workspace/work/lora/nonrect-received/` に保存。最後のpeer `git status --short` は空で、product/source変更なし。

## 必要差分と残る合意

1. 新5f880 source/build・Rect manifest/mean・codecの受領を、LoRA Qとは別のmean compatibility記録へ追加する。既存LoRA planner/SDKは維持する。
2. 管理接続では新BUILD_ID、capabilities3profileとnative操作別 `input:{tensor}` packingを採用する。LoRAモジュールへmean演算を足さない。
3. 新base-block providerを実LoRA runnerへ注入する場合は、Q/bias consumerが旧438とbyte同一である事実を根拠に現行外側adapterを再利用し、実artifactの5range/hash/provenanceを別途確認する。仮想full Fileを作らない。
4. mean profile受入、Qの実LoRA PARTIAL適用、過去の限定VAE decode、実generated sample/管理snapshotを別に判定する。今回のprofile拡張からload/predict/sampleやE8を解除しない。

監査開始時に `development/ai-connection/e6/acquisition.json` は新5f880のGitHub contentsで404だった。関連資料の言う12file受領を、本監査が全12を受領したとは扱わない。今回実試験に必要なfixtureとsource11fileは上記の固定Git objectと照合できたため、静的契約・数値小境界の結論はその404に依存しない。

### Node受領試験の完全command

```sh
node --input-type=module - <<'MEAN_NODE_AUDIT' > /workspace/work/lora/nonrect-received/mean-node-owner-tests.log 2>&1
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const latent=path.join(root,'docs/shared/diffusion-models/latent-space');
const {runRectCases}=await import(pathToFileURL(path.join(latent,'test-rect-cases.mjs')));
const {runF1Cases}=await import(pathToFileURL(path.join(latent,'test-f1-cases.mjs')));
const {runCases}=await import(pathToFileURL(path.join(latent,'test-cases.mjs')));
const codec=await import(pathToFileURL(path.join(root,'development/ai-connection/e6/source/g1c-tensor.mjs')));
const read=async name=>new Uint8Array(await fs.readFile(name.startsWith('fixture/')
  ?path.join(root,'development/ai-connection/e6/received-7e091',name.slice(8))
  :path.join(latent,name)));
const result={scope:'receiver acceptance of unchanged owner tests; real saved VAE mean, no NN rerun',
  rect:await runRectCases(read,{metadataCodec:codec}),
  f1:await runF1Cases(read,{metadataCodec:codec}),legacy:await runCases(read)};
for(const group of ['rect','f1','legacy'])
  if(!result[group].cases.every(c=>c.status==='PASS'))throw Error(group+' owner tests failed');
await fs.writeFile('/workspace/work/lora/nonrect-received/mean-node-owner-tests.json',
  JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({rect:result.rect.cases.length,f1:result.f1.cases.length,
  legacy:result.legacy.cases.length,rectOutputs:result.rect.outputs,stats:result.rect.stats}));
MEAN_NODE_AUDIT
```
