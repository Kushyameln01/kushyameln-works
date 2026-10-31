# E6追補 — GitHub受領と非正方形mean profile

2026-10-31 UTC。開始sourceは当方 `438972f30242e0a3bc66edb8591f38eaa0fcd384`。過去のE6 `RESULT.md` / receiptの「実manifest/mean未受領」は当時の履歴として保持する。本追補ではGitHubに追加された原本を実受領し、同要素数でも別shapeのprofileを明示的に拡張した。新しいモデルexportやVAE NN実行は行っていない。

## GitHubから取得した正本

`git fetch --no-tags origin codex/e6-vae-rect codex/g1c-vae-v1` が成功した。採用する相手sourceは **`7e091192232fae36367b550ca5fada88915a0703`**、その履歴の `2c171a09ccda65c54899f322ae490f1bfcaac6fb` にF1 fixtureが追加されている。取得元repositoryは `https://github.com/Kushyameln01/kushyameln-works`。ローカルpathの提示だけを受領成功と扱っていない。

12ファイル/91,470 Bを `received-7e091/` に固定取得した。`acquisition.json` に完全commit/path、Git blob SHA-1、bytes/SHA-256、GitHub URLとprofile照合を記録し、独立reviewerも同じGit objectsとbytesを照合した。

| 実受領物 | profile / shape / SHA-256 |
| --- | --- |
| F1実manifest | `wan21-raw-f32-1x16x16` / `[1,16,1,2,2]` / `fa219b8e7e0b6b0be37c598d3dfedadb29505ad1407fe3f8270d8655dd46828c` |
| Rect実manifest | `wan21-raw-f32-1x16x32` / `[1,16,1,2,4]` / `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a` |
| 実VAE保存mean WKTと元FP32 .f32参照 | F1 64値とRect128値。WKT全file/payload hash、meaning `raw-posterior-mean`、VAE hash、context frame/時刻を検査 |
| API / G1C mapping / E6 RESULT / CURRENT-PEERS / receipts | 現source/APIと、過去報告・最新限定結合のscopeを読取り照合 |

保存された実meanと元FP32参照との差はF1 `8.344650268554688e-7`、Rect `8.642673492431641e-7`で、相手記録と一致した。これはGit受領fixture間の比較で、当方がVAEを再実行した数値ではない。

VAE model hashは両方 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。model/precision/schemaは元G1C契約を保持する。`54bfead…`から`7e091…`への `tensor.mjs/vae.mjs/vae-api.mjs` のGit差分はない。API文書は更新されている。テストで明示指定したG1C codec source SHAは `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b`。

**約498,676,842 Bのgraph/conv2 bundleは未受領。** 取得できる小manifest/参照fixtureが増えたことを、非公開graphの取得・再export・再推論へ読み替えない。

## source・合意・実装・共同検証の区別

| 範囲 | 今回の状態 |
| --- | --- |
| 共通仕様/管理 | 1.1の共通規格とnative版を分離し、GitHub相互取得方針に従う。相手のmanager a268取得・Node試験報告は受領したが、当方の新たな管理全browser再試験ではない |
| LoRA | 既存実LoRA×base/PARTIALや寿命の過去報告は別担当/別scope。本mean拡張の成功件数に合算しない |
| VAE | peerがF1/Rect個別profileを実VAEで受入れた報告と、小manifest/実保存mean/FP32参照の当方受領を区別 |
| Diffusion438の64 | peer7e091が固定438をGitHub取得し、実64 mean→owner Hike→明示G1C codec→owner Hike→実VAE decode一回を検証した報告を受領 |
| 当方の現在の検証 | 受領実meanを実Hikeでnormalize/restoreし、明示G1C codecの保存/metadataと独立JS/Python参照へ比較。VAE decodeは新たに実行していない |
| 今回のRect追加 | rootへprofile/専用ABI/guard案を報告し承知を受けた範囲で実装。相手担当全員の契約採用やRect実decode joint受入はまだ主張しない |

peerの64限定結合は [CURRENT-PEERS.md](https://github.com/Kushyameln01/kushyameln-works/blob/7e091192232fae36367b550ca5fada88915a0703/development/inference/e6/CURRENT-PEERS.md) と `current-peers/receipt.json`。raw decode全768 RGBの最大差 `1.3709068298339844e-6`、元gate `2e-5`以内という**相手の実行証拠**である。owner直接ES module→明示G1Cファイル境界→VAE UIのscopeであり、Diffusion RPC/全管理browser/実generated sampleではない。当方の新試験と混ぜてfresh NN再実行済みとしない。

## Rect専用実装と厳密な境界

RectのRGB `[1,3,1,16,32]` に対応するmeanは **`[1,16,1,2,4]` / 128値**。旧F5 `[1,16,2,2,2]` も128値だが、時間/空間profileが違うため互換扱いしない。変更前のshape拒否を `rect-red.log` に保存した。

- `WAN21_RAW_RECT_PROFILE` / `requireWanRawLatentRect(tensor,{vaeModelSha256?})` を追加。旧128/F5 guard、64/F1 guardはそれぞれのshapeのまま。
- `NormalizeRawMeanRect` / `RestoreRawMeanRect` を専用exportとして追加。count128・positions8・channel `i/8` を固定する。Hostはexactshape/id allowlistで専用exportへrouteし、count一致だけで選択しない。
- sourceの16channel mean/stdとf32演算順、versioned mean意味 `wan21-normalized-posterior-mean:v1`、VAE producer、所有contextコピーを維持。64へのpadding、旧F5へのreshape、mean→generated relabelを行わない。
- ABI/registryを **`wan21-raw-mean-f32-v3`** へ更新。旧4exportの契約と数値を維持し、1024 B arenaを3profileで再利用する。public API worker/capability/共通build更新はroot所有。

旧試験のinvalid-shape fixtureが今回のRect shapeそのものだったため、承認したprofileを拒否する期待値が1件失敗した。REDを `rect-legacy-contract-red.log` に保存し、無効の同128値shape `[1,16,2,1,4]` にnegative fixtureを更新した。旧strict128 guardが実Rectを拒否する別試験は残し、元の旧128数値hashも維持した。

## 実検証と制限

| scope | 結果 |
| --- | --- |
| Node Rect受領/変換/guard/ABI/反復/codec7ケース | PASS。受領実F1/Rectの全64/128値を比較 |
| Chromium154.0.8037.57、実Hike・明示G1C codec、Rect7ケース | PASS。loopback GETのみ、page/console/blocked0 |
| 旧F1 10ケース・旧F5 10ケース | Node/ChromeでPASS。従来合成fixtureのnormalized/restored payload hashを完全維持 |
| 既存interop10ケース | PASS。元Text/mask/model/old codec/port能力scope |
| 独立Python struct-f32参照 | 受領実meanの全normalize/restore hashがNode/Chromeと完全一致 |
| 受領実mean roundtrip | F1 maxAbs `1.1920928955078125e-7`、Rect `2.384185791015625e-7`。事前gate `2e-6`以内 |
| Memory/arena | 1,114,112 B / 1024 B一定。input/output各512 Bのdisjoint slots。OS RSS peakや全PID回収の測定ではない |
| metadata | 実fixtureのcontext/model/meaning/shapeを所有コピーし、明示G1C codecで保存/読戻し。現在owner旧codecを更新した意味ではない |
| reviewer | 受領12file identity、exactshape/専用route、source/build hashes、Node7/10/10と独立Pythonを確認。阻害事項なし |

```sh
DIFFUSION_TOOLCHAIN=/path/to/pinned-toolchain python docs/shared/diffusion-models/latent-space/build.py
node docs/shared/diffusion-models/latent-space/test-rect.mjs
node docs/shared/diffusion-models/latent-space/test-f1.mjs
node docs/shared/diffusion-models/latent-space/test.mjs
node docs/shared/diffusion-models/test/interop-node.mjs
python docs/shared/diffusion-models/latent-space/test-rect-browser.py
python development/ai-connection/e6/reference-received.py
```

Hike source SHA-256: `bd51d724b5a4fbad545670674701f316343a17e63916a57daf144bd763cfd81e`。WASM SHA-256: **`bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d`**。compiler/WABT/source/host/boundary/builder/WATはkernel-owner build recordにある。結果は `rect-*.json`、独立全値参照は `reference-received.json`、まとめは `rect-receipt.json`。

受領状態・静的契約一致・数値小境界・peerの実decode報告・全generated/sampleの成立は別に保持する。Rect実VAE再decode、native legacy保存wrapperのmetadata完全保全、共通管理全browser工程、本番shape、実generated sample、load/predict/sampleはこの成果から解除しない。重みdownload、巨大export、NN再推論、commit/push/公開は本担当の今回工程では行っていない。
