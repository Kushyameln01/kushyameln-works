"""Normal product UI file/preview/export roundtrip. No model or NN execution."""
import base64
import functools
import http.server
import json
import pathlib
import tempfile
import threading
from playwright.sync_api import sync_playwright


def main():
    root = pathlib.Path(__file__).resolve().parents[2]
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root / 'docs')))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix='product-ui-') as folder, sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            try:
                page = browser.new_page(accept_downloads=True, viewport={'width': 1200, 'height': 1000})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/ai-connection/modules/')
                page.wait_for_function("!document.querySelector('#source-load').disabled && !document.querySelector('#configure').disabled")
                assert page.locator('textarea').count() == 2
                assert page.locator('#run').is_disabled()
                assert page.locator('#seed').is_disabled()
                assert page.locator('#steps').input_value() == '6'
                assert page.locator('#guidance').input_value() == '1'
                for pair in ('light', 'detail'):
                    for side in ('high', 'low'):
                        assert page.locator(f'#lora-{pair}-{side}').get_attribute('type') == 'file'
                        assert page.locator(f'#lora-{pair}-{side}-strength').input_value() == '1'
                for forbidden in ('#tensor-ref', '#reference-requirement', '#weight-feed-select', '#lora-plan-handle', '#lora-prepared-handle', '#route-json'):
                    assert page.locator(forbidden).count() == 0
                page.locator('#configure').click()
                page.wait_for_function("document.querySelector('#status').dataset.state === 'ERROR'")
                assert 'MODEL_FOLDER_REQUIRED' in page.locator('#status').inner_text()
                assert 'モデルフォルダ' in page.locator('#operation-feedback').inner_text()
                images = page.evaluate("""() => ['rgb(32,64,96)','rgb(160,128,48)'].map(color=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,16,16);return canvas.toDataURL('image/png').split(',')[1];})""")
                page.locator('#source-file').set_input_files([{'name':f'frame-{index}.png','mimeType':'image/png','buffer':base64.b64decode(data)} for index,data in enumerate(images)])
                page.evaluate("() => {document.querySelector('#source-load').click();document.querySelector('#cancel').click();}")
                page.wait_for_function("document.querySelector('#status').dataset.state === 'CANCELLED'")
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                assert page.locator('#source-export').is_disabled()
                page.locator('#source-load').click()
                page.wait_for_function("!document.querySelector('#source-export').disabled")
                assert '2 フレーム' in page.locator('#source-status').inner_text()
                pixels = lambda slot: page.locator(f'#{slot}-preview canvas').evaluate("canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data)")
                assert pixels('source') == [32,64,96,255]
                page.locator('#source-frame-index').evaluate("input=>{input.value='1';input.dispatchEvent(new Event('input'));}")
                assert pixels('source') == [160,128,48,255]
                zip_path = pathlib.Path(folder) / 'source.zip'
                with page.expect_download() as event:
                    page.locator('#source-export').click()
                event.value.save_as(zip_path)
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                page.locator('#reference-file').set_input_files(zip_path)
                page.locator('#reference-load').click()
                page.wait_for_function("!document.querySelector('#reference-export').disabled")
                assert pixels('reference') == [32,64,96,255]
                page.locator('#reference-frame-index').evaluate("input=>{input.value='1';input.dispatchEvent(new Event('input'));}")
                assert pixels('reference') == [160,128,48,255]
                tensor_path = pathlib.Path(folder) / 'source.wktensor'
                with page.expect_download() as event:
                    page.locator('#source-tensor-save').click()
                event.value.save_as(tensor_path)
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                page.locator('#reference-clear').click()
                page.locator('#reference-tensor-file').set_input_files(tensor_path)
                page.wait_for_function("!document.querySelector('#reference-export').disabled")
                assert pixels('reference') == [32,64,96,255]
                # A real native codec fixture with values off the RGB8 grid checks
                # that preview quantization never overwrites imported source values.
                exact_bytes = page.evaluate("""async()=>{const module=await import('/shared/ai-connection/adapters/text-vae-standalone/native.mjs');const codec=await module.createCurrentTextVaeCodec();return Array.from(await codec.encode({dtype:'float32',layout:'NCTHW',shape:[1,3,1,16,16],meaning:'rgb-unit',context:{schemaVersion:1,contextId:'restored-source',inputId:'context-identity',inputSha256:'1'.repeat(64),slotId:'source',sourceFrameIndices:[42],sourceFrameTimesSeconds:[1.25]},data:new Float32Array(768).fill(0.125)}));}""")
                exact_path = pathlib.Path(folder) / 'exact-float.wktensor'
                exact_path.write_bytes(bytes(exact_bytes))
                page.locator('#reference-tensor-file').set_input_files(exact_path)
                page.wait_for_function("!document.querySelector('#reference-tensor-save').disabled")
                with page.expect_download() as event:
                    page.locator('#reference-tensor-save').click()
                exact_saved_path = pathlib.Path(folder) / 'exact-float-saved.wktensor'
                event.value.save_as(exact_saved_path)
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                assert exact_path.read_bytes() == exact_saved_path.read_bytes()
                page.locator('#result-tensor-file').set_input_files(tensor_path)
                page.wait_for_function("!document.querySelector('#result-export').disabled")
                assert pixels('result') == [32,64,96,255]
                assert 'モデルを実行していません' in page.locator('#result-status').inner_text()
                with page.expect_download() as event:
                    page.locator('#result-tensor-save').click()
                restored_path = pathlib.Path(folder) / 'restored.wktensor'
                event.value.save_as(restored_path)
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                assert tensor_path.read_bytes() == restored_path.read_bytes()
                with page.expect_download() as event:
                    page.locator('#result-image-save').click()
                assert event.value.suggested_filename.endswith('.png')
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                assert page.locator('#run').is_disabled()
                page.locator('#prompt').fill('saved ordinary UI prompt')
                page.locator('#width').fill('32')
                page.locator('#lora-light-high-strength').fill('0.6')
                workspace_path = pathlib.Path(folder) / 'workspace.zip'
                with page.expect_download() as event:
                    page.locator('#save-workspace').click()
                event.value.save_as(workspace_path)
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                page.locator('#prompt').fill('changed')
                page.locator('#width').fill('64')
                page.locator('#lora-light-high-strength').fill('1.2')
                page.locator('#workspace-file').set_input_files(workspace_path)
                page.wait_for_function("document.querySelector('#status').dataset.state === 'RESTORED'")
                assert page.locator('#prompt').input_value() == 'saved ordinary UI prompt'
                assert page.locator('#width').input_value() == '32'
                assert page.locator('#lora-light-high-strength').input_value() == '0.6'
                assert page.locator('input[type=file]').evaluate_all('inputs=>inputs.every(input=>input.files.length===0)')
                assert page.locator('#run').is_disabled()
                assert '保持済みtensor' in page.locator('#workspace-status').inner_text()
                assert '再選択' in page.locator('#workspace-status').inner_text()
                page.goto(f'http://127.0.0.1:{server.server_port}/ai-connection/modules/diagnostics.html')
                page.wait_for_function("document.querySelector('#status').dataset.state === 'READY_FOR_INPUT'")
                assert page.locator('#lora-pair').input_value() == 'light'
                assert page.locator('#lora-pair option').count() == 2
                assert not errors, errors
                print(json.dumps({'status':'PASS','scope':'normal UI; actual local PNG/frame ZIP/native tensor file roundtrip; no model/NN execution','checks':['ordinary form and four LoRA side strengths','model selection error action','media cancellation and same-file reload','two-frame preview scrub','PNG frame ZIP download/readback','source tensor download/readback','restored result tensor byte preservation','imported input float preservation through preview','single PNG export','workspace form and partial tensor roundtrip with File reselection','retained diagnostics initializes with light/detail pair select'],'pageErrors':errors}, ensure_ascii=False, indent=2))
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    main()
