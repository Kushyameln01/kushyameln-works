import { SOURCE_PACKAGES, sha256, verifyPackageBytes, generateFtAssets } from '../ft-workbench/lib/generate-unity.mjs';
import { readUnityPackage, writeUnityPackage } from '../ft-workbench/lib/unity-package.mjs';
import { instantiateFtKernel } from '../ft-workbench/lib/kernel/load-kernel.mjs';
import { inspectSourceFiles, intakeIssues } from './lib/source-intake.mjs';

const send = (id, type, data = {}) => self.postMessage({ id, type, ...data });
const progress = (id, message, value) => send(id, 'progress', { message, value });
let latestId = -1, inspectionJob = null, generationJob = null;

class InputError extends Error {
  constructor(inspection) { super('元ファイルを確認してください。'); this.issues = intakeIssues(inspection); }
}

self.addEventListener('message', async event => {
  const { type, id, files } = event.data ?? {};
  if (!['inspect', 'generate'].includes(type) || !Number.isSafeInteger(id) || id < 0 || id < latestId) return;
  if (generationJob || (type === 'generate' && inspectionJob)) {
    send(id, 'error', { message: generationJob ? '生成処理はすでに実行中です。完了するか、取消してから再実行してください。'
      : '元ファイルの照合中です。照合が終わってから生成してください。', issues: [] });
    return;
  }
  latestId = id;
  if (type === 'inspect') {
    const job = { id }; inspectionJob = job;
    const isCurrent = () => inspectionJob === job && latestId === id;
    try {
      const inspected = await inspectSourceFiles(files, { isCurrent });
      if (inspected && isCurrent()) {
        const { items, missing, ready } = inspected;
        send(id, 'inspected', { items, missing, ready });
      }
    } catch (error) {
      if (isCurrent()) send(id, 'error', { message: '元ファイルを照合できませんでした。',
        issues: [error?.message || 'ファイルを選び直して再実行してください。'] });
    } finally {
      if (inspectionJob === job) inspectionJob = null;
    }
    return;
  }

  const job = { id }; generationJob = job;
  try {
    // Never trust a previous ready response. Recheck the exact submitted Files.
    const inspected = await inspectSourceFiles(files, {
      onFile: ({ index, count, name }) => progress(id, `元ファイルを照合しています（${index + 1}/${count}）：${name}`, 1),
    });
    if (!inspected.ready) throw new InputError(inspected);
    const inputs = inspected.inputs;
    await verifyPackageBytes(inputs);
    progress(id, 'Hike/WASMを読み込んでいます。', 2);
    const response = await fetch(new URL('../ft-workbench/lib/kernel/ft-kernel.wasm', import.meta.url));
    if (!response.ok) throw new Error('Hike/WASMを読み込めませんでした。ページを再読み込みして試してください。');
    const kernel = await instantiateFtKernel(await response.arrayBuffer());
    const packages = {};
    for (const [key, source] of Object.entries(SOURCE_PACKAGES)) {
      progress(id, `元ファイルを展開しています：${source.name}`, 3);
      packages[key] = await readUnityPackage(inputs[key]);
      delete inputs[key];
    }
    progress(id, 'FTアセットを生成し、構造と数値を静的に検証しています。', null);
    const { assets, report, readme, structureIndex, generationSpec } = await generateFtAssets(packages, kernel);
    const specificationAssets = assets.filter(asset => asset.path.endsWith('/GenerationSpec.json'));
    if (specificationAssets.length !== 1 || !(specificationAssets[0].asset instanceof Uint8Array))
      throw new Error('生成仕様の実ファイルを一意に確認できませんでした。');
    const specSha256 = await sha256(specificationAssets[0].asset);
    progress(id, 'ダウンロード用のUnitypackageを作成しています。', 5);
    const archive = await writeUnityPackage(assets);
    const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength);
    self.postMessage({ id, type: 'complete', archiveBuffer, report, readme, structureIndex, generationSpec,
      assetCount: assets.length, archiveBytes: archive.byteLength, specSha256 }, [archiveBuffer]);
  } catch (error) {
    send(id, 'error', { message: error instanceof InputError ? error.message : '生成を完了できませんでした。',
      issues: error instanceof InputError ? error.issues
        : [error?.message || '原因を特定できませんでした。ファイルを確認して再実行してください。'] });
  } finally {
    if (generationJob === job) generationJob = null;
  }
});
