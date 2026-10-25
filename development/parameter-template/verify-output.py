#!/usr/bin/env python3
"""Independent comparison of emitted package bytes against the supplied source.

Usage: python verify-output.py ORIGINAL.unitypackage OUTPUT.unitypackage v2/Name
Uses Python tarfile, gzip and zlib; does not import the JS generator or JSON data.
"""
import gzip, hashlib, io, re, sys, tarfile, zlib
from pathlib import Path

original, generated, target = sys.argv[1:]
assert target.startswith('v2/') and target[3:], 'Expected v2/<name>'
leaf = target[3:]
# Only these two source names remain directly under Assets/<leaf>. The source
# also contains Decode_Root and Simple_Root; those belong in <leaf>_Child.
root_names = {'Binary_Root', 'Smooth_Root'}
folder_paths = {f'Assets/{leaf}', f'Assets/{leaf}/{leaf}_Child'}
def read_package(path):
    raw=Path(path).read_bytes()
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as t:
        members=t.getmembers()
        assert all(m.isfile() or m.isdir() for m in members)
        files={m.name:t.extractfile(m).read() for m in members if m.isfile()}
    entries={}
    for name,data in files.items():
        if name.endswith('/pathname'):
            guid=name.split('/')[0]
            entries[guid]={'path':data.decode(),'meta':files[guid+'/asset.meta'].decode(),'text':files.get(guid+'/asset',b'').decode()}
            assert re.search(r'^guid: '+guid+r'$',entries[guid]['meta'],re.M)
    return raw,members,files,entries

def docs(text):
    return [(m[1],m[2],m[0]) for m in re.finditer(r'^--- !u!(\d+) &(-?\d+)\n[\s\S]*?(?=^--- !u!|\Z)',text,re.M)]

def name(doc):return re.search(r'^  m_Name: (.+)$',doc,re.M)[1]
def display(old):return old.replace('Parameter',leaf) if 'Parameter' in old else leaf+'_'+old
def edges(doc):return list(re.finditer(r'^    m_Motion: \{fileID: (-?\d+)(?:, guid: ([0-9a-f]{32}), type: 2)?\}$',doc,re.M))
def canonical(doc):return re.sub(r'^  m_Name: .+$','  m_Name: NAME',doc,flags=re.M).strip()
def clip_attributes(doc):
    attrs=re.findall(r'^    attribute: (.+)$',doc,re.M)
    hashes=re.findall(r'^      attribute: (\d+)$',doc,re.M)
    assert hashes and len(attrs)==2*len(hashes), 'Missing Clip curves or bindings'
    assert attrs[:len(hashes)]==attrs[len(hashes):], 'Float/Editor curve attributes differ'
    assert [str(zlib.crc32(v.encode())) for v in attrs[:len(hashes)]]==hashes, 'Stale Clip binding hash'
    return attrs[:len(hashes)]

def revised_value(value):
    # One lookup on the original value: a newly produced v2/Parameter must not
    # become Decode/Parameter, and suffixes including _Function are untouched.
    return {'v2/Parameter':'Decode/Parameter','Smooth/Parameter':'v2/Parameter'}.get(value,value)

def convert_fields(doc):
    # Derive every hash update from the original Clip's actual attributes.
    # This oracle reads the unitypackage, never the generator or template JSON.
    hashes={}
    if re.search(r'^--- !u!74 &',doc,re.M):
        for old in clip_attributes(doc):
            new=revised_value(old).replace('Parameter',leaf)
            old_hash=str(zlib.crc32(old.encode()))
            new_hash=str(zlib.crc32(new.encode()))
            assert old_hash not in hashes or hashes[old_hash]==new_hash
            hashes[old_hash]=new_hash
    converted=[]
    for line in doc.splitlines(keepends=True):
        # The fixed source uses scalar mapping values. Split at the first colon
        # so keys such as m_BlendParameter and objectReferenceParameter survive.
        key,colon,value=line.partition(':')
        if colon:
            scalar=re.fullmatch(r'([ \t]*)([^\r\n]*)(\r?\n)?',value)
            assert scalar, 'Unexpected source scalar layout'
            updated=revised_value(scalar[2]).replace('Parameter',leaf)
            converted.append(key+colon+scalar[1]+updated+(scalar[3] or ''))
        else:
            converted.append(line)
    doc=''.join(converted)
    doc=re.sub(r'^(      attribute: )(\d+)$',lambda m:m[1]+hashes.get(m[2],m[2]),doc,flags=re.M)
    if hashes:clip_attributes(doc)
    return doc

_,_,_,src=read_package(original)
raw,members,files,out=read_package(generated)
assert len(out)==18 and not (set(src)&set(out))
assert len({a['path'].lower() for a in out.values()})==18
tree_by_name={name(d[2]):(guid,a,d[2]) for guid,a in out.items() for d in docs(a['text']) if d[0]=='206'}
assert len(tree_by_name)==16
source_tree_names={name(d[2]) for a in src.values() for d in docs(a['text']) if d[0]=='206'}
assert root_names<=source_tree_names
assert set(tree_by_name)=={display(n) for n in source_tree_names}
clip_edges=tree_edges=embedded=0
for source_guid,source_asset in src.items():
    source_docs=docs(source_asset['text'])
    if not source_docs or source_docs[0][0]!='206':continue
    source=source_docs[0][2]
    out_guid,out_asset,tree=tree_by_name[display(name(source))]
    directory=f'Assets/{leaf}' if name(source) in root_names else f'Assets/{leaf}/{leaf}_Child'
    assert out_asset['path']==f'{directory}/{name(tree)}.asset', f'Wrong Tree directory: {name(source)}'
    assert 'mainObjectFileID: 20600000' in out_asset['meta']
    dest_docs=docs(out_asset['text'])
    assert sum(d[0]=='206' for d in dest_docs)==1
    assert all(d[0] in ('206','74') for d in dest_docs)
    by_id={d[1]:d for d in dest_docs};assert len(by_id)==len(dest_docs)
    expected=convert_fields(source)
    # Strip only independently checked Motion references and display names.
    scrub=lambda s:re.sub(r'^    m_Motion: .*$', '    m_Motion: CHECKED',canonical(s),flags=re.M)
    assert scrub(expected)==scrub(tree), f'Unexpected Tree delta: {name(source)}'
    source_edges,dest_edges=edges(source),edges(tree)
    assert len(source_edges)==len(dest_edges)
    owner_clips={}
    for before,after in zip(source_edges,dest_edges):
        dependency=src[before[2]];dd=docs(dependency['text'])[0]
        if dd[0]=='206':
            assert after[2] and after[1]=='20600000'
            assert after[2]==tree_by_name[display(name(dd[2]))][0]
            tree_edges+=1
        else:
            assert dd[0]=='74' and after[2] is None
            clip=by_id[after[1]];assert clip[0]=='74'
            assert name(clip[2])==display(name(dd[2]))
            desired=canonical(convert_fields(dd[2]))
            actual=canonical(re.sub(r'^--- !u!74 &-?\d+', '--- !u!74 &7400000',clip[2]))
            assert actual==desired, f'Unexpected Clip delta: {name(dd[2])}'
            if before[2] in owner_clips:assert owner_clips[before[2]]==after[1]
            owner_clips[before[2]]=after[1]
            clip_edges+=1
    assert len(owner_clips)==sum(d[0]=='74' for d in dest_docs)
    embedded+=len(owner_clips)
    for _,_,doc in dest_docs:
        assert not re.search(r'[0-9a-f]{32}',name(doc))
        if doc.startswith('--- !u!74'):
            clip_attributes(doc)
assert (embedded,clip_edges,tree_edges)==(30,34,13)
actual_folder_paths=set()
for guid,a in out.items():
    if 'folderAsset: yes' in a['meta']:
        assert guid+'/asset' not in files
        actual_folder_paths.add(a['path'])
    else:
        assert docs(a['text']) and docs(a['text'])[0][0]=='206'
assert actual_folder_paths==folder_paths
for m in members:
    assert m.mode==0o777 and m.uid==m.gid==m.mtime==0 and not m.uname and not m.gname
    if m.isfile():
        assert next(i for i,x in enumerate(members) if x.name.rstrip('/')==m.name.split('/')[0])<members.index(m)
assert [m.name for m in members]==sorted(m.name for m in members)
assert raw[3]&8 and raw[10:23]==b'archtemp.tar\0' and raw[4:8]==b'\0'*4
assert gzip.decompress(raw)[257:265]==b'ustar  \0'
assert all(not b.endswith(b'\n') for n,b in files.items() if n.endswith('/pathname'))
print(f'PASS independent Python: {leaf}; Template revision 2 exact remap, preserved bit/_Function names, 2 folders, 16 Trees (2 root/14 child), 30 Clips, 47 references; exact allowed deltas, CRC32, fresh GUIDs and confirmed GNU/gzip recipe')
print('sha256='+hashlib.sha256(raw).hexdigest())
