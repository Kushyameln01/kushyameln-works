"""Static dependency and current Template source checks; never run product JS."""
from pathlib import Path
import json,re,hashlib

ROOT=Path(__file__).resolve().parents[2]
read=lambda name:(ROOT/name).read_text()
api=read('docs/parameter-template/api.mjs')
core=read('docs/parameter-template/core.mjs')
adapter=read('docs/shared/compute/parameter-template-task.mjs')
bundle=read('docs/shared/compute/pool-worker.bundle.mjs')
consumers=['docs/shared/compute/parameter-template-task.mjs','docs/decode-smooth-builder/pipeline.mjs','docs/decode-smooth-builder/assembly.mjs']
for name in consumers:
    text=read(name)
    assert 'parameter-template/api.mjs' in text,(name,'must use public API')
    assert not re.search(r'parameter-template/(?:template\.json|core\.mjs)',text),(name,'private producer dependency')
    assert not re.search(r'(?:TEMPLATE_SHA256|[\'\"][a-f0-9]{64}[\'\"])',text),(name,'content digest must not gate Template edits')
    assert not re.search(r'(?:treeCount|clipCount)\s*(?:===?|!==?)\s*[0-9]',text),(name,'fixed content counts')
assert 'generateTemplate(request.payload.target)' in adapter
assert 'isTemplateResult(r,{target:shape.target})' in adapter
assert not re.search(r'\bfetch\s*\(|\.buildId\s*===|\.buildId\s*!==',adapter)
assert 'from "../../parameter-template/api.mjs"' in bundle
assert not re.search(r'template\.json|parameter-template/core\.mjs|function generatePackage\(',bundle)
assert not re.search(r'(?:trees|clips)(?:\?\.|\.)length\s*(?:===?|!==?)\s*[0-9]',core)
assert not re.search(r'(?:clipCount|clipReferences|treeReferences)\s*(?:===?|!==?)\s*[0-9]',core)
assert 'treeCount:template.trees.length' in core
assert 'function sourceMotion(value)' in core
assert 'for(const reference of extractReferences(asset.text))' in core
assert "cache:'no-store'" in api and 'crypto.subtle.digest' not in api
assert 'isTemplateResult' in read('docs/parameter-template/app.mjs')
assert "generateTemplate" in read('docs/parameter-template/worker.mjs')

# Parse the current source data without generating packages or executing JS.
template=json.loads(read('docs/parameter-template/template.json'))
assert template['schemaVersion']==1 and template['templateRevision']==2 and isinstance(template['trees'],list) and isinstance(template['clips'],list)
index={};roles=[];references=0
for kind,field,fileid in [('206','trees','20600000'),('74','clips','7400000')]:
    for item in template[field]:
        guid=item['guid'];text=item['text']
        assert re.fullmatch('[0-9a-f]{32}',guid) and guid not in index
        assert len(re.findall(r'^--- !u!',text,re.M))==1
        assert re.search(r'^--- !u!'+kind+' &'+fileid+r'$',text,re.M)
        index[guid]=(kind,fileid)
        if kind=='206':roles.extend(re.findall(r'^  m_Name: (Binary_Root|Smooth_Root)$',text,re.M))
assert sorted(roles)==['Binary_Root','Smooth_Root']
for tree in template['trees']:
    for value in re.findall(r'^[ \t]+(?:-[ \t]+)?m_Motion[ \t]*:[ \t]*([^\r\n]*)$',tree['text'],re.M):
        match=re.fullmatch(r'\{[ \t]*fileID:[ \t]*(-?\d+)[ \t]*(?:,[ \t]*guid:[ \t]*([0-9a-fA-F]{32})[ \t]*,[ \t]*type:[ \t]*(\d+)[ \t]*)?\}[ \t]*(?:#[^\r\n]*)?',value)
        assert match,('unsupported source Motion syntax',value)
        fileid=str(int(match[1]));guid=match[2].lower() if match[2] else None
        if fileid=='0':
            assert guid is None or set(guid)=={'0'}
            continue
        assert guid and match[3]=='2' and guid in index and index[guid][1]==fileid,('unresolved source Motion',value)
        references+=1
public=json.loads(read('security/public-files.json'))['files']
assert 'parameter-template/api.mjs' in public and 'parameter-template/README.md' in public
print(json.dumps({'status':'PASS','kind':'static-source-and-dependency-check-only','producerApi':'parameter-template/api.mjs','currentSourceTrees':len(template['trees']),'currentSourceClips':len(template['clips']),'resolvedSourceMotionReferences':references,'apiSha256':hashlib.sha256(api.encode()).hexdigest(),'productExecution':False},ensure_ascii=False))
