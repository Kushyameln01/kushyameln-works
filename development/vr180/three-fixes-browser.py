#!/usr/bin/env python3
"""Small candidate UI check; native OPFS replaces only the OS save picker.

Requires the docs tree served at --origin and Python Playwright + Chromium.
Writes complete input/output bytes and observations to a new --output directory.
Does not publish, test large media, or claim OS picker/VR-player compatibility.
"""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origin', default='http://127.0.0.1:8000')
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('''
      window.__phases = []; window.__saveStates = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({data}) => {
            if (data.type === 'progress') window.__phases.push(data.progress?.phase);
          });
        }
      };
      window.showSaveFilePicker = async () => {
        const root = await navigator.storage.getDirectory();
        window.__destination = await root.getFileHandle('three-fixes-output.mp4', {create: true});
        return window.__destination;
      };
      addEventListener('DOMContentLoaded', () => {
        new MutationObserver(() => {
          const status = document.getElementById('save-status');
          const progress = document.getElementById('save-progress');
          window.__saveStates.push({text: status.textContent, hidden: progress.hidden,
            indeterminate: !progress.hasAttribute('value')});
        }).observe(document.getElementById('save-feedback'),
          {subtree: true, childList: true, attributes: true, characterData: true});
      });
    ''')
    try:
        page.goto(args.origin.rstrip('/') + '/vr180-studio/', wait_until='networkidle')
        page.select_option('#mode', 'convert')
        page.select_option('#execution-route', 'indexed')
        page.select_option('#size', '256')
        original = page.evaluate('''async () => {
          const {tagMp4} = await import('../shared/vr180/mp4.mjs');
          const raw = await (await fetch('./fixtures/stereo180-sbs.mp4')).blob();
          const base = await tagMp4(raw, {layout: 'sbs'});
          const bytes = new Uint8Array(await base.arrayBuffer());
          const view = new DataView(bytes.buffer);
          let moov;
          for (let at = 0; at < bytes.length; at += view.getUint32(at))
            if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === 'moov') moov = at;
          if (moov + view.getUint32(moov) !== bytes.length) throw Error('Expected EOF moov');
          const box = (type, ...parts) => {
            const h = new Uint8Array(8);
            new DataView(h.buffer).setUint32(0, 8 + parts.reduce((n, part) => n + part.size, 0));
            [...type].forEach((c, i) => h[4 + i] = c.charCodeAt(0));
            return new Blob([h, ...parts]);
          };
          const metadata = box('udta',
            box('cprt', new Blob([new Uint8Array(6), 'Copyright three-fixes\\0'])),
            box('name', new Blob(['Title three-fixes\\0'])));
          const file = new File([base.slice(0, moov),
            box('moov', base.slice(moov + 8), metadata)], 'three-fixes-input.mp4', {type: 'video/mp4'});
          const transfer = new DataTransfer(); transfer.items.add(file);
          const input = document.getElementById('file'); input.files = transfer.files;
          input.dispatchEvent(new Event('change', {bubbles: true}));
          return Array.from(new Uint8Array(await file.arrayBuffer()));
        }''')
        input_bytes = bytes(original)
        (args.output / 'input.mp4').write_bytes(input_bytes)
        page.wait_for_function("document.getElementById('input-info').textContent.includes('512')")
        page.check('#confirmed')
        page.click('#choose-save')
        page.wait_for_function("!document.getElementById('run').disabled")
        page.click('#run')
        # This predicate is synchronous: no Promise-truthiness wait shortcut.
        page.wait_for_function('''() => {
          try { const r = JSON.parse(document.getElementById('diagnostics').textContent);
            return r.saveCompleted || r.status === 'failed'; } catch { return false; }
        }''', timeout=90000)
        receipt = json.loads(page.locator('#diagnostics').text_content())
        observations = page.evaluate('''() => ({phases: __phases, saveStates: __saveStates,
          status: document.getElementById('status').textContent,
          api: {secureContext: isSecureContext, opfs: typeof navigator.storage.getDirectory,
            locks: typeof navigator.locks.request, encoder: typeof VideoEncoder, decoder: typeof VideoDecoder}})''')
        (args.output / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
        assert receipt['saveCompleted'] is True, receipt
        output_bytes = bytes(page.evaluate('''async () =>
          Array.from(new Uint8Array(await (await __destination.getFile()).arrayBuffer()))'''))
        (args.output / 'output.mp4').write_bytes(output_bytes)
        observations.update(browser=browser.version, errors=errors,
            inputBytes=len(input_bytes), inputSHA256=hashlib.sha256(input_bytes).hexdigest(),
            outputBytes=len(output_bytes), outputSHA256=hashlib.sha256(output_bytes).hexdigest(),
            picker='native OPFS handle stand-in; OS picker not tested',
            origin=args.origin, scope='small candidate indexed UI conversion')
        (args.output / 'observations.json').write_text(json.dumps(observations, ensure_ascii=False, indent=2))
        assert not errors, errors
        assert receipt['executionRoute'] == 'indexed'
        assert receipt['input']['sha256'] == observations['inputSHA256']
        assert receipt['output']['sha256'] == observations['outputSHA256']
        assert receipt['output']['bytes'] == len(output_bytes)
        assert observations['phases'].count('saveCommit') == 1
        assert any('確定して内容を確認' in state['text'] and not state['hidden']
                   and state['indeterminate'] for state in observations['saveStates'])
        page.screenshot(path=str(args.output / 'completed.png'), full_page=True)
        print(json.dumps({key: observations[key] for key in
            ['browser', 'inputBytes', 'outputBytes', 'inputSHA256', 'outputSHA256', 'phases']}))
    finally:
        # Dispose only this job and its dedicated destination, retaining recovered files.
        try:
            page.click('#clear', timeout=5000)
            page.evaluate('''async () => {
              const root = await navigator.storage.getDirectory();
              await root.removeEntry('three-fixes-output.mp4');
            }''')
        finally:
            browser.close()
