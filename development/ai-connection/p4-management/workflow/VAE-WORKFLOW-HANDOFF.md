# 元workflowの入力・slot・前処理 — VAE向け受渡し案（公開版）

2026-11-02 JST。公開版では公開upstreamと版固定されたP6資料だけを同梱する。Pages本文と添付の個別指示・ProductBrief本文は同梱しない。外部への受渡しは未実施。

状態: **原workflowと固定sourceは取得済み。実媒体と実行時の供給結果は未取得**。この文書と [JSON](VAE-WORKFLOW-HANDOFF.json) は管理担当からVAE担当へ渡すための資料であり、まだ外部送信していない。

元workflow JSONを固定upstreamから取得し、既存の提供ZIP内entryのSHA-256と一致させた。21,501 bytes、SHA-256 `543865dfeeb9a94427bea543624e51db5f1dfcf88a7af6a497ddcdbeadc477dd`。20 nodes・27 linksも既存inventoryと全件一致した。元ZIP全体の再取得、ユーザーの実利用runtime版の認証、実媒体の取得は別である。

- [元workflow JSON](source/bernini_rv2v_basic.ca69274.original.json)
- [BerniniStudio v2.3 Python source](source/bernini_studio.ca69274.py) / [editor source](source/bernini_studio.ca69274.js)
- [取得記録・全hash](SOURCE-ACQUISITION.json)
- すべて `CCpt5/ComfyUI-BerniniStudio@ca69274a2d2135052489bc0c67a2d79a64225e86`。提供workflowとの一致は、ユーザーのComfyUI・VHS・PIL・custom nodeの実利用版まで証明しない。

## 入力と供給順

| 順序・役割 | workflowに保存された指定 | 実供給・処理後寸法/frame |
| --- | --- | --- |
| source_video | node21 `132123.mp4` → link29 → node5。force_rate=16、cap=81、skip=0、nth=1、custom W/H=0 | 実原本hash、復号F/H/W、rotation/色、選択frame/time、実処理後shapeは未取得 |
| reference_video | node5では未接続 | このworkflowでは対象外。sourceやslotの作業を止める条件にしない |
| slot0 | wired node24 `0000.png`、mode4、link32。editor候補 `videoframe_80.png` | 実行時にwired tensorが供給されるか未確認。非nullならwired優先、なければeditorを読む |
| slot1 | wired node25 `0000.png`、mode4、link33。editor候補 `00108-_lora_Ed Sheeran - SDXL - Trigger is Edsheeran person_.8_  Edsheeran person, film footage, a society where people can geneticall.png` | slot0と同じ。filenameから寸法・frameの実在を推定しない |
| slot2 | wired node26 `0000.png`、mode4、link34。editorはnull | mode4/linkだけで実供給の成立や不成立を確定しない |
| slot3〜7 | wired未接続、editor null | 保存されたworkflowでは空。空slot用の媒体取得やprofileを要求しない |

Python sourceの630〜674行で、供給されたsource_video、reference_video、存在するslot0〜7の順にcontextを追加する。source/reference動画はそれぞれ一回のencode。画像slotはbatch内のframeを一枚ずつ、順番どおり別contextとしてencodeする。editor loaderは一fileを `[1,H,W,3]` として読む。欠番slotは詰めるが、管理側は元slot番号と詰めた参照番号の対応を別に残す。

実context数と具体的な列は未確定。slot/stream番号をそのままDiffusionのRoPE `source_id` に流用しない。同じordered contextsをpositive/negative双方に結び付ける元処理を維持する。

## 元sourceで確認した前処理

| 役割 | 確認した処理 | 確定している寸法 / 未確定の値 |
| --- | --- | --- |
| source_video | `source_video[:length,:,:,:3]` → `common_upscale(width,height,"area","center")` | 有効な実入力が供給された場合の設定先はW832/H480。実Fと観測shapeはnull。81frame供給を確認した意味ではない |
| reference_video | 先頭length → 長辺resize | 現workflowでは未接続。接続する場合は実F/H/Wが必要 |
| 各slot frame | wired優先。editorならEXIF transpose → RGB → float32 / 255 → 長辺resize | 各encodeのF=1。実H/Wと処理後H/Wはnull。出力gridや診断F1の寸法を流用しない |

長辺処理はPython source 379〜388行の次の式で、`area`、crop `disabled` を使う。

```text
scale = min(848 / max(h,w), 1.0)
H_out = max(16, Python round(h * scale / 16) * 16)
W_out = max(16, Python round(w * scale / 16) * 16)
```

Pythonのties-to-evenを保持する。`ref_max_size=848` は848角の指定ではない。Canvasの既定補間や `Math.round` による代替は未検証。今回はresizeを実行しておらず、式・呼出し引数の確認と実処理結果を区別する。短い動画への反復・padding、新たなframe削減は追加しない。

node5の設定はW832/H480/L81/B1。そこからのRGB `[1,3,81,480,832]`、latent `[1,16,21,60,104]` は設定に基づく候補である。sourceの実供給shapeやslot寸法、受入済みprofileとは扱わない。

## VAE担当へ渡す内容と再開条件

VAEの既存P6資料（`f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`）を保持し、上の具体的なnode・filename・slot候補と取得した元sourceを追加した。既存診断profileの再棚卸し・再exportは行っていない。

| 不足 | その不足で保留する工程 | 先行できる範囲 |
| --- | --- | --- |
| source原本identity、実復号F/H/W・frame/time | sourceの実処理後tensor確認、exact shapeによるprofile選定・新規受入 | 元前処理契約、slot対応整理、既存P2/P3診断 |
| slot0〜2のmode/wired/editor実供給と選択媒体metadata | 具体的context列、実slotの処理後H/W、必要profileの受入 | wired優先・欠番詰め・frame順の契約、空slot3〜7の記録 |
| ユーザーの実利用runtime版 | 元環境と同じpixelになるという認定 | 固定sourceの式・引数・byte identityの整理 |
| P5の実generated sampleと復元receipt | 本物の最終generated decode受入 | 設定gridの必要条件、source/slotの独立した整理 |

実媒体の取得後、処理前後のF/H/Wとpayload hash、入力identity・元slot・frame/timeの対応を記録し、既存profileと**exact shape**を照合する。不足するshapeだけをVAE ownerの別export・独立reference・事前gate・実WASM受入へ渡す。診断のF1、16×16、16×32、848角の容量例から実媒体のshapeを補わない。

最終decodeはnode16 → node17 VAEDecode → node22。保存された出力は16fps・h264-mp4・yuv420p・crf19。実generated入力shape、全producer hash、Diffusionによるraw復元の数値receipt、対応decoder/profileが必要である。native meaning `wan21-raw-generated-sample:v1` とdecoder VAE `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` を別に照合する。mean診断の改名やVAE側での二重復元をしない。

## 保持条件

全producer、decoder binding、Tokenizer、mask、元native responseとevidence、未知のoptional metadataを保持する。`sourceFrameIndices` と任意の同数 `sourceFrameTimesSeconds` は配列の順序・重複を保持し、latent Tへ切り詰めない。管理用のrole/slot選択情報は外側資料へ置き、strictなnative context/latentContractへ独自fieldを挿入しない。

metadata-onlyのGoogle Drive検索では、literal filenameと関連語の限定検索から対応する媒体・archive情報は返らなかった。これは別の保存先にも存在しないという判断ではない。モデル・全媒体のdownload、媒体probe、resize、export、推論、外部送信は行っていない。`generationReady:false` を維持する。
