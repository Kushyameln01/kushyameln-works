// Run: node --experimental-vm-modules --test tools/ai-connection/test-lora-base-restore.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { readLoraSelections } from '../../docs/ai-connection/modules/lora-selection.mjs';

const mainUrl = new URL('../../docs/ai-connection/modules/main.mjs', import.meta.url);
const selectionUrl = new URL('../../docs/ai-connection/modules/lora-selection.mjs', import.meta.url);

// A DOM boundary double only: the complete production main module registers and
// executes its own handlers. The SDK/controller operation is outside this form test.
async function createForm(mode, removeLora = async () => {}) {
  const fields = new Map();
  const root = {
    getElementById(id) {
      if (!fields.has(id)) {
        let value = id.endsWith('-strength') ? '0.75' : '';
        const field = {
          id, files: [], textContent: '', dataset: {}, disabled: false,
          listeners: new Map(),
          get value() { return value; },
          set value(next) { value = next; if (next === '') this.files = []; },
          addEventListener(type, listener) { this.listeners.set(type, listener); },
          querySelector() { return {}; },
          replaceChildren() {}, removeAttribute() {}, checkValidity() { return true; },
        };
        fields.set(id, field);
      }
      return fields.get(id);
    },
    querySelectorAll() { return [...fields.values()]; },
  };
  const state = { configured: true, state: 'ready', lora: { HIGH: [{ pairId: 'light', strength: 0.75 }] } };
  const controller = { removeLora, subscribe(listener) { listener(state); return () => {}; } };
  const context = vm.createContext({ document: root, AbortController, Blob, URL, setTimeout });
  const product = new vm.SyntheticModule(['createProductManagement'], function () {
    this.setExport('createProductManagement', () => controller);
  }, { context });
  const media = new vm.SyntheticModule([], function () {}, { context });
  for (const module of [product, media]) { await module.link(() => {}); await module.evaluate(); }
  const selection = new vm.SourceTextModule(await readFile(selectionUrl, 'utf8'), { context });
  const main = new vm.SourceTextModule(await readFile(mainUrl, 'utf8'), {
    context,
    importModuleDynamically(specifier) {
      if (specifier.endsWith('/product-management.mjs')) return product;
      if (specifier.endsWith('/product-media.mjs')) return media;
      throw Error(`Unexpected import: ${specifier}`);
    },
  });
  await main.link(specifier => {
    assert.equal(specifier, './lora-selection.mjs');
    return selection;
  });
  await main.evaluate();
  await new Promise(resolve => setImmediate(resolve));
  root.getElementById('lora-mode').value = mode;
  for (const pair of ['light', 'detail']) for (const side of ['high', 'low']) {
    root.getElementById(`lora-${pair}-${side}`).files = [new File(['fixture'], `${pair}-${side}.safetensors`)];
  }
  return {
    root,
    remove: () => root.getElementById('lora-remove').listeners.get('click')(),
    read: () => readLoraSelections(root, id => Number(root.getElementById(id).value)),
  };
}

for (const mode of ['light', 'detail', 'selected', 'none']) {
  test(`successful Base restoration from ${mode} permits the next Base apply`, async () => {
    const form = await createForm(mode);
    await form.remove();
    assert.deepEqual(form.read(), {});
    for (const pair of ['light', 'detail']) for (const side of ['high', 'low']) {
      assert.equal(form.root.getElementById(`lora-${pair}-${side}`).files.length, 0);
    }
    const file = new File(['new fixture'], 'new-detail-low.safetensors');
    form.root.getElementById('lora-detail-low').files = [file];
    assert.deepEqual(form.read(), { detail: { LOW: { file, strength: 0.75 } } });
  });
}

test('failed Base restoration keeps the mode and selected Files for recovery', async () => {
  const form = await createForm('light', async () => { throw Object.assign(Error('restore failed'), { code: 'LORA_RESTORE_REQUIRED' }); });
  const before = form.read();
  await form.remove();
  assert.equal(form.root.getElementById('lora-mode').value, 'light');
  assert.deepEqual(form.read(), before);
  assert.equal(form.root.getElementById('status').dataset.state, 'ERROR');
});

test('pending Base restoration does not clear selections before removal succeeds', async () => {
  let release;
  const terminal = new Promise(resolve => { release = resolve; });
  const form = await createForm('detail', () => terminal);
  const before = form.read();
  const removing = form.remove();
  assert.deepEqual(form.read(), before);
  assert.equal(form.root.getElementById('lora-mode').disabled, true);
  release();
  await removing;
  assert.deepEqual(form.read(), {});
});
