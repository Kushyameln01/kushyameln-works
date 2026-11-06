# Text／VAE運用候補の初回ローカル検証記録

この記録はsource130146のローカル検証scopeを保存したものです。後続のユーザー指示で公開へ進めており、現行の公開入口・操作は [公開README](../../../docs/inference-owner/README.md) と後続の `PUBLIC-RESULT.md` を参照してください。下記の「公開していない」は初回記録時点の状態です。

## 1. 固定SHA

実装・ブラウザ実行source：`1301462816155c728fb9cf7997d9eeccff4148ed`。branchは `codex/text-vae-management-20261104`、[Draft PR20](https://github.com/Kushyameln01/kushyameln-works/pull/20)。数値APIは既存 `works-ai-1` のまま。実装完了、下記scopeの運用候補、原寸を含む実運用確認済みは分ける。

## 2. 起動方法

同じ検証環境にはhostを起動済み。`/workspace/work/inference/operational-candidate-20261106/operational-host.json` がURL／PID／実資材のpathを保持する。localhostはこの環境内から利用する。

```bash
python tools/inference/management-connection/serve-operational.py \
  --source-sha 1301462816155c728fb9cf7997d9eeccff4148ed \
  --text-bundle /workspace/work/inference/management-20261104/text-source-ordered-bundle \
  --text-source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --vae-bundle /workspace/work/inference/operational-candidate-20261106/vae-stream-threads4 \
  --port 8765 --state-file /tmp/works-inference-host.json
```

別の配置では資材pathを置き換える。引数を省いて起動し、画面で自分のmanifest／Fileを選んでもよい。Gitに管理source e166のobjectがない場合だけ `git fetch origin e1661e561dfb1a4f20544ff48bc375175b5981d1` が必要。停止は起動terminalのCtrl-C。公開Pagesへの反映ではない。

## 3. 必要資材と保持済み入力

- Text：採用manifest420e（host内蔵）、元graph等27資材と原model1件。モデルを全量buffer化せず、実FileをFile Mapへ保持する。旧manifestへのfallbackはない。configure戻り24bindingを照合する。
- VAE：manifestと対応File Map。起動中hostは既存の原寸対応stream・threads4 manifest532523…6d2と71資材を使用。元資材をhardlinkで組にしただけで、再export／全model hashはない。小さい画面検証には既存Rect4資材を別hostで使用した。
- 現codecはサービスから実管理build／read両方へ注入済み。Text marker／mask／model／Tokenizer、VAEのframe処理／producer／decoder bindingを保持する。
- 画面の「用意された入力」から保持済み実Text L512、VAE posterior mean、RGB、normalized meanを選べる。VAE meanはDiffusion生成sampleではない。実生成raw原本1179Bの2件は依然未取得で、代用品を置いていない。受領後は `--raw-sample /path/to/original.wktensor` 又は画面のWKT読込みで、そのままdecodeできる。

資材名／path／bytesはhostの `/candidate-config.json` にある。大きいmodel／graphのpayloadはHTTP配信せず、ブラウザで選んだFileを使う。検証用Codexには同環境の実pathと入力を渡して操作を実施済み。別環境へ巨大資材を取得済みとは主張しない。

## 4. 通常操作

1. Text資材と元model、又はVAE manifestと資材を選んで設定する。shapeと構成状態を確認する。
2. Textはplain又はIDs／mask、VAEは前処理済みRGB／latent WKTを選ぶ。保存ZIPも読める。縮小・padding・frame削減・latent復元は画面で追加しない。
3. 実行。取消は元Promiseと資源終端を待ってから再実行できる。
4. 結果をWKT又は管理ZIPへ保存。ZIPは元raw入力を含む依存も保持する。読戻し後、選んだtensorを入力として再利用できる。読戻しは履歴を置換する。
5. 履歴の消去、資源解放、再初期化を操作できる。解放時はFile参照と保持結果を外す。既に呼出し側へ返した配列をdetachしない。

管理画面への組込みには `docs/shared/inference/operational-owner.mjs` の `createOperationalInferenceOwner` を使う。既存の実managerを注入し、native API／現codec／File Map／共有queueを一組として扱う。新しい数値処理やmodel固有mappingはない。

## 5. 既知の制限

この画面はText／VAEの管理用候補で、Diffusion／LoRAを含む全工程UIではない。元の汎用管理画面のreference-copy defaultを更新済みという意味でもない。静的Pages単独ではなく、上記host経由で使う。

Textの既存NN合格を再利用。新画面のText操作は保存実出力を返すcontrolled clientで検証し、新しい長時間Text NNは行わなかった。通常起動は本物のWorkerを使い、controlの切替機能は製品にない。VAEの画面実行はRectのみ。原寸81×480×832は構成と対応照会を確認したが、新画面で原寸NN／保存資源まで受け入れたわけではない。

## 6. 今回の確認と残件

起動／import、Textのplain・IDs操作、取消終端・再実行、WKT／管理ZIPの実保存・読戻し、再利用、解放・再初期化を確認。実VAEは早期取消後のRect decodeと保存後の再利用decodeを実行し、参照との差はmaxAbs2.4437904357910156e-6。Text28／VAE71のFile設定、原寸encode／decodeのmetadata対応も確認した。所有browser／子processのlive・zombie残件は0。親hostだけは検証用に稼働を継続する。

残件は実Diffusion raw原本の受領とそのdecode、原寸画面での実運用資源、未実施の新Text browser NN、全体生成連結。原寸VAE／既存Textの再export・全面再推論、LoRA送付、merge、Pages公開は行っていない。確認結果は [validation/result.json](validation/result.json)、原寸構成のみの確認は [validation/full-profile-config.json](validation/full-profile-config.json)。再現用UI検証は `validate-operational.py --url URL --output NEW_DIRECTORY --scope all` で行える。
