#!/usr/bin/env python3
"""Independent standard-library staged-f32 oracle; synthetic activation, not VAE output."""
import hashlib,json,struct
from pathlib import Path
r=Path(__file__).resolve().parent
f=lambda x:struct.unpack('<f',struct.pack('<f',x))[0]
mean=list(map(f,[-.7571,-.7089,-.9113,.1075,-.1745,.9653,-.1517,1.5508,.4134,-.0715,.5517,-.3632,-.1922,-.9497,.2503,-.2921]))
std=list(map(f,[2.8184,1.4541,2.3275,2.6558,1.2196,1.7708,2.6052,2.0743,3.2687,2.1526,2.8652,1.5579,1.6382,1.1253,2.8251,1.9160]))
raw=[f((i%19-9)/8) for i in range(64)]
normalized=[f(f(f(x-mean[i//4])*f(1))/std[i//4]) for i,x in enumerate(raw)]
restored=[f(f(f(x*std[i//4])/f(1))+mean[i//4]) for i,x in enumerate(normalized)]
digest=lambda values:hashlib.sha256(struct.pack('<64f',*values)).hexdigest()
record={'scope':'synthetic F1 mean all64 source-constant arithmetic; no VAE model output or decode',
 'source':'Comfy-Org/ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4 comfy/latent_formats.py755-777',
 'profile':'wan21-raw-f32-1x16x16','shape':[1,16,1,2,2],'positionsPerChannel':4,
 'raw':raw,'normalized':normalized,'restored':restored,
 'normalizedSHA256':digest(normalized),'restoredSHA256':digest(restored),
 'presetRoundTripMaxAbs':2e-6,'maxRoundTripAbs':max(abs(a-b) for a,b in zip(raw,restored))}
assert record['maxRoundTripAbs']<=record['presetRoundTripMaxAbs']
for file in [r/'node-results.json',r/'browser-results.json']:
 if file.exists():
  result=json.loads(file.read_text());result=result.get('f1',result)
  assert result['normalizedSHA256']==record['normalizedSHA256'],file
  assert result['restoredSHA256']==record['restoredSHA256'],file
(r/'reference-f1.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['normalizedSHA256','restoredSHA256','maxRoundTripAbs']}))
