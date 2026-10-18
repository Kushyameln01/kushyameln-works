# VR180 MP4対応拡張 r6：Works統合用候補

2026-10-18 / build `vr180-b14-mp4-compatibility-r6` / 未配備。

元の25項目は「読取」「再圧縮なしの保持」「画素変更に合わせた更新」を分けて評価する。r5は部分成果であり、25項目すべての対応完了ではない。r6は受け入れられる素材を増やす追加実装と小規模検証をまとめたもの。[全25項目の状態と残件](MP4-25-STATUS-r6.md)を参照。

## 基準と適用

ユーザー提供 `Kushyameln_Works_v75_source_d398bd62.zip` の選択ソースを基準にした。親担当が18,582,721 bytesのZIP、全1,452 sourceファイル／58,571,945 bytesとmanifestを照合した。Codexは48 JSON巻／572partから75ファイル／7,229,501 bytesを復元し、SHA-256を照合、うちsource70ファイルをGit blob SHA-1とも照合した。

- ZIP SHA-256: `03a59b8cb81eb5f8f927b3466a1c855d44d2d8e7bbb83c07ce3acc23bd52e763`
- 宣言source commit: `d398bd62aad40ca6764b0c9e8ced4075f4b95f35`。commit object/historyを取得したという意味ではない。
- 親が全sourceから検証したtree: `cf63a50c35962171218d1df61b58e1775e16916d`
- v75はVR180改善の基準であり、現在のSite全体の最新版ではない。並行Composer等を含む現行Siteをv75へ置換しない。

Worksは同梱CHANGE-MANIFESTの変更対象ごとに適用先hashを照合する。一致した基準にのみ差分適用できる。差がある場合は現在ファイルへ変更内容を統合し、対象外を上書きしない。新規module4本（diagnostics、container-metadata、audio-dependency、open-ended-mdat）とpublic-files.jsonの登録を落とさない。Sitesへの反映・ビルド・配備はWorksが担当する。本作業はローカル候補と検証資料の作成で、Sites/main/Pagesへ適用していない。

## 追加実装

1. **記述メタデータの保持**。mdta keys/ilst/data、ISO/QuickTime meta、movie/video/audio scopeを扱う。キーの順序・型・locale・複数値はraw subtreeで保持する。画素変換では既知の記述情報だけを分類して通常direct、通常prepared/Worker、indexed出力へ移す。未知の寸法・時刻・ID依存キーを勝手に更新しない。元のencoder/software値は元の作成情報として残し、現在の出力codecは処理記録で識別する。
2. **従来metadataとの互換**。既存ISO udta/mdirの受付を一律停止しない。保持対象外・保持予算外の旧containerは値を展開せず省略を処理記録とUIへ示す。これは全タグ保持の完了ではなく、未保持を明示する既存受付の維持である。udta直下の全vendorタグは対象外。
3. **stz2**。4/8/16bitのサンプルサイズをページ単位で読む。奇数個の末尾未使用nibbleをサンプルとして扱わない。stszとの排他、件数、媒体範囲を検査。Cでは元表を保持し、通常/indexed demuxでは同じpacketを返す。新muxはstszを出力でき、stz2出力自体は必須ではない。
4. **末尾size=0 mdat**。ファイル末尾までを媒体と解釈し、VR情報を追記する前に長さを確定する。媒体位置は変えない。32bit範囲はheaderの長さだけ更新する。拡張headerが必要な場合は直前のfree/skipの8byteを再利用する。Cでは同時に置換する旧moovも利用できる。余地がない巨大mdatは未対応。4 GiB境界は数値モデルのみで、GBファイル処理を試験していない。
5. **限定cslg入力**。signed ctts v1と組み合わさり、全5値がstts/ctts全runから計算した値に一致するv0要約を受け入れる。通常/indexed入力とC保持を検証する。全QuickTime cslgやv1の一般対応ではない。
6. **AAC依存情報**。元AAC sampleを同順序・同件数・同サイズ・同設定・同相対時刻でコピーする契約を確認し、sdtpとroll/prolのsgpd/sbgpを元表のまま出力へ移す。新映像へ元映像の依存表を流用しない。表の大きさに比例する常駐配列や追加の全媒体hash読み出しを作らず、64KiB単位で転送する。途中seekの実再生品質は別の未検証項目。
7. **r5を継承**。限定mdtaとtmcd/tc64のC保持、参照検査、複数の未対応構造を集める診断を保持する。診断は加工能力ではない。

## 検証の読み方

固定候補のNode試験は183/183、改竄対照は24/24。独立回収・照合はC 28本、Node上のWorker制御C 2本、通常/indexed packet mux 12本、補足AAC単体6本の計48本（4,736 packet）。packet muxの720 decoded frameも内容・表示時刻を照合した。

同梱VERIFICATION.jsonとevidenceのsummary/reportが、対象hash・入力・出力・実行経路の正本。NodeのFile/OPFSアダプター、packet mux、FFmpeg独立解析は実ブラウザWebCodecs実行とは区別する。合成小素材をユーザーの実写入力と同一視しない。

metadata出力の初回oracleは、映像DTSが入力と同一という追加条件でFAILした。その条件は元のT契約ではない。固定muxerはPTSから復号時刻を再構成するため、対象Bフレーム素材では入力elst/正cttsから出力負ctts/cslgへ変わり、映像DTSは一定の1/30秒差を生じる。初回FAILを残し、PTS/duration、AAC全時刻、圧縮packet、出力ctts/cslg整合、FFmpeg全復号frameの内容・時刻を照合した。DTS差だけを無条件に許容する検査にはしていない。

再現にはNode（基準>=22.13）、Python 3、ffmpeg/ffprobeを使う。vendorは固定の受領バイトで、新規install/rebuildは不要。候補source rootで実行する例：

```sh
node --test tools/vr180/tests/*.test.mjs
python3 tools/vr180/make-mp4-safety-fixtures.py --output-dir /tmp/vr180-r6-small-fixtures
node tools/vr180/run-mp4-preservation.mjs /tmp/vr180-r6-small-fixtures/manifest.json /tmp/vr180-r6-copy-outputs
node tools/vr180/run-worker-preservation.mjs /tmp/vr180-r6-small-fixtures/manifest.json /tmp/vr180-r6-worker-outputs
```

再圧縮の保存部分はcontainer-metadata-transfer.test.mjsで小さな実MP4を生成し、VR180_METADATA_EVIDENCEを指定すればMP4/JSONを回収できる。環境変数は証拠保存先の指定であり、製品の保存設定を変更するものではない。

## 未実装と未検証

**未実装**：章・時間コード等の補助trackを伴うT、一般の複数音声/字幕、fMP4とfragment索引、外部参照、未知vendor依存Box、非identity表示行列、非1:1 pasp/clap、HDR画素処理、mesh/fisheye/camera固有投影等。必要な設計・仕様は25項目表へ残す。安全拒否を対応済みとは数えない。

**未検証**：今回候補の実ブラウザ入出力、WebCodecs画素変換から保存/回収まで、OS保存操作、VRプレイヤー、実写品質・操作性・速度、実5〜10GB/60fps。前段Chromium154のsandbox有効・UID1000起動はSUID helper構成不備によりexit134となり、ブラウザ処理前に停止した。sandboxを無効化せず、同じ条件の起動を繰り返していない。TinyFishが呼べることだけでは、未配備r6候補へ到達・入力転送・出力回収できるとは確認できない。課金・認証・権限設定の変更は行わない。

次はWorks側で現在ソースへ差分統合し、同一build/hashが配信される非公開環境で小素材の実ブラウザ入力・処理・保存・MP4/JSON回収を確認する。補助track Tなどの実装残件は、その環境確認だけで解消したことにはしない。
