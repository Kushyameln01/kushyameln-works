# Animator Integrator VRCFT5 Implementation Plan

> 実装はユーザーの直接依頼に基づき継続する。会話窓口と自律作業ループによりCore担当・UI担当・読取監査を分担する。

**Goal:** VRCFT5専用の名称とExpression例外規則を、公開ツールと生成出力で一致させる。

**Architecture:** Integratorの行正規化に登録除外とSmooth/EyeLid例外を加える。既存Hike/WASMによる統合と素材保全は維持する。UIは最下部に固定の規則表を設ける。

**Tech Stack:** JavaScript ES modules、Node tests、既存Hike/WASM、静的HTML/CSS。

**Spec:** ./SPEC.md

## Global Constraints

私有原本は公開しない。前ターンのCyant固有例外は採用しない。Expression除外をAnimator削除に拡大しない。未定義Negativeは入力保持。成果と未検証範囲を区別する。

## Review Focus

- Smooth/かつ_Functionだけを残し、名前の部分一致で誤除外しない。
- 除外行の競合やBool不適合defaultが出力を妨げない。
- 未定義Negativeが前段のsuffix同期/Bool化で変更されない。
- EyeLidの旧初期値1/2が残って0.75を崩さない。
- Workerの旧キャッシュと新画面・規則が混在しない。

## Task 1 規則と生成出力

担当Core。docs/shared/animator-integrator/{default-value-rules,integrate,vrcft5-ranges}.mjs とtools/animator-integrator/の試験を担当。UI担当はこの範囲を編集しない。

- [x] 新規規則の実出力試験を追加しREDを確認する。
- [x] 行選別と初期値・同期例外、報告履歴、適用順を実装する。
- [x] 旧期待値を新仕様へ更新し、Integrator一式のGREENを確認する。

## Task 2 UIと入口名称

担当Root。docs/animator-integrator/{index.html,app.mjs,integrator.css}、実際のcatalog入口、README、client/worker/callerのcache版を担当。

- [x] 公開入口を特定し、VRCFT5名称と末尾の規則表を追加する。
- [x] 表の内容をTask 1の適用順と照合する。旧出力失効、worker読込み、範囲切替の扱いを統一する。
- [x] Cloud browserでレイアウト・生成・ダウンロードを確認する。

## Task 3 検証と公開

- [x] 関連保全・Builder・Registrar・Template試験と実Templateの数値を検証する。
- [x] 読取レビュー、差分確認、受入条件の照合後、公開用mainへ反映する。
- [x] 公開版の名称、規則表、生成archiveを回収して照合しRESULTへ記録する。
