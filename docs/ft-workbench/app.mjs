const byId = id => document.getElementById(id);
const form = byId('generator-form'), fileInput = byId('source-files');
const generateButton = byId('generate-button'), cancelButton = byId('cancel-button');
const status = byId('generation-status'), progress = byId('generation-progress');
const result = byId('result'), errorBox = byId('generation-error');
const packageLink = byId('package-download'), reportLink = byId('report-download');
const readmeLink = byId('readme-download'), indexLink = byId('index-download');
const specLink = byId('spec-download');
let worker = null, busy = false, runId = 0;
const objectURLs = new Set();

function stopWorker() {
  if (worker) worker.terminate();
  worker = null;
}
function discardResult() {
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
  packageLink.removeAttribute('href');
  reportLink.removeAttribute('href');
  readmeLink.removeAttribute('href');
  indexLink.removeAttribute('href');
  specLink.removeAttribute('href');
  byId('result-summary').textContent = '';
  byId('parameter-summary').textContent = '';
  result.hidden = true;
}
function clearError() {
  errorBox.hidden = true;
  byId('error-summary').textContent = '';
  byId('error-details').replaceChildren();
}
function setBusy(value) {
  busy = value;
  form.setAttribute('aria-busy', String(value));
  generateButton.disabled = value || fileInput.files.length === 0;
  cancelButton.disabled = !value;
}
function fail(message, issues = []) {
  stopWorker();
  setBusy(false);
  progress.hidden = true;
  discardResult();
  status.textContent = '生成できませんでした。ファイルや表示された内容を確認してください。';
  byId('error-summary').textContent = message;
  const items = issues.filter(issue => typeof issue === 'string').map(issue => {
    const li = document.createElement('li'); li.textContent = issue; return li;
  });
  byId('error-details').replaceChildren(...items);
  errorBox.hidden = false;
  errorBox.focus();
}
function outputURL(blob) {
  const url = URL.createObjectURL(blob); objectURLs.add(url); return url;
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function createWorker() {
  const instance = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  worker = instance;
  instance.addEventListener('message', event => {
    if (worker !== instance || !busy || event.data?.id !== runId) return;
    const data = event.data;
    if (data.type === 'progress') {
      status.textContent = data.message;
      progress.hidden = false;
      if (data.value === null) progress.removeAttribute('value');
      else progress.value = data.value;
    } else if (data.type === 'error') {
      fail(data.message, data.issues ?? []);
    } else if (data.type === 'complete') {
      try {
        if (!(data.archiveBuffer instanceof ArrayBuffer) || !data.report || typeof data.report !== 'object'
          || typeof data.readme !== 'string' || !Array.isArray(data.structureIndex?.entry_trees)
          || !Array.isArray(data.generationSpec?.parameter_contract?.parameters)
          || data.generationSpec?.verification?.parameter_contract !== 'PASS') throw new Error('検証済みの生成結果を受け取れませんでした。');
        discardResult();
        packageLink.href = outputURL(new Blob([data.archiveBuffer], { type: 'application/octet-stream' }));
        reportLink.href = outputURL(new Blob([JSON.stringify(data.report, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
        readmeLink.href = outputURL(new Blob([data.readme], { type: 'text/markdown;charset=utf-8' }));
        indexLink.href = outputURL(new Blob([JSON.stringify(data.structureIndex, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
        specLink.href = outputURL(new Blob([JSON.stringify(data.generationSpec, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
        const layerCount = Array.isArray(data.report.layers) ? data.report.layers.length : null;
        byId('result-summary').textContent = `${data.assetCount}アセットを生成しました（${formatSize(data.archiveBytes)}${layerCount === null ? '' : `・FX ${layerCount} Layer`}）。`;
        const parameters = data.generationSpec.parameter_contract.parameters.filter(p => p.external.required);
        const bits = parameters.reduce((sum, p) => sum + (p.external.network_synced ? p.external.type === 'Bool' ? 1 : 8 : 0), 0);
        byId('parameter-summary').textContent = `外部Parameter ${parameters.length}項目・同期 ${bits} bit（このFT構成のみ）。MAとExpressionの登録設定・必要入力の静的検査に合格しました。`;
        result.hidden = false;
        progress.value = 6;
        status.textContent = '生成と静的検査が完了しました。Unitypackageと、構成・生成仕様・比較結果を保存できます。';
        setBusy(false);
        stopWorker(); // Release parsed source assets and the WASM instance.
      } catch (error) { fail('結果を表示できませんでした。', [error.message]); }
    }
  });
  instance.addEventListener('error', event => {
    event.preventDefault();
    if (worker !== instance) return;
    fail('処理用プログラムを読み込めませんでした。', ['ページを再読み込みして試してください。']);
  });
  instance.addEventListener('messageerror', () => {
    if (worker === instance) fail('処理結果を受け取れませんでした。', ['ファイルを選び直して再実行してください。']);
  });
  return instance;
}

fileInput.addEventListener('change', () => {
  const interrupted = busy;
  runId++;
  stopWorker();
  setBusy(false);
  discardResult();
  clearError();
  progress.hidden = true;
  const files = [...fileInput.files];
  byId('selection-status').textContent = files.length ? `${files.length}ファイルを選択中です。` : 'ファイルはまだ選択されていません。';
  byId('selected-files').replaceChildren(...files.map(file => {
    const li = document.createElement('li'); li.textContent = `${file.name}（${formatSize(file.size)}）`; return li;
  }));
  status.textContent = interrupted ? 'ファイルが変更されたため、実行中の処理を取り消しました。生成ボタンで再実行できます。'
    : 'ファイルを選択してから、生成ボタンを押してください。';
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || fileInput.files.length === 0) return;
  discardResult();
  clearError();
  runId++;
  setBusy(true);
  progress.hidden = false;
  progress.value = 0;
  status.textContent = '生成処理を開始しています。';
  try {
    const instance = worker ?? createWorker();
    instance.postMessage({ type: 'generate', id: runId, files: [...fileInput.files] });
  } catch (error) { fail('生成処理を開始できませんでした。', [error.message]); }
});

cancelButton.addEventListener('click', () => {
  if (!busy) return;
  runId++;
  stopWorker();
  setBusy(false);
  discardResult();
  clearError();
  progress.hidden = true;
  status.textContent = '処理を取り消しました。生成ボタンで再実行できます。';
  try { createWorker(); }
  catch { worker = null; } // Next manual run can retry starting the Worker.
});

window.addEventListener('pagehide', () => {
  runId++;
  stopWorker();
  setBusy(false);
  discardResult();
  progress.hidden = true;
  status.textContent = 'ページを離れたため生成結果を破棄しました。必要なら再生成してください。';
});
if (!('Worker' in window) || !('WebAssembly' in window)) {
  fileInput.disabled = true;
  generateButton.disabled = true;
  status.textContent = 'このブラウザではWorkerまたはWebAssemblyを利用できません。対応するブラウザで開いてください。';
}
