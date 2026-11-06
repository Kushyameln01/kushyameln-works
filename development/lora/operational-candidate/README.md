# 採用済みLoRA経路の運用候補

管理 `2b26ee70e9e1925622a59459ccd18bd94ec7e33d` の既存画面と、採用済みSDK→Diffusion weight-port consumerを使う起動kit。LoRA SDKは `6d0c8df4cd4992f26745d2d26394f5e194d2567f`、Diffusionは `b6e166478a8e072c9ffd3ce562bfdb0c89634920`。管理の実行sourceは `f084790d7f594915c869ef375fcbdc6e44ee56f3`、その後の2b26は資料配布版。

LoRA本体のmapping、rank/alpha、復号、合成順、完成F32計算は変更していない。新direct adapterへの切替も行わない。SDK・管理・Diffusionのrevisionとleaseは既存契約のまま。候補HTMLのみ、SDKで未対応の初期pairId `selected-lora` を受理可能な `light` へ2か所修正した。起動時は固定管理checkoutのHTMLに代えてこの版を配信し、他の実装は固定管理版を使う。

## 起動

Python3.12以降、Git、ブラウザが必要。repoのこの配布commitを取得して次を実行する。初回は固定管理sourceをGitから取得し、分離したcheckoutを作る。モデルの取得は行わない。

```bash
python tools/lora/start-adopted-candidate.py --cache /tmp/works-lora-candidate --port 8765
```

`http://127.0.0.1:8765/ai-connection/modules/` を開く。localhost限定、停止はCtrl-C。既存の固定管理checkoutを使う場合は `--manager-root /absolute/path/to/management` を指定する。`--prepare-only` は取得と版確認だけを行う。4-threadへ自動変更せず、まず1-threadを指定する。

## 必要資材と通常操作

1. 端末内の対応するHIGH/LOW base model Fileを管理のDiffusion欄で選び、設定→loadする。全モデルの本運用にはText/VAE等の対応資材も必要。
2. 使用するsideのweight feedを開く。表示されたfeed IDをLoRA接続へ設定する。feed ID/MessagePortは保存済みモデル権限として復元しない。
3. LoRA欄でside、pairId（`light` または `detail`）、必要なローカル `.safetensors` を選びregisterする。初期値は `light`。使用しないpair/sideや過去4原本を一律に要求しない。
4. 例えば `{"selections":[{"pairId":"light","strength":1}]}` を指定しapplyする。個別に確認する場合はcompose→prepare→stageも使用できる。合成のmappingとlight/detail順序はSDKが決める。
5. 強度変更・片組除去は新しいselectionsでapplyする。解除はrestoreBase。適用済み重みへの追加加算や差分の引戻しは行わない。
6. prepared handleをOPFSへstream保存し、保存packageを開いてstageすることで再利用できる。操作後はpreparedをreleaseし、weight feedをclose、最後に全moduleを終了する。取消時は終端表示を待ち、必要ならrecover後に再操作する。

正常applyは完成F32 feedの公開を示す。モデル推論・生成・VAE decode・製品保存の成功とは分ける。model再load/unloadで旧feedが失効するため、必要なsideのfeedを開き直す。

## 小Fileによる確認環境

Node24、Playwright、Chromiumがあれば、生成した小さな有効LoRA Fileで既存管理画面から実SDK・実MessagePort・実full-feed consumerまで確認できる。baseは検証用の不変providerで、実baseモデルやNNの代用の合格とはしない。

```bash
node tools/lora/run-adopted-port-browser.cjs \
  --manager-root /tmp/works-lora-candidate/management-2b26ee70 \
  --out /tmp/works-lora-port-new-run
```

Playwrightを通常のNode解決先に置かない場合は `PLAYWRIGHT_MODULE`、Chromiumは `CHROMIUM_EXECUTABLE_PATH` で指定する。`--out` は新しいdirectoryを使う。生成File・試験結果をその中へ回収し、他担当へ実験原本を送付しない。

今回、この経路は11ケースPASS。登録・compose/prepare/stage・強度0/-1・二組weight合成・片組除去・base復帰・取消後再利用・OPFS保存/fresh読戻しを確認した。検証baseとの225,324要素照合は差分0。candidate/read lease/in-flight/cleanupは残量0、2/2 Workerがブラウザ終了前にcloseした。数値演算は変更していないため、これはfixtureの照合であり、全原本の独立数値受入のやり直しではない。

## 既知の制限・今回残す確認

- 小Fileの選択領域はPARTIAL。実原本の全2,904patch再計算、実model原寸推論、HIGH/LOW共同生成、81frame、VAE decode・製品保存をこの試験の成功へ含めない。
- 管理の旧「公開consumerなし」という不足はb6採用で解消済み。前回LoRA direct adapterの採用は今回の条件ではない。
- 実装済み経路と、検証providerでの運用候補と、実資材を使う実運用確認を区別する。保持環境でのNN実行・全体運用は別途確認する。
- 実験用LoRA送付は、単体・部分接続・全体接続実装の成立を確認した後の工程。今回のkit作成・小File試験では送付しない。

今回の実行結果は [RESULT.json](RESULT.json) に記録する。merge・Pages公開は行わない。
