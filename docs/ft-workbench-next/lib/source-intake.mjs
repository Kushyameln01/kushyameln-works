// Browser-only intake for the next page. The reviewed r13 registry and generator
// stay in the existing page; this module does not redefine supported packages.
import { SOURCE_PACKAGES, sha256 } from '../../ft-workbench/lib/generate-unity.mjs';
import { MAX_UNITY_PACKAGE_BYTES } from '../../ft-workbench/lib/unity-package.mjs';

export const SOURCE_SLOTS = Object.freeze(Object.entries(SOURCE_PACKAGES)
  .map(([key, source]) => Object.freeze({ key, name: source.name })));

/** Inspect a complete selection. File names are presentation only; identity is
 * determined by the reviewed SHA-256 registry. No WASM or archive parsing here.
 * `inputs` is private to the Worker and is never posted to the page.
 * A superseded inspection returns null at its next asynchronous boundary. */
export async function inspectSourceFiles(files, { onFile = () => {}, isCurrent = () => true } = {}) {
  const selection = Array.isArray(files) ? files : [];
  const inputs = {}, firstNames = {}, items = [];
  for (let index = 0; index < selection.length; index++) {
    if (!isCurrent()) return null;
    const file = selection[index];
    const name = typeof file?.name === 'string' ? file.name : `ファイル ${index + 1}`;
    const size = typeof file?.size === 'number' && Number.isFinite(file.size) && file.size >= 0 ? file.size : 0;
    const item = { index, name, size, key: null, status: 'unreadable', message: '' };
    items.push(item);
    onFile({ index, count: selection.length, name });
    if (!(file instanceof Blob) || typeof file.name !== 'string') {
      item.message = `「${name}」を読み取れません。ファイルを選び直してください。`;
      continue;
    }
    if (file.size === 0) {
      item.status = 'empty'; item.message = `「${name}」は空のファイルです。`;
      continue;
    }
    if (file.size > MAX_UNITY_PACKAGE_BYTES) {
      item.status = 'too_large';
      item.message = `「${name}」は読み込めるサイズ（${MAX_UNITY_PACKAGE_BYTES / 1024 / 1024}MB）を超えています。`;
      continue;
    }
    let bytes;
    try {
      const buffer = await file.arrayBuffer();
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size) throw new Error('Incomplete file read');
      bytes = new Uint8Array(buffer);
    } catch {
      item.message = `「${name}」を読み取れませんでした。ファイルを選び直してください。`;
      continue;
    }
    if (!isCurrent()) return null;
    const digest = await sha256(bytes);
    if (!isCurrent()) return null;
    const match = Object.entries(SOURCE_PACKAGES).find(([, source]) => source.sha256 === digest);
    if (!match) {
      item.status = 'unsupported';
      item.message = `「${name}」の内容は対応する原本と一致しません。対応版のファイルを選んでください。`;
      continue;
    }
    const [key, source] = match;
    item.key = key;
    if (inputs[key]) {
      item.status = 'duplicate';
      item.message = `${source.name}が重複しています（「${firstNames[key]}」「${name}」）。一方を削除してください。`;
      continue;
    }
    inputs[key] = bytes; firstNames[key] = name;
    item.status = 'matched'; item.message = `${source.name}の対応原本と一致しました。`;
  }
  if (!isCurrent()) return null;
  const missing = SOURCE_SLOTS.filter(source => !inputs[source.key]).map(source => source.key);
  return { items, missing, ready: missing.length === 0 && items.length === SOURCE_SLOTS.length
    && items.every(item => item.status === 'matched'), inputs };
}

export function intakeIssues(inspection) {
  return [
    ...inspection.items.filter(item => item.status !== 'matched').map(item => item.message),
    ...inspection.missing.map(key => `不足：${SOURCE_PACKAGES[key].name}`),
  ];
}
