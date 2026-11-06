# Controlled-input P4 LoRA独立参照

この試験は新scope `controlled-caller-input-n2-k4`。選択はlight/LOWの実ローカルFile、cross Q full `[5120,5120]` の先頭4行・全5120列と明示bias4に限定する。旧自然N2/P2の入力・期待値を代替・昇格させない。native P4のcaller-supplied candidate入力の範囲であり、producer/time embedding/schedule認証はfalse、PARTIAL、generationReady=falseを保持する。

## 固定する入力と独立性

- residual: little-endian F32 `[2,5120]`。flat index iで `((i%17)-8)/128`。
- timeAct1: little-endian F32 `[5120]`。`((i%13)-6)/256`。
- conditioning: 固定7eeの `fixture-contract.json` と `fixture_conditioning()` をそのまま使用する。F32 `[1,4,4096]`、mask `[1,1,0,1]`、row2はpositive zero。実Text/model/tokenizerへ改名せず、全4行を残す。
- strength: 0、+1、-1。同じ+1の再適用は同一参照を再利用する。
- loader: `comfy-lora-b5a4321-linear-diff-v1`。このtrialは実BF16 DOWN `[128,5120]`、UP `[5120,128]`、alpha128、明示diff_b `[5120]`を検査する。未知variantや倍率を既定で通さない。

`tools/ai-connection/p4-lora-reference.py` はSDK/Hike演算をimportしない。実行前に自分のsourceとinventoryを実行commitのGit blobへ照合する。未commitのsourceでは原本read前に拒否する。

Aは選択baseのFP8と固有scalar F32 scaleを独立に復号し、BF16因子を独立decodeして、NumPy binary64で `base + strength*(alpha/rank)*(UP@DOWN)` の全20,480 weight値を計算する。biasは独立F32で `baseBias + F32(strength)*diff_b`。元base・原本因子は書き換えない。

BはAの独立weightをF32へ丸めた疎patchと独立biasを、固定P4 coreの `Parameters`／`run_reference`へ渡す。全25 cutのidentityを保持し、consumer用の10240 blockOutputを保存する。B自身は低rank積を計算せず、patch producerは別のAであることを記録する。

fixed peerは `7ee36228030ba3bb544a90b1d4b528702a7bae32`。coreは `tools/diffusion-models/p4-cross-ffn-reference.py`、SHA-256 `66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf`。plan SHA-256は `051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600`。core・plan・build closure50 sourceのGit bytes/hashを検査してからimportする。既存CLI `generate/saved_inputs` と旧自然tailの固定hash guardは変更しない。

## 事前gateとhashの区別

gates/controlled recipeを原本decode・行列積より前にprivate出力する。

| 対象 | absolute | relative |
| --- | ---: | ---: |
| A weight全20,480値 | 1e-5 | 1e-4 |
| A bias全4値 | 0 | 0 |
| B blockOutput全10,240値 | 0.01 | 0.001 |

native gate IDは `p4-cross-ffn-composed-f32-v1`。SDK/Hikeの実prepared F32とA binary64→F32にbit一致を要求しない。Aの独立patch hash、実prepared block SHA、実sink/package/epoch、実消費tileBindings/effective F32 hashを別の識別として保持する。既存direct-F32 sign-bit fixtureの期待値や、その同一最終F32 bitsを前提とする比較を独立LoRA参照へ流用しない。

## 原本・真正baseの証拠

LOW full baseの過去COMPLETE_VERIFIED receiptを入力し、expected model hash `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`、15,574,833,216B、size/mtimeNs/dev/inoを照合する。新規header hash `286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b` と選択範囲を改めて検査する。whole-base hashの反復はしない。

LoRAは選択1 Fileだけを読み、保持済みinventoryのsize/headerを検査する。oracle自身は全File hashを計算せず、`wholeHashVerifiedByOracle:false` とする。後続browserの新規loadでは全hash検査を維持する。過去4原本の再取得・全hashを要求しない。両原本の前後statと選択raw範囲hashを記録する。

## 生成前の静的資源確認

core Parametersは全matrixを常駐させず、source fileから行tileを逐次読む。FFN downは全13824入力列・最大4行/回で、全coverageを4行へ制限するものではない。独立アルゴリズム・inner reduction・精度を変更しない。

| 資源 | 静的値・境界 |
| --- | --- |
| A raw DOWN | 1,310,720B |
| A raw UP選択4行 | 1,024B |
| A raw base Q/bias | 20,480B / 8B。header・scale/configは別 |
| A weight F64 | 163,840B/strength |
| B retained named F32 cuts | 321,536値、1,286,144B/strength |
| B original selected reads | 最大524,671,171B/strength、3 strengthで1,574,013,513B。全File hashや全model常駐ではない |
| B tile | 最大81,920復号要素。raw payload163,840B以下 |
| 保存 | 1file最大2MiB、合計16MiB上限、事前disk空き64MiB以上 |
| 事前memory | available physical 256MiB以上を確認。全matrix常駐なし |

3 strengthは順次計算し、前strengthのforward arraysを解放してから次へ進む。これらは静的array/read/output境界であり、Python/NumPy/BLAS/OS cacheのpeak RSSを測定した値ではない。native/ORT、全工程、製品device budgetの受入を主張しない。

## 出力契約と再現

`manifest.json` は `lora-p4-controlled-oracle/0.1-draft.1`。executionSource、selection、original、inputs、base、gates、cases、filesを分ける。casesはs0/s1/s-1のweight:F64、bias:F32、expectedOutput:F32[10240]、independentPatchArtifact:JSON、forwardReference:JSONを参照する。各descriptorは安全なbasename、dtype、bytes、sha256、arrayならshape/elementsを持つ。filesは全保存参照のallowlistで、manifest自身を含まない。

inputsはresidual/timeAct1/conditioning/maskのbinary、正確なconditioningContract、controlled recipeを保持する。candidatePlanは公開planのbyte exact copyでありexecutionSource.planSha256と一致する。sourceProofはsource/旧base receipt/前後statの記録。raw LoRA/base payloadや因子・scaleのraw値をHTTP公開する出力は作らない。独立期待weight/input/patch/referenceはprivate directory0700・file0600であり、公開Gitへ追加しない。JSONの符号付きゼロを維持し既存出力を上書きしない。

rootがsource commitを固定し生成を指示した後にだけ、次の入口を実行する。

```sh
python tools/ai-connection/p4-lora-reference.py \
  --peer-root <fixed-7ee-checkout> \
  --base <retained-LOW-full-base-file> \
  --base-receipt <existing-LOW-result-or-acquisition-json> \
  --file <selected-light-LOW.safetensors> \
  --expected-sha256 <selected-original-expected-whole-sha256> \
  --out <new-private-directory-outside-source-repositories>
```

合成fixtureだけの検査は `python tools/ai-connection/test-p4-lora-reference.py`。これは実原本・実base・native共同受入ではない。参照生成の成功も実nativeへのLoRA適用成功と分け、後続consumer試験が実File hash・weight/bias全値・10240出力・取消/復帰・ownershipを検証する。
