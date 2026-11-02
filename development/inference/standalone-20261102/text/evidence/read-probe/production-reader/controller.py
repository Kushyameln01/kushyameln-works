#!/usr/bin/env python3
"""Private sequential NN0 input-storage comparison; owns and signals only Popen child."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,time

ROOT=Path(__file__).resolve().parent
BUNDLE=Path('/workspace/work/inference/text-implementation/bundle')
SCRIPT=ROOT/'read_probe.mjs'
CG=Path('/sys/fs/cgroup')
WORKING_LIMIT=16_000_000_000
OWN_RSS_LIMIT=1_720_000_000

def cgroup():
    values=dict(line.split() for line in (CG/'memory.stat').read_text().splitlines())
    current=int((CG/'memory.current').read_text())
    inactive=int(values.get('inactive_file',0))
    return {'memoryCurrent':current,'inactiveFile':inactive,'workingSetMaxZero':max(0,current-inactive)}

def own_process(pid):
    try:
        s=dict(line.split(':',1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
        return {k:int(s[k].split()[0])*1024 for k in ('VmRSS','VmHWM') if k in s}
    except FileNotFoundError:
        return {}

receipt={'schemaVersion':1,'nnExecutions':0,'scope':'One prepared Text block00 input only; no ORT, model execution, export, or production source edits','guard':{'workingSetDefinition':'max(0,memory.current-memory.stat.inactive_file)','sharedWorkingSetLimitBytes':WORKING_LIMIT,'ownRssLimitBytes':OWN_RSS_LIMIT,'signals':'Only current Popen-owned sequential Node child; no VAE or other process signals','sampleSeconds':0.02},'cachePolicy':'No cache drop/fadvise; one production-reader run; times reflect cache/order and concurrent VAE activity','sources':[],'runs':[]}
for source in (SCRIPT,Path(__file__).resolve(),Path('/workspace/work/inference/p0-p2-20261031/worktree/tools/inference/text-encoder/node_sdk_host.mjs')):
    raw=source.read_bytes();receipt['sources'].append({'path':str(source),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
for mode in ('production',):
    before=cgroup()
    if before['workingSetMaxZero']>WORKING_LIMIT:
        receipt['notStarted']={'mode':mode,'reason':'shared working set already above limit','cgroup':before};break
    argv=[shutil.which('node'),str(SCRIPT),mode,str(BUNDLE)]
    out=ROOT/f'{mode}.stdout.jsonl';err=ROOT/f'{mode}.stderr.txt'
    run={'mode':mode,'argv':argv,'stdout':str(out),'stderr':str(err),'before':before,'peakObservedSharedWorkingSetBytes':before['workingSetMaxZero'],'peakObservedOwnRssBytes':0,'samples':[]}
    start=time.monotonic()
    with out.open('w') as stdout,err.open('w') as stderr:
        child=subprocess.Popen(argv,stdout=stdout,stderr=stderr)
        run['ownedPid']=child.pid
        run['ownedProcStartTicks']=Path(f'/proc/{child.pid}/stat').read_text().rsplit(')',1)[1].split()[19]
        while child.poll() is None:
            cg=cgroup();own=own_process(child.pid)
            sample={'elapsedSeconds':time.monotonic()-start,'cgroup':cg,'own':own};run['samples'].append(sample)
            run['peakObservedSharedWorkingSetBytes']=max(run['peakObservedSharedWorkingSetBytes'],cg['workingSetMaxZero'])
            run['peakObservedOwnRssBytes']=max(run['peakObservedOwnRssBytes'],own.get('VmRSS',0))
            if cg['workingSetMaxZero']>WORKING_LIMIT or own.get('VmRSS',0)>OWN_RSS_LIMIT:
                run['guardStop']={'reason':'shared working set or own RSS above limit','sample':sample}
                # Popen has not reaped this child and poll still says running: no unrelated PID target.
                if child.poll() is None: child.terminate()
                try: child.wait(timeout=3)
                except subprocess.TimeoutExpired: child.kill();child.wait(timeout=3)
                break
            time.sleep(0.02)
        run['exitCode']=child.wait()
    run['elapsedSeconds']=time.monotonic()-start;run['after']=cgroup()
    events=[json.loads(line) for line in out.read_text().splitlines() if line]
    results=[x['report'] for x in events if x.get('event')=='result']
    run['result']=results[0] if len(results)==1 else None
    run['stderrText']=err.read_text()
    receipt['runs'].append(run)
    (ROOT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'mode':mode,'exitCode':run['exitCode'],'elapsedSeconds':run['elapsedSeconds'],'peakObservedOwnRssBytes':run['peakObservedOwnRssBytes'],'peakObservedSharedWorkingSetBytes':run['peakObservedSharedWorkingSetBytes'],'result':run['result'],'guardStop':run.get('guardStop')}),flush=True)
    if run['exitCode'] or run.get('guardStop'): break
receipt['passed']=len(receipt['runs'])==1 and all(r['exitCode']==0 and r['result'] and r['result']['matchesManifest'] for r in receipt['runs'])
(ROOT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'receipt':str(ROOT/'receipt.json'),'passed':receipt['passed']}),flush=True)
