import { SOURCE_PACKAGES, sha256, verifyPackageBytes, generateFtAssets } from './lib/generate-unity.mjs';
import { readUnityPackage, writeUnityPackage, MAX_UNITY_PACKAGE_BYTES } from './lib/unity-package.mjs';
import { instantiateFtKernel } from './lib/kernel/load-kernel.mjs';

let running = false;
const specs = Object.entries(SOURCE_PACKAGES);
const send = (id, type, data = {}) => self.postMessage({ id, type, ...data });
const progress = (id, message, value) => send(id, 'progress', { message, value });

class InputError extends Error {
  constructor(issues) { super('元ファイルを確認してください。'); this.issues = issues; }
}

async function identify(files, id) {
  if (!Array.isArray(files) || files.length === 0) throw new InputError(['必要な4ファイルを選択してください。']);
  if (files.length > 8) throw new InputError([`${files.length}ファイルが選択されています。必要な4ファイルだけを選び直してください。`]);
  const inputs = {}, names = {}, issues = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (!(file instanceof Blob) || typeof file.name !== 'string') throw new InputError(['選択したファイルを読み取れません。選び直してください。']);
    progress(id, `元ファイルを照合しています（${index + 1}/${files.length}）：${file.name}`, 1);
    if (file.size === 0) { issues.push(`「${file.name}」は空のファイルです。`); continue; }
    if (file.size > MAX_UNITY_PACKAGE_BYTES) {
      issues.push(`「${file.name}」は読み込めるサイズ（${MAX_UNITY_PACKAGE_BYTES / 1024 / 1024}MB）を超えています。`);
      continue;
    }
    let bytes;
    try { bytes = new Uint8Array(await file.arrayBuffer()); }
    catch { issues.push(`「${file.name}」を読み取れませんでした。ファイルを選び直してください。`); continue; }
    const digest = await sha256(bytes);
    const match = specs.find(([, spec]) => spec.sha256 === digest);
    if (!match) { issues.push(`「${file.name}」の内容は対応する原本と一致しません。別のバージョンや変更済みファイルは使用できません。`); continue; }
    const [key, spec] = match;
    if (inputs[key]) { issues.push(`${spec.name}が重複しています（「${names[key]}」「${file.name}」）。`); continue; }
    inputs[key] = bytes;
    names[key] = file.name;
  }
  for (const [key, spec] of specs) if (!inputs[key]) issues.push(`不足：${spec.name}`);
  if (issues.length) throw new InputError(issues);
  await verifyPackageBytes(inputs);
  return inputs;
}

self.addEventListener('message', async event => {
  const { type, id, files } = event.data ?? {};
  if (type !== 'generate' || !Number.isSafeInteger(id)) return;
  if (running) { send(id, 'error', { message: '生成処理はすでに実行中です。完了するか、取消してから再実行してください。', issues: [] }); return; }
  running = true;
  try {
    const inputs = await identify(files, id);
    progress(id, 'Hike/WASMを読み込んでいます。', 2);
    const response = await fetch(new URL('./lib/kernel/ft-kernel.wasm', import.meta.url));
    if (!response.ok) throw new Error('Hike/WASMを読み込めませんでした。ページを再読み込みして試してください。');
    const kernel = await instantiateFtKernel(await response.arrayBuffer());
    const packages = {};
    for (const [key, spec] of specs) {
      progress(id, `元ファイルを展開しています：${spec.name}`, 3);
      packages[key] = await readUnityPackage(inputs[key]);
      delete inputs[key];
    }
    progress(id, 'FTアセットを生成し、構造と数値を静的に検証しています。', null);
    const { assets, report, readme, structureIndex, generationSpec } = await generateFtAssets(packages, kernel);
    progress(id, 'ダウンロード用のUnitypackageを作成しています。', 5);
    const archive = await writeUnityPackage(assets);
    const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength);
    self.postMessage({ id, type: 'complete', archiveBuffer, report, readme, structureIndex, generationSpec,
      assetCount: assets.length, archiveBytes: archive.byteLength }, [archiveBuffer]);
  } catch (error) {
    send(id, 'error', { message: error instanceof InputError ? error.message : '生成を完了できませんでした。',
      issues: error instanceof InputError ? error.issues : [error?.message || '原因を特定できませんでした。ページを再読み込みして試してください。'] });
  } finally {
    running = false;
  }
});
