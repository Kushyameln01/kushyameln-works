# N2 cross-attention・FFN接続候補

Native API `diffusion-models/0.1`の独立ES module。Profileは`bernini-block0-n2-cross-ffn-f32-candidate-v1`。固定tailの入口・hash検査を維持し、別入力候補をここへ分ける。

- `source.mjs:createP4WeightSource` — immutable original Blobの範囲読出し、実Hike F16/FP8復号。model全量hashを再実行したとは報告しない。
- `conditioning.mjs` — native Textと明示fixtureの別capture、owned snapshot/seal、mask・model/tokenizer・metadata保全。数値変換は行わない。
- `stage.mjs:createPostSelfAttention` — Text投影・cross全40head・FFN chunks3–5・残差。N2全hidden幅のF32候補で、生成APIではない。
- `linear.mjs` — 実ORT runtime weight Gemmとexact Q2 score/Exp。FFN downのinner13824は4出力列以下。innerを分割しない。
- `math.hike/math.mjs` — LN/RMSNorm、GELU(tanh)、modulation、gate/residual。build-recordとkernel hashを固定。
- `weights.mjs:createP4WeightFeed` — registry、owned base provider、疎な最終F32 sinkとcandidate、epoch付き切替、immutable read lease。低rank積は外部LoRA ownerが行う。

使用例と入出力は[API](../../API.md#p4-cross-attentionffnの別入力候補)、producer間の意味・normalizationは[conditioning契約](../../../../../development/ai-connection/p4-cross-ffn/CONDITIONING.md)、検証と再現は[結果](../../../../../development/ai-connection/p4-cross-ffn/RESULT.md)を参照する。

`blockOutput [2,5120]`はblock0 hiddenであり、Text hidden、VAE latent、velocity/denoised/sampleではない。固定N2のHIGH1/LOW3は個別scope。任意LoRA、実Textとの共同数値受入、本番81frame/context、全block、実HIGH→LOW、production precision、全工程資源は個別に成立確認する。load/predict/sampleはNOT_READY。
