#!/usr/bin/env python3
"""Scoped browser checks for the operational owner; never runs a Text NN.

The controls scope overrides exactly client.mjs in one browser context. It uses
native module factories, the real management bridge/codec, and an already saved
real L512 output. The vae scope uses a separate, entirely un-routed context and
requires an immutable source host. Its input is posterior mean, not a generated
Diffusion sample. No model exports or whole-model hashes are performed here.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
import traceback
import zipfile

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[3]
TEXT_RECORD = ROOT / 'development/inference/management-20261104/text/plain-long-accepted/input-record.json'
TEXT_WKT_SHA256 = '18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def controlled_source(record):
    source = r"""
import {decodeTensor} from '/shared/inference/tensor.mjs';
import {inspectTextEncoderManifest} from '/shared/inference/text-encoder.mjs';
const accepted = __RECORD__;
const equal=(a,b)=>JSON.stringify(Array.from(a))===JSON.stringify(Array.from(b));
const assert=(value,message)=>{if(!value)throw Error('Controlled input assertion: '+message);};
window.operationalControl={scope:'saved real Text tensor; no new Text NN',calls:[],terminals:[],cancelRequests:0,clients:0};
const fixture=fetch('/fixtures/text-long-l512').then(async response=>{
 if(!response.ok)throw Error('Missing saved real Text output');
 return decodeTensor(new Uint8Array(await response.arrayBuffer()));
});
export function createInferenceClient({onState=()=>{}}={}){
 const log=window.operationalControl;log.clients++;
 let state={status:'idle'},active=null,disposed=false;
 const update=next=>{state=next;onState({...state});};
 const client={get state(){return {...state};},run(request){
  assert(!disposed&&!active,'client must be live and idle');
  assert(request.module==='text_encoder'&&request.operation==='encode','Text encode only');
  assert(request.files instanceof Map&&request.files.size===28,'28 actual local File grants');
  const source=request.files.get(request.manifest.embedding.sourceFile);
  assert(source instanceof File&&source.size===6735906897,'retained source File, without eager read');
  const mode=request.input.text!==undefined?'plain-text':'token-ids';
  if(mode==='plain-text')assert(request.input.text===accepted.input.text,'original long plain text');
  else {
   assert(equal(request.input.tokenIds,accepted.tokenIds),'original 512 token IDs');
   assert(equal(request.input.attentionMask,accepted.attentionMask),'original 512 attention mask');
  }
  const call={mode,files:request.files.size,sourceBytes:source.size,terminal:null};log.calls.push(call);
  return new Promise((resolve,reject)=>{
   const job={reject,timer:null,call};active=job;
   update({status:'running',module:request.module,operation:request.operation,progress:{phase:'controlled-saved-output',completed:0,total:1}});
   job.timer=setTimeout(async()=>{
    try {
     const tensor=structuredClone(await fixture);if(active!==job)return;
     active=null;call.terminal='completed';log.terminals.push({mode,status:'completed'});
     update({status:'idle',module:request.module,progress:null});
     resolve({tensor,attentionMask:new Uint8Array(tensor.attentionMask),inputMode:mode,graphBindings:inspectTextEncoderManifest(request.manifest).graphBindings});
    }catch(error){if(active!==job)return;active=null;call.terminal='failed';update({status:'idle'});reject(error);}
   },1200);
  });
 },cancel(){
  const job=active;if(!job)return false;log.cancelRequests++;clearTimeout(job.timer);
  setTimeout(()=>{if(active!==job)return;active=null;job.call.terminal='cancelled';
   log.terminals.push({mode:job.call.mode,status:'cancelled'});update({status:'idle',progress:null});
   job.reject(new DOMException('Controlled executor cancelled','AbortError'));
  },180);return true;
 },invalidate(){client.cancel();},dispose(){client.cancel();disposed=true;update({status:'disposed'});}};
 return client;
}
"""
    return source.replace('__RECORD__', json.dumps(record, ensure_ascii=False))


def step(name):
    print(json.dumps({'step': name, 'time': time.time()}), flush=True)


def wait_status(page, fragment, timeout=30000):
    expect(page.locator('#status')).to_contain_text(fragment, timeout=timeout)
    page.wait_for_function('!window.ownerCandidate.owner.busy')
    assert page.locator('#status').get_attribute('data-tone') != 'error', page.locator('#status').inner_text()


def open_imports(page):
    details = page.locator('details').filter(has=page.locator('#package-file'))
    if details.get_attribute('open') is None:
        details.locator('summary').click()


def record_snapshot(page, artifact_id=None, fixture=None):
    return page.evaluate("""async ({id,fixture})=>{
 const api=await import('/shared/inference/api.mjs');
 const owner=window.ownerCandidate.owner;
 id??=document.querySelector('#result-artifact').value;
 const record=owner.getRecord(id),t=record.tensor;
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const bytes=new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
 let comparison=null;
 if(fixture){
  const expected=await api.decodeTensor(new Uint8Array(await (await fetch(fixture)).arrayBuffer()));
  const expectedBytes=new Uint8Array(expected.data.buffer,expected.data.byteOffset,expected.data.byteLength);
  let differingBytes=bytes.length===expectedBytes.length?0:-1,maxAbs=0;
  if(differingBytes===0)for(let i=0;i<bytes.length;i++)if(bytes[i]!==expectedBytes[i])differingBytes++;
  if(t.data.length===expected.data.length)for(let i=0;i<t.data.length;i++)maxAbs=Math.max(maxAbs,Math.abs(t.data[i]-expected.data[i]));
  const describe=x=>JSON.stringify({...api.describeTensor(x),attentionMask:x.attentionMask?Array.from(x.attentionMask):undefined});
  comparison={differingBytes,maxAbs,metadataEqual:describe(t)===describe(expected)};
 }
 return {artifactId:id,dtype:t.dtype,layout:t.layout,shape:t.shape,meaning:t.meaning,words:t.data.length,
  dataSha256:await digest(bytes),modelSha256:t.modelSha256,tokenizerSha256:t.tokenizerSha256,
  normalization:t.normalization??null,context:t.context??null,latentContract:t.latentContract??null,
  attentionMask:t.attentionMask?{length:t.attentionMask.length,active:Array.from(t.attentionMask).reduce((a,b)=>a+b,0),sha256:await digest(t.attentionMask)}:null,
  sourceRecords:record.sourceRecords,trace:record.trace,comparison};
}""", {'id': artifact_id, 'fixture': fixture})


def download(page, button, path):
    with page.expect_download(timeout=30000) as pending:
        page.locator(button).click()
    pending.value.save_as(str(path))
    assert pending.value.failure() is None
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': sha(path),
            'suggestedFilename': pending.value.suggested_filename}


def save_read(page, output, prefix, preferred_id):
    package = output / f'{prefix}-management.zip'
    saved = download(page, '#save-package', package)
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None
        saved['entries'] = archive.namelist()
    before = page.evaluate('window.ownerCandidate.owner.records().map(r=>r.artifactId)')
    page.locator('#clear-records').click()
    wait_status(page, '履歴を消しました')
    assert page.evaluate('window.ownerCandidate.owner.records().length') == 0
    open_imports(page)
    page.locator('#package-file').set_input_files(str(package))
    wait_status(page, '管理ZIPを読み込み')
    after = page.evaluate('window.ownerCandidate.owner.records().map(r=>r.artifactId)')
    assert preferred_id in after
    page.locator('#result-artifact').select_option(preferred_id)
    page.locator('#use-result').click()
    assert page.locator('#input-artifact').input_value() == preferred_id
    return {'download': saved, 'beforeArtifactIds': before, 'restoredArtifactIds': after,
            'selectedForReuse': preferred_id}


def setup_page(browser, url, output, name, override=None):
    context = browser.new_context(accept_downloads=True, viewport={'width': 1380, 'height': 1100})
    if override is not None:
        context.route('**/shared/inference/client.mjs', lambda route: route.fulfill(status=200, content_type='text/javascript', body=override))
    page = context.new_page()
    page.set_default_timeout(30000)
    findings = {'pageErrors': [], 'consoleErrors': [], 'httpErrors': [], 'requestFailures': [],
                'workers': [], 'runtimeResponses': [], 'overriddenPaths': ['/shared/inference/client.mjs'] if override else []}
    page.on('pageerror', lambda error: findings['pageErrors'].append(str(error)))
    page.on('console', lambda message: findings['consoleErrors'].append(message.text) if message.type == 'error' else None)
    page.on('response', lambda response: findings['httpErrors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
    page.on('response', lambda response: findings['runtimeResponses'].append({'url': response.url, 'status': response.status}) if any(s in response.url for s in ['inference-worker.mjs', 'ort.wasm', 'ort-wasm', 'tensor.wasm']) else None)
    page.on('requestfailed', lambda request: findings['requestFailures'].append({'url': request.url, 'failure': request.failure}))
    page.on('worker', lambda worker: findings['workers'].append(worker.url))
    page.goto(url, wait_until='networkidle')
    page.evaluate('window.ownerCandidate.ready')
    wait_status(page, 'モデル資材を選んで設定してください')
    assert not findings['pageErrors'] and not findings['consoleErrors'] and not findings['httpErrors'], findings
    config = context.request.get(url.rstrip('/') + '/candidate-config.json').json()
    (output / f'{name}-config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    return context, page, findings, config


def controls(browser, args, output):
    step('controls: start; saved real Text output, no Text NN')
    record = json.loads(TEXT_RECORD.read_text())
    source = controlled_source(record)
    (output / 'controlled-client.mjs').write_text(source)
    context, page, errors, config = setup_page(browser, args.url, output, 'controls', source)
    result = {'scope': 'UI/native factories/real management codec with controlled executor and saved real Text output; no new Text NN',
              'sourceURL': args.url, 'sourceRef': config['sourceRef'], 'workingTreeSource': config['workingTreeSource'], 'browser': errors}
    try:
        assets = config['retainedAssets']['text']
        page.locator('#text-assets').set_input_files([item['localPath'] for item in assets if item['role'] == 'prepared'])
        page.locator('#text-source').set_input_files([item['localPath'] for item in assets if item['role'] == 'source'])
        page.locator('#configure-text').click()
        wait_status(page, 'Textを設定しました')
        assert page.evaluate('window.ownerCandidate.owner.capabilities("text_encoder").graphBindings.length') == 24
        page.locator('#prompt').fill(record['input']['text'])
        page.locator('#run').click()
        wait_status(page, '実行が完了しました')
        result['plain'] = record_snapshot(page, fixture='/fixtures/text-long-l512')
        assert result['plain']['words'] == 2097152 and result['plain']['comparison']['differingBytes'] == 0
        assert result['plain']['comparison']['metadataEqual']
        result['textDownload'] = download(page, '#download-tensor', output / 'text-long-l512.wktensor')
        assert result['textDownload']['sha256'] == TEXT_WKT_SHA256
        result['saveRead'] = save_read(page, output, 'text', result['plain']['artifactId'])
        restored = record_snapshot(page, result['plain']['artifactId'], '/fixtures/text-long-l512')
        assert restored['comparison'] == result['plain']['comparison']
        result['restoredText'] = restored
        page.locator('#module').select_option('text_encoder')
        page.locator('#run').click()
        expect(page.locator('#cancel')).to_be_enabled()
        page.locator('#cancel').click()
        expect(page.locator('#run')).to_be_disabled()
        wait_status(page, '実行を取り消しました。再実行できます')
        expect(page.locator('#run')).to_be_enabled()
        result['cancelBarrier'] = {'status': page.locator('#status').inner_text(), 'ownerBusy': page.evaluate('window.ownerCandidate.owner.busy')}
        page.locator('#text-mode').select_option('token-ids')
        page.locator('#token-input').fill(json.dumps({'tokenIds': record['tokenIds'], 'attentionMask': record['attentionMask']}))
        page.locator('#run').click()
        wait_status(page, '実行が完了しました')
        result['idRetry'] = record_snapshot(page, fixture='/fixtures/text-long-l512')
        assert result['idRetry']['words'] == 2097152 and result['idRetry']['comparison']['differingBytes'] == 0
        assert result['idRetry']['comparison']['metadataEqual']
        result['telemetry'] = page.evaluate('window.operationalControl')
        assert [item['terminal'] for item in result['telemetry']['calls']] == ['completed', 'cancelled', 'completed']
        assert [item['mode'] for item in result['telemetry']['calls']] == ['plain-text', 'plain-text', 'token-ids']
        assert result['telemetry']['cancelRequests'] == 1 and not errors['workers']
        page.screenshot(path=str(output / 'controls-complete.png'), full_page=True)
        page.locator('#dispose').click()
        wait_status(page, '資源を解放しました')
        expect(page.locator('#reinitialize')).to_be_enabled()
        assert page.evaluate('["text-assets","text-source"].every(id=>document.getElementById(id).files.length===0)')
        page.locator('#reinitialize').click()
        page.evaluate('window.ownerCandidate.ready')
        wait_status(page, 'モデル資材を選んで設定してください')
        assert page.evaluate('window.ownerCandidate.owner.records().length') == 0
        assert not page.evaluate('window.ownerCandidate.owner.capabilities("text_encoder").configured')
        result['disposeReinitialize'] = True
        assert not errors['pageErrors'] and not errors['consoleErrors'] and not errors['httpErrors'], errors
        result['passed'] = True
        return result
    finally:
        (output / 'controls-browser.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2) + '\n')
        if not result.get('passed'):
            page.screenshot(path=str(output / 'controls-failure.png'), full_page=True)
            result['lastStatus'] = page.locator('#status').inner_text()
            (output / 'controls-partial.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        context.close()


def vae(browser, args, output):
    step('vae: start; actual ordinary Worker, ORT and Hike; posterior mean input')
    context, page, errors, config = setup_page(browser, args.url, output, 'vae')
    result = {'scope': 'Actual VAE Rect posterior-mean decode; ordinary native client/Worker/ORT/Hike; no Diffusion generated sample',
              'sourceURL': args.url, 'sourceRef': config['sourceRef'], 'workingTreeSource': config['workingTreeSource'], 'browser': errors}
    try:
        assert not config['workingTreeSource'], 'Real VAE scope requires a fixed --source-sha host'
        page.locator('#module').select_option('vae')
        page.locator('#operation').select_option('decode')
        page.locator('#use-host-vae').click()
        wait_status(page, 'VAE資材を選んで設定してください')
        page.locator('#vae-assets').set_input_files([item['localPath'] for item in config['retainedAssets']['vae']])
        page.locator('#configure-vae').click()
        wait_status(page, 'VAEを設定しました')
        open_imports(page)
        page.locator('#fixture-select').select_option('vae-rect-mean')
        page.locator('#load-fixture').click()
        wait_status(page, '入力テンソルを読み込みました')
        raw_id = page.locator('#input-artifact').input_value()
        result['originalMean'] = record_snapshot(page, raw_id, '/fixtures/vae-rect-mean')
        assert result['originalMean']['meaning'] == 'raw-posterior-mean'
        page.locator('#run').click()
        expect(page.locator('#cancel')).to_be_enabled()
        page.locator('#cancel').click()
        wait_status(page, '実行を取り消しました。再実行できます')
        expect(page.locator('#run')).to_be_enabled()
        assert page.evaluate('window.ownerCandidate.owner.records().length') == 1
        result['cancelBarrier'] = {'status': page.locator('#status').inner_text(), 'ownerBusy': page.evaluate('window.ownerCandidate.owner.busy'), 'workerCount': len(errors['workers'])}
        step('vae: cancelled startup terminal observed; recovery decode')
        page.locator('#run').click()
        wait_status(page, '実行が完了しました', args.vae_timeout_ms)
        result['decode'] = record_snapshot(page, fixture='/fixtures/vae-rgb')
        assert result['decode']['shape'] == [1, 3, 1, 16, 32] and result['decode']['meaning'] == 'raw-decoder-rgb'
        assert result['decode']['comparison']['maxAbs'] <= 2e-5
        result['rgbDownload'] = download(page, '#download-tensor', output / 'vae-rect-rgb.wktensor')
        result['saveRead'] = save_read(page, output, 'vae', result['decode']['artifactId'])
        assert raw_id in result['saveRead']['restoredArtifactIds']
        restored_mean = record_snapshot(page, raw_id, '/fixtures/vae-rect-mean')
        assert restored_mean['comparison']['differingBytes'] == 0 and restored_mean['comparison']['metadataEqual']
        result['restoredMean'] = restored_mean
        page.locator('#result-artifact').select_option(raw_id)
        page.locator('#use-result').click()
        page.locator('#operation').select_option('decode')
        step('vae: saved package restored; one short reuse decode')
        page.locator('#run').click()
        wait_status(page, '実行が完了しました', args.vae_timeout_ms)
        result['reuseDecode'] = record_snapshot(page, fixture='/fixtures/vae-rgb')
        assert result['reuseDecode']['comparison']['maxAbs'] <= 2e-5
        assert result['reuseDecode']['dataSha256'] == result['decode']['dataSha256']
        assert any(item.get('artifactRef') for item in result['decode']['sourceRecords'])
        assert not errors['overriddenPaths'] and len(errors['workers']) == 3
        assert any('tensor.wasm' in item['url'] and item['status'] == 200 for item in errors['runtimeResponses'])
        assert any('ort-wasm-simd-threaded.wasm' in item['url'] and item['status'] == 200 for item in errors['runtimeResponses'])
        page.screenshot(path=str(output / 'vae-complete.png'), full_page=True)
        page.locator('#dispose').click()
        wait_status(page, '資源を解放しました')
        assert not errors['pageErrors'] and not errors['consoleErrors'] and not errors['httpErrors'], errors
        result['passed'] = True
        return result
    finally:
        (output / 'vae-browser.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2) + '\n')
        if not result.get('passed'):
            page.screenshot(path=str(output / 'vae-failure.png'), full_page=True)
            result['lastStatus'] = page.locator('#status').inner_text()
            (output / 'vae-partial.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--scope', choices=['controls', 'vae', 'all'], default='controls')
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--vae-timeout-ms', type=int, default=300000)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    module_spec = importlib.util.spec_from_file_location('operational_process_lifecycle', ROOT / 'tools/inference/vae/process_lifecycle.py')
    lifecycle = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(lifecycle)
    ownership = lifecycle.ProcessOwnership().start()
    result = {'requestedScope': args.scope, 'sourceURL': args.url, 'startedAt': time.time(),
              'limitations': ['No new Text NN', 'No whole-model hash/export or full-repository tests',
                              'VAE posterior mean is not a real Diffusion generated sample'], 'scopes': {}}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
            try:
                if args.scope in ['controls', 'all']:
                    result['scopes']['controls'] = controls(browser, args, args.output)
                if args.scope in ['vae', 'all']:
                    result['scopes']['vae'] = vae(browser, args, args.output)
            finally:
                browser.close()
        result['passed'] = True
    except Exception:
        result['passed'] = False
        result['failure'] = traceback.format_exc()
    finally:
        result['processCleanup'] = ownership.finish()
        result['processCleanup']['complete'] = lifecycle.cleanup_complete(result['processCleanup']['liveAfterClose'], result['processCleanup']['zombiesAfterClose'], result['processCleanup']['errors'])
        result['passed'] = bool(result['passed'] and result['processCleanup']['complete'])
        result['finishedAt'] = time.time()
        (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'result': str(args.output / 'result.json'), 'failure': result.get('failure')}, ensure_ascii=False), flush=True)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
