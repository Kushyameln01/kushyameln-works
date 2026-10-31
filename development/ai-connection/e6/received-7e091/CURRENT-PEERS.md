# PR公開後に取得した対向版と64要素結合

旧E6受入commit `c0fcbb785b5a98127230fead1d57302ba38e04b8` の非正方形数値受入は維持する。公開が進んだ後、管理とDiffusionの新しい実ソースを追加取得し、以前の未取得/非対応状態を版別に更新した。元の取得エラー・測定・receiptを事後に成功扱いへ書き換えない。

## 管理a268：E0取得とE2の範囲

固定sourceは[`a26879057d169cb2eecff30503d64adba5057c52`](https://github.com/Kushyameln01/kushyameln-works/tree/a26879057d169cb2eecff30503d64adba5057c52)、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。5種common schema、descriptor/validator、Text/VAE adapter、外側packageを実取得し、archive・Git blob・byte hashを照合した。旧21e77の422/404は初期観測として残すが、このa268版を未取得とはしない。

実G1C codec（SHA `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b`）を明示指定し、descriptor26/26、adapter13/13、package34/34、native-owner2/2が合格、skip0。native-ownerは実clientと実Node Workerのtransport fixtureであり、NN出力の検証ではない。Textのplain/ID、mask/Tokenizer、producer列・decoder、context配列、evidence/optional拡張に重要なmapping不整合は見つからなかった。

管理packageの実装責任は管理側のままで、こちらへ複製していない。これらを実Chromiumの全管理工程や生成snapshotの受入と合算しない。本文・取得証拠・case別ログ識別は`current-peers/manager-*`に保持する。

## Diffusion438：64要素meanだけの限定結合

固定sourceは[`438972f30242e0a3bc66edb8591f38eaa0fcd384`](https://github.com/Kushyameln01/kushyameln-works/tree/438972f30242e0a3bc66edb8591f38eaa0fcd384)、[Draft PR #6](https://github.com/Kushyameln01/kushyameln-works/pull/6)。buildは`diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`、追加Hike kernelは`6b9cb9f0617da373e63275354ac42f7843fb455019ed3988df7364173bc775b4`。

f522の128専用kernelを64と同一視したのではなく、ownerが追加した実64 export/ABI/hostを呼んだ。16 channelの対応、旧確認済み128 kernelとのchannel別bit一致、実64 meanの正規化/復元、context所有コピー、既存128経路の維持と新rectangleの拒否を、計5件の小規模実Hike検査で確認した。数値拡張をVAE側では実装していない。

owner438は別branchの固定原本として取得・呼出しした。このVAE branchにDiffusionの新runtimeをmergeしたわけではないので、同名APIだからと既存main/相対URLへ接続しない。再現手順も438の実source/kernelを別directoryへ取得して選択する。

実64 mean→owner正規化→**明示したG1C codec**で保存/読戻し→owner復元は、最大誤差`1.1920928955078125e-7`（gate `2e-6`）、contextのframe/時刻配列・model識別を保持した。`restored-still64.wktensor`は入力meanの意味/producerを維持し、generated sampleへの改名をしていない。

新しい数値境界に必要な差分として、既存16×16 bundleを再exportせず、この復元meanから**raw decode一回だけ**を実VAE UIで実行した。既存の元VAE PNG mean→decode参照を再利用し、全768 RGBの最大誤差は`1.3709068298339844e-6`、RMSE `2.308274956811821e-7`で、元の事前gate `2e-5`以内。参照再計算、encode、Text、旧棚卸しは実行しなかった。

Hike conv2は17 call、`normalizationApplied=false`、contextは保存読戻しでも一致。Worker1作成/1終了/live0。観測child11件、3件wait回収、live0/zombie0/errors0。browser sampled PSS最大1,322,157,056 B、decode操作5.234 s（download/save前まで）、helper全体8.906 s。これはowner直接ES module→G1Cファイル境界→VAE UIの限定結合であり、Diffusion RPC/全管理ブラウザ工程の結合ではない。

## 残る境界

- 非正方形 `[1,16,1,2,4]` は438でも未対応。128要素一致で旧 `[1,16,2,2,2]` へreshapeしない。
- owner旧codecはcontext/Tokenizerを落とし、legacy writer/guardは旧128 profile限定。直接mean変換のcontextコピー追加と、storage完全互換を混同しない。明示G1C codecと外側descriptor/evidenceを保持する。
- native `.wktensor`だけでsnapshot/owner/graph/build/trace/evidenceが全て保存されたとしない。管理packageは管理の版付き実装を使う。
- 実generated sampleのproducer/復元/decode、実参照媒体、81frame、全sampling/負荷改善はE9以降で未受入。対向本人の新たなACKと、こちらのsource取得・実検査を別状態にする。

詳細と現状態の追補receiptは`current-peers/receipt.json`。元の`receipt.json`のprofile数値受入・初期取得状態は、その時点の記録として維持する。
