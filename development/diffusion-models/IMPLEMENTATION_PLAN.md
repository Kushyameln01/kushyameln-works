# Diffusion Euler Array Foundation Implementation Plan

> **For agentic workers:** 実行はこのセッション内で行い、調査・監査を委任する。添付計画と最新ユーザー指示が優先する。

**Goal:** diffusion_models担当の素材判定と、モデル本体から独立して検証可能なHike配列Euler更新を成立させる。

**Architecture:** 専用作業領域内でHike WABT normalの配列カーネルと薄いES module hostを作る。hostは入力検査・copy・固定workspaceを担当し、全要素のEuler演算はHike WASMが担当する。外部Diffusion APIは本担当が定義する。TE/VAE側の実物取得前に相手APIの呼出し形式を推測しない。

**Tech Stack:** Hike 3c51fde6675f317453919bd505d0e2d0f638e7f1、wabt1.0.39、Node、Chromium。

**Spec:** IDEAL_STATE.md、添付計画v1.1、ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4 の comfy/k_diffusion/sampling.py sample_euler/to_d。

## Global Constraints

- モデル・workflow原本を変更しない。TE/VAE内部は対象外。既存Worksソースを編集しない。
- 4GiBを超える全モデル常駐・OOM再現・巨大ONNX生成は行わない。
- Hike失敗時のJS fallbackなし。生成成功・実モデル推論・軽量化を単体試験から主張しない。

## Review Focus

- f32演算順序とsigma=0の不正除算。
- 異なる長さ・過大入力・NaN/Infinity・計算overflow。
- Memory.grow後の古いview、反復でのworkspace拡大、結果の借用漏れ。
- WASM拒否時にJS処理で成功しないこと。
- 未提供APIを接続済み扱いしないこと。

## Task 1: 素材と基準

- [x] ヘッダー/全workflowを調べ、形状・dtype・依存・メモリ下限を保存する。
- [x] 現行Works/Space参照を取得し、他担当モジュールを確認可能な範囲で調べる。
- [x] Euler式・f32計算条件と採用範囲を記録する。

## Task 2: Hike配列カーネル

Files: kernel/euler.hike、kernel/build.py、kernel/euler.wasm、kernel/euler.wat、kernel/build-record.json、euler-kernel.mjs、test/cases.mjs、test/node-check.mjs。

Interface: createEulerKernel(wasmBytes, {capacity}) -> {step(x:Float32Array, denoised:Float32Array, sigma:number, nextSigma:number):Float32Array, memoryBytes, dispose()}。

EulerDenoised(xPtr:i32, denoisedPtr:i32, outPtr:i32, n:i32, capacity:i32, sigma:f32, nextSigma:f32)->i32。演算は d=(x-denoised)/sigma; dt=nextSigma-sigma; out=x+d*dt。CFG/noise/モデル予測/sigma列生成は含まない。

- [x] 独立literal期待値、入力拒否、全出力、反復buffer、grow、dispose、欠損WASMの試験を先に作り、未実装で失敗を確認する。
- [x] 固定compilerからsource→WASM→WATを生成し、ABI・imports・hashを記録する。
- [x] hostとHike計算を実装し、Node全ケースを通す。
- [x] HTTP上のChromiumで同じ全ケースを実行し、実fetch bytes/hash・結果を回収する。

## Task 3: 引継ぎ

- [x] fresh reviewerと監査担当に結果を点検させ、重要な問題を修正する。
- [x] 実装、試験、モデル証拠、接続要件、未達/再開条件をoutputへ梱包する。31GB重み・私有Space原文・toolchainを配布ZIPへ含めない。
- [x] 実モデル推論/API統合/負荷低減の未達を明示し、接続先回答があればその範囲から継続する。

## Task 4: rev2 独立Diffusion API（最新ユーザー回答による確定範囲）

- [x] api/ 配下に同一ページJavaScript/明示MessagePort経路と専用Workerを実装する。capabilities、ヘッダーinspect、Hike eulerStep、cancel/disposeと識別照合を実動作で検証する。
- [x] 未成立のload/predict/sampleは構造化エラーで拒否し、推論成功を偽装しない。
- [x] 固定ComfyUIのBernini構造・quant方式・block単位の分割成立性を調べ、主要演算移植の採否を更新する。
- [ ] 他担当TE/VAE APIの結合は確定版の提示後に行う。
