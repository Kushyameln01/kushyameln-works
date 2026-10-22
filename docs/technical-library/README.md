# 技術情報ライブラリ

機能版は `feature-version.json` を参照してください。公開目録は公開資料に基づく短い独自説明です。私有資料を同梱していません。公開目録の検索・個別読取り・共有と、このブラウザ内の私有資料は別の経路です。

## 公開目録

タイトル・別名・要約・タグ・対象版を検索します。本文全文検索ではありません。目録と項目 JSON は manifest の SHA-256 を確認します。出典リンクは自動取得しません。公開記事の適用版は記載された固定出典版です。機能版 v6 は記事内容の対応版や承認状態を変更しません。publicationDecision が candidate の記事は候補状態を維持します。

```js
const library = await window.technicalLibraryReady;
library.search({query:'保存完了',offset:0,limit:50});
await library.read('idb-complete');
library.export('idb-complete');
```

件数と hasMore/nextOffset を確認してページを送ります。索引作成は既存 compute と実 WASM を使用し、中断状態は同じブラウザプロファイル・同一 origin で保存します。この保存境界を別端末や別 origin 間の移行対応と解釈しないでください。

## 私有資料を選んで読む

1. 「このブラウザの私有資料を開く」を選びます。
2. 対応付け済みの登録用 JSON と、provenance.sourceArtifacts に記載された原本をすべて選びます。訂正追補形式では基本5原本と追補1原本の計6ファイルです。単なる任意 JSON を自動分類する機能ではありません。
3. 新規登録後、保存済みデータを選んで検索します。項目を開くと出典・引用位置・hash・版・確認状態を読めます。「次の根拠」で全件を確認できます。

ファイルはブラウザ内で処理し、サーバーへアップロードしません。保存前に schema と原本 bytes/hash を、項目読取り時に引用行・block、訂正の旧値・位置を検査します。不一致は拒否し、未取得添付は未取得と表示します。保存整合性の検査は、出典の主張の真実性や実験再現の証明ではありません。ローカル実行例は外部技術根拠と区別します。

私有データは公開目録・共有文へ加わりません。GitHub Pages と別の検証 origin の IndexedDB は別領域で、自動移送されません。サイトデータ消去で失われます。同一 origin の他のコードに対する認証・暗号化を提供するものではありません。

更新は選択した版と照合して全体を原子的に置き換えます。削除は選択した私有データとその原本添付だけが対象です。終了で接続と画面上の保持を解放します。APIと詳細な上限は `../shared/technical-library/README.md` を参照してください。

## 開発・検証

kernel 試験の probe は `tools/technical-library/kernel/BUILD.md` のローカル build 手順で準備します。`node tools/technical-library/generate.mjs` で公開目録を生成し、`node --test tests/technical-library-search.test.mjs tests/technical-library-kernel.test.mjs` で意味のある検索・実WASM契約を検査します。生成用入力も公開データだけに限定し、公開 validator を私有入力のために緩めません。実ブラウザや公開先の試験は別に記録します。
