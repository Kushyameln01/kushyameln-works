import {StereoClient} from '../shared/vr180/client.mjs';
import {OperationScope} from '../shared/vr180/operations.mjs';
const $ = id => document.getElementById(id);
const operations = new OperationScope();
let source = null, result = null, inputURL = null, outputURL = null, selectionClock = null, selectionAt = null;
const client = new StereoClient({onEvent: m => {
  if (m.type === 'progress') {
    const p = m.progress;
    $('progress').value = typeof p === 'number' ? p : p?.ratio ?? 0;
    $('status').textContent = p?.phase === 'finalize' ? '動画ファイルを仕上げています…' : '動画を変換しています…';
  }
  if (m.type === 'cleanup-error') $('cleanup-warning').textContent = '一時ファイルの削除に失敗しました。 ' + m.error;
}});
const errors = {
  CONFIRM_PROJECTION_AND_EYES: '元映像の投影・左右配置を確認してください。',
  STEREO_METADATA_CONFLICT: '選んだ左右配置と、動画に記録された情報が一致しません。',
  FOV_METADATA_CONFLICT: '選んだ視野角と、動画に記録された情報が一致しません。',
  EYE_DIMENSIONS_AND_FOV_CONFLICT: 'この検証版は、各眼が180°なら正方形、360°なら横2：縦1の素材に対応します。',
  COPY_REQUIRES_180_DEGREES: '360°素材は「180°へ切出し・横並びへ変換」を選んでください。',
  CAMERA_MESH_NOT_SUPPORTED_YET: 'このカメラのメッシュ投影は、まだ対応していません。',
  OPFS_UNAVAILABLE: 'このブラウザでは変換用の一時保存を利用できません。'
};
function statusError(e) {
  $('status').textContent = e.name === 'AbortError' ? '取り消しました。再実行できます。' : errors[e.message] || `処理できませんでした：${e.message}`;
}
function update() {
  const busy = !!operations.current;
  $('size-label').hidden = $('mode').value === 'copy';
  $('mode-note').textContent = $('mode').value === 'copy' ? '180°の映像と音声をそのまま保ち、VR情報を整えます。' : '各眼の正面180°を横並びにして再圧縮します。360°素材の背面は出力されません。';
  $('run').disabled = busy || !source || !$('confirmed').checked;
  $('cancel').disabled = !busy;
  for (const id of ['layout', 'fov', 'mode', 'size', 'confirmed', 'file', 'clear', 'receipt']) $(id).disabled = busy;
  $('save').disabled = busy || !result;
  $('download').setAttribute('aria-disabled', String(busy));
  for (const button of document.querySelectorAll('[data-demo]')) button.disabled = busy;
}
function begin(kind) { const op = operations.begin(kind); update(); return op; }
function finish(op) { if (operations.finish(op)) update(); }
async function clearResult() {
  $('output-video').pause(); $('output-video').removeAttribute('src'); $('output-video').load();
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = null; result = null; $('result').hidden = true;
  await client.dispose();
}
async function prepare(file, preset, op) {
  await clearResult(); operations.check(op);
  source = file; selectionClock = performance.now(); selectionAt = new Date().toISOString(); $('confirmed').checked = false;
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
    const r = await client.run(input, settings); operations.check(op);
    result = r;
    r.receipt.page = {selectedAt: selectionAt, runClickToPreparedMs: performance.now() - started, selectionToPreparedMs: performance.now() - selectionClock, selectionToSavedFileMs: null, fileRecoveryMs: null, playbackVerificationMs: null, timingNote: 'selection starts when a File is accepted after prior-result cleanup; includes user settings time; save completion is separate from independent file recovery', cacheState: 'unknown', userAgent: navigator.userAgent};
    outputURL = URL.createObjectURL(r.blob); $('output-video').src = outputURL; $('download').href = outputURL;
    $('download').download = input.name.replace(/\.[^.]*$/, '') + '-vr180.mp4';
    $('output-info').textContent = `${r.info.width} × ${r.info.height} · ${(r.blob.size / 1024 / 1024).toFixed(2)} MiB`;
    $('diagnostics').textContent = JSON.stringify(r.receipt, null, 2); $('result').hidden = false;
    $('save-status').textContent = '出力の準備ができました。動画を確認して保存してください。';
    $('status').textContent = '作成できました。保存はまだ完了していません。'; $('progress').value = 1;
  } catch (e) { if (operations.owns(op)) statusError(e); }
  finally { finish(op); }
};
$('cancel').onclick = async () => {
  const op = operations.current; if (!op) return;
  operations.cancel(); $('status').textContent = '取消処理中です。保存先の選択画面が開いている場合は閉じてください。';
  if (op.kind === 'save') return; // Keep the output available for another save attempt.
  try { await client.cancel(); }
  catch (e) { $('cleanup-warning').textContent = '一時ファイルの削除に失敗しました。 ' + e.message; }
};
$('clear').onclick = async () => {
  if (operations.current) return;
  const op = begin('clear');
  try { await clearResult(); operations.check(op); $('status').textContent = '結果を破棄しました。'; }
  catch (e) { if (operations.owns(op)) statusError(e); }
  finally { finish(op); }
};
$('download').onclick = event => {
  if (operations.current || !result) { event.preventDefault(); return; }
  result.receipt.downloadRequestedAt = new Date().toISOString();
  $('save-status').textContent = 'ダウンロードを開始しました。保存先でファイルを確認してください。';
};
$('save').onclick = async () => {
  if (operations.current || !result) return;
  if (typeof showSaveFilePicker !== 'function') { $('download').click(); return; }
  const op = begin('save'), captured = result, saveRequestStarted = performance.now();
  let writable = null, reader = null, committed = false;
  const check = () => { operations.check(op); if (captured !== result) throw new DOMException('Result changed', 'AbortError'); };
  try {
    const handle = await showSaveFilePicker({suggestedName: $('download').download, types: [{description: 'MP4動画', accept: {'video/mp4': ['.mp4']}}]}); check();
    const start = performance.now(); captured.receipt.savePermissionWaitMs = start - saveRequestStarted; writable = await handle.createWritable(); check(); reader = captured.blob.stream().getReader();
    for (;;) { check(); const n = await reader.read(); check(); if (n.done) break; await writable.write(n.value); }
    check(); await writable.close(); committed = true; captured.receipt.saveWriteCommitted = true; writable = null;
    const saved = await handle.getFile(); check();
    if (saved.size !== captured.blob.size) throw Error('SAVED_SIZE_MISMATCH');
    captured.receipt.page.selectionToSavedFileMs = performance.now() - selectionClock;
    captured.receipt.saveCompleted = true; captured.receipt.saveApiMs = performance.now() - start; captured.receipt.savedSize = saved.size;
    $('save-status').textContent = '保存先ファイルのサイズを確認しました。VRプレイヤーでの再生確認は別途必要です。';
    $('status').textContent = '保存先への書き込みと、ファイルサイズの確認が完了しました。';
  } catch (e) {
    await writable?.abort().catch(() => {});
    if (operations.owns(op)) {
      $('save-status').textContent = committed ? '保存先への書き込みは完了しています。保存後の確認を完了できませんでした。' : e.name === 'AbortError' ? '保存を取り消しました。' : `保存に失敗しました：${e.message}`;
      $('status').textContent = committed ? '保存先のファイルを確認してください。出力も引き続き保持しています。' : '出力は保持しています。保存を再実行できます。';
    }
  } finally { reader?.releaseLock(); finish(op); }
};
$('receipt').onclick = () => {
  if (operations.current || !result) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result.receipt, null, 2)], {type: 'application/json'})), a = document.createElement('a');
  a.href = url; a.download = 'vr180-receipt.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
};
addEventListener('pagehide', () => { operations.cancel(); client.dispose().catch(() => {}); if (inputURL) URL.revokeObjectURL(inputURL); if (outputURL) URL.revokeObjectURL(outputURL); });
update();
