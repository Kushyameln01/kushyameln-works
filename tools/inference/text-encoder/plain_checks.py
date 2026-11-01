"""Plain acceptance artifact/gate checks; no model/runtime imports."""
import hashlib,json,math
import numpy as np

SHAPE=(1,512,4096)
def validate_gate(gate):
 if gate.get('maxAbsError')!=.001 or gate.get('rtol')!=.001 or gate.get('registeredBeforeComparison') is not True or gate.get('scope')!='FP32 source-reference diagnostics; no original workflow quality guarantee':raise ValueError('Selected predeclared final gate cannot change')
 return gate
def unpack_tensor(raw):
 if len(raw)<12 or raw[:8]!=b'WKTSR001':raise ValueError('Invalid Works tensor')
 length=int.from_bytes(raw[8:12],'little')
 if not 0<length<=65536 or 12+length>len(raw):raise ValueError('Invalid header size')
 meta=json.loads(raw[12:12+length]);data=raw[12+length:]
 if meta.get('schemaVersion')!=1 or meta.get('dtype')!='float32' or meta.get('byteOrder')!='little' or meta.get('layout')!='BLC' or meta.get('meaning')!='text_hidden_states' or meta.get('shape')!=list(SHAPE):raise ValueError('Wrong plain tensor contract')
 if meta.get('byteLength')!=len(data) or len(data)!=math.prod(SHAPE)*4 or hashlib.sha256(data).hexdigest()!=meta.get('dataSha256'):raise ValueError('Payload bytes/hash mismatch')
 return meta,np.frombuffer(data,dtype='<f4').reshape(SHAPE)
def compare_values(actual,reference,mask):
 if actual.shape!=SHAPE or reference.shape!=SHAPE or mask.shape!=(512,) or not np.isin(mask,[0,1]).all() or not mask.any():raise ValueError('Exact plain shape/mask required')
 finite=bool(np.isfinite(actual).all() and np.isfinite(reference).all())
 padding=mask==0;pad_exact=bool((actual[:,padding,:]==0).all() and (reference[:,padding,:]==0).all())
 if not finite:return {'passed':False,'finite':False,'paddingExactlyZero':pad_exact,'maxAbsError':None,'reason':'Nonfinite output/reference'}
 delta=np.abs(actual.astype(np.float64)-reference.astype(np.float64));maximum=float(delta.max());allclose=bool(np.all(delta<=.001+.001*np.abs(reference.astype(np.float64))))
 return {'passed':maximum<=.001 and allclose and pad_exact,'finite':True,'elements':actual.size,'activeElements':int(mask.sum())*4096,'paddingElements':int(padding.sum())*4096,'paddingExactlyZero':pad_exact,'maxAbsError':maximum,'activeMaxAbsError':float(delta[:,mask==1,:].max()),'allclose':allclose,'gate':{'maxAbsError':.001,'atol':.001,'rtol':.001},'allValuesCompared':True}
