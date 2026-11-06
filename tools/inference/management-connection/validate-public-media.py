#!/usr/bin/env python3
"""Final published media/old-ZIP checks only; never clicks run or starts an NN."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import time
import traceback
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright, expect

ROOT = PNG = REFERENCE = m = lifecycle = private = None
NATIVE_SHA = '143526fc29787e282dcc91cfb8423621e4da3fd3'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def configure(page):
    page.locator('#module').select_option('vae')
    m.reveal_picker(page, 'vae-manifest')
    page.locator('#vae-manifest').set_input_files(private['vaeManifestPath'])
    m.wait_status(page, 'VAE資材を選んで設定してください')
    m.reveal_picker(page, 'vae-assets')
    page.locator('#vae-assets').set_input_files([item['localPath'] for item in private['retainedAssets']['vae']])
    page.locator('#configure-vae').click()
    m.wait_status(page, 'VAEを設定しました')


def configure_text(context, page, config):
    files = private['retainedAssets']['text']
    m.reveal_picker(page, 'text-assets')
    page.locator('#text-assets').set_input_files([item['localPath'] for item in files if item['role'] == 'prepared'])
    page.locator('#text-source').set_input_files([item['localPath'] for item in files if item['role'] == 'source'])
    page.locator('#configure-text').click()
    m.wait_status(page, 'Textを設定しました')
    capabilities = page.evaluate('window.ownerCandidate.owner.capabilities("text_encoder")')
    manifest = context.request.get(urljoin(page.url, config['textManifestUrl'])).body()
    parsed = json.loads(manifest)
    assert hashlib.sha256(manifest).hexdigest() == '420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405'
    assert capabilities['configured'] and len(capabilities['graphBindings']) == 24
    assert all(binding['recipeStatus'] == 'source-ordered-fp32' and binding['recipeId'] for binding in capabilities['graphBindings'])
    assert capabilities['modelSha256'] == parsed['modelSha256']
    assert capabilities['tokenizerSha256'] == parsed['tokenizer']['sha256']
    assert capabilities['output']['normalization'] == 'umt5-final-rmsnorm-f32-v1'
    assert capabilities['finalNormalization']['weightSha256'] == parsed['finalNorm']['sha256']
    counts = page.evaluate('({prepared:document.querySelector("#text-assets").files.length,source:document.querySelector("#text-source").files.length,sourceBytes:document.querySelector("#text-source").files[0].size})')
    assert counts == {'prepared': 27, 'source': 1, 'sourceBytes': 6735906897}
    return {'scope': 'Actual 28 local File selections and declared configured metadata only; no Text run or NN', 'selected': counts, 'manifestSha256': hashlib.sha256(manifest).hexdigest(), 'capabilities': capabilities}


def import_png(page):
    page.locator('#media-file').set_input_files(str(PNG))
    m.wait_status(page, 'encodeを実行できます')
    expect(page.locator('#run')).to_be_enabled()
    records = page.evaluate('window.ownerCandidate.owner.records()')
    assert len(records) == 1 and records[0]['name'] == PNG.name
    snapshot = m.record_snapshot(page, records[0]['artifactId'])
    assert snapshot['words'] == 1536 and snapshot['shape'] == [1, 3, 1, 16, 32]
    assert snapshot['meaning'] == 'rgb-unit' and snapshot['dataSha256'] == hashlib.sha256(REFERENCE.read_bytes()).hexdigest()
    assert snapshot['context']['inputSha256'] == hashlib.sha256(PNG.read_bytes()).hexdigest()
    assert snapshot['context']['slotId'] == 'vae-encode-input' and snapshot['context']['sourceFrameIndices'] == [0]
    assert 'sourceFrameTimesSeconds' not in snapshot['context']
    assert not page.evaluate('Object.hasOwn(window.ownerCandidate.owner.getRecord(document.querySelector("#result-artifact").value).tensor,"name")')
    return snapshot


def no_errors(findings):
    assert not findings['overriddenPaths'] and not findings['workers'] and not findings['runtimeResponses']
    assert all(not findings[key] for key in ['pageErrors', 'consoleErrors', 'httpErrors', 'requestFailures'])


def main():
    global ROOT, PNG, REFERENCE, m, lifecycle, private
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--repository-root', type=Path, required=True)
    parser.add_argument('--asset-config', type=Path, required=True)
    parser.add_argument('--png', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True, help='Expected float32LE RGB values; not an NN oracle')
    parser.add_argument('--prior-package', type=Path, required=True)
    parser.add_argument('--prior-evidence', type=Path, required=True, help='Earlier VAE evidence containing decode and originalMean records')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    ROOT, PNG, REFERENCE = args.repository_root.resolve(), args.png.resolve(), args.reference.resolve()
    m = load_module('operational_validator', ROOT / 'tools/inference/management-connection/validate-operational.py')
    lifecycle = load_module('process_lifecycle', ROOT / 'tools/inference/vae/process_lifecycle.py')
    private = json.loads(args.asset_config.read_text())
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    result = {'scope': 'Published ordinary PNG import plus isolated cancellation latency and prior-package read; no run click or NN', 'url': args.url, 'startedAt': time.time(), 'passed': False}
    ownership = lifecycle.ProcessOwnership().start()
    try:
        with sync_playwright() as playwright:
            launch = {'executable_path': '/usr/bin/chromium', 'headless': True, 'args': ['--no-sandbox']}
            proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
            if proxy:
                launch['proxy'] = {'server': proxy}
            browser = playwright.chromium.launch(**launch)
            try:
                context, page, findings, config = m.setup_page(browser, args.url, output, 'ordinary')
                try:
                    assert config['sourceRef']['commit'] == NATIVE_SHA and config.get('uiSourceRef')
                    assert page.locator('#media-file').count() == 1
                    result['textConfiguration'] = configure_text(context, page, config)
                    configure(page)
                    result['ordinaryPNG'] = import_png(page)
                    page.screenshot(path=str(output / 'ordinary-png-import.png'), full_page=True)
                    original = json.loads(args.prior_evidence.read_text())
                    m.open_imports(page)
                    page.locator('#package-file').set_input_files(str(args.prior_package.resolve()))
                    m.wait_status(page, '管理ZIPを読み込み')
                    rgb = m.record_snapshot(page, original['decode']['artifactId'])
                    mean = m.record_snapshot(page, original['originalMean']['artifactId'], m.fixture_url(config, 'vae-rect-mean', page))
                    assert all(rgb[key] == original['decode'][key] for key in ['dataSha256', 'dtype', 'layout', 'shape', 'meaning', 'modelSha256', 'context', 'sourceRecords', 'trace'])
                    assert mean['comparison']['differingBytes'] == 0 and mean['comparison']['metadataEqual']
                    assert page.evaluate('window.ownerCandidate.owner.records().length') == 3
                    no_errors(findings)
                    result.update({'nativeSourceRef': config['sourceRef'], 'uiSourceRef': config['uiSourceRef'], 'ordinaryBrowser': findings, 'priorPackageRead': {'path': str(args.prior_package.resolve()), 'nativeSource': NATIVE_SHA, 'recordCount': 3, 'rgb': rgb, 'mean': mean}})
                    page.locator('#dispose').click()
                    m.wait_status(page, '資源を解放しました')
                finally:
                    context.close()
                context, page, findings, config = m.setup_page(browser, args.url, output, 'cancel')
                try:
                    context.add_init_script("""const original=createImageBitmap;window.delayMediaDecode=false;window.createImageBitmap=async(...args)=>{if(window.delayMediaDecode)await new Promise(resolve=>setTimeout(resolve,600));return original(...args);};""")
                    page.reload(wait_until='networkidle')
                    page.evaluate('window.ownerCandidate.ready')
                    m.wait_status(page, 'モデル資材を選んで設定してください')
                    configure(page)
                    page.evaluate('window.delayMediaDecode=true')
                    page.locator('#media-file').set_input_files(str(PNG))
                    expect(page.locator('#cancel')).to_be_enabled()
                    page.locator('#cancel').click()
                    m.wait_status(page, 'もう一度選択できます')
                    assert page.evaluate('window.ownerCandidate.owner.records().length') == 0
                    assert page.evaluate('window.ownerCandidate.owner.busy') is False
                    expect(page.locator('#media-file')).to_be_enabled()
                    expect(page.locator('#run')).to_be_disabled()
                    cancelled = {'status': page.locator('#status').inner_text(), 'recordCount': 0, 'ownerBusy': False}
                    page.evaluate('window.delayMediaDecode=false')
                    retry = import_png(page)
                    no_errors(findings)
                    result['cancellation'] = {'scope': '600ms test latency before original real createImageBitmap; no replacement decoded data or inference client', 'terminal': cancelled, 'retryPNG': retry, 'browser': findings}
                    page.locator('#dispose').click()
                    m.wait_status(page, '資源を解放しました')
                finally:
                    context.close()
            finally:
                browser.close()
        result['passed'] = True
    except Exception:
        result['failure'] = traceback.format_exc()
    finally:
        result['processCleanup'] = ownership.finish()
        cleanup = result['processCleanup']
        cleanup['complete'] = lifecycle.cleanup_complete(cleanup['liveAfterClose'], cleanup['zombiesAfterClose'], cleanup['errors'])
        result['passed'] = bool(result['passed'] and cleanup['complete'])
        result['finishedAt'] = time.time()
        (output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'result': str(output / 'result.json'), 'failure': result.get('failure')}, ensure_ascii=False), flush=True)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
