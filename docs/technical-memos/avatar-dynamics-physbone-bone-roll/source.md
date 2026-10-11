このページの「概要」「整理・補足」はAIによる自動生成文です。「原文」は投稿者本人の記述です。

# AvatarDynamicsの外付け化とBoneRollを利用したPhysBone統合

- 記録日：2026-09-29
- 最終更新：2026-09-29
- タグ：VRChat / AvatarDynamics / PhysBone / Blender / BoneRoll / Prefab / PBReplacer
- 検証状態：検証中
- note記事：未記事化

## 原文

＿AvatarDynamicsの応用技術で、
https://github.com/c-colloid/PBReplacer
　これの最新版で実装されている手法の、AvatarDynamicsを外付け化＆Prefabとして保存し、そのVariantとしてアバター内に配置する手法
　これはかなり応用が効く 
GitHub
GitHub - c-colloid/PBReplacer
Contribute to c-colloid/PBReplacer development by creating an account on GitHub.
あと、わりとモデリングの技術としてBoneRollを利用してPhysboneを統合する手法知らない人多いのでメモ 
＿たとえば左右対称な髪があったとして、
　BoneRollを15°刻みなどでわざと角度を変えつつ、Blenderワールド空間における左右で180°反転させることで、
　UnityにおけるBoneの向きを調整することができる
　そうすれば、PhysboneのPitchとYawを利用して、浮き上がりと回転のLimitをそれぞれ制限できる
　ので、Physbone用のRootBoneにひとつつけるだけで済む 
ふぁっしょん — 6:25
＿そのうえでさらに細分化したい場合は、IgnoreTransformを利用する。
　これに登録したBoneはPhysboneから除外されるので、ひとつのRootBoneに複数のPhysboneを実装できる

　これらは軽量化以外にも、高度な設定をしたいときに部位ごとに具合を統一できることから、改変でも便利

## 概要（AI生成）

AvatarDynamics / PhysBoneの管理を、アバター本体のBone階層へ個別に直接配置するのではなく、外部の管理用オブジェクトへ集約する設計と、Bone Rollを利用してPhysBoneのローカル軸を意図的に整え、Pitch/Yaw Limitを効率よく使う設計についてのメモ。

Boneの向きを設計段階で揃えることで、左右対称な髪などでもPhysBone設定の共通化・集約がしやすくなり、必要に応じてIgnore Transformsでチェーンを分割して複数のPhysBoneから制御する、という応用を含む。

## 対象・環境

- 対象：VRChat Avatar Dynamics / VRC PhysBone / PhysBone Collider
- ソフトウェア：Unity、Blender、VRChat SDK（具体的バージョンは未記録）
- 実行環境：PC向けアバター改変を想定。詳細は未記録
- 関連設定：PhysBone Root Transform、Pitch Limit、Yaw Limit、Ignore Transforms、Blender Bone Roll

## 観察と仮説

- 観察した事実：PBReplacer公開リポジトリの `master`（2026-09-29確認）には、`AvatarDynamics.prefab` をアバター直下へインスタンス化し、既存の `VRCPhysBone` / `VRCPhysBoneCollider` の設定値を保持したまま、その配下へ1オブジェクト1コンポーネントとして再配置する処理が存在する。
- 観察した事実：PBReplacer READMEではVersion 1.1とされ、コンポーネントをBoneから分離することで、Hierarchy上の一括編集や、任意位置への移動、衣装側オブジェクトに含めたON/OFF管理が用途として説明されている。
- 観察した事実：公開 `master` のコードでは `PrefabUtility.InstantiatePrefab()` により同梱 `AvatarDynamics.prefab` を配置している。
- 仮説／ユーザー観察：AvatarDynamics設定を外付けPrefabとして保存し、そのPrefab Variantを各アバター内に配置する構成へ一般化すると、設定の再利用・更新・差分管理に応用できる。
- 未確認：2026-09-29時点の公開 `master` コードからは、AvatarDynamics一式を新規Prefabとして保存したり、Prefab Variantを生成・保存する処理は確認できなかった。そのため「PBReplacer最新版自体がVariant方式を実装している」という点は現状未確認。
- 仮説／ユーザー観察：左右対称な髪などのBone Rollを一定刻みで意図的に変え、左右をBlenderワールド空間基準で180°反転させることで、Unity上でPhysBoneが参照するBoneローカル軸の向きを制御できる。
- 仮説／ユーザー観察：この軸設計によりPitchとYawを、たとえば浮き上がり方向と回転方向の制限として分離して扱いやすくなり、複数チェーンに同一方針の制限値を適用しやすくなる。
- 仮説／ユーザー観察：Ignore Transformsを利用して一部Boneを特定PhysBoneの計算対象から外せば、共通Root配下を複数のPhysBone設定へ分割できる。

## 検証記録

- 検証日：2026-09-29
- 条件・操作：`c-colloid/PBReplacer` の公開GitHubリポジトリ、README、`Assets/Editor/PBReplacer/Scripts/PBReplacer.cs`、リポジトリツリー、直近コミット履歴を確認。
- 期待した結果：AvatarDynamicsの外付け化、Prefab配置、およびPrefab Variant生成・保存の実装有無を区別する。
- 実際の結果：外付け用 `AvatarDynamics.prefab` のインスタンス化とPhysBone/Collider再配置は確認。Prefab Variantの新規生成・保存処理は確認できず。
- 確認方法：GitHub公開ソースの静的確認。
- 証拠：https://github.com/c-colloid/PBReplacer
- 言えること／言えないこと：PBReplacer v1.1の公開masterが「BoneからPhysBone/Colliderを分離して管理用Prefab配下へ再配置する」方式を採用していることは確認できる。一方、Variant方式そのものがPBReplacerの公開実装であるとは現時点では断定しない。

## 整理・補足（AI生成）

このメモの2つの話題は、どちらも「設定を各Boneへ個別に持たせる」のではなく、制御構造を上位で統一する方向にある。

AvatarDynamics側では、コンポーネントそのものをBone階層から切り離して管理用階層へ集約することで、設定の一覧性、一括編集、衣装やPrefab単位の管理を容易にできる。これをPrefab Variant設計へ拡張すれば、共通設定を親Prefabへ持たせつつ、アバター固有差分のみVariant側へ保持する構造が考えられる。

Bone Roll側では、PhysBoneを追加してからLimit値を個別調整するのではなく、モデリング段階でBoneローカル軸を設計することで、同一のPitch/Yaw設定が意味する物理方向を揃える。左右対称部位でも軸方向を意図的に対応させられれば、Root単位でPhysBone設定を共通化しやすい。

Ignore Transformsは、この統合設計を崩さずに例外部分だけ計算対象から除外し、同じBone階層上へ追加のPhysBone制御を重ねるための分割手段として扱える。

## 次に確かめること

- Bone Rollを15°刻みで変えた左右対称BoneをUnityへImportし、PhysBoneのPitch/Yaw Limitが実際にどのローカル軸へ作用するかを可視化して記録する。
- BlenderのBone Roll、FBX変換、Unity Transformのローカル軸の対応関係を、Export設定を固定して検証する。
- Ignore Transformsで除外したBone以下の子階層がどのように評価されるか、複数PhysBoneを同一Root系統へ配置した場合の挙動を実機確認する。
- PBReplacer方式をPrefab Variantによる共通設定管理へ拡張した場合、Prefab Overrideと参照先Transformの保持が改変・着せ替え時に安定するか確認する。

## 参考・関連メモ

- c-colloid/PBReplacer：https://github.com/c-colloid/PBReplacer （2026-09-29確認）
- README：Version 1.1。PhysBone / PhysBoneColliderをBoneから分離し、1オブジェクト＝1コンポーネントとして再配置する用途を説明。
- `Assets/Editor/PBReplacer/Scripts/PBReplacer.cs`：`AvatarDynamics.prefab` のインスタンス化、PhysBone / Colliderの設定コピーと元コンポーネント削除を実装。

## 更新履歴

- 2026-09-29：初回記録。原文を保存し、PBReplacer公開masterとの照合結果を追記。Prefab Variant実装については未確認として区別。
