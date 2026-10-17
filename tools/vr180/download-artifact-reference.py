#!/usr/bin/env python3
"""Download a connector-supplied reference; never print its signed URL."""
import hashlib,os,sys,time,urllib.request
from pathlib import Path
url,path,expected_size,expected_hash=sys.argv[1:]
path=Path(path);expected_size=int(expected_size);deadline=time.monotonic()+180;owned=False
try:
    count=0;sha=hashlib.sha256()
    with urllib.request.urlopen(url,timeout=60) as source,path.open('xb') as dest:
        owned=True
        while True:
            if time.monotonic()>deadline:raise TimeoutError('Download deadline')
            block=source.read(1024*1024)
            if not block:break
            count+=len(block)
            if count>expected_size:raise ValueError('Download exceeded bound')
            sha.update(block);dest.write(block)
        dest.flush();os.fsync(dest.fileno())
    if count!=expected_size or sha.hexdigest()!=expected_hash:raise ValueError('Download size or hash differs')
    print('DOWNLOAD_BYTES_VERIFIED '+str(count)+' '+sha.hexdigest())
except BaseException as error:
    if owned:
        try:path.unlink()
        except OSError:pass
    print('DOWNLOAD_FAILED '+type(error).__name__+' '+str(getattr(error,'code','')),file=sys.stderr)
    raise SystemExit(1)
