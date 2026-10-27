import { createDecodeSmoothBuilder } from './pipeline.mjs?v=vrcft5-rules-1';

const form = document.querySelector('#generator');
const namesInput = document.querySelector('#names');
const generateButton = document.querySelector('#generate');
const cancelButton = document.querySelector('#cancel');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const resultSection = document.querySelector('#result');
const summary = document.querySelector('#summary');
const download = document.querySelector('#download');
const conflicts = document.querySelector('#conflicts');
const conflictDetails = document.querySelector('#conflict-details');

let inputRevision = 0;
let sequence = 0;
let activeRun = null;
let downloadUrl = null;
let pageActive = true;

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function setBusy(busy) {
  form.setAttribute('aria-busy', String(busy));
  generateButton.disabled = busy;
  cancelButton.hidden = !busy;
  progress.hidden = !busy;
  if (!busy) progress.removeAttribute('value');
}

function clearOutput() {
  if (downloadUrl !== null) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  download.removeAttribute('href');
  download.removeAttribute('download');
  resultSection.hidden = true;
  summary.textContent = '';
  conflicts.hidden = true;
  conflicts.open = false;
  conflictDetails.textContent = '';
}

function callLifecycle(builder, method) {
  try {
    const pending = builder[method]();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch {
    // This run is already invalidated; lifecycle errors cannot restore its UI.
  }
}

function disposeRun(run) {
  if (!run.builder || run.disposed) return;
  run.disposed = true;
  callLifecycle(run.builder, 'dispose');
}

function invalidateRun() {
  sequence += 1;
  const run = activeRun;
  activeRun = null;
  if (run?.builder) {
    callLifecycle(run.builder, 'cancel');
    disposeRun(run);
  }
  clearOutput();
  setBusy(false);
}

function isCurrent(run) {
  return pageActive && activeRun === run && run.sequence === sequence && run.revision === inputRevision;
}

function showProgress(run, event) {
  if (!isCurrent(run)) return;
  const label = typeof event?.label === 'string' && event.label.length > 0
    ? event.label
    : '生成しています。';
  if (Number.isFinite(event?.completed) && Number.isFinite(event?.total) && event.total > 0) {
    const completed = Math.min(event.total, Math.max(0, event.completed));
    progress.max = event.total;
    progress.value = completed;
    setStatus(`${label}（${completed} / ${event.total}）`);
  } else {
    progress.removeAttribute('value');
    setStatus(label);
  }
}

function showConflicts(value) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return;
  try {
    conflictDetails.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    conflictDetails.textContent = String(value);
  }
  conflicts.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pageActive) return;
  invalidateRun();
  namesInput.removeAttribute('aria-invalid');

  if (namesInput.value.length === 0) {
    namesInput.setAttribute('aria-invalid', 'true');
    setStatus('パラメータ名を1行に1つ入力してください。', true);
    namesInput.focus();
    return;
  }

  // Splitting lines is the only input conversion. Each name reaches the pipeline unchanged.
  const names = namesInput.value.split(/\r\n|\n|\r/);
  const run = { sequence, revision: inputRevision, builder: null, disposed: false };
  activeRun = run;
  setBusy(true);
  setStatus('生成しています。');

  try {
    run.builder = createDecodeSmoothBuilder({ onProgress: (update) => showProgress(run, update) });
    const output = await run.builder.build(names, { inputRevision: run.revision });
    if (!isCurrent(run)) return;
    if (!(output?.archive instanceof Uint8Array) || output.archive.byteLength === 0 || typeof output.fileName !== 'string' || output.fileName.length === 0) {
      throw new Error('保存するファイルを取得できませんでした。もう一度生成してください。');
    }

    downloadUrl = URL.createObjectURL(new Blob([output.archive], { type: 'application/octet-stream' }));
    download.href = downloadUrl;
    download.download = output.fileName;
    const counts = [];
    if (Number.isInteger(output.summary?.targetCount)) counts.push(`パラメータ ${output.summary.targetCount}件`);
    if (Number.isInteger(output.summary?.layerCount)) counts.push(`${output.summary.layerCount}レイヤー`);
    summary.textContent = counts.join(' ・ ');
    summary.hidden = counts.length === 0;
    resultSection.hidden = false;
    setStatus('生成できました。ファイルを保存してください。');
  } catch (error) {
    if (!isCurrent(run)) return;
    setStatus(typeof error?.message === 'string' && error.message.length > 0 ? error.message : '生成できませんでした。もう一度お試しください。', true);
    showConflicts(error?.issues ?? error?.conflicts);
  } finally {
    if (isCurrent(run)) {
      activeRun = null;
      setBusy(false);
    }
    disposeRun(run);
  }
});

namesInput.addEventListener('input', () => {
  inputRevision += 1;
  const wasBusy = activeRun !== null;
  invalidateRun();
  namesInput.removeAttribute('aria-invalid');
  setStatus(wasBusy ? '入力が変わったため、生成を取り消しました。' : 'パラメータ名を入力したら、生成してください。');
});

cancelButton.addEventListener('click', () => {
  invalidateRun();
  setStatus('生成を取り消しました。入力はそのまま再生成できます。');
  generateButton.focus();
});

window.addEventListener('pagehide', () => {
  pageActive = false;
  invalidateRun();
});

window.addEventListener('pageshow', (event) => {
  pageActive = true;
  if (event.persisted) setStatus('パラメータ名を確認してください。');
});
