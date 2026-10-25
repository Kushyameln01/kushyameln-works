# Parameter Template 1.2.0 検証記録

2026-10-25 JST。公開前の候補検証記録です。公開commit、Sites版、公開HTTPSの回収結果は公開後に追記します。

## 変更契約

変更していない原本`DecodeParameter_Template.unitypackage`から同梱Templateを再生成し、元の文字列値を完全一致で一度だけ変換します。

- `v2/Parameter` → `Decode/Parameter`
- `Smooth/Parameter` → `v2/Parameter`
- `Smooth/Parameter_Function`は保持。prefix置換は行いません。
- `v2/Parameter0/1/2/4/8/Negative`は保持。

元の値に対する一度のlookupで変換し、新しい`v2/Parameter`を再変換しません。改訂Templateでは4Treeと6Clipが変わり、6ClipのFloat/Editor曲線属性と数値binding CRC32を更新しました。生成時の`Parameter`→入力名leafの変換は、これらすべての名前へ従来どおり適用します。

`BUILD_ID`は`parameter-template-1.2.0`。JSONは`schemaVersion: 1`を維持し、`templateRevision: 2`と`valueRemap`を追加しました。`sourceSha256`は原本の由来を示す値のままです。coreは旧revisionのJSONを拒否します。

UI、入力条件、表示名の規則、2Root/14Childの配置、16Treeの独立asset、30Clipの内包、数値・接続、GUID発行、GNU tar/gzip writerは維持しています。変更前から未参照だった`Decode_All.anim`は引き続き収録しません。

## 固定した入力と生成Template

| 対象 | SHA-256 |
|---|---|
| 原本unitypackage（14,893 bytes、変更なし） | `9b22ae3d088ceef597b9ac98015da917599842ab3f9932859c658ddd34c99c09` |
| 改訂`template.json` | `d11aa908b86a75021a7be4ad0367a45cb3206346d1a370202a4d25aaab3be3f1` |

原本の再読み取り後もSHA-256が一致しました。抽出scriptの`--check`で、同じ原本からの16Tree/20Clip再抽出が同梱JSONとbyte一致しました。

## 実行した検証

1. 新期待値を先に追加し、旧Templateの`Parameter_Smooth`が`v2/Parameter`のためNodeがFAILすることを確認。
2. 独立Pythonの期待値を更新し、旧1.1.0出力が同じTreeの許容差分比較でFAILすることを確認。
3. 改訂後、Node v24.22.1で7生成がPASS。対象はEyeLidLeftを2回、JawOpen、ParameterTest、0Eye、Eye-Lid、日本語「まぶた」。完全一致変換、非連鎖、bit suffixと`_Function`の保持、固定CRC32、旧revision拒否を追加検査。
4. 生成した6種類のファイルを、独立Pythonで元unitypackageと比較してすべてPASS。2folder/18entries、16Tree（2Root/14Child）、30内包Clip、34Clip参照＋13Tree参照、全対象値、CRC32、新GUID、数値・他フィールド保持、GNU tar/gzipを検査。

検証コマンドと抽出手順はREADMEに記載しています。Python verifierは生成処理や改訂JSONを読み込まず、元の原本から期待値を計算します。

| ローカル生成の入力 | 今回の出力SHA-256 |
|---|---|
| `v2/EyeLidLeft` | `1ca5c1f1447ae59349acc2b75d4df6ed712aedbf80adb992f5a899f47ecd070d` |
| `v2/JawOpen` | `eb0acd2418d6e22cb4f5066abf82cb8da077013c6bf5042453e60aa5e844b5d3` |
| `v2/ParameterTest` | `d4fd05548ee8665de2764928cbfffcdc6d9b4a378e2aa2cb74383fc6d0ea6522` |
| `v2/0Eye` | `43a4398447fae995d6ece32eb7ba4dc2b75449b178354d4dcdb1ef514ed0fbea` |
| `v2/Eye-Lid` | `f412e5111752b24f1b9683b28bfb2fe4e9b7630e7a8434dd1c58f3ccab77bb28` |
| `v2/まぶた` | `08fd19a58e2966541301ec6da1a5d0194e55d5f53abeb2a54124a9610725102c` |

GUIDは生成ごとに変わるため、この表は今回の実ファイルの識別値であり、次回生成とのhash一致を要求するものではありません。

## 未確認

公開HTTPSでのファイル回収は公開後に実施します。Unity ImportとAnimator/VRChat実動作は未確認です。Node/独立Pythonの合格をUnity実行の合格とは扱いません。

## 配布前の確認

- Pages基準commitは7712b20139da837c14161e0ff877b239e0871837、Sites基準sourceは811dcfa5fbb3ec342b9142547b71b2c8f35add54（第93版）。各基準版の他機能を保持。
- 両配布先のparameter-template公開変更はcore.mjsとtemplate.jsonの2ファイル。Pagesでは新mainの一括生成機能との依存を保つため、shared/compute/parameter-template-task.mjsの固定Template SHAとpool-worker.bundle.mjsも同期。原本と開発用scriptは公開静的集合へ追加しない。
- Pagesの厳密export通過。Sitesのofficial build通過（340承認静的ファイル、8 reviewed generated JS、396 artifact files）。
- Cloud browserの候補HTTP画面でv2/EyeLidLeftを入力し生成完了（16Tree/30Clip）を確認。download完了通知の待機は15秒でtimeout。HTTP通信原因やファイル保存成否は未判定。公開HTTPSでの実回収と区別する。

## Pagesの共有Workerとの依存確認

新mainのDecode/Smooth Builderは旧Template SHAを固定していたため、変更前integrationでは3件中の共有Template経路だけが「Templateの版を確認できません」でFAILしました。taskのSHAを改訂JSONに合わせ、既存build scriptと固定esbuild 0.25.11でbundleを再生成しました。bundleの変更はBUILD_ID、revision検査、固定SHAの3箇所です。

その後、`node --test tools/decode-smooth-builder/test-*.mjs`の16テストがすべてPASSしました。共有Template Worker→Parameter Registrar→実際のAnimator Integrator Workerを通る統合検証を含みます。再生成後の厳密static exportも通過しました。Sites第93版にはこの新機能が含まれないため、Sitesへ追加移植はしていません。

## Sites公開後の確認

Sites第94版のsource commitは`2c68f212951cdff7de3acacf5cf3108ddbf4ef1a`、deploymentは`appgdep_6ade07ec76d88191b168908f04167672`。native deploymentの状態は`succeeded`でした。

公開HTTPS画面から`v2/EyeLidLeft`を入力し、生成・ダウンロードした実ファイルを独立Pythonで検証してPASSしました。出力SHA-256は`863d301a915c9bddb1c496b3bb76bc2546aef3d67325093e7e1363f04f68e5cb`です。完全一致変換、bitと`_Function`の保持、18entries、16Tree、30Clip、47参照、CRC32、GUIDと許容差分を検査しました。
