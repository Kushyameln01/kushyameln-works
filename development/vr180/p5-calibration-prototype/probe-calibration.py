#!/usr/bin/env python3
"""Reconstructed private ten-second calibration; actual media travels by artifact."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, selectors, shutil, signal, subprocess, sys, threading, time, traceback, urllib.request
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
base = load('p5_output_probe', ROOT/'tools/vr180/probe-output-index.py')
indexed = load('p5_indexed_probe', ROOT/'tools/vr180/probe-indexed-conversion.py')
cloud = base.cloud
WORKER_ROUTE = '/development/vr180/p5-calibration-prototype/worker.mjs'
MAX_PAIR = 120 * 1024**2
PAGE = r"""async(caseName)=>{
 const s=globalThis.__calibration={namespace:'v-'+crypto.randomUUID(),namespaceOwned:false,worker:null,urls:[],unhandledErrors:[]};
 const w=s.worker=new Worker('/development/vr180/p5-calibration-prototype/worker.mjs',{type:'module'});
 const result=await new Promise((resolve,reject)=>{w.onmessage=({data})=>{
  if(data.namespaceOwned)s.namespaceOwned=true;
  if(data.unhandledError&&s.unhandledErrors.length<8)s.unhandledErrors.push(data.unhandledError);
  if(data.result)resolve(data.result);
 };w.onerror=e=>reject(Error(e.message));w.postMessage({namespace:s.namespace,caseName});});
 await new Promise(r=>setTimeout(r,0));result.unhandledErrors=s.unhandledErrors;
 const files=result.files??[];result.files=files.map(({name,bytes,sha256})=>({name,bytes,sha256}));
 s.urls=files.map(({file})=>URL.createObjectURL(file));if(s.unhandledErrors.length)result.status='FAIL';return result;
}"""
CLEANUP = r"""async()=>{
 const s=globalThis.__calibration;if(!s)return {status:'NOT_CREATED'};
 s.worker?.terminate();for(const url of s.urls)URL.revokeObjectURL(url);
 if(!s.namespaceOwned)return {status:'NOT_OWNED',removed:false};
 const locks=(await navigator.locks.query()).held.filter(l=>l.name.includes(s.namespace));
 if(locks.length)return {status:'NOT VERIFIED',heldLocks:locks.length};
 const root=await navigator.storage.getDirectory();await root.removeEntry(s.namespace,{recursive:true});
 try{await root.getDirectoryHandle(s.namespace);throw Error('NAMESPACE_REMAINS');}catch(e){if(e.name!=='NotFoundError')throw e;}
 return {status:'REMOVED',heldLocks:0};
}"""

def bounded_version(binary, timeout=10, limit=32768):
    proc = subprocess.Popen([str(binary), '-version'], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    selector = selectors.DefaultSelector(); output = {proc.stdout: bytearray(), proc.stderr: bytearray()}
    for stream in output: selector.register(stream, selectors.EVENT_READ)
    deadline = time.monotonic() + timeout; total = 0
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0: raise TimeoutError('Tool version deadline')
            for key, _ in selector.select(remaining):
                chunk = os.read(key.fileobj.fileno(), min(4096, limit - total + 1))
                if not chunk: selector.unregister(key.fileobj); continue
                total += len(chunk); cloud.require(total <= limit, 'Tool version output bound')
                output[key.fileobj].extend(chunk)
        cloud.require(proc.wait(timeout=max(.01, deadline - time.monotonic())) == 0, 'Tool version command failed')
        return bytes(output[proc.stdout]).decode('utf-8', 'strict')
    finally:
        selector.close()
        if proc.poll() is None: proc.kill()
        proc.wait(); proc.stdout.close(); proc.stderr.close()

def require_toolchain(path, evidence_path=None):
    if not path.is_file(): raise cloud.Blocked('Fixed FFmpeg toolchain manifest is required before calibration')
    with path.open('rb') as stream: manifest_bytes = stream.read(65537)
    cloud.require(len(manifest_bytes) <= 65536, 'Toolchain manifest bound')
    proof = json.loads(manifest_bytes); cloud.require(proof.get('schema') == 'vr180-ffmpeg-toolchain-v1', 'Toolchain schema differs')
    cloud.require(proof.get('source') and proof.get('packageVersion'), 'Toolchain distribution/package provenance missing')
    result = {'manifestSHA256': hashlib.sha256(manifest_bytes).hexdigest(), 'source': proof['source'], 'packageVersion': proof['packageVersion'], 'tools': {}}
    parents = set()
    for name in ('ffmpeg', 'ffprobe'):
        entry = proof['files'][name]; binary = Path(entry['path']).resolve()
        cloud.require(binary.is_file() and cloud.digest(binary) == entry['sha256'], name + ' binary differs')
        parents.add(binary.parent); text = bounded_version(binary)
        cloud.require(text.startswith(name + ' version ') and entry['versionFirstLine'] == text.splitlines()[0], 'Tool version differs')
        result['tools'][name] = {'path': str(binary), 'sha256': entry['sha256'], 'version': text}
    cloud.require(len(parents) == 1, 'Both fixed oracle binaries must share one directory')
    os.environ['PATH'] = str(parents.pop()) + os.pathsep + os.environ.get('PATH', '')
    for name, checked in result['tools'].items():
        found = shutil.which(name)
        cloud.require(found and Path(found).resolve() == Path(checked['path']), 'Oracle PATH binary differs: '+name)
        checked['oraclePath'] = str(Path(found).resolve())
    if evidence_path is not None: evidence_path.write_bytes(manifest_bytes)
    return result

def require_oracle_dependencies():
    try: numpy = importlib.import_module('numpy')
    except ImportError as error: raise cloud.Blocked('NumPy 2.3.3 is required before media generation') from error
    if numpy.__version__ != '2.3.3': raise cloud.Blocked('Cloud calibration requires NumPy 2.3.3; found '+numpy.__version__)
    oracle = load('p5_independent_oracle', ROOT/'tools/vr180/verify-conversion-large.py')
    cloud.require(oracle.np is numpy, 'Oracle uses a different NumPy module')
    return oracle, {'numpyVersion': numpy.__version__, 'numpyPath': str(Path(numpy.__file__).resolve()),
      'pythonVersion': sys.version, 'pythonExecutable': sys.executable, 'oracleImportedBeforeMedia': True,
      'oracleSHA256': cloud.digest(Path(oracle.__file__))}

def aggregate_packets(records, time_base, *, max_packets=300):
    """Scalar aggregation through EOF, with no packet/timestamp array."""
    base = Fraction(time_base); cloud.require(base > 0, 'Invalid packet time base')
    count = total = maximum = 0; start = end = None
    for packet in records:
        count += 1; cloud.require(count <= max_packets, 'Calibration packet count exceeds bound')
        size = int(packet['size']); pts = int(packet['pts']) * base; duration = int(packet['duration']) * base
        cloud.require(0 < size <= 80*1024**2 and duration > 0, 'Invalid packet size/duration')
        total += size; cloud.require(total <= 80*1024**2, 'Calibration packet payload bound')
        maximum = max(maximum, size); start = pts if start is None else min(start, pts)
        end = pts+duration if end is None else max(end, pts+duration)
    cloud.require(count > 0 and end > start, 'No packet timeline')
    duration = end - start
    return {'packets': count, 'payloadBytes': total, 'maxPacketBytes': maximum, 'timeBase': str(base),
      'firstPtsRational': str(start), 'endPtsRational': str(end), 'timelineSecondsRational': str(duration),
      'timelineSeconds': float(duration), 'actualPayloadBitsPerSecond': float(8*total/duration)}

def packet_statistics(oracle, path, log_dir):
    runtime = oracle.Runtime(log_dir, 30); scans = {}
    try:
        label = 'stream-profile'
        proc = runtime.start(label, ['ffprobe', '-v', 'error', '-show_streams', '-show_entries',
          'stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,time_base', '-of', 'json', str(path)])
        raw = oracle.read_chunk(proc.stdout, 4097, runtime); cloud.require(len(raw) <= 4096, 'Calibration stream metadata bound')
        runtime.finish(proc, label); streams = json.loads(raw)['streams']
        cloud.require(len(streams) == 1 and streams[0]['codec_type'] == 'video' and streams[0]['codec_name'] == 'h264', 'Expected one silent H.264 stream')
        stream = streams[0]
        cloud.require(isinstance(stream.get('profile'), str) and len(stream['profile']) <= 128
          and type(stream.get('level')) is int, 'Actual H.264 profile/level unavailable')
        summary = aggregate_packets(oracle.probe_records(path, 'video-packets', 'packet', runtime, scans, 'v:0'), stream['time_base'])
        cloud.require(scans['video-packets']['endReached'], 'Calibration packet scan incomplete')
        return {**summary, 'actualStream': stream, 'completeScan': True, 'scans': scans, 'stderrLogs': runtime.logs}
    finally: runtime.close()

def calibration_verdict(verified, packet_stats):
    return 'PASS' if (verified.get('status') == 'PASS' and verified.get('completeScan')
      and verified.get('frames') == 300 and verified.get('events', {}).get('inputCountByEye') == [3, 3]
      and verified.get('events', {}).get('allFrameFlagsEqual') is True
      and verified.get('redFrameIndicesByEye') == [[29, 30, 31], [29, 30, 31]]
      and all(packet_stats.get(side, {}).get('packets') == 300 for side in ('input', 'output'))) else 'FAIL'

def media_entries(observed):
    entries = observed.get('files', [])
    cloud.require(isinstance(entries, list) and len(entries) <= 2, 'Media file count')
    names = set(); total = 0
    for entry in entries:
        name = entry.get('name'); size = entry.get('bytes'); sha = entry.get('sha256')
        cloud.require(name in ('input.mp4', 'output.mp4') and name not in names, 'Unexpected or duplicate media name')
        cloud.require(type(size) is int and 0 < size <= 80 * 1024**2, 'Media file bound')
        cloud.require(isinstance(sha, str) and len(sha) == 64 and all(c in '0123456789abcdef' for c in sha), 'Media hash format')
        names.add(name); total += size
    cloud.require(total <= MAX_PAIR, 'Media pair bound'); return entries

def descendant_chrome_rss(rows, root_pid):
    """rows: pid -> (ppid, comm, rss bytes); other job processes never count."""
    total = count = 0
    for pid, (parent, comm, rss) in rows.items():
        if comm not in ('chrome', 'chromium', 'Chromium', 'chrome_crashpad', 'chrome_crashpad_'): continue
        seen = {pid}; ancestor = parent
        while ancestor != root_pid and ancestor in rows and ancestor not in seen and len(seen) < 64:
            seen.add(ancestor); ancestor = rows[ancestor][0]
        if ancestor == root_pid: total += rss; count += 1
    return total, count

class ChromeRssSampler:
    """Supplementary Linux RSS samples only while this trial's browser exists."""
    def __init__(self):
        self.stop_event = threading.Event(); self.thread = None
        self.report = {'status': 'NOT_MEASURED', 'intervalMs': 200, 'samples': 0, 'samplesWithChrome': 0,
          'maxSummedRssBytes': 0, 'maxProcessCount': 0, 'failures': 0, 'processReadFailures': 0,
          'rootPid': os.getpid(), 'retainedSampleArray': False, 'sharedPagesMayBeCountedMultipleTimes': True,
          'truePeakMeasured': False, 'gpuMemoryBytes': None, 'nativeMemoryBreakdown': None,
          'includesOnlyChromeDescendantsOfThisPython': True, 'processInventoryBound': 8192}
    def start(self):
        if not Path('/proc/self/stat').is_file(): self.report['reason'] = 'Linux procfs unavailable'; return
        def loop():
            while not self.stop_event.is_set():
                try:
                    rows = {}; page = os.sysconf('SC_PAGE_SIZE')
                    for path in Path('/proc').iterdir():
                        if not path.name.isdecimal(): continue
                        cloud.require(len(rows) < 8192, 'Process inventory bound')
                        try:
                            with (path/'stat').open('rb') as stream: raw = stream.read(4097)
                            cloud.require(len(raw) <= 4096, 'Process stat bound')
                            left, right = raw.find(b'('), raw.rfind(b')'); fields = raw[right+2:].split()
                            cloud.require(left >= 0 and right > left and len(fields) > 21, 'Process stat malformed')
                            rss = int(fields[21]); cloud.require(rss >= 0, 'Negative process RSS')
                            rows[int(path.name)] = (int(fields[1]), raw[left+1:right].decode('utf-8', 'replace'), rss*page)
                        except (OSError, ValueError): self.report['processReadFailures'] += 1
                    total, count = descendant_chrome_rss(rows, self.report['rootPid']); self.report['samples'] += 1
                    self.report['samplesWithChrome'] += int(count > 0)
                    self.report['maxSummedRssBytes'] = max(self.report['maxSummedRssBytes'], total)
                    self.report['maxProcessCount'] = max(self.report['maxProcessCount'], count)
                except Exception as error:
                    self.report['failures'] += 1; self.report.setdefault('firstError', str(error)[:256])
                self.stop_event.wait(.2)
        self.thread = threading.Thread(target=loop, daemon=True); self.thread.start()
    def stop(self):
        self.stop_event.set()
        if self.thread: self.thread.join(timeout=2)
        self.report['samplerThreadStopped'] = not self.thread or not self.thread.is_alive()
        if self.report['samplesWithChrome'] and self.report['samplerThreadStopped']: self.report['status'] = 'SAMPLED'
        else: self.report.setdefault('reason', 'No complete Chrome descendant sample or sampler did not stop')
        return self.report

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True); parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--case', choices=['32-32', '48-24'], required=True)
    parser.add_argument('--oracle-toolchain', type=Path, required=True)
    args = parser.parse_args(argv); out = args.output.resolve(); bundle = args.bundle.resolve()
    cloud.require(not out.exists() and not out.is_relative_to(ROOT), 'Use new output directory outside checkout')
    out.mkdir(parents=True); meta = out/'evidence'; media = out/'media'; meta.mkdir(); media.mkdir()
    started = time.monotonic(); server = None; sampler = None
    report = {'schema': 'vr180-p5-ten-second-calibration-v1', 'reconstructedAfterWorkspaceLoss': True,
      'runId': os.environ.get('GITHUB_RUN_ID', 'local')+'-p5-'+args.case+'-'+os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
      'status': 'BLOCKED', 'case': args.case, 'prototypeOnly': True, 'seconds': 10, 'frames': 300, 'fps': 30,
      'silent': True, 'publicProfileChanged': False, 'maxPairBytes': MAX_PAIR,
      'pageErrors': [], 'workers': [], 'cleanup': {'status': 'NOT_RUN'}, 'completeCloudMedia': False,
      'independentVerification': 'NOT_RUN', 'hostArtifactRecovery': 'PENDING', 'browserRss': {'status': 'NOT_MEASURED', 'reason': 'Browser not started'},
      'calibrationVerdict': 'NOT_VERIFIED', 'mediaArtifactReady': False,
      'notVerified': ['5/10 GB', 'large AAC media', '60 fps', 'whole-browser memory', 'OS picker', 'VR player', 'public deployment']}
    def deadline(*_): raise cloud.Deadline('P5 short calibration deadline')
    signal.signal(signal.SIGALRM, deadline); signal.signal(signal.SIGTERM, deadline); signal.alarm(600)
    try:
        report['oracleToolchain'] = require_toolchain(args.oracle_toolchain, meta/'oracle-toolchain.json')
        oracle, report['oracleDependencies'] = require_oracle_dependencies()
        report['diskPreflight'] = {'freeBytes': shutil.disk_usage(out).free, 'requiredAdditionalBytes': 2*1024**3, 'reservationGuaranteed': False}
        cloud.require(report['diskPreflight']['freeBytes'] >= 2*1024**3, 'Calibration disk preflight')
        cloud.require(os.environ.get('GITHUB_REPOSITORY') == 'Kushyameln01/kushyameln-works', 'Repository differs')
        source = cloud.source_check(meta, candidate=True); report['checkoutCommit'] = source['checkoutCommit']; cloud.preflight(meta, defer_verification=True)
        cloud.require(bundle.is_file() and not bundle.is_symlink() and not bundle.is_relative_to(ROOT), 'Use fixed combined fork outside checkout')
        build = json.loads((bundle.parent/'fork-build-result.json').read_text())
        cloud.require(build['status'] == 'PASS' and build['baseline']['status'] == 'PASS' and build['baseline']['comparison']['identical'], 'Rebuild gate failed')
        cloud.require(build['variant'] == 'combined-input-output' and build['bundleSha256'] == cloud.digest(bundle), 'Combined fork differs')
        cloud.require(any('src/media-source.ts' in patch['files'] for patch in build['patches']), 'Awaited close patch is required')
        cloud.require(build['controllerSha256'] == cloud.digest(ROOT/'development/vr180/input-index-prototype/input-index.mjs'), 'Input controller differs')
        cloud.require(build['presentationSha256'] == cloud.digest(ROOT/'development/vr180/input-index-prototype/presentation-index.mjs'), 'Presentation controller differs')
        cloud.require(build['publicInputParserSha256'] == cloud.digest(ROOT/'docs/shared/vr180/mp4.mjs'), 'Public input parser differs')
        for name, expected in build['runtimeFiles'].items(): cloud.require(cloud.digest(ROOT/'development/vr180'/name) == expected, 'Runtime differs: '+name)
        cloud.write(meta/'fork-build-result.json', build)
        paths = sorted(set(indexed.SOURCES + ['development/vr180/index-prototype/job-owner.mjs',
          'development/vr180/p5-calibration-prototype/frame.mjs', 'development/vr180/p5-calibration-prototype/worker.mjs']))
        cloud.command(['git', 'ls-files', '--error-unmatch', *paths, str(Path(__file__).relative_to(ROOT)), 'tools/vr180/verify-conversion-large.py'])
        evidence_sources = sorted(set(paths + [str(Path(__file__).relative_to(ROOT)), 'tools/vr180/probe-output-index.py',
          'tools/vr180/probe-indexed-conversion.py', 'tools/vr180/cloud-validate.py', 'tools/vr180/verify-conversion-large.py', 'tools/vr180/verify-metadata.py']))
        source_hashes = {name: cloud.digest(ROOT/name) for name in evidence_sources}; report['sourceHashesBefore'] = source_hashes
        content = {'/': (base.HTML, 'text/html'), '/fork.mjs': (bundle.read_bytes(), 'text/javascript')}
        for name in paths: content['/'+name] = ((ROOT/name).read_bytes(), 'text/javascript')
        server = base.start_server(content); origin = f'http://127.0.0.1:{server.server_port}'; inventory = []
        for route, (body, _) in content.items():
            with urllib.request.urlopen(origin+route, timeout=5) as response: served = response.read(len(body)+1)
            cloud.require(served == body, 'Loopback source mismatch'); inventory.append({'route': route, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
        cloud.write(meta/'private-source-inventory.json', {'checkoutCommit': source['checkoutCommit'], 'files': inventory})
        report['harnessSHA256'] = cloud.digest(Path(__file__)); report['sharedHarnessSHA256'] = cloud.digest(Path(cloud.__file__))
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=str(cloud.CHROME), headless=True, chromium_sandbox=True, timeout=30000)
            report['browserVersion'] = browser.version; sampler = ChromeRssSampler(); sampler.start()
            try:
                context = browser.new_context(accept_downloads=True)
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
                page = context.new_page(); page.on('pageerror', lambda e: report['pageErrors'].append(str(e))); page.on('worker', lambda w: report['workers'].append(w.url))
                try:
                    page.goto(origin+'/', wait_until='networkidle')
                    page.evaluate('c=>{globalThis.__result=null;('+PAGE+')(c).then(r=>globalThis.__result=r,e=>globalThis.__result={status:"FAIL",files:[],error:String(e)});}', args.case)
                    page.wait_for_function('globalThis.__result!==null', timeout=360000); observed = page.evaluate('globalThis.__result')
                    cloud.write(meta/'browser-observations.json', observed)
                    cloud.require(report['workers'] == [origin+WORKER_ROUTE], 'Dedicated Worker mismatch')
                    entries = media_entries(observed)
                    for index, entry in enumerate(entries):
                        name = entry['name']
                        with page.expect_download(timeout=30000) as download:
                            page.evaluate('([i,n])=>{const a=document.createElement("a");a.href=globalThis.__calibration.urls[i];a.download=n;a.click();}', [index, name])
                        saved = media/name; download.value.save_as(str(saved)); download.value.delete()
                        cloud.require(saved.stat().st_size == entry['bytes'] and cloud.digest(saved) == entry['sha256'], 'Full cloud download hash differs')
                    cloud.require(observed['status'] == 'READY_FOR_DOWNLOAD' and len(entries) == 2, 'Native calibration failed: '+str(observed.get('error')))
                    cloud.require(not report['pageErrors'], 'Unexpected page error'); report['completeCloudMedia'] = True
                    report['browserMetrics'] = {'generation': observed['generation'], 'conversion': observed['conversion']}
                finally:
                    try: report['cleanup'] = page.evaluate(CLEANUP)
                    except Exception as e: report['cleanup'] = {'status': 'NOT VERIFIED', 'error': str(e)}
                    context.close()
            finally:
                try: browser.close()
                finally: report['browserRss'] = sampler.stop()
        cloud.require(report['cleanup']['status'] == 'REMOVED', 'Native owned namespace cleanup incomplete')
        verified = oracle.verify_files(media/'input.mp4', media/'output.mp4', layout='sbs', fov=180, eye_size=512,
          mode='convert', timeout=180, log_dir=meta/'oracle-logs')
        cloud.write(meta/'independent-verification.json', verified); report['independentVerification'] = verified['status']
        cloud.require(verified['completeScan'], 'Independent full-media verification incomplete')
        report['packetStatistics'] = {side: packet_statistics(oracle, media/(side+'.mp4'), meta/(side+'-packet-stats')) for side in ('input', 'output')}
        cloud.write(meta/'packet-statistics.json', report['packetStatistics'])
        report['calibrationVerdict'] = calibration_verdict(verified, report['packetStatistics'])
        files = [{'name': name, 'bytes': (media/name).stat().st_size, 'sha256': cloud.digest(media/name)} for name in ('input.mp4', 'output.mp4')]
        cloud.require(sum(e['bytes'] for e in files) <= MAX_PAIR, 'Artifact pair exceeds cap')
        manifest = {'schema': 'vr180-calibration-media-artifact-v1', 'runId': report['runId'], 'checkoutCommit': report['checkoutCommit'],
          'case': args.case, 'files': files, 'independentVerification': verified['status'], 'completeScan': True,
          'calibrationVerdict': report['calibrationVerdict'], 'verifierSHA256': verified['verifierSHA256'],
          'hostRecovery': 'PENDING', 'retentionDays': 1, 'compressionLevel': 0}
        report['sourceHashesAfter'] = {name: cloud.digest(ROOT/name) for name in evidence_sources}
        cloud.require(report['sourceHashesAfter'] == source_hashes and cloud.digest(bundle) == build['bundleSha256'], 'Sources changed during calibration')
        cloud.write(media/'media-manifest.json', manifest); report['mediaManifest'] = manifest; report['mediaArtifactReady'] = True
        report['status'] = 'READY_FOR_ARTIFACT_RECOVERY'
    except Exception as e:
        report.update(status='BLOCKED' if isinstance(e, (cloud.Blocked, cloud.Deadline)) else 'FAIL', error=f'{type(e).__name__}: {e}')
        (meta/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0)
        if sampler: report['browserRss'] = sampler.stop()
        if server: server.shutdown(); server.server_close()
        report['elapsedSeconds'] = time.monotonic()-started; cloud.write(meta/'run.json', report)
        transported = cloud.emit_evidence(meta, report)  # Intentionally excludes sibling media/.
    return 0 if transported and report['status'] == 'READY_FOR_ARTIFACT_RECOVERY' else 1

if __name__ == '__main__': raise SystemExit(main())
