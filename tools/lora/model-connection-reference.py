#!/usr/bin/env python3
"""Development comparison only. Reads browser RAW.json, never a normal SDK input."""
import argparse, json, hashlib, base64
from pathlib import Path
import numpy as np
ABS, REL = 1e-5, 1e-4
C=5120

def decode(record):
    data=bytes(record['raw']); dtype=record['source']['storageDtype']
    if dtype=='F16': out=np.frombuffer(data,dtype='<f2').astype(np.float32)
    elif dtype=='F8_E4M3':
        u=np.frombuffer(data,dtype=np.uint8); exp=((u>>3)&15).astype(np.int32); mant=(u&7).astype(np.int32)
        if np.any((exp==15)&(mant==7)): raise ValueError('Nonfinite E4M3FN code')
        value=np.where(exp==0,mant/512.0,(1.0+mant/8.0)*np.exp2(exp-7))
        value=np.where(u&128,-value,value).astype(np.float32)
        out=np.float32(value*np.float32(record['source']['scale']))
    else: raise ValueError('Unsupported declared native storage dtype')
    if not np.isfinite(out).all(): raise ValueError('Nonfinite independently decoded base')
    return out

def expected(base, case):
    w=base['weight'].copy(); b=base['bias'].copy(); offsets=np.arange(w.size); rows=offsets//C; cols=offsets%C; selected=(rows>=1)&(rows<3)
    for pair in ['light','detail']:
        choices=[s for s in case['selections'] if s['pairId']==pair]
        if not choices: continue
        strength=np.float32(choices[0]['strength'])
        down=((cols%4-1)/64 if pair=='light' else (cols%3-1)/32).astype(np.float32)
        up=((rows%5+1)/8 if pair=='light' else (rows%7+1)/16).astype(np.float32)
        product=np.float32(down*up); scale=np.float32(strength*(2 if pair=='light' else 1))
        delta=np.float32(scale*product); w[selected]=np.float32(w[selected]+delta[selected])
        if pair=='light' and case['biasSelected']:
            for row in [1,2]: b[row]=np.float32(b[row]+np.float32(strength*np.float32((row%5-2)/128)))
    return {'weight':w,'bias':b}

def metric(actual, reference, bias=False):
    a=np.asarray(actual,dtype=np.float32); r=np.asarray(reference,dtype=np.float32)
    if a.shape!=r.shape or not np.isfinite(a).all(): raise ValueError('Incomplete/nonfinite actual comparison')
    error=np.abs(a.astype(np.float64)-r.astype(np.float64)); gate=0 if bias else ABS+REL*np.abs(r.astype(np.float64))
    failed=int(np.count_nonzero(error>gate)); return {'elements':int(a.size),'failed':failed,'maxAbsolute':float(error.max(initial=0)),'actualF32SHA256':hashlib.sha256(a.astype('<f4').tobytes()).hexdigest(),'independentF32SHA256':hashlib.sha256(r.astype('<f4').tobytes()).hexdigest()}

def check(raw):
    assert raw['status']=='PASS_BROWSER_PARTIAL_CONNECTION' and raw['modelInference'] is False and raw['experimentalLoraSent'] is False
    results=[]
    for phase in ['producer','fresh']:
        run=raw[phase]; assert run['passed'] and run['modelFile']['isNativeFile'] and run['modelFile']['bytes']==15574833216
        base={k:decode(run['base'][k]) for k in ['weight','bias']}
        assert base['weight'].size==4*C and base['bias'].size==4
        for kind in base:
            m=metric(run['base'][kind]['values'],base[kind],bias=True); assert m['failed']==0,'Native base decode differs from independent reference';results.append({'phase':phase,'case':'immutable-base-decode','kind':kind,**m})
        for case in run['cases']:
            refs=expected(base,case)
            for kind in refs:
                m=metric(case[kind],refs[kind],bias=(kind=='bias'));assert m['failed']==0,(phase,case['id'],kind,m);results.append({'phase':phase,'case':case['id'],'kind':kind,**m})
        end=run['terminal'];assert end['kernel']['disposed'] and end['kernel']['memoryBytes']==0 and end['kernel']['leaseCount']==0
        assert end['source']['disposed'] and end['adapter']['candidates']==0 and end['adapter']['readLeases']==0 and end['adapter']['pendingReleases']==0 and end['adapter']['inFlight']==0
        assert end['cache']['bytes']==0 and end['cache']['pending']==0
    p=raw['producer'];assert p['cancel']['passed'] and p['cancel']['epochBefore']==p['cancel']['epochAfter']
    assert p['failedRead']['passed'] and p['failedRead']['epochBefore']==p['failedRead']['epochAfter']
    retained=p['retainedAfterCreators']; assert retained['passed'];refs=expected({k:decode(p['base'][k]) for k in ['weight','bias']},p['cases'][-1]);m=metric(retained['values'],refs['weight'][C:3*C]);assert m['failed']==0;results.append({'phase':'producer','case':'retained-after-creator-disposal','kind':'weight',**m})
    assert raw['fresh']['reopen']['registeredBeforeStage']==0
    assert p['saved']['sdkInstanceId']!=raw['fresh']['reopen']['management']['sdkInstanceId']
    assert p['saved']['packageHash']==raw['fresh']['reopen']['nativeReceipt']['packageHash']
    return {'schemaVersion':'lora-model-partial-independent-comparison/1','status':'PASS','scope':'Validation rank1 LoRA Files, actual LOW native base decode, original full[5120,5120], rows1..2 and full columns; bias rows1..2 when selected. No original experimental LoRA, no neural prediction','cases':len(p['cases'])+len(raw['fresh']['cases']),'comparisons':results,'comparedElements':sum(x['elements'] for x in results),'failedElements':0,'maxAbsolute':max(x['maxAbsolute'] for x in results),'gates':{'weight':{'absolute':ABS,'relative':REL},'bias':{'absolute':0,'relative':0}},'normalSDKRequiresExpected':False,'terminalResourcesClosed':True,'modelInference':False,'wholeModelAccepted':False,'generationReady':False,'referenceSourceSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

def selftest():
    r={'raw':[0,128,1,8,56,126,254],'source':{'storageDtype':'F8_E4M3','scale':1}}
    assert np.array_equal(decode(r),np.array([0,-0.0,1/512,1/64,1,448,-448],np.float32))
    for code in [127,255]:
        try: decode({'raw':[code],'source':r['source']});raise AssertionError('NaN was accepted')
        except ValueError: pass
    assert metric([1],[1])['failed']==0 and metric([2],[1])['failed']==1
    return {'status':'PASS','checks':4,'scope':'independent E4M3FN/gate component checks'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--raw');parser.add_argument('--out');parser.add_argument('--self-test',action='store_true');a=parser.parse_args()
    if a.self_test: print(json.dumps(selftest()))
    else:
        assert a.raw and a.out;d=check(json.loads(Path(a.raw).read_text()));Path(a.out).write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({k:d[k] for k in ['status','cases','comparedElements','failedElements','maxAbsolute','terminalResourcesClosed']}))
