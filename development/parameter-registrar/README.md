# Parameter Registrar — GitHub Pages implementation

2026-10-25。ブラウザ内でUnityPackageを処理する中間モジュール。公開入口は `/parameter-registrar/`、共有APIは `docs/shared/parameter-registrar/README.md`。

## 固定した要件

- 入力package内に実在する全class74/class206を、拡張子・参照有無によらず調べる。Controllerと同一asset内のBlendTreeも対象。
- 元Controller/Expressionの宣言・型・初期値、State/Transition等をParameter情報源にしない。外部Motionは取得しない。
- 全件解析レポート、出典一覧、report APIを生成しない。結果は登録名集合、最小件数、必要なエラーと生成物。
- 出力は新規GUIDの最小Controller（空のBase Layer、再生Stateなし）とSDK ExpressionParameters、および格納フォルダだけ。元Motionをコピー・変更しない。
- 生成設定の既定はFloat初期値0、Saved=false、NetworkSynced=false。元キーや宣言からの継承ではない。
- 今回はGitHub Pagesのみ。ChatGPT Sitesへの変更・反映は保留。

## 構造

`core.mjs` は既存package scanner/selector、Unity scalar/document helper、Expression serializerを再利用する。Controller等まで解析するComposer index全体を呼ばない。package選択の `allowAnyAsset` は明示した呼出しだけで有効で、既存Composerの既定の拡張子制限は維持する。

`client.mjs` は専用scanner Workerで入力を展開し、対象documentだけを8MiB未満に分けて既存共有poolへ渡す。`parameter-collect` は既存の検証済みHike FT WASMのAnimatorHashを使用し、`parameter-generate` はJSで出力を組み立てる。借用poolは終了せず、自sessionのjobだけを取消す。入力bytesのtransferはprivate copyに限る。

共有poolのModuleとbundle双方に登録。bundle再構築は下記の固定esbuildで行い、元のUnity/技術ライブラリWASM URLをcomputeディレクトリからの相対位置へ保持する。WASM binary自体は変更しない。

```sh
node tools/shared-compute/build-worker-bundle.mjs
node tools/parameter-registrar/test-core.mjs
node tools/parameter-registrar/test-client.mjs
node --experimental-vm-modules tools/animator-composer/test-package-selection.mjs
node tools/animator-composer/test-composition.mjs
node tools/animator-composer/test-generation.mjs
node tools/animator-composer/test-registration.mjs
node development/parameter-template/test-core.mjs
node tools/shared-compute/test-pool.mjs
node tools/shared-compute/test-client.mjs
node tests/technical-library-search.test.mjs
python3 -m unittest discover -s tests -p 'test_publication.py' -q
python3 scripts/sync-static.py docs --output /absolute/new/stage
```

## 検証と制限

コア13群と共有client7群は、孤立/内包対象、Controller宣言の変更に対する結果不変、64bit fileID、実WASM hash、全使用欄、生成settings、型/budgetエラー、出力読戻し、借用poolの生存とmodule/bundle Workerを検証する。再ビルドしたbundleで従来のUnity/技術ライブラリkernelを実際に読み込む試験も含む。

独立レビューで見つかった4件は、未対応scalar/複数行の拒否、sequence bodyの全行検査、対応を証明できない特殊bindingの拒否、File.sizeの先行検査で修正した。指示子を含む名前は明示引用した文字列なら保持する。カーブ名から特殊bindingを推測する辞書や、件数だけで成功にする代替は用いない。

Chromium154の候補版UIで、Parameter Templateから生成した16Tree・30Clipを入力し、正確な14名を抽出、初期値0.25/Saved/同期ありで生成・実ダウンロード・独立読戻しを実施する。出力は2アセットとフォルダのみ、同期112bit。旧結果の失効、取消/破損入力後の復帰、別呼出元のbundle API、共有FT混在、390px幅も確認対象。

`verify-browser-output.mjs <actual-downloaded-package>` はこの固定Template試験出力を独立に照合する補助検査。製品から解析レポートを生成するものではない。

通常のテキストFloat bindingを対象とする。圧縮、整数/参照、バイナリ、正確な対応を確認できない特殊binding、上限超過は対象と理由を示して停止する。Import時にFBX等から生成されるClipの復元は行わない。Unity Editor ImportおよびVRChatでの実動作は未検証で、ブラウザ・静的読戻しの合格とは分ける。
