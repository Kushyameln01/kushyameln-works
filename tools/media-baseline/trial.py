#!/usr/bin/env python3
"""Caller-side observations; never invent an AI clock. Local use, no network."""
import argparse,json,time,hashlib,zipfile,socket
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('action',choices=['begin','mark','recover','finish']);p.add_argument('journal',type=Path);p.add_argument('--trial-id');p.add_argument('--event');p.add_argument('--input',type=Path);p.add_argument('--zip',type=Path);p.add_argument('--receipt',type=Path);p.add_argument('--output',type=Path);p.add_argument('--condition',default='unknown');a=p.parse_args()
host=hashlib.sha256(socket.gethostname().encode()).hexdigest()[:16]
def stamp(name):return {'name':name,'monotonicNs':time.monotonic_ns(),'epochNs':time.time_ns()}
def digest(b):return hashlib.sha256(b).hexdigest()
if a.action=='begin':
    if a.journal.exists():raise SystemExit('Journal exists; retain original trial')
    if not a.trial_id:raise SystemExit('--trial-id required')
    j={'schemaVersion':1,'trialId':a.trial_id,'callerHost':host,'clock':'time.monotonic_ns on one host','condition':a.condition,'cacheState':'unknown','events':[stamp('operationStart')],'status':'in-progress'}
else:
    j=json.loads(a.journal.read_text())
    if j['callerHost']!=host:raise SystemExit('Caller clock host mismatch')
if a.action=='mark':
    allowed={'pagePreparationStart','pagePreparationEnd','inputStart','inputTransferred','downloadStart','downloadRecovered','extractionStart','extractionEnd','aiStart','aiReadStart','aiReadEnd','answerReceived'}
    if a.event not in allowed or any(e['name']==a.event for e in j['events']):raise SystemExit('Invalid or duplicate milestone')
    j['events'].append(stamp(a.event))
if a.action=='recover':
    if not all([a.input,a.zip,a.receipt,a.output]):raise SystemExit('--input --zip --receipt --output required')
    if a.output.exists():raise SystemExit('Output exists')
    r=json.loads(a.receipt.read_text());z=a.zip.read_bytes()
    if r['trialId']!=j['trialId'] or r['status']!='ready' or digest(z)!=r['zip']['sha256'] or len(z)!=r['zip']['bytes']:raise SystemExit('Receipt/ZIP identity mismatch')
    if digest(a.input.read_bytes())!=r['input']['sha256']:raise SystemExit('Input SHA mismatch')
    j['events'].append(stamp('extractionStart'))
    with zipfile.ZipFile(a.zip) as f:
        if len(f.namelist())>101 or sum(x.file_size for x in f.infolist())>8388608:raise SystemExit('Unpacked limit')
        if len(f.namelist())!=len(set(f.namelist())) or f.testzip():raise SystemExit('ZIP integrity failure')
        m=json.loads(f.read('manifest.json'))
        if any(m[k]!=r[k] for k in ['trialId','operationId','inputRevision']) or m['input']['sha256']!=r['input']['sha256'] or m['preprocessing'] is not False:raise SystemExit('Manifest identity mismatch')
        expected={'manifest.json'};last=-1
        for i,fr in enumerate(m['frames']):
            name=f'frames/{i:06d}.png';expected.add(name)
            if fr['jobId']!=f"{r['operationId']}:{i}" or fr['path']!=name or fr['sequence']!=i or fr['inputRevision']!=r['inputRevision'] or fr['sourceSha256']!=r['input']['sha256']:raise SystemExit('Frame identity mismatch')
            b=f.read(name)
            if digest(b)!=fr['sha256'] or len(b)!=fr['bytes']:raise SystemExit('Frame hash mismatch')
            if fr['timestamp'] is not None:
                if fr['timestamp']<last:raise SystemExit('Timeline order')
                last=fr['timestamp']
        if r['childJobs']!=[{k:fr[k] for k in ['jobId','inputRevision','sourceSha256','sequence','sha256']} for fr in m['frames']]:raise SystemExit('Receipt child jobs mismatch')
        if set(f.namelist())!=expected or len(m['frames'])!=r['frameCount']:raise SystemExit('Artifact set mismatch')
        a.output.mkdir(parents=True)
        for name in expected:
            target=a.output/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(f.read(name))
    j['events'].append(stamp('extractionEnd'));j['browserReceipt']=r;j['recovered']={'zipSha256':digest(z),'inputSha256':r['input']['sha256'],'frameCount':len(m['frames']),'verification':'exact hashes, identity, complete ordered inventory'}
if a.action=='finish':
    times={e['name']:e['monotonicNs'] for e in j['events']}
    if 'answerReceived' not in times:raise SystemExit('answerReceived must be observed with mark first')
    durations={}
    for name,start,end in [('operationToAnswer','operationStart','answerReceived'),('inputToAnswer','inputStart','answerReceived'),('pagePreparation','pagePreparationStart','pagePreparationEnd'),('inputTransfer','inputStart','inputTransferred'),('downloadRecovery','downloadStart','downloadRecovered'),('extraction','extractionStart','extractionEnd'),('aiStartToAnswer','aiStart','answerReceived'),('aiRead','aiReadStart','aiReadEnd')]:
        durations[name]=None if start not in times or end not in times else (times[end]-times[start])/1e6
    j['durationsMs']=durations;j['status']='observed';j['limitations']='Caller markers include orchestration/tool waits. Missing intervals are null; no inferred pure inference/network time.'
a.journal.parent.mkdir(parents=True,exist_ok=True);a.journal.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'trialId':j['trialId'],'status':j['status'],'events':len(j['events'])}))
