import {freeze} from './planner.mjs';

// Owner-maintained evidence of bounded runtime target compatibility. This is
// neither training metadata from the original nor proof of training-base identity.
// The record authorizes only the already compared original full-coordinate range.
export const KNOWN_P4_SOURCE_BINDINGS=freeze([{
 ownerRecordId:'lora-owner:c486057:light:LOW:cross-q4-and-bias4',
 scope:'verified-runtime-target-range',
 sourceSha256:'86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b',
 modelHash:'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3',
 graphHash:'9c3bbaf2488a763ab56a96a8f5ddfc65510bf197799ed83b9f6ead512cf7a52e',
 side:'LOW',executionProfileId:'bernini-block0-n2-cross-ffn-f32-candidate-v1',
 loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1',trainingBaseVerified:false,
 evidenceRef:{repository:'Kushyameln01/kushyameln-works',commit:'c4860579d01d9f704cb16714e364a22668f9d57e',path:'development/ai-connection/lora-p4-adapter/RESULT.json',runtimeSourceCommit:'a80db72feea60b9bd69e292e4716665c6f0ee77f',scope:'controlled-caller-input-n2-k4; real light LOW cross-Q first4 complete rows and explicit bias4; PARTIAL'},
 targets:[
  {weightId:'blocks.0.cross_attn.q.weight',fullShape:[5120,5120],ranges:[{offset:0,count:20480}]},
  {weightId:'blocks.0.cross_attn.q.bias',fullShape:[5120],ranges:[{offset:0,count:4}]}
 ]
}]);
