# Text plain独立全値比較 Implementation Plan

> **For agentic workers:** Implement the following helper-only steps in this existing isolated worktree. Numerical execution begins only after root confirms this plan and serializes the heavy jobs.

**Goal:** 固定plain入力`Hello world`を実Tokenizerから処理し、WASM出力`[1,512,4096]`全値を新しい独立pinned-source参照と比較する。

**Architecture:** Oracleは元weightsを1 blockずつstrict loadし、短縮しない512位置をpinned PyTorch source全24層と最終normへ通す。WASM側は変更しないnative plain API、既存24 graph、実Hike最終RMSNormを使う。前処理・mask・padding・metadata・数値・寿命を別々に確認する。

**Tech Stack:** 既存CPU Torch2.6.0+cpu / safetensors / Python SentencePiece、ORT Web1.24.3 WASM、Hike、Chromium / Playwright。

**Spec:** rootの2026-11-01 plain限定依頼、[事前固定値](predeclared-plan.json)、既存`tools/inference/text-encoder/source-provenance.json`と選択manifest。

## Global Constraints

- manifest SHA `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`、元model/Tokenizer/sourceを保持する。別profile・既存ID fixtureへの置換、再export、再量子化をしない。
- 最終gateは`maxAbsError=0.001`、`rtol=0.001`、元scopeのまま比較前に固定する。最大絶対誤差と全値allclose（atolには同じ0.001を使う）の両方を要求し、値を後付けで緩めない。
- 実plain入力のPython SentencePieceとbrowser WASM Tokenizerの512 IDs/maskを完全一致で比較する。EOS/PAD/位置を保持する。
- 元の中間層失敗・gate改訂履歴は残す。新規合格のscopeはこの明示promptのFP32診断だけとする。
- original6.7GB、既存graph18.5GBをコピーしない。追加diskは64MiB以内を見込み、空き512MiB未満で開始しない。現在空き約1.59GiB、cgroup RAM16GiB、CPU4core枠。Torch2threads、1 block常駐、process RSS目安4GiB以下。時間は未測定で全工程8〜20分の見込み。
- Oracle→browser full→cancelの順に直列化し、各NN開始・終了をrootへ通知する。commit/pushや外部投稿はしない。

## Review Focus

1. mask0の位置・長さ・零出力を、active値の数値gateだけで見逃さない。
2. Oracle自身をtrailing prefixへ短縮せず、WASMのcompactionと独立に512位置で参照を得る。
3. 最終HikeをJS/PyTorchで置換しない。observerは実ORT/session呼出しを記録するだけにする。
4. Plainの独立比較を既存ID4tokenの誤差へ付け替えない。
5. 中断workerの終端化、session/Tensor解放、所有PID+ctime/live/zombieを、正常完了と別に記録する。

## Task 1: 軽量preflightと独立Oracle

Create `tools/inference/text-encoder/plain_reference.py`、必要な軽量helper tests、private `plain-input.json` / `plain-reference.f32` / reference receipt。

- [ ] 比較helperの誤ったshape/meaning/mask/padding、非有限、gate変更、改変bytesを先に失敗させる。テストの合成配列はartifact検査用で、NN合格には数えない。
- [ ] manifest/source/config/Tokenizerの固定hash、入力literal、ディスクを検査し、既存依存だけを使う。
- [ ] Python SentencePieceでplainをtokenizeしEOS/PADを付け512位置へ固定。元embedding rowを読み、7 FP8 matricesの元scalarによるFP32展開とF16展開をblockごとにstrict loadする。
- [ ] unchanged ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` のT5Blockを全512位置・全24層、最後に同source T5LayerNormへ通す。Wanのzero_out_masked=Trueを適用する。ONNX/既存出力をOracleへ入力しない。
- [ ] 全層のstrict key結果、source/scale/hash、最終payload、wall/CPU/peak RSSを保存し、Torch stateを解放して終了する。

## Task 2: 実plain APIと全値比較

Create `tools/inference/text-encoder/accept_plain.py` とplain専用browser observer helper。Private outputは `/workspace/work/inference/p2-p3-20261101/plain/`。

- [ ] 実Chromium File選択で既存bundleと6.7GB元Fileを渡す。modelをHTTPへ配信しない。
- [ ] 同じ文字列をbrowser Tokenizerへ通し、Python側IDs/maskとの全512位置一致を確認する。
- [ ] `api.textEncoder.encode({text})`を変更しないnative workerで実行する。private observer workerは同じORT create/run/releaseとTensor.disposeを記録し、演算や戻り値を置換しない。
- [ ] Hike最終normの寄与、全24 sessionと1常駐、dtype/layout/shape/model/Tokenizer/maskを検査し、`.wktensor`を保存・読戻す。
- [ ] 全2,097,152値の有限性、padding全位置の厳密0、最大絶対誤差と元allclose gateを比較する。active値の誤差も別記する。

## Task 3: 取消・資源・P3受渡し

Private receiptsと`development/inference/p2-p3-acceptance/plain/`の小さい証拠index / RESULT / reproduction guideを保存する。

- [ ] 追加のplain jobをblock1完了通知で取消し、旧返信不採用・owned Worker終了・idle/disposeを確認する。取消時点の観測済みsession情報と未観測部分を区別する。
- [ ] 既存ProcessOwnershipをdisposable helperで使い、PID+ctime、Python exit、live/zombie、50ms samplingの限界を記録する。Browser群のsampled peak RSSと時間を記録する。
- [ ] prompt bytes、IDs/mask、参照と実conditioningのpayload/file hash、gate、source完全SHA、cancel/resource receiptをindex化する。
- [ ] P3用に実plain conditioning `.wktensor`と同じ形式・metadataのprivate pathを渡す。数値診断と管理採用/生成受付/元GPU算術を混同しない。

このplan作成時点では、新しいNNを起動していない。
