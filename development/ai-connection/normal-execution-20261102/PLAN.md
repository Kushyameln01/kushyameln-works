# 通常実行と診断の分離

ユーザー指示を実装範囲とする。通常入口は既存descriptorの操作・モデル・shape・dtype・軸・意味・正規化状態とownerの実装能力で接続を判断する。固定サンプルhash、独立参照、誤差gate、全中間保存は診断側だけが要求する。

数値演算とweight mappingは既存P4 core/source/feedを共有する。通常factoryとWorker RPCは同じ実行ownerを使い、N2・block0・Text L1..512・contextなし・F32の制約を保持する。全モデルload/predict/sampleは引き続きNOT_READY。上限値やWASM kernelを変更しない。

1. `execution/capabilities.mjs`をdescriptor・対応判定の正本とする。管理の共有shape規則と照合し、対応不可には理由と拡張箇所を返す。
2. P4 stageの同じ数値手順に通常／診断の出力方針を追加する。通常は固定payload／receipt照合なし、最終hiddenだけを返し、不要な中間参照を解放する。diagnosticsでは従来の25cutとevidenceを保持する。
3. `execution/p4.mjs`が通常tensor契約・所有snapshot・source/feed/stage寿命を所有する。`api/index.mjs`から単独factoryを公開し、WorkerへprepareP4/runP4/releaseP4/checkSupportを追加する。
4. weight feedのvalidateを構造・範囲・有限性・package完成・取引整合性検証へ変更し、native内部のcandidate admissionをcommit条件とする。独立比較はdiagnoseへ分離し、診断harnessの呼出しを更新する。
5. 既存参照を変更せず、実LOWの通常L512出力を既存composed gateで照合する。別payload受理、非対応shape、事前／実tile取消、入力保持、native lease/session解放を検証する。詳細値は診断資料、通常responseは簡潔なtensor/stateとする。

担当分担：descriptorと管理規則照合、weight feedの構造検証、通常core/API統合、browser数値検証をファイル単位で分離する。独立reviewと必要な回帰確認後に実行sourceを固定し、診断結果を別commitで配布する。merge・Pages公開は行わない。
