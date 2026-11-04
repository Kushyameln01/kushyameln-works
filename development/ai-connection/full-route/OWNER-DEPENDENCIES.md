# 現在の管理採用・port所有・実接続受入

2026-11-05更新。前版の「Diffusion公開consumerが存在しない」は固定ffe配布に対する過去の観測であり、現在のb6配布の不足ではない。履歴は9fe2c2e1dd35e17a3063a2c67d3bda676e953c8aのこの文書に固定されている。

## 現在の正本

- Text/VAE: 20f640a6e071b6c060a212e89b28f0c8965923f7。コード、新Text manifest、normLowering、current codecを組で採用する。
- 全モデルDiffusion: b6e166478a8e072c9ffd3ce562bfdb0c89634920。公開openWeightFeedとcreateDiffusionWeightClientがimmutable baseProviderとstandalone completed-F32 consumerを提供する。
- 通常P4: 全モデルとは別entry/pinとして同じb6配布の正規marker対応版を管理する。旧30e拒否は回帰用であり、全モデル経路の不可理由ではない。

## 管理側の変更境界

1. 実module／Worker／WASM等のexact採用、source/build/manifest/codec対応を管理記録へ反映する。
2. MessagePortは専用所有。通常結果のclone、snapshot、JSON／workspaceへ入れず、clonableなfeed metadataとruntime clientを分ける。
3. side/modelSession/epochを照合し、取消・unload/reload・disposeで旧feedを失効させる。失敗した解放はhandleを保持して再試行し、古いcloseが新side取引を消さないよう世代を隔離する。
4. nativeのbaseProvider/consumerを既存LoRA SDKへ明示bindingする。mapping・数値適用はownerに委任し、適用成功と生成READYを混同しない。

## 受入未実施の範囲

実NNは資材保持環境で今回の固定管理sourceを実行して受け入れる。保持側receiptで完全なHIGH／LOW pair、N5保存入力、実L512 conditioningの存在を確認済み。この管理環境の不在を資材自体の不存在として扱わない。

保持側の既存Text／Rect管理NNは管理e166 bridgeのscopeで再利用する。旧管理296／e166の結果や、新native単体port試験を、新controllerの実NN成功へ付け替えない。新管理sourceの取得ACKと、実load/predict/sample、取消→reload、実生成sample保存／読戻し、port取引・終端／lease解放の返却receiptが必要である。

固定source・runnerと返却条件を渡し保持側実行を受け入れる。資材の管理環境への全複製は不要。保持側で原寸NN進行中なら同じ16GiBで並列起動せず、空き資源で順番に実行する。

全体接続実装が揃ったことと実NN／全体運用の受入は別判定。新しい試験LoRA受領・全体運用実験はユーザー指定どおり全体接続実装完了後に行う。
