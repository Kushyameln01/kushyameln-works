#!/usr/bin/env python3
"""Exercise the actual candidate page UI, with only its OS picker substituted.

The picker returns one new native OPFS file handle. The page, client, Worker,
codecs, writer, cleanup, and browser downloads are the checked-out implementations.
This is one small synthetic UI trial, not an OS picker or large-media acceptance.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import time
import traceback
import urllib.request

spec = importlib.util.spec_from_file_location('entry_probe', Path(__file__).with_name('probe-indexed-entry.py'))
entry = importlib.util.module_from_spec(spec); spec.loader.exec_module(entry)
base, cloud = entry.base, entry.cloud
PAGE = '/docs/vr180-studio/'
FIXTURE = 'docs/vr180-studio/fixtures/stereo360-tb.mp4'
RECORD_LIMIT = 256 * 1024

PICKER = r"""(() => {
 const state = globalThis.__indexedUIProbe = {namespace: 'ui-'+crypto.randomUUID(), pickerCalls: 0,
  originalPickerAvailable: typeof globalThis.showSaveFilePicker === 'function', unhandled: []};
 addEventListener('unhandledrejection', event => {
  if (state.unhandled.length < 8) state.unhandled.push(String(event.reason).slice(0,4096));
  else state.unhandledOverflow = true;
 });
 globalThis.showSaveFilePicker = async options => {
  if (++state.pickerCalls !== 1) throw Error('UNEXPECTED_PICKER_CALL');
  if (!isSecureContext || !navigator.storage?.getDirectory || !navigator.locks?.query) throw Error('NATIVE_CAPABILITY_UNAVAILABLE');
  const origin = await navigator.storage.getDirectory();
  try { await origin.getDirectoryHandle(state.namespace); throw Error('HARNESS_NAMESPACE_EXISTS'); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; }
  state.origin = origin; state.root = await origin.getDirectoryHandle(state.namespace,{create:true});
  state.handle = await state.root.getFileHandle('ui-output.mp4',{create:true});
  state.initialBytes = (await state.handle.getFile()).size;
  if (state.initialBytes !== 0) throw Error('HARNESS_OUTPUT_NOT_EMPTY');
  state.pickerOptions = structuredClone(options);
  return state.handle;
 };
})();"""

# This wrapper changes one storage operation in the conversion Worker only.
# Product module bytes and imports remain unchanged. The matching run message
# supplies the sole namespace eligible for failure; inspect is never affected.
CLEANUP_FAULT = r"""(() => {
 const NativeWorker = globalThis.Worker;
 const state = globalThis.__indexedUIProbe;
 state.cleanupFault = {blocked: 0, released: false, namespace: null};
 const code = `
 const fault = {namespace:null, enabled:true};
 let productReady=false;const queued=[];
 const remove = FileSystemDirectoryHandle.prototype.removeEntry;
 FileSystemDirectoryHandle.prototype.removeEntry = function(name,...args) {
   if(fault.enabled && fault.namespace && this.name==='vr180-indexed-jobs' && name===fault.namespace) {
     self.postMessage({type:'probe-cleanup-blocked',namespace:name});
     return Promise.reject(new DOMException('PROBE_REGISTRY_REMOVE_FAILED','UnknownError'));
   }
   return remove.call(this,name,...args);
 };
 self.addEventListener('message',event=>{
   const m=event.data;
   if(m.type==='run' && m.settings?.executionRoute==='indexed') fault.namespace=m.operationId+'-r'+m.inputRevision;
   if(m.type==='probe-release-cleanup' && m.namespace===fault.namespace) {
     fault.enabled=false;self.postMessage({type:'probe-cleanup-released',namespace:fault.namespace});
   }
   if(!productReady && ['run','cancel','release'].includes(m.type)) {queued.push(m);event.stopImmediatePropagation();}
 });`;
 globalThis.Worker = class extends NativeWorker {
   constructor(url, options) {
     const target = new URL(url,location.href);
     if(target.pathname==='/docs/shared/vr180/worker.mjs') {
       const wrapped = URL.createObjectURL(new Blob([code+'\nawait import('+JSON.stringify(target.href)+');productReady=true;for(const data of queued)self.dispatchEvent(new MessageEvent("message",{data}));'],{type:'text/javascript'}));
       super(wrapped,options);
       this.addEventListener('message',({data:m})=>{
         if(m.type==='probe-cleanup-blocked') {
           state.cleanupFault.blocked++;state.cleanupFault.namespace=m.namespace;state.faultWorker=this;
         }
         if(m.type==='probe-cleanup-released')state.cleanupFault.released=true;
       });
       // The constructor has captured the script URL; keep it until page teardown
       // to avoid changing browser scheduling in this fault-injection test.
       (state.wrapperURLs??=[]).push(wrapped);
     } else super(url,options);
   }
 };
})();"""

SNAPSHOT = r"""() => {
 const text = id => document.getElementById(id)?.textContent?.slice(0,4096) ?? null;
 const disabled = id => document.getElementById(id)?.disabled ?? null;
 const state = globalThis.__indexedUIProbe;
 return {route: document.getElementById('execution-route')?.value, mode: document.getElementById('mode')?.value,
  runDisabled: disabled('run'), cancelDisabled: disabled('cancel'), fileDisabled: disabled('file'),
  resultHidden: document.getElementById('result')?.hidden, registryListDisabled: disabled('registry-list'),
  registryRecoverDisabled: disabled('registry-recover'), registryConfirmDisabled: disabled('registry-confirm'),
  registryOptions: document.getElementById('registry-job')?.options.length,
  status: text('status'), saveFact: text('save-fact'), indexCleanupStatus: text('index-cleanup-status'),
  cleanupWarning: text('cleanup-warning'), registryStatus: text('registry-status'),
  routeNote: text('execution-route-note'), saveDestination: text('save-destination'),
  pickerCalls: state?.pickerCalls, unhandled: state?.unhandled, unhandledOverflow: !!state?.unhandledOverflow};
}"""

READ_SAVED = r"""async () => {
 const state=globalThis.__indexedUIProbe, {sha256Blob}=await import('/docs/shared/vr180/sha256.mjs');
 if (!state?.handle || !state.root) throw Error('PICKER_OUTPUT_MISSING');
 const sameEntry = await state.handle.isSameEntry(await state.root.getFileHandle('ui-output.mp4'));
 if (!sameEntry) throw Error('PICKER_OUTPUT_IDENTITY');
 const file=await state.handle.getFile();
 return {namespace:state.namespace, bytes:file.size, sha256:await sha256Blob(file), sameEntry,
  initialBytes:state.initialBytes, pickerCalls:state.pickerCalls, pickerOptions:state.pickerOptions,
  originalPickerAvailable:state.originalPickerAvailable, backend:'native OPFS handle supplied by picker substitute'};
}"""

CHECK_INTERNAL = r"""async ({operationId,inputRevision}) => {
 const root=await navigator.storage.getDirectory(); let registryAbsent=false;
 try {const dir=await root.getDirectoryHandle('vr180-indexed-jobs');await dir.getDirectoryHandle(`${operationId}-r${inputRevision}`);}
 catch(error){if(error.name==='NotFoundError')registryAbsent=true;else throw error;}
 const locks=await navigator.locks.query(), related=lock=>lock.name.includes(operationId);
 return {operationId,inputRevision,registryAbsent,heldJobLocks:locks.held.filter(related).length,
  pendingJobLocks:locks.pending.filter(related).length};
}"""

REMOVE_OWN_OUTPUT = r"""async () => {
 const state=globalThis.__indexedUIProbe;
 if(!state?.root)return {status:'NOT_CREATED'};
 const entries=[];for await(const [name,entry]of state.root.entries()){
  if(entries.length>=1||name!=='ui-output.mp4'||entry.kind!=='file')throw Error('UNKNOWN_HARNESS_OUTPUT');entries.push(name);
 }
 if(entries.length!==1||!await state.handle.isSameEntry(await state.root.getFileHandle(entries[0])))throw Error('HARNESS_OUTPUT_IDENTITY');
 await state.root.removeEntry(entries[0]);await state.origin.removeEntry(state.namespace);
 return {status:'REMOVED',scope:'only the proven harness-owned output and empty harness namespace; no product index or external file deletion'};
}"""


def verify_receipt(receipt, build, input_bytes, input_hash, *, after_download=False, previous=None, cleanup_failure=False):
    """Check identity/save facts; independent pixel/audio/media acceptance is separate."""
    r = receipt
    cloud.require(type(r.get('schemaVersion')) is int and r['schemaVersion'] == 2 and r.get('build') == build, 'UI receipt schema/build')
    cloud.require(isinstance(r.get('operationId'), str) and re.fullmatch('[a-zA-Z0-9_-]{1,60}', r['operationId'])
                  and type(r.get('inputRevision')) is int and r['inputRevision'] == 2, 'UI receipt generation')
    cloud.require(r.get('status') == ('failed' if cleanup_failure else 'saved') and r.get('executionRoute') == 'indexed'
                  and r.get('saveWriteCommitted') is True and r.get('saveCompleted') is True, 'UI saved fact missing')
    expected_settings = {'mode': 'convert', 'layout': 'tb', 'fov': 360, 'eyeSize': 256, 'bitrate': 2000000,
                         'confirmed': True, 'executionRoute': 'indexed'}
    cloud.require(r.get('settings') == expected_settings, 'UI conversion settings differ')
    source, output = r.get('input', {}), r.get('output', {})
    cloud.require(source.get('bytes') == input_bytes and source.get('sha256') == input_hash, 'UI receipt input differs')
    cloud.require(type(output.get('bytes')) is int and 0 < output['bytes'] <= 2**30
                  and isinstance(output.get('sha256'), str) and re.fullmatch('[a-f0-9]{64}', output['sha256']), 'UI receipt output bounds')
    info = output.get('info', {})
    cloud.require(info.get('width') == 512 and info.get('height') == 256 and info.get('videoCodec') == 'avc1'
                  and info.get('audioCodecs') == ['mp4a'] and info.get('stereoMode') == 2 and info.get('projection') == 'equi', 'UI output description')
    cloud.require(r.get('savedSize') == output['bytes'] and r.get('savedSha256') == output['sha256'], 'UI save summary differs')
    attempts = r.get('saveAttempts', [])
    cloud.require(len(attempts) == (2 if after_download else 1), 'UI save attempt count')
    cloud.require(len({a.get('id') for a in attempts}) == len(attempts)
                  and all(isinstance(a.get('id'), str) and a['id'] and a.get('resultOperationId') == r['operationId']
                          and type(a.get('inputRevision')) is int and a['inputRevision'] == r['inputRevision'] for a in attempts), 'UI save attempt generation')
    saved = attempts[0]
    cloud.require(saved.get('kind') == 'direct' and saved.get('commitState') == 'committed' and saved.get('verificationState') == 'passed'
                  and saved.get('bytes') == output['bytes'] and saved.get('sha256') == output['sha256']
                  and saved.get('wholeFileHashCompared') is False and saved.get('metadataHashMatched') is True, 'UI direct save proof')
    direct = r.get('directSave', {}); observed = direct.get('savedObservation', {})
    cloud.require(direct.get('status') == 'verified' and direct.get('wholeFileHashCompared') is False and direct.get('metadataHashMatched') is True
                  and observed.get('jobId') == r['operationId'] and observed.get('outputProfileId') == 'default'
                  and observed.get('committed') is True and observed.get('bytes') == output['bytes'] and observed.get('sha256') == output['sha256'], 'UI indexed observation differs')
    registry = r.get('indexedOwnership', {}); identity = registry.get('identity', {})
    cloud.require(registry.get('status') == ('retained' if cleanup_failure else 'complete') and identity.get('operationId') == r['operationId']
                  and identity.get('inputRevision') == r['inputRevision']
                  and identity.get('namespace') == f"{r['operationId']}-r{r['inputRevision']}", 'UI registry generation/cleanup differs')
    if after_download:
        cloud.require(attempts[1].get('kind') == 'download-request' and attempts[1].get('commitState') == 'not-started'
                      and attempts[1].get('verificationState') == 'not-run', 'Download request mislabeled as verified save')
        cloud.require(previous is not None and all(r.get(key) == previous.get(key) for key in
                      ('operationId', 'inputRevision', 'settings', 'input', 'output', 'indexedOwnership', 'directSave'))
                      and attempts[0] == previous['saveAttempts'][0], 'Recovered UI receipt changed prior saved fact')
    return {'status': 'PASS', 'operationId': r['operationId'], 'inputRevision': r['inputRevision'],
            'bytes': output['bytes'], 'sha256': output['sha256'], 'scope': 'UI receipt identity and save observations; media acceptance deferred'}


def idle(page):
    page.wait_for_function("() => !document.getElementById('file').disabled && document.getElementById('cancel').disabled", timeout=30000)


def open_details(page, selector):
    details = page.locator(selector).locator('xpath=ancestor::details[1]')
    if details.get_attribute('open') is None: details.locator(':scope > summary').click(timeout=5000)


def empty_registry_ui(page):
    open_details(page, '#registry-list')
    cloud.require(page.locator('#registry-list').is_enabled(), 'Registry listing unavailable after cleanup')
    page.locator('#registry-list').click(timeout=5000)
    page.wait_for_function("() => !document.getElementById('registry-list').disabled && document.getElementById('registry-status').textContent === 'このブラウザに未完了作業の記録はありません。'", timeout=10000)
    snapshot = page.evaluate(SNAPSHOT)
    cloud.require(snapshot['registryOptions'] == 1 and snapshot['registryRecoverDisabled'] is True
                  and snapshot['registryConfirmDisabled'] is True, 'Empty registry permits recovery')
    return snapshot


def read_dom_receipt(page):
    raw = page.locator('#diagnostics').text_content()
    cloud.require(len(raw.encode()) <= RECORD_LIMIT, 'UI receipt exceeds bounded record size')
    return json.loads(raw)


def verify_cleanup_recovery(before, after):
    cloud.require(before.get('saveCompleted') is True and before.get('saveWriteCommitted') is True
                  and before.get('internalIndexCleanup') == 'pending', 'Saved failure evidence missing')
    cloud.require(before.get('directSave', {}).get('status') == 'verified'
                  and before.get('output', {}).get('bytes', 0) > 0, 'Verified saved output missing')
    recovery = after.get('internalCleanupRecovery', {})
    cloud.require(recovery.get('status') == 'complete'
                  and recovery.get('identity') == before.get('indexedOwnership', {}).get('identity')
                  and recovery.get('externalSaveState') == 'NOT_APPLICABLE', 'Recovery identity or scope differs')
    cloud.require({k:v for k,v in after.items() if k != 'internalCleanupRecovery'} == before,
                  'Recovery rewrote original failure or save facts')
    return {'status':'PASS','scope':'same-job cleanup observation; original failure and saved facts retained'}


def run_cleanup_retry(page, report, out):
    page.wait_for_function("""() => {try {const r=JSON.parse(document.getElementById('diagnostics').textContent);
      return r.saveCompleted===true && r.internalIndexCleanup==='pending' &&
       document.getElementById('cleanup-warning').textContent.includes('PROBE_REGISTRY_REMOVE_FAILED');
      } catch{return false;}}""",timeout=90000)
    before=read_dom_receipt(page); cloud.write(out/'receipt-before-retry.json',before)
    fixture=cloud.ROOT/FIXTURE
    report['receiptVerification']=verify_receipt(before,report['build'],fixture.stat().st_size,cloud.digest(fixture),cleanup_failure=True)
    report['beforeRetryUI']=page.evaluate(SNAPSHOT)
    report['faultBeforeRelease']=page.evaluate('() => structuredClone(__indexedUIProbe.cleanupFault)')
    identity={key:before[key] for key in ('operationId','inputRevision')}
    cloud.require(report['faultBeforeRelease']['blocked'] > 0
                  and report['faultBeforeRelease']['namespace'] == before['indexedOwnership']['identity']['namespace'], 'Fault target differs')
    report['nativeSavedFile']=page.evaluate(READ_SAVED)
    output=before['output']
    cloud.require(report['nativeSavedFile']['bytes']==output['bytes']
                  and report['nativeSavedFile']['sha256']==output['sha256'], 'Saved file differs before retry')
    page.evaluate("() => __indexedUIProbe.faultWorker.postMessage({type:'probe-release-cleanup',namespace:__indexedUIProbe.cleanupFault.namespace})")
    page.wait_for_function('() => __indexedUIProbe.cleanupFault.released',timeout=5000)
    page.locator('#cancel').click(timeout=5000); idle(page)
    after=read_dom_receipt(page); report['afterRetryUI']=page.evaluate(SNAPSHOT)
    report['recoveryVerification']=verify_cleanup_recovery(before,after)
    cloud.require(report['afterRetryUI']['indexCleanupStatus']=='ブラウザ内の一時データの清掃は完了しています。保存状態とは別の確認です。'
                  and report['afterRetryUI']['cleanupWarning']=='', 'Cleanup display regressed after delayed rejection')
    report['internalBeforeClear']=page.evaluate(CHECK_INTERNAL,identity)
    cloud.require(report['internalBeforeClear']['registryAbsent'] and report['internalBeforeClear']['heldJobLocks']==0
                  and report['internalBeforeClear']['pendingJobLocks']==0, 'Native cleanup incomplete')
    observed=page.evaluate(READ_SAVED)
    cloud.require(observed==report['nativeSavedFile'],'Retry changed saved output')
    report['faultAfterRetry']=page.evaluate('() => structuredClone(__indexedUIProbe.cleanupFault)')
    # The failed conversion intentionally exposes no prepared result. Recover its
    # already committed file through the harness's original native output handle.
    report['outputRecoveryPath']='harness native saved handle; product result remains failed'
    with page.expect_download(timeout=15000) as event:
        page.evaluate("""async () => {const s=__indexedUIProbe,url=URL.createObjectURL(await s.handle.getFile());
          const a=document.createElement('a');a.href=url;a.download='saved-before-cleanup-failure.mp4';a.click();s.recoveryURL=url;}""")
    event.value.save_as(str(out/'output.mp4'))
    cloud.require((out/'output.mp4').stat().st_size==output['bytes'] and cloud.digest(out/'output.mp4')==output['sha256'],'Recovered saved file differs')
    report['fullOutputRecovered']=True
    open_details(page,'#receipt')
    with page.expect_download(timeout=10000) as event: page.locator('#receipt').click(timeout=5000)
    event.value.save_as(str(out/'receipt.json'))
    cloud.require(0 < (out/'receipt.json').stat().st_size <= RECORD_LIMIT,'Recovery receipt size')
    cloud.require(json.loads((out/'receipt.json').read_text())==after,'Downloaded recovery receipt differs')
    report['fullReceiptRecovered']=True
    (out/'input.mp4').write_bytes((cloud.ROOT/FIXTURE).read_bytes())
    cloud.write(out/'trial.json',{'name':'ui-cleanup-retry','source':FIXTURE,'settings':before['settings'],**identity,
        'inputBytes':(cloud.ROOT/FIXTURE).stat().st_size,'inputSHA256':cloud.digest(cloud.ROOT/FIXTURE),
        'bytes':output['bytes'],'sha256':output['sha256'],'receipt':after})
    return identity


def run_ui(page, report, out, requests, *, cleanup_retry=False):
    report['initial'] = page.evaluate(SNAPSHOT)
    cloud.require(report['initial']['route'] == 'legacy' and report['initial']['mode'] == 'copy'
                  and report['initial']['runDisabled'] is True and report['initial']['pickerCalls'] == 0, 'Initial UI route differs')
    report['emptyRegistryBefore'] = empty_registry_ui(page)
    fixture = cloud.ROOT/FIXTURE
    page.locator('#file').set_input_files(str(fixture)); idle(page)
    cloud.require(fixture.name in page.locator('#input-info').text_content(), 'UI input not inspected')
    for selector, value in [('#mode', 'convert'), ('#layout', 'tb'), ('#fov', '360'), ('#size', '256')]:
        page.locator(selector).select_option(value); idle(page)
    page.locator('#confirmed').check(); idle(page)
    report['legacyWithoutDestination'] = page.evaluate(SNAPSHOT)
    cloud.require(report['legacyWithoutDestination']['route'] == 'legacy' and not report['legacyWithoutDestination']['runDisabled'], 'Legacy default now requires a destination')
    page.locator('#execution-route').select_option('indexed'); idle(page)
    report['indexedWithoutDestination'] = page.evaluate(SNAPSHOT)
    cloud.require(report['indexedWithoutDestination']['runDisabled'] is True
                  and report['indexedWithoutDestination']['pickerCalls'] == 0, 'Indexed UI permits running without a destination')
    page.locator('#execution-route').select_option('legacy'); idle(page)
    cloud.require(page.locator('#run').is_enabled(), 'Returning to legacy changed its start contract')
    page.locator('#execution-route').select_option('indexed'); idle(page)
    cloud.require(page.locator('#run').is_disabled(), 'Indexed UI destination gate lost after switching')
    cloud.require(not any(path in (entry.FORK, entry.LEGACY) for path in requests), 'UI or inspect loaded a codec before execution')
    report['beforeRunRequests'] = list(requests)
    page.locator('#choose-save').click(timeout=5000); idle(page)
    report['destinationChosen'] = page.evaluate(SNAPSHOT)
    cloud.require(report['destinationChosen']['pickerCalls'] == 1 and not report['destinationChosen']['runDisabled'], 'Native OPFS destination not accepted')
    page.locator('#run').click(timeout=5000)
    if cleanup_retry: return run_cleanup_retry(page,report,out)
    page.wait_for_function("""() => {try {const r=JSON.parse(document.getElementById('diagnostics').textContent);
      return !document.getElementById('file').disabled && r.schemaVersion===2;} catch{return false;}}""", timeout=90000)
    receipt = read_dom_receipt(page); report['preparedUI'] = page.evaluate(SNAPSHOT)
    cloud.write(out/'receipt-before-download.json', receipt)
    report['receiptVerification'] = verify_receipt(receipt, report['build'], fixture.stat().st_size, cloud.digest(fixture))
    cloud.require(report['preparedUI']['resultHidden'] is False and report['preparedUI']['registryListDisabled'] is True
                  and report['preparedUI']['saveFact'] == '保存と内容の照合は完了しています。保存先の動画を保持しています。'
                  and report['preparedUI']['indexCleanupStatus'] == 'ブラウザ内の一時データの清掃は完了しています。保存状態とは別の確認です。', 'UI save/cleanup facts differ')
    report['nativeSavedFile'] = page.evaluate(READ_SAVED)
    observed = report['nativeSavedFile']; output = receipt['output']
    cloud.require(observed['initialBytes'] == 0 and observed['sameEntry'] is True and observed['pickerCalls'] == 1
                  and observed['bytes'] == output['bytes'] and observed['sha256'] == output['sha256'], 'Native picker output differs')
    identity = {key: receipt[key] for key in ('operationId', 'inputRevision')}
    report['internalBeforeClear'] = page.evaluate(CHECK_INTERNAL, identity)
    cloud.require(report['internalBeforeClear']['registryAbsent'] and report['internalBeforeClear']['heldJobLocks'] == 0
                  and report['internalBeforeClear']['pendingJobLocks'] == 0, 'Indexed cleanup not complete before UI clear')
    (out/'input.mp4').write_bytes(fixture.read_bytes())
    cloud.check_recovery_budget(out, out, output['bytes'])
    report['recoveryStage'] = 'download-save-as'
    with page.expect_download(timeout=15000) as event: page.locator('#download').click(timeout=5000)
    event.value.save_as(str(out/'output.mp4'))
    report['recoveryStage'] = 'full-file-hash'
    cloud.require((out/'output.mp4').stat().st_size == output['bytes'] and cloud.digest(out/'output.mp4') == output['sha256'], 'Native complete MP4 download differs')
    report['fullOutputRecovered'] = True
    report['recoveryStage'] = 'receipt-download'
    open_details(page, '#receipt')
    with page.expect_download(timeout=10000) as event: page.locator('#receipt').click(timeout=5000)
    event.value.save_as(str(out/'receipt.json'))
    cloud.require(0 < (out/'receipt.json').stat().st_size <= RECORD_LIMIT, 'Downloaded UI receipt size')
    downloaded = json.loads((out/'receipt.json').read_text())
    report['downloadedReceiptVerification'] = verify_receipt(downloaded, report['build'], fixture.stat().st_size,
        cloud.digest(fixture), after_download=True, previous=receipt)
    report['fullReceiptRecovered'] = True; report['recoveryStage'] = 'complete'
    cloud.write(out/'trial.json', {'name': 'ui-tb360-aac', 'source': FIXTURE, 'settings': receipt['settings'],
        **identity, 'inputBytes': fixture.stat().st_size, 'inputSHA256': cloud.digest(fixture),
        'bytes': output['bytes'], 'sha256': output['sha256'], 'receipt': downloaded})
    return identity


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cleanup-retry',action='store_true',help='Inject and recover one same-job registry removal failure after save')
    args=parser.parse_args()
    out=args.output.resolve(); cloud.require(not out.exists() and not out.is_relative_to(cloud.ROOT), 'Use new output directory outside checkout')
    out.mkdir(parents=True); server=None; started=time.monotonic()
    report={'schema':'vr180-indexed-ui-probe-v1', 'runId':os.environ.get('GITHUB_RUN_ID','local')+'-indexed-ui-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'),
        'status':'BLOCKED', 'scope':'unpublished real-page UI; one small synthetic TB360 AAC input; 1 GiB contract unchanged',
        'pickerSubstitution':'showSaveFilePicker only; returns one new native OPFS output handle; OS picker is not tested',
        'fullOutputRecovered':False, 'fullReceiptRecovered':False, 'independentMediaAcceptance':'PENDING',
        'pageErrors':[], 'workers':[], 'requests':[], 'deniedRequests':[], 'logOverflow':[], 'cleanup':{'status':'NOT_RUN'},
        'notVerified':['OS save picker/permissions', '5/10 GB through this UI', 'target VR player', 'real camera quality', 'novice usability', 'Sites or Pages deployment']}
    if args.cleanup_retry:
        report['runId']+='-cleanup-retry'
        report['faultInjection']={'scope':'conversion Worker registry namespace removal only; explicit release before UI retry',
                                 'sha256':hashlib.sha256(CLEANUP_FAULT.encode()).hexdigest(),'source':CLEANUP_FAULT}
    def deadline(*_): raise cloud.Deadline('Indexed UI deadline')
    signal.signal(signal.SIGALRM,deadline); signal.signal(signal.SIGTERM,deadline); signal.alarm(300)
    try:
        cloud.require(os.environ.get('GITHUB_REPOSITORY')=='Kushyameln01/kushyameln-works', 'Repository differs')
        source=cloud.source_check(out,candidate=True); report['checkoutCommit']=source['checkoutCommit']; cloud.preflight(out,defer_verification=True)
        match=re.search(r"^const BUILD = '([^']+)';$", (cloud.DOCS/'shared/vr180/worker.mjs').read_text(),re.MULTILINE)
        cloud.require(match is not None, 'Worker build identity missing'); report['build']=match[1]
        source['sharedHarnessBuildLabel']=source['build']; source['build']=report['build']; cloud.write(out/'source-inventory.json',source)
        paths=sorted({p.relative_to(cloud.ROOT).as_posix() for p in (cloud.DOCS/'shared/vr180').rglob('*.mjs')}
            | {'docs/vr180-studio/index.html','docs/vr180-studio/app.mjs','docs/vr180-studio/style.css',entry.LEGACY.lstrip('/'),FIXTURE})
        cloud.command(['git','ls-files','--error-unmatch',*paths,str(Path(__file__).resolve().relative_to(cloud.ROOT))])
        report['harnessSHA256']=cloud.digest(Path(__file__)); report['sharedHarnessSHA256']=cloud.digest(Path(cloud.__file__))
        content={}
        for name in paths:
            path=cloud.ROOT/name; cloud.require(not path.is_symlink(),'Source symlink refused')
            mime={'.html':'text/html','.css':'text/css','.mp4':'video/mp4'}.get(path.suffix,'text/javascript')
            content['/'+name]=(path.read_bytes(),mime)
        content[PAGE]=content[PAGE+'index.html']
        server=base.start_server(content); origin=f'http://127.0.0.1:{server.server_port}'
        inventory=[]
        for route,(body,_) in content.items():
            with urllib.request.urlopen(origin+route,timeout=5) as response: served=response.read(len(body)+1)
            cloud.require(served==body,'Served source mismatch'); inventory.append({'route':route,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
        cloud.write(out/'served-source-inventory.json',{'checkoutCommit':source['checkoutCommit'],'exactRoutesOnly':True,'files':inventory})
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=str(cloud.CHROME),headless=True,chromium_sandbox=True,timeout=30000)
            report['browserVersion']=browser.version
            try:
                context=browser.new_context(accept_downloads=True,service_workers='block')
                context.add_init_script(PICKER + ('\n'+CLEANUP_FAULT if args.cleanup_retry else ''))
                def append(key,value,limit):
                    if len(report[key])<limit and len(value)<=4096: report[key].append(value)
                    elif key not in report['logOverflow']: report['logOverflow'].append(key)
                def route_request(route):
                    if route.request.url.startswith(origin+'/'): route.continue_()
                    else: append('deniedRequests',route.request.url,16); route.abort()
                context.route('**/*',route_request)
                context.on('request',lambda request:append('requests',request.url.removeprefix(origin),512))
                page=context.new_page(); page.on('pageerror',lambda error:append('pageErrors',str(error),8))
                page.on('worker',lambda worker:append('workers',worker.url.removeprefix(origin),4))
                identity=None
                try:
                    page.goto(origin+PAGE,wait_until='networkidle'); page.wait_for_function("() => document.getElementById('execution-route') && !document.getElementById('file').disabled",timeout=10000)
                    identity=run_ui(page,report,out,report['requests'],cleanup_retry=args.cleanup_retry)
                    cloud.require([path for path in report['requests'] if path in (entry.FORK,entry.LEGACY)]==[entry.FORK], 'UI codec isolation differs')
                    cloud.require(len(report['workers'])==2 and (args.cleanup_retry or report['workers']==['/docs/shared/vr180/worker.mjs']*2), 'UI should run only inspect and one indexed conversion')
                    report['status']='PASS'
                finally:
                    try:
                        report['beforeCleanupUI']=page.evaluate(SNAPSHOT)
                        cloud.write(out/'browser-before-cleanup.json',report['beforeCleanupUI'])
                        # Use the real result-clear action after all native downloads.
                        # On a failed run, cancel through the UI if it is still busy.
                        if page.locator('#cancel').is_enabled(): page.locator('#cancel').click(timeout=5000); idle(page)
                        if page.locator('#clear').is_visible() and page.locator('#clear').is_enabled():
                            page.locator('#clear').click(timeout=5000); idle(page)
                        report['afterCleanupUI']=page.evaluate(SNAPSHOT)
                        report['emptyRegistryAfter']=empty_registry_ui(page)
                        if identity:
                            report['internalAfterClear']=page.evaluate(CHECK_INTERNAL,identity)
                            internal=report['internalAfterClear']
                            cloud.require(internal['registryAbsent'] and internal['heldJobLocks']==0 and internal['pendingJobLocks']==0,'Internal indexed resources remain')
                            report['nativeSavedAfterClear']=page.evaluate(READ_SAVED)
                            cloud.require(all(report['nativeSavedAfterClear'][key]==report['nativeSavedFile'][key] for key in ('bytes','sha256','namespace')),'Clearing UI changed saved output')
                        cloud.require(report['afterCleanupUI']['resultHidden'] is True and report['afterCleanupUI']['cleanupWarning']=='','UI cleanup incomplete')
                        report['cleanup']=page.evaluate(REMOVE_OWN_OUTPUT) if identity and report['fullOutputRecovered'] and report['fullReceiptRecovered'] else {'status':'RETAINED','reason':'output recovery not proven; no harness output deleted'}
                        final=page.evaluate(SNAPSHOT); report['finalUI']=final
                        cloud.require(not report['pageErrors'] and not report['deniedRequests'] and not report['logOverflow']
                            and not final['unhandled'] and not final['unhandledOverflow'],'Unexpected browser error/network/log overflow')
                        if report['cleanup']['status']!='REMOVED': report['status']='BLOCKED'
                    except Exception as error:
                        report['cleanup']={'status':'NOT_VERIFIED','error':f'{type(error).__name__}: {error}'}; report['status']='BLOCKED'
                        (out/'cleanup-traceback.txt').write_text(traceback.format_exc())
                    context.close()
            finally: browser.close()
    except Exception as error:
        report.update(status='BLOCKED' if isinstance(error,(cloud.Blocked,cloud.Deadline)) else 'FAIL',error=f'{type(error).__name__}: {error}')
        (out/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if server: server.shutdown(); server.server_close()
        report['elapsedSeconds']=time.monotonic()-started; cloud.write(out/'run.json',report); transported=cloud.emit_evidence(out,report)
    return 0 if transported and report['status']=='PASS' else 1


if __name__=='__main__': raise SystemExit(main())
