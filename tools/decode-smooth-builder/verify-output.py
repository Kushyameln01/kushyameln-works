"""Independent gzip/tar and Unity text readback; does not import generators."""
from pathlib import Path
import argparse,tarfile,re,json,hashlib

HEADER=re.compile(r'^--- !u!(\d+) &(-?\d+)(?: stripped)?\n',re.M)
FLOW=re.compile(r'\{fileID: (-?\d+)(?:, guid: ([0-9a-f]{32}), type: (\d+))?\}')
SDK='67cc4cb7839cd3741b63733d5adf0442'

def read_package(path):
    assets={}
    with tarfile.open(path,'r:gz') as archive:
        for member in archive:
            if member.isdir():continue
            parts=member.name.split('/')
            assert len(parts)==2 and re.fullmatch('[0-9a-f]{32}',parts[0]),member.name
            assert parts[1] in ('asset','asset.meta','pathname','preview.png')
            entry=assets.setdefault(parts[0],{});assert parts[1] not in entry
            entry[parts[1]]=archive.extractfile(member).read()
    for guid,entry in assets.items():
        assert 'pathname' in entry and 'asset.meta' in entry
        entry['path']=entry['pathname'].decode('utf8')
        assert re.search(r'^guid: '+guid+r'$',entry['asset.meta'].decode(),re.M)
        text=entry.get('asset',b'').decode('utf8');matches=list(HEADER.finditer(text));entry['docs']={}
        for i,m in enumerate(matches):
            assert m[2] not in entry['docs']
            entry['docs'][m[2]]={'classId':m[1],'text':text[m.start():matches[i+1].start() if i+1<len(matches) else len(text)]}
    assert len({e['path'] for e in assets.values()})==len(assets)
    return assets

def field(text,name):
    values=re.findall(r'^\s+'+re.escape(name)+r': ([^\n]*)$',text,re.M)
    assert len(values)==1,(name,values)
    return values[0]

def scalar(value):return json.loads(value) if value.startswith('"') else value
def reference(value,owner):
    m=FLOW.fullmatch(value);assert m,value
    return (m[2] or owner,m[1])
def node(assets,ref):return assets[ref[0]]['docs'][ref[1]]
def objects(assets):return {(guid,fileid):doc for guid,entry in assets.items() for fileid,doc in entry['docs'].items()}

def verify(path,n):
    assets=read_package(path);all_objects=objects(assets);external=set()
    for (guid,_),doc in all_objects.items():
        for m in FLOW.finditer(doc['text']):
            if m[1]=='0':continue
            target=(m[2] or guid,m[1])
            if target[0]==SDK:external.add(target);continue
            assert target in all_objects,('missing reference',target)
    controllers=[(ref,doc) for ref,doc in all_objects.items() if doc['classId']=='91'];assert len(controllers)==1
    (owner,_),controller=controllers[0];text=controller['text']
    layers=re.findall(r'^  - serializedVersion: 5\n.*?(?=^  - serializedVersion: 5\n|\Z)',text.split('  m_AnimatorLayers:\n',1)[1],re.M|re.S)
    assert len(layers)==n+3
    assert len({scalar(field(l,'m_Name')) for l in layers})==len(layers)
    assert [scalar(field(l,'m_Name')) for l in layers[1:-2]]==[f'Parameters {i+1}' for i in range(n)]
    assert all(field(l,'m_DefaultWeight')=='1' for l in layers)
    maskrefs={reference(field(l,'m_Mask'),owner) for l in layers};assert len(maskrefs)==1
    mask=node(assets,next(iter(maskrefs)));assert mask['classId']=='319'
    assert scalar(field(mask['text'],'m_Name'))=='Safety'
    assert field(mask['text'],'m_Mask')=='00000000'*13 and field(mask['text'],'m_Elements')=='[]'
    root=node(assets,reference(field(layers[0],'m_StateMachine'),owner));assert root['classId']=='1107'
    assert field(root['text'],'m_ChildStates')=='[]' and field(root['text'],'m_DefaultState')=='{fileID: 0}'
    children=re.findall(r'^    m_StateMachine: (\{[^\n]+\})$',root['text'],re.M);assert len(children)==1
    childref=reference(children[0],owner);child=node(assets,childref);assert child['classId']=='1107'
    assert field(child['text'],'m_ChildStates')=='[]' and field(child['text'],'m_ChildStateMachines')=='[]'
    entryrefs=re.findall(r'^  - (\{fileID: [^\n]+\})$',root['text'].split('  m_EntryTransitions:\n',1)[1].split('  m_StateMachineTransitions:',1)[0],re.M)
    assert len(entryrefs)==1
    transition=node(assets,reference(entryrefs[0],owner));assert transition['classId']=='1109'
    assert reference(field(transition['text'],'m_DstStateMachine'),owner)==childref
    assert field(transition['text'],'m_DstState')=='{fileID: 0}'
    params=text.split('  m_AnimatorParameters:\n',1)[1].split('  m_AnimatorLayers:',1)[0]
    rows=re.findall(r'^  - m_Name: ([^\n]+)\n(.*?)(?=^  - m_Name:|\Z)',params,re.M|re.S)
    animator={scalar(name):body for name,body in rows};assert len(animator)==len(rows)==12*n+2
    assert field(animator['AlwaysOne'],'m_Type')=='1' and float(field(animator['AlwaysOne'],'m_DefaultFloat'))==1
    for layer,expected in zip(layers[-2:],['Root_BinaryParameter','Root_Smooth_Parameter']):
        assert scalar(field(layer,'m_Name'))==expected and field(layer,'m_BlendingMode')=='0'
        machine=node(assets,reference(field(layer,'m_StateMachine'),owner));assert machine['classId']=='1107'
        state=node(assets,reference(field(machine['text'],'m_DefaultState'),owner));assert state['classId']=='1102'
        assert field(state['text'],'m_WriteDefaultValues')=='1'
        motion=node(assets,reference(field(state['text'],'m_Motion'),owner));assert motion['classId']=='206'
        assert scalar(field(motion['text'],'m_Name'))==expected
        assert field(motion['text'],'m_NormalizedBlendValues')=='0' and field(motion['text'],'m_BlendType')=='4'
        assert len(re.findall(r'^    m_Motion:',motion['text'],re.M))==n
        assert [scalar(x) for x in re.findall(r'^    m_DirectBlendParameter: (.+)$',motion['text'],re.M)]==['AlwaysOne']*n
    expressions=[doc for doc in all_objects.values() if doc['classId']=='114'];assert len(expressions)==1
    exrows=re.findall(r'^  - name: ([^\n]+)\n(.*?)(?=^  - name:|\Z)',expressions[0]['text'].split('  parameters:\n',1)[1],re.M|re.S)
    expr={scalar(name):body for name,body in exrows};assert len(expr)==len(exrows)==len(animator)
    assert float(field(expr['AlwaysOne'],'defaultValue'))==1
    assert set(expr)==set(animator)
    for name,body in expr.items():
        expected_sync='1' if re.search(r'(?:[0-9]|Negative)\Z',name) else '0'
        assert field(body,'valueType')=='1' and field(body,'saved')=='0' and field(body,'networkSynced')==expected_sync
        if name in ('EyeLidLeft','EyeLidRight','EyeLid'):
            assert float(field(body,'defaultValue'))==.75 and float(field(animator[name],'m_DefaultFloat'))==.75
    counts={}
    for doc in all_objects.values():counts[doc['classId']]=counts.get(doc['classId'],0)+1
    assert counts['206']>=2 and counts.get('74',0)>0
    synced=sum(field(body,'networkSynced')=='1' for body in expr.values())
    assert synced*8<=256
    return {'status':'PASS','file':path.name,'targetCount':n,'layers':len(layers),'animatorParameters':len(animator),'expressionParameters':len(expr),'syncedExpressions':synced,'syncBitCost':synced*8,'trees':counts['206'],'clips':counts.get('74',0),'assets':len(assets),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'externalSdkRefs':sorted(external)}

def verify_mapping(path,report_path,source_dir):
    report=json.loads(report_path.read_text());output=objects(read_package(path));sources={}
    # Browser evidence can also contain unrelated final outputs from UI runs.
    # Only the recovered, explicitly named intermediate inputs are originals.
    inputs=set()
    for pattern in ('source-*.unitypackage','registration-*.unitypackage','template-*.unitypackage'):
        inputs.update(source_dir.glob(pattern))
    assert inputs,'No named intermediate source packages found'
    for p in sorted(inputs):
        if p.resolve()==path.resolve():continue
        for ref,doc in objects(read_package(p)).items():
            if ref in sources:assert sources[ref]==doc
            sources[ref]=doc
    mappings=report['composition']['objectMapping'];inverse={}
    for m in mappings:
        if 'sourceId' not in m:continue
        ref=(m['outputGuid'],m['outputFileId']);assert ref in output
        original=tuple(m['sourceId'].split(':'));assert original in sources or m.get('blockId')=='roots' or m['sourcePath'].endswith('InternalRoots.controller')
        if ref in inverse:assert inverse[ref]==original
        inverse[ref]=original
    def normalized(doc,owner,reverse=None):
        text=HEADER.sub(lambda m:'--- !u!'+m[1]+' &<ID>\n',doc['text'],count=1)
        def replace(m):
            if m[1]=='0':return '{NULL}'
            target=(m[2] or owner,m[1])
            if reverse is not None:target=reverse.get(target,target)
            return '{REF:'+':'.join(target)+'}'
        return FLOW.sub(replace,text)
    motion_sources={ref:doc for ref,doc in sources.items() if doc['classId'] in ('206','74')}
    roots=[ref for ref,doc in motion_sources.items() if doc['classId']=='206' and scalar(field(doc['text'],'m_Name')) in ('Root_BinaryParameter','Root_Smooth_Parameter')]
    assert len(roots)==2
    reachable=set();queue=list(roots)
    while queue:
        ref=queue.pop()
        if ref in reachable:continue
        reachable.add(ref)
        for m in FLOW.finditer(motion_sources[ref]['text']):
            if m[1]=='0':continue
            child=(m[2] or ref[0],m[1])
            assert child in motion_sources,('unexpected source Motion reference',child)
            queue.append(child)
    emitted={inverse[ref] for ref,doc in output.items() if doc['classId'] in ('206','74')}
    assert emitted==reachable,('Motion closure mismatch',len(emitted),len(reachable))
    compared=0
    for ref,doc in output.items():
        if doc['classId'] not in ('206','74','319'):continue
        source=inverse[ref];original=sources[source];assert original['classId']==doc['classId']
        assert normalized(original,source[0])==normalized(doc,ref[0],inverse),('source settings changed',source,ref)
        compared+=1
    return {'mappedMotionAndMaskDocuments':compared,'mappingStatus':'PASS','sourceSettingsAndCurves':'PASS','sourceReachableMotionDocuments':len(reachable),'unreferencedSourceMotionDocumentsOmitted':len(motion_sources)-len(reachable)}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('package',type=Path);parser.add_argument('--targets',type=int,required=True);parser.add_argument('--report',type=Path);parser.add_argument('--sources-dir',type=Path);parser.add_argument('--output',type=Path)
    args=parser.parse_args();result=verify(args.package,args.targets)
    if args.report:
        assert args.sources_dir,'--sources-dir is required with --report'
        result.update(verify_mapping(args.package,args.report,args.sources_dir))
    result.update({'method':'Independent Python gzip/tar and structural/reference readback without generator imports','unityImport':'UNVERIFIED','runtime':'UNVERIFIED','layer0ConsumerEmptyClassification':'UNVERIFIED'})
    if args.output:args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
