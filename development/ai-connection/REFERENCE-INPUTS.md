# 追加開発資料の取得と静的分類

2026年10月31日。対象はユーザー指定のGoogle Drive 3件。取得したZIPをそのまま保持し、全体SHA-256を計算してから安全なパスへ展開した。ZIPの各entryはパス・重複・file type・暗号化flagを確認し、展開時のCRCと実byte数を検査した。アーカイブ内のコードやworkflowは実行していない。

完全な取得台帳・ファイルhash・tensor型・rank・target shape・workflow参照は [REFERENCE-INPUTS.json](REFERENCE-INPUTS.json) に記録した。重み本体と完全なheader/target inventoryはクラウドの作業領域に保持し、Gitへ収録しない。

| SourceNo | Drive資料 | ZIP実bytes | 静的に確認した内容 |
| --- | --- | ---: | --- |
| 1 | [Wan_Depth.zip](https://drive.google.com/file/d/1DXgn7JI8bc0yeuOjpPJkOQbhJUEpHSFU/view) | 351,546,514 | 378,400,000-byte safetensors 1件とworkflow JSON。rank128のA/B 241組、F32 482 tensorとI64 reshape marker 1件 |
| 2 | [LTX_depth.zip](https://drive.google.com/file/d/1xkFOZ-xrNZ6mejSfrrtOCJUG6ZL6RbnM/view) | 128,258,760 | ComfyUI用とdiffusers用のsafetensors各1件。各BF16 960 tensor、rank8の2D A/B 480組 |
| 3 | [Wan_Tile.zip](https://drive.google.com/file/d/1GzAEMunWS9WUGwLvqVfTZIzVRQzGcLGR/view) | 351,227,060 | 378,400,000-byte safetensors 1件とworkflow JSON。rank128のA/B 241組、F32 482 tensorとI64 reshape marker 1件 |

Source 2はGoogle Drive pluginのraw取得結果から完全なbytesを回収した。Source 1・3はpluginのraw response上限268,435,456 bytesによる413だったため、同じ指定公開shareのGoogle標準download確認フォームを経由した。認証拒否の回避やDrive上の移動・公開変更は行っていない。Google metadataのsizeは実bytesと一致したが、正規化応答にMD5/SHAはなかった。台帳のSHAは今回のローカル計算値であり、未取得のprovider checksumとの一致を意味しない。

Source 1・3には別途、同名の会話添付も指定された。添付のbytesは今回独立に取得・照合しておらず、Drive版との同一性は未確認として別source欄へ保持した。

## 接続判断に使える構造

Wan Depth・Tileの240組は2D target `[1536,1536]`。残るpatch embeddingはA `[128,32,1,2,2]`、B `[1536,128,1,1,1]` の5D Convで、I64 markerは `[1536,32,1,2,2]` を示す。既存のLinear専用profileへ黙って平坦化したり、この組を落として全体適用済みにしたりしない。5D/reshapeに対応する明示handler、実base・graph・registryとの対応が必要である。

LTXの各480組は2D。構造上のtargetは `[4096,4096]` が384組、`[16384,4096]` と `[4096,16384]` が各48組。ComfyUI版のnamespaceは `diffusion_model.transformer_blocks.*`、diffusers版は `transformer.transformer_blocks.*`。この名称差を既存Wanのregistryへ無条件に置換しない。

4モデルともalpha tensorはなく、base/graph/registryのhashを確定するmetadataもない。LTX diffusers版のmetadataは `format` のみ。A/Bの構造を読めることと、loader policy、alpha省略時の倍率、実base適合、consumerでの数値適用が成立することは別に判断する。現在のBernini 5120幅の診断profileと、これらの1536/4096幅targetは一致しない。

## workflowの未確認点

Wan Depth workflowは `wan2.1_t2v_1.3B_fp16.safetensors`、Wan Tile workflowは `wan2.1_t2v_1.3B_bf16.safetensors` を名前で参照する。これは実モデルのhash照合ではない。Tile ZIPの実adapterはv1.1だが、workflowはv1.0を参照し、別のcfgdistill LoRAも指定している。その追加LoRAは本ZIPに含まれていない。

これらは開発用の資料として登録した。製品のローカルFile受付に四原本の同時入力や全baseの再取得を追加しない。今回の受入scopeはZIP/CRC、Safetensors header・payload layout、入力分類までであり、実モデル数値比較、全target適用、生成受付の合格ではない。

管理経路の正例には、実Fileの取得・header読取り・所有copy・E4保存読戻しを使える。負例にはWanの5D/reshapeをLinearとして受理しないこと、別family/shape/namespaceを名前だけで適合扱いしないこと、metadata不足を未確認として返すことを使う。
