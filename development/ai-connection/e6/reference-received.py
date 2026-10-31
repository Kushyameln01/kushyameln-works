#!/usr/bin/env python3
"""Independent f32 oracle over actual Git-received VAE diagnostic output fixtures."""
import hashlib,json,struct
from pathlib import Path
r=Path(__file__).resolve().parent
f=lambda x:struct.unpack('<f',struct.pack('<f',x))[0]
mean=list(map(f,[-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921]))
std=list(map(f,[2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.9160]))
outputs=[]
for name,positions,profile in [('f1',4,'wan21-raw-f32-1x16x16'),('rect',8,'wan21-raw-f32-1x16x32')]:
 data=(r/'received-7e091'/(name+'-mean.wktensor')).read_bytes();assert data[:8]==b'WKTSR001';length=struct.unpack('<I',data[8:12])[0];header=json.loads(data[12:12+length]);payload=data[12+length:];assert hashlib.sha256(payload).hexdigest()==header['dataSha256']
 raw=list(struct.unpack('<'+str(len(payload)//4)+'f',payload));assert len(raw)==16*positions
 normalized=[f(f(f(x-mean[i//positions])*f(1))/std[i//positions]) for i,x in enumerate(raw)]
 restored=[f(f(f(x*std[i//positions])/f(1))+mean[i//positions]) for i,x in enumerate(normalized)]
 digest=lambda values:hashlib.sha256(struct.pack('<'+str(len(values))+'f',*values)).hexdigest()
 record={'profile':profile,'shape':header['shape'],'raw':raw,'normalized':normalized,'restored':restored,'normalizedSHA256':digest(normalized),'restoredSHA256':digest(restored),'maxRoundTripAbs':max(abs(a-b) for a,b in zip(raw,restored))}
 assert record['maxRoundTripAbs']<=2e-6
 for fn,group in [('rect-node-results.json',None),('rect-browser-results.json','rect')]:
  if (r/fn).exists():
   result=json.loads((r/fn).read_text());result=result[group] if group else result
   observed=next(x for x in result['outputs'] if x['profile']==profile)
   assert observed['normalizedSHA256']==record['normalizedSHA256'] and observed['restoredSHA256']==record['restoredSHA256'],fn
 outputs.append(record)
(r/'reference-received.json').write_text(json.dumps({'scope':'Independent Python over received actual diagnostic VAE means; no VAE execution','presetRoundTripMaxAbs':2e-6,'sourceCommit':'7e091192232fae36367b550ca5fada88915a0703','outputs':outputs},indent=2)+'\n')
print(json.dumps([{key:x[key] for key in ['profile','normalizedSHA256','restoredSHA256','maxRoundTripAbs']} for x in outputs],indent=2))
