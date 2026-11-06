# 追記 Profileと規範の採用条件およびmappingの一元化

0.2-draft.3／2026年10月31日 JST。[Profile総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)と[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)を以後の接続判断の参照先として追加する。旧本文のsourceや未達チェックは当時の計画記録を保持する。最新owner版と管理の採用済み組合せを同一と扱わず、現時点の固定source・証拠scopeは台帳で確認する。

LoRA側 `createDiffusionDiagnosticAdapter` を、full-shape/selected-slice・SDK/native registry・sink/consumer取引mappingの正本とする。管理は `createAdoptedLoraAdapter` へこれを注入し、request/revision/resource bindingを担当する。Diffusionはnative provider/consumerとbase復号を維持する。

**旧管理bridge `createDiagnosticLoraBridge` は回帰用として区別し、同じ実行経路でmappingを重複させないこと。** owner adapterと旧bridgeの積み重ね、管理での同じmappingの複製、回帰経路のPASSを現行経路へ転用する受入を禁止する。回帰用ファイルの保持自体は許容する。

Profile採用時は、数値ownerが[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)を根拠にsource/build・意味・shape・precision・独立reference・事前gate・scopeを明示する。規範策定者が照合条件を版固定し、管理はその規範へ宣言とreceiptを照合する。未知の式や閾値を管理が補完せず、依存edgeのみを保留する。

この追記と台帳の作成は、規範JSONの管理runtime組込みや新しい推論実行を意味しない。E5全session、本番Diffusion/全target、実generated-sample、81frame全工程と資源予算の未受入を維持する。
