"""Verify owner builder reproducibility and every source/kernel receipt digest."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2];api=root/'docs/shared/diffusion-models/api';info=api/'build-info.mjs';before=info.read_bytes()
r=subprocess.run(['python',str(api/'build-info.py')],check=True,capture_output=True,text=True)
assert info.read_bytes()==before,'Build identity not regenerated before verification'
source=info.read_text();hashes=json.loads(re.search(r'Object.freeze\((\{.*\})\);',source,re.S)[1])
for name,h in hashes.items():assert hashlib.sha256((api/name).read_bytes()).hexdigest()==h,name
k=root/'docs/shared/diffusion-models/ort-bridge/kernel';receipt=json.loads((k/'build-record.json').read_text())
for field,name in [('sourceSha256','bridge.hike'),('wasmSha256','bridge.wasm'),('watSha256','bridge.wat'),('runtimeSha256','runtime.js')]:assert hashlib.sha256((k/name).read_bytes()).hexdigest()==receipt[field],field
l=root/'docs/shared/diffusion-models/latent-space';latent=json.loads((l/'build/build-record.json').read_text())
for field,name in [('builderSha256','build.py'),('hostSha256','latent-space.mjs'),('profileBoundarySha256','../tensor-interop.mjs'),('sourceSha256','latent-space.hike'),('wasmSha256','build/latent-space.wasm'),('watSha256','build/latent-space.wat')]:assert hashlib.sha256((l/name).read_bytes()).hexdigest()==latent[field],field
s=root/'docs/shared/diffusion-models/ort-bridge/stream-attention';stream=json.loads((s/'build-record.json').read_text())
for field,name in [('sourceSha256','kernel.hike'),('wasmSha256','kernel.wasm'),('watSha256','kernel.wat'),('runtimeSha256','runtime.js')]:assert hashlib.sha256((s/name).read_bytes()).hexdigest()==stream[field],field
out={'passed':True,'sourceCount':len(hashes),'buildId':r.stdout.strip(),'kernelWasmSHA256':receipt['wasmSha256'],'latentWasmSHA256':latent['wasmSha256'],'streamAttentionWasmSHA256':stream['wasmSha256'],'kernelReceiptsChecked':14,'ownerBuilder':'docs/shared/diffusion-models/api/build-info.py','scope':'source closure/receipt only, not real-model validation'}
(root/'development/ai-connection/build-verification.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
