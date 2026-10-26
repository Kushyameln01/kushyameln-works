"""Compare old/new generated Template packages without importing the generator.

Usage: python verify-binary-connection.py BEFORE.unitypackage AFTER.unitypackage
Only the new Binary_Root -> Decode_Root child and freshly issued GUIDs may differ.
"""
import hashlib,json,re,sys,tarfile
from pathlib import Path

def read(path):
    entries={}
    with tarfile.open(path,'r:gz') as archive:
        for member in archive:
            if not member.isfile():continue
            guid,kind=member.name.split('/')
            entries.setdefault(guid,{})[kind]=archive.extractfile(member).read()
    return {entry['pathname'].decode():dict(entry,guid=guid) for guid,entry in entries.items()}

before_path,after_path=map(Path,sys.argv[1:])
before,after=read(before_path),read(after_path)
assert before.keys()==after.keys(),'Asset paths changed'
guid_map={after[path]['guid']:before[path]['guid'] for path in before}
assert len(guid_map)==len(before)
def original_guids(text):
    return re.sub(r'\b[0-9a-f]{32}\b',lambda m:guid_map.get(m[0],m[0]),text)

connected=[];trees=clips=0
for path,old in before.items():
    new=after[path]
    assert old.keys()==new.keys(),('Archive members changed',path)
    assert original_guids(new['asset.meta'].decode())==old['asset.meta'].decode(),('Importer changed',path)
    if 'asset' not in old:continue
    expected=old['asset'].decode();actual=original_guids(new['asset'].decode())
    trees+=len(re.findall(r'^--- !u!206 ',actual,re.M))
    clips+=len(re.findall(r'^--- !u!74 ',actual,re.M))
    if path.endswith('_Binary_Root.asset'):
        decode_path=next(p for p in before if p.endswith('/'+Path(path).name.replace('_Binary_Root','_Decode_Root')))
        decode_guid=before[decode_path]['guid']
        pointer='{fileID: 20600000, guid: '+decode_guid+', type: 2}'
        assert pointer not in expected
        assert actual.count(pointer)==1
        children=re.findall(r'^  - serializedVersion: 2\n.*?(?=^  - serializedVersion:|^  m_BlendParameter:)',actual,re.M|re.S)
        added=children[-1];assert pointer in added
        assert added==('  - serializedVersion: 2\n    m_Motion: '+pointer+'\n'
            '    m_Threshold: 0\n    m_Position: {x: 0, y: 0}\n    m_TimeScale: 1\n'
            '    m_CycleOffset: 0\n    m_DirectBlendParameter: AlwaysOne\n    m_Mirror: 0\n')
        actual=actual.replace(added,'',1)
        connected.append({'binary':path,'decode':decode_path,'weightParameter':'AlwaysOne'})
    assert actual==expected,('Unexpected content or Clip change',path)
assert len(connected)==1
print(json.dumps({'status':'PASS','assets':len(before),'trees':trees,'embeddedClips':clips,
    'onlyContentChange':'one Binary_Root child referencing existing Decode_Root',
    'existingChildrenAndAllClipFields':'unchanged','connections':connected,
    'beforeSha256':hashlib.sha256(before_path.read_bytes()).hexdigest(),
    'afterSha256':hashlib.sha256(after_path.read_bytes()).hexdigest()},ensure_ascii=False,indent=2))
