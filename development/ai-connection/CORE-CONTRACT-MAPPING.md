# A0 — 固定902原本とBernini core契約の対応

2026-10-31 JST。担当範囲は正本の配布準備、読取り照合、契約対応表。F1/L1/D1のruntime実装、モデル変換・推論、push・公開は本記録の成果に含めない。

この記録は添付「総合接続仕様書 Draft **1.1-draft.1**」全20節と「実装計画 Draft **0.1-draft.1**」全文を読んだ上でのA0追補である。旧1.0の読了を流用していない。添付1.3計画や添付CustomNode v2.3そのものを新たに取得・照合したとは扱わない。下記公開BerniniStudio候補と実利用plugin版の同一性は未確認のままとする。

## 1. 取得できる固定原本

| 項目 | 固定値 |
| --- | --- |
| repository | `Kushyameln01/kushyameln-works` |
| 完全commit | `9023329b8d803306abcdd9342f24c01ba0df2676` |
| tree | `4bd281f05b43f366b8f8a8fd70cff7c8be4be1d5` |
| commit時刻 | `2026-10-30T20:39:02Z` |
| 原調整文書 | `development/diffusion-models/INTEGRATION_ADJUSTMENT.md` |
| 同文書Git blob | `a7a0f01c8196750c1362cf38675e5a9a28204f47` |
| 同文書SHA-256 | `62017ee20ec385470a5e1855c919000e09eba92416e059487666468e8c27729a` |
| 容量記録 | `development/diffusion-models/api-adjustment/baseline-and-capacity.json` |
| 同記録SHA-256 | `d27b547d62744622824dabacff2e4ae0396456fdec796b9568bb5aa06d237b0b` |

GitHubでこのlocal commitが取得できなかった履歴を否定しない。A0では固定commitから **`git archive`** で抽出した配布物を別の取得経路として用意した。原902文書は書換えていない。

- 配布物: `9023329-source.tar.gz`、**73,134 bytes / 32ファイル**。
- archive SHA-256: **`3464794167492e1440a918ab38e9823e6d9d030d141e58fb596fae7b482fdbb0`**。
- 同梱せず外側で添付する台帳: `9023329-source.manifest.json`、SHA-256 `622b68a2dbd6bbcd4a5ee8f90306bf0a8ab8cfe0a98e387340e9edd473beb337`。
- `9023329-source.SHA256SUMS` と再現用 `prepare-902-source.py` も配布対象。

archiveは原調整文書・容量/出典記録とnative API比較sourceの**参照subset**であり、実行可能runtime bundleではない。実model/LoRA重み、実重みから読んだscalar scale一覧、媒体、ONNX、WASM binary、並行作業中の変更、今回の新対応表を含めない。すべて902のgit objectから取得し、PAX commit、正確なpath集合、各blob SHA-1、各file SHA-256を照合した。manifestに完全path・bytes・blob/SHA・抽出commandを記録した。外部ComfyUI sourceを902由来と偽装して混ぜていない。

受取側の基本検査は次のとおり。archiveだけを取り込む場合も、commit/pathはmanifestに残る。

```sh
sha256sum -c 9023329-source.SHA256SUMS
gzip -dc 9023329-source.tar.gz | git get-tar-commit-id
tar -tzf 9023329-source.tar.gz
mkdir extracted
tar -xzf 9023329-source.tar.gz -C extracted
```

2行目の結果は上記完全commitになる。固定commitを持つrepositoryでは `python prepare-902-source.py --repo <repo> --output-dir <new-directory>` で同じgzip bytesを再生成できる。builderはcheckoutや現working treeを読まず、指定32pathをgit objectから抽出する。SHA照合は内容同一性の検査であり、モデルの適合や実装受入の証明ではない。

## 2. sourceの版と取得状態

| 参照 | 完全commit / 原本 | 今回の確認と限界 |
| --- | --- | --- |
| G2公開基準 | `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` | 現行`diffusion-models/0.1`とNOT_READYを基準にする。今回はHTTPS/実モデルを再実行しない |
| 902調整案 | `9023329b8d803306abcdd9342f24c01ba0df2676` | `0.2-draft.1`の仕様案。archiveで取得可能にした。実装版ではない |
| core | `Comfy-Org/ComfyUI@b5a432157de6b8884f81104cd02926adf4d597e4` | 下記の固定source・行・hashで確認。実export graphの同等性は未検証 |
| CustomNode候補 | `CCpt5/ComfyUI-BerniniStudio@ca69274a2d2135052489bc0c67a2d79a64225e86/bernini_studio.py` | 公開候補を参照。元の実利用plugin版とは未照合 |
| G1C | `6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095` | GitHubからAPI.md、tensor.mjs、connection/RESULT.md、PROFILES.mdを読取り取得。PR branch正本で、main/Pagesへ反映済みとはしない |
| 添付総合仕様 | 1.1-draft.1、SHA-256 `0744a98219c6ddab4880773029e6318de3e770c8e14e1bb2edbb1bf25c1c3944` | 全20節読了。規格・担当方針と実装状態を区別 |
| 添付実装計画 | 0.1-draft.1、SHA-256 `770d1cdc26c07548cbe12b33cba93d3f22ab3b565ff58b0ba978f3983ff9c64d` | 全文読了。A0/F1/L1の着手は本セッションの依頼範囲。後工程まで実施したとはしない |

外部15sourceの完全commit/path、raw取得URL、bytes、Git blob SHA-1、SHA-256、該当行を配布用 `core-source-manifest.json` に記録した。G1Cの4sourceは別の `g1c-source-manifest.json`。これらと902 archiveは出自を分ける。

## 3. coreから確定する規則と現行runtimeとの差

以下の行番号は固定ComfyUI commitの元pathに対するもの。`INTEGRATION_ADJUSTMENT.md`の該当節は902原本を指す。静的規則の取得・照合を、40-block実graphの接続・数値検証へ昇格させない。

| 規則 | 902原本 | core根拠と意味 | 現行0.1との差 / 次工程 |
| --- | --- | --- | --- |
| raw予測と符号 | §1.1、§5.2 PredictInput/Result | `model_base.py:1668–1670`はFLOW、`:128–130`はCONST選択、`:219–261`は入力xをcoreへ渡し、最後に`calculate_denoised(sigma,core.float(),x)`。`model_sampling.py:86–92`は`D=x−sigma*v` | 公開predictは常にNOT_READY。提案meaningは`wan21-flow-velocity:v1`。core出力をEPSやdenoisedと呼び換えない |
| context raw→normalized | §2.2、§3.1 | `model_base.py:1738–1741`がlist各要素へWan21 process_in、`latent_formats.py:755–777`が16channel mean/stdと演算順を定義 | 現mean変換は128要素のみ。本番context shape対応は未実装。生成sample用の変換とmean専用APIを混用しない |
| target/source_id | §2.2 | `wan/model.py:715–723`でtargetは既定source_id0、存在するcontext iへi+1。欠けたroleに空streamを挿入しない | 現APIにcore context消費はない。managerのstreamIndex/slot番号をそのままmodel source_idとしない |
| token concat | §2.3 | `wan/model.py:581–607`で各streamを独立patch embedding→flatten→transposeし、targetの後ろへtoken軸concat。`:624–645`は全block/headの後でcontext suffixを除去 | raw NCTHWのT/C軸concatや固定K/Vへの代用はこのcoreと異なる。head後unpatchify/cropは`:725–749` |
| RoPE軸とsource回転 | §2.3 | `wan/model.py:535–536`はhead128を`[44,42,42]`、theta10000。`:654–685`は各stream T/H/Wを0から。`:687–692`は別のfull128 source_id回転をFP32行列合成。`flux/layers.py:15–29`がT/H/W順、`flux/math.py:20–32`がfloat64周波数/三角関数→float32行列 | source回転は64pair全体、時間22pairも含む。第4軸、時間offset、H/Wへ単純加算ではない。角度を畳む実装は丸めが異なるため別検証 |
| patch padding | §2.3 | `wan/model.py:702–725`がtarget/contextをpatch倍数へpad、最終targetを元T/H/Wへcrop。`common_dit.py:5–13`はeager circular、tracing/scriptingのみreflect | patch `(1,2,2)`。graph export時のreflectへ無断変更せず、採用padding modeと参照を固定する |
| text512準備 | §2.1 | `text_encoders/wan.py:9,14`はmask有効/zero_out_maskedとmin_length512。`sd1_clip.py:266–287,668–669`がTE mask/zero化・最小長pad。`wan/model.py:516–518,609–610,109–123`はbias投影後の全行をmaskなしでcross-attention | 現TE plain経路は512、ID経路は1≤L≤512。提案prepareConditioningがowned snapshotのmask0を0化し右pad512、元L/maskを保持。softmax mask追加・行削除をしない。短いTE実行のnative512数値同等は未認定 |
| 正負contextとframe順 | §1.2、§2.2 | `nodes_bernini.py:70–98`と候補`bernini_studio.py:630–688`でsource動画1stream→reference動画1stream→slot順/各frame独立stream。同listを正負へ添付。候補ではwiredがslot filenameに優先 | metadata順は管理、数値消費はDiffusion。実workflowのmode/bypass・実素材・供給frameは未確認。linkやfilenameだけで実供給成立としない |
| CFG1 | §1.2 | `samplers.py:592–627`はbranch denoisedのCFG、cfg≈1ではnegative NNを省略し得る | negative入力/共有contextの存在と、負branchが実評価されたことを区別する |
| HIGH→LOW | §1.2 | `nodes_custom_sampler.py:220–224`のsplitはsigma境界を共有。`:757–793`のoutput0がstage出力。`samplers.py:993–1006`は開始mix/終了inverse、`:1223–1239`は非zero入力process_in/終了process_out。`model_sampling.py:94–101`がCONST式 | 内部latent直結ではない。下記式を維持。現primitiveがあることをsample結合済みとはしない |
| Euler/simple/shift | §1.1–1.2 | `nodes_model_advanced.py:132–148`がshift5/multiplier1000/CONST、`samplers.py:645–652`がsimple index、`k_diffusion/sampling.py:63–65,190–212`がD→差分→Euler順 | 元6steps/split3/CFG1を保つ。新RNGでseed番号だけ合わせる置換はしない。固定noise入力で比較する |

HIGH境界をs、HIGH内部最終状態をu、Wan正規化をNとすると、元workflowのoutput0経路は次になる。

```text
h = N^-1(f32(u / f32(1-s)))
LOW x = f32(f32(1-s) * N(h))  // LOW noise=0、add_noise=false
```

LOW入口が全0なら元samplerのprocess_in skip規則を別に適用する。一般mean正規化のzero入力をskipする規則ではない。HIGHのoutput slot0をdenoised_output slot1へ取り違えたり、sigma境界を欠落させたり、上式を恒等簡約したりしない。最終LOW sigma0のsampleはN^-1でrawへ一度戻し、meanへ改名しない。順序/回数だけで元GPU precisionの一致を認定しない。

### 出典hash（主要source）

| 元path / 固定core commitは上記 | source SHA-256 |
| --- | --- |
| `comfy/ldm/wan/model.py` | `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699` |
| `comfy/model_base.py` | `ef3d3d515a2b9b60050805a36aea253734424557e2d1a510fcb96e19d7325876` |
| `comfy/model_sampling.py` | `f1f7e0a6206b1c0c44bb6d6792851e256f436bd765e98b9bc239c37f747542e6` |
| `comfy/samplers.py` | `ec98c4ef227772c7fc9953341833347e7c4f4050209617b0e2771b283e2f08ee` |
| `comfy/ldm/common_dit.py` | `5e2459be4a47073a17e6b806f2b93962b4df1cdcaa2ac1890c9573bf942edf82` |
| `comfy/ldm/flux/math.py` | `142d86d8e87792eaf06606ef86665874ce2476d155db678f2b0ee994549b4354` |
| `comfy/ldm/flux/layers.py` | `d7ee59e51234766a03834471eee4adc2152cd39248fc39d4e70bb1b3ba8b6a5e` |
| `comfy/text_encoders/wan.py` | `e9a6ca356790c76f7a36550842fc8a93c8c584cd175d69615eaddb7b4cd276bc` |
| `comfy/sd1_clip.py` | `9eb20b561ed3746d760087d3407ce5ce527ff772e94ceae36da43264a88d516e` |

raw取得先は `https://raw.githubusercontent.com/Comfy-Org/ComfyUI/b5a432157de6b8884f81104cd02926adf4d597e4/<元path>`。全15sourceの残りのhash・行・候補plugin別commitは `core-source-manifest.json` を参照する。

## 4. 1.1/0.1計画に合わせる追補（902の歴史的記述は保持）

| 902の案 | 1.1の対応 / 今回の採用方針 | 未実装または未合意 |
| --- | --- | --- |
| §2.1は追加literal prompt準備をDiffusion所有とする案 | 1.1 §2/17と計画I1では管理のBerniniPipelineProfileがsystem-prefix/default-negativeと最終文字列/改行/hashを所有。TEがencode、Diffusionはembeddingの数値準備/512padを所有する方針へ追補 | 管理prompt機能は今回実装しない。Comfy emphasis/custom embeddingの再現は未対応。候補templateと元plugin同一性は別 |
| §5.2のExecutionSnapshotをDiffusionが生成 | 1.1 §9/18/計画M6の共通ExecutionSnapshotは管理所有。902のものはDiffusion内部execution bindingとして区別し、managerRevisionをinputRevision/SDK local revisionへ上書きしない | common snapshot/publish/rollback/対象cancel adapterは未実装。単一のsnapshotIdを互いの権威としてechoしない |
| A/B variantとHIGH/LOWを型へ固定 | 共通規格はopaque module/operation/step refs。二段/HIGH/LOW/light/detailはBernini参照profileだけに閉じる。Diffusion native内部は独立に維持 | A/B→light/detail aliasはU7未決。強度3/1や二組同時合成を既定にしない |
| GeneratedLatentの独自decoderBinding/producer案 | G1C native `latentContract`へ明示mappingする。producerの複数model hash、decoder VAE hash、restored宣言を分離する。strict native fieldへmanager拡張を混ぜない | 実producer/復元trace/実decodeはU1未成立。G1C schema取得を実生成成功へ昇格しない |
| inputFrameOrder/slotIndex単独の記述 | G1C contextのsourceFrameIndicesと任意時刻を順序/重複含め保持。F=5→latent T=2でもframe配列5件を失わない。共通側はlineage配列/元native metadataを保持 | context.sourceFrameIndicesをlatent各Tへの1対1対応としない。現在902 codecへG1C metadataを黙って投入しない |
| `.wktensor`は追加provenanceを保存しないという現状 | G1C codecはtokenizerSha256/context/latentContractを追加保存する。902/G1公開codecと版/hashで区別し再利用する | evidence/manager snapshot/graph/build/trace/任意extensionsは依然外側packageが必要。U7/U8のcanonical/schemaと保存読戻しは未成立 |
| 0.2 draftの固定field | 規格`works-module-contract/1.0-draft.1`と保存規格`works-artifact-package/1.0-draft.1`はnative wireと別。adapterをmodule外へ置ける設計を維持 | native APIへ共通規格IDを送らない。共通descriptor/4値edge判定/別module差替えはM1/M2/U9未実装 |

### G1Cへ渡す生成sampleのschema対応

今回取得した正本は [G1C API](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/API.md) と [tensor.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/tensor.mjs)。tensor.mjs:27–36が実検査を定義する。

```text
meaning = wan21-raw-generated-sample:v1
latentContract.schemaVersion = 1
representation = generated-sample; space = raw
vaeModelSha256 = decoder VAE hash
producerModelSha256s = 実生成に使用したmodel hashes（非空・重複なし）
normalization = { id:wan21-comfy-f32-v1, state:restored, owner:diffusion_models }
```

任意modelSha256があればproducer配列の一員であり、VAE hashへ書換えない。producer配列順序を勝手に正規化せず、HIGH/LOW実行順・LoRA・graph/buildは別traceへ保持する。`restored`は宣言であって演算証拠ではない。Diffusionの実変換・前後payload hash・Hike/build・対応profile/実decoder比較が必要で、902の128要素mean変換から生成sample復元を捏造しない。共通仕様の表でsuffixを省略した名称もnative wireでは上記`:v1`を保持する。

今回取得したG1C `development/inference/connection/RESULT.md:28`は**52/53、1 error**の旧実行記録を残す。最新53/53は添付計画/担当報告の別時点の主張で、このA0では最新実行logを再取得・再実行していない。初期 `development/inference/RESULT.md` とconnection/RESULT.mdも別文書である。件数を都合よく置換・合算しない。

## 5. 本タスクの確認結果と残るgate

| 項目 | 結果 |
| --- | --- |
| 902原本取得の経路 | archive+manifest/hashで用意済み。受取側で照合可能。公開Git commitが取得可能になったとは報告しない |
| U3の静的仕様取得 | source_id/concat/RoPE/padding/text準備/HIGH→LOWを固定sourceへ対応済み |
| U3/D1の実graph・predict/sample | **未成立**。静的source照合やarchive検証だけでNOT_READYを解除しない |
| U1 | G1C schema正本は今回取得・照合。実生成・復元・decode/保存の結合は未実装/未受入 |
| U2 | 本番、F=1、非正方形各VAE bundleは未export/未受入。128mean kernelと1M pointwiseの本番拡張も別工程 |
| U4/U5 | F1/L1担当の実consumer・FP8・partial/full判定へ渡す。本A0は適用・数値受入を主張しない |
| 実施した検査 | 固定git object抽出、archive PAX commit/全path/hash、再生成同一性、source/文書の静的照合 |
| 未実施 | モデルdownload/全量hash再計算、export、NN推論、fixtureの再実行、F1/L1/D1runtime編集、merge/push/Pages公開 |

902時点のbuild正本は `docs/shared/diffusion-models/api/build-info.py`（引数parserなし、実行するとbuild-info.mjsを生成する）。902 treeの`tools/diffusion-models/`にはlive verifier2本だけがある。新計画にある `tools/diffusion-models/build-info.py` / `test-build-info.py` はG1C等の版と分けて取得・確認する。参照subsetにはruntime source閉包/compiled依存を全部含めていないため、archive展開先でbuilderやmoduleを実行する手順を本A0の検証commandへ混ぜない。

A0は独立moduleの単独利用を止めず、未決に依存するedgeだけを保留する。今回の新文書はruntime採用や他担当全体の合意完了を意味しない。管理側が正本取得とこの追補を共通対応表へ反映し、各実装/結合scopeの証拠を別に受け入れる。
