# 21 Profile台帳・管理照合規範・mapping正本の追記

1.1-draft.2／2026年10月31日 JST。本追記はmappingの責任分担とProfile・規範の参照先を明示する。旧本文にある固定commitや到達状況は当時の記録として保持し、現時点の採用組合せと各owner最新版は[Profile総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)で区別する。全工程の受入を追加認定する改訂ではない。

## mappingの正本ownerと旧bridge

LoRAのfull shapeから選択sliceへの対応、SDK/native registryの対応、sink/consumerの取引mappingは、LoRA所有の `createDiffusionDiagnosticAdapter`（`lora-diffusion-diagnostic-adapter/0.1`）を正本とする。Diffusionはnative registry/provider/sink/consumer・base復号・実feedを所有する。管理の `createAdoptedLoraAdapter` はowner adapterを注入し、request/revision/resource bindingを担当する。管理は同じ数値mappingを再実装しない。

**旧管理bridge `createDiagnosticLoraBridge`（`works-lora-diagnostic-bridge/0.1-draft.1`）は固定sourceの回帰用として区別し、同じ実行経路でmappingを重複させないこと。** 旧bridgeとLoRA正本adapterを積み重ねない。回帰経路の成功は現行経路の受入へ移さず、経路・owner・版・scopeを記録する。正本ownerの一元化は対応関係ごとに行い、他moduleの独立した意味変換まで管理へ集約しない。

## Profile・規範・数値規則の関係

shape・数値実行・正規化・loader規約は別Profileとして版管理し、総合管理用 `catalog.v1.json` で参照とhash・採用組合せを束ねる。[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)は管理が判断する事前定義条件、[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)は数値ownerと規範策定者がその条件を決める根拠とする。管理は公開済み規範を照合し、モデル式・正規化・低rank計算や新しい許容差を実行時に導出しない。

新台帳のrecord/norm/rule IDはnative IDと区別する。native APIや単独moduleの内部型へ台帳フィールドを強制追加しない。必須契約・識別が不明なら依存edgeのUNVERIFIED、既知の不一致はINCOMPATIBLEとする。数値gateや受入証拠のみ不足する場合は契約判定を維持し、検証NOT_VERIFIED・準備BLOCKEDとして記録する。任意metadataは保持する。PARTIAL、fixture、schema検査、保存成功は全sessionや生成READYへ昇格しない。

参照台帳・4Profile・規範・数値規則の文書版は1.0-draft.1、runtimeIntegrated=false。本改訂は文書・参照ファイルの追加であり、管理runtimeへの導入と本番受入は別に確認する。
