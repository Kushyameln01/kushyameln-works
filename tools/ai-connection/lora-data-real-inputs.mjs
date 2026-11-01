// Receiver declaration assembly only. This never constructs an opaque SDK
// plan, evaluates norms, supplies future receipts or performs model arithmetic.
const clone=structuredClone;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const REPO='Kushyameln01/kushyameln-works';
const alias=pin=>{requireValue(pin&&[REPO,'https://github.com/'+REPO].includes(pin.repository)&&/^[a-f0-9]{40}$/.test(pin.commit)&&typeof pin.path==='string','Explicit native source pin required');return {repository:REPO,commit:pin.commit,path:pin.path};};
export function createLoraDataRealEdgeInput({referenceSet,candidateSet,sourcePins,binding,inspection,sourceSha256,
  sdkInstanceId,selection,strength,referenceInputs,expectedOutputSha256,projectionTolerance,
  executionKernelDigest,consumerBinding,resourceState,environment,artifactId}={}){
  const owner=binding?.owner??binding,native=owner?.nativeRegistry,connection=owner?.connectionRegistry;
  requireValue(referenceSet&&native&&connection&&inspection?.tensors&&hex(sourceSha256)&&hex(expectedOutputSha256)
    &&hex(executionKernelDigest)&&typeof sdkInstanceId==='string'&&typeof environment==='string'&&artifactId,
  'Actual public source/header/registry declarations and predeclared reference required');
  requireValue(selection?.pairId==='light'&&selection.noise==='high'&&native.side==='HIGH'&&Number.isFinite(strength),
    'This receiver is deliberately limited to selected local light/HIGH');
  const weight=native.targets.find(t=>t.weightId==='q.weight'),bias=native.targets.find(t=>t.weightId==='q.bias');
  const target=connection.targets.find(t=>t.weightId==='q.weight'),key=weight?.key;
  requireValue(weight&&bias&&target&&weight.transform?.rowStart===0&&weight.transform.rowCount===16
    &&weight.transform.columnStart===0&&weight.transform.columnCount===5120&&bias.transform.rowStart===0&&bias.transform.rowCount===16,
  'Leading16 Q rows/allcolumns and matching16 bias are required');
  const down=inspection.tensors[key.slice(0,-'.weight'.length)+'.lora_down.weight'];
  requireValue(down&&['BF16','F16','F32'].includes(down.dtype),'Actual supported Q factor dtype required');
  const pins=Object.fromEntries(['sdk','adapter','kernel','diffusion'].map(name=>[name,alias(sourcePins[name])]));
  const selected=clone(consumerBinding),producerRef='lora:'+sdkInstanceId,consumerRef='diffusion:'+native.registryHash;
  const shape=clone(weight.shape),axes=['O','I'],meaning='works:selected-q-weight-f32:v1';
  const semantics={schemaId:'works:receiver-q16-weight',schemaVersion:'1',spaceId:'selected-q-weight',unit:'model-weight-value',normalization:'none'};
  const port=(bindingRef,sourceRef,version,build)=>({portId:bindingRef,bindingRef,owner:bindingRef,sourceRef,
    nativeAPI:{version,build,transport:'direct',entrypoint:sourceRef.path},artifactKind:'tensor',semantics:clone(semantics),profileRef:native.executionProfileId,
    tensor:{dtypes:['float32'],axes:clone(axes),shape:clone(shape)},requiredMetadata:['/meaning'],requiredIdentities:[],
    ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]});
  const producerPort=port(producerRef,pins.sdk,'lora-connection/2.0-draft.1',sourcePins.kernel.sha256),consumerPort=port(consumerRef,pins.diffusion,native.schemaVersion,executionKernelDigest);
  const selectionRegion=[weight,bias].map(t=>({key:t.key,slice:{startRow:t.transform.rowStart,rowCount:t.transform.rowCount}}));
  const numeric={scope:'p3:actual-q16-projection',recordId:'EXEC-BERNINI-Q16-F32',ownerSourceRef:pins.diffusion,kernelDigest:executionKernelDigest,
    gateRef:{...clone(referenceInputs.gateIdentity),sourceRef:alias(referenceInputs.gateIdentity.sourceRef),tolerance:clone(projectionTolerance)},
    referenceRef:{...clone(referenceInputs.referenceIdentity),sourceRef:alias(referenceInputs.referenceIdentity.sourceRef),expectedOutputSha256}};
  const evidenceTarget={artifactRef:artifactId,profileRef:native.executionProfileId,coverage:'PARTIAL',scope:'diagnostic-projection',
    baseKind:'actual-original-bounded-fragments',referenceId:numeric.referenceRef.referenceId};
  return {producerPort,consumerPort,artifact:{contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',
    native:{schemaId:'works:receiver-q16-metadata',schemaVersion:'1',payloadRef:'native:prepared-q-weight',metadata:{meaning}},
    semantics:clone(semantics),profileRef:native.executionProfileId,tensor:{dtype:'float32',shape,axes,nativeMeaning:meaning,dataRef:'native:prepared-q-weight'},
    provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[sourceSha256],sourceFrames:[]},snapshotId:null,
    ownership:{ownerId:producerRef,mode:'copy'},extensions:{}},adapters:[],requiredScopes:[],evidence:[],
    registry:{schemas:[{schemaId:semantics.schemaId,schemaVersion:'1',nativeMeanings:[meaning]},{schemaId:'works:receiver-q16-metadata',schemaVersion:'1'}],roles:['diagnostic-owner']},
    implementationState:{producer:{bindingRef:producerRef,state:'implemented',roles:['diagnostic-owner'],operationId:'prepare'},
      consumer:{bindingRef:consumerRef,state:'implemented',roles:['diagnostic-owner'],operationId:'validate'}},resourceState:clone(resourceState),
    // These are explicit outside selection tokens. They are not SDK-local
    // counters, native consumer epochs or a common revision for HIGH and LOW.
    activeBindings:{producer:{bindingRef:producerRef,ownerId:producerRef,valid:true,revisionNamespace:'outside-selected-producer',
      expectedRevision:'producer:'+selected.revision,currentRevision:'producer:'+selected.revision},
      consumer:{bindingRef:consumerRef,ownerId:consumerRef,valid:true,revisionNamespace:selected.namespace,
        expectedRevision:selected.revision,currentRevision:selected.revision}},
    referenceContext:{referenceSet,environment,normIds:['N-IDENTITY','N-LOADER','N-MAPPING','N-NUMERIC','N-EVIDENCE','N-TRANSACTION'],
      candidateSet:clone(candidateSet),identityBindings:[{side:'producer',module:'lora',loadedSourceRef:pins.sdk,kernelDigest:sourcePins.kernel.sha256,byteLength:sourcePins.kernel.byteLength},
        {side:'consumer',module:'diffusion',loadedSourceRef:pins.diffusion}],
      profileBindings:[{recordId:'LOAD-COMFY-LINEAR-DIFF',side:'producer'},{recordId:'LOAD-LOCAL-SAFETENSORS',side:'producer'},{recordId:'EXEC-BERNINI-Q16-F32',side:'consumer'}],
      nativeDeclarations:{producer:{loaderPolicyId:connection.loaderPolicyId,variant:'linear-down-up',sourceDtype:down.dtype,
        baseDtype:weight.computeDtype??null,outputDtype:target.dtype??null,layout:target.layout??null,targetRank:weight.fullShape.length,strength,inputKind:'local-file',sourceHash:sourceSha256},
        consumer:{nativeProfileId:native.executionProfileId,kernelDigest:executionKernelDigest,weightShape:clone(weight.shape),biasShape:clone(bias.shape),
          activationShape:[weight.shape[1]],outputShape:clone(bias.shape),fullWeightShape:clone(weight.fullShape),originalTarget:weight.originalKey,
          bindings:{weight:weight.binding.kind+':'+weight.binding.name,bias:bias.binding.kind+':'+bias.binding.name},coverage:'PARTIAL',graphSHA256:native.graphHash}},
      numericRequirements:[numeric],evidenceTarget,
      mapping:{ownerRole:'LoRA',factory:'createDiffusionDiagnosticAdapter',adapterVersion:owner.adapterVersion,duplicateMappingAllowed:false,regressionOnly:false,
        nativeRegistryHash:owner.nativeRegistryHash,connectionRegistryHash:owner.connectionRegistryHash,fullShape:clone(weight.fullShape),selectionRegion,sourceHash:sourceSha256,
        ownerBinding:{nativeRegistryHash:owner.nativeRegistryHash,connectionRegistryHash:owner.connectionRegistryHash},
        planBinding:{fullShape:clone(weight.fullShape),selectionRegion:clone(selectionRegion),sourceHash:sourceSha256}}}};
}
