#!/usr/bin/env python3
"""Exercise candidate StereoClient/Worker routes in sandboxed Chrome and recover small MP4s.

The indexed runtime is deliberately limited to the existing 1 GiB contract. This
is a separate adapter trial, not evidence that its product UI accepts 5/10 GB.
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

spec = importlib.util.spec_from_file_location('indexed_probe', Path(__file__).with_name('probe-indexed-conversion.py'))
private = importlib.util.module_from_spec(spec); spec.loader.exec_module(private)
base, cloud = private.base, private.cloud
FORK = '/docs/shared/vr180/vendor/mediabunny-indexed.mjs'
LEGACY = '/docs/shared/media-basic/vendor/mediabunny.mjs'

INIT = r"""async()=>{
 const [{StereoClient},{sha256Blob},{REGISTRY_ROOT}]=await Promise.all([
  import('/docs/shared/vr180/client.mjs'),import('/docs/shared/vr180/sha256.mjs'),
  import('/docs/shared/vr180/ownership-registry.mjs')]);
 const require=(ok,msg)=>{if(!ok)throw Error(msg);};
 require(isSecureContext&&navigator.storage?.getDirectory&&navigator.locks?.query,'NATIVE_CAPABILITY_UNAVAILABLE');
 const origin=await navigator.storage.getDirectory(),namespace='entry-'+crypto.randomUUID();
 try{await origin.getDirectoryHandle(namespace);throw Error('NAMESPACE_EXISTS');}catch(e){if(e.name!=='NotFoundError')throw e;}
 const root=await origin.getDirectoryHandle(namespace,{create:true});
 const state=globalThis.__entryProbe={origin,root,namespace,sha256Blob,require,REGISTRY_ROOT,rows:[],urls:[],names:[],handles:new Map(),active:null,unhandled:[]};
 addEventListener('unhandledrejection',e=>{if(state.unhandled.length<8)state.unhandled.push(String(e.reason));});
 state.client=new StereoClient({onEvent:event=>{
  const row=state.active;if(!row)return;
  if(event.type==='progress'){
   row.progressEvents++;row.lastProgress=event.progress;
   if(row.expectCancel&&!row.cancelRequested&&event.progress.videoFrames>=10){
    row.cancelRequested=true;row.cancelAt=event.progress;
    row.cancelPromise=state.client.cancel().then(()=>{row.cancelAcknowledged=true;},e=>{row.cancelError=String(e);});
   }
  }else if(event.type==='indexed-ownership'){
   row.registryEventCount=(row.registryEventCount??0)+1;
   if(row.registryEvents.length>=8){row.registryOverflow=true;return;}
   row.registryEvents.push(event.registry);
  }else if(event.type==='cleanup-complete'||event.type==='cleanup-error')row.cleanupEvent=event;
 }});
 return {namespace,secureContext:isSecureContext,nativeOPFS:true,nativeWebLocks:true};
}"""

RUN_CASE = r"""async trial=>{
 const state=globalThis.__entryProbe,{client,require,sha256Blob}=state;
 require(!client.current,'PREVIOUS_JOB_NOT_DISPOSED');
 const response=await fetch('/'+trial.source);require(response.ok,'FIXTURE_FETCH');
 const file=new File([await response.blob()],trial.source.split('/').at(-1),{type:'video/mp4'});
 const row={...trial,status:'STARTED',inputBytes:file.size,inputSHA256:await sha256Blob(file),
  registryEvents:[],progressEvents:0,cancelRequested:false};
 state.rows.push(row);state.active=row;
 let handle,timeout;
 try{
  if(trial.direct){
   const name=(trial.handleKey??trial.name)+'.mp4';
   handle=await state.root.getFileHandle(name,{create:true});
   row.reusedHandleIdentityMatched=state.handles.has(name)?await handle.isSameEntry(state.handles.get(name)):null;
   if(state.handles.has(name))require(row.reusedHandleIdentityMatched,'RETRY_HANDLE_IDENTITY');
   state.handles.set(name,handle);
   if(!state.names.includes(name))state.names.push(name);
   require((await handle.getFile()).size===0,'TARGET_NOT_EMPTY');row.targetInitiallyEmpty=true;
  }
  const pending=client.run(file,trial.settings,{outputHandle:handle});
  row.operationId=client.current.operationId;row.inputRevision=client.current.inputRevision;
  const result=await Promise.race([pending,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('CASE_DEADLINE')),60000);})]);
  require(!trial.expectCancel&&!trial.expectedError,'NEGATIVE_UNEXPECTED_SUCCESS');
  if(trial.settings.mode==='inspect'){require(result.info.width>0,'INSPECT_RESULT');row.info=result.info;row.build=result.build;}
  else{
   const receipt=result.receipt;row.receipt=receipt;row.build=receipt.build;
   require(receipt.schemaVersion===2&&receipt.operationId===row.operationId&&receipt.inputRevision===row.inputRevision,'RECEIPT_IDENTITY');
   require(receipt.input.bytes===file.size&&receipt.input.sha256===row.inputSHA256,'RECEIPT_INPUT');
   const saved=handle?await handle.getFile():result.blob;
   row.bytes=saved.size;row.sha256=await sha256Blob(saved);
   require(row.bytes===receipt.output.bytes&&row.sha256===receipt.output.sha256,'FULL_OUTPUT_REREAD');
   if(handle)require(receipt.saveWriteCommitted&&receipt.saveCompleted&&receipt.saveAttempts.length===1,'SAVE_RECEIPT_NOT_VERIFIED');
   else require(!receipt.saveWriteCommitted&&!receipt.saveCompleted,'PREPARED_NOT_SAVED');
   if(trial.settings.executionRoute==='indexed'){
    require(receipt.executionRoute==='indexed'&&receipt.directSave.savedObservation.committed,'INDEXED_SAVED_OBSERVATION');
    require(receipt.directSave.wholeFileHashCompared===false&&receipt.directSave.metadataHashMatched===true,'HASH_BASIS');
   }
   row.urlIndex=state.urls.length;state.urls.push(URL.createObjectURL(saved));
  }
  row.status='PASS';
 }catch(error){
  row.error={name:error.name,message:error.message};row.receipt=error.diagnostics??null;row.build=row.receipt?.build??null;
  if(trial.expectedError&&error.message===trial.expectedError)row.status='EXPECTED_REJECTION';
  else if(trial.expectCancel&&row.cancelRequested&&error.name==='AbortError')row.status='EXPECTED_CANCELLATION';
  else row.status='FAIL';
 }finally{
  clearTimeout(timeout);
  try{await row.cancelPromise;await client.dispose();}catch(error){row.cleanupError=String(error);row.status='FAIL';}
  delete row.cancelPromise;
 }
 row.clientReleased=client.current===null&&!client.cleanupPending;
 if(!row.clientReleased||row.cleanupEvent?.type!=='cleanup-complete'||row.registryOverflow)row.status='FAIL';
 if(trial.expectCancel||trial.expectedError){
  row.savedBytes=(await handle.getFile()).size;
  const r=row.receipt,expectedStatus=trial.expectCancel?'canceled':'failed';
  row.negativeReceiptVerified=!!r&&r.schemaVersion===2&&r.operationId===row.operationId&&r.inputRevision===row.inputRevision
   &&r.status===expectedStatus&&r.input?.bytes===file.size&&r.output===null&&r.saveWriteCommitted===false&&r.saveCompleted===false
   &&r.saveAttempts?.length===1&&['aborted','not-started'].includes(r.saveAttempts[0].commitState)
   &&r.cleanup?.status==='complete'&&r.internalIndexCleanup==='complete'
   &&(trial.expectCancel?r.error?.name==='AbortError'&&r.input.sha256===row.inputSHA256:r.error?.message===trial.expectedError);
  if(row.savedBytes!==0||(trial.expectCancel&&!row.cancelAcknowledged)||!row.negativeReceiptVerified)row.status='FAIL';
 }
 if(trial.settings.executionRoute==='indexed'){
  const identities=row.registryEvents.map(e=>e.identity).filter(Boolean);
  row.registryIdentitiesConsistent=trial.expectedError?identities.length===0:identities.length>=3&&identities.every(i=>i.operationId===row.operationId&&i.inputRevision===row.inputRevision&&i.namespace===identities[0].namespace);
  row.registryAbsent=false;
  try{const registry=await state.origin.getDirectoryHandle(state.REGISTRY_ROOT);await registry.getDirectoryHandle(`${row.operationId}-r${row.inputRevision}`);}
  catch(error){if(error.name==='NotFoundError')row.registryAbsent=true;else row.registryCheckError=String(error);}
  row.heldJobLocks=(await navigator.locks.query()).held.filter(lock=>lock.name.includes(row.operationId)).length;
  if(!row.registryIdentitiesConsistent||!row.registryAbsent||row.heldJobLocks!==0||row.cleanupEvent?.internalIndexCleanup!=='complete')row.status='FAIL';
 }else if(row.registryEvents.length)row.status='FAIL';
 state.active=null;return row;
}"""

CLEANUP = r"""async()=>{
 const state=globalThis.__entryProbe;if(!state)return {status:'NOT_CREATED'};
 for(const url of state.urls)URL.revokeObjectURL(url);
 if(state.client.current||state.rows.some(r=>!['PASS','EXPECTED_CANCELLATION','EXPECTED_REJECTION'].includes(r.status)||!r.clientReleased))return {status:'RETAINED',reason:'CASE_OR_CLEANUP_INCOMPLETE'};
 for await(const [name,entry]of state.root.entries())if(entry.kind!=='file'||!state.names.includes(name))return {status:'RETAINED',reason:'UNKNOWN_OUTPUT_ENTRY'};
 for(const name of state.names)await state.root.removeEntry(name);
 await state.origin.removeEntry(state.namespace);
 return {status:'REMOVED',scope:'Only harness-owned output files and empty harness namespace, nonrecursive; index cleanup performed by product entry'};
}"""

def cases():
    template = private.cases_for('small')[0]
    control = []
    for name, mode, direct in [('inspect', 'inspect', False), ('copy', 'copy', False),
                               ('legacy-prepared', 'convert', False), ('legacy-direct', 'convert', True)]:
        control.append({**template, 'name': name, 'settings': {**template['settings'], 'mode': mode}, 'direct': direct})
    rejection = {**template, 'name': 'indexed-profile-rejection', 'direct': True, 'expectedError': 'OUTPUT_PROFILE_UNSUPPORTED',
                 'settings': {**template['settings'], 'executionRoute': 'indexed', 'outputProfileId': 'p5-10gb'}}
    return control + [rejection] + [{**c, 'direct': True, 'settings': {**c['settings'], 'executionRoute': 'indexed'}} for c in private.cases_for('small')]

def verify_ownership(row):
    """Check bounded persisted record bytes against the observed operation identity."""
    events = row['registryEvents']; identities = [event['identity'] for event in events]
    cloud.require(1 <= len(identities) <= 8 and all(value == identities[0] for value in identities), 'Ownership identities differ')
    identity = identities[0]
    cloud.require(set(identity) == {'format', 'schema', 'operationId', 'inputRevision', 'namespace', 'ownerToken'}
                  and identity['format'] == 'vr180-indexed-registry' and type(identity['schema']) is int and identity['schema'] == 1
                  and identity['operationId'] == row['operationId'] and identity['inputRevision'] == row['inputRevision']
                  and type(identity['inputRevision']) is int and identity['inputRevision'] >= 0
                  and identity['namespace'] == f"{row['operationId']}-r{row['inputRevision']}"
                  and re.fullmatch('[a-zA-Z0-9_-]{1,60}', identity['operationId'])
                  and re.fullmatch('[a-f0-9]{32}', identity['ownerToken']), 'Registry identity schema')
    cloud.require(all(e['status'] in ('creating', 'ready', 'persisted') for e in events), 'Unknown registry event')
    headers = [event for event in events if event['status'] == 'ready']
    cloud.require(len(headers) == 1 and headers[0]['ticketCount'] == 0, 'Expected one persisted identity header')
    persisted = [event for event in events if event['status'] == 'persisted']
    cloud.require(len(persisted) == 2 and {e['ticket']['kind'] for e in persisted} == {'input', 'output'}, 'Expected both index ownership records')
    checks = []
    for event in headers+persisted:
        if event['status'] == 'persisted':
            ticket = event['ticket']; suffix = '-in' if ticket['kind'] == 'input' else '-out'
            cloud.require(set(ticket) == {'format', 'schema', 'jobId', 'ownerToken', 'kind'}
                          and ticket['format'] == 'vr180-private-index-owner' and type(ticket['schema']) is int and ticket['schema'] == 1
                          and ticket['jobId'] == row['operationId']+suffix and re.fullmatch('[a-f0-9]{32}', ticket['ownerToken']), 'Ticket schema')
        raw = event['persistedJSON'].encode('utf-8'); content = json.loads(raw)
        cloud.require(0 < len(raw) <= 1024 and len(raw) == event['bytes'], 'Ownership record size')
        cloud.require(hashlib.sha256(raw).hexdigest() == event['sha256'], 'Ownership record hash')
        expected = identity if event['status'] == 'ready' else {'identity': identity, 'ticket': event['ticket']}
        cloud.require(content == expected, 'Ownership record content')
        cloud.require(all(event[key] is True for key in ['flushed', 'closed', 'readbackMatched'])
                      and all(type(event[key]) is int and event[key] > 0 for key in ['writeCalls', 'readCalls']), 'Ownership record lifecycle')
        checks.append({'kind': event.get('ticket', {}).get('kind', 'identity'), 'bytes': len(raw), 'sha256': event['sha256']})
    return {'status': 'PASS', 'records': checks, 'scope': 'Recovered record bytes/hash and reported native write/read/flush/close; no power-loss durability claim'}

def verify_generations(rows):
    cloud.require(len({row['operationId'] for row in rows}) == len(rows), 'Repeated operation ID')
    cloud.require([row['inputRevision'] for row in rows] == list(range(1, len(rows)+1)), 'Input generation sequence')
    before, after = rows[-2:]
    cloud.require(before['name'] == 'cancel' and after['name'] == 'retry'
                  and before['handleKey'] == after['handleKey'] and before['operationId'] != after['operationId']
                  and before['inputSHA256'] == after['inputSHA256'] and before['inputBytes'] == after['inputBytes']
                  and before['savedBytes'] == 0 and after['targetInitiallyEmpty'] and after['reusedHandleIdentityMatched'] is True, 'Cancel/retry identity or reused handle differs')
    return {'status': 'PASS', 'operationCount': len(rows), 'sameInputAndHandleRetry': True}

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--output', type=Path, required=True)
    out = parser.parse_args().output.resolve()
    cloud.require(not out.exists() and not out.is_relative_to(cloud.ROOT), 'Use new output directory outside checkout')
    out.mkdir(parents=True); started = time.monotonic(); server = None
    report = {'schema': 'vr180-indexed-entry-probe-v1', 'runId': os.environ.get('GITHUB_RUN_ID', 'local')+'-indexed-entry-'+os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
              'status': 'BLOCKED', 'scope': 'unpublished candidate client/worker adapter; 1 GiB contract; synthetic small fixtures',
              'fullOutputsRecovered': 0, 'independentMediaAcceptance': 'PENDING', 'cases': [], 'pageErrors': [], 'workers': [], 'cleanup': {'status': 'NOT_RUN'},
              'notVerified': ['5/10 GB through this adapter', 'OS save picker', 'target VR player', 'real camera quality', 'novice usability', 'Sites or Pages deployment']}
    def deadline(*_): raise cloud.Deadline('Indexed entry probe deadline')
    signal.signal(signal.SIGALRM, deadline); signal.signal(signal.SIGTERM, deadline); signal.alarm(540)
    try:
        cloud.require(os.environ.get('GITHUB_REPOSITORY') == 'Kushyameln01/kushyameln-works', 'Repository differs')
        source = cloud.source_check(out, candidate=True); report['checkoutCommit'] = source['checkoutCommit']; cloud.preflight(out, defer_verification=True)
        build = re.search(r"^const BUILD = '([^']+)';$", (cloud.DOCS/'shared/vr180/worker.mjs').read_text(), re.MULTILINE)
        cloud.require(build is not None, 'Worker build identity missing')
        source['sharedHarnessBuildLabel'] = source['build']; source['build'] = report['build'] = build[1]
        cloud.write(out/'source-inventory.json', source)
        trials = cases()
        paths = sorted({p.relative_to(cloud.ROOT).as_posix() for p in (cloud.DOCS/'shared/vr180').rglob('*.mjs')}
                       | {LEGACY.lstrip('/')} | {c['source'] for c in trials})
        cloud.command(['git', 'ls-files', '--error-unmatch', *paths, str(Path(__file__).resolve().relative_to(cloud.ROOT))])
        report['harnessSHA256'] = cloud.digest(Path(__file__)); report['sharedHarnessSHA256'] = cloud.digest(Path(cloud.__file__))
        content = {'/': (b'<!doctype html><meta charset="utf-8"><title>VR180 indexed entry candidate verification</title>', 'text/html')}
        for file in paths:
            path = cloud.ROOT/file; cloud.require(not path.is_symlink(), 'Source symlink refused')
            content['/'+file] = (path.read_bytes(), 'video/mp4' if file.endswith('.mp4') else 'text/javascript')
        server = base.start_server(content); origin = f'http://127.0.0.1:{server.server_port}'
        inventory = []
        for route, (body, _) in content.items():
            with urllib.request.urlopen(origin+route, timeout=5) as response: served = response.read(len(body)+1)
            cloud.require(served == body, 'Served source mismatch')
            inventory.append({'route': route, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
        cloud.write(out/'served-source-inventory.json', {'checkoutCommit': source['checkoutCommit'], 'exactRoutesOnly': True, 'files': inventory})
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=str(cloud.CHROME), headless=True, chromium_sandbox=True, timeout=30000)
            report['browserVersion'] = browser.version
            try:
                context = browser.new_context(accept_downloads=True)
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
                requests = []; report['logOverflow'] = []
                def bounded_append(target, value, limit, label):
                    if len(target) < limit and len(value) <= 4096: target.append(value)
                    elif label not in report['logOverflow']: report['logOverflow'].append(label)
                context.on('request', lambda request: bounded_append(requests, request.url.removeprefix(origin), 2048, 'requests'))
                page = context.new_page(); page.on('pageerror', lambda error: bounded_append(report['pageErrors'], str(error), 8, 'pageErrors'))
                page.on('worker', lambda worker: bounded_append(report['workers'], worker.url.removeprefix(origin), 16, 'workers'))
                try:
                    page.goto(origin+'/', wait_until='networkidle'); report['environment'] = page.evaluate(INIT)
                    for trial in trials:
                        request_start = len(requests); row = page.evaluate(RUN_CASE, trial)
                        row['requestedRoutes'] = requests[request_start:]; report['cases'].append(row)
                        cloud.require(row['build'] == report['build'], 'Actual Worker build differs')
                        mode = trial['settings']['mode']; indexed = trial['settings'].get('executionRoute') == 'indexed'
                        vendors = [path for path in row['requestedRoutes'] if path in (FORK, LEGACY)]
                        cloud.require(vendors == ([] if trial.get('expectedError') else [FORK] if indexed else [LEGACY] if mode == 'convert' else []), 'Codec module isolation differs: '+trial['name'])
                        cloud.write(out/'browser-observations.json', report['cases'])
                        cloud.require(row['status'] == ('EXPECTED_REJECTION' if trial.get('expectedError') else 'EXPECTED_CANCELLATION' if trial.get('expectCancel') else 'PASS'), 'Client/Worker trial failed: '+trial['name'])
                        if indexed and not trial.get('expectedError'): row['ownershipVerification'] = verify_ownership(row)
                        if 'urlIndex' in row:
                            folder = out/row['name']; folder.mkdir(); (folder/'input.mp4').write_bytes((cloud.ROOT/row['source']).read_bytes())
                            cloud.require((folder/'input.mp4').stat().st_size == row['inputBytes'] and cloud.digest(folder/'input.mp4') == row['inputSHA256'], 'Recovered input differs')
                            cloud.check_recovery_budget(out, folder, row['bytes'])
                            with page.expect_download(timeout=15000) as download:
                                page.evaluate('([i,name])=>{const a=document.createElement("a");a.href=__entryProbe.urls[i];a.download=name;a.click();}', [row['urlIndex'], row['name']+'.mp4'])
                            saved = folder/'output.mp4'; download.value.save_as(str(saved))
                            cloud.require(saved.stat().st_size == row['bytes'] and cloud.digest(saved) == row['sha256'], 'Recovered complete MP4 differs')
                            cloud.write(folder/'trial.json', row); report['fullOutputsRecovered'] += 1
                    report['unhandledErrors'] = page.evaluate('__entryProbe.unhandled')
                    cloud.require(not report['pageErrors'] and not report['unhandledErrors'] and not report['logOverflow'], 'Unexpected browser error or log overflow')
                    cloud.require(report['workers'] == ['/docs/shared/vr180/worker.mjs']*len(trials), 'Worker source differs')
                    cloud.require(report['fullOutputsRecovered'] == 9, 'Missing complete MP4s')
                    report['generationVerification'] = verify_generations(report['cases'])
                    report['status'] = 'PASS'
                finally:
                    try:
                        partial = page.evaluate('()=>globalThis.__entryProbe?.rows?.map(({cancelPromise,...row})=>row)??[]')
                        cloud.write(out/'browser-final-observations.json', partial)
                        report['cleanup'] = page.evaluate(CLEANUP)
                        if report['cleanup']['status'] not in ('REMOVED', 'NOT_CREATED'): report['status'] = 'BLOCKED'
                    except Exception as error: report['cleanup'] = {'status': 'NOT VERIFIED', 'error': str(error)}; report['status'] = 'BLOCKED'
                    context.close()
            finally: browser.close()
    except Exception as error:
        report.update(status='BLOCKED' if isinstance(error, (cloud.Blocked, cloud.Deadline)) else 'FAIL', error=f'{type(error).__name__}: {error}')
        (out/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if server: server.shutdown(); server.server_close()
        report['elapsedSeconds'] = time.monotonic()-started; cloud.write(out/'run.json', report)
        transported = cloud.emit_evidence(out, report)
    return 0 if transported and report['status'] == 'PASS' else 1

if __name__ == '__main__': raise SystemExit(main())
