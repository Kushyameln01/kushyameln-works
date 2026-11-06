# 固定N2 tail管理接続 Implementation Plan

**Goal:** SPEC.mdの固定自己注意残差部品を、既存の規範・queue・保存経路へ接続する。
**Architecture:** 同realm native ES ownerを外側adapterで管理する。新candidate catalogは元規範を保持して
tail entryだけを追加し、既存evaluateEdgeが判断する。実資材の受領と数値受入は個別edgeで記録する。
**Tech Stack:** JavaScript ES modules、既存Node試験、ownerのWASM/ORTと独立参照harness、既存E4/cache。
**Spec:** [SPEC.md](SPEC.md)。ユーザー指定の実装範囲・方式を採用し、独自の設計承認待ちは追加しない。

## Global Constraints

- 管理03e18b6、配布beffdcb、実行a49aacの完全SHAはSPEC.mdの値に固定する。
- Profile bernini-block0-n2-self-attention-residual-f32-v1、HIGH1/LOW3個別、自己注意後token hidden。
- 元catalog6dae、旧N2、LoRA DATA82b/nativefc・consumer5f・codec2bdのpinと既存scopeを保持。
- strict native引数へ管理targetを混入させない。任意入力に旧数値証拠を流用しない。
- 非公開配列・重みをGit/HTTPへ公開しない。generationReady:false、load/predict/sample=NOT_READY。

## Review Focus

- receiptは取得済みでもpayload未受領なら実数値edgeは未受入。
- old target取消と新resource generationを区別し、元Promise終端前に解放・再利用しない。
- native recoverがownerを終了すること、解放失敗で保持するhandleを捨てないこと。
- LC hiddenとC vectorの5出力を保存後も区別し、意味をlatent/meanへ変更しないこと。
- observerによるtail Memory容量と、未知のhost/allocator/全体peakを混ぜないこと。

## Task 1: 原本と資材の受領

- [ ] distribution本文とexecution/capture/save-replay別のsource bytes・hash・長さを照合。
- [ ] 全100 build source・33 runtime closureと元receipt/gateを区別して固定。
- [ ] 非公開入力・参照・保存出力・モデルの存在と実hashを別に確認。未取得は明記。
Owner: n2_sources。記録: work/n2-tail-r7の取得receiptを管理採用記録へ取り込む。

## Task 2: 候補・宣言・規範

Files: reference/candidates/n2-tail/*、reference-loader.mjsのcatalogPath対応、
norm-bindings.mjs、norm-execution.mjs、adapters/n2-tail/declarations.mjsと対応試験。
- [ ] 欠落・既知不一致・未知規範・誤意味・誤side/時刻の負例をRED確認。
- [ ] 元catalog/既存recordを変更せず新tailを登録し、同evaluatorで判断。
- [ ] 素材未取得・数値receipt不足を契約互換性と別にBLOCKED/NOT_VERIFIEDで保持。
- [ ] scope内の既存規範回帰を確認。

## Task 3: 同realm owner adapter

Files: adapters/norm-required-n2-tail.mjsと管理制御試験。Task2のdeclarations APIを利用。
- [ ] strict引数・target取消・遅延旧結果・factory待機・release失敗の負例をRED確認。
- [ ] 既存queueのcancel/afterTerminal/releaseへactual ownerを接続。
- [ ] predeclared native/receipt/資源bindingと実数値validation後gateを照合。
- [ ] recoverはowner終了、新owner/generationでのみ新runを受け付ける。

## Task 4: 保存と保持環境runner

Files: tools/ai-connection/run-norm-required-n2-tail.mjs、必要なbrowser entry、保存helperと試験。
- [ ] 既存codecのLC/C hidden対応を実保存・読戻しで確認する。不対応edgeだけ保留。
- [ ] 出力5種とevidence/source/拡張を既存package/cacheへ渡し、改変や欠落を拒否。
- [ ] source/input/reference/output receiptを検査し、HIGH1/LOW3をowner gateで個別実行。
- [ ] 実資材不足ならnativeを開始せず、保持環境用の固定source実行手順と不足台帳を返す。

## Task 5: 統合・独立レビュー・配布

- [ ] 変更境界と既存LoRA bridgeを回帰。全runtime/testを凍結して最終suiteを一度実行。
- [ ] 独立audit/reviewの未是正事項を解消し、実行scopeと未受入edgeを分ける。
- [ ] API、完全SHA、差分、再現手順、原本／実行／保存replayの版を記録。
- [ ] 同branch/Draft PRへpushし、固定Git bytesとremote文書を読戻す。

## Decision ledger

- Ruling: 既存の専用作業branchを継続する。管理基点は完全一致でclean、mainへの実装ではない。
- Ruling: 元catalogを直接更新せず、別candidate catalogの3文書へ元record＋新recordを登録する。
  旧受入bytesを保ち、catalogPathだけをloaderの明示入力として追加する。
- Ruling: 非公開payloadを本環境で未確認のため、実数値edgeは保留したまま独立な制御・保存接続を進める。
  保持環境実行または実配置先はユーザーへ非同期確認済み。経過時間を資材受領と扱わない。
- ユーザー確定: 管理runner固定 → Diffusion保持環境で実行返却 → 管理が両SHA/Profile/証拠を照合受入。
  完成したsourceと検証はRESULT.md/RESULT.json、固定引継ぎはHANDOFF.md/JSONへ記録した。
  上のchecklistは着手時の計画として保持し、実数値実行・受入を未実施のまま完了へ変えない。
- Step3完了: Diffusion返却508d72と管理5c484/native a49の原bytes・Profile・証拠を照合し、
  HIGH1/LOW3数値・保持環境5出力E4・自然終端解放を限定受入。2metadata不備は原本を保持し、
  明示corrigendumをacceptance/へ記録。今後のwriter修正05c684は過去実行sourceと分離した。
