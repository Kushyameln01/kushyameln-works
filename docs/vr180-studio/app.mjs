import {buildStereoGeometry} from '../shared/vr180/geometry.mjs';
import {StereoClient} from '../shared/vr180/client.mjs';
import {requiresIndexedConversion, STREAMING_INPUT_THRESHOLD_BYTES} from '../shared/vr180/route-profile.mjs';
import {listIndexedJobs, recoverIndexedJob} from '../shared/vr180/ownership-registry.mjs';
import {OperationScope} from '../shared/vr180/operations.mjs';
import {saveBlobToFile} from '../shared/vr180/file-output.mjs';
import {bindSaveSummary, createSaveAttempt, summarizeSaves} from '../shared/vr180/save-record.mjs';
const $ = id => document.getElementById(id);
const PAGE_BUILD = 'vr180-b15-flexible-scale-candidate-1';
const operations = new OperationScope();
let record = null, sourceInfo = null;
let inputFailure = null, selectionPhase = null;
let source = null, result = null, inputURL = null, outputURL = null, selectionClock = null, selectionAt = null;
let chosenSaveHandle = null, pendingSaveCleanup = null;
let registryBusy = false, registryRows = [];
const registryRetries = new Map(), registryRetryLimit = 20;
let pageReadyMs = null, selectionToInspectedMs = null;
const client = new StereoClient({onEvent: m => {
  if (m.type === 'progress') {
    const p = m.progress;
    if (p?.phase === 'saveCommit') {
      showSaveProgress('保存ファイルを確定して内容を確認しています…');
      $('status').textContent = '動画を仕上げています。保存状況は下の3で確認できます。';
      return;
    }
    $('progress').value = typeof p === 'number' ? p : p?.ratio ?? 0;
    $('status').textContent = ({finalize: '動画ファイルを仕上げています…', inputHash: '入力ファイルの照合用ハッシュを計算しています…', outputHash: '出力ファイルの照合用ハッシュを計算しています…'})[p?.phase] ?? '動画を変換しています…';
  }
  if (m.type === 'indexed-ownership') $('index-cleanup-status').textContent = 'この処理のためにブラウザ内の一時データを使用しています。';
  if (m.type === 'cleanup-error') {
    if (m.diagnostics) { record = m.diagnostics; $('diagnostics').textContent = JSON.stringify(record, null, 2); }
    $('cleanup-warning').textContent = '一時ファイルの清掃が完了していません。削除を再試行してください。 ' + m.error;
    $('status').textContent = '清掃の完了を待っています。新しい処理はまだ開始できません。';
    if (m.error === 'DIRECT_SAVE_STATE_UNKNOWN') {
      chosenSaveHandle = null;
      $('cleanup-warning').textContent = '処理担当が停止したため、保存先への書き込み・取消の結果を確認できません。「記録を保存して処理を終了」で記録を残し、保存先のファイルを確認してください。';
      $('status').textContent = '保存状態が不明です。取消完了とは判定していません。';
    }
    showSaveAndCleanup(record, m.internalIndexCleanup ?? m.diagnostics?.internalIndexCleanup);
    update();
  }
  if (m.type === 'cleanup-complete') {
    $('cleanup-warning').textContent = '';
    let receipt = m.diagnostics ?? record;
    const identity = receipt?.indexedOwnership?.identity;
    if (m.internalIndexCleanup === 'complete' && sameRegistryIdentity(identity, identity)
      && m.operationId === receipt.operationId && m.inputRevision === receipt.inputRevision
      && identity.operationId === receipt.operationId && identity.inputRevision === receipt.inputRevision) {
      receipt = record = {...receipt, internalCleanupRecovery: Object.freeze({status: 'complete', identity: Object.freeze({...identity}),
        observedAt: new Date().toISOString(), source: 'client-cleanup-complete', externalSaveState: 'NOT_APPLICABLE'})};
      $('diagnostics').textContent = JSON.stringify(record, null, 2);
    }
    showSaveAndCleanup(receipt, m.internalIndexCleanup);
    update();
  }
  if (m.type === 'output-unconfirmed-detached') showSaveAndCleanup(m.diagnostics, m.internalIndexCleanup);
}});
const errors = {
  TRACK_REFERENCES_COPY_ONLY: 'この動画の参照情報・チャプターは、再圧縮しない作成で保持できます。切出し・再圧縮にはまだ対応していません。',
  METADATA_COPY_ONLY: 'この動画のメタデータ・時間コードは、再圧縮しない作成で保持できます。切出し・再圧縮での保持は未対応です。',
  TIMELINE_NOT_SUPPORTED: 'この動画の時刻・補助情報を保持した再圧縮には、まだ対応していません。処理記録で理由を確認できます。',
  INPUT_DECODE_UNSUPPORTED: 'このブラウザでは入力動画を復号できません。処理記録で対応状況を確認できます。',
  OUTPUT_ENCODE_UNSUPPORTED: 'このブラウザでは指定サイズのH.264動画を書き出せません。処理記録で対応状況を確認できます。',
  INPUT_DECODE_AND_OUTPUT_ENCODE_UNSUPPORTED: 'このブラウザでは入力の復号と、指定サイズのH.264書出しの両方に対応できません。',
  CONFIRM_PROJECTION_AND_EYES: '元映像の投影・左右配置を確認してください。',
  STEREO_METADATA_CONFLICT: '選んだ左右配置と、動画に記録された情報が一致しません。',
  FOV_METADATA_CONFLICT: '選んだ視野角と、動画に記録された情報が一致しません。',
  EYE_DIMENSIONS_AND_FOV_CONFLICT: '各眼の寸法と角度の設定を確認してください。矩形の各眼は、投影を別途確認したうえで「横・縦で異なる」を選びます。',
  INPUT_SAMPLING_UNSUPPORTED: '画素と角度の対応設定が不正です。',
  COPY_REQUIRES_180_DEGREES: '360°素材は「180°へ切出し・横並びへ変換」を選んでください。',
  CAMERA_MESH_NOT_SUPPORTED_YET: 'このカメラのメッシュ投影は、まだ対応していません。',
  CONVERSION_INDEX_INFO_INVALID: '変換前に動画の索引を確認できませんでした。処理記録を確認してください。',
  CONVERSION_SAMPLE_LIMIT_EXCEEDED: 'この動画の映像・音声索引が処理可能な件数を超えています。処理記録を確認してください。',
  CONVERSION_METADATA_LIMIT_EXCEEDED: 'この動画の索引・メタデータが通常の変換で扱える量を超えています。一時保存を使う変換を選んでください。',
  OUTPUT_SIZE_INVALID: '出力サイズを正確に扱える範囲を超えました。',
  OUTPUT_POSITION_INVALID: '出力先への書き込み位置を正確に扱えませんでした。',
  OUTPUT_MUST_BE_NEW_FILE: '保存用の新しいファイル名を指定してください。既存の内容は上書きしていません。',
  OPFS_UNAVAILABLE: 'このブラウザでは変換用の一時保存を利用できません。',
  INDEXED_OUTPUT_HANDLE_REQUIRED: 'この変換には、先に保存先を選んでください。',
  INPUT_SIZE_INVALID: '入力サイズを正確に読み取れませんでした。',
  REGISTRY_OPFS_UNAVAILABLE: 'このブラウザでは変換用の一時保存を利用できません。',
  REGISTRY_SYNC_HANDLE_UNAVAILABLE: 'このブラウザは、変換に必要な一時保存の操作に対応していません。',
  REGISTRY_LOCK_UNAVAILABLE: 'このブラウザでは作業の所有状態を確認できないため、変換を開始できません。'
};
function formatGB(bytes) {
  return `${new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 6}).format(bytes / 1e9)} GB`;
}
function indexedRequired() {
  return requiresIndexedConversion({inputBytes: source?.size ?? 0, sampleCount: sourceInfo?.sampleCounts?.total,
    metadataBytes: sourceInfo?.containerMetadataBytes});
}
function indexedAvailable() {
  return typeof globalThis.showSaveFilePicker === 'function'
    && typeof navigator.storage?.getDirectory === 'function' && typeof navigator.locks?.request === 'function';
}
function indexedSelected() {
  return $('mode').value === 'convert' && (indexedRequired() || $('execution-route').value === 'indexed'
    || ($('execution-route').value === 'auto' && indexedAvailable()));
}
function saveRequired() { return indexedSelected() || ($('mode').value === 'copy' && source?.size >= STREAMING_INPUT_THRESHOLD_BYTES); }
function indexedUnavailable() {
  if (!saveRequired()) return '';
  if (typeof globalThis.showSaveFilePicker !== 'function') return 'この処理には保存先を選べるブラウザが必要です。デスクトップ版ChromeまたはEdgeを使用してください。';
  if (indexedSelected() && !indexedAvailable()) return 'このブラウザでは変換に必要な一時保存の機能を確認できません。';
  return '';
}
function showSaveProgress(message, ratio = null) {
  $('save-status').textContent = message;
  $('save-progress').hidden = false;
  if (Number.isFinite(ratio)) $('save-progress').value = Math.max(0, Math.min(1, ratio));
  else $('save-progress').removeAttribute('value');
}
function showSaveAndCleanup(receipt, cleanupState) {
  const recovery = receipt?.internalCleanupRecovery;
  if (recovery?.status === 'complete' && recovery.identity?.operationId === receipt.operationId
    && recovery.identity.inputRevision === receipt.inputRevision) cleanupState = 'complete';
  $('save-fact').textContent = receipt?.saveCompleted ? '保存と内容の照合は完了しています。保存先の動画を保持しています。'
    : receipt?.saveWriteCommitted === true ? '保存先への書き込みは完了していますが、内容の確認は未完了です。'
    : receipt?.directSave?.status === 'unknown' ? '保存先への書き込み・取消の結果は不明です。保存先の動画を確認してください。' : '';
  if (cleanupState) $('index-cleanup-status').textContent = cleanupState === 'complete'
    ? 'ブラウザ内の一時データの清掃は完了しています。保存状態とは別の確認です。'
    : 'ブラウザ内の一時データの清掃は未完了です。保存済みの動画は清掃しません。';
}
function statusError(e) {
  if (e.diagnostics) {
    const recovery = record?.internalCleanupRecovery, receipt = e.diagnostics;
    // Cleanup may settle before the original run rejects with its earlier receipt.
    // Carry the matching recovery observation without rewriting that receipt.
    record = recovery?.status === 'complete' && recovery.identity?.operationId === receipt.operationId
      && recovery.identity.inputRevision === receipt.inputRevision
      && sameRegistryIdentity(recovery.identity, receipt.indexedOwnership?.identity)
      ? {...receipt, internalCleanupRecovery: recovery} : receipt;
    $('diagnostics').textContent = JSON.stringify(record, null, 2);
  }
  $('status').textContent = client.cleanupPending ? '清掃が完了していません。削除を再試行してください。' : e.name === 'AbortError' ? '取り消しました。再実行できます。' : errors[e.message] || errors[e.message?.split(':')[0]] || `処理できませんでした：${e.message}`;
  const structure = e.diagnostics?.structureDiagnostics;
  if (!client.cleanupPending && e.name !== 'AbortError' && structure?.findings?.length) {
    const count = structure.findings.length;
    $('status').textContent += ` 確認が必要な構造を${count}件${structure.omittedFindings ? '以上' : ''}記録しました。${structure.scanComplete ? '' : '未確認の範囲があります。'}詳細は処理記録を確認してください。`;
  }
  if (e.diagnostics?.saveWriteCommitted) {
    chosenSaveHandle = null;
    $('status').textContent = e.diagnostics.saveCompleted ? '保存と内容の照合は完了しています。その後の処理は完了できませんでした。保存先のファイルを確認してください。' : '保存先への書き込みは完了しましたが、その後の確認を完了できませんでした。保存先のファイルと処理記録を確認してください。';
  }
  if (e.diagnostics?.directSave?.status === 'unknown') $('status').textContent = '保存状態が不明な処理を終了しました。保存先のファイルを確認し、次の処理には新しい保存先を選んでください。';
  showSaveAndCleanup(record, e.diagnostics?.internalIndexCleanup);
}
function outputSettings() {
  return {outputShape: $('output-shape').value, outputScale: $('output-shape').value === 'preserve' ? Number($('output-scale').value) : 1};
}
function outputGeometry() {
  return buildStereoGeometry({...outputSettings(), width: sourceInfo.width, height: sourceInfo.height,
    layout: $('layout').value, fov: Number($('fov').value), eyeSize: Number($('size').value)});
}
function update() {
  const busy = !!operations.current || registryBusy, cleanupPending = client.cleanupPending || !!pendingSaveCleanup;
  const copyOnly = $('mode').value === 'convert' && (sourceInfo?.hasTrackReferences || sourceInfo?.hasChapterList || sourceInfo?.transcodeSafe === false);
  const indexed = indexedSelected(), unavailable = indexedUnavailable();
  $('execution-route-label').hidden = $('mode').value !== 'convert';
  $('execution-route-note').hidden = !indexed;
  $('execution-route-note').textContent = unavailable || (indexedRequired() ? '大容量・長時間の動画には、一時保存を使う変換を自動で選びます。先に保存先を選んでください。' : '先に保存先を選んでください。一時データはブラウザ内に保存し、動画は保存先へ順次書き込みます。');
  const guideSize = sourceInfo && [[3840,2160,'4K'],[5760,3240,'6K'],[7680,4320,'8K']]
    .find(([w,h]) => sourceInfo.width === w && sourceInfo.height === h);
  $('capture-match').textContent = guideSize
    ? `入力寸法はガイドの${guideSize[2]}（${sourceInfo.width} × ${sourceInfo.height}）と一致します。寸法だけでは投影・眼順序を判定できません。`
    : 'ガイドの録画フレームは16:9です。寸法やファイル名から投影・眼順序を自動認定しません。';
  const converting = $('mode').value === 'convert', preserve = $('output-shape').value === 'preserve';
  $('size-label').hidden = !converting || preserve;
  $('output-shape-label').hidden = !converting;
  $('output-scale-label').hidden = !converting || !preserve;
  $('output-geometry-note').hidden = !converting;
  let sizingError = false;
  $('output-geometry-note').textContent = '';
  if (converting && sourceInfo) {
    try {
      const g = outputGeometry();
      $('output-geometry-note').textContent = `出力 ${g.width} × ${g.height}（各眼 ${g.width / 2} × ${g.height}）。` + (preserve ? '左右両眼に同じ倍率を使い、縦横比を保ちます。' : '各眼を正方形へ再サンプルします。平面上の形状は変わる場合があります。');
    } catch {
      sizingError = true;
      $('output-geometry-note').textContent = 'この縮尺・サイズでは出力できません。縦横とも正の偶数画素となり、元画像を拡大しない設定を選んでください。比率を変える丸めは行いません。';
    }
  }
  $('mode-note').textContent = $('mode').value === 'copy' ? '180°の映像と音声をそのまま保ち、VR情報を整えます。' : '各眼の正面180°を横並びにして再圧縮します。360°素材の背面は出力されません。矩形の各眼は選んだ正方形へ再サンプルするため、録画解像度は保持されません。';
  if (copyOnly) $('mode-note').textContent = sourceInfo?.hasTrackReferences || sourceInfo?.hasChapterList
    ? errors.TRACK_REFERENCES_COPY_ONLY : sourceInfo?.metadataCopyOnly || sourceInfo?.auxiliaryTracks?.some(t => t.kind === 'timecode')
      ? errors.METADATA_COPY_ONLY : errors.TIMELINE_NOT_SUPPORTED;
  $('run').disabled = busy || cleanupPending || copyOnly || sizingError || !source || !$('confirmed').checked || (saveRequired() && (!chosenSaveHandle || !!unavailable));
  $('run').textContent = chosenSaveHandle && $('mode').value === 'convert' ? '動画を作成して保存' : 'VR180動画を作成';
  $('cancel').disabled = registryBusy || (!busy && !cleanupPending) || operations.current?.kind === 'saveCleanup';
  $('cancel').textContent = pendingSaveCleanup ? '保存処理の清掃を再試行' : cleanupPending ? '一時ファイル削除を再試行' : '取り消す';
  if (client.outputStateUnknown) $('cancel').textContent = '記録を保存して処理を終了';
  for (const id of ['layout', 'fov', 'sampling', 'mode', 'size', 'output-shape', 'output-scale', 'execution-route', 'confirmed', 'file', 'clear', 'receipt']) $(id).disabled = busy || cleanupPending;
  const outputUnavailable = busy || cleanupPending || !result;
  const saved = !!result && summarizeSaves(result.receipt).saveCompleted;
  $('save').disabled = outputUnavailable;
  $('clear').disabled = outputUnavailable;
  $('result').dataset.outputState = !result ? 'waiting' : saved ? 'saved' : 'ready';
  $('result-content').inert = !result;
  $('result-waiting').hidden = !!result;
  $('output-video').hidden = !result;
  $('save-step-state').textContent = !result ? '作成待ち' : saved ? '保存済み' : '保存へ';
  $('workflow').dataset.outputReady = String(!!result && !saved);
  $('next-step').hidden = !result || busy || cleanupPending;
  $('next-step-note').textContent = saved
    ? '保存は完了しています。下の3で出力を確認できます。'
    : '次は保存です。下へ進み、3の「動画を保存」を押してください。';
  $('go-to-save').textContent = saved ? '↓ 3へ進んで出力を確認' : '↓ 3へ進んで動画を保存';
  $('choose-save').disabled = busy || cleanupPending || !source || typeof globalThis.showSaveFilePicker !== 'function';
  $('retry-input').hidden = !inputFailure?.file;
  $('retry-input').disabled = busy || cleanupPending || !inputFailure?.file;
  $('save-destination').textContent = chosenSaveHandle ? `保存先：${chosenSaveHandle.name}${$('mode').value === 'convert' ? '。作成時にこの保存先へ直接書き込みます。' : '。作成後に保存してください。'}` : typeof globalThis.showSaveFilePicker === 'function' ? '保存先は作成前にも選べます。保存用の新しいファイル名を指定してください。' : 'このブラウザでは、作成後にダウンロードして保存します。';
  if (saveRequired() && !chosenSaveHandle) $('save-destination').textContent = unavailable || '先に保存用の新しいファイル名を指定してください。';
  if (!source) $('save-destination').textContent = inputFailure ? '動画の読み込みが完了していません。「動画を再確認」するか、動画を選び直してください。' : '動画を選ぶと保存先を指定できます。';
  const canRecover = !busy && !cleanupPending && !client.current;
  const selected = $('registry-job').value === '' ? null : registryRows[Number($('registry-job').value)];
  const recoveryBlock = selected?.identity ? registryRecoveryBlock(selected.identity) : '';
  $('registry-list').disabled = !canRecover;
  $('registry-job').disabled = !canRecover || !registryRows.length;
  $('registry-confirm').disabled = !canRecover || !selected?.identity || !!recoveryBlock;
  $('registry-recover').disabled = !canRecover || !selected?.identity || !!recoveryBlock || !$('registry-confirm').checked;
  $('registry-recover').textContent = selected?.identity && registryRetries.has(selected.identity.namespace) ? '選択した作業の清掃を再試行' : '選択した作業の一時データを清掃';
  $('receipt').disabled = (busy && !cleanupPending) || !record;
  $('download').setAttribute('aria-disabled', String(outputUnavailable));
  $('download').tabIndex = outputUnavailable ? -1 : 0;
  for (const button of document.querySelectorAll('[data-demo]')) button.disabled = busy || cleanupPending;
}
function begin(kind) { const op = operations.begin(kind); update(); return op; }
function finish(op) { if (operations.finish(op)) update(); }
async function clearResult() {
  if (pendingSaveCleanup) throw Error('SAVE_CLEANUP_INCOMPLETE');
  $('output-video').pause(); $('output-video').removeAttribute('src'); $('output-video').load();
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = null; result = null;
  $('download').removeAttribute('href');
  $('output-info').textContent = ''; $('save-status').textContent = '';
  $('save-progress').hidden = true; $('save-progress').value = 0;
  update();
  await client.dispose();
  record = null; $('diagnostics').textContent = '処理記録はありません。';
  $('save-fact').textContent = ''; $('index-cleanup-status').textContent = '';
}
async function prepare(file, preset, op) {
  selectionPhase = 'previous-result-cleanup';
  await clearResult(); operations.check(op);
  inputFailure = null;
  source = file; sourceInfo = null; chosenSaveHandle = null; selectionClock = performance.now(); selectionAt = new Date().toISOString(); $('confirmed').checked = false; $('sampling').value = 'equal'; $('output-shape').value = 'square'; $('output-scale').value = '0.5';
  $('input-info').textContent = `${file.name} · ${formatGB(file.size)} · 読み込み中`;
  selectionPhase = 'input-preview';
  if (inputURL) URL.revokeObjectURL(inputURL);
  inputURL = URL.createObjectURL(file); $('input-video').src = inputURL; $('input-video').hidden = false;
  $('status').textContent = '動画の形式を確認しています…';
  selectionPhase = 'input-inspect';
  const probe = await client.run(file, {mode: 'inspect'}); operations.check(op);
  selectionToInspectedMs = performance.now() - selectionClock;
  const i = sourceInfo = probe.info;
  $('input-info').textContent = `${file.name} · ${i.width} × ${i.height} · ${formatGB(file.size)}`;
  if (preset) {
    $('layout').value = preset.layout; $('fov').value = String(preset.fov);
    $('mode').value = preset.fov === 360 || preset.layout === 'tb' ? 'convert' : 'copy'; $('size').value = '256';
  } else {
    if (i.stereoMode === 1 || i.stereoMode === 2) $('layout').value = i.stereoMode === 1 ? 'tb' : 'sbs';
    if (i.bounds) $('fov').value = i.bounds.left === 0 ? '360' : '180';
  }
  $('diagnostics').textContent = JSON.stringify(i, null, 2);
  selectionPhase = 'inspect-worker-release';
  await client.dispose(); operations.check(op);
  selectionPhase = null;
  $('status').textContent = '左右配置と映像範囲を確認して、動画を作成してください。';
}
function failPreparation(error, file, preset) {
  source = null; sourceInfo = null; chosenSaveHandle = null;
  $('input-video').pause(); $('input-video').removeAttribute('src'); $('input-video').load(); $('input-video').hidden = true;
  if (inputURL) URL.revokeObjectURL(inputURL);
  inputURL = null;
  const observation = {pageBuild: PAGE_BUILD, phase: selectionPhase, observedAt: new Date().toISOString(),
    error: {name: error.name, message: error.message}, workerFailure: error.workerFailure ?? null,
    input: file ? {bytes: file.size, type: file.type} : null,
    environment: {origin: globalThis.location?.origin ?? null, secureContext: globalThis.isSecureContext ?? null,
      userAgent: navigator.userAgent ?? null}};
  if (!error.diagnostics) error.diagnostics = {kind: 'vr180-input-preparation-failure',
    status: error.name === 'AbortError' ? 'canceled' : 'failed', ...observation};
  statusError(error);
  if (record?.schemaVersion === 2) {
    record = {...record, inputPreparation: observation};
    $('diagnostics').textContent = JSON.stringify(record, null, 2);
  }
  inputFailure = {file, preset};
  $('input-info').textContent = file ? `${file.name} · ${formatGB(file.size)} · 読み込み未完了` : '動画を読み込めませんでした。選び直してください。';
  if (!client.cleanupPending) $('status').textContent += ' 動画を再確認するか、選び直してください。';
}
async function select(file, preset = null) {
  if (operations.current || registryBusy || client.cleanupPending || pendingSaveCleanup) return;
  const op = begin('prepare');
  try { await prepare(file, preset, op); }
  catch (e) { if (operations.owns(op)) failPreparation(e, file, preset); }
  finally { finish(op); }
}
$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  // Keep the File reference, but allow selecting this same file again after an error.
  $('file').value = '';
  if (file) return select(file);
});
$('retry-input').onclick = () => { if (inputFailure?.file) return select(inputFailure.file, inputFailure.preset); };
for (const button of document.querySelectorAll('[data-demo]')) button.onclick = async () => {
  if (operations.current || registryBusy) return;
  const op = begin('prepare');
  let file = null, preset = null;
  try {
    selectionPhase = 'previous-result-cleanup';
    await clearResult(); operations.check(op);
    source = null; sourceInfo = null; chosenSaveHandle = null; inputFailure = null;
    selectionPhase = 'sample-fetch';
    const name = button.dataset.demo;
    const response = await fetch(`./fixtures/${name}.mp4`, {signal: op.controller.signal}); operations.check(op);
    if (!response.ok) throw Error('SAMPLE_UNAVAILABLE');
    const blob = await response.blob(); operations.check(op);
    file = new File([blob], `${name}.mp4`, {type: 'video/mp4'});
    preset = {layout: name.endsWith('sbs') ? 'sbs' : 'tb', fov: name.includes('360') ? 360 : 180};
    await prepare(file, preset, op);
  } catch (e) { if (operations.owns(op)) failPreparation(e, file, preset); }
  finally { finish(op); }
};
for (const id of ['layout', 'fov', 'sampling', 'mode', 'size', 'output-shape', 'output-scale', 'execution-route', 'confirmed']) $(id).addEventListener('change', async () => {
  if (operations.current || registryBusy) return;
  if (['layout', 'fov', 'sampling'].includes(id)) $('confirmed').checked = false;
  // Settings cannot repair a rejected input or replace its failure record.
  if (!source) { update(); return; }
  const op = begin('settings');
  try { await clearResult(); operations.check(op); $('status').textContent = '設定を変更しました。動画を作成してください。'; }
  catch (e) { if (operations.owns(op)) statusError(e); }
  finally { finish(op); }
});
$('run').onclick = async () => {
  if (operations.current || registryBusy || !source) return;
  if (saveRequired() && (indexedUnavailable() || !chosenSaveHandle)) {
    $('status').textContent = indexedUnavailable() || '先に保存先を選んでください。'; update(); return;
  }
  const op = begin('convert'), started = performance.now(), input = source;
  const settings = {...outputSettings(), mode: $('mode').value, layout: $('layout').value, fov: Number($('fov').value), sampling: $('sampling').value, eyeSize: Number($('size').value), bitrate: Math.min(40000000, Math.max(2000000, Number($('size').value) ** 2 * 6)), confirmed: $('confirmed').checked, executionRoute: indexedSelected() ? 'indexed' : 'legacy'};
  $('progress').removeAttribute('value'); $('status').textContent = '動画を作成しています…';
  try {
    await clearResult(); operations.check(op);
    if (settings.mode === 'convert') {
      const g = outputGeometry();
      settings.bitrate = Math.min(40000000, Math.max(2000000, g.width / 2 * g.height * 6));
    }
    const r = await client.run(input, settings, {outputHandle: settings.mode === 'convert' ? chosenSaveHandle : undefined});
    try { operations.check(op); }
    catch (error) { error.diagnostics = {...r.receipt, status: 'canceled'}; throw error; }
    bindSaveSummary(r.receipt);
    result = r; record = r.receipt;
    showSaveAndCleanup(record, record.executionRoute === 'indexed' ? (record.indexedOwnership?.status === 'complete' ? 'complete' : 'pending') : undefined);
    r.receipt.page = {navigationToReadyMs: pageReadyMs, clock: 'performance.now, page', selectedAt: selectionAt, selectionToInspectedMs, runClickToPreparedMs: performance.now() - started, selectionToPreparedMs: performance.now() - selectionClock, selectionToSavedFileMs: null, fileRecoveryMs: null, playbackVerificationMs: null, timingNote: 'selection starts when a File is accepted after prior-result cleanup; includes user settings time; save completion is separate from independent file recovery', cacheState: 'unknown', userAgent: navigator.userAgent};
    outputURL = URL.createObjectURL(r.blob); $('output-video').src = outputURL; $('download').href = outputURL;
    $('download').download = input.name.replace(/\.[^.]*$/, '') + '-vr180.mp4';
    $('output-info').textContent = `${r.info.width} × ${r.info.height} · ${formatGB(r.blob.size)}`;
    $('diagnostics').textContent = JSON.stringify(r.receipt, null, 2);
    $('save-status').textContent = '出力の準備ができました。動画を確認して保存してください。';
    $('status').textContent = '作成できました。保存はまだ完了していません。下の「3 出力を確認して保存」へ進んでください。'; $('progress').value = 1;
    if (r.receipt.saveCompleted) {
      chosenSaveHandle = null;
      r.receipt.page.selectionToSavedFileMs = performance.now() - selectionClock;
      $('save-status').textContent = '選択した保存先への直接保存と、VR情報の書き込み後の照合が完了しました。全体ハッシュは保存済みファイルから取得しています。';
      $('save-progress').hidden = false; $('save-progress').value = 1;
      $('status').textContent = '作成と保存が完了しました。';
      $('diagnostics').textContent = JSON.stringify(r.receipt, null, 2);
    }
    if (r.receipt.containerMetadataTransfer?.omittedContainers) {
      $('status').textContent += ' 一部の付加情報は保持できていません。元動画を残し、処理記録を確認してください。';
    }
  } catch (e) {
    if (operations.owns(op)) {
      statusError(e);
      if (!$('save-progress').hidden) {
        $('save-progress').hidden = true;
        $('save-status').textContent = $('status').textContent;
      }
    }
  }
  finally { finish(op); }
};
$('cancel').onclick = async () => {
  if (client.outputStateUnknown) {
    $('receipt').click();
    record = client.acknowledgeUnknownOutput(); chosenSaveHandle = null;
    $('cleanup-warning').textContent = '前の保存状態は不明のまま記録しました。保存先のファイルを確認してください。';
    update(); return;
  }
  if (pendingSaveCleanup && !operations.current) {
    const op = begin('saveCleanup'), pending = pendingSaveCleanup;
    try {
      const cleanup = await pending.retry();
      if (cleanup?.state === 'aborted' && cleanup.committed === false) pending.attempt.commitState = 'aborted';
      pending.attempt.cleanup = {...pending.attempt.cleanup, status: 'complete', retrySucceededAt: new Date().toISOString()};
      pendingSaveCleanup = null; $('cleanup-warning').textContent = '';
      $('diagnostics').textContent = JSON.stringify(record, null, 2);
      $('save-status').textContent = '保存処理の清掃が完了しました。保存を再実行できます。';
    } catch (error) { $('cleanup-warning').textContent = `保存処理の清掃を完了できませんでした：${error.message}`; }
    finally { finish(op); }
    return;
  }
  const op = operations.current;
  if (!op && client.cleanupPending) {
    const retry = begin('cleanup');
    try { await client.dispose(); $('status').textContent = '一時ファイルを削除しました。再実行できます。'; }
    catch (error) { statusError(error); }
    finally { finish(retry); }
    return;
  }
  if (!op) return;
  operations.cancel();
  $(op.kind === 'save' ? 'save-status' : 'status').textContent = '取消処理中です。保存先の選択画面が開いている場合は閉じてください。';
  if (['save', 'chooseSave', 'saveCleanup'].includes(op.kind)) return; // Keep the prepared output for another save attempt.
  try { const pending = client.cancel(); update(); await pending; }
  catch (e) { if (!client.outputStateUnknown) $('cleanup-warning').textContent = '一時ファイルの削除に失敗しました。 ' + e.message; }
};
$('clear').onclick = async () => {
  if (operations.current || registryBusy || pendingSaveCleanup || client.cleanupPending || !result) return;
  const op = begin('clear');
  try { await clearResult(); operations.check(op); $('status').textContent = '結果を破棄しました。'; }
  catch (e) { if (operations.owns(op)) statusError(e); }
  finally { finish(op); }
};
$('go-to-save').onclick = event => {
  event.preventDefault();
  const heading = $('result-heading');
  heading.focus({preventScroll: true});
  $('result').scrollIntoView({block: 'start'});
};
$('download').onclick = event => {
  if (operations.current || registryBusy || pendingSaveCleanup || client.cleanupPending || !result) { event.preventDefault(); return; }
  const attempt = createSaveAttempt(result.receipt, 'download-request', {status: 'download-requested'});
  attempt.finishedAt = attempt.startedAt; result.receipt.saveAttempts.push(attempt);
  $('save-status').textContent = 'ダウンロードを開始しました。保存先でファイルを確認してください。';
};
async function pickSaveDestination() {
  const suggestedName = source?.name.replace(/\.[^.]*$/, '') + '-vr180.mp4';
  const handle = await showSaveFilePicker({suggestedName, types: [{description: 'MP4動画', accept: {'video/mp4': ['.mp4']}}]});
  if ((await handle.getFile()).size !== 0) throw Error('OUTPUT_MUST_BE_NEW_FILE');
  return handle;
}
$('choose-save').onclick = async () => {
  if (operations.current || registryBusy || pendingSaveCleanup || client.cleanupPending || !source) return;
  const op = begin('chooseSave');
  try { const handle = await pickSaveDestination(); operations.check(op); chosenSaveHandle = handle; $('status').textContent = '保存先を選択しました。動画の作成へ進めます。'; }
  catch (error) { $('status').textContent = error.name === 'AbortError' ? '保存先の選択を取り消しました。' : error.message === 'OUTPUT_MUST_BE_NEW_FILE' ? '保存用の新しいファイル名を指定してください。' : `保存先を選べませんでした：${error.message}`; }
  finally { finish(op); }
};
$('save').onclick = async () => {
  if (operations.current || registryBusy || pendingSaveCleanup || client.cleanupPending || !result) return;
  if (typeof showSaveFilePicker !== 'function') { $('download').click(); return; }
  const op = begin('save'), captured = result, saveRequestStarted = performance.now();
  const attempt = createSaveAttempt(captured.receipt, 'prepared-copy', {status: 'saving'});
  captured.receipt.saveAttempts.push(attempt);
  const check = () => { operations.check(op); if (captured !== result) throw new DOMException('Result changed', 'AbortError'); };
  let saveStarted = null;
  showSaveProgress('保存先を確認しています…');
  $('status').textContent = '動画の作成は完了しています。保存状況は下の3で確認できます。';
  try {
    const handle = chosenSaveHandle ?? await pickSaveDestination(); check();
    saveStarted = performance.now(); attempt.timings.permissionWaitMs = saveStarted - saveRequestStarted;
    attempt.commitState = 'pending';
    showSaveProgress('保存先へ書き込んでいます…', 0);
    const saved = await saveBlobToFile(captured.blob, handle, {signal: op.controller.signal,
      expectedSha256: captured.receipt.output.sha256,
      onProgress: p => {
        if (p.phase === 'verify') { attempt.commitState = 'committed'; attempt.verificationState = 'running'; }
        if (!operations.owns(op) || captured !== result) return;
        showSaveProgress(p.phase === 'verify' ? '保存したファイルの内容を照合しています…' : '保存先へ書き込んでいます…',
          (p.bytesHashed ?? p.bytes ?? 0) / captured.blob.size);
      }});
    // Backend observations belong to this result even if a cancel arrived just
    // before this continuation. Never turn an acknowledged commit into rollback.
    Object.assign(attempt, {commitState: 'committed', bytes: saved.bytes, sha256: saved.sha256,
      hashBasis: 'prepared-output-compared', wholeFileHashCompared: saved.hashMatched === true});
    attempt.timings.filePhases = saved.timings ?? null;
    if (saved.bytes !== captured.receipt.output.bytes || saved.sha256 !== captured.receipt.output.sha256 || !saved.hashMatched) {
      throw Error('SAVED_RESULT_VERIFICATION_MISMATCH');
    }
    Object.assign(attempt, {status: 'verified', verificationState: 'passed'});
    attempt.timings.saveApiMs = performance.now() - saveStarted;
    attempt.timings.selectionToSavedFileMs = performance.now() - selectionClock;
    captured.receipt.page.selectionToSavedFileMs = attempt.timings.selectionToSavedFileMs;
    chosenSaveHandle = null; check();
    showSaveProgress('保存と内容の照合が完了しました。保存したファイルのサイズと全体ハッシュが一致しました。', 1);
  } catch (e) {
    if (e.fileTimings) attempt.timings.filePhases = e.fileTimings;
    const outputState = e.saveOutputState;
    if (e.saveWriteCommitted || outputState?.committed) attempt.commitState = 'committed';
    else if (attempt.commitState === 'pending') attempt.commitState = outputState?.state === 'not-started' ? 'not-started'
      : outputState?.state === 'aborted' ? 'aborted' : 'unknown';
    if (attempt.verificationState !== 'passed') {
      attempt.status = e.name === 'AbortError' ? 'canceled' : 'failed';
      attempt.verificationState = attempt.commitState === 'committed' ? e.name === 'AbortError' ? 'canceled' : 'failed' : 'not-run';
    }
    attempt.errorCode = e.message;
    if (e.retryCleanup) {
      attempt.cleanup = {status: 'failed', errorCode: e.cleanupError ?? null};
      pendingSaveCleanup = {retry: e.retryCleanup, attempt};
      $('cleanup-warning').textContent = `保存処理の清掃が未完了です。清掃を再試行してください。 ${e.cleanupError}`;
    }
    if (attempt.commitState === 'committed' || e.message === 'OUTPUT_MUST_BE_NEW_FILE') chosenSaveHandle = null;
    if (operations.owns(op) && captured === result) {
      const savedBefore = summarizeSaves(captured.receipt).saveCompleted;
      $('save-status').textContent = attempt.verificationState === 'passed' ? '取消要求より先に保存と内容の照合が完了しました。'
        : savedBefore ? `前回の保存・照合は完了しています。今回の追加保存は${e.name === 'AbortError' ? '取り消しました。' : '完了できませんでした。'}`
        : attempt.commitState === 'committed' ? '書き込みは完了していますが、保存後の照合を完了できませんでした。'
        : e.message === 'OUTPUT_MUST_BE_NEW_FILE' ? '保存用の新しいファイル名を指定してください。'
        : e.name === 'AbortError' ? '保存を取り消しました。' : `保存に失敗しました：${e.message}`;
      $('save-status').textContent += pendingSaveCleanup ? ' 2の清掃ボタンで清掃を再試行してから次の処理へ進んでください。'
        : attempt.commitState === 'committed' ? '保存先のファイルを確認してください。作成した出力も保持しています。'
        : '出力を保持しています。保存を再実行できます。';
    }
  } finally {
    attempt.finishedAt = new Date().toISOString(); attempt.timings.requestToFinishedMs = performance.now() - saveRequestStarted;
    if (saveStarted === null) attempt.timings.permissionWaitMs = attempt.timings.requestToFinishedMs;
    if (saveStarted !== null) attempt.timings.saveApiMs ??= performance.now() - saveStarted;
    if (captured === result) {
      $('diagnostics').textContent = JSON.stringify(captured.receipt, null, 2);
      $('save-progress').hidden = attempt.verificationState !== 'passed';
      if (attempt.verificationState === 'passed') $('save-progress').value = 1;
    }
    finish(op);
  }
};
function sameRegistryIdentity(a, b) {
  const fields = ['format', 'inputRevision', 'namespace', 'operationId', 'ownerToken', 'schema'];
  return !!a && !!b && Object.keys(a).sort().join(',') === fields.join(',')
    && Object.keys(b).sort().join(',') === fields.join(',') && fields.every(key => a[key] === b[key]);
}
function registryRecoveryBlock(identity) {
  const retained = registryRetries.get(identity.namespace);
  if (retained && !sameRegistryIdentity(retained.identity, identity)) return '前回の清掃と所有情報が異なるため、この作業の清掃を保留します。前回の再試行情報は保持しています。';
  if (!retained && registryRetries.size >= registryRetryLimit) return '清掃の再試行を20件保持しています。保持中の作業の清掃が完了するまで、新しい清掃は開始できません。';
  return '';
}
function retainRegistryRetryRows() {
  for (const {identity} of registryRetries.values()) {
    // A changed identity must not be replaced with a previous owner's identity.
    if (!registryRows.some(row => row.identity?.namespace === identity.namespace)) {
      registryRows.push({identity, retryOnly: true});
    }
  }
}
function renderRegistryRows() {
  $('registry-job').replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '作業を選んでください';
  $('registry-job').append(placeholder);
  registryRows.forEach((row, index) => {
    const option = document.createElement('option'); option.value = String(index);
    option.disabled = !row.identity;
    option.textContent = row.identity ? `${row.identity.operationId} / ${row.retryOnly ? '前回の清掃の再試行情報を保持' : `一時保存の記録 ${row.ticketCount}件`}`
      : `${row.namespace ?? '不明な作業'} / 所有情報を確認できないため保持`;
    $('registry-job').append(option);
  });
  $('registry-job').value = ''; $('registry-confirm').checked = false;
}
function recoveryAvailable() { return !registryBusy && !operations.current && !pendingSaveCleanup && !client.current; }
$('registry-list').onclick = async () => {
  if (!recoveryAvailable()) return;
  registryBusy = true; update();
  try {
    const listed = await listIndexedJobs({limit: 20}); registryRows = listed.jobs; retainRegistryRetryRows(); renderRegistryRows();
    $('registry-status').textContent = !registryRows.length ? 'このブラウザに未完了作業の記録はありません。'
      : listed.truncated ? '先頭20件を表示しました。処理記録の作業IDと照合して選んでください。清掃後に再表示できます。'
      : '処理記録の作業IDと照合して選んでください。所有情報を確認できない記録は残します。';
  } catch (error) { $('registry-status').textContent = `未完了作業を確認できませんでした：${error.message}`; }
  finally { registryBusy = false; update(); }
};
for (const id of ['registry-job', 'registry-confirm']) $(id).addEventListener('change', () => {
  if (id === 'registry-job') {
    $('registry-confirm').checked = false;
    const row = $('registry-job').value === '' ? null : registryRows[Number($('registry-job').value)];
    $('registry-status').textContent = row?.identity ? registryRecoveryBlock(row.identity) || '処理記録の作業IDと照合してから、清掃を確認してください。' : '所有情報を確認できない記録は保持します。';
  }
  update();
});
$('registry-recover').onclick = async () => {
  if (!recoveryAvailable() || !$('registry-confirm').checked || $('registry-job').value === '') return;
  const row = registryRows[Number($('registry-job').value)]; if (!row?.identity) return;
  const identity = structuredClone(row.identity);
  const blocked = registryRecoveryBlock(identity);
  if (blocked) { $('registry-status').textContent = blocked; update(); return; }
  const retained = registryRetries.get(identity.namespace);
  registryBusy = true; update();
  try {
    const result = await (retained ? retained.retry() : recoverIndexedJob(identity));
    if (result?.status !== 'complete') throw Error('INDEXED_CLEANUP_UNCONFIRMED');
    if (!sameRegistryIdentity(result.identity, identity)) throw Error('INDEXED_CLEANUP_IDENTITY_MISMATCH');
    registryRetries.delete(identity.namespace);
    if (record?.operationId === identity.operationId && record.inputRevision === identity.inputRevision
      && (!record.indexedOwnership?.identity || sameRegistryIdentity(record.indexedOwnership.identity, identity))) {
      const observation = Object.freeze({status: 'complete', identity: Object.freeze({...identity}),
        observedAt: new Date().toISOString(), source: 'explicit-registry-recovery', externalSaveState: 'NOT_APPLICABLE'});
      record = {...record, internalCleanupRecovery: observation};
      $('diagnostics').textContent = JSON.stringify(record, null, 2);
      showSaveAndCleanup(record, 'complete');
    }
    registryRows = registryRows.filter(item => item.identity?.namespace !== identity.namespace); renderRegistryRows();
    $('registry-status').textContent = '選択した作業の一時データを清掃しました。保存先の動画には触れていません。動画の保存状態は、処理記録と保存先で別に確認してください。';
  } catch (error) {
    if (!retained && typeof error.retryCleanup === 'function') registryRetries.set(identity.namespace, {identity: Object.freeze(identity), retry: error.retryCleanup});
    $('registry-status').textContent = /LEASE_BUSY|LOCK_BUSY/.test(error.message)
      ? '別の処理がこの作業を使用しています。完了後に清掃を再試行してください。'
      : `所有確認または清掃が完了しなかったため、記録を保持しています：${error.message}`;
  } finally { registryBusy = false; update(); }
};
$('receipt').onclick = () => {
  if ((operations.current && !client.cleanupPending && !pendingSaveCleanup) || !record) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type: 'application/json'})), a = document.createElement('a');
  a.href = url; a.download = 'vr180-receipt.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
};
addEventListener('pagehide', () => { operations.cancel(); client.dispose().catch(() => {}); if (inputURL) URL.revokeObjectURL(inputURL); if (outputURL) URL.revokeObjectURL(outputURL); });
update();
pageReadyMs = performance.now();
