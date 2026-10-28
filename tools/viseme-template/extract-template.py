"""Extract the supplied immutable template without reserializing Unity text."""
import hashlib,json,sys,tarfile
from pathlib import Path

source=Path(sys.argv[1]); destination=Path(sys.argv[2])
expected='c0d6510bf1fcd0cb806924a556c91c042aa6da0858785b6015b9b0dedfe20f77'
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
entries=[]
with tarfile.open(source) as archive:
    for member in archive.getmembers():
        if not member.name.endswith('/pathname'): continue
        guid=member.name.split('/')[0]
        path=archive.extractfile(member).read().decode('utf-8')
        meta=archive.extractfile(guid+'/asset.meta').read().decode('utf-8')
        try: asset=archive.extractfile(guid+'/asset').read()
        except KeyError: asset=None
        entries.append(dict(guid=guid,path=path,meta=meta,text=None if asset is None else asset.decode('utf-8')))
data=dict(schemaVersion=1,sourceSha256=expected,entries=sorted(entries,key=lambda e:e['path']))
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(entries=len(entries),bytes=destination.stat().st_size,sha256=hashlib.sha256(destination.read_bytes()).hexdigest())))
