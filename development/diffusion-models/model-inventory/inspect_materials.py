"""Header-only inventory: never loads a weight tensor or changes originals."""
from pathlib import Path
from collections import Counter,defaultdict
import hashlib,json,struct,zipfile,math,re
ROOT=Path('/workspace/work/retained/bernini')
OUT=Path(__file__).parent
result={'scope':'diffusion_models; read-only header/workflow inspection','inference_executed':False,'models':[]}
for p in sorted(ROOT.glob('*.safetensors')):
 with p.open('rb') as f:
  prefix=f.read(8);hlen=struct.unpack('<Q',prefix)[0]
  if hlen>10_000_000:raise ValueError('Unexpected header size')
  header_bytes=f.read(hlen);header=json.loads(header_bytes)
 tensors={k:v for k,v in header.items() if k!='__metadata__'}
 sizes=Counter();elements=Counter();counts=Counter();ranges=[];block_sizes=Counter()
 for name,v in tensors.items():
  start,end=v['data_offsets'];ranges.append((start,end,name))
  sizes[v['dtype']]+=end-start; elements[v['dtype']]+=math.prod(v['shape']);counts[v['dtype']]+=1
  match=re.match(r'blocks\.(\d+)\.',name)
  if match:block_sizes[match[1]]+=end-start
 ranges.sort(); position=0
 for start,end,name in ranges:
  if start!=position or end<start:raise ValueError('Non-contiguous or invalid offsets '+name)
  position=end
 if position+8+hlen!=p.stat().st_size:raise ValueError('Header payload size mismatch')
 numeric=sum(x for k,x in elements.items() if k!='U8')
 m={'name':p.name,'path':str(p),'file_bytes':p.stat().st_size,'header_bytes':hlen,'header_sha256':hashlib.sha256(header_bytes).hexdigest(),'metadata':header.get('__metadata__'),'tensor_count':len(tensors),'tensor_count_by_dtype':dict(counts),'elements_by_dtype':dict(elements),'payload_bytes_by_dtype':dict(sizes),'payload_bytes':position,'payload_GiB':position/2**30,'header_ranges_contiguous':True,'blocks_count':len(block_sizes),'block_payload_bytes':dict(sorted(block_sizes.items(),key=lambda x:int(x[0]))),'numeric_elements_excluding_U8_metadata':numeric,'hypothetical_all_numeric_FP16_bytes':numeric*2,'hypothetical_all_numeric_FP32_bytes':numeric*4,'wasm32_max_linear_memory_bytes':2**32,'payload_exceeds_single_wasm32_memory':position>2**32,'observed_shape_evidence':{k:tensors[k] for k in ['patch_embedding.weight','text_embedding.0.weight','text_embedding.2.weight','time_embedding.0.weight','time_projection.1.weight','head.head.weight','blocks.0.ffn.0.weight','blocks.0.self_attn.q.weight']},'architecture_interpretation':'40-block Wan-family-like video Transformer from keys/shapes and source naming; full architecture/config and execution semantics not proven by header','missing_in_header':['attention head count','normalization epsilons','prediction semantics','scheduler implementation','tokenizer','complete source architecture/config']}
 (OUT/(p.name+'.header.json')).write_text(json.dumps(header,ensure_ascii=False,indent=2)+'\n')
 result['models'].append(m)
with zipfile.ZipFile(ROOT/'example_workflows.zip') as z:
 bad=z.testzip()
 if bad:raise ValueError('CRC failure: '+bad)
 archive_name='example_workflows/bernini_rv2v_basic.json';raw=z.read(archive_name);w=json.loads(raw)
 (OUT/'bernini_rv2v_basic.original.json').write_bytes(raw)
 result['workflow']={'archive_path':str(ROOT/'example_workflows.zip'),'archive_sha256':hashlib.sha256((ROOT/'example_workflows.zip').read_bytes()).hexdigest(),'entry':archive_name,'entry_sha256':hashlib.sha256(raw).hexdigest(),'node_count':len(w['nodes']),'links_count':len(w['links']),'nodes':[{'id':n['id'],'type':n['type'],'title':n.get('title'),'mode':n.get('mode'),'widgets_values':n.get('widgets_values'),'inputs':[{'name':x['name'],'type':x['type'],'link':x.get('link')} for x in n.get('inputs',[])],'outputs':[{'name':x['name'],'type':x['type'],'links':x.get('links')} for x in n.get('outputs',[])]} for n in w['nodes']],'links':w['links'],'groups':w['groups']}
(OUT/'inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for m in result['models']: print(m['name'],m['tensor_count_by_dtype'],'payload GiB',m['payload_GiB'],'FP32 bytes',m['hypothetical_all_numeric_FP32_bytes'])
print('workflow nodes',len(w['nodes']),'links',len(w['links']))
