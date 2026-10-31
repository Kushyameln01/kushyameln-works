# LoRA最新版を管理経由へ採用する

2026-10-31 JST。目的は、LoRA担当の実PARTIAL共同成功と最新版を管理側へ採用し、
管理経由のローカルFile入力・状態・所有権・保存・取消を検証すること。
ユーザーの追加指示により、既存4原本すべての取得・再試験と全base取得を完了条件から外した。
既存管理2977e7fの合成bridgeや新しい管理制御fixtureの成功を、実base共同受入へ昇格しない。

## 固定する対象

- LoRA配布head `0c27874908638afc748ea2455a2779a16736730b`。
  実HIGH source `4d5fd7363f40f0d743ead448193ef2bf1915bbdc`、LOW source
  `e1f03a4f6092c3154d5b47f166b77bbd32897ac9`。三者の実行差分も確認する。
- 受入実績と同じDiffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384`。
  最新head `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` は別採用候補として照合し、
  実績版から暗黙に切り替えない。
- LoRA側の `lora-diffusion-diagnostic-adapter/0.1` を公開factory注入で再利用する。
  旧管理bridgeは既存互換の履歴として維持し、新受入経路へ重ねて適用しない。
- 修正版Hikeは5051 bytes、SHA-256
  `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。
  native v2版/ABIだけで旧4919-byte kernelと同一実装と判断しない。

## 手順と完了証拠

1. [x] 最新source/API/結果/機械可読契約と必要生成物を実取得し、完全commitとbytes/hashを照合。
2. [x] 管理facadeでowner adapterを採用。要求ID、manager revision、SDK local revision、
   resource owner/generation、native receiptとcopy所有権を別々に保持する。
   target不一致、旧kernel、旧完了通知と失敗cleanupを負caseで確認する。
3. [x] 固定LoRA0cの既存20ケースの公開証拠を実取得・照合。320 actual/expected出力を
   固定gateで再計算し、source/Git objects・plan/package/registry hash・scope・所有権を照合。
   privateの全weight配列は未再取得であり、公開比較件数/hash整合と全配列の再計算を分離。
4. [ ] 管理browser runnerから利用者が選ぶ実File→native登録/source→最新版SDK/Hike→
   owner adapter/consumer/実ORTへ接続する。管理制御用baseは明示したsynthetic fixtureであり、
   実baseの再試験ではない。独立Python oracleと事前gate、保存packageの実ファイル読戻し、
   source解放後のcopy、取消と旧cohortを確認する。未知のlocal Fileを暗黙に適用しない。
5. [ ] 管理回帰と独立review、結果・再現手順・raw配列のprivate保存を整え、既存作業branchへ
   pushしてDraft PR #7を更新する。固定commitのAPI/codeをGitHubから読み戻す。

native ownerの数値実装・出力条件・scope・誤差gateを変更しない。Genuine original E1、
管理snapshotを含むE5実session受入、E9全target/元model全session、生成admissionを区別する。
今回の管理診断経路が成功してもgenerationReadyはfalseを維持する。

## 追加指示前のcheckpoint（履歴）

最新版PageとPR2/PR6本文取得済み。最新版にはowner adapterとkernel修正がある。
4 LoRA原本は公開固定commitから全byteを取得し、全体SHA/size/statを新規照合した。
HIGH baseは4つの連続範囲の全coverageを取得中。未完了Fileを受入試験へ渡さない。
Pageの数値証拠ZIPは現在の読取toolがbinary非対応で、数値結果の再読込みを新しい
原本適用試験の代わりにしない。管理candidate commitを先に固定し、HTTPで実行する
全source/WASMをそのGit blobへ照合してから原本試験を行う。

## ユーザー追加指示後のcheckpoint

HIGHの全base取得はユーザーの条件変更に合わせて停止し、writer終端を確認した。
取得済み4 LoRAは保持するが、製品・検証の必須4slotにはしない。未完了HIGHのcoverageは
8,309,030,912 bytesの下限記録、fullFileVerified=false。LOW baseは未取得。

Drive 3件は開発参照台帳 `REFERENCE-INPUTS.json` / `.md` へ登録した。製品runtimeにDrive取得を
追加せず、ユーザーのローカル`.safetensors` Fileを使用する。Wan Depth/Tileの5D Conv/I64 reshapeと
1536幅、LTXの4096幅/別namespaceを現5120幅のLinear診断profileへ付け替えない。
同名の直接添付は別referenceとして保持し、未取得bytesの同一性を名前だけで認定しない。

実base全体を要求する `run-managed-lora-real.mjs` は追加の任意診断入口であり、改訂後の
完了条件・製品仕様ではない。主検証は `run-managed-local-files.mjs` と既存20証拠の照合とする。
