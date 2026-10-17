#!/usr/bin/env python3
"""Private 16 MiB OPFS save/restart/readback capability probe, not media acceptance.

P0/P5 and Tips 08/11: distinguish API completion, full readback, restart, storage
estimates and resource cleanup. Only a newly owned disposable Chrome profile is
used. Sandbox stays enabled; no quota flags or persistent-storage grant request.
The same local origin and profile survive one normal browser close/relaunch.
22 GB is a design comparison, never a capacity reservation or a pass/fail gate.
"""
from __future__ import annotations

import argparse
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import tempfile
import threading
import time
import traceback
import urllib.request
import uuid

spec = importlib.util.spec_from_file_location('cloud', Path(__file__).with_name('cloud-validate.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
CHUNK_BYTES = 1024 * 1024
CHUNKS = 16
DESIGN_CONCURRENT_BYTES = 22_000_000_000  # Decimal GB, not GiB.
SOURCES = ['docs/shared/vr180/sha256.mjs']
HTML = b'<!doctype html><meta charset="utf-8"><title>Private persistent-profile storage probe</title>'
WORKER = r"""import {Sha256} from '/docs/shared/vr180/sha256.mjs';
const CHUNK_BYTES=1048576,CHUNKS=16,TOTAL=CHUNK_BYTES*CHUNKS;
const need=(value,message)=>{if(!value)throw Error(message);};
const describe=error=>({name:error.name,message:error.message});
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
function fill(bytes,chunk){for(let i=0;i<bytes.length;i++)bytes[i]=(i*17+(i>>>8)*29+chunk*43+101)&255;}
async function estimate(){const value=await navigator.storage.estimate();
 const quota=Number.isSafeInteger(value.quota)&&value.quota>=0?value.quota:null;
 const usage=Number.isSafeInteger(value.usage)&&value.usage>=0?value.usage:null;
 return {quotaBytes:quota,usageBytes:usage,availableBytes:quota!==null&&usage!==null?Math.max(0,quota-usage):null,
  persisted:typeof navigator.storage.persisted==='function'?await navigator.storage.persisted():null,
  note:'Estimate may be privacy-rounded; neither reserved bytes nor an enforced capacity ceiling. No persist() request.'};}
async function absent(root,name){try{await root.getDirectoryHandle(name);return false;}catch(error){if(error.name==='NotFoundError')return true;throw error;}}
async function inspect(file){
 need(file.size===TOTAL,'WITNESS_SIZE_DIFFERS');const hash=new Sha256(),chunks=[];let comparedBytes=0;
 for(let index=0;index<CHUNKS;index++){
  const offset=index*CHUNK_BYTES,bytes=new Uint8Array(await file.slice(offset,offset+CHUNK_BYTES).arrayBuffer());
  need(bytes.length===CHUNK_BYTES,'WITNESS_SHORT_READ');
  for(let i=0;i<bytes.length;i++)need(bytes[i]===((i*17+(i>>>8)*29+index*43+101)&255),'WITNESS_BYTE_DIFFERS:'+String(offset+i));
  hash.update(bytes);const chunkHash=new Sha256();chunkHash.update(bytes);
  chunks.push({index,offset,bytes:bytes.length,sha256:chunkHash.digestHex()});comparedBytes+=bytes.length;await yieldTask();
 }
 return {bytes:file.size,comparedBytes,endReached:comparedBytes===TOTAL,sha256:hash.digestHex(),chunks};
}
async function execute({action,namespace}){
 const row={action,namespace,status:'STARTED',stage:'capabilities',committed:false,writerClosed:false,
  writeCalls:0,writtenBytes:0,namespaceRemoved:false,startedMs:performance.now()};let writer;
 try{
  need(['write','restart-read-and-cleanup'].includes(action)&&/^vr180-persist-[0-9a-f]{32}$/.test(namespace),'INVALID_REQUEST');
  row.capabilities={secureContext:isSecureContext,moduleWorker:true,getDirectory:typeof navigator.storage?.getDirectory,
   estimate:typeof navigator.storage?.estimate,createWritable:typeof globalThis.FileSystemFileHandle?.prototype?.createWritable,
   userAgent:navigator.userAgent,origin:location.origin};
  need(isSecureContext&&row.capabilities.getDirectory==='function'&&row.capabilities.estimate==='function'
   &&row.capabilities.createWritable==='function','NATIVE_CAPABILITY_UNAVAILABLE');
  row.before=await estimate();const root=await navigator.storage.getDirectory();let directory,handle;
  if(action==='write'){
   row.stage='create';need(await absent(root,namespace),'NAMESPACE_EXISTS');directory=await root.getDirectoryHandle(namespace,{create:true});
   handle=await directory.getFileHandle('witness.bin',{create:true});need((await handle.getFile()).size===0,'WITNESS_NOT_EMPTY');
   writer=await handle.createWritable({keepExistingData:false});const chunk=new Uint8Array(CHUNK_BYTES);
   row.stage='write';row.writeStartedMs=performance.now();
   for(let index=0;index<CHUNKS;index++){fill(chunk,index);await writer.write(chunk);row.writeCalls++;row.writtenBytes+=chunk.length;await yieldTask();}
   row.writeEndedMs=performance.now();row.stage='commit';row.closeStartedMs=performance.now();
   await writer.close();writer=null;row.writerClosed=true;row.committed=true;row.closeEndedMs=performance.now();
  }else{directory=await root.getDirectoryHandle(namespace);handle=await directory.getFileHandle('witness.bin');}
  // Never delete an unknown entry, even when the expected file is readable.
  let entries=0;for await(const [name,entry]of directory.entries()){
   need(name==='witness.bin'&&entry.kind==='file','UNKNOWN_NAMESPACE_ENTRY');entries++;}
  need(entries===1,'WITNESS_ENTRY_MISSING');row.stage='readback';row.readStartedMs=performance.now();
  row.readback=await inspect(await handle.getFile());row.readEndedMs=performance.now();row.afterRead=await estimate();
  if(action==='restart-read-and-cleanup'){
   row.stage='cleanup';await directory.removeEntry('witness.bin');await root.removeEntry(namespace);
   row.namespaceRemoved=await absent(root,namespace);need(row.namespaceRemoved,'NAMESPACE_REMAINS');row.afterCleanup=await estimate();
  }
  row.status='PASS';row.stage='complete';
 }catch(error){row.status=/UNAVAILABLE/.test(error.message)?'BLOCKED':'FAIL';row.error=describe(error);}
 finally{
  if(writer){try{await writer.abort();row.writerAborted=true;}catch(error){row.abortError=describe(error);row.status='FAIL';}}
  row.endedMs=performance.now();row.elapsedMs=row.endedMs-row.startedMs;
 }
 return row;
}
self.onmessage=({data})=>execute(data).then(result=>self.postMessage(result),error=>self.postMessage({status:'FAIL',error:describe(error)}));
"""
PAGE = r"""args=>{
 globalThis.__storageProbe={result:null,worker:null};const state=globalThis.__storageProbe;
 const worker=state.worker=new Worker('/probe-worker.mjs',{type:'module'});
 worker.onmessage=event=>{state.result=event.data;worker.terminate();};
 worker.onerror=event=>{state.result={status:'FAIL',error:{message:event.message}};worker.terminate();};
 worker.postMessage(args);
}"""


def expected_witness():
    """Independent Python whole-file oracle; one MiB of generated bytes at a time."""
    base = bytes((i * 17 + (i >> 8) * 29 + 101) & 255 for i in range(CHUNK_BYTES))
    total = hashlib.sha256(); chunks = []
    for index in range(CHUNKS):
        data = base.translate(bytes((i + index * 43) & 255 for i in range(256)))
        total.update(data)
        chunks.append({'index': index, 'offset': index * CHUNK_BYTES, 'bytes': CHUNK_BYTES,
                       'sha256': hashlib.sha256(data).hexdigest()})
    return {'bytes': CHUNK_BYTES * CHUNKS, 'comparedBytes': CHUNK_BYTES * CHUNKS,
            'endReached': True, 'sha256': total.hexdigest(), 'chunks': chunks}


def validate_observation(row, action, namespace, expected):
    c.require(row.get('status') == 'PASS' and row['action'] == action and row['namespace'] == namespace,
              'Native save/restart action did not pass')
    c.require(row['readback'] == expected, 'Independent complete byte/hash oracle differs')
    c.require(row['capabilities']['secureContext'] and row['capabilities']['moduleWorker'], 'Secure Module Worker not observed')
    if action == 'write':
        c.require(row['committed'] and row['writerClosed'] and row['writeCalls'] == CHUNKS
                  and row['writtenBytes'] == CHUNK_BYTES * CHUNKS, 'Native writer commit not observed')
    else:
        c.require(row['namespaceRemoved'], 'Known namespace was not removed')


def estimate_comparison(value):
    available = value.get('availableBytes')
    return {'designConcurrentBytes': DESIGN_CONCURRENT_BYTES, 'designUnit': '22 decimal GB',
            'observedEstimatedAvailableBytes': available,
            'estimatedHeadroomBytes': available - DESIGN_CONCURRENT_BYTES if isinstance(available, int) else None,
            'estimateAtLeastDesign': available >= DESIGN_CONCURRENT_BYTES if isinstance(available, int) else None,
            'usedAsAcceptanceGate': False,
            'interpretation': 'Privacy-rounded estimate only; no reservation, enforced ceiling, or 22 GB write claim.'}


def profile_snapshot(path):
    logical = allocated = files = symlinks = raced = 0
    for current, dirs, names in os.walk(path, followlinks=False):
        for name in list(dirs):
            if (Path(current) / name).is_symlink():
                dirs.remove(name); symlinks += 1
        for name in names:
            try:
                info = (Path(current) / name).lstat()
            except FileNotFoundError:
                raced += 1; continue
            if stat.S_ISREG(info.st_mode):
                files += 1; logical += info.st_size; allocated += info.st_blocks * 512
            elif stat.S_ISLNK(info.st_mode):
                symlinks += 1
    disk = shutil.disk_usage(path)
    return {'logicalFileBytes': logical, 'allocatedFileBytes': allocated, 'regularFiles': files,
            'symlinksNotFollowed': symlinks, 'entriesDisappearedDuringSnapshot': raced,
            'filesystemTotalBytes': disk.total, 'filesystemFreeBytes': disk.free,
            'scope': 'Owned profile files only; non-atomic snapshot, no directory block accounting or browser-memory claim.'}


def create_owned_profile(parent):
    container = Path(tempfile.mkdtemp(prefix='vr180-persistent-owned-', dir=parent))
    path = container / 'profile'; path.mkdir()
    info = path.stat(); owner = {'schema': 1, 'token': uuid.uuid4().hex, 'profile': str(path),
                               'device': info.st_dev, 'inode': info.st_ino}
    (container / 'owner.json').write_text(json.dumps(owner))
    return {'container': container, 'path': path, 'owner': owner, 'browserClosed': True, 'unknownContent': False}


def cleanup_owned_profile(owned):
    c.require(owned['browserClosed'], 'Browser closure unverified; own profile retained')
    c.require(not owned['unknownContent'], 'Unknown namespace content observed; own profile retained')
    container, path, owner = owned['container'], owned['path'], owned['owner']
    c.require(not container.is_symlink() and not path.is_symlink(), 'Owned profile identity changed')
    c.require(path.parent == container and path.name == 'profile' and set(p.name for p in container.iterdir()) == {'profile', 'owner.json'},
              'Unknown profile-container entry; nothing removed')
    c.require(json.loads((container / 'owner.json').read_text()) == owner, 'Profile owner record differs')
    info = path.stat()
    c.require((info.st_dev, info.st_ino) == (owner['device'], owner['inode']), 'Owned profile directory replaced')
    # This entire fresh profile belongs to this probe. rmtree does not follow
    # Chrome-created symlinks; no existing/personal profile is ever accepted.
    shutil.rmtree(path); (container / 'owner.json').unlink(); container.rmdir()
    return {'status': 'REMOVED', 'path': str(path), 'browserClosedBeforeRemoval': True,
            'scope': 'Only the freshly created, identity-checked disposable profile and owner marker.'}


def server_for():
    content = {'/': (HTML, 'text/html'), '/probe-worker.mjs': (WORKER.encode(), 'text/javascript')}
    for name in SOURCES:
        path = c.ROOT / name
        c.require(not path.is_symlink(), 'Symlink source refused')
        content['/' + name] = (path.read_bytes(), 'text/javascript')

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            item = content.get(self.path)
            if item is None:
                self.send_error(404); return
            body, mime = item
            self.send_response(200); self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, content


def run_session(playwright, owned, origin, namespace, action, expected, out, report):
    row = {'action': action, 'status': 'STARTED', 'browserClosed': False, 'pageErrors': [], 'workers': [],
           'profileBeforeLaunch': profile_snapshot(owned['path'])}
    report['sessions'].append(row); context = None; owned['browserClosed'] = False
    started = time.monotonic()
    try:
        context = playwright.chromium.launch_persistent_context(user_data_dir=str(owned['path']),
            executable_path=str(c.CHROME), headless=True, chromium_sandbox=True, timeout=30000)
        row['launchMs'] = (time.monotonic() - started) * 1000
        browser = context.browser; c.require(browser is not None, 'Persistent browser handle unavailable')
        row['browserVersion'] = browser.version
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page(); page.set_default_timeout(20000)
        page.on('pageerror', lambda error: row['pageErrors'].append(str(error)))
        page.on('worker', lambda worker: row['workers'].append(worker.url))
        page.goto(origin + '/', wait_until='networkidle')
        page.evaluate(PAGE, {'action': action, 'namespace': namespace})
        page.wait_for_function('globalThis.__storageProbe.result!==null', timeout=60000)
        observed = page.evaluate('globalThis.__storageProbe.result'); row['observation'] = observed
        # Refusal to adopt any existing namespace/nonempty witness must survive
        # normal browser close: deleting the whole profile would bypass it.
        native_error = observed.get('error', {})
        if native_error.get('message') in {'NAMESPACE_EXISTS', 'WITNESS_NOT_EMPTY', 'UNKNOWN_NAMESPACE_ENTRY'} \
                or native_error.get('name') == 'TypeMismatchError':
            owned['unknownContent'] = True
        c.write(out / (action + '.json'), observed)
        row['profileAfterAction'] = profile_snapshot(owned['path'])
        for key in ['before', 'afterRead', 'afterCleanup']:
            if key in observed:
                row.setdefault('estimateComparisons', {})[key] = estimate_comparison(observed[key])
        if observed['status'] == 'BLOCKED':
            raise c.Blocked(str(observed.get('error')))
        validate_observation(observed, action, namespace, expected)
        c.require(observed['capabilities']['origin'] == origin, 'Worker origin differs')
        c.require(not row['pageErrors'] and row['workers'] == [origin + '/probe-worker.mjs'], 'Unexpected page/Worker activity')
        row['status'] = 'PASS'
    except Exception as error:
        row['status'] = 'BLOCKED' if isinstance(error, (c.Blocked, c.Deadline)) else 'FAIL'
        row['error'] = f'{type(error).__name__}: {error}'; raise
    finally:
        if context is not None:
            close_started = time.monotonic()
            try:
                browser = context.browser; context.close()
                c.require(browser is not None and not browser.is_connected(), 'Browser connection remains after close')
                owned['browserClosed'] = row['browserClosed'] = True
                row['normalCloseMs'] = (time.monotonic() - close_started) * 1000
                row['profileAfterNormalClose'] = profile_snapshot(owned['path'])
            except Exception as error:
                row['closeError'] = f'{type(error).__name__}: {error}'; row['status'] = 'FAIL'
                raise
        row['elapsedMs'] = (time.monotonic() - started) * 1000


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); out = args.output.resolve()
    c.require(not out.exists() and not out.is_relative_to(c.ROOT), 'Use new output directory outside checkout')
    out.mkdir(parents=True); started = time.monotonic(); server = None; owned = None
    report = {'schema': 'vr180-persistent-storage-probe-v1', 'status': 'BLOCKED',
              'runId': os.environ.get('GITHUB_RUN_ID', 'local') + '-persistent-storage-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
              'prototypeOnly': True, 'publicFilesWritten': False, 'sessions': [], 'profileCleanup': {'status': 'NOT_CREATED'},
              'profileMode': 'New owned persistent user_data_dir; normal sandboxed Chrome, one close/relaunch',
              'scope': '16 MiB deterministic non-media payload, 16 awaited 1 MiB writes; full-byte/hash verification before and after restart',
              'notVerified': ['5/10 GB media', '22 GB simultaneous storage', 'capacity reservation', 'power-loss/crash durability',
                              'long-term retention or storage-persistence permission', 'OS picker', 'public-origin storage', 'public deployment'],
              'references': ['https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context',
                'https://groups.google.com/a/chromium.org/g/blink-dev/c/7q0YGQNVkjs/m/BJH9kfmIEgAJ']}

    def deadline(*_):
        raise c.Deadline('Persistent-profile probe 240-second deadline')

    signal.signal(signal.SIGALRM, deadline); signal.signal(signal.SIGTERM, deadline); signal.alarm(240)
    try:
        c.require(os.environ.get('GITHUB_REPOSITORY') == 'Kushyameln01/kushyameln-works', 'Repository differs')
        source = c.source_check(out, candidate=True); report['checkoutCommit'] = source['checkoutCommit']
        c.preflight(out, defer_verification=True)
        c.command(['git', 'ls-files', '--error-unmatch', *SOURCES, str(Path(__file__).relative_to(c.ROOT))])
        report['harnessSHA256'] = c.digest(Path(__file__)); report['sharedHarnessSHA256'] = c.digest(Path(c.__file__))
        expected = expected_witness(); c.write(out / 'independent-python-oracle.json', expected)
        server, content = server_for(); origin = f'http://127.0.0.1:{server.server_port}'; report['origin'] = origin
        inventory = []
        for route, (expected_bytes, _) in content.items():
            with urllib.request.urlopen(origin + route, timeout=5) as response:
                served = response.read(len(expected_bytes) + 1)
            c.require(served == expected_bytes, 'Served source differs')
            inventory.append({'route': route, 'bytes': len(served), 'sha256': hashlib.sha256(served).hexdigest()})
        c.write(out / 'private-source-inventory.json', {'checkoutCommit': source['checkoutCommit'], 'files': inventory, 'exactRoutesOnly': True})
        owned = create_owned_profile(out.parent); report['ownedProfile'] = {**owned['owner'], 'container': str(owned['container'])}
        namespace = 'vr180-persist-' + uuid.uuid4().hex; report['namespace'] = namespace
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            for action in ['write', 'restart-read-and-cleanup']:
                run_session(playwright, owned, origin, namespace, action, expected, out, report)
        report['independentCompleteHashComparison'] = {'status': 'PASS', 'bytesPerRead': expected['bytes'],
            'completedFullReads': 2, 'sha256': expected['sha256'], 'method': 'Both complete native reads match the independent Python-generated byte/hash oracle; payload is not transported as media.'}
        report['status'] = 'PASS'
    except Exception as error:
        report.update(status='BLOCKED' if isinstance(error, (c.Blocked, c.Deadline)) else 'FAIL', error=f'{type(error).__name__}: {error}')
        (out / 'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if server:
            server.shutdown(); server.server_close()
        if owned is not None:
            try:
                report['profileCleanup'] = cleanup_owned_profile(owned)
            except Exception as error:
                report['profileCleanup'] = {'status': 'RETAINED', 'error': str(error), 'path': str(owned['path'])}
                report['status'] = 'BLOCKED'
        report['elapsedSeconds'] = time.monotonic() - started; c.write(out / 'run.json', report)
        transported = c.emit_evidence(out, report)
    return 0 if transported and report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
