# 保存generated sampleの部分接続用fixture

これは実生成前の接続fixtureである。128個の値を独立に作ったnormalized tensorに、Diffusion所有の実Hike復元APIを一度だけ適用する。既存posterior meanの改名、VAE側での復元実装、モデル推論、LoRA適用を行わない。HIGH/LOWのhashはこのfixtureの契約検査用bindingであり、そのモデルが値を生成した証拠ではない。この区別は外側の`fixtureScope`へ記録し、strictなnative context/latentContractへ独自fieldを加えない。

## 固定sourceと入出力

- Diffusion配布・実行source: `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。
- 実API: `docs/shared/diffusion-models/execution/generated-space.mjs`の`createGeneratedLatentSpace({wasmBytes,targetShape})`と`owner.restore(tensor,{signal})`。
- 実Hike WASM: `execution/generated-space/build/generated-space.wasm`、SHA-256 `8763d5ec82fd71e31597bb620729c5393383abed478395a2aaaf0d71f85a9b80`。ownerが実bytesを照合する。
- 入力: float32 / NCTHW / `[1,16,1,2,4]`、meaning `bernini-generated-model-latent:v1`、normalization `wan21-comfy-f32-v1`。compactな非共有Float32Array、全128値が有限、maskなし、posterior profileIdなし、latentContractなし。
- producer: `BASE_MODEL_HASHES.HIGH`と`BASE_MODEL_HASHES.LOW`の明示配列。対応済みhashの非空・重複なし配列だけをDiffusionが受理する。decoder VAE hashへ付け替えない。
- 出力: 同じshapeの`wan21-raw-generated-sample:v1`、top-level normalizationなし。`latentContract`はrepresentation `generated-sample`、space `raw`、復号先VAE `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`、元producer配列、normalization `{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}`。
- Rect VAEの実decode入口へそのまま渡し、RGB `[1,3,1,16,32]`を得る。追加復元・正規化を行わない。

現在の共有codecはnormalized generated tensorのtop-level marker/producer配列を保存する契約を持たない。そのため復元前は`normalized-generated.json` + little-endian `normalized-generated.f32`に分ける。JSONの`tensor`はmarker・producer・contextを保持し、payloadは512 bytesとSHA-256で結ぶ。これは新しい`.wktensor`規格ではない。復元後は既存codecの`.wktensor`で完全なgenerated raw契約を保存・読戻しする。

## 再現

固定Diffusion sourceのstatic import closureとWASMを取得し、取得receipt `source-acquisition.json`に`distributionSha`を記録する。今回の取得は`git show <固定SHA>:<path>`による11ファイル、123,082 bytesであり、モデルを取得しない。次のパスは実行環境の例で、取得済みの根拠はreceiptと固定git objectに置く。

```sh
GENERATED_DIFFUSION_SOURCE=/path/to/fixed-diffusion-source \
GENERATED_RECT_MANIFEST=/path/to/accepted-rect-bundle/manifest.json \
node tools/inference/management-connection/generated-fixture.test.mjs

node tools/inference/management-connection/generated-fixture.mjs \
  --diffusion-source /path/to/fixed-diffusion-source \
  --owner-source /path/to/owner-checkout \
  --bundle /path/to/accepted-rect-bundle \
  --out /path/to/private-new-output
```

出力は`normalized-generated.f32`、`normalized-generated.json`、`raw-generated.wktensor`、`fixture-manifest.json`。helperの`prepareGeneratedFixture`は同一originのbrowser ES moduleからも利用できる。Node CLIだけがローカルfsを使う。

管理経由では保存raw WKTを既存`decodeTensor`で読込み、構成済みownerの`api.vae.decode(raw)`へ渡す。RGBの保存と同時に返却`inputDescriptor`を外側packageへ保持する。RGB単体には入力sampleのproducer/decoder/復元来歴を保存しきれない。管理による待機列・executor横断直列化・取消・package保存は管理側が所有する。

## 実施範囲と資材

新規確認は実Hike復元1回、raw WKT保存読戻しの全128値・latentContract・context一致、Rect VAEの実descriptor検査、非対応producer拒否、事前取消、owner解放。3試験が合格した。取消試験ではHike呼出し0回、dispose後WASM memory参照0 bytes。復元成功時もworkspaceは消去され、dispose後memory参照0 bytes。これはRSSやGC回収の測定ではない。数値復元の独立oracleは既存Diffusionのgenerated-space診断証拠を再利用し、本fixtureから別のgateや数値実装を追加しない。

今回の復元・保存読戻しは約7.69 ms、owner公開WASM memory 1,114,112 bytes、dispose後0 bytesだった。数値は一実行の観測値であり、NN decode/session/Worker終了の測定を含まない。

既存Rect manifestのdecode資材は次のとおり。今回はローカルstatとmanifest照合を行い、巨大graphの全hashは再計算しない。受入済みasset照合の証拠と、新規stat確認を区別する。

| role | file | bytes | 既存manifestのSHA-256 |
|---|---|---:|---|
| decoderBody | decoder-body.onnx | 286313363 | `6674457d2170352760b3aa73543ee1d2bf5713e6bf4d7ea6bf63d8f9703ac27e` |
| conv2Weight | conv2-weight.f32 | 1024 | `9ce97eaf137ab64ae409384b6f6177a7b07e593faf103e7e986c0c99d0a1316f` |
| conv2Bias | conv2-bias.f32 | 64 | `1a79fbc83c80584e46d5683d49df3482b575ffb4aca99c843a0e8a2aef9df9cd` |

今回のraw WKTは1475 bytes、SHA-256 `de12bab3ad3c0089e10a36b87f5b42310196e9a5c0f77b7f3da8eec78086517b`。normalized payloadは512 bytes、SHA-256 `a84b9bb9706c10bb6cb5afea3cc730d66769846076f607fe328990c53ca93ba0`。小さい新規fixtureのbytesは実測・hash照合した。

未実施はNN decode、管理保存の実行、実producer生成sample、LoRA付き全体運用。81frame/source/referenceの既存合格は維持するが、今回のRect fixtureへ拡張しない。元81frame streamの71資材507,834,866 bytesは公開manifestのみ残り、private bundleの実bytesは現在の環境に見つからないため、受入済み証拠と資材の再取得を別に扱う。
