# Diffusion E0・E1接続支援、E6・E7結果

2026-10-31 JST。総合仕様1.1-draft.1と接続実行計画0.2-draft.1をPage閲覧toolで本文取得。旧A0/F1/L1を再利用し、各scopeを分離して進めた。追加のユーザー指示により、作業branchをGitHubへpushしDraft PRを用意する。merge/Pages deploymentは含まない。

## E0 — 原本の取得可能性

[取得用Page](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d)へf522 source ZIP、可読原文kitと9分割base64 JSONを配置した。read_page_referenceから独立受領し、提供者local archive/gitを取得元にせず復元検証した。f522の200file、原902の32fileをSHA/完全commitへ照合。受領試験は同権限の独立検証であり、対向LoRA本人の受領・合意とは分離する。

- f522: `f522d9aeff313558c4ef83022a340af9a4c21391`、source tar SHA `43d087ddac1ebda890a5d5225a70026b4c79150f464bf574321e086e9dbf32d3`。
- 原902: `9023329b8d803306abcdd9342f24c01ba0df2676`、archive SHA `3464794167492e1440a918ab38e9823e6d9d030d141e58fb596fae7b482fdbb0`。
- 取得/照合詳細: e0/independent-retrieval.json / .md。
- GitHub source branch `codex/diffusion-api-adjustment`、`codex/diffusion-l1-wasm` も追加指示後にpush。過去の「未push」という記録はその当時の状態として保持する。

## E1 — 可読契約照合済、共同runtimeはBLOCKED

LoRA側Pageとv2契約/registry対応/receipt/inventoryの4JSONを実受領しSHA一致。SDK実89b489…/配布2bba907…のGitHub取得は422 No commit found、PageのZIPはツール形式制約で本文未取得。4原本は当環境で未受領、lightの固定HF URL/size/サーバー宣言hashは確認、detailのURLは未提示。原本・SDK sourceを取得済みとして低rank代替実装を作らなかった。共同実行件数0。

必要なadapter差分はe1/CONTRACT_DIFF.mdに固定した。full/selected shape、SDK/native別registry hash、full→slice offset、scope、validation/commit receiptを対応付ける。detailにはQ bias patchがないため、不変base biasをpass-throughしsink両targetを満たす必要がある（ゼロ補完不可）。再開条件は実SDK sourceと4原本の取得経路。同じ数値試験でない既存単体件数を合算しない。

## E6 — 明示64要素mean profile拡張

新profile `wan21-raw-f32-1x16x16`、shape `[1,16,1,2,2]`、64値を専用HikeABI `NormalizeRawMeanF1/RestoreRawMeanF1`、channel=i/4で処理。旧128のi/8と出力hashを維持。shape/meaning/model/profileを厳密に検査し、padding・軸偽装・generated sampleのmeanへの改名は行わない。pointwise上限1,048,576は変えていない。

Node/ChromiumでF1各10case、旧128各10case、独立Python全64値一致。最大往復誤差1.1920928955078125e-7≤事前2e-6、固定Memory1,114,112B/arena1024B。rootのAPI direct/Port3caseも実Hikeで成功、誤shape/意味/profileとNOT_READYを確認した。G1C codecは固定原本による試験で、main codec移植ではない。実VAE bundle/mean fixture未受領のため共同VAEモデル実行は未成立。詳細e6/RESULT.md、receipt.json、api-green.json。

## E7 — 一候補の限定adopt、本番/E8は保留

候補はQ `[5120,5120]` の出力行tile16。実LOWの単一activation `[1,5120]`→全5120出力を320回の実Hike復号→ORT WASM1.24.3→Hike biasで比較した。元whole model、dense全score、素朴blockは再実装していない。

- 比較5120値、gate失敗0、最大絶対差4.0046870708465576e-7。事前gate abs1e-4＋rel1e-5。referenceはF32復号済weightをF64累積しF32 projection/biasとする独立Python。
- full run2,668.6ms（read303.8、dequant2,053.9、stage309.7ms）。同条件の固定1run記録で、利用者端末の目標達成とはしない。
- weight file reads26,214,400B、managed copies242,626,560B、ORT論理input111,411,200B。
- 既知数値live839,936B＋Hike2Memory3,145,728B＝3,985,664B。ORT内部・metadata・GC未回収は別。
- owned Chromium観測PSS baseline263,652,352→peak422,010,880B。100sampleでconstructor/全caseを含み、ORT allocatorだけや全pipelineのピークではない。

採用はLOW・N=1/full-Q/F32診断境界だけ。元productionFP8精度、QK norm/KV/RoPE/attention/FFN、N32760＋context、全staging/copy/Memory予算は未成立。Linearの成功からpredictを実装せず、E8はBLOCKED。次候補を無断で続行しない。詳細e7/RESULT.md、decision.json、green.json。

## Build、再現、対向へ渡すもの

source閉包は新tiled-q runtimeとlatent builderを含め固定owner builderで更新した。41sourceとprojection/latentの10receipt digestを照合する。最終buildIDはbuild-verification.json。readonly reviewでE6/E7 scope/数値/所有・sourcehashに重大な未修正事項なし。過去のf522の39source記録は当時の証拠である。

```sh
python docs/shared/diffusion-models/api/build-info.py
python tools/diffusion-models/check-build.py
node docs/shared/diffusion-models/latent-space/test-f1.mjs
python docs/shared/diffusion-models/latent-space/test-f1-browser.py
python tools/diffusion-models/e6-api-browser.py --output development/ai-connection/e6/api-green.json
python tools/diffusion-models/e7-reference.py --help
python tools/diffusion-models/e7-browser.py --help
```

E7は固定原本LOWと独立参照を必要とする。各CLIの正確な指定はe7/RESULT.mdに記載。必要compiler/toolchainは既存ABI/owner builderの固定版を用いる。別VAE/LoRA private実装・モデルをsource repoへ同梱しない。

LoRAへ: 取得用Pageと固定commit/API/registry/provider/consumer、v2との差分・受取条件。VAEへ: strict64 profileと専用ABI/意味/metadata・試験scope、実bundle共同未実行。管理へ: native capabilities/原本取得状態、joint/BLOCKEDとLinear限定adopt、queue/snapshot・共通規格をnativeへ強制しない境界。load/predict/sampleは全てNOT_READYを維持。
