import {StereoClient} from '../shared/vr180/client.mjs';
import {OperationScope} from '../shared/vr180/operations.mjs';
import {saveBlobToFile} from '../shared/vr180/file-output.mjs';
import {bindSaveSummary, createSaveAttempt, summarizeSaves} from '../shared/vr180/save-record.mjs';
const $ = id => document.getElementById(id);
const operations = new OperationScope();
let record = null;
let source = null, result = null, inputURL = null, outputURL = null, selectionClock = null, selectionAt = null;
let chosenSaveHandle = null, pendingSaveCleanup = null;
const client = new StereoClient({onEvent: m => {
  if (m.type === 'progress') {
    const p = m.progress;
    $('progress').value = typeof p === 'number' ? p : p?.ratio ?? 0;
    $('status').textContent = ({finalize: '動画ファイルを仕上げています…', saveCommit: '保存ファイルを確定して内容を確認しています…', inputHash: '入力ファイルの照合用ハッシュを計算しています…', outputHash: '出力ファイルの照合用ハッシュを計算しています…'})[p?.phase] ?? '動画を変換しています…';
  }
  if (m.type === 'cleanup-error') {
    if (m.diagnostics) { record = m.diagnostics; $('diagnostics').textContent = JSON.stringify(record, null, 2); }
    $('cleanup-warning').textContent = '一時ファイルの清掃が完了していません。削除を再試行してください。 ' + m.error;
    $('status').textContent = '清掃の完了を待っています。新しい処理はまだ開始できません。';
    if (m.error === 'DIRECT_SAVE_STATE_UNKNOWN') {
      chosenSaveHandle = null;
      $('cleanup-warning').textContent = '処理担当が停止したため、保存先への書き込み・取消の結果を確認できません。「記録を保存して処理を終了」で記録を残し、保存先のファイルを確認してください。';
      $('status').textContent = '保存状態が不明です。取消完了とは判定していません。';
    }
    update();
  }
  if (m.type === 'cleanup-complete') { $('cleanup-warning').textContent = ''; update(); }
}});
const errors = {
  INPUT_DECODE_UNSUPPORTED: 'このブラウザでは入力動画を復号できません。処理記録で対応状況を確認できます。',
  OUTPUT_ENCODE_UNSUPPORTED: 'このブラウザでは指定サイズのH.264動画を書き出せません。処理記録で対応状況を確認できます。',
  INPUT_DECODE_AND_OUTPUT_ENCODE_UNSUPPORTED: 'このブラウザでは入力の復号と、指定サイズのH.264書出しの両方に対応できません。',
  CONFIRM_PROJECTION_AND_EYES: '元映像の投影・左右配置を確認してください。',
  STEREO_METADATA_CONFLICT: '選んだ左右配置と、動画に記録された情報が一致しません。',
  FOV_METADATA_CONFLICT: '選んだ視野角と、動画に記録された情報が一致しません。',
  EYE_DIMENSIONS_AND_FOV_CONFLICT: 'この検証版は、各眼が180°なら正方形、360°なら横2：縦1の素材に対応します。',
  COPY_REQUIRES_180_DEGREES: '360°素材は「180°へ切出し・横並びへ変換」を選んでください。',
  CAMERA_MESH_NOT_SUPPORTED_YET: 'このカメラのメッシュ投影は、まだ対応していません。',
  CONVERSION_INDEX_INFO_INVALID: '変換前に動画の索引を確認できませんでした。処理記録を確認してください。',
  CONVERSION_SAMPLE_LIMIT_EXCEEDED: 'この動画の映像・音声サンプル数は、現在の変換上限10万件を超えています。大容量・長時間の変換にはまだ対応していません。',
  CONVERSION_METADATA_LIMIT_EXCEEDED: 'この動画の索引・メタデータ量は、現在の変換上限16MiBを超えています。',
  DIRECT_OUTPUT_LIMIT_EXCEEDED: 'VR情報を含めた直接保存の出力が、現在の1GiB上限を超えました。',
  CONVERSION_OUTPUT_LIMIT_EXCEEDED: 'VR情報を含めた変換後の動画が、現在の1GiB上限を超えました。',
  OUTPUT_MUST_BE_NEW_FILE: '保存用の新しいファイル名を指定してください。既存の内容は上書きしていません。',
  OPFS_UNAVAILABLE: 'このブラウザでは変換用の一時保存を利用できません。'
};
function statusError(e) {
  if (e.diagnostics) { record = e.diagnostics; $('diagnostics').textContent = JSON.stringify(record, null, 2); }
  $('status').textContent = client.cleanupPending ? '清掃が完了していません。削除を再試行してください。' : e.name === 'AbortError' ? '取り消しました。再実行できます。' : errors[e.message] || errors[e.message?.split(':')[0]] || `処理できませんでした：${e.message}`;
  if (e.diagnostics?.saveWriteCommitted) {
    chosenSaveHandle = null;
    $('status').textContent = e.diagnostics.saveCompleted ? '取消要求が届く前に、保存と内容の確認が完了しています。保存先のファイルを確認してください。' : '保存先への書き込みは完了しましたが、その後の確認を完了できませんでした。保存先のファイルと処理記録を確認してください。';
  }
  if (e.diagnostics?.directSave?.status === 'unknown') $('status').textContent = '保存状態が不明な処理を終了しました。保存先のファイルを確認し、次の処理には新しい保存先を選んでください。';
}
function update() {
  const busy = !!operations.current, cleanupPending = client.cleanupPending || !!pendingSaveCleanup;
  $('size-label').hidden = $('mode').value === 'copy';
  $('mode-note').textContent = $('mode').value === 'copy' ? '180°の映像と音声をそのまま保ち、VR情報を整えます。' : '各眼の正面180°を横並びにして再圧縮します。360°素材の背面は出力されません。';
  $('run').disabled = busy || cleanupPending || !source || !$('confirmed').checked;
  $('run').textContent = chosenSaveHandle && $('mode').value === 'convert' ? '動画を作成して保存' : 'VR180動画を作成';
  $('cancel').disabled = (!busy && !cleanupPending) || operations.current?.kind === 'saveCleanup';
  $('cancel').textContent = pendingSaveCleanup ? '保存処理の清掃を再試行' : cleanupPending ? '一時ファイル削除を再試行' : '取り消す';
  if (client.outputStateUnknown) $('cancel').textContent = '記録を保存して処理を終了';
  for (const id of ['layout', 'fov', 'mode', 'size', 'confirmed', 'file', 'clear', 'receipt']) $(id).disabled = busy || cleanupPending;
  $('save').disabled = busy || cleanupPending || !result;
  $('choose-save').disabled = busy || cleanupPending || !source || typeof globalThis.showSaveFilePicker !== 'function';
  $('save-destination').textContent = chosenSaveHandle ? `保存先：${chosenSaveHandle.name}${$('mode').value === 'convert' ? '。作成時にこの保存先へ直接書き込みます。' : '。作成後に保存してください。'}` : typeof globalThis.showSaveFilePicker === 'function' ? '保存先は作成前にも選べます。保存用の新しいファイル名を指定してください。' : 'このブラウザでは、作成後にダウンロードして保存します。';
  $('receipt').disabled = (busy && !cleanupPending) || !record;
  $('download').setAttribute('aria-disabled', String(busy || cleanupPending));
  for (const button of document.querySelectorAll('[data-demo]')) button.disabled = busy || cleanupPending;
}
function begin(kind) { const op = operations.begin(kind); update(); return op; }
function finish(op) { if (operations.finish(op)) update(); }
async function clearResult() {
  if (pendingSaveCleanup) throw Error('SAVE_CLEANUP_INCOMPLETE');
  $('output-video').pause(); $('output-video').removeAttribute('src'); $('output-video').load();
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = null; result = null; $('result').hidden = true;
  await client.dispose();
  record = null; $('diagnostics').textContent = '処理記録はありません。';
}
async function prepare(file, preset, op) {
  await clearResult(); operations.check(op);
  source = file; chosenSaveHandle = null; selectionClock = performance.now(); selectionAt = new Date().toISOString(); $('confirmed').checked = false;
  if (inputURL) URL.revokeObjectURL(inputURL);
  inputURL = URL.createObjectURL(file); $('input-video').src = inputURL; $('input-video').hidden = false;
  $('status').textContent = '動画の形式を確認しています…';
  const probe = await client.run(file, {mode: 'inspect'}); operations.check(op);
  const i = probe.info;
  $('input-info').textContent = `${file.name} · ${i.width} × ${i.height} · ${(file.size / 1024 / 1024).toFixed(2)} MiB`;
  if (preset) {
    $('layout').value = preset.layout; $('fov').value = String(preset.fov);
    $('mode').value = preset.fov === 360 || preset.layout === 'tb' ? 'convert' : 'copy'; $('size').value = '256';
  } else {
    if (i.stereoMode === 1 || i.stereoMode === 2) $('layout').value = i.stereoMode === 1 ? 'tb' : 'sbs';
    if (i.bounds) $('fov').value = i.bounds.left === 0 ? '360' : '180';
  }
  $('diagnostics').textContent = JSON.stringify(i, null, 2);
  await client.dispose(); operations.check(op);
  $('status').textContent = '左右配置と視野角を確認して、動画を作成してください。';
}
async function select(file) {
  if (operations.current) return;
  const op = begin('prepare');
  try { await prepare(file, null, op); }
  catch (e) { if (operations.owns(op)) { source = null; statusError(e); } }
  finally { finish(op); }
}
$('file').addEventListener('change', () => { if ($('file').files[0]) select($('file').files[0]); });
for (const button of document.querySelectorAll('[data-demo]')) button.onclick = async () => {
  if (operations.current) return;
  const op = begin('prepare');
  try {
    const name = button.dataset.demo;
    const response = await fetch(`./fixtures/${name}.mp4`, {signal: op.controller.signal}); operations.check(op);
    if (!response.ok) throw Error('SAMPLE_UNAVAILABLE');
    const blob = await response.blob(); operations.check(op);
    await prepare(new File([blob], `${name}.mp4`, {type: 'video/mp4'}), {layout: name.endsWith('sbs') ? 'sbs' : 'tb', fov: name.includes('360') ? 360 : 180}, op);
  } catch (e) { if (operations.owns(op)) { source = null; statusError(e); } }
  finally { finish(op); }
};
for (const id of ['layout', 'fov', 'mode', 'size', 'confirmed']) $(id).addEventListener('change', async () => {
  if (operations.current) return;
  const op = begin('settings');
  try { await clearResult(); operations.check(op); $('status').textContent = '設定を変更しました。動画を作成してください。'; }
  catch (e) { if (operations.owns(op)) statusError(e); }
  finally { finish(op); }
});
$('run').onclick = async () => {
  if (operations.current || !source) return;
  const op = begin('convert'), started = performance.now(), input = source;
  const settings = {mode: $('mode').value, layout: $('layout').value, fov: Number($('fov').value), eyeSize: Number($('size').value), bitrate: Math.min(40000000, Math.max(2000000, Number($('size').value) ** 2 * 6)), confirmed: $('confirmed').checked};
  $('progress').removeAttribute('value'); $('status').textContent = '動画を作成しています…';
  try {
    await clearResult(); operations.check(op);
    const r = await client.run(input, settings, {outputHandle: settings.mode === 'convert' ? chosenSaveHandle : undefined});
    try { operations.check(op); }
    catch (error) { error.diagnostics = {...r.receipt, status: 'canceled'}; throw error; }
    bindSaveSummary(r.receipt);
    result = r; record = r.receipt;
    r.receipt.page = {selectedAt: selectionAt, runClickToPreparedMs: performance.now() - started, selectionToPreparedMs: performance.now() - selectionClock, selectionToSavedFileMs: null, fileRecoveryMs: null, playbackVerificationMs: null, timingNote: 'selection starts when a File is accepted after prior-result cleanup; includes user settings time; save completion is separate from independent file recovery', cacheState: 'unknown', userAgent: navigator.userAgent};
    outputURL = URL.createObjectURL(r.blob); $('output-video').src = outputURL; $('download').href = outputURL;
    $('download').download = input.name.replace(/\.[^.]*$/, '') + '-vr180.mp4';
    $('output-info').textContent = `${r.info.width} × ${r.info.height} · ${(r.blob.size / 1024 / 1024).toFixed(2)} MiB`;
    $('diagnostics').textContent = JSON.stringify(r.receipt, null, 2); $('result').hidden = false;
    $('save-status').textContent = '出力の準備ができました。動画を確認して保存してください。';
    $('status').textContent = '作成できました。保存はまだ完了していません。'; $('progress').value = 1;
    if (r.receipt.saveCompleted) {
      chosenSaveHandle = null;
      r.receipt.page.selectionToSavedFileMs = performance.now() - selectionClock;
      $('save-status').textContent = '選択した保存先への直接保存と、VR情報の書き込み後の照合が完了しました。全体ハッシュは保存済みファイルから取得しています。';
      $('status').textContent = '作成と保存が完了しました。';
      $('diagnostics').textContent = JSON.stringify(r.receipt, null, 2);
    }
  } catch (e) { if (operations.owns(op)) statusError(e); }
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
      $('status').textContent = '保存処理の清掃が完了しました。保存を再実行できます。';
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
  operations.cancel(); $('status').textContent = '取消処理中です。保存先の選択画面が開いている場合は閉じてください。';
  if (['save', 'chooseSave', 'saveCleanup'].includes(op.kind)) return; // Keep the prepared output for another save attempt.
  try { const pending = client.cancel(); update(); await pending; }
  catch (e) { if (!client.outputStateUnknown) $('cleanup-warning').textContent = '一時ファイルの削除に失敗しました。 ' + e.message; }
};
$('clear').onclick = async () => {
  if (operations.current) return;
  const op = begin('clear');
  try { await clearResult(); operations.check(op); $('status').textContent = '結果を破棄しました。'; }
  catch (e) { if (operations.owns(op)) statusError(e); }
  finally { finish(op); }
};
$('download').onclick = event => {
  if (operations.current || pendingSaveCleanup || client.cleanupPending || !result) { event.preventDefault(); return; }
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
  if (operations.current || pendingSaveCleanup || client.cleanupPending) return;
  const op = begin('chooseSave');
  try { const handle = await pickSaveDestination(); operations.check(op); chosenSaveHandle = handle; $('status').textContent = '保存先を選択しました。動画の作成へ進めます。'; }
  catch (error) { $('status').textContent = error.name === 'AbortError' ? '保存先の選択を取り消しました。' : error.message === 'OUTPUT_MUST_BE_NEW_FILE' ? '保存用の新しいファイル名を指定してください。' : `保存先を選べませんでした：${error.message}`; }
  finally { finish(op); }
};
$('save').onclick = async () => {
  if (operations.current || pendingSaveCleanup || client.cleanupPending || !result) return;
  if (typeof showSaveFilePicker !== 'function') { $('download').click(); return; }
  const op = begin('save'), captured = result, saveRequestStarted = performance.now();
  const attempt = createSaveAttempt(captured.receipt, 'prepared-copy', {status: 'saving'});
  captured.receipt.saveAttempts.push(attempt);
  const check = () => { operations.check(op); if (captured !== result) throw new DOMException('Result changed', 'AbortError'); };
  let saveStarted = null;
  try {
    const handle = chosenSaveHandle ?? await pickSaveDestination(); check();
    saveStarted = performance.now(); attempt.timings.permissionWaitMs = saveStarted - saveRequestStarted;
    attempt.commitState = 'pending';
    const saved = await saveBlobToFile(captured.blob, handle, {signal: op.controller.signal,
      expectedSha256: captured.receipt.output.sha256,
      onProgress: p => {
        if (p.phase === 'verify') { attempt.commitState = 'committed'; attempt.verificationState = 'running'; }
        if (!operations.owns(op) || captured !== result) return;
        $('progress').value = (p.bytesHashed ?? p.bytes ?? 0) / captured.blob.size;
        $('status').textContent = p.phase === 'verify' ? '保存したファイルの内容を照合しています…' : '保存先へ書き込んでいます…';
      }});
    // Backend observations belong to this result even if a cancel arrived just
    // before this continuation. Never turn an acknowledged commit into rollback.
    Object.assign(attempt, {commitState: 'committed', bytes: saved.bytes, sha256: saved.sha256,
      hashBasis: 'prepared-output-compared', wholeFileHashCompared: saved.hashMatched === true});
    if (saved.bytes !== captured.receipt.output.bytes || saved.sha256 !== captured.receipt.output.sha256 || !saved.hashMatched) {
      throw Error('SAVED_RESULT_VERIFICATION_MISMATCH');
    }
    Object.assign(attempt, {status: 'verified', verificationState: 'passed'});
    attempt.timings.saveApiMs = performance.now() - saveStarted;
    attempt.timings.selectionToSavedFileMs = performance.now() - selectionClock;
    captured.receipt.page.selectionToSavedFileMs = attempt.timings.selectionToSavedFileMs;
    chosenSaveHandle = null; check();
    $('save-status').textContent = '保存したファイルのサイズと全体ハッシュが一致しました。';
    $('status').textContent = '保存と内容の照合が完了しました。';
  } catch (e) {
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
      $('status').textContent = pendingSaveCleanup ? '清掃を再試行してから次の処理へ進んでください。'
        : attempt.commitState === 'committed' ? '保存先のファイルを確認してください。作成した出力も保持しています。'
        : '出力を保持しています。保存を再実行できます。';
    }
  } finally {
    attempt.finishedAt = new Date().toISOString(); attempt.timings.requestToFinishedMs = performance.now() - saveRequestStarted;
    if (saveStarted !== null) attempt.timings.saveApiMs ??= performance.now() - saveStarted;
    if (captured === result) $('diagnostics').textContent = JSON.stringify(captured.receipt, null, 2);
    finish(op);
  }
};
$('receipt').onclick = () => {
  if ((operations.current && !client.cleanupPending && !pendingSaveCleanup) || !record) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type: 'application/json'})), a = document.createElement('a');
  a.href = url; a.download = 'vr180-receipt.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
};
addEventListener('pagehide', () => { operations.cancel(); client.dispose().catch(() => {}); if (inputURL) URL.revokeObjectURL(inputURL); if (outputURL) URL.revokeObjectURL(outputURL); });
update();
