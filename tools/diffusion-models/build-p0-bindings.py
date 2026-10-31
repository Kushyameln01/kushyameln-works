"""Receive fixed reference bytes and bind existing Diffusion evidence, no inference.

The optional candidate commit is a separate code/build observation. It never
relabels baseline numerical receipts as acceptance of that candidate.
"""
from pathlib import Path
import argparse, hashlib, json, re, subprocess

ROOT = Path(__file__).resolve().parents[2]
REF = '6dae9a6fac3e9ad29ea941f22211edbe4aa894ad'
OWNER = '5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3'
F5 = '1317758bbba2b13603752d8c910ae2c6e77f78c5'
REPO = 'Kushyameln01/kushyameln-works'
OUT = ROOT / 'development/ai-connection/profile-adoption'
PROFILES = ROOT / 'docs/shared/diffusion-models/profiles'
CATALOG = 'docs/shared/ai-connection/reference/catalog.v1.json'
P = 'docs/shared/diffusion-models/'
E = 'development/ai-connection/'

def raw(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)

def digest(b):
    return hashlib.sha256(b).hexdigest()

def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate-commit', help='Optional full committed source/build candidate, not numerical acceptance')
    args = parser.parse_args()
    catalog_bytes = raw(REF, CATALOG)
    catalog = json.loads(catalog_bytes)
    acquisition = []
    files = []
    for path in [CATALOG] + [f['path'] for f in catalog['files']]:
        b = raw(REF, path)
        record = dict(path=path, byteLength=len(b), sha256=digest(b))
        if path != CATALOG:
            expected = next(f for f in catalog['files'] if f['path'] == path)
            assert record['sha256'] == expected['sha256'] and len(b) == expected['byteLength']
        relative = path.removeprefix('docs/shared/ai-connection/reference/')
        target = OUT / 'received-reference' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b)
        files.append(record)
        acquisition.append(dict(**record, repository=REPO, commit=REF,
            gitBlob=subprocess.check_output(['git','rev-parse',REF+':'+path],cwd=ROOT,text=True).strip(),
            receivedPath=str(target.relative_to(ROOT)), url=f'https://github.com/{REPO}/blob/{REF}/{path}'))

    references = {}
    for path in [f['path'] for f in catalog['files']]:
        d = json.loads(raw(REF, path))
        for record in d.get('records', []):
            references[record.get('recordId', record.get('normId', record.get('ruleId')))] = record
    norms = json.loads(raw(REF, 'docs/shared/ai-connection/reference/norms.v1.json'))['rules']

    assets = {}
    def asset(path, commit=OWNER, kind='source'):
        key = commit + ':' + path
        if key not in assets:
            b = raw(commit, path)
            assets[key] = dict(id=key, commit=commit, path=path, byteLength=len(b), sha256=digest(b), kind=kind)
        return key

    info = raw(OWNER, P+'api/build-info.mjs').decode()
    build_id = re.search(r'BUILD_ID="([^"]+)"', info)[1]
    closure = json.loads(re.search(r'Object.freeze\((\{.*\})\);', info, re.S)[1])
    source_closure = []
    for relative, h in closure.items():
        # posix normalization independent of provider-local absolute paths.
        import posixpath
        path = posixpath.normpath(P+'api/'+relative)
        key = asset(path, kind='native-build-source')
        assert assets[key]['sha256'] == h
        source_closure.append(key)
    asset(P+'api/build-info.mjs', kind='native-build-identity')

    def accepted(path, scope, base_kind, gate, refs, coverage='PARTIAL', numeric_status='PASS'):
        return dict(contractStatus='COMPATIBLE', numericStatus=numeric_status,
            readiness='READY' if numeric_status == 'PASS' else 'BLOCKED',
            scope=scope, coverage=coverage, baseKind=base_kind, freshRun=False,
            receiptRefs=[asset(path,kind='reused-numerical-receipt')],
            referenceRefs=[asset(p,commit=c,kind='independent-reference') for c,p in refs], gate=gate)

    profiles = []
    def add(record_id, sources, kernels, validation):
        record = references[record_id]
        profiles.append(dict(recordId=record_id, nativeProfileId=record['nativeProfileId'],
            nativeContract=record['nativeContract'], declarations=record['requiredDeclarations'],
            ownerSourceCommit=OWNER, ownerNativeBuildId=build_id,
            sourceRefs=[asset(path) for path in sources],
            kernelRefs=[asset(path,kind='loaded-kernel') for path in kernels],
            validation=validation, generationReady=False))

    add('EXEC-BERNINI-Q16-F32', [P+'ort-bridge/stage.mjs',P+'ort-bridge/graph.mjs',P+'lora/diagnostic-consumer.mjs'],
        [P+'ort-bridge/kernel/bridge.wasm','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'],
        accepted(E+'l1-final-browser.json','selected Q16 output, explicit activation, real retained base; consumer fixtures, not real LoRA original acceptance',
            'actual-retained-Bernini-selected-base', dict(metric='absolute-plus-relative',absolute=1e-6,relative=1e-5,
                scope='all16 consumer outputs for explicit activation only',sourceCommit=OWNER),
            [(OWNER,E+'l1-reference.json')]))
    add('EXEC-FP8-SCALAR-F32',[P+'lora/diagnostic-base.mjs',P+'lora/base-block.mjs',P+'ort-bridge/hike.mjs'],
        [P+'ort-bridge/kernel/bridge.wasm'],
        accepted(E+'e1-block/browser.json','selected actual base FP8 weight/F16 bias decode and real ORT/Hike; range integrity is not whole-file authentication',
            'actual-retained-Bernini-bounded-fragments',dict(metric='exact-F32-bytes',scope='provided Q16 weight and bias ranges only',sourceCommit=OWNER),
            [(OWNER,E+'l1-reference.json')]))
    add('EXEC-BERNINI-SIMPLE6-SHIFT5',[P+'scheduler/scheduler-kernel.mjs',P+'scheduler/scheduler.hike'],
        [P+'scheduler/build/scheduler.wasm'],
        accepted(E+'regression-1.log','fixed simple6/shift5/split3 schedule and explicit-array primitives; no model prediction',
            'explicit-numeric-fixture',dict(metric='source-ordered-F32-exact',scope='fixed schedule and caller-array primitive fixtures',sourceCommit=OWNER),
            [(OWNER,P+'scheduler/test-cases.mjs')]))
    add('EXEC-ATTENTION-Q16-ONEHEAD',[P+'ort-bridge/stream-attention/stage.mjs',P+'ort-bridge/stream-attention/graph.mjs',P+'ort-bridge/stream-attention/hike.mjs'],
        [P+'ort-bridge/stream-attention/kernel.wasm','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'],
        accepted(E+'e7-attention/browser-green.json','EXPLICIT_Q16_ONE_HEAD_ALL_KEYS; postnorm/RoPE F32 fixture, all declared32760 keys; productionQKVVerified=false',
            'deterministic-postnorm-rope-QKV-fixture',dict(metric='absolute-plus-relative',absolute=1e-5,relative=1e-4,
                scope='selected16 queries, one head, all declared keys; not production QKV',sourceCommit=OWNER),
            [(OWNER,E+'e7-attention/reference.json'),(OWNER,'tools/diffusion-models/e7-attention-reference.py')]))

    for record_id in ['NORM-WAN21-MEAN-F5','NORM-WAN21-MEAN-F1','NORM-WAN21-MEAN-RECT']:
        f5 = record_id.endswith('-F5')
        receipt = E+'e6/rect-legacy-regression.json' if f5 else E+'e6/rect-browser-results.json'
        refs = [(F5,P+'latent-space/test-cases.mjs'),(F5,P+'latent-space/README.md'),
                (F5,'development/diffusion-models/rev3-latent-space.json')] if f5 else [
                (OWNER,E+'e6/reference-received.py'),(OWNER,E+'e6/reference-received.json'),(OWNER,E+'e6/RECT-RESULT.md')]
        gate = dict(metric='maximum-absolute-roundtrip',maximumAbsoluteError=2e-6,
            perDirectionComparison='exact staged-F32 all values',sourceCommit=F5 if f5 else OWNER,
            scope='synthetic F5 posterior-mean fixture only' if f5 else 'received actual VAE mean for this exact F1/Rect profile only',
            appliesToActualVaeEncodeDecode=False)
        v = accepted(receipt, gate['scope'],'synthetic-F5-mean-fixture' if f5 else 'Git-received-actual-VAE-mean',gate,refs)
        if f5:
            v['referenceCatalogGateStatus']='NOT_VERIFIED_FOR_F5_IN_THIS_CATALOG'
            v['ownerSupplement']='F5 original test/README and original receipt independently obtained; not inferred from F1/Rect'
            v['chronologyLimit']='Original source/receipt explicitly label the gate predeclared; no independent timestamp attestation before first run'
        add(record_id,[P+'latent-space/latent-space.mjs',P+'latent-space/latent-space.hike',P+'tensor-interop.mjs'],
            [P+'latent-space/build/latent-space.wasm'],v)

    add('NORM-RAW-GENERATED-DECLARATION',[P+'api/worker.mjs',P+'API.md'],[],
        dict(contractStatus='UNVERIFIED',numericStatus='NOT_VERIFIED',readiness='BLOCKED',
            scope='No actual generated producer or restoration; VAE consumer declaration is not a numerical receipt',
            coverage='UNIMPLEMENTED',baseKind=None,freshRun=False,receiptRefs=[],referenceRefs=[],gate=None,
            missingReason='Real generated producer/restore/independent reference and decode acceptance are not implemented'))
    generated = profiles[-1]
    generated['nativeContract'] = None
    generated['referenceConsumerContract'] = references['NORM-RAW-GENERATED-DECLARATION']['nativeContract']
    generated['declarationsKind'] = 'external-VAE-consumer-requirements; not a Diffusion restoration operation'
    generated['externalConsumer'] = dict(owner='vae',sourceRefs=references['NORM-RAW-GENERATED-DECLARATION']['sourceRefs'][:2],
        verification='Reference catalog declaration only; actual VAE consumer bytes are not verified by this P0 sidecar')

    source = lambda field,path,location,kind='declaration':dict(managerField=field,kind=kind,
        sourceRef=asset(P+path),nativeFieldPath=location)
    reads = {
      'N-IDENTITY':[source('nativeContract','api/index.mjs','PROTOCOL_VERSION'),source('buildId','api/build-info.mjs','BUILD_ID'),
          source('assetHashAndLength','api/build-info.mjs','BUILD_SOURCES and sidecar.assets[].byteLength')],
      'N-SHAPE':[source('shape/dtype/layout/semantic/byteLength','tensor-interop.mjs','requireWanConditioning / requireWanRawLatent / requireWanRawLatentF1 / requireWanRawLatentRect'),
          source('nativeProfileId','api/worker.mjs','result.profileId or result.evidence.profileId')],
      'N-NUMERIC':[source('executionProfileId','lora/diagnostic-base.mjs','describe().executionProfileId'),
          source('precisionProfile','ort-bridge/stream-attention/stage.mjs','describe().precisionProfile; executionProfileId remains undefined'),
          source('ownerValidationReceipt/gateRef/scope','lora/diagnostic-consumer.mjs','validate() receipt; explicit x/expected/tolerance')],
      'N-NORMALIZATION':[source('normalizationProfile/semantic','latent-space/latent-space.mjs','NORMALIZATION / NORMALIZED_MEAN / output.meaning'),
          source('transformTraceRef','api/worker.mjs','result.evidence.profileId / hikeWasmSHA256 / hike')],
      'N-LOADER':[source('inputKind/sourceHash/registryBinding','lora/diagnostic-base.mjs','original File / describe().modelHash,graphHash,registryHash'),
          source('FP8Profile','lora/base-block.mjs','describe().fp8ProfileId; actual provided range/scale/config checks')],
      'N-MAPPING':[source('registryIdentityPair/selectionRegion','lora/DIAGNOSTIC_API.md','native modelHash/graphHash/registryHash and selected row transform')],
      'N-EVIDENCE':[source('coverage/scope/baseKind/referenceId','lora/diagnostic-consumer.mjs','validation receipt.scope / evidence; explicit expected independent reference'),
          source('currentness','lora/diagnostic-consumer.mjs','candidate epoch / context.isCurrent()', 'dynamic-owner-state')],
      'N-TRANSACTION':[source('nativeRevisions','api/index.mjs','request.sessionId/jobId/inputRevision/buildId', 'dynamic-owner-state'),
          source('ownership/recoveryState','lora/diagnostic-consumer.mjs','candidate epoch / package ownership / rollback / dispose', 'dynamic-owner-state')],
      'N-ARTIFACT':[source('nativeHashNamespaces','lora/diagnostic-consumer.mjs','native packageHash; separate native registryHash/modelHash/graphHash'),
          source('context','latent-space/latent-space.mjs','contextCopy(): known context fields copied with source frame order/duplicates')],
      'N-LEGACY':[source('bindingKind/coverage','lora/DIAGNOSTIC_API.md','runtime-input weight / hike-parameter bias; PARTIAL never initializer/FULL')],
      'N-GENERATION':[source('nativeReadiness','api/worker.mjs','load/predict/sample => NOT_READY'),
          source('coverage/scope','api/index.mjs','capabilities().modelInference=false / partialOnly=true')],
      'N-EXTENSION':[source('moduleDescriptor/requiredFeatures','API.md','native operation/profile allowlists; unknown op/profile rejected')]
    }
    norm_bindings = []
    for n in norms:
        norm_bindings.append(dict(normId=n['normId'], decisionOwner=n['decisionOwner'],nativeReads=reads[n['normId']],
            profileRecordRefs=[p['recordId'] for p in profiles if p['recordId'] in n.get('profileRefs',[])],
            externalOwnerRequirements=({'N-MAPPING':'LoRA createDiffusionDiagnosticAdapter is authoritative; do not stack the historical Diffusion v2-adapter or manager bridge',
              'N-TRANSACTION':'Manager owns requestId/resource generation; SDK owner owns local revisions; runtime current values must be supplied',
              'N-ARTIFACT':'Manager/codec owns package and optional metadata; native transform emits its known tensor/context subset only; keep extra metadata outside the native tensor',
              'N-LOADER':'LoRA owns local File variant/strength/low-rank policy and source hashes; Diffusion owns actual immutable base decode',
              'N-LEGACY':'LoRA owner alone decides v1 actual-initializer/FULL acceptance',
              'N-NORMALIZATION':'VAE RGB/Text RMSNorm and real generated decode are separate owner declarations; no missing gate inferred',
              'N-GENERATION':'Full session and combined production resource budgets remain unaccepted'}).get(n['normId'],'Manager compares declarations and scoped owner evidence; runtime adoption is separate')))

    candidate = dict(sourceCommit=None,buildId=None,sourceClosureRefs=[],numericAcceptance='NOT_VERIFIED',
        reason='No new committed candidate supplied; fixed baseline evidence is not reassigned to a future build')
    if args.candidate_commit:
        commit = subprocess.check_output(['git','rev-parse',args.candidate_commit+'^{commit}'],cwd=ROOT,text=True).strip()
        b = raw(commit,P+'api/build-info.mjs')
        candidate_closure=json.loads(re.search(r'Object.freeze\((\{.*\})\);',b.decode(),re.S)[1])
        candidate_sources=[]
        import posixpath
        for relative,h in candidate_closure.items():
            path=posixpath.normpath(P+'api/'+relative)
            key=asset(path,commit,kind='candidate-build-source')
            assert assets[key]['sha256']==h
            candidate_sources.append(key)
        candidate=dict(sourceCommit=commit,buildId=re.search(r'BUILD_ID="([^"]+)"',b.decode())[1],
            buildInfoRef=asset(P+'api/build-info.mjs',commit,kind='candidate-build-identity'),
            sourceClosureRefs=candidate_sources,
            numericAcceptance='NOT_VERIFIED',reason='Code/build candidate only. Baseline receipts retain their original source/build; changed-boundary acceptance is separate')

    declaration = dict(schemaVersion='diffusion-owner-profile-bindings/0.1',documentVersion='1.0-draft.1',
        status='owner-sidecar',runtimeIntegrated=False,generationReady=False,
        referenceSet=dict(repository=REPO,commit=REF,files=files,catalogPath=CATALOG,catalogSha256=digest(catalog_bytes)),
        baselineOwner=dict(repository=REPO,sourceCommit=OWNER,nativeContract='diffusion-models/0.1',buildId=build_id,sourceClosureRefs=source_closure),
        candidateBuild=candidate,managementAdoption=dict(isNewCandidateAccepted=False,
            catalogAdoptionSetId='ADOPT-MANAGER-285967',adoptedDiffusionCommit='438972f30242e0a3bc66edb8591f38eaa0fcd384',
            ownerBaselineIsManagementAdoption=False),
        mappingAuthority=dict(ownerRole='LoRA',factory='createDiffusionDiagnosticAdapter',adapterVersion='lora-diffusion-diagnostic-adapter/0.1',
            historicalDiffusionAdapter=dict(path=P+'lora/v2-adapter.mjs',sourceCommit=OWNER,status='regression-only; do not stack with owner adapter')),
        reusedProfiles=profiles,normBindings=norm_bindings,
        capacityDomains=dict(nativePublicPointwiseMaxElements=1048576,internalSchedulerMaxElements=4194304,
            textConditioningMaxElements=2097152,productionLatentElements=2096640,capacityTransferAllowed=False),
        metadataPolicy=dict(nativeContextFields=['schemaVersion','contextId','inputId','inputSha256','slotId','sourceFrameIndices','sourceFrameTimesSeconds'],
            frameOrderAndDuplicatesPreserved=True,unknownNativeContextKeys='rejected by native contextCopy',optionalMetadataOwner='manager/codec outer sidecar',
            rawMeanAndGeneratedSampleAreInterchangeable=False),assets=list(assets.values()))
    put(PROFILES/'p0-bindings.json',declaration)
    put(OUT/'p0-acquisition.json',dict(referenceCommit=REF,files=acquisition,receivedSourceBytes=sum(f['byteLength'] for f in files),
        wholeModelPayloadsRead=False,numericalExecutionPerformed=False))
    put(OUT/'p0-evidence-index.json',dict(schemaVersion='diffusion-owner-evidence-index/0.1',
        evidenceSourceCommit=OWNER,reusedNumericalEvidence=True,freshInferencePerformed=False,
        declarationPath='docs/shared/diffusion-models/profiles/p0-bindings.json',
        declarationBytes=(PROFILES/'p0-bindings.json').stat().st_size,declarationSha256=digest((PROFILES/'p0-bindings.json').read_bytes()),
        records=[dict(recordId=p['recordId'],validation=p['validation']) for p in profiles]))
    print(json.dumps(dict(profiles=len(profiles),norms=len(norm_bindings),assets=len(assets),declarationSha256=digest((PROFILES/'p0-bindings.json').read_bytes()))))

if __name__ == '__main__':
    main()
