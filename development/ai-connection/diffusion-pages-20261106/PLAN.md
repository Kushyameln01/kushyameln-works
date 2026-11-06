# Diffusion 管理画面の公開計画

ユーザーの2026-11-06指示を実施する。main:/docsへ公開し、公開URLでFile・設定・実行・取消・結果・保存を確認する。PRやlocalhostのみを完成としない。

- [x] 現main／Pages設定と管理入口を取得。基点main=`70dcf73a1b6338e5788603b45e82c98b86aa055a`、legacy main:/docs。既存公開`ai-connection/`は404。
- [x] 既存管理の参照copyと実Diffusion経路を確認。参照copyを生成の証拠とせず、実公開APIを呼ぶ操作欄を既存管理へ追加する。
- [x] ownerの既存sampleを拡張し、canonical shapeからzero targetと標準正規F32 noiseを供給する。noise明示経路とcontext順序は保持する。noise既定はWebCrypto＋Box–Mullerのhost初期化profileで、seed再現・PyTorch/Comfy乱数一致は保証しない。数値差分だけを独立比較する。
- [x] 最新の実公開API／Workerと依存sourceを、既存のnative source採用方式で管理へ接続する。共有codec等を他の既存モジュールへ上書きせず、相対URL構造を保持した固定native treeを採用する。load/predict/sample・weight-port・取消後reload・save/readを正本とし、新transportを作らない。
- [x] ユーザー用のFile／設定／sample／取消／reload／結果／save/read操作を追加する。shape計算はownerの共有関数とcheckSupportへ委任し、初期tensor・noise・scheduler・raw復元を管理で計算しない。
- [x] 変更境界のimport/build、UI通常系・例外、取消・解放・保存を確認し、mainへ反映してPages build完了を確認する。
- [x] 公開URLを開き、保持済みFileを実選択して正常系・取消／reload・保存／実File読戻しを確認する。関連する小入力の単一NN試験以外の重い試験は起動しない。
- [x] 公開URL／main完全SHA／Pages結果／完走操作と条件／未対応範囲を記録する。

通常Pagesは1-thread/no-COI、4-threadは実COIとSharedArrayBufferが揃う環境のみ選択できる。全1095重み・全40block・HIGH3→LOW3・元schedulerとsample復元は既存ownerを維持する。原寸の旧終端は取得不能のままで、同じ重い試験を再起動しない。原寸LOW／6更新・全工程資源を小入力や公開UI確認から受入済みへ変更しない。

既存のN5/Text L3 raw sample原本は非公開受渡しで再利用する。公開repoにraw payloadや非公開取得URLを同梱しない。実LoRA送付・全体モジュール運用実験・VAE decodeは今回のUI境界確認へ含めない。

公開前確認：ownerの関連109試験、新初期化の独立8,264値、build154source、採用tree158file、管理6試験、canonical入口とnative factoryの同一性、全新入口の静的参照、独立レビューを確認した。公開操作の完了は未記入であり、次工程で実測する。

統合時にmainが9a80078757da9be3ca152e4205bf73fdea363e9fへ進んだため、そのText/VAE/media/実モジュール管理を保持してmergeした。実モジュールフォームもnoise/targetを管理で作らずownerへ委任するよう揃え、既存native namespace/weight/P4 exportsを保持した。管理native5・adapter17・mean2・panel6・product13の変更境界試験が通過。公開runnerは実URLのTLS検証済み応答だけを使用し、application API注入やlocal contentで代替しない。
