#!/usr/bin/env python3
"""Recover a complete bounded cloud evidence transport without tar extraction."""
import base64,gzip,hashlib,io,json,sys,tarfile
from pathlib import Path,PurePosixPath

def need(value,reason):
    if not value:raise ValueError(reason)

def recover(source,out):
    need(source.stat().st_size<=16*1024**2 and not out.exists(),'INPUT_BOUND_OR_EXISTING_OUTPUT')
    t=json.loads(source.read_text());b=t['begin'];e=t['end'];rows=t['chunks']
    need(b['schema']=='vr180-log-transport-v1' and b['complete'] and b['archiveFormat']=='tar+gzip','HEADER')
    need(e=={'runId':b['runId'],'sha256':b['sha256'],'chunks':b['chunks']},'FOOTER')
    need(0<len(rows)==b['chunks']<=4096,'CHUNK_COUNT')
    for index,row in enumerate(rows,1):need(row['index']==index and row['total']==len(rows) and len(row['data'])<=b['chunkChars'],'CHUNK_SEQUENCE')
    encoded=''.join(r['data'] for r in rows);need(len(encoded)==b['base64Bytes'],'BASE64_SIZE')
    raw=base64.b64decode(encoded,validate=True)
    need(len(raw)==b['bytes'] and len(raw)<=8*1024**2 and hashlib.sha256(raw).hexdigest()==b['sha256'],'ARCHIVE_SHA')
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:expanded=gz.read(16*1024**2+1)
    need(len(expanded)<=16*1024**2,'EXPANDED_BOUND')
    files={}
    with tarfile.open(fileobj=io.BytesIO(expanded),mode='r:') as archive:
        for entry in archive:
            p=PurePosixPath(entry.name)
            need(entry.isfile() and not p.is_absolute() and '..' not in p.parts and str(p)==entry.name
                 and entry.name not in files and len(files)<1000 and 0<=entry.size<=8*1024**2,'SAFE_REGULAR_ENTRY')
            content=archive.extractfile(entry).read(entry.size+1);need(len(content)==entry.size,'MEMBER_LENGTH');files[entry.name]=content
    need('manifest.json' in files and hashlib.sha256(files['manifest.json']).hexdigest()==b['manifestSHA256'],'MANIFEST_SHA')
    m=json.loads(files['manifest.json']);need(m['runId']==b['runId'] and m['manifestExcludesItself'],'MANIFEST_IDENTITY')
    need({r['name'] for r in m['files']}==set(files)-{'manifest.json'} and len(m['files'])==len(files)-1,'EXACT_MEMBERS')
    for row in m['files']:
        content=files[row['name']];need(len(content)==row['bytes'] and hashlib.sha256(content).hexdigest()==row['sha256'],'MEMBER_SHA')
    run=json.loads(files['run.json']);need(run['runId']==b['runId'] and run['status']==b['status'],'RUN_IDENTITY')
    out.mkdir(parents=True)
    for name,content in files.items():
        path=out/name;path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('xb') as f:f.write(content)
        need(path.read_bytes()==content,'SAVED_READBACK')
    out.with_suffix('.tar.gz').write_bytes(raw)
    return {'status':'BYTES_VERIFIED','runId':b['runId'],'archiveSHA256':b['sha256'],'files':len(files)-1}

if __name__=='__main__':print(json.dumps(recover(Path(sys.argv[1]),Path(sys.argv[2]))))
