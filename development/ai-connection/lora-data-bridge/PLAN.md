# R6 — 82b DATAを管理必須入口と共同snapshotへ接続する

基点: `468bc04d5fc5a8e691410e763631cc545523d16f`。
今回のユーザー依頼に基づく作業計画。旧metadata probeや既存の数値合格を、
新しい正式DATA接続の受入として扱わない。本文は既存要件の記録であり、
ownerのnative契約・数値mappingを追加定義するものではない。

## 正本と責任

- DATA実装: `82b21f09cb63926543181b16f0e97ebc6b9fa6be` の
  `docs/shared/inference/lora/management-admission-inputs.mjs` と
  `numeric-declarations.mjs`。最新PR #2の配布headと実装commitを別に記録する。
- native SDK / owner adapter / merge kernelは `fc2789a0f649e33f15eb13750e6a983b5c52d170`、
  Diffusionは `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` の既存採用pinを維持する。
  DATA配布commitをnative pinへ代入しない。
- catalogは `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` / `1.0-draft.1`。
  判断は既存 `evaluateEdge`、取引は既存queue / snapshot、数値とmappingはownerが所有する。
- code_review担当が最小bridge、examples担当が実native共同harness、baseline担当が
  原本・配布bytesの固定、rootがnorm bindingと統合・共有を担当する。
  auditは実装を変更せず、完成した実ファイルと証拠を原要件へ照合する。

## 作業と確認する境界

1. [ ] **P0: 正式DATAの原本を固定する。** 実export・署名、3phaseの入力/出力、
   full commit/path、実bytes/hashを確認する。必要な2moduleを使う場合は原本との
   byte同一性と管理deploymentを別記録にする。未取得本文を報告から補作しない。
2. [ ] **最小の外側bridgeを実装する。** DATAの `preflightInputs()` 全patch/全dtype、
   `checkpointInputs()`、`postpublicationInputs()` を、元情報を落とさず
   管理必須入口のdeclaration / validated / publishedへ対応付ける。
   既存standalone / legacyと旧数値合格scopeを維持する。
3. [ ] **実checkpointをcommit gateへ結ぶ。** 実owner validationと現在の
   `snapshotTarget` を渡し、`phaseBinding.bound`、outer target、manager request/revision、
   native local revisions、resource generation、source/plan/両registry/reference/gateの
   対応を確認する。欠落・旧cohort・未来receipt・偽のphase bindingはnative進行を止める。
4. [ ] **実公開後に正式DATAを照合する。** snapshot coordinatorの実公開capability、
   native stage receipt、独立copy所有者、元queueのterminal/release、prepared解放を
   同じtargetへ結ぶ。postpublicationではstaging時のcurrentnessを使い回さず、
   active published lifetimeを確認する。公開後監査失敗を「公開されなかった」と
   読み替えず、既存recoveryで再利用を止める。
5. [ ] **共同snapshotを実native境界で確認する。** 原本のDATA factoryと固定native
   SDK/Hike/ORT/consumerを使う。同一jointでHIGH native成功後にLOW失敗を発生させ、
   新joint非公開、HIGHの実復帰、双方の元Promise終端・owner解放・再利用状態を観測する。
   cleanup失敗時は資源を保持してrecoveryを要求し、仮の `restored:true` で代替しない。
6. [ ] **証拠・回帰・共有を揃える。** 失敗条件を先に再現し、最小修正後に同じ検査と
   変更境界の既存回帰を確認する。API、再現手順、DATA/native/管理の完全commit、実行source、
   evidence scopeと未受入を保存し、同作業branch / Draft PR #7へpushして固定sourceを読戻す。

## 受入時に分けるもの

- 正式DATA factoryの3phase出力が実管理gateを通ることと、metadata投影fixtureの成功。
- 実native取引の接続と、入力が合成source/baseである数値scope。
  今回のcontrol検証を実LoRA原本・真正baseの新規受入と呼ばない。
- ownerの既存6数値receiptの再利用と、今回の実行回数・出力比較。
  新しい数値演算・独立judge・許容差決定を管理に追加しない。
- DATAのartifactはselected weight edge。既存output16-vector packageを
  その `N-ARTIFACT` 証拠へ流用しない。必要な保存scope以外へ拡張しない。
- 診断snapshotの公開と、full model / 全target / genuine-base受入。
  `generationReady:false` を維持し、NN・全4原本・全base再取得を開始条件にしない。

## 完了条件

正式82b DATAの実出力が、実owner取引と管理の必須3phase入口へ接続され、
共同失敗復帰を含むtarget・revision・ownership・terminal/releaseを追跡できること。
候補受領、旧probe、片側投影、fake fixtureだけで「正式受入」としない。
main merge / Pages deployは別工程。実装checkpointと最終配布commitも区別する。
