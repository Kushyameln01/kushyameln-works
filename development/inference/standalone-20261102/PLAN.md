# TextとVAEの単体完成

2026-11-02 JST。指定Page `page_1e950f67b0688191bd3f2a1d5b252224`「Kushyameln Works モジュール単体完成 実行計画 Draft」版1.0 draft 1の本文を取得。基点498eb25f027666e3cc661a5851288e4aabf39f0a、branch codex/text-vae-standalone。通常入口の軽量化と既存単独APIを維持し、数値参照・gate・receiptは診断側のみで用いる。

## 担当と完成条件

- [ ] Text T1: plain/ID、empty/multilingual/newline/long/EOS512/overflow/mixed、ID0..256383、L1..512/binary mask/internal0/all0拒否、実L/識別/最終norm/codec。
- [ ] Text T2: L1/2/511/512、内部/末尾mask、全512有効の選定実WASM。未短縮full512独立FP32参照の全値比較。既存Hello worldだけを全域受入へ転用しない。
- [ ] Text T3: File/bytes/hash/create/run取消、再実行/reconfigure/dispose、単独browser保存読戻し、RSS/PSS/WASM/session/Tensor/copy寿命。
- [ ] VAE V1: target/source/reference/rawdecodeの入力域、source F1/4/5/80/81とnative末尾規則、意味とdecoder binding、数式と実能力の分離。
- [ ] VAE V2: native causal cacheを明示し、初回encode1/続き4、decode latent1。layer/block partitionでWASM32bit容量を守り、spatialdynamicとreference域へ対応。194keysとHikeconv2/range維持。
- [ ] VAE V3: target81×480×832とsource境界/reference代表・境界を、独立mean・encodeに依存しないraw decode参照で全値比較。必要ならchunk/fileを使いframe/pixel/channelを減らさない。
- [ ] VAE V4: target正常/取消/再実行/reconfigure/dispose/保存読戻しとcache/WASM/host/OSpeak。実generated sampleは待たず独立raw latentでdecodeを検証。
- [ ] module別RESULT/API/再現/固定sourceをGitHubへpush/Draft PR。実接続と生成READY/merge/Pagesは別判定。

## 確認した正本と制約

管理shape正本は `5ab651395e245e35f9472ca1b24f5e61550a9957:docs/shared/ai-connection/workflow-shapes.mjs`、ruleId `bernini-ca69274-b5a4321-wan21-shapes-v1`。元Berniniはca69274、WanVAEは9737cba9c1c3c4d04b33fcad41c111989865d315。workflow resize/slot規則をownerへ複製しない。

native encodeは初回1frame＋完全な4frame群。T=floor((F-1)/4)+1、処理frame=4*(T-1)+1。F4は1、F80は77を処理し余り3。input RGB Fを勝手に変更せず、処理frame・未処理末尾との対応を返す。sourceの実Fは媒体の観測値を使い、上限81を実Fと推定しない。

target RGB[1,3,81,480,832]、latent[1,16,21,60,104]。参照domainは前処理後H/W16..848の16倍数、F1。固定coreのcache安定サイズはencoder5616*H*W B、decoder9458*H*W B。targetで約2.09/3.52GiB。whole-step cache入出力一括graphは4GiB WASM heapを超えるため、active layerだけを渡すpartitionを実装する。空間resampleはtime frameごとB1で実行し、B=TによるMLAS scratch過大を避ける。空間tile/attention近似やGPU/serverへの置換はしない。

環境はcgroup RAM16GiB・CPU4、workspace空き約1.3GB。/tmpは別tmpfs約8.8GBでRAM予算へ含める。元Text/VAE重み・既存受入bundleは保持。独立参照とNN/exportはrootが直列化し、別ownerの完成/ACKを待たない。

## 実装分担と進捗

Text担当は既存Text tools/API/runtimeと専用文書、VAE exporter担当は新stream_program/export_streamとsource比較、rootはVAE通常runtime/API/共有codec・統合・資源・配布を所有する。同時の巨大NN/exportを避け、開始/終了を記録する。BLOCKEDは確認したoperator/shape/資源と必要修正を記し、対象を小診断へ置換しない。
