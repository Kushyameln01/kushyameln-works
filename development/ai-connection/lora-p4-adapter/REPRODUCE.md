# 再現手順

この手順は `controlled-caller-input-n2-k4`、light/LOW cross-attention Q先頭4行・全5120列と明示bias4のPARTIAL診断である。自然P2/N2 producer、実Text L512、全model、生成を含まない。元P2/Q16の受入を新scopeへ付け替えない。

## Source

- LoRA実行source: `a80db72feea60b9bd69e292e4716665c6f0ee77f`
- Diffusion consumer/provider/registry/stageとPython reference: `7ee36228030ba3bb544a90b1d4b528702a7bae32`
- 管理外側invocation queue: `8849891f19124df31847bd691503c2491278eaa8`
- 管理output16 E4追加試験は別実行であり、[固定884の手順](manager-884/REPRODUCE.md)と[prepare境界](manager-884/E4-PREPARE-BOUNDARY.md)を使う。

LoRAを上の実行commitへcheckoutし、peerもそれぞれの完全commitで別checkoutに置く。最終配布commitで実行sourceを上書きしない。hostはGit blobとworktree、peer commit、oracle作成sourceを照合する。Node、NumPy、Chromium、Playwrightが必要。PlaywrightとChromiumの場所は `LORA_PLAYWRIGHT_MODULE` / `LORA_CHROMIUM_PATH` で明示できる。

## 入力

入力は利用者の端末からブラウザへ選択するローカルFile。今回の再現fixtureは次の1 LoRA Fileと真正LOW baseを使う。他の3 LoRA原本は必要ない。

| 入力 | bytes | SHA-256 |
| --- | ---: | --- |
| Bernini-R_LightX2V_low_noise.safetensors | 1,244,141,856 | 86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b |
| Bernini_LOW_fp8_e4m3fn_scaled.safetensors | 15,574,833,216 | ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3 |

baseの全体hashは既存取得receiptの証拠を再利用する。oracleは同receiptのdestination/size/mtimeNs/dev/inoと保持Fileを結び、新loadのheaderと選択rangeを検査する。別のcopyへ歴史receiptを付け替えない。baseが変わった場合は新しい原本取得・検証receiptが必要。browser hostはbase全体をArrayBuffer化・HTTP転送・再hashしない。

LoRA Fileはbrowserで新load時のheaderと必要range、全体hashを検査し、同一immutable File内だけでhash cacheを使う。全4原本の再取得・全hash再計算は前提にしない。

## 変更境界の合成試験

```sh
node --test tools/lora/test-p4-adapter.mjs tools/lora/test-p4-block-limits.mjs
python tools/ai-connection/test-p4-lora-reference.py
```

前者は実Hikeと合成base/native feed/fake forwardの制御30件。後者は独立参照wrapperの合成14件で、いずれも実base数値比較の代用ではない。既存SDK/v1/旧Q16の関連回帰と実証済みP2は別の元scopeで保持する。

## 独立期待値 A/B

全ての変数は実在する私有pathへ設定する。出力directoryは新規かつsource repository外にする。

```sh
python tools/ai-connection/p4-lora-reference.py \
  --peer-root "$P4_DIFFUSION_ROOT" \
  --base "$P4_LOW_BASE" \
  --base-receipt "$P4_BASE_RECEIPT" \
  --file "$P4_LIGHT_LOW_FILE" \
  --expected-sha256 86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b \
  --out "$P4_NEW_ORACLE_OUT"
```

Aは独立storage decodeとNumPy binary64低rank積。biasは固定loaderのF32乗算・加算規約を独立実装する。Bは固定7eeの数値coreへA由来F32 patchを渡して各10240出力を作る。0/+1/-1とgateを原本演算前に固定する。詳しくは[CONTROLLED-ORACLE.md](CONTROLLED-ORACLE.md)。期待patch hashと実Hike prepared patch hashは別であり、許容差内のbit差を同一hashへ書き換えない。

oracle出力のindependent-patches/base-weight/weight参照には原本由来の数値が含まれるため私有のままにする。公開するのはidentity、scope、source、比較結果と選択したactivation出力で、モデルや重み配列をGitへ追加しない。

## 実File・P4共同実行

```sh
node tools/ai-connection/test-lora-p4-real.mjs \
  --base-file "$P4_LOW_BASE" \
  --file "$P4_LIGHT_LOW_FILE" \
  --oracle-root "$P4_NEW_ORACLE_OUT" \
  --diffusion-root "$P4_DIFFUSION_ROOT" \
  --manager-root "$P4_MANAGER_ROOT" \
  --out "$P4_NEW_NATIVE_OUT"
```

hostは所有するChromiumへCDPのlocal File入力を設定する。モデルをWeb配信せず、sourceと明示oracle allowlistだけをloopbackで配信する。各実prepared blockのSHA、実operatorが消費したtile/patchのSHA、package hash、native epoch、外側queue target/管理revision、SDK局所revisionを別々に保持する。

成功statusは `PASS_LORA_P4_REAL_PARTIAL`。強度0/+1/-1、再適用、実数値validation失敗、prepare途中取消と実native read後取消、各復帰、source capability解放後のactive保持、不変base復帰を確認する。失敗試行のdirectoryを削除・上書きせず、修正後は新source commitと新oracle/native outputで試行を分ける。

取消はbounded Hike/ORT呼出し間の協調停止で、瞬時停止ではない。元queue targetで取消し、元Promise終端、afterTerminal、resource releaseまで待つ。prepared/candidateを解放してもactiveがnative私有F32 bytesを保持し、内部run leaseはSDKの所有権leaseと別である。base復帰後とdispose後のcounterを確認する。

RSSはhost Node＋所有Chromium treeのPID/starttimeを500ms間隔で観測する。sample和はshared page重複と取りこぼしを含み得るため、OS/device/allocator/GC/全工程の厳密peakではない。nativeの固定WASM capacity、保持bytes、累積copy trafficと混同しない。

## 受入境界

管理の実queueを使う取引と、管理P4規範/catalog/三段階hook/snapshotの正式採用は別。今回のP4 harnessは後者を実装・受入したと表示しない。旧Q16の正式bridgeへ新mappingを偽装せず、LoRAにmean入出力APIや二組同時合成を追加しない。`coverage:PARTIAL`、`generationReady:false`、`managerSnapshotPublished:false`を維持する。

再現した数値合格、返却物のGitHub取得確認、対向担当本人のACK、merge、Pages公開はそれぞれ別に記録する。
