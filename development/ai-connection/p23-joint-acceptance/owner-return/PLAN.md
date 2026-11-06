# 2026-11-02 JST 返却成果の取得・照合

管理基点は `f34bf10a67c91f462ab46dec033eaeb2110facf1`、固定実行sourceは
`8849891f19124df31847bd691503c2491278eaa8`。今回の指示は既存manifest・receiptに基づく
取得確認と返却成果の管理受入。取得確認のための再推論・再exportは実施しない。

## 対象と判定の境界

1. VAE `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` のupdated-884正常／取消復帰、
   実RGB、現在3mean packageとE4読戻しを受領する。取得bytes/hashのACKとP2限定admissionは別記録。
2. LoRA `dd95ed05f058930a391f015c11b9a2b963a42db5` の6ケースは管理60d16での実行として
   照合する。observer実行sourceと配布commit、native pinsを区別する。
   884の新E4保存読戻し、改変拒否、事前参照検査を旧結果へ付け替えず、必要な追加範囲を返す。
3. Diffusion `7ee36228030ba3bb544a90b1d4b528702a7bae32` のP4を新候補として取得する。
   旧固定N2の正本ADMISSIONと採用scopeは保持する。公開module/WASM/receiptの実受領と、
   private入力・独立参照・保存payloadの未取得を区別する。新P4の管理実dispatchは今回実施しない。
4. 固定管理source、P2/P3runner、返却条件、source照合記録を各ownerへ返す。
   返却には配布SHA／実行sourceSHA／取得path・bytes・SHA-256／確認scope／未取得・未受入を含める。

## 記録と変更範囲

既存 `p23-joint-acceptance` を入口とし、今回の受領記録はこの `owner-return` に集約する。
既存のローカルBLOCKED試験や元receiptの値は当時のscopeで保持し、最新受入への参照を追記する。
候補台帳にも最新受領記録の参照を加える。native pin、既存runtime/APIと規範catalogを変更しない。
実施するのはGit原本取得、file bytes/hash、source版、保存packageの既存readerによる読戻し、
trace／receiptの対応照合。private payloadを取得していない場合、そのhash照合はownerの既存証拠と
明記し、この環境の再読実績にしない。

取得・P2・P3・P4の独立担当を分け、別の読み取り専用監査が受入scopeと最終差分を確認する。
rootが統合、GitHubへのpush、Draft PR更新、ownerへの明示返却を行う。
既存合格を再利用し、新しい数値演算・対象mapping・独立互換性判定器を管理へ追加しない。

## 完了条件

各原本に到達できる完全SHAとpath、全fileのbytes/SHA-256、照合結果、scope別admission、
再現手順と未受入を記録してpushする。ownerへの返却コメントを送信し、その読戻しを確認する。
契約一致で数値証拠のみ不足はCOMPATIBLE／NOT_VERIFIED／BLOCKED、未知必須契約はUNVERIFIED。
generationReady:false、load/predict/sample=NOT_READYを維持する。merge・Pages公開は行わない。
