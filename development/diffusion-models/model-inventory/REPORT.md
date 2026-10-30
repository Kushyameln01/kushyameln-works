# Bernini素材のヘッダー・workflow棚卸し

対象は保存済み2モデルと `example_workflows.zip`。重みtensorをロードせず、各safetensorsの先頭8 bytesと181,280 bytesのJSONヘッダー、ZIP内workflow全文のみを読んだ。推論・ONNX変換・Hike実行・負荷測定は未実施。元ファイルは未変更。

## 実ファイルから確認した事実

両モデルのファイル容量はそれぞれ15,574,833,216 bytes。ヘッダー内payload範囲は重複・欠落なく連続し、最後のoffsetとファイル長が一致した。各モデルは1,815 tensorsで、dtype別内訳は同一。

| dtype | tensor数 | element数 | payload bytes |
| --- | ---: | ---: | ---: |
| F8_E4M3 | 360 | 13,002,342,400 | 13,002,342,400 |
| F16 | 735 | 1,286,149,184 | 2,572,298,368 |
| F32 | 360 | 360 | 1,440 |
| U8 | 360 | 9,720 | 9,720 |

元payloadは15,574,651,928 bytes = 約14.505 GiB/モデル。U8は `*.comfy_quant` というキー、F32は `*.weight_scale` というキーである。U8値や重み内容は本調査では読んでいない。

metadataはLOWで `model_type=bernini_low`、HIGHで `model_type=bernini_high`、いずれも `format=pt`。`blocks.0`〜`blocks.39`の40ブロック、各ブロックにはself/cross attentionとFFNがある。主要な形状は次のとおり。

- `patch_embedding.weight`: [5120,16,1,2,2] F16
- `head.head.weight`: [64,5120] F16
- `text_embedding.0.weight`: [5120,4096] F16
- `time_projection.1.weight`: [30720,5120] F16
- `blocks.0.ffn.0.weight`: [13824,5120] F8_E4M3
- `blocks.0.self_attn.q.weight`: [5120,5120] F8_E4M3

キーと形状はWan系video Transformerの構成を示唆するが、完全な構造・attention heads・epsilon・forwardの意味まではヘッダーだけでは確定しない。`text_embedding.*`はdiffusion内部のconditioning射影であり、外部Text Encoderが同梱されたという証拠ではない。

## 大容量モデルの早期判定

計画書にあるORT Web wasm32経路で、元payloadを全量同一linear Memoryに保持する構成は、1モデルだけでも4,294,967,296 bytesのアドレス空間を超える。activation・runtime・copy以前の下限で失敗する。2モデルの段階ロードのみでは1モデルの超過は解消しない。外部重みファイルへ分割するだけでもこの下限は変わらない。

全数値tensorを仮にFP16へ揃えれば28,576,983,888 bytes、FP32なら57,153,967,776 bytes/モデルとなる（U8 metadataは除外）。これは展開時の単純な重み量であり、実変換物容量・実RAMピーク・ORTが対応するdtypeの断定ではない。

部分グラフ・ブロック単位の重み入替と中間tensor搬送を新たに実証できるなら検討余地があるが、その実装・正しさ・効果は未確認。ヘッダーから「WASM全般が不可能」とは結論しない。量子化変更・別モデル・WebGPUへの置換も本調査では採用しない。

## workflowから確認した処理

ZIPにはディレクトリentryと `example_workflows/bernini_rv2v_basic.json` 1件のみ。JSONは20 nodes・27 links。原文と機械可読要約を同ディレクトリへ保持した。

| node | 処理・設定 |
| --- | --- |
| 6 | HIGH UNETLoader: `Bernini - Bytedance\\Wan22_Bernini_HIGH_mxfp8.safetensors`, weight_dtype=default |
| 7 | HIGH用LoraLoaderModelOnly: `lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors`, strength=3 |
| 8 | HIGH ModelSamplingSD3, shift=5 |
| 9 | LOW UNETLoader: `Bernini - Bytedance\\Wan22_Bernini_LOW_mxfp8.safetensors`, weight_dtype=default |
| 10 | LOW用LoraLoaderModelOnly: `Lightx2v-Lighning-latest\\Wan2.2-Lightning_I2V-A14B-4steps-lora_LOW_fp16.safetensors`, strength=1 |
| 11 | LOW ModelSamplingSD3, shift=5 |
| 12 | KSamplerSelect=euler（両stage共通） |
| 13 | BasicScheduler=simple, steps=6, denoise=1。HIGH modelからsigma列を作る |
| 14 | SplitSigmasのstep=3 |
| 15 | High Sampler: add_noise=true, seed=0/fixed, CFG=1。HIGH sigmasとBerniniStudio latent/conditioningを入力 |
| 16 | Low Sampler: add_noise=false, seed=0/fixed, CFG=1。LOW sigmasとHIGH output latentを入力 |
| 1 | CLIPLoader: `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, type=wan, device=default |
| 2 | VAELoader: `wan_2.1_vae.safetensors` |
| 5 | custom node BerniniStudio。CLIP、VAE、source video、複数reference imageを入力し、positive/negative CONDITIONINGとLATENTを出力 |
| 17 | VAEDecode: LOW output latentをnode2のVAEで画像化 |
| 21/22 | VHS_LoadVideo / VHS_VideoCombine。動画入出力 |

グループtitleは `Two-stage sampling (steps 0-3 HIGH, 3-6 LOW)`。node5では先頭設定がwidth=832, height=480, length=81, batch_size=1, task_type=rv2v。node21では132123.mp4, force_rate=16, frame_load_cap=81, select_every_nth=1。node22は16 fps, h264-mp4, yuv420p, crf19。node24〜26のLoadImageはmode4で、それぞれBerniniStudioのimage0〜2へlinkされている。mode4が実行時にどう扱われるかはUI用workflowだけで推測しない。

重要な不一致: workflowはmxfp8ファイル名を参照するが、保存実体はscaled F8_E4M3/F16混在の別名ファイルである。モデル役割の対応候補はHIGH/LOWとして明らかでも、元workflowとの数値同等性・量子化方式一致を証明していない。

## 必要だが今回の保存データにないもの

- 上記2件のLoRA重み。省略すれば元workflowと異なるモデルになる。
- 外部Text Encoder重み・Tokenizer/config、およびVAE重み/config。添付ZIPにはモデルが同梱されていない。
- BerniniStudio custom nodeの実装・固定版、ComfyUI本体・VHS等の固定版。
- 入力動画132123.mp4および参照画像、基準noise・conditioning・1 step/最終latent。
- 別Codex製の各モジュールのAPI/schema・対象build・WASM・稼働先。

`rg --files`で `/workspace/kushyameln-works`、`/workspace/work`、`/workspace/attachments` の名称を確認した範囲では、上記のText Encoder/VAE/LoRA/ONNX実体は見つからなかった。別Codexや外部保存先にも存在しないという意味ではない。

## Hike担当候補と注意

このworkflowにはEuler更新とnoise/latent更新があるため、その数値処理はHikeへの有効な割当候補。実際の更新式は元ComfyUI/sourceを版固定して確認する。`simple`のsigma値を任意の等間隔列へ置換しない。両stageはCFG=1なので、負のconditioningや一般CFG計算を必ず実行するかは元samplerの実装で確認し、担当件数のために処理を増やさない。元seedだけで同じnoiseを再現したとは扱わず、固定noise tensorを比較入力にする。主要attention/MatMulの移植可否は未評価。

Text Encoder/VAEはworkflow上ではloaderが別ノードだが、これはWorksに独立ブラウザモジュール/APIが確立済みである証拠にはならない。特にnode5はCLIPとVAEをともに利用してconditioning/latentを作るため、接続契約にはこの統合処理の所有者と必要な補助tensorの定義が必要。

## 再現と記録

`python /workspace/work/diffusion-investigation/model-inventory/inspect_materials.py` で再生成できる。`inventory.json`に全node・link・形状根拠・容量計算を、各ヘッダーの原本は `/workspace/work/diffusion-investigation/model-inventory/*.header.json` に保存した。commitには要約・hash・再現scriptを含め、全ヘッダーを重複同梱しない。配布元の完全ファイルhashは既存 `retained/bernini/manifest.json` を参照する。本調査はヘッダーhashを計算しただけで、31 GBの完全hashを再計算していない。
