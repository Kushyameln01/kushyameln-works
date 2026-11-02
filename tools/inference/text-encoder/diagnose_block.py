#!/usr/bin/env python3
"""One existing UMT5 block versus pinned source; no export or model changes.

The source stage writes one full512 input/hidden/normalized checkpoint. The
native stage runs the unchanged block0 with actual pinned ORT WASM in a fresh
Node process, then compares every hidden and normalized value. These are local
diagnostics, never a replacement for the fixed full24 final-output gate.

block-options is bounded to the existing block19, sourceS18 and sourceS19
checkpoints. It runs ALL first and refuses DISABLED unless the historical ALL
local-output hash reproduces exactly. It never re-exports or reruns the oracle.
The stop-only policy is declared before execution: unless DISABLED halves all
three row0 weighted-norm errors (max, RMS, directional residual) without a larger
global maximum, stop option probing. Even that local difference is not a full24
acceptance result, a gate change or permission to change production arithmetic.
"""
import argparse,base64,gc,hashlib,importlib.util,json,os,re,resource,shutil,struct,subprocess,sys,time
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def record(path):
 p=Path(path);raw=p.read_bytes();return {'path':str(p),'bytes':len(raw),'sha256':sha(raw)}
def stream_record(path):
 p=Path(path);digest=hashlib.sha256();size=0
 with p.open('rb') as stream:
  for chunk in iter(lambda:stream.read(8*1024*1024),b''):digest.update(chunk);size+=len(chunk)
 return {'path':str(p),'bytes':size,'sha256':digest.hexdigest()}

BLOCK19_PINS={
 'manifestSha256':'aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f',
 'graphBytes':771822917,'graphSha256':'7ffb27b53e9006b99c330dfecc209f3f8d06aeaaffb70ceed5df5089fea4e447',
 'inputSha256':'a21ab47ab0f8a50d84609c17e5a2cd66d126e2f1c13ba3685a26279cf0c10cf4',
 'sourceSha256':'1663b842a86dd52883a46073bdcf25882490a98e50c44c85c3a30cb6fe153d8a',
 'allLocalSha256':'fefbdb6e6f8e9543401dba3c3951a0f232380fcc0b4621b9651b7b3880169aa4',
 'normSha256':'31ec55a911ef90efa7cfb36d7f3b004a8652d36979b0b1824dc7c2b335b24a02',
 'rowsSha256':'5b99eaf70d3f41660491abfbbc142293175b2bfb63c442647a617e28c1a93e48',
 'tensorBytes':8388608,'sourceBytes':8388608,'normBytes':16384,'rowsBytes':65536,
}
BLOCK_OPTIONS_CREATION={'executionProviders':['wasm'],'graphOptimizationLevel':'all','extra':{'session':{'disable_prepacking':'1','use_ort_model_bytes_directly':'1'}}}

def block_options_preflight(bundle,reference,native_trace_path,layer_index):
 """Read-only exact selection; verify only this graph and existing checkpoints."""
 if type(layer_index) is not int or layer_index!=19:raise ValueError('This bounded diagnostic accepts block19 only')
 bundle,reference,native_trace_path=Path(bundle),Path(reference),Path(native_trace_path)
 manifest_record=record(bundle/'manifest.json');manifest=json.loads((bundle/'manifest.json').read_text())
 source_path=reference/'trace-source-results.json';source=json.loads(source_path.read_text());native=json.loads(native_trace_path.read_text())
 pins=BLOCK19_PINS
 if manifest_record['sha256']!=pins['manifestSha256'] or manifest.get('modelSha256')!='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68':raise ValueError('Selected original manifest/model mismatch')
 if not source.get('passed') or not source.get('allLayerDigestsMatchOriginalOracle') or not source.get('sourceFinalMatchesOriginalOracle') or source.get('originalOracleExecutionSha')!='5954d48e0fb6df1d6977964fd8a7ba2a242b6eff':raise ValueError('Complete unchanged original5954 source checkpoints required')
 if source.get('selectedNormRows')!=[0,1,255,511] or source.get('manifest',{}).get('sha256')!=pins['manifestSha256']:raise ValueError('Source manifest/normalization row mapping mismatch')
 inp=source['input']
 if inp.get('id')!='id-l512-all-active' or inp.get('shape')!=[1,512,4096] or inp.get('manifestSha256')!=pins['manifestSha256'] or inp.get('attentionMask')!=[1]*512 or len(inp.get('tokenIds',[]))!=512:raise ValueError('Original full512 all-active input required')
 if not native.get('passed') or not native.get('preservedCanaryReproducedBitwise') or native.get('finalFixedGatePassed') is not False or native.get('input')!=inp or native.get('manifest',{}).get('sha256')!=pins['manifestSha256'] or native.get('sourceCheckpointExecutionSha')!=source['executionSourceSha'] or native.get('originalOracleExecutionSha')!=source['originalOracleExecutionSha']:raise ValueError('Unchanged historical native trace and retained failed canary required')
 if native.get('native',{}).get('options')!=BLOCK_OPTIONS_CREATION:raise ValueError('Historical creation options changed')
 if len(source.get('layers',[]))!=24 or len(native['native'].get('layers',[]))!=24:raise ValueError('Complete existing source/native trace required')
 for index,expected in [(18,pins['inputSha256']),(19,pins['sourceSha256'])]:
  layer=source['layers'][index]
  if layer.get('index')!=index or layer.get('hiddenSha256')!=expected or layer.get('matchesOriginalOracle') is not True:raise ValueError('Selected source checkpoint does not match original oracle')
 layer=native['native']['layers'][19]
 if layer.get('index')!=19 or layer.get('graphSha256')!=pins['graphSha256'] or layer.get('input',{}).get('sourceSha256')!=pins['inputSha256'] or layer.get('output',{}).get('sourceSha256')!=pins['sourceSha256'] or layer.get('output',{}).get('localSha256')!=pins['allLocalSha256']:raise ValueError('Historical block19 input/output baseline mismatch')
 block=manifest['blocks'][19]
 if len(manifest['blocks'])!=24 or block.get('index')!=19 or block.get('path')!='block-19.onnx' or block.get('bytes')!=pins['graphBytes'] or block.get('sha256')!=pins['graphSha256']:raise ValueError('Selected block19 manifest record mismatch')
 graph_record=stream_record(bundle/block['path'])
 if graph_record['bytes']!=pins['graphBytes'] or graph_record['sha256']!=pins['graphSha256']:raise ValueError('Selected existing graph bytes/hash mismatch')
 if manifest.get('finalNorm',{}).get('sha256')!=pins['normSha256'] or manifest['finalNorm'].get('epsilon')!=1e-6:raise ValueError('Final normalization identity/epsilon mismatch')
 checkpoints={}
 for name,bytes_key,hash_key in [('source-hidden-18.f32','tensorBytes','inputSha256'),('source-hidden-19.f32','sourceBytes','sourceSha256'),('final-norm.f32','normBytes','normSha256'),('source-norm-rows-19.f32','rowsBytes','rowsSha256')]:
  declared=source['files'].get(name,{});actual=stream_record(reference/name)
  if declared.get('bytes')!=pins[bytes_key] or declared.get('sha256')!=pins[hash_key] or actual['bytes']!=pins[bytes_key] or actual['sha256']!=pins[hash_key]:raise ValueError('Selected source checkpoint bytes/hash mismatch: '+name)
  checkpoints[name]=actual
 return {'layerIndex':19,'input':inp,'manifest':manifest_record,'graph':graph_record,'checkpoints':checkpoints,
  'sourceTrace':record(source_path),'nativeTrace':record(native_trace_path),'sourceCheckpointExecutionSha':source['executionSourceSha'],
  'historicalNativeExecutionSha':native['executionSourceSha'],'originalOracleExecutionSha':source['originalOracleExecutionSha'],
  'expectedAllLocalSha256':pins['allLocalSha256'],'creationOptionsAll':BLOCK_OPTIONS_CREATION,
  'newExports':0,'newSourceRuns':0,'maximumNativeRuns':2,'full24GateReevaluated':False}
def write(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def committed(path,source):
 rel=str(path.relative_to(ROOT));fixed=subprocess.run(['git','show',source+':'+rel],cwd=ROOT,check=True,capture_output=True).stdout
 if fixed!=path.read_bytes():raise ValueError('Source bytes differ from execution commit: '+rel)
 return record(path)
def fresh(path):
 if path.exists():raise FileExistsError('Fresh private output required')
 if path.resolve().is_relative_to(ROOT/'docs'):raise ValueError('Public output prohibited')
 if shutil.disk_usage(path.parent).free<536870912:raise ValueError('At least512MiB free disk required')
 path.mkdir(parents=True)
def metrics(actual,reference,np):
 delta=np.abs(actual.astype(np.float64)-reference.astype(np.float64));scale=max(1.,float(np.max(np.abs(reference))));rms=float(np.sqrt(np.mean(reference.astype(np.float64)**2)))
 row=delta.max(axis=(0,2));top=np.argsort(row)[-5:][::-1]
 return {'finite':bool(np.isfinite(actual).all() and np.isfinite(reference).all()),'elements':int(actual.size),'maxAbsError':float(delta.max()),'rmsError':float(np.sqrt(np.mean(delta**2))),'normalizedPeakError':float(delta.max()/scale),'relativeRmsError':float(np.sqrt(np.mean(delta**2))/max(1.,rms)),'overFixed001':int(np.sum(delta>.001)),'allclose':bool(np.all(delta<=.001+.001*np.abs(reference.astype(np.float64)))),'worstRows':[{'position':int(i),'maxAbsError':float(row[i])}for i in top],'allValuesCompared':True}

NODE_CODE=r'''
import {readFile,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const c=JSON.parse(readFileSync(0,'utf8')),base=c.runtime;
const ort=await import(pathToFileURL(base+'/vendor/ort.wasm.min.mjs').href),{createHike}=await import(pathToFileURL(base+'/hike.mjs').href);
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths={mjs:pathToFileURL(base+'/vendor/ort-wasm-simd-threaded.mjs').href,wasm:pathToFileURL(base+'/vendor/ort-wasm-simd-threaded.wasm').href};
const f32=async path=>{const bytes=await readFile(path);return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=new Uint8Array(await readFile(c.graph)),actualGraphHash=hash(bytes);if(bytes.length!==c.graphRecord.bytes||actualGraphHash!==c.graphRecord.sha256)throw Error('Selected block0 bytes/hash mismatch');
const hidden=await f32(c.reference+'/block0-input.f32'),mask=new Float32Array(c.input.attentionMask),weight=await f32(c.reference+'/final-norm.f32');
const options={executionProviders:['wasm'],graphOptimizationLevel:c.optimization,extra:{session:{disable_prepacking:'1'}}},started=performance.now();
let session,input,maskInput,result,hike;
try{
 session=await ort.InferenceSession.create(bytes,options);const created=performance.now();input=new ort.Tensor('float32',hidden,[1,512,4096]);maskInput=new ort.Tensor('float32',mask,[1,512]);result=await session.run({hidden:input,mask:maskInput});const ran=performance.now(),next=result.hidden_out;
 if(next.type!=='float32'||next.dims.join(',')!=='1,512,4096')throw Error('Wrong block0 output');
 const native=new Float32Array(next.data);await writeFile(c.output+'/native-hidden.f32',new Uint8Array(native.buffer));
 const kernel=new Uint8Array(await readFile(base+'/kernel/tensor.wasm'));if(hash(kernel)!==c.hikeSha256)throw Error('Pinned Hike identity mismatch');hike=await createHike(kernel);
 const normalized=await hike.rmsNorm(native,weight,512,4096,1e-6);for(let row=0;row<512;row++)if(!mask[row])normalized.fill(0,row*4096,(row+1)*4096);
 await writeFile(c.output+'/native-normalized.f32',new Uint8Array(normalized.buffer));
 console.log(JSON.stringify({passed:true,provider:'actual pinned ORT WASM',options,graphSha256:actualGraphHash,shape:next.dims,createSeconds:(created-started)/1000,runSeconds:(ran-created)/1000,hikeStats:hike.stats(),peakRssBytes:process.resourceUsage().maxRSS*1024}));
}finally{for(const tensor of new Set([...Object.values(result??{}),input,maskInput]))tensor?.dispose?.();await session?.release();hike?.dispose();}
'''

SDPA_NODE_CODE=r'''
import {readFile,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const c=JSON.parse(readFileSync(0,'utf8')),base=c.runtime,ort=await import(pathToFileURL(base+'/vendor/ort.wasm.min.mjs').href);
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths={mjs:pathToFileURL(base+'/vendor/ort-wasm-simd-threaded.mjs').href,wasm:pathToFileURL(base+'/vendor/ort-wasm-simd-threaded.wasm').href};
const feeds={};for(const name of ['q','k','v','bias']){const raw=await readFile(c.output+'/capture-'+name+'.f32'),data=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));feeds[name]=new ort.Tensor('float32',data,name==='bias'?[1,64,512,512]:[1,512,4096]);}
let session,result;const started=performance.now();
try{session=await ort.InferenceSession.create(new Uint8Array(Buffer.from(c.graphBase64,'base64')),{executionProviders:['wasm'],graphOptimizationLevel:c.optimization});result=await session.run(feeds);const next=result.attention;if(next.dims.join(',')!=='1,512,4096')throw Error('Unexpected attention shape');await writeFile(c.output+'/'+c.name+'.f32',new Uint8Array(next.data.buffer,next.data.byteOffset,next.data.byteLength));console.log(JSON.stringify({provider:'Node actual pinned ORT WASM',optimization:c.optimization,variant:c.variant,shape:next.dims,wallSeconds:(performance.now()-started)/1000,peakRssBytes:process.resourceUsage().maxRSS*1024}));}
finally{for(const t of [...Object.values(result??{}),...Object.values(feeds)])t.dispose();await session?.release();}
'''

def small_graph(path,onnx):
 """Read actual graph nodes while seeking over large initializer payloads."""
 def integer(f):
  value=0;shift=0
  while True:
   raw=f.read(1)
   if not raw:raise EOFError('Truncated protobuf')
   b=raw[0];value|=(b&127)<<shift
   if b<128:return value
   shift+=7
 def fields(f,end):
  while f.tell()<end:
   start=f.tell();key=integer(f);wire=key&7
   if wire==2:length=integer(f);data=f.tell();finish=data+length
   elif wire==0:data=f.tell();integer(f);finish=f.tell();length=finish-data
   elif wire in [1,5]:data=f.tell();length=8 if wire==1 else 4;finish=data+length
   else:raise ValueError('Unsupported protobuf wire type')
   yield key>>3,start,data,length,finish
   f.seek(finish)
 chunks=[]
 with path.open('rb') as f:
  for field,start,data,length,end in fields(f,path.stat().st_size):
   if field!=7:continue
   f.seek(data)
   for field,start,data,length,end in fields(f,end):
    if field!=5 or length<20000:f.seek(start);chunks.append(f.read(end-start))
   break
 graph=onnx.GraphProto();graph.ParseFromString(b''.join(chunks));return graph

def sdpa_graph(graph,variant,onnx):
 """Existing SDPA lowering, or diagnostic exact unscaled T5 q@k scores."""
 prefix='/block/layer.0/SelfAttention/';names=[node.name for node in graph.node];start=names.index(prefix+'Shape_2');end=names.index(prefix+'MatMul_1');nodes=[]
 replacements={prefix+'q/MatMul_output_0':'q',prefix+'k/MatMul_output_0':'k',prefix+'v/MatMul_output_0':'v',prefix+'Add_3_output_0':'bias'}
 scale_start=names.index(prefix+'Shape_6');scale_end=names.index(prefix+'Mul_4');first_scale_end=names.index(prefix+'Mul_2')
 for index in range(start,end+1):
  original=graph.node[index]
  if variant=='unscaled-t5' and (index<=first_scale_end or scale_start<=index<=scale_end and original.name!=prefix+'Transpose_3'):continue
  node=onnx.NodeProto();node.CopyFrom(original)
  for i,name in enumerate(node.input):node.input[i]=replacements.get(name,name)
  if variant=='unscaled-t5':
   if node.name==prefix+'Reshape_1':node.input[0]='k'
   if node.name==prefix+'MatMul':node.input[0]=prefix+'Transpose_1_output_0';node.input[1]=prefix+'Transpose_3_output_0'
  nodes.append(node)
 nodes.extend([onnx.helper.make_node('Transpose',[graph.node[end].output[0]],['attention-blhd'],perm=[0,2,1,3]),onnx.helper.make_node('Constant',[],['attention-shape'],value=onnx.helper.make_tensor('attention-shape-value',onnx.TensorProto.INT64,[3],[1,512,4096])),onnx.helper.make_node('Reshape',['attention-blhd','attention-shape'],['attention'])])
 inputs=[onnx.helper.make_tensor_value_info(name,onnx.TensorProto.FLOAT,[1,64,512,512] if name=='bias' else [1,512,4096])for name in ['q','k','v','bias']]
 model=onnx.helper.make_model(onnx.helper.make_graph(nodes,'existing-block0-sdpa-'+variant,inputs,[onnx.helper.make_tensor_value_info('attention',onnx.TensorProto.FLOAT,[1,512,4096])]),opset_imports=[onnx.helper.make_opsetid('',17)]);model.ir_version=10;onnx.checker.check_model(model);return model.SerializeToString()

def run_sdpa(a,manifest,inp,source_report,report):
 if not a.model or not a.deps:raise ValueError('SDPA capture needs unchanged original model and existing CPU deps')
 sys.path.insert(0,str(a.deps));import numpy as np,torch,onnx
 from safetensors import safe_open
 from prepare import source_module
 from torch.nn.attention import sdpa_kernel,SDPBackend
 torch.set_num_threads(2);torch.set_num_interop_threads(1);mod,ops,_=source_module(HERE/'pinned-t5.py',torch);initial=a.model.stat()
 if initial.st_size!=manifest['modelBytes']:raise ValueError('Original model size mismatch')
 x=torch.from_numpy(np.fromfile(a.reference/'block0-input.f32',dtype='<f4').reshape(1,512,4096));prefix='encoder.block.0.layer.0.';scales=[]
 def parameter(key):
  with safe_open(str(a.model),framework='pt',device='cpu') as model:
   value=model.get_tensor(key)
   if value.dtype==torch.float8_e4m3fn:
    scale=model.get_tensor(key[:-7]+'.scale_weight');assert scale.dtype==torch.float32 and scale.numel()==1 and bool(torch.isfinite(scale).all()) and float(scale)>0;value=value.float()*scale;scales.append({'key':key[:-7]+'.scale_weight','value':float(scale)})
   else:value=value.float().clone()
   assert bool(torch.isfinite(value).all());return value
 norm=mod.T5LayerNorm(4096,eps=1e-6,dtype=torch.float32,device='meta',operations=ops);norm.load_state_dict({'weight':parameter(prefix+'layer_norm.weight')},strict=True,assign=True)
 with torch.inference_mode():normalized=norm(x)
 captured={}
 for name in ['q','k','v']:
  with torch.device('meta'):linear=torch.nn.Linear(4096,4096,bias=False,dtype=torch.float32,device='meta')
  linear.load_state_dict({'weight':parameter(prefix+'SelfAttention.'+name+'.weight')},strict=True,assign=True)
  with torch.inference_mode():captured[name]=linear(normalized)
  del linear;gc.collect()
 with torch.device('meta'):attention=mod.T5Attention(4096,4096,64,True,torch.float32,'meta',ops)
 attention.relative_attention_bias.load_state_dict({'weight':parameter(prefix+'SelfAttention.relative_attention_bias.weight')},strict=True,assign=True)
 mask=torch.tensor([inp['attentionMask']],dtype=torch.float32);mask=(1-mask).reshape(1,1,1,512).expand(1,1,512,512);mask=mask.masked_fill(mask.bool(),-torch.finfo(torch.float32).max)
 with torch.inference_mode():captured['bias']=mask+attention.compute_bias(512,512,'cpu',torch.float32)
 for name,value in captured.items():value.numpy().astype('<f4').tofile(a.output/('capture-'+name+'.f32'))
 reshape=lambda value:value.reshape(1,512,64,64).transpose(1,2)
 q=reshape(captured['q']);k=reshape(captured['k']*8);v=reshape(captured['v']);bias=captured['bias'];references={};backend_operations=[]
 with torch.inference_mode():
  with torch.profiler.profile(activities=[torch.profiler.ProfilerActivity.CPU]) as profiler:
   references['torch-default']=torch.nn.functional.scaled_dot_product_attention(q,k,v,attn_mask=bias).transpose(1,2).reshape(1,512,4096)
  backend_operations=[event.key for event in profiler.key_averages() if 'scaled_dot_product' in event.key or 'flash_attention' in event.key]
  for label,backend in [('torch-flash',SDPBackend.FLASH_ATTENTION),('torch-math',SDPBackend.MATH)]:
   with sdpa_kernel(backend):references[label]=torch.nn.functional.scaled_dot_product_attention(q,k,v,attn_mask=bias).transpose(1,2).reshape(1,512,4096)
  # FP64 operator probe is a separately labeled accuracy diagnostic, never the
  # selected full-model FP32 oracle. T5's explicit k*8 and SDPA /8 cancel here.
  scores=torch.matmul(reshape(captured['q']).double(),reshape(captured['k']).double().transpose(-2,-1))+bias.double();probability=torch.softmax(scores,dim=-1);references['fp64-unscaled-diagnostic']=torch.matmul(probability,reshape(captured['v']).double()).transpose(1,2).reshape(1,512,4096).float();del scores,probability
 for name,value in references.items():value.numpy().astype('<f4').tofile(a.output/(name+'.f32'))
 reference_arrays={name:value.numpy()for name,value in references.items()};comparisons={name:{reference:metrics(value.numpy(),other,np)for reference,other in reference_arrays.items() if reference!=name}for name,value in references.items()}
 graph=small_graph(a.bundle/manifest['blocks'][0]['path'],onnx);variants={name:sdpa_graph(graph,name,onnx)for name in ['original-lowering','unscaled-t5']};native_observations={}
 for variant,raw in variants.items():
  for optimization in ['all','disabled']:
   name='wasm-'+variant+'-'+optimization;config={'runtime':str(ROOT/'docs/shared/inference'),'output':str(a.output),'graphBase64':base64.b64encode(raw).decode(),'optimization':optimization,'variant':variant,'name':name};native=subprocess.run(['node','--input-type=module','-e',SDPA_NODE_CODE],input=json.dumps(config),text=True,capture_output=True);(a.output/(name+'-stderr.txt')).write_text(native.stderr);native.check_returncode();native_observations[name]=json.loads(native.stdout.strip().splitlines()[-1]);actual=np.fromfile(a.output/(name+'.f32'),dtype='<f4').reshape(1,512,4096);comparisons[name]={reference:metrics(actual,other,np)for reference,other in reference_arrays.items()}
 end=a.model.stat();assert(initial.st_size,initial.st_mtime_ns)==(end.st_size,end.st_mtime_ns)
 report.update(passed=True,sourceCheckpointExecutionSha=source_report['executionSourceSha'],captureScales=scales,torchVersion=torch.__version__,torchDefaultBackendOperations=backend_operations,variants={name:{'bytes':len(raw),'sha256':sha(raw)}for name,raw in variants.items()},variantDefinition={'original-lowering':'Byte-copied existing block0 SDPA nodes including explicit K*8, Q*sqrt(1/8), K*sqrt(1/8), QK+bias, softmax and V','unscaled-t5':'Diagnostic-only same captured Q/K/V+bias with exact real-arithmetic cancellation of K*8 and SDPA scale1/8: softmax(Q@K_raw.T+bias)@V; no product graph or weight file is changed','fp64':'Operator-only double QK/bias/softmax/AV followed by final float32 cast; not the selected source oracle'},wholeSelectedGraphHashRecomputed=False,native=native_observations,comparisons=comparisons,files={path.name:record(path)for path in a.output.glob('*.f32')})

def run_trace_source(a,manifest,inp,expected,oracle,report):
 """One source path, all layer hashes checked against the original oracle."""
 sys.path.insert(0,str(a.deps));import numpy as np,torch
 from safetensors import safe_open
 from prepare import source_module
 torch.set_num_threads(2);torch.set_num_interop_threads(1);mod,ops,attend=source_module(HERE/'pinned-t5.py',torch);config=json.loads((HERE/'pinned-umt5-config.json').read_text());initial=a.model.stat()
 with a.model.open('rb') as f:
  hlen=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(hlen));embedding=header['shared.weight'];assert embedding['dtype']=='F16' and embedding['shape']==[256384,4096];cache={}
  for token in set(inp['tokenIds']):f.seek(8+hlen+embedding['data_offsets'][0]+token*8192);cache[token]=np.frombuffer(f.read(8192),dtype='<f2').astype(np.float32)
 x=torch.from_numpy(np.stack([cache[token]for token in inp['tokenIds']])[None]);del cache;x.numpy().astype('<f4').tofile(a.output/'block0-input.f32');attention=torch.tensor([inp['attentionMask']],dtype=torch.float32);mask=(1-attention).reshape(1,1,1,512).expand(1,1,512,512);mask=mask.masked_fill(mask.bool(),-torch.finfo(torch.float32).max)
 with safe_open(str(a.model),framework='pt',device='cpu') as model:
  weight=model.get_tensor('encoder.final_layer_norm.weight').float().clone();original_keys=set(model.keys());assert sha(model.get_tensor('spiece_model').numpy().tobytes())==manifest['tokenizer']['sha256']
 weight.numpy().astype('<f4').tofile(a.output/'final-norm.f32');assert record(a.output/'final-norm.f32')['sha256']==manifest['finalNorm']['sha256'];norm=mod.T5LayerNorm(4096,eps=1e-6,dtype=torch.float32,device='meta',operations=ops);norm.load_state_dict({'weight':weight},strict=True,assign=True);used={'shared.weight','spiece_model','scaled_fp8','encoder.final_layer_norm.weight'};past_bias=None;layers=[];files={name:record(a.output/name)for name in ['block0-input.f32','final-norm.f32']};selected_rows=[0,1,255,511]
 for index in range(24):
  begun=time.monotonic();prefix=f'encoder.block.{index}.';state={};scales=[]
  with safe_open(str(a.model),framework='pt',device='cpu') as model:
   for key in model.keys():
    if not key.startswith(prefix):continue
    used.add(key)
    if key.endswith('.scale_weight'):continue
    value=model.get_tensor(key)
    if value.dtype==torch.float8_e4m3fn:
     scale=model.get_tensor(key[:-7]+'.scale_weight');assert scale.dtype==torch.float32 and scale.numel()==1 and bool(torch.isfinite(scale).all()) and float(scale)>0;value=value.float()*scale;scales.append({'key':key[:-7]+'.scale_weight','value':float(scale)});del scale
    else:value=value.float()
    assert bool(torch.isfinite(value).all());state[key[len(prefix):]]=value
  with torch.device('meta'):block=mod.T5Block(4096,4096,10240,config['dense_act_fn'],True,64,True,torch.float32,'meta',ops)
  strict=block.load_state_dict(state,strict=True,assign=True);del state;block.eval()
  with torch.inference_mode():x,past_bias=block(x,mask,past_bias,attend)
  assert list(x.shape)==[1,512,4096] and bool(torch.isfinite(x).all());hidden=x.numpy().astype('<f4');digest=sha(hidden.tobytes())
  if digest!=expected['layers'][index]['hiddenSha256']:raise ValueError(f'Source layer{index} differs from original oracle; stop before continuing')
  name=f'source-hidden-{index:02}.f32';hidden.tofile(a.output/name);files[name]=record(a.output/name)
  with torch.inference_mode():normalized=(norm(x)*attention[...,None]).numpy().astype('<f4')
  name=f'source-norm-rows-{index:02}.f32';normalized[:,selected_rows,:].copy().tofile(a.output/name);files[name]=record(a.output/name)
  row_stats=[{'position':row,'hiddenRms':float(np.sqrt(np.mean(hidden[0,row].astype(np.float64)**2))),'hiddenMaxAbs':float(np.max(np.abs(hidden[0,row]))),'weightedNormRms':float(np.sqrt(np.mean(normalized[0,row].astype(np.float64)**2)))}for row in selected_rows]
  layers.append({'index':index,'shape':[1,512,4096],'hiddenSha256':digest,'matchesOriginalOracle':True,'strictMissing':strict.missing_keys,'strictUnexpected':strict.unexpected_keys,'scales':scales,'rows':row_stats,'seconds':time.monotonic()-begun});del block,value,hidden;gc.collect();print(json.dumps({'phase':'trace-source','completed':index+1,'total':24,'matchesOriginalOracle':True}),flush=True)
 normalized.tofile(a.output/'source-final-normalized.f32');files['source-final-normalized.f32']=record(a.output/'source-final-normalized.f32')
 if files['source-final-normalized.f32']['sha256']!=expected['reference']['sha256']:raise ValueError('Final source output differs from original oracle')
 assert not original_keys-used,original_keys-used;end=a.model.stat();assert(initial.st_size,initial.st_mtime_ns)==(end.st_size,end.st_mtime_ns)
 report.update(passed=True,scope='One full512 source path with exact original oracle hash checks at every layer; diagnostics only',layers=layers,files=files,sourceBlocksLoaded=24,sourceKeysCovered=len(used),originalOracleExecutionSha=oracle['executionSourceSha'],originalOracleReport=record(a.oracle_report),originalOracleReference=expected['reference'],selectedNormRows=selected_rows,allLayerDigestsMatchOriginalOracle=True,sourceFinalMatchesOriginalOracle=True,torchVersion=torch.__version__,peakSelfRssBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024)

TRACE_NODE_CODE=r'''
// Diagnostic executor only. Invoked by the source-pinned Python parent.
// No full-model arrays or sessions are retained across layer boundaries.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';

const c=JSON.parse(readFileSync(0,'utf8'));
const ROWS=512,COLUMNS=4096,ELEMENTS=ROWS*COLUMNS,SELECTED_ROWS=[0,1,255,511];
const check=(ok,message)=>{if(!ok)throw Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const view=values=>new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
const tensorHash=values=>hash(view(values));
const u8file=async path=>{const raw=await readFile(path);return new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);};
const fileRecord=async path=>{const raw=await readFile(path);return{path,bytes:raw.byteLength,sha256:hash(raw)};};
const f32=async(path,elements)=>{
 const raw=await readFile(path);
 check(raw.byteLength===elements*4,'Unexpected checkpoint length: '+path);
 const values=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
 finite(values,path);return values;
};
function finite(values,label){
 check(values instanceof Float32Array,'Expected float32 '+label);
 for(let i=0;i<values.length;i++)if(!Number.isFinite(values[i]))throw Error('Nonfinite '+label+' element '+i);
}
function metrics(actual,reference){
 check(actual.length===reference.length&&actual.length>0,'Comparison shape mismatch');
 let maximum=0,squared=0,referenceSquared=0,referencePeak=0,overFixed001=0,allclose=true;
 let rowMaximum=0,rowSquared=0,rowReferenceSquared=0,rowActualSquared=0,rowDot=0;
 for(let i=0;i<actual.length;i++){
  const a=actual[i],r=reference[i];if(!Number.isFinite(a)||!Number.isFinite(r))throw Error('Nonfinite comparison element '+i);
  const delta=Math.abs(a-r);maximum=Math.max(maximum,delta);squared+=delta*delta;
  referenceSquared+=r*r;referencePeak=Math.max(referencePeak,Math.abs(r));
  if(delta>.001)overFixed001++;if(delta>.001+.001*Math.abs(r))allclose=false;
  if(i<COLUMNS){rowMaximum=Math.max(rowMaximum,delta);rowSquared+=delta*delta;rowReferenceSquared+=r*r;rowActualSquared+=a*a;rowDot+=a*r;}
 }
 const rowLength=Math.min(COLUMNS,actual.length),alpha=rowReferenceSquared===0?null:rowDot/rowReferenceSquared;
 let residualMaximum=0,residualSquared=0,signChanges=0;
 for(let i=0;i<rowLength;i++){
  const residual=alpha===null?actual[i]:actual[i]-alpha*reference[i];
  residualMaximum=Math.max(residualMaximum,Math.abs(residual));residualSquared+=residual*residual;
  if(actual[i]!==0&&reference[i]!==0&&Math.sign(actual[i])!==Math.sign(reference[i]))signChanges++;
 }
 const rmsError=Math.sqrt(squared/actual.length),referenceRms=Math.sqrt(referenceSquared/actual.length);
 return{finite:true,elements:actual.length,maxAbsError:maximum,rmsError,referencePeak,referenceRms,
  normalizedPeakError:maximum/Math.max(1,referencePeak),relativeRmsError:rmsError/Math.max(1,referenceRms),
  overFixed001,allclose,allValuesCompared:true,
  row0:{maxAbsError:rowMaximum,rmsError:Math.sqrt(rowSquared/rowLength),bestScalar:alpha,
   directionalResidualMaxAbs:residualMaximum,directionalResidualRms:Math.sqrt(residualSquared/rowLength),
   normRatio:rowReferenceSquared===0?null:Math.sqrt(rowActualSquared/rowReferenceSquared),signChanges}};
}
function selected(values){
 const out=new Float32Array(SELECTED_ROWS.length*COLUMNS);
 for(let i=0;i<SELECTED_ROWS.length;i++)out.set(values.subarray(SELECTED_ROWS[i]*COLUMNS,(SELECTED_ROWS[i]+1)*COLUMNS),i*COLUMNS);
 return out;
}
const maskedNorm=(hike,values,weight,mask,epsilon)=>{
 const output=hike.rmsNorm(values,weight,ROWS,COLUMNS,epsilon);
 check(output instanceof Float32Array&&output.length===ELEMENTS,'Unexpected Hike normalization shape');
 for(let row=0;row<ROWS;row++)if(mask[row]===0)output.fill(0,row*COLUMNS,(row+1)*COLUMNS);
 finite(output,'Hike normalized output');return output;
};

check(c.manifest?.blocks?.length===24,'Exactly24 manifest blocks required');
check(c.optimization==='all'||c.optimization==='disabled','Explicit supported ORT optimization required');
check(c.manifest.finalNorm?.epsilon===1e-6,'Unchanged final RMSNorm epsilon required');
const mask=Array.from(c.input?.attentionMask??[]);
check(mask.length===ROWS&&mask.every(v=>v===0||v===1)&&mask.includes(1),'Full512 nonempty binary mask required');
const keep=new Set(c.keepLayers??[0,7,15,23]);for(const i of keep)check(Number.isInteger(i)&&i>=0&&i<24,'Invalid retained layer');
check((await stat(c.output)).isDirectory(),'Parent must create fresh private output directory');
const base=resolve(c.runtime),ort=await import(pathToFileURL(join(base,'vendor/ort.wasm.min.mjs')).href),{createHike}=await import(pathToFileURL(join(base,'hike.mjs')).href);
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths={mjs:pathToFileURL(join(base,'vendor/ort-wasm-simd-threaded.mjs')).href,wasm:pathToFileURL(join(base,'vendor/ort-wasm-simd-threaded.wasm')).href};
const options={executionProviders:['wasm'],graphOptimizationLevel:c.optimization,extra:{session:{disable_prepacking:'1'}}};
const counts={sessionsCreated:0,sessionsReleased:0,activeSessions:0,maximumActiveSessions:0,runCalls:0,tensorDisposeCalls:0};
const report={passed:false,scope:'Sequential native Text diagnostics against frozen per-layer source checkpoints; fixed full24 final gate unchanged',actualProvider:'Node actual pinned ORT WASM',options,shape:[1,ROWS,COLUMNS],selectedRows:SELECTED_ROWS,layers:[],counts,files:[],newExports:0};
const started=performance.now();let hike,session,nativePrevious,sourcePrevious,weight,finalNativeNormalized;
async function infer(hidden,label){
 finite(hidden,label+' input');check(hidden.length===ELEMENTS,'Unexpected native input length');
 let hiddenInput,maskInput,result;
 try{
  hiddenInput=new ort.Tensor('float32',hidden,[1,ROWS,COLUMNS]);maskInput=new ort.Tensor('float32',Float32Array.from(mask),[1,ROWS]);
  counts.runCalls++;result=await session.run({hidden:hiddenInput,mask:maskInput});
  const output=result.hidden_out;
  check(output?.type==='float32'&&output.dims.join(',')==='1,512,4096'&&output.data.length===ELEMENTS,'Unexpected native block output');
  const copy=new Float32Array(output.data);finite(copy,label+' output');return copy;
 }finally{
  for(const tensor of new Set([...Object.values(result??{}),hiddenInput,maskInput]))if(tensor){tensor.dispose();counts.tensorDisposeCalls++;}
 }
}
try{
 let kernel=await u8file(join(base,'kernel/tensor.wasm'));
 check(hash(kernel)==='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8','Pinned Hike kernel hash mismatch');
 hike=await createHike(kernel);kernel=null;
 weight=await f32(join(c.reference,'final-norm.f32'),COLUMNS);
 if(c.manifest.finalNorm.sha256)check(tensorHash(weight)===c.manifest.finalNorm.sha256,'Final norm checkpoint hash mismatch');
 sourcePrevious=await f32(join(c.reference,'block0-input.f32'),ELEMENTS);nativePrevious=sourcePrevious;
 for(let i=0;i<24;i++){
  const number=String(i).padStart(2,'0'),block=c.manifest.blocks[i],layerStarted=performance.now();
  check(block.index===i,'Manifest block index mismatch');
  let graphBytes=await u8file(join(c.bundle,block.path));
  const graphSha256=hash(graphBytes);check(graphBytes.byteLength===block.bytes&&graphSha256===block.sha256,'Graph byte/hash mismatch at layer '+i);
  session=await ort.InferenceSession.create(graphBytes,options);graphBytes=null;
  counts.sessionsCreated++;counts.activeSessions++;counts.maximumActiveSessions=Math.max(counts.maximumActiveSessions,counts.activeSessions);
  let nativeCurrent,localCurrent,sourceCurrent,nativeNorm,localNorm,sourceNorm,torchRows,layer;
  const createEnd=performance.now();
  try{
   nativeCurrent=await infer(nativePrevious,'native-chain layer '+i);
   localCurrent=i===0?nativeCurrent:await infer(sourcePrevious,'same-source-input layer '+i);
   sourceCurrent=await f32(join(c.reference,'source-hidden-'+number+'.f32'),ELEMENTS);
   nativeNorm=maskedNorm(hike,nativeCurrent,weight,mask,c.manifest.finalNorm.epsilon);
   sourceNorm=maskedNorm(hike,sourceCurrent,weight,mask,c.manifest.finalNorm.epsilon);
   localNorm=maskedNorm(hike,localCurrent,weight,mask,c.manifest.finalNorm.epsilon);
   torchRows=await f32(join(c.reference,'source-norm-rows-'+number+'.f32'),SELECTED_ROWS.length*COLUMNS);
   layer={index:i,shape:[1,ROWS,COLUMNS],finite:true,graphSha256,
    input:{nativeSha256:tensorHash(nativePrevious),sourceSha256:tensorHash(sourcePrevious)},
    output:{nativeSha256:tensorHash(nativeCurrent),localSha256:tensorHash(localCurrent),sourceSha256:tensorHash(sourceCurrent)},
    raw:{total:metrics(nativeCurrent,sourceCurrent),local:metrics(localCurrent,sourceCurrent),propagated:metrics(nativeCurrent,localCurrent)},
    weightedNorm:{total:metrics(nativeNorm,sourceNorm),local:metrics(localNorm,sourceNorm),propagated:metrics(nativeNorm,localNorm)},
    hikeVsTorchSourceNormRows:metrics(selected(sourceNorm),torchRows),
    seconds:{create:(createEnd-layerStarted)/1000,total:(performance.now()-layerStarted)/1000},counts:{...counts},hikeStats:hike.stats()};
   if(keep.has(i)){
    const path=join(c.output,'native-hidden-'+number+'.f32');await writeFile(path,view(nativeCurrent));report.files.push(await fileRecord(path));
   }
   if(i===23){finalNativeNormalized=nativeNorm;const path=join(c.output,'native-final-normalized.f32');await writeFile(path,view(finalNativeNormalized));report.files.push(await fileRecord(path));}
   report.layers.push(layer);
   nativePrevious=nativeCurrent;sourcePrevious=sourceCurrent;
   console.log(JSON.stringify({phase:'native-trace',completed:i+1,total:24,runCalls:counts.runCalls,rawMaxAbsError:layer.raw.total.maxAbsError,localMaxAbsError:layer.raw.local.maxAbsError,normMaxAbsError:layer.weightedNorm.total.maxAbsError,seconds:(performance.now()-started)/1000,peakRssBytes:process.resourceUsage().maxRSS*1024}));
  }finally{
   // ORT owns no result/input tensors beyond infer(). Release this block before
   // any subsequent graph is read. Retain only the next native/source states.
   localCurrent=null;nativeNorm=null;localNorm=null;sourceNorm=null;torchRows=null;
   const current=session;session=null;await current.release();counts.sessionsReleased++;counts.activeSessions--;if(layer)layer.counts={...counts};
  }
 }
 check(counts.sessionsCreated===24&&counts.sessionsReleased===24&&counts.activeSessions===0&&counts.maximumActiveSessions===1&&counts.runCalls===47&&counts.tensorDisposeCalls===141,'Unexpected actual session/tensor lifetime counts');
 const sourceFinal=await f32(join(c.reference,'source-final-normalized.f32'),ELEMENTS);
 const finalComparison=metrics(finalNativeNormalized,sourceFinal);
 finalComparison.paddingExactlyZero=true;
 for(let row=0;row<ROWS;row++)if(mask[row]===0)for(let column=0;column<COLUMNS;column++)if(finalNativeNormalized[row*COLUMNS+column]!==0||sourceFinal[row*COLUMNS+column]!==0)finalComparison.paddingExactlyZero=false;
 finalComparison.gate={maxAbsError:.001,atol:.001,rtol:.001};
 finalComparison.passed=finalComparison.finite&&finalComparison.maxAbsError<=.001&&finalComparison.allclose&&finalComparison.paddingExactlyZero;
 report.finalComparisonVsSourceTorch=finalComparison;report.finalFixedGatePassed=finalComparison.passed;
 report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};throw error;
}finally{
 if(session){const current=session;session=null;await current.release();counts.sessionsReleased++;counts.activeSessions--;}
 report.wallSeconds=(performance.now()-started)/1000;report.peakRssBytes=process.resourceUsage().maxRSS*1024;
 report.hikeStats=hike?.stats()??null;hike?.dispose();
 await writeFile(join(c.output,'native-trace-results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
'''

def run_trace_native(a,manifest,inp,source_report,report):
 import numpy as np
 keep=[int(value)for value in a.keep_layers.split(',')]
 if not keep or len(set(keep))!=len(keep) or any(not 0<=value<24 for value in keep):raise ValueError('Distinct retained layer indices0..23 required')
 if source_report['selectedNormRows']!=[0,1,255,511]:raise ValueError('Trace normalized row mapping mismatch')
 config={'runtime':str(ROOT/'docs/shared/inference'),'bundle':str(a.bundle),'reference':str(a.reference),'output':str(a.output),'manifest':manifest,'input':inp,'optimization':a.optimization,'keepLayers':keep}
 last=None
 with (a.output/'trace-stdout.txt').open('w') as stdout,(a.output/'trace-stderr.txt').open('w') as stderr:
  process=subprocess.Popen(['node','--input-type=module','-e',TRACE_NODE_CODE],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,text=True)
  process.stdin.write(json.dumps(config));process.stdin.close()
  for line in process.stdout:
   stdout.write(line);stdout.flush()
   if line.strip():
    last=line
    if json.loads(line).get('phase')=='native-trace':print(line.strip(),flush=True)
  code=process.wait()
  if code:raise subprocess.CalledProcessError(code,process.args)
 native=json.loads(last);assert native['passed'] and len(native['layers'])==24
 report.update(passed=True,scope='One unchanged Node ORT WASM24-block path plus same-source local feeds; diagnosis only, original final gate unchanged',sourceCheckpointExecutionSha=source_report['executionSourceSha'],originalOracleExecutionSha=source_report['originalOracleExecutionSha'],native=native,selectedNativeLayers=keep,finalFixedGatePassed=native['finalFixedGatePassed'],finalComparisonVsSourceTorch=native['finalComparisonVsSourceTorch'],files={path.name:record(path)for path in a.output.glob('*.f32')})
 if a.failed_output:
  from plain_checks import unpack_tensor
  meta,failed=unpack_tensor(a.failed_output.read_bytes());assert meta['modelSha256']==manifest['modelSha256'] and meta['attentionMask']==inp['attentionMask'];actual=np.fromfile(a.output/'native-final-normalized.f32',dtype='<f4').reshape(1,512,4096)
  report['comparisonToPreservedFailedCanary']=metrics(actual,failed,np);report['preservedCanaryReproducedBitwise']=sha(actual.tobytes())==meta['dataSha256'];report['preservedFailedCanary']=record(a.failed_output)

# Reuse the existing all-value/directional metrics and actual Hike normalization
# helpers, but none of the24-layer executor body.
_TRACE_BODY_START="check(c.manifest?.blocks?.length===24"
if _TRACE_BODY_START not in TRACE_NODE_CODE:raise RuntimeError('Trace helper boundary changed; review the bounded diagnostic')
BLOCK_OPTIONS_NODE_CODE=TRACE_NODE_CODE.split(_TRACE_BODY_START,1)[0]+r'''
check(c.selection?.layerIndex===19&&c.selection?.maximumNativeRuns===2,'Bounded block19 selection required');
check(c.selection.creationOptionsAll?.graphOptimizationLevel==='all','Historical ALL baseline required');
const mask=Array.from(c.selection.input.attentionMask);check(mask.length===ROWS&&mask.every(value=>value===1),'Original all-active512 mask required');
const base=resolve(c.runtime),ort=await import(pathToFileURL(join(base,'vendor/ort.wasm.min.mjs')).href),{createHike}=await import(pathToFileURL(join(base,'hike.mjs')).href);
check(ort.env.versions?.web==='1.24.3','Pinned ORT1.24.3 required');
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths={mjs:pathToFileURL(join(base,'vendor/ort-wasm-simd-threaded.mjs')).href,wasm:pathToFileURL(join(base,'vendor/ort-wasm-simd-threaded.wasm')).href};
const counts={createAttempts:0,sessionsCreated:0,sessionsReleased:0,activeSessions:0,maximumActiveSessions:0,runCalls:0,tensorsCreated:0,tensorDisposeCalls:0,tensorDisposeErrors:0,releaseCalls:0,releaseErrors:0};
const report={passed:false,scope:'Existing block19 only, identical independent sourceS18 feed, actual CPU WASM ALL then DISABLED; no full24 acceptance',
 nodePid:process.pid,parentPid:process.ppid,startedAtEpochMs:Date.now(),executionProvider:'wasm',threads:1,executionDtype:'float32',variants:[],counts,baselineAllReproduced:false,newExports:0,newSourceRuns:0,full24GateReevaluated:false,full24Acceptance:false,
 weightedNormReference:'Same pinned Hike final norm on the full independent raw sourceS19; separate four-row Torch-normalization evidence',
 stopPolicy:'Stop unless DISABLED halves row0 weighted-norm maxAbs, RMS and directional residual versus ALL without a larger global maxAbs. This is a predeclared diagnostic stop rule, not a replacement numerical gate.'};
const started=performance.now();let session,hike;
async function closeSession(){
 if(!session)return;const current=session;session=null;counts.releaseCalls++;
 try{await current.release();counts.sessionsReleased++;counts.activeSessions--;}
 catch(error){counts.releaseErrors++;throw error;}
}
try{
 const input=await f32(join(c.reference,'source-hidden-18.f32'),ELEMENTS),source=await f32(join(c.reference,'source-hidden-19.f32'),ELEMENTS),weight=await f32(join(c.reference,'final-norm.f32'),COLUMNS),torchRows=await f32(join(c.reference,'source-norm-rows-19.f32'),SELECTED_ROWS.length*COLUMNS);
 for(const [name,value]of [['source-hidden-18.f32',input],['source-hidden-19.f32',source],['final-norm.f32',weight],['source-norm-rows-19.f32',torchRows]])check(tensorHash(value)===c.selection.checkpoints[name].sha256,'Checkpoint changed after preflight: '+name);
 const graphBytes=await u8file(c.selection.graph.path);check(graphBytes.byteLength===c.selection.graph.bytes&&hash(graphBytes)===c.selection.graph.sha256,'Selected graph changed after preflight');
 const kernel=await u8file(join(base,'kernel/tensor.wasm'));check(hash(kernel)==='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8','Pinned Hike kernel identity mismatch');hike=await createHike(kernel);
 const sourceNorm=maskedNorm(hike,source,weight,mask,1e-6);report.hikeVsTorchSourceNormRows=metrics(selected(sourceNorm),torchRows);
 const retained=[];
 for(const optimization of ['all','disabled']){
  if(optimization==='disabled')check(report.baselineAllReproduced,'Do not run DISABLED without the historical ALL hash');
  const inputSha256=tensorHash(input);check(inputSha256===c.selection.checkpoints['source-hidden-18.f32'].sha256,'Independent source input changed before execution');
  const graphSha256=hash(graphBytes);check(graphSha256===c.selection.graph.sha256,'Selected graph changed before native execution');
  const options=structuredClone(c.selection.creationOptionsAll);options.graphOptimizationLevel=optimization;
  check(options.extra?.session?.disable_prepacking==='1'&&options.extra?.session?.use_ort_model_bytes_directly==='1','Historical creation options must remain fixed');
  let hiddenInput,maskInput,result,native;const begun=performance.now();
  try{
   counts.createAttempts++;session=await ort.InferenceSession.create(graphBytes,options);counts.sessionsCreated++;counts.activeSessions++;counts.maximumActiveSessions=Math.max(counts.maximumActiveSessions,counts.activeSessions);
   check(ort.env.wasm.numThreads===1,'Runtime changed requested threads1');
   hiddenInput=new ort.Tensor('float32',input,[1,ROWS,COLUMNS]);counts.tensorsCreated++;maskInput=new ort.Tensor('float32',Float32Array.from(mask),[1,ROWS]);counts.tensorsCreated++;
   counts.runCalls++;result=await session.run({hidden:hiddenInput,mask:maskInput});counts.tensorsCreated+=Object.keys(result??{}).length;
   const output=result?.hidden_out;check(output?.type==='float32'&&output.dims.join(',')==='1,512,4096'&&output.data.length===ELEMENTS,'Unexpected native block19 output');
   native=new Float32Array(output.data);finite(native,'Block19 '+optimization);
  }finally{
   let cleanupError;
   for(const tensor of new Set([...Object.values(result??{}),hiddenInput,maskInput]))if(tensor){
    counts.tensorDisposeCalls++;try{tensor.dispose();}catch(error){counts.tensorDisposeErrors++;cleanupError??=error;}
   }
   try{await closeSession();}catch(error){cleanupError??=error;}
   if(cleanupError)throw cleanupError;
  }
  check(tensorHash(input)===inputSha256,'Independent source input changed during native execution');
  check(hash(graphBytes)===graphSha256,'Selected graph changed during native execution');
  const hiddenPath=join(c.output,optimization+'-hidden.f32');await writeFile(hiddenPath,view(native));const actualHash=tensorHash(native);
  if(optimization==='all'){
   report.actualAllLocalSha256=actualHash;report.baselineAllReproduced=actualHash===c.selection.expectedAllLocalSha256;
   check(report.baselineAllReproduced,'Historical ALL local-output hash did not reproduce; DISABLED must not execute');
  }
  const normalized=maskedNorm(hike,native,weight,mask,1e-6),normPath=join(c.output,optimization+'-normalized.f32');await writeFile(normPath,view(normalized));
  report.variants.push({optimization,options,inputSha256,inputPreserved:true,graphSha256,graphUnchanged:true,raw:metrics(native,source),weightedNorm:metrics(normalized,sourceNorm),
   hiddenArtifact:await fileRecord(hiddenPath),normalizedArtifact:await fileRecord(normPath),wallSeconds:(performance.now()-begun)/1000});
  retained.push({native,normalized});
  console.log(JSON.stringify({phase:'block-options',completed:report.variants.length,total:2,optimization,baselineAllReproduced:report.baselineAllReproduced,row0WeightedNorm:report.variants.at(-1).weightedNorm.row0}));
 }
 const before=report.variants[0].weightedNorm,after=report.variants[1].weightedNorm,fields=['maxAbsError','rmsError','directionalResidualMaxAbs'];
 const ratios=Object.fromEntries(fields.map(key=>[key,before.row0[key]>0?after.row0[key]/before.row0[key]:null]));
 const material=fields.every(key=>before.row0[key]>0&&after.row0[key]<=before.row0[key]/2)&&after.maxAbsError<=before.maxAbsError;
 report.triage={outcome:material?'MATERIAL_LOCAL_DIFFERENCE_ONLY':'STOP_MARGINAL_LOCAL_DIFFERENCE',row0ErrorRatiosDisabledOverAll:ratios,
  globalMaximumDidNotIncrease:after.maxAbsError<=before.maxAbsError,productionChangeAuthorizedByDiagnostic:false,
  nextAction:material?'Review this local difference; full24 gate has not been reevaluated. No automatic further run.':'Stop optimization probing and retain the existing failed full24 case.'};
 report.disabledVersusAll={raw:metrics(retained[1].native,retained[0].native),weightedNorm:metrics(retained[1].normalized,retained[0].normalized)};
 check(counts.sessionsCreated===2&&counts.sessionsReleased===2&&counts.activeSessions===0&&counts.maximumActiveSessions===1&&counts.runCalls===2&&counts.tensorsCreated===6&&counts.tensorDisposeCalls===6&&!counts.tensorDisposeErrors&&!counts.releaseErrors,'Unexpected native resource lifetime counts');
 report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 try{await closeSession();}catch(error){report.passed=false;report.failure??={name:error.name,message:error.message};process.exitCode=1;}
 try{hike?.dispose();}catch(error){report.passed=false;report.failure??={name:error.name,message:error.message};process.exitCode=1;}
 report.wallSeconds=(performance.now()-started)/1000;report.peakRssBytes=process.resourceUsage().maxRSS*1024;
 await writeFile(join(c.output,'native-option-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
'''

def run_block_options(a,selection,report):
 config={'runtime':str(ROOT/'docs/shared/inference'),'reference':str(a.reference),'output':str(a.output),'selection':selection}
 native=subprocess.run(['node','--input-type=module','-e',BLOCK_OPTIONS_NODE_CODE],input=json.dumps(config),text=True,capture_output=True)
 (a.output/'native-options-stdout.txt').write_text(native.stdout);(a.output/'native-options-stderr.txt').write_text(native.stderr)
 path=a.output/'native-option-results.json'
 if path.exists():report['native']=json.loads(path.read_text())
 report['files']={path.name:stream_record(path)for path in a.output.glob('*.f32')}
 native.check_returncode()
 if not report.get('native',{}).get('passed') or not report['native'].get('baselineAllReproduced'):raise ValueError('Bounded native diagnostic did not complete its fixed baseline contract')
 report.update(passed=True,scope='Completed local block19 option comparison only; retained full24 failure and fixed final gate unchanged',triage=report['native']['triage'],full24Acceptance=False,newSourceRuns=0,newExports=0)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('stage',choices=['source','native','sdpa','trace-source','trace-native','block-options']);p.add_argument('--bundle',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--execution-source-sha',required=True);p.add_argument('--preflight-only',action='store_true');p.add_argument('--model',type=Path);p.add_argument('--inputs',type=Path);p.add_argument('--case-id',default='id-l512-all-active');p.add_argument('--deps',type=Path);p.add_argument('--reference',type=Path);p.add_argument('--optimization',choices=['all','disabled'],default='all');p.add_argument('--oracle-report',type=Path);p.add_argument('--failed-output',type=Path);p.add_argument('--keep-layers',default='0,7,15,23');p.add_argument('--layer-index',type=int,default=19);p.add_argument('--native-trace-report',type=Path);a=p.parse_args()
 if not re.fullmatch('[0-9a-f]{40}',a.execution_source_sha):raise ValueError('Full committed execution source required')
 manifest=json.loads((a.bundle/'manifest.json').read_text());source_files=[Path(__file__),HERE/'prepare.py',HERE/'plain_checks.py',HERE/'pinned-t5.py',HERE/'pinned-umt5-config.json']
 if a.stage in ['native','sdpa','trace-native','block-options']:source_files.extend(ROOT/'docs/shared/inference'/name for name in ['hike.mjs','vendor/ort.wasm.min.mjs','vendor/ort-wasm-simd-threaded.mjs','vendor/ort-wasm-simd-threaded.wasm','kernel/tensor.wasm'])
 closure=[committed(path,a.execution_source_sha)for path in source_files]
 if a.stage=='block-options':
  if not a.reference or not a.native_trace_report:raise ValueError('block-options needs existing source reference and native trace report')
  if a.optimization!='all':raise ValueError('block-options always runs the fixed ALL baseline then DISABLED; no option override')
  selection=block_options_preflight(a.bundle,a.reference,a.native_trace_report,a.layer_index);inp=selection['input']
 elif a.stage in ['source','trace-source']:
  if not a.model or not a.inputs or not a.deps:raise ValueError('Source stage needs model, inputs and existing CPU deps')
  inp=next(case for case in json.loads(a.inputs.read_text())['inputs'] if case['id']==a.case_id)
  if inp['shape']!=[1,512,4096] or len(inp['tokenIds'])!=512 or len(inp['attentionMask'])!=512:raise ValueError('Full512 diagnostic input required')
  if a.model.stat().st_size!=manifest['modelBytes'] or inp['modelSha256']!=manifest['modelSha256'] or inp['manifestSha256']!=sha((a.bundle/'manifest.json').read_bytes()):raise ValueError('Selected input/model/manifest mismatch')
  if a.stage=='trace-source':
   if not a.oracle_report:raise ValueError('Trace source requires original full oracle report')
   oracle=json.loads(a.oracle_report.read_text());expected=next(case for case in oracle['cases'] if case['id']==a.case_id)
   if not oracle['passed'] or expected['input']!=inp or len(expected['layers'])!=24 or any(layer['index']!=i or layer['shape']!=[1,512,4096] for i,layer in enumerate(expected['layers'])):raise ValueError('Original full512 oracle/case/layer evidence required')
 else:
  if not a.reference:raise ValueError('Native stage needs source checkpoint reference')
  source_report=json.loads((a.reference/('trace-source-results.json' if a.stage=='trace-native' else 'source-results.json')).read_text());inp=source_report['input']
  if not source_report['passed'] or source_report['manifest']['sha256']!=sha((a.bundle/'manifest.json').read_bytes()):raise ValueError('Complete matching source checkpoint required')
  if a.stage=='trace-native' and (not source_report.get('allLayerDigestsMatchOriginalOracle') or not source_report.get('sourceFinalMatchesOriginalOracle')):raise ValueError('Trace source must match every original oracle layer and final value')
  for name in source_report['files'] if a.stage=='trace-native' else ['block0-input.f32','block0-source-hidden.f32','block0-source-normalized.f32','final-norm.f32']:
   if record(a.reference/name)['sha256']!=source_report['files'][name]['sha256']:raise ValueError('Source checkpoint changed: '+name)
 if a.preflight_only:
  result={'passed':True,'stage':a.stage,'caseId':inp['id'],'newNeuralRuns':0,'sourceClosure':closure}
  if a.stage=='block-options':result['selection']={key:value for key,value in selection.items() if key!='input'}
  print(json.dumps(result));return 0
 fresh(a.output);started=time.monotonic();report={'passed':False,'stage':a.stage,'scope':'One existing block0 full512 diagnostic; no full24 acceptance or changed gate','input':inp,'manifest':record(a.bundle/'manifest.json'),'executionSourceSha':a.execution_source_sha,'sourceClosure':closure,'newExports':0}
 if a.stage=='block-options':report.update(scope='Bounded existing block19 options only; no full24 acceptance or changed gate',selection=selection)
 try:
  if a.stage=='source':
   sys.path.insert(0,str(a.deps));import numpy as np,torch
   from safetensors import safe_open
   from prepare import source_module
   torch.set_num_threads(2);torch.set_num_interop_threads(1);initial=a.model.stat();mod,ops,attend=source_module(HERE/'pinned-t5.py',torch);config=json.loads((HERE/'pinned-umt5-config.json').read_text())
   with a.model.open('rb') as f:
    hlen=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(hlen));embedding=header['shared.weight'];assert embedding['dtype']=='F16' and embedding['shape']==[256384,4096];cache={}
    for token in set(inp['tokenIds']):f.seek(8+hlen+embedding['data_offsets'][0]+token*8192);cache[token]=np.frombuffer(f.read(8192),dtype='<f2').astype(np.float32)
   x=torch.from_numpy(np.stack([cache[token]for token in inp['tokenIds']])[None]);del cache;x.numpy().astype('<f4').tofile(a.output/'block0-input.f32');attention=torch.tensor([inp['attentionMask']],dtype=torch.float32);mask=(1-attention).reshape(1,1,1,512).expand(1,1,512,512);mask=mask.masked_fill(mask.bool(),-torch.finfo(torch.float32).max);state={};scales=[];prefix='encoder.block.0.'
   with safe_open(str(a.model),framework='pt',device='cpu') as model:
    for key in model.keys():
     if not key.startswith(prefix) or key.endswith('.scale_weight'):continue
     value=model.get_tensor(key)
     if value.dtype==torch.float8_e4m3fn:
      scale=model.get_tensor(key[:-7]+'.scale_weight');assert scale.dtype==torch.float32 and scale.numel()==1 and bool(torch.isfinite(scale).all()) and float(scale)>0;value=value.float()*scale;scales.append({'key':key[:-7]+'.scale_weight','value':float(scale)});del scale
     else:value=value.float()
     assert bool(torch.isfinite(value).all());state[key[len(prefix):]]=value
   with torch.device('meta'):block=mod.T5Block(4096,4096,10240,config['dense_act_fn'],True,64,True,torch.float32,'meta',ops)
   strict=block.load_state_dict(state,strict=True,assign=True);del state;block.eval()
   with torch.inference_mode():hidden,_=block(x,mask,None,attend)
   assert list(hidden.shape)==[1,512,4096] and bool(torch.isfinite(hidden).all());hidden.numpy().astype('<f4').tofile(a.output/'block0-source-hidden.f32');del block,value;gc.collect()
   with safe_open(str(a.model),framework='pt',device='cpu') as model:weight=model.get_tensor('encoder.final_layer_norm.weight').float()
   weight.numpy().astype('<f4').tofile(a.output/'final-norm.f32');assert record(a.output/'final-norm.f32')['sha256']==manifest['finalNorm']['sha256'];norm=mod.T5LayerNorm(4096,eps=1e-6,dtype=torch.float32,device='meta',operations=ops);norm.load_state_dict({'weight':weight},strict=True,assign=True)
   with torch.inference_mode():normalized=(norm(hidden)*attention[...,None]).numpy().astype('<f4')
   normalized.tofile(a.output/'block0-source-normalized.f32');end=a.model.stat();assert(initial.st_size,initial.st_mtime_ns)==(end.st_size,end.st_mtime_ns)
   report.update(passed=True,strictMissing=strict.missing_keys,strictUnexpected=strict.unexpected_keys,scales=scales,torchVersion=torch.__version__,files={name:record(a.output/name)for name in ['block0-input.f32','block0-source-hidden.f32','block0-source-normalized.f32','final-norm.f32']})
  elif a.stage=='block-options':run_block_options(a,selection,report)
  elif a.stage=='trace-source':run_trace_source(a,manifest,inp,expected,oracle,report)
  elif a.stage=='trace-native':run_trace_native(a,manifest,inp,source_report,report)
  elif a.stage=='sdpa':run_sdpa(a,manifest,inp,source_report,report)
  else:
   import numpy as np
   c={'bundle':str(a.bundle),'output':str(a.output),'reference':str(a.reference),'runtime':str(ROOT/'docs/shared/inference'),'graph':str(a.bundle/manifest['blocks'][0]['path']),'graphRecord':manifest['blocks'][0],'input':inp,'optimization':a.optimization,'hikeSha256':'9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8'}
   native=subprocess.run(['node','--input-type=module','-e',NODE_CODE],input=json.dumps(c),text=True,capture_output=True)
   (a.output/'native-stdout.txt').write_text(native.stdout);(a.output/'native-stderr.txt').write_text(native.stderr);native.check_returncode();observation=json.loads(native.stdout.strip().splitlines()[-1]);comparisons={}
   for suffix in ['hidden','normalized']:
    actual=np.fromfile(a.output/('native-'+suffix+'.f32'),dtype='<f4').reshape(1,512,4096);reference=np.fromfile(a.reference/('block0-source-'+suffix+'.f32'),dtype='<f4').reshape(1,512,4096);comparisons[suffix]=metrics(actual,reference,np)
   report.update(passed=all(value['finite'] for value in comparisons.values()),optimization=a.optimization,sourceCheckpointExecutionSha=source_report['executionSourceSha'],native=observation,comparison=comparisons,files={name:record(a.output/name)for name in ['native-hidden.f32','native-normalized.f32']})
 except Exception as error:report['passed']=False;report['failure']={'name':type(error).__name__,'message':str(error)};raise
 finally:report['wallSeconds']=time.monotonic()-started;write(a.output/(a.stage+'-results.json'),report)
 print(json.dumps(report));return 0
if __name__=='__main__':raise SystemExit(main())
