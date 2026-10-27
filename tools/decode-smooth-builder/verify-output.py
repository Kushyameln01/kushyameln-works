"""Independent gzip/tar and Unity text readback; does not import generators."""
from pathlib import Path
import argparse,tarfile,re,json,hashlib

HEADER=re.compile(r'^--- !u!(\d+) &(-?\d+)(?: stripped)?\r?\n',re.M)
FLOW=re.compile(r'\{fileID: (-?\d+)(?:, guid: ([0-9a-f]{32}), type: (\d+))?\}')
SDK='67cc4cb7839cd3741b63733d5adf0442'
PARENT_PATH='Assets/Merged_DecodeAndSmooth'
def preserved_path(path):
    assert path.startswith('Assets/'),('source path must be Assets-relative',path)
    return path if path==PARENT_PATH or path.startswith(PARENT_PATH+'/') else PARENT_PATH+'/'+path[len('Assets/'):]
# Read factual JSON data only; never import or execute the product JavaScript.
RANGE_SOURCE=Path(__file__).resolve().parents[2]/'docs/shared/animator-integrator/vrcft5-ranges.mjs'
RANGE_LITERAL=re.search(r'VRCFT5_PARAMETER_RANGES=Object\.freeze\((\[[\s\S]*?\])\.map',RANGE_SOURCE.read_text()).group(1)
VRCFT5_RANGES={row['name']:row for row in json.loads(RANGE_LITERAL)}
def parameter_range(name):
    match=re.search(r'(?:^|/)v2[/.]([^/]+)\Z',name)
    return VRCFT5_RANGES.get('v2/'+match[1]) if match else None

def smooth_control(name):
    return name.startswith('Smooth/') and name.endswith('_Function')

def expected_registration(name):
    if name.startswith(('Decode/','Function/','Proxy/','Smooth/')) and not smooth_control(name):return False
    if name.endswith('0'):return False
    bounds=parameter_range(name[:-len('Negative')]) if name.endswith('Negative') else None
    return not (bounds and bounds['min']>=0)

def expected_binary(name):
    if name.endswith('Negative'):
        bounds=parameter_range(name[:-len('Negative')])
        return bool(bounds and bounds['min']<0)
    return bool(re.search(r'[1-9]\Z',name))



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
        entry['docs']={}
        try:text=entry.get('asset',b'').decode('utf8')
        except UnicodeDecodeError:continue  # Preserve opaque files as bytes; they have no parsed documents.
        matches=list(HEADER.finditer(text))
        for i,m in enumerate(matches):
            assert m[2] not in entry['docs']
            entry['docs'][m[2]]={'classId':m[1],'text':text[m.start():matches[i+1].start() if i+1<len(matches) else len(text)]}
    assert len({e['path'] for e in assets.values()})==len(assets)
    return assets

def field(text,name,indent=None):
    prefix=r'\s+' if indent is None else ' '*indent
    values=re.findall(r'^'+prefix+re.escape(name)+r': ([^\n]*)$',text,re.M)
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
            if re.fullmatch(r'0{16}[ef]0{15}',target[0]):continue
            assert target in all_objects or target[0] in assets and not assets[target[0]]['docs'],('missing reference',target)
    controllers=[(ref,doc) for ref,doc in all_objects.items() if doc['classId']=='91'];assert len(controllers)==1
    (owner,_),controller=controllers[0];text=controller['text']
    layers=re.findall(r'^  - serializedVersion: 5\n.*?(?=^  - serializedVersion: 5\n|\Z)',text.split('  m_AnimatorLayers:\n',1)[1],re.M|re.S)
    assert len(layers)==3
    assert len({scalar(field(l,'m_Name')) for l in layers})==len(layers)
    assert [scalar(field(l,'m_Name')) for l in layers]==['Base Layer','Root_BinaryParameter','Root_Smooth_Parameter']
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
    controller_objects=assets[owner]['docs'].values()
    machines=[d for d in controller_objects if d['classId']=='1107']
    assert len(machines)==4,'Excluded Registrar roots remain inside the Controller'
    assert sorted(scalar(field(d['text'],'m_Name',indent=2)) for d in machines)==sorted(['Base Layer','No Animation','Root_BinaryParameter','Root_Smooth_Parameter'])
    assert len(assets[owner]['docs'])==8
    for d in assets[owner]['docs'].values():
        if d['classId'] in ('1107','1102','1109'):assert field(d['text'],'m_ObjectHideFlags')=='1'
        elif d['classId']=='91':assert field(d['text'],'m_ObjectHideFlags',indent=2)=='0'
    params=text.split('  m_AnimatorParameters:\n',1)[1].split('  m_AnimatorLayers:',1)[0]
    rows=re.findall(r'^  - m_Name: ([^\n]+)\n(.*?)(?=^  - m_Name:|\Z)',params,re.M|re.S)
    animator={scalar(name):body for name,body in rows};assert animator and len(animator)==len(rows)
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
        if expected=='Root_BinaryParameter':
            for value in re.findall(r'^    m_Motion: (.+)$',motion['text'],re.M):
                binary_ref=reference(value,owner);binary=node(assets,binary_ref)
                binary_name=scalar(field(binary['text'],'m_Name',indent=2))
                assert binary_name.endswith('_Binary_Root')
                leaf=binary_name[:-len('_Binary_Root')]
                children=re.findall(r'^  - serializedVersion: 2\n.*?(?=^  - serializedVersion:|^  m_BlendParameter:)',binary['text'],re.M|re.S)
                decode_children=[]
                for child in children:
                    child_ref=reference(field(child,'m_Motion'),binary_ref[0]);target=node(assets,child_ref)
                    if scalar(field(target['text'],'m_Name',indent=2))==leaf+'_Decode_Root':decode_children.append((child,child_ref,target))
                assert len(decode_children)==1,('Binary must reach its own Decode root once',leaf)
                child,decode_ref,decode=decode_children[0]
                assert field(child,'m_DirectBlendParameter')=='AlwaysOne' and field(child,'m_TimeScale')=='1'
                assert field(binary['text'],'m_NormalizedBlendValues')=='0' and field(binary['text'],'m_BlendType')=='4'
                values=set()
                for clip_ref in re.findall(r'^    m_Motion: (.+)$',decode['text'],re.M):
                    clip=node(assets,reference(clip_ref,decode_ref[0]));assert clip['classId']=='74'
                    assert set(re.findall(r'^    attribute: (.+)$',clip['text'],re.M))=={'Decode/'+leaf}
                    values.update(float(v) for v in re.findall(r'^        value: (.+)$',clip['text'],re.M))
                assert values=={-1,0,1},('Decode output Clip values changed',leaf)
    expressions=[doc for doc in all_objects.values() if doc['classId']=='114'];assert len(expressions)==1
    exrows=re.findall(r'^  - name: ([^\n]+)\n(.*?)(?=^  - name:|\Z)',expressions[0]['text'].split('  parameters:\n',1)[1],re.M|re.S)
    expr={scalar(name):body for name,body in exrows};assert len(expr)==len(exrows)
    assert float(field(expr['AlwaysOne'],'defaultValue'))==1
    assert set(expr)=={name for name in animator if expected_registration(name)}
    for name,body in expr.items():
        binary=expected_binary(name)
        expected='1' if binary else '0'
        assert field(body,'valueType')==('2' if binary else '1') and field(body,'saved')=='0' and field(body,'networkSynced')==expected
        if binary:assert float(field(body,'defaultValue')) in (0,1)
        default=float(field(body,'defaultValue'))
        animator_default=float(field(animator[name],'m_DefaultFloat'))
        if re.fullmatch(r'v2/EyeLid(?:Left|Right)[48]',name):assert default==1 and animator_default==0
        else:assert default==animator_default
        if name in ('v2/EyeLidLeft','v2/EyeLidRight','v2/EyeLid'):
            assert float(field(body,'defaultValue'))==.75 and float(field(animator[name],'m_DefaultFloat'))==.75
    counts={}
    for doc in all_objects.values():counts[doc['classId']]=counts.get(doc['classId'],0)+1
    assert counts['206']>=2
    synced=sum(field(body,'networkSynced')=='1' for body in expr.values())
    bits=sum(1 if field(body,'valueType')=='2' else 8 for body in expr.values() if field(body,'networkSynced')=='1')
    assert bits<=256
    return {'status':'PASS','file':path.name,'targetCount':n,'layers':len(layers),'stateMachines':len(machines),'controllerObjects':len(assets[owner]['docs']),'graphHideInHierarchy':'PASS','registrarRootsRemaining':0,'animatorParameters':len(animator),'expressionParameters':len(expr),'syncedExpressions':synced,'syncBitCost':bits,'vrcft5RangeSyncEnabled':True,'trees':counts['206'],'clips':counts.get('74',0),'assets':len(assets),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'externalSdkRefs':sorted(external)}

def verify_mapping(path,report_path,source_dir):
    report=json.loads(report_path.read_text());final_assets=read_package(path);output=objects(final_assets)
    # Assembly has already moved Template assets below Root_DecodeSmooth.
    # Those exact named inputs, not the earlier template-*.unitypackage paths,
    # are the preservation baseline. Never scan unrelated final UI outputs.
    required=[source_dir/f'source-{kind}.unitypackage' for kind in ('motion','base','mask')]
    assert all(p.is_file() for p in required),'source-motion/base/mask.unitypackage are required'
    inputs=required+sorted(source_dir.glob('registration-*.unitypackage'))
    assert len(inputs)>len(required),'Named registration source packages are required'
    source_assets={}
    for p in inputs:
        assert p.resolve()!=path.resolve(),'The output cannot be its own source'
        for guid,entry in read_package(p).items():
            if guid in source_assets:assert source_assets[guid]==entry,('source GUID conflict',guid)
            source_assets[guid]=entry
    sources=objects(source_assets)
    controller_ids=report['request']['controllerIds'];expression_ids=report['request']['expressionIds']
    assert controller_ids and expression_ids,'Existing Controller and Expression output hosts are required'
    controller_host=tuple(controller_ids[0].split(':'));expression_host=tuple(expression_ids[0].split(':'))
    host_guids={controller_host[0],expression_host[0]}
    discarded={identity.split(':')[0] for identity in controller_ids[1:]+expression_ids[1:]}
    assert not host_guids&discarded,'Conflicting selected output hosts'
    parents=[(guid,entry) for guid,entry in final_assets.items() if entry['path']==PARENT_PATH]
    assert len(parents)==1,'Exactly one parent folder is required'
    parent_guid,parent=parents[0]
    assert 'asset' not in parent and re.search(rb'^folderAsset: yes$',parent['asset.meta'],re.M),'The parent must be a folder'
    original_parents=[guid for guid,entry in source_assets.items() if entry['path']==PARENT_PATH]
    assert not original_parents or original_parents==[parent_guid],'Existing parent folder GUID must be reused'
    assert set(final_assets)==(set(source_assets)-discarded)|{parent_guid},'Only a new parent folder may receive a new file GUID'
    assert all(entry['path']==PARENT_PATH or entry['path'].startswith(PARENT_PATH+'/') for entry in final_assets.values()),'All output files must belong to the parent folder'
    compared_files=0;embedded_files=0
    for guid,original in source_assets.items():
        if guid in discarded:continue
        actual=final_assets[guid]
        assert actual['pathname']==preserved_path(original['path']).encode('utf8'),('source relative pathname changed',guid)
        assert actual['asset.meta']==original['asset.meta'],('source metadata/GUID changed',guid)
        if guid in host_guids:
            identity=controller_host if guid==controller_host[0] else expression_host
            assert identity in output and identity in sources,('host root fileID changed',identity)
            assert output[identity]['classId']==sources[identity]['classId']
            assert field(output[identity]['text'],'m_Name',indent=2)==field(sources[identity]['text'],'m_Name',indent=2),('host name changed',identity)
            continue
        assert actual.get('asset')==original.get('asset'),('whole source payload changed or embedded Clip separated',guid)
        assert list(actual['docs'])==list(original['docs']),('source document order/fileIDs changed',guid)
        assert actual['docs']==original['docs'],('source documents changed or moved to another file',guid)
        classes={doc['classId'] for doc in original['docs'].values()}
        embedded_files+=int('206' in classes and '74' in classes)
        compared_files+=1
    assert embedded_files>0,'The source fixture must include Clips embedded in BlendTree files'
    # Existing base state structure keeps its own IDs and text. No identity
    # canonicalization is permitted for source Motion or base structure.
    for ref,original in sources.items():
        if ref[0]!=controller_host[0] or original['classId']=='91':continue
        assert ref in output and output[ref]==original,('base structural identity/content changed',ref)
    mappings=report['composition']['objectMapping']
    def parameter_names(text):
        content=text.split('  m_AnimatorParameters:',1)[1].split('  m_AnimatorLayers:',1)[0]
        names=[scalar(value) for value in re.findall(r'^  - m_Name: ([^\n]+)$',content,re.M)]
        assert len(set(names))==len(names)
        return set(names)
    expected_parameters={'AlwaysOne'}
    for identity in report['request']['controllerIds']:
        ref=tuple(identity.split(':'));assert ref in sources and sources[ref]['classId']=='91'
        expected_parameters.update(parameter_names(sources[ref]['text']))
    controller=report['controllers'][0]
    assert (controller['guid'],controller['fileId'])==controller_host,'Final Controller must retain the first selected host identity'
    assert controller['path']==preserved_path(source_assets[controller_host[0]]['path'])
    final_controller=output[(controller['guid'],controller['fileId'])]
    assert parameter_names(final_controller['text'])==expected_parameters,'Input Animator declaration set differs from output'
    motion_sources={ref:doc for ref,doc in sources.items() if doc['classId'] in ('206','74')}
    roots=[tuple(report['request'][key].split(':')) for key in ('binaryTreeId','smoothTreeId')]
    assert len(set(roots))==2 and all(ref in motion_sources and motion_sources[ref]['classId']=='206' for ref in roots)
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
    emitted={ref for ref,doc in output.items() if doc['classId'] in ('206','74')}
    assert emitted==set(motion_sources),('whole-input Motion identities differ',len(emitted),len(motion_sources))
    motion_mappings=[m for m in mappings if tuple(m.get('sourceId','').split(':')) in motion_sources]
    assert {tuple(m['sourceId'].split(':')) for m in motion_mappings}==set(motion_sources),'Mapping omitted source Motion documents'
    for m in motion_mappings:
        source=tuple(m['sourceId'].split(':'));destination=(m['outputGuid'],m['outputFileId'])
        assert destination==source,('Motion GUID/fileID remapped',source,destination)
        assert m['sourcePath']==source_assets[source[0]]['path'] and m['outputPath']==preserved_path(m['sourcePath']),('Motion relative file path changed',source)
    for ref,original in motion_sources.items():assert output[ref]==original,('Motion name/content changed',ref)
    preservation=report.get('preservation');assert isinstance(preservation,dict),'The preservation report is missing'
    parent_record=preservation['parentFolder']
    assert parent_record['path']==PARENT_PATH and parent_record['guid']==parent_guid
    assert parent_record['created']==(not original_parents)
    assert {item['guid'] for item in preservation['sourceAssets']}==set(source_assets)-discarded-host_guids,'Preservation report omitted source files'
    assert {item['guid'] for item in preservation['modifiedHosts']}==host_guids
    for item in preservation['sourceAssets']+preservation['modifiedHosts']:
        assert item['sourcePath']==source_assets[item['guid']]['path']
        assert item['outputPath']==preserved_path(item['sourcePath'])
    for change in preservation['structuralFileIdChanges']:
        identity=tuple(change['sourceId'].split(':'))
        assert identity in sources and identity not in motion_sources and identity[0]!=controller_host[0]
        assert change['outputFileId']!=identity[1],('Unnecessary structural ID change report',identity)
    return {'wholeSourceFilesCompared':compared_files,'embeddedClipFilesPreserved':embedded_files,'mappingStatus':'PASS','sourcePathsGuidsMetadataPayloads':'PASS','sourceMotionDocumentsPreserved':len(motion_sources),'sourceReachableMotionDocuments':len(reachable),'unreferencedSourceMotionDocumentsPreserved':len(motion_sources)-len(reachable),'unreferencedSourceMotionDocumentsOmitted':0}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('package',type=Path);parser.add_argument('--targets',type=int,required=True);parser.add_argument('--report',type=Path);parser.add_argument('--sources-dir',type=Path);parser.add_argument('--output',type=Path)
    args=parser.parse_args();result=verify(args.package,args.targets)
    if args.report:
        assert args.sources_dir,'--sources-dir is required with --report'
        result.update(verify_mapping(args.package,args.report,args.sources_dir))
    result.update({'method':'Independent Python gzip/tar and structural/reference readback without generator imports','unityImport':'UNVERIFIED','runtime':'UNVERIFIED','layer0ConsumerEmptyClassification':'UNVERIFIED'})
    if args.output:args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
