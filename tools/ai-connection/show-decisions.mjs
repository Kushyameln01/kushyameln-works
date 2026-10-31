// Run with Node; all outputs are explicitly synthetic declaration fixture decisions.
import { evaluateEdge } from '../../docs/shared/ai-connection/compatibility.mjs';
import { edgeFixture } from './fixtures.mjs';
const cases={
  compatible:q=>q,
  meanSample:q=>{q.artifact.tensor.nativeMeaning='sample';return q;},
  unknownSchema:q=>{q.registry.schemas=[];return q;},
  missingMetadata:q=>{delete q.artifact.native.metadata.meaning;return q;},
  staticCapacity:q=>{q.consumerPort.tensor.maxElements=3;return q;},
  transientRam:q=>{q.resourceState.budgetBytes=10;return q;},
  unverifiedNumeric:q=>{q.requiredScopes=['real-restoration'];return q;},
  concreteAdapter:q=>{
    q.artifact.semantics.spaceId=q.producerPort.semantics.spaceId='normalized';
    q.producerPort.allowedAdapterRefs=q.consumerPort.allowedAdapterRefs=['fixture:restore/1'];
    q.adapters=[{adapterId:'fixture:restore/1',version:'1',owner:'numerical-owner',sourceRef:q.producerPort.sourceRef,
      available:true,profiles:[q.consumerPort.profileRef],rules:[{fieldPath:'/semantics/spaceId',from:'normalized',to:'raw',reason:'Synthetic exact-space restoration rule'}],evidenceRefs:[]}];return q;
  },
};
console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([name,make])=>[name,evaluateEdge(make(edgeFixture()))])),null,2));
