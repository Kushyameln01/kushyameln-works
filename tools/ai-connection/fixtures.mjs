// Synthetic declaration fixtures only; no model or native runtime execution.
const sourceRef = { repository:'fixture:standalone', commit:'a'.repeat(40), path:'api.mjs' };
export function edgeFixture() {
  const semantics = { schemaId:'fixture:latent', schemaVersion:'1', spaceId:'raw', unit:'unitless', normalization:'none' };
  const port = (bindingRef) => ({portId:bindingRef, bindingRef, owner:bindingRef, sourceRef,
    nativeAPI:{ version:'fixture/1', build:'fixture-build-1', transport:'direct', entrypoint:'api.mjs' },
    artifactKind:'tensor', semantics:structuredClone(semantics), profileRef:'fixture:tiny/1',
    tensor:{ dtypes:['float32'], axes:['B','C'], shape:[1,4] },
    requiredMetadata:['/meaning'], requiredIdentities:[], ownershipModes:['copy'], transports:['direct'], allowedAdapterRefs:[], requiredExtensionSchemas:[]});
  const producerPort=port('producer'),consumerPort=port('consumer');
  return {producerPort,consumerPort,
    artifact:{ contractVersion:'works-module-contract/1.0-draft.1',artifactId:'a',kind:'tensor',
      native:{schemaId:'fixture:native',schemaVersion:'1',payloadRef:'payload:a',metadata:{meaning:'mean'}},
      semantics,profileRef:'fixture:tiny/1',tensor:{dtype:'float32',shape:[1,4],axes:['B','C'],nativeMeaning:'mean',dataRef:'payload:a'},
      provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,
      ownership:{ownerId:'producer',mode:'copy'},extensions:{}},adapters:[],
    registry:{schemas:[{schemaId:'fixture:latent',schemaVersion:'1',nativeMeanings:['mean']},{schemaId:'fixture:native',schemaVersion:'1'}],roles:['tensor-transform']},
    implementationState:{producer:{bindingRef:'producer',state:'implemented',roles:['tensor-transform'],operationId:'emit'},consumer:{bindingRef:'consumer',state:'implemented',roles:['tensor-transform'],operationId:'consume'}},
    requiredScopes:['fixture'],evidence:[{evidenceId:'ev:fixture',scope:'fixture',result:'pass',subjectRefs:['producer','consumer'],
      contractRefs:['fixture/1','fixture-build-1','a'.repeat(40)],artifactRef:'a',profileRef:'fixture:tiny/1',inputConditions:{shape:[1,4],dtype:'float32',coverage:'fixture',environment:'node'}}],
    resourceState:{status:'available',ownerId:'manager',requiredBytes:16,budgetBytes:100,occupiedBytes:0},
    activeBindings:{producer:{bindingRef:'producer',valid:true,ownerId:'producer',currentRevision:2,expectedRevision:2},consumer:{bindingRef:'consumer',valid:true,ownerId:'consumer',currentRevision:3,expectedRevision:3}}};
}
