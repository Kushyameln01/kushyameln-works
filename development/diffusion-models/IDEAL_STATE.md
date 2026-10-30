# Diffusion Models担当契約 v2

更新: 2026-10-31 JST。原要求は会話の最新依頼と添付「Kushyameln Works AI推論3モジュールのWASM実装計画」v1.1。

## To-Be

diffusion_models全体（推論・Hike WASM・外部API）を本担当で確立し、別Codexの包括モジュールからAPI経由で呼べるようにする。複数モジュールをUIから一括操作する全体製品へ組み込めること。Text Encoder/VAEは別担当の独立モジュール・API・Hike使用状況を確認し、内部を代行実装しない。

元モデル・workflow・数値条件を保持する。WebGPU/別モデル/追加量子化/JSによる隠れた代行は採用しない。公開・既存サイト編集は行わない。保存済み原本は変更・削除しない。

## As-Is

- モデル2件各15,574,833,216 bytes。単一モデルpayloadだけで14.505GiB。全量常駐ORT wasm32経路は4GiBアドレス空間を超える。
- workflowは6 steps、Euler/simple、shift5、split3、HIGH/LOW両CFG1。追加LoRA・入力素材・基準tensorが未提供。mxfp8参照と保存済みscaled FP8形式の同等性未確認。
- 取得したWorks main a614f772cfcd95ebec0ba094fc5391e4bbdf0676とローカルHEADが一致。公開treeには推論3モジュールのパスがない。別Codexの非公開/作業中成果は未確認。
- Text Encoder/VAE loaderはComfyUI graph上別ノードだが、Worksの独立API成立は未検証。BerniniStudio node5は両方を利用する。

## 今回の実行単位と判定

1. ヘッダー/workflow棚卸しと対応可否表: 証拠を保存する。
2. Hike配列ABI・固定workspace・Euler更新: 固定compilerからビルドし、独立期待値・Node・実ブラウザで検証する。合成入力は配列カーネルの確認に限定する。
3. 実モデル変換・ORT推論: 全量常駐案はBLOCKED。部分グラフの新経路は実証前に採用しない。
4. 外部API: 本担当で同一ページJavaScript/明示MessagePortの独立APIを実装する。一括UIとTE/VAEは別担当。TE/VAE結合は実物確定後に照合する。
5. ComfyUI負荷低減: 基準実行と同条件比較までNOT VERIFIED。

## 次の行動

固定Hike toolchainを空き容量内で準備し、元ComfyUIのEuler式を固定sourceへ対応づける。ユーザーの回答でDiffusion全体が本担当と確定した。TE/VAE APIは別担当が確定時に提示する。独立した外部APIの実装と、元モデルの分割推論成立性調査を進める。

## rev2変更履歴
ユーザー回答: 別CodexはDiffusionModelsを開発せず、包括モジュールから入出力のみ。Text Encoder APIとVAE APIは独立して追加され、同一ページJavaScriptまたは明示MessagePortから呼ぶ。初期の相手diffusion提供者待ちという解釈を撤回した。

## 今回の到達点

- ヘッダー/quant/workflow/構造/メモリ下限の調査済み。
- Hike Euler: Node/Chromium13項目合格。
- 同一ページ/MessagePort API: 実Worker13項目とLOW/HIGH実File検査合格。
- 実重みFP8 Q射影候補: Node/Chromium6項目と全32出力照合合格。本番採用せず。
- 実predict/sample、Hike→ORT→Hike、tiling/streaming attention、全工程品質・負荷目標は未達。TE/VAE実物結合は公開反映待ち。
