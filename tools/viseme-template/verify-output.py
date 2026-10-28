"""Independent original-package vs saved-output check; no product imports."""
import argparse,collections,gzip,hashlib,json,re,tarfile,zlib
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
parser.add_argument('--mesh',default='Body');parser.add_argument('--report',type=Path)
args=parser.parse_args()

def read(path,check_packing=False):
    data=path.read_bytes();entries={}
    if check_packing:
        assert data[:3]==b'\x1f\x8b\x08' and data[3]&8 and data[4:8]==b'\0'*4
        assert data[10:data.index(0,10)]==b'archtemp.tar'
        tar=gzip.decompress(data);assert tar[257:265]==b'ustar  \0'
    with tarfile.open(path) as t:
        members=t.getmembers();names=[m.name for m in members]
        assert len(names)==len(set(names));seen=set()
        for m in members:
            if check_packing:
                assert m.mode==0o777 and m.uid==m.gid==m.mtime==0 and not m.uname and not m.gname
                if m.isdir():seen.add(m.name.rstrip('/'))
                else:assert m.name.split('/')[0] in seen
            if not m.name.endswith('/pathname'):continue
            g=m.name.split('/')[0];p=t.extractfile(m).read().decode()
            assert not p.endswith('\n') and p.startswith('Assets/') and p not in entries
            meta=t.extractfile(g+'/asset.meta').read().decode();assert re.search('^guid: '+g+'$',meta,re.M)
            try:asset=t.extractfile(g+'/asset').read().decode()
            except KeyError:asset=None
            if 'folderAsset: yes' in meta:assert asset is None
            else:assert asset
            entries[p]=dict(guid=g,meta=meta,text=asset)
    return entries

def docs(text):
    return re.findall(r'(^--- !u!(\d+) &(-?\d+)\n[\s\S]*?)(?=^--- !u!|\Z)',text,re.M)

source=read(args.source);out=read(args.output,True)
assert len(out)==19
assert set(out)=={p for p in source if '/Animation' not in p}|{'Assets/Viseme/Viseme_none.anim'}
assert len({e['guid'] for e in out.values()})==len(out)
assert not {e['guid'] for e in source.values()}&{e['guid'] for e in out.values()}
source_by_guid={e['guid']:p for p,e in source.items()};out_by_guid={e['guid']:p for p,e in out.items()}
mapped={e['guid']:out[p]['guid'] for p,e in source.items() if p in out}
mapped[source['Assets/Viseme/Animation/Viseme_none.anim']['guid']]=out['Assets/Viseme/Viseme_none.anim']['guid']
all_docs={p:docs(e['text']) for p,e in out.items() if e['text']}
counts=collections.Counter(c for ds in all_docs.values() for _,c,_ in ds)
assert counts=={'91':1,'1107':2,'1102':15,'1109':15,'1101':15,'74':17,'206':15},counts

controller='Assets/Viseme/Viseme_Base.controller'
expected=source[controller]['text']
for text,kind,fid in docs(expected):
    if kind=='319':expected=expected.replace(text,'')
for a,b in mapped.items():expected=expected.replace(a,b)
assert out[controller]['text']==expected,'Controller changed beyond Mask removal/GUID remap'

original_clips={re.search(r'^  m_Name: (.+)$',e['text'],re.M)[1]:(p,e) for p,e in source.items() if p.endswith('.anim')}
seen_clips={};references=0;shared_targets=[]
def normalize_clip(text):
    # Only allowed differences: document ID and the two forms of mesh paths.
    return re.sub(r'^--- !u!74 &-?\d+', '--- !u!74 &ID',re.sub(r'^      path: \d+$','      path: HASH',re.sub(r'^    path: .*$', '    path: MESH',text,flags=re.M),flags=re.M),flags=re.M)
for path,ds in all_docs.items():
    for text,kind,fid in ds:
        if kind=='74' and path!=controller:
            name=re.search(r'^  m_Name: (.+)$',text,re.M)[1];assert name not in seen_clips
            seen_clips[name]=(out[path]['guid'],fid,path)
            paths=re.findall(r'^    path: (.*)$',text,re.M)
            assert len(paths)==30 and all((json.loads(p) if p.startswith('"') else p)==args.mesh for p in paths)
            hashes=re.findall(r'^      path: (\d+)$',text,re.M)
            assert len(hashes)==15 and all(int(h)==zlib.crc32(args.mesh.encode()) for h in hashes)
            original=docs(original_clips[name][1]['text'])[0][0]
            assert normalize_clip(text)==normalize_clip(original),name
        for match in re.finditer(r'\{fileID: (-?\d+)(?:, guid: ([a-f0-9]{32}), type: \d+)?\}',text):
            rid,g=match.groups()
            if rid=='0':continue
            target=out_by_guid[g] if g else path
            assert any(i==rid for _,_,i in all_docs[target]),(path,rid,g)
            references+=1
assert set(seen_clips)==set(original_clips)

for path,entry in source.items():
    if not path.endswith('.asset'):continue
    target=out[path];tree=all_docs[path][0][0];original=docs(entry['text'])[0][0]
    # Resolve every child to a Clip name and compare all remaining Tree bytes.
    def semantic(text,lookup,local=None):
        def repl(m):
            fid,g=m.groups();return 'm_Motion: '+lookup(g or local,fid)
        return re.sub(r'm_Motion: \{fileID: (-?\d+)(?:, guid: ([a-f0-9]{32}), type: 2)?\}',repl,text)
    src_names={(e['guid'],'7400000'):n for n,(_,e) in original_clips.items()}
    dst_names={(g,f):n for n,(g,f,_) in seen_clips.items()}
    assert semantic(original,lambda g,f:src_names[(g,f)])==semantic(tree,lambda g,f:dst_names[(g,f)],target['guid'])
    assert len([1 for _,c,_ in all_docs[path] if c=='74'])==1
    shared_targets.extend(re.findall(r'm_Motion: \{fileID: 7400000, guid: ([a-f0-9]{32}), type: 2\}',tree))
assert len(shared_targets)==15 and set(shared_targets)=={out['Assets/Viseme/Viseme_none.anim']['guid']}
for path,e in out.items():
    original=source[path if path!='Assets/Viseme/Viseme_none.anim' else 'Assets/Viseme/Animation/Viseme_none.anim']
    assert e['meta']==original['meta'].replace(original['guid'],e['guid'])
report=dict(status='PASS',meshName=args.mesh,sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
    outputSha256=hashlib.sha256(args.output.read_bytes()).hexdigest(),entries=len(out),objects=dict(counts),resolvedReferences=references,
    embeddedClips=15,externalSharedClips=1,sharedReferenceCount=15,avatarMasks=0,controllerPreserved=True,clipPayloadsPreserved=True,
    packing='GNU tar + gzip, explicit GUID directories, mode 0777, fixed headers',unityEditorVerified=False)
if args.report:args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
