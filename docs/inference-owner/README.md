# Text／VAE 管理画面

[管理画面を開く](./index.html)。入力とモデル資材はブラウザ内で扱います。

## 必要資材

Textは、UMT5の実行用bundleフォルダ（24 block graphと外部重み、final norm、embedding row hashes、Tokenizer）と、元の`umt5_xxl_fp8_e4m3fn_scaled.safetensors`を別々に選びます。画面内蔵の修正版[manifest](./text-manifest.json)だけを使用し、フォルダ内の旧manifestは採用しません。24件の内部RMSNorm graph bindingを設定時に照合します。元のsafetensorsだけでは実行できません。

VAEは`manifest.json`と、その`assets`に記載されたgraph・外部重みが入った、export済みのフォルダを選びます。manifestは自動で読み込み、File Mapは内部で構成します。個別ファイル選択も利用できます。利用者がJSONやgraphBindingsを編集する必要はありません。bundleの作成元と通常APIは[API文書](../shared/inference/API.md)を参照してください。

## 操作

1. 対応する資材を選んで「設定」を押します。設定だけでは推論しません。
2. Textは通常テキスト、又はToken ID／maskを指定します。VAE encodeは画像・動画、又は前処理済みRGBのWKT、decodeはlatentのWKTを読み込みます。「用意された入力」は1×16×32の小さい診断用tensorです。選択したVAEが対応するshapeだけ実行できます。
3. 「実行」を押します。「取消」は資源の終端を待ってから再実行できる状態へ戻します。
4. 結果をWKT又は管理ZIPへ保存します。管理ZIPは元入力の依存記録も含み、読み戻して再利用できます。Textのmask／モデル・Tokenizer／最終RMSNorm marker、VAEのframe情報／producer・decoder bindingを保持します。
5. 「資源を解放」でFile・結果の保持と実行資源を終了します。再初期化後はモデルを設定し直します。

VAE decodeは復元済みraw生成sampleを直接受け取ります。追加の正規化復元やposterior meanへの改名は行いません。出力は未clipのfloat32 `NCTHW`、meaning `raw-decoder-rgb`です。画素値を変えずWKT／管理ZIPで表示側・保存側へ渡します。PNG変換や映像プレビューはこの画面の対応範囲に含みません。

VAE媒体取込はPNG／JPEG／静止WebP、VP9 WebM／H.264 MP4を既存媒体decoderで読み出します。向き・sRGBの処理はそのdecoderに従い、寸法と全フレームを保持します。RGBA8から`rgb-unit`への配置は従来のowner処理を共通化し、`rgb-unit`→[-1,1]はnative VAEのHikeだけが担当します。取込は取消・再選択できます。

透過、VAEが受け付けない寸法・フレーム数、既存decoderの4MiB・10秒制限、元ファイル＋保持RGBA＋生成tensorの64MiB見積り超過は理由を表示して停止します。64MiBは全ブラウザのピーク上限ではありません。動画の実codecを使うUI試験は未実施で、frame順序・時刻の確認は小さい制御fixtureです。原寸動画のUI取込を合格扱いにはしていません。

## 制限と検証範囲

通常APIの版は`works-ai-1`。Textのplain出力は`[1,512,4096]`、ID経路は`[1,L,4096]`（L=1..512）です。出力markerは`umt5-final-rmsnorm-f32-v1`です。ComfyUI固有のprompt重みは扱いません。

VAEの対応shapeは、選択して実際に構成したmanifestから表示・判定します。寸法合わせのresize・padding・frame削減は追加しません。streaming版の既定の末尾処理は通常APIの`frameProcessing`に保持します。threads4版はcross-origin isolationとSharedArrayBufferが必須です。通常のGitHub Pagesにはその設定がなく、threads1への自動切替はしません。threads1 bundleを使う場合も、その版の実行条件と検証範囲を確認してください。

この画面はText／VAEの管理経路です。Diffusion・LoRAを含む全体生成の運用確認は別です。実Diffusion生成raw原本は未受領のため、その実payloadでのdecode成功は主張しません。既存のText数値比較・原寸VAEの合格は各scopeで再利用し、公開画面で行った操作の範囲とは区別して報告します。

保存ZIPに記録するnative API／codecのsourceは、同じcodecを使う公開版間で固定します。媒体UIのsourceはconfigの`uiSourceRef`に分離し、UIの更新だけで既存ZIPが読めなくなることを防ぎます。WKTは従来のWKTSR001/schemaVersion1のままです。
