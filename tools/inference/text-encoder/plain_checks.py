"""Plain acceptance artifact/gate checks; no model/runtime imports."""
import hashlib,json,math,re
import numpy as np

SHAPE=(1,512,4096)
def validate_gate(gate):
 if gate.get('maxAbsError')!=.001 or gate.get('rtol')!=.001 or gate.get('registeredBeforeComparison') is not True or gate.get('scope')!='FP32 source-reference diagnostics; no original workflow quality guarantee':raise ValueError('Selected predeclared final gate cannot change')
 return gate
def text_shape(shape):
 shape=tuple(shape)
 if len(shape)!=3 or shape[0]!=1 or type(shape[1]) is not int or not 1<=shape[1]<=512 or shape[2]!=4096:raise ValueError('Exact text BLC shape required')
 return shape
def compile_case(case,encode_text):
 """Freeze native inputs; the independent source remains uncompacted full512."""
 case_id=case.get('id');input_value=case.get('input')
 if not isinstance(case_id,str) or not re.fullmatch('[a-z0-9][a-z0-9-]{0,63}',case_id) or not isinstance(input_value,dict):raise ValueError('Case ID and input object required')
 if 'text' in input_value:
  text=input_value['text']
  if not isinstance(text,str) or 'tokenIds' in input_value or 'attentionMask' in input_value or not callable(encode_text):raise ValueError('Choose plain text or token IDs/mask')
  ids=list(encode_text(text));active=len(ids)
  if not 1<=active<=512 or ids[-1]!=1:raise ValueError('Plain input must fit512 tokens including EOS1; no truncation')
  ids=ids+[0]*(512-active);mask=[1]*active+[0]*(512-active)
  digest=hashlib.sha256(text.encode()).hexdigest()
  if input_value.get('utf8Sha256',digest)!=digest:raise ValueError('Plain text UTF8 hash mismatch')
  source={'text':text};extra={'text':text,'textUtf8Sha256':digest};mode='plain-text'
 else:
  ids=input_value.get('tokenIds');mask=input_value.get('attentionMask')
  if not isinstance(ids,list) or not isinstance(mask,list):raise ValueError('Explicit ID/mask vectors required')
  ids=list(ids);mask=list(mask);source={'tokenIds':ids.copy(),'attentionMask':mask.copy()};extra={};mode='token-ids'
 if not 1<=len(ids)<=512 or len(ids)!=len(mask) or any(type(v) is not int or not 0<=v<256384 for v in ids) or any(type(v) is not int or v not in [0,1] for v in mask) or not any(mask):raise ValueError('Invalid text token IDs or binary attention mask')
 if 'byteGraph' in case:
  if type(case['byteGraph']) is not int or not 0<=case['byteGraph']<24:raise ValueError('Bounded bytes graph index required')
  extra['byteGraph']=case['byteGraph']
 return {'id':case_id,'input':source,'inputMode':mode,'tokenIds':ids,'attentionMask':mask,'shape':[1,len(ids),4096],'activeTokens':sum(mask),'effectiveTokens':max(i+1 for i,v in enumerate(mask) if v),'oracleInternalShape':[1,512,4096],'oracleUsesFull512Positions':True,**extra}
def oracle_vectors(case):
 length=case['shape'][1]
 return case['tokenIds']+[0]*(512-length),case['attentionMask']+[0]*(512-length)
def default_suite_cases(encode_text):
 """Deterministic acceptance inputs; token counts are checked, never guessed."""
 long_text=' '.join(['a']*511);overflow=' '.join(['a']*512)
 if len(encode_text(long_text))!=512 or len(encode_text(overflow))!=513:raise ValueError('Pinned tokenizer no longer gives the declared EOS-inclusive boundary')
 ids=[(42+37*i)%256384 for i in range(512)];ids[0]=0;ids[255]=256383;ids[-1]=1
 make=lambda name,token_ids,mask:{'id':name,'input':{'tokenIds':token_ids,'attentionMask':mask}}
 cases=[{'id':'plain-empty','input':{'text':''}},{'id':'plain-multilingual-newline','input':{'text':'日本語の朝。\nHello, café!\nمرحبا بالعالم 🌍'}},{'id':'plain-long-eos512','input':{'text':long_text}},make('id-l1',[0],[1]),make('id-l2',[0,256383],[1,1]),make('id-l511',ids[:511],[1,1]+[0]*509),make('id-l512-trailing-mask',ids.copy(),[1,1]+[0]*510),make('id-internal-trailing-mask',ids.copy(),[1,0,1]+[0]*509),make('id-l512-all-active',ids.copy(),[1]*512)]
 cases[4]['byteGraph']=0
 negatives=[{'id':'plain-overflow','input':{'text':overflow},'errorIncludes':'exceeds supported token length'}, {'id':'mixed-mode','input':{'text':'x','tokenIds':[1],'attentionMask':[1]},'errorIncludes':'without mixing'},make('empty-ids',[],[]),make('all-masked',[1],[0]),make('negative-id',[-1],[1]),make('id-past-vocab',[256384],[1]),make('fractional-mask',[1],[.5]),make('mismatched-length',[1,2],[1]),make('id-overflow',[1]*513,[1]*513)]
 for item in negatives:item.setdefault('errorIncludes','Invalid text token IDs or attention mask')
 return cases,negatives
def unpack_tensor(raw,shape=SHAPE):
 shape=text_shape(shape)
 if len(raw)<12 or raw[:8]!=b'WKTSR001':raise ValueError('Invalid Works tensor')
 length=int.from_bytes(raw[8:12],'little')
 if not 0<length<=65536 or 12+length>len(raw):raise ValueError('Invalid header size')
 meta=json.loads(raw[12:12+length]);data=raw[12+length:]
 if meta.get('schemaVersion')!=1 or meta.get('dtype')!='float32' or meta.get('byteOrder')!='little' or meta.get('layout')!='BLC' or meta.get('meaning')!='text_hidden_states' or meta.get('shape')!=list(shape):raise ValueError('Wrong plain tensor contract')
 if meta.get('byteLength')!=len(data) or len(data)!=math.prod(shape)*4 or hashlib.sha256(data).hexdigest()!=meta.get('dataSha256'):raise ValueError('Payload bytes/hash mismatch')
 return meta,np.frombuffer(data,dtype='<f4').reshape(shape)
def compare_values(actual,reference,mask,shape=SHAPE):
 shape=text_shape(shape)
 if actual.shape!=shape or reference.shape!=shape or mask.shape!=(shape[1],) or not np.isin(mask,[0,1]).all() or not mask.any():raise ValueError('Exact plain shape/mask required')
 finite=bool(np.isfinite(actual).all() and np.isfinite(reference).all())
 padding=mask==0;pad_exact=bool((actual[:,padding,:]==0).all() and (reference[:,padding,:]==0).all())
 if not finite:return {'passed':False,'finite':False,'paddingExactlyZero':pad_exact,'maxAbsError':None,'reason':'Nonfinite output/reference'}
 delta=np.abs(actual.astype(np.float64)-reference.astype(np.float64));maximum=float(delta.max());allclose=bool(np.all(delta<=.001+.001*np.abs(reference.astype(np.float64))))
 return {'passed':maximum<=.001 and allclose and pad_exact,'finite':True,'elements':actual.size,'activeElements':int(mask.sum())*4096,'paddingElements':int(padding.sum())*4096,'paddingExactlyZero':pad_exact,'maxAbsError':maximum,'activeMaxAbsError':float(delta[:,mask==1,:].max()),'allclose':allclose,'gate':{'maxAbsError':.001,'atol':.001,'rtol':.001},'allValuesCompared':True}
