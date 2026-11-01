import json, hashlib, pathlib, math, datetime
import numpy as np

ROOT=pathlib.Path('/workspace/work/diffusion-models')
OUT=pathlib.Path('/tmp/same-conditions-profile-audit-20261102')
BASE=ROOT/'development/ai-connection/p4-real-text-l512'
sha=lambda b:hashlib.sha256(b).hexdigest()
verified=[]
def read(path, expected=None):
    path=pathlib.Path(path); raw=path.read_bytes(); digest=sha(raw)
    if expected is not None: assert digest==expected,(str(path),digest,expected)
    verified.append({'path':str(path),'bytes':len(raw),'sha256':digest})
    return json.loads(raw)
def binary(root,d):
    p=root/d['path'];raw=p.read_bytes()
    assert len(raw)==d['bytes'] and sha(raw)==d['sha256'],str(p)
    a=np.frombuffer(raw,dtype='<f4')
    assert a.size==math.prod(d['shape']) and np.isfinite(a).all(),str(p)
    verified.append({'path':str(p),'bytes':len(raw),'sha256':d['sha256']})
    return a
def metric(a,b,gate):
    x=a.astype('float64'); y=b.astype('float64'); delta=np.abs(x-y)
    rmse=float(np.sqrt(np.mean(delta*delta)));den=float(np.sqrt(np.mean(y*y)))
    return {'values':a.size,'failed':int(np.count_nonzero(delta>gate['abs']+gate['rel']*np.abs(y))),
            'maxAbsolute':float(delta.max()),'meanAbsolute':float(delta.mean()),'rmse':rmse,
            'relativeL2':rmse/den if den else (0 if rmse==0 else None),
            'bitDifferentElements':int(np.count_nonzero(a.view('<u4')!=b.view('<u4')))}

manifest_files=read(BASE/'FILES.json')
for e in manifest_files['files']:
    p=ROOT/e['path']
    if str(p).startswith(str(BASE)):
        raw=p.read_bytes();assert len(raw)==e['bytes'] and sha(raw)==e['sha256'],str(p)
        verified.append({'path':str(p),'bytes':len(raw),'sha256':e['sha256']})
context=read(BASE/'RUN-CONTEXT.json')
freeze=read(BASE/'reference/input-freeze.json')
plan=read(ROOT/'development/ai-connection/p4-cross-ffn/core/candidate-plan.json','051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600')
prefix_plan=read(ROOT/'development/ai-connection/qkv-next/hidden-core/candidate-plan.json')
plain_input_path=pathlib.Path('/tmp/text-packet-receipt-20261102/source/development/inference/p2-p3-acceptance/plain/evidence/plain-input.json')
plain=read(plain_input_path)
assert plain['text']=='Hello world' and sha(plain['text'].encode())==plain['textUtf8Sha256']
native=read(freeze['nativeTextPath'],freeze['nativeTextArtifactSHA256'])
assert list(native['shape'])==[1,512,4096]
text=np.asarray(native['data'],dtype='<f4')
assert sha(text.tobytes())==freeze['payloadSHA256']
mask=np.asarray(native['attentionMask'],dtype='uint8');assert sha(mask.tobytes())==freeze['maskSHA256']
assert int(np.count_nonzero(text.reshape(512,4096)[3:]))==0

chain={}
for side in ['HIGH','LOW']:
    anchor=plan['cases'][side]
    export=read(ROOT/anchor['exportReceiptPath'],anchor['exportReceiptSHA256'])
    saved=read(freeze['cases'][side]['savedTailPath'],anchor['savedArtifactSHA256'])
    for key,where in [('residual','arrays'),('timeAct1','inputs')]:
        a=np.asarray(saved[where][key],dtype='<f4')
        assert sha(a.tobytes())==anchor[key+'SHA256']
    prefix_path=ROOT/f'development/ai-connection/qkv-next/hidden-runtime/{side.lower()}-comparison.json'
    prefix=read(prefix_path,export['inputBindings']['fullPrefix']['receiptSHA256'])
    evidence=prefix['evidence']
    assert evidence['rawMeanSHA256']==prefix_plan['sourceInput']['payloadSha256']
    noise=np.asarray([(((i*29+7)%127)-63)/64 for i in range(128)],dtype='<f4')
    declared_noise_sha=sha(noise.tobytes())
    signed_zero_noise=noise.copy();signed_zero_noise[72]=np.float32(-0.0)
    assert noise[72]==0 and sha(signed_zero_noise.tobytes())==evidence['noiseSHA256']
    independent=read(ROOT/f'development/ai-connection/qkv-next/hidden-core/{side.lower()}-reference-receipt.json',prefix['independentReferenceReceiptSHA256'])
    assert independent['meta']['noiseIdentity']['sha256']==declared_noise_sha
    prefix_actual=read(f'/workspace/work/diffusion-private-hidden/{side.lower()}-prefix-actual.json',prefix['artifactSHA256'])
    for key in ['normalizedMean','noisedLatent','patches']:
        a=np.asarray(prefix_actual['arrays'][key],dtype='<f4')
        assert sha(a.tobytes())==prefix['stages'][key]['actualF32SHA256']==prefix['stages'][key]['referenceF32SHA256']
    chain[side]={
        'prefixReceiptPath':str(prefix_path),'prefixReceiptSHA256':export['inputBindings']['fullPrefix']['receiptSHA256'],
        'prefixArtifactSHA256':export['inputBindings']['fullPrefix']['artifactSHA256'],
        'rawMeanSHA256':evidence['rawMeanSHA256'],'runtimeRecordedNoiseSHA256':evidence['noiseSHA256'],
        'independentReferenceNoiseSHA256':declared_noise_sha,
        'rawNoiseBitsExactlyEqual':False,'directRawRuntimeNoiseTensorRetained':False,
        'signedZeroExplanation':{'index':72,'declaredRecipeValue':'+0','runtimeHashMatchesRecipeWithValue':'-0','onlyBitDifferenceBetweenReconstructionAndRecipe':True,'evidenceType':'recorded runtime SHA256 reproduced using declared recipe with negative zero at72; not a direct read of retained raw runtime noise'},
        'normalizedMeanNoisedLatentPatchesActualAndIndependentExactBytes':True,
        'upstreamExactStageSHA256':{key:prefix['stages'][key]['actualF32SHA256'] for key in ['normalizedMean','noisedLatent','patches']},
        'scheduleIndex':evidence['scheduleIndex'],'sigma':evidence['sigma'],'timestep':evidence['timestep'],
        'grid':evidence['grid'],'sourceIds':evidence['sourceIds'],'contextLatents':evidence['contextLatents'],
        'noiseScale':evidence['noiseScale'],'savedResidualSHA256':anchor['residualSHA256'],
        'savedTimeAct1SHA256':anchor['timeAct1SHA256'],'savedArtifactSHA256':anchor['savedArtifactSHA256'],
        'originalWorkflowInputsVerified':evidence['originalWorkflowInputsVerified'],
        'lowIsHighHandoff':evidence['lowIsHighHandoff']}

cases=[]
for side in ['high','low']:
    receipt=read(BASE/f'reference/{side}-local-receipt.json')
    cases.append({'id':side.upper()+'1-base' if side=='high' else 'LOW3-base',
                  'side':side.upper(),'runtime':f'/tmp/p4-real-text-l512/runtime-base/{side}-runtime/manifest.json',
                  'local':f'/tmp/p4-real-text-l512/local/{side}/manifest.json',
                  'composed':f'/tmp/p4-real-text-l512/composed/{side}/manifest.json',
                  'receipt':receipt,'lora':False})
lora_receipt=read(BASE/'lora-reference/s1-local-receipt.json')
cases.append({'id':'LOW3-lightLoRA-Q4-bias4-strength+1','side':'LOW','runtime':'/tmp/p4-real-text-l512/lora-runtime-s1/low-runtime/manifest.json','local':'/tmp/p4-real-text-l512/lora-reference/local-s1/manifest.json','composed':'/tmp/p4-real-text-l512/lora-reference/s1/manifest.json','receipt':lora_receipt,'lora':True})
comparison=[]
shapes=None
for c in cases:
    receipt=c['receipt']; manifests={};arrays={}
    expected={'runtime':receipt['runtimeManifestSHA256'],'local':receipt['referenceManifestSHA256'],
              'composed':receipt['frozenPreRuntimeReferenceSHA256'] if c['lora'] else receipt['preRuntimeComposedManifestSHA256']}
    for kind in ['runtime','local','composed']:
        path=pathlib.Path(c[kind]);m=read(path,expected[kind]);manifests[kind]=m
        assert m['side']==c['side'] and m['candidatePlanSHA256']==plan['cases'][c['side']].get('candidatePlanSHA256',plan.get('candidatePlanSHA256','051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600'))
        assert len(m['arrays'])==25
        arrays[kind]={k:binary(path.parent,d) for k,d in m['arrays'].items()}
    runtime=manifests['runtime']; composed=manifests['composed']
    assert runtime['evidence']['executionProfileId']==plan['profileId']
    assert runtime['evidence']['modelHash']==composed['modelHash']
    assert runtime['evidence']['headerSHA256']==composed['headerSHA256']
    runtime_bind=dict(runtime['inputBindings']);oracle_bind=dict(composed['inputBindings'])
    if c['lora']:
        assert runtime_bind.pop('finalF32PatchArtifactSHA256')==receipt['actualSDKPatchArtifactSHA256']
        assert oracle_bind.pop('finalF32PatchArtifactSHA256')==runtime['independentReferenceBindings']['independentPatchArtifactSHA256']
    assert runtime_bind==oracle_bind
    if not c['lora']: assert runtime['inputBindings']==manifests['local']['inputBindings']==composed['inputBindings']
    if shapes is None:shapes={k:d['shape'] for k,d in runtime['arrays'].items()}
    assert shapes=={k:d['shape'] for k,d in runtime['arrays'].items()}
    groups={}
    for kind in ['local','composed']:
        gate={'abs':.001,'rel':.0001} if kind=='local' else {'abs':.01,'rel':.001}
        cuts={}
        for key,a in arrays['runtime'].items():
            cuts[key]=metric(a,arrays[kind][key],gate)
            old=receipt['comparisons'][kind][key]
            assert cuts[key]['values']==old['values'] and cuts[key]['failed']==old['failed'] and cuts[key]['maxAbsolute']==old['maxAbsolute'],(c['id'],kind,key)
        groups[kind]={'gate':gate,'cuts':cuts,'values':sum(d['values'] for d in cuts.values()),
                      'failed':sum(d['failed'] for d in cuts.values()),'maxAbsolute':max(d['maxAbsolute'] for d in cuts.values())}
    comparison.append({'id':c['id'],'side':c['side'],'modelSHA256':composed['modelHash'],
                       'runtimeManifestSHA256':expected['runtime'],'localManifestSHA256':expected['local'],
                       'composedManifestSHA256':expected['composed'],'sameBoundaryInputs':True,
                       'sameOriginalLoRASelectionStrength':True,'effectiveF32PatchBytesEqual':None if not c['lora'] else False,
                       'lora':{'enabled':c['lora'],'coverage':'PARTIAL' if c['lora'] else 'base immutable-original no patches',
                               'semanticScope':'LOW light, Q first4 complete5120-column rows and bias first4, rank128 alpha128 strength+1' if c['lora'] else 'no LoRA applied',
                               'referencePatchSHA256':composed['inputBindings'].get('finalF32PatchArtifactSHA256'),
                               'runtimePatchSHA256':runtime['inputBindings'].get('finalF32PatchArtifactSHA256')},
                       'groups':groups})

audit={'schemaVersion':'same-conditions-diagnostic-profile-audit/0.1','recordedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
       'repoHEAD':'32547051af430281a610d8b514ff16abee457288','readOnly':True,'newModelInferenceRuns':0,
       'newOriginalModelReads':0,'newWholeBerniniHashes':0,'newDownloads':0,'sourceContext':context,
       'profile':{'id':plan['profileId'],'nativeAPI':'diffusion-models/0.1','catalogStatus':'owner candidate / evidence supplement, not manager adoption',
                  'residualShape':[2,5120],'residualLayout':'LC','timeAct1Shape':[5120],'textShape':[1,512,4096],
                  'textLayout':'BLC','blockOutputShape':[2,5120],'blockOutputMeaning':'block0 token hidden, not generated latent/sample',
                  'shapes25':shapes,'normalization':'Text final RMSNorm stays upstream; no additional latent normalization at this cut; norm3 affine LayerNorm full5120 epsilon1e-6, cross Q/K full5120 RMSNorm epsilon1e-6, FFN LayerNorm; no cross RoPE or softmax mask'},
       'diagnosticInputs':{'rawMeanSource':prefix_plan['sourceInput'],'normalizationId':'wan21-comfy-f32-v1',
          'normalizedMeanMeaning':'wan21-normalized-posterior-mean:v1','rawMeanProfileId':'wan21-raw-f32-1x16x32','rawMeanShape':[1,16,1,2,4],
          'noiseRecipe':prefix_plan['input']['noiseRecipe'],'seed':None,'usesPRNG':False,
          'schedule':{k:prefix_plan['input'][k] for k in ['scheduleProfile','scheduler','sampler','steps','shift','split','modelTimestep']},
          'chainBySide':chain,'text':{'prompt':plain['text'],'textUtf8SHA256':plain['textUtf8Sha256'],
             'sourcePath':str(plain_input_path),'sourceCommit':plain['executionSourceSha'],
             'textModelSHA256':plain['modelSha256'],'tokenizerSHA256':plain['tokenizerSha256'],'shape':[1,512,4096],
             'zeroOutMasked':plain['zeroOutMasked'],'nonzeroMaskEntries':int(np.count_nonzero(mask)),
             'maskUsedAtDiffusionCrossSoftmax':False,'all512RowsConsumed':True,
             'conditioningPayloadSHA256':freeze['payloadSHA256'],'maskSHA256':freeze['maskSHA256'],
             'nativeArtifactSHA256':freeze['nativeTextArtifactSHA256']}},
       'comparisonCases':comparison,
       'conditionMatrix':[
           {'condition':'model side/original selected storage and decoded F32','withinBaseRuntimeReference':'EXACT','withinLoRARuntimeReference':'SAME_SOURCE; actual completed weight differs from independent A rounded F32','diagnosticVersusOriginal':'UNKNOWN; workflow mxfp8 names differ from retained scaledFP8 names'},
           {'condition':'LoRA original, selection, strength','withinBaseRuntimeReference':'EXACT: no LoRA applied','withinLoRARuntimeReference':'SAME_SOURCE: same lightLOW original, Q rows0..3, bias0..3, +1; A numeric gate','diagnosticVersusOriginal':'DIFFERENT: partial2patch diagnostic is not original workflow complete LoRA application'},
           {'condition':'prompt/tokenizer/conditioning payload','withinBaseRuntimeReference':'EXACT: Hello world frozen L512 bytes','withinLoRARuntimeReference':'EXACT: same frozen L512 bytes','diagnosticVersusOriginal':'DIFFERENT: original editing positive/default negative; original token lengths not proven'},
           {'condition':'noise tensor','withinBaseRuntimeReference':'EXACT at P4 saved residual/timeAct1 boundary; no noise generator rerun','withinLoRARuntimeReference':'EXACT at P4 saved residual/timeAct1 boundary','diagnosticVersusOriginal':'DIFFERENT_SHAPE_AND_UNKNOWN_ORIGINAL_BYTES: explicit128 diagnostic vs original production noise; no index map'},
           {'condition':'diagnostic upstream raw noise bytes','withinBaseRuntimeReference':'DIFFERENT at sign bit of zero index72; source recipe numerically same; noisedLatent/patches exact','withinLoRARuntimeReference':'same saved prefix chain, no upstream rerun','diagnosticVersusOriginal':'UNKNOWN original raw noise tensor; no PRNG seed replay exists in diagnostic'},
           {'condition':'schedule rule','withinBaseRuntimeReference':'EXACT fixed side sigma/time binding','withinLoRARuntimeReference':'EXACT LOW3 sigma/time binding','diagnosticVersusOriginal':'SAME_RULE per original workflow audit; not same full sampling execution'},
           {'condition':'shape/contexts','withinBaseRuntimeReference':'EXACT N2 target-only, grid1x1x2, contexts[]','withinLoRARuntimeReference':'EXACT N2 target-only, grid1x1x2, contexts[]','diagnosticVersusOriginal':'DIFFERENT N2 vs configured81frame target; original context extents unknown without media'},
           {'condition':'precision/runtime','withinBaseRuntimeReference':'DIFFERENT arithmetic backends intentionally compared under frozen diagnostic gates','withinLoRARuntimeReference':'DIFFERENT independent A/B vs actual SDK/ORT/Hike arithmetic under frozen gates','diagnosticVersusOriginal':'UNKNOWN parity: original GPU fused/activation precision unaccepted'}],
       'cannotTreatAsSameCondition':[{'pair':'HIGH1 base vs LOW3 base','reason':'different model side/hash and sigma/timestep'},
            {'pair':'LOW3 base vs LOW3 LoRA+1','reason':'intentionally different LoRA/model parameters'},
            {'pair':'real L512 diagnostic vs original workflow','reason':'prompt differs; media/contexts and original noise unavailable; diagnostic uses Rect N2, original configured target81 frames; workflow mxfp8 filenames differ from retained scaledFP8 filenames; full effective model identity not proven'},
            {'pair':'LoRA SDK vs independent effective patch','reason':'same source, selection and strength, but completed F32 weight bytes differ due independently computed arithmetic; accepted through fixed A gate, not exact effective-byte equality'}],
       'originalWorkflowComparisonStatus':'NOT_EXECUTED_AND_NOT_SAME_CONDITION_PROVEN',
       'readiness':{'load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY','generationReady':False},
       'verification':{'knownPublicFilesVerified':sum(1 for e in manifest_files['files'] if e['path'].startswith('development/ai-connection/p4-real-text-l512/')),
          'binaryFilesVerified':sum(1 for e in verified if e['path'].endswith('.f32')),
          'comparisonsRecalculated':sum(len(g['cuts']) for c in comparison for g in c['groups'].values()),
          'failedValues':sum(g['failed'] for c in comparison for g in c['groups'].values()),
          'summaryReceiptMaximaMatch':True,'artifacts':verified}}
OUT.joinpath('audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'output':str(OUT/'audit.json'),'verification':{k:v for k,v in audit['verification'].items() if k!='artifacts'},'cases':[{'id':c['id'],'maxima':{k:g['maxAbsolute'] for k,g in c['groups'].items()}} for c in comparison]},indent=2))
