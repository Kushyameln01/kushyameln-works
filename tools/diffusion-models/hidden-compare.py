"""Gate a private prefix artifact against the predeclared independent reference.
Only hashes, shapes, metrics and producer evidence are emitted publicly.
"""
import argparse,hashlib,json,math,struct
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--reference',type=Path,required=True);p.add_argument('--actual',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest();pack=lambda v:struct.pack('<%df'%len(v),*v)
r=json.loads(a.reference.read_text());v=json.loads(a.actual.read_text());e=v['evidence'];metrics={};passed=True
plan_path=root/'development/ai-connection/qkv-next/hidden-core/candidate-plan.json';plan=json.loads(plan_path.read_text());reference_receipt_path=root/('development/ai-connection/qkv-next/hidden-core/'+e['side'].lower()+'-reference-receipt.json');anchored_reference=json.loads(reference_receipt_path.read_text())
assert sha(a.reference.read_bytes())==anchored_reference['referenceSHA256'],'Independent reference full SHA mismatch'
assert r['meta']['planSHA256']==sha(plan_path.read_bytes())==anchored_reference['meta']['planSHA256'],'Predeclared plan SHA mismatch'
assert r['gates']==plan['gates'],'Predeclared gate mismatch'
assert r['meta']==anchored_reference['meta'],'Independent reference metadata mismatch'
for k,ref in r['expected'].items():
 actual=v['arrays'][k];assert len(actual)==len(ref),k+' length mismatch';g=r['gates'][k];finite=all(math.isfinite(x) for x in actual);strict='comparison' in g;expected_sha=r['arrayIdentities'][k]['sha256'];assert sha(pack(ref))==expected_sha,k+' reference identity mismatch'
 fails=0 if strict and pack(actual)==pack(ref) else (sum(abs(x-y)>g.get('abs',0)+g.get('rel',0)*abs(y) for x,y in zip(actual,ref)) if not strict else len(ref))
 metrics[k]={'elements':len(ref),'bytes':len(ref)*4,'actualF32SHA256':sha(pack(actual)),'referenceF32SHA256':expected_sha,'maxAbs':max(abs(x-y) for x,y in zip(actual,ref)),'failCount':fails,'finite':finite,'gate':g};passed &= finite and fails==0
parameters={}
for key,x in e['parameterSources'].items():
 parameters[key]=x
 if 'bias' in x:parameters[x['bias']['originalKey']]=x['bias']
param_results=[]
for x in r['ranges']:
 actual=parameters[x['key']];ok=all(actual[k]==x[k] for k in ('fullShape','storageDtype','rawSHA256','decodedF32SHA256')) and actual['absoluteByteOffset']==x['absoluteOffset'];passed &= ok
 param_results.append({'key':x['key'],'passed':ok,'rawSHA256':actual['rawSHA256'],'decodedF32SHA256':actual['decodedF32SHA256'],'sourceBytes':x['sourceBytes']})
assert e['hiddenSHA256']==metrics['hidden']['actualF32SHA256'];assert e['side']==r['meta']['side'];assert e['modelHash']==r['meta']['modelSha256'];assert e['sigma']==r['meta']['sigma'];assert e['timestep']==r['meta']['modelTimestep'];assert e['scheduleIndex']==r['meta']['globalSigmaIndex'];assert e['rawMeanSHA256']==r['meta']['rawMeanSource']['payloadSha256']
paths=['docs/shared/diffusion-models/ort-bridge/block-hidden/'+x for x in ['source.mjs','linear.mjs','graph.mjs','stage.mjs','math.mjs','math.hike','build.py','registry.mjs','kernel.wasm','kernel.wat','runtime.js','build-record.json']]+['docs/shared/diffusion-models/ort-bridge/hike.mjs','docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm','docs/shared/diffusion-models/latent-space/latent-space.mjs','docs/shared/diffusion-models/latent-space/build/latent-space.wasm','docs/shared/diffusion-models/scheduler/scheduler-kernel.mjs','docs/shared/diffusion-models/scheduler/build/scheduler.wasm','tools/diffusion-models/hidden-browser.py','tools/diffusion-models/hidden-compare.py','docs/shared/diffusion-models/ort-bridge/block-hidden/browser-cases.mjs','development/ai-connection/qkv-next/hidden-core/candidate-plan.json','docs/shared/diffusion-models/api/safetensors.mjs','docs/shared/diffusion-models/lora/targets.mjs','docs/shared/diffusion-models/lora/weights.mjs','docs/shared/diffusion-models/lora/strict-json.mjs','docs/shared/vr180/sha256.mjs','docs/shared/diffusion-models/ort-bridge/qkv/ownership.mjs','docs/shared/diffusion-models/ort-bridge/kernel/registry.mjs','docs/shared/diffusion-models/latent-space/kernel-registry.mjs','docs/shared/diffusion-models/tensor-interop.mjs','docs/shared/inference/tensor.mjs','docs/shared/inference/vendor/ort.wasm.min.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm',str(reference_receipt_path.relative_to(root))]
report={'schemaVersion':'bernini-hidden-prefix-trusted-receipt/0.1','passed':bool(passed),'side':e['side'],'artifactSHA256':sha(a.actual.read_bytes()),'referenceSHA256':sha(a.reference.read_bytes()),'predeclaredPlanSHA256':sha(plan_path.read_bytes()),'independentReferenceReceiptSHA256':sha(reference_receipt_path.read_bytes()),'producerSourceSHA256':{x:sha((root/x).read_bytes()) for x in paths},'sourceClosureScope':'owner-local executed source/build inventory; final repository main build closure is the authoritative complete import closure','stages':metrics,'parameters':param_results,'evidence':e,'scope':'actual source-bound natural N2 prefix at one fixed side/timestep with explicit diagnostic noise; local independent gates only; not production precision/workflow/full block/predict','readiness':{'load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY'}}
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':bool(passed),'side':e['side'],'artifactSHA256':report['artifactSHA256'],'hiddenMaxAbs':metrics['hidden']['maxAbs']}));assert passed,'predeclared prefix gate failed'
