import {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID} from '../../../../docs/shared/ai-connection/workflow-shapes.mjs';

export const PROFILE='bernini-target65520-four-stores-ffn-down128-capacity-diagnostic-v1';
export const INPUT_ROWS=128,INPUT_INNER=13824,OUTPUT_COLUMNS=5120;
export const inputValue=(row,column)=>((row*7+column*3)%23-11)/32;
export const workflowRequest=()=>({
 ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:81,height:480,width:832},refMaxSize:832,
 geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},
 media:{sourceVideo:{state:'present',rgb:{frames:81,height:480,width:832}},referenceVideo:{state:'absent'},slots:[]}
});

export function capacityPlan(){
 const canonical=deriveWorkflowShapes(workflowRequest());
 if(canonical.concatenation.totalTokens!==65520||canonical.target.tokenCount!==32760||canonical.orderedContexts.entries.length!==1)throw Error('Canonical target/source81 geometry mismatch');
 const tokens=canonical.concatenation.totalTokens,width=5120,storeBytes=tokens*width*4;
 const components={
  fourHostStores:4*storeBytes,
  ffnStageCache:(13824*5120+5120*13824)*4,
  controlledInput:INPUT_ROWS*INPUT_INNER*4,
  operatorWeightSnapshot:OUTPUT_COLUMNS*INPUT_INNER*4,
  operatorInputSnapshot:INPUT_ROWS*INPUT_INNER*4,
  projectionOutput:INPUT_ROWS*OUTPUT_COLUMNS*4,
  operatorHostOutputIntermediate:INPUT_ROWS*OUTPUT_COLUMNS*4,
  biasedOutput:INPUT_ROWS*OUTPUT_COLUMNS*4,
  biasInputSnapshot:INPUT_ROWS*OUTPUT_COLUMNS*4,
  biasBroadcastSnapshot:OUTPUT_COLUMNS*4,
  biasChunkOwnedOutput:327680,
  independentReference:INPUT_ROWS*OUTPUT_COLUMNS*4,
  inputHashSnapshotAllowance:INPUT_ROWS*INPUT_INNER*4,
  outputHashSnapshotAllowance:INPUT_ROWS*OUTPUT_COLUMNS*4,
  sourceRawDecodeBlock:163840,
  sourceOwnedDecodeBlock:327680,
  weightPageSnapshots:Math.ceil((13824*5120+5120*13824)/1024+8)*4,
  bias:OUTPUT_COLUMNS*4,
  modelMathArenaAndSourceWasm:9175040+1572864+1835008,
  sourceHostLookupTables:368640,
 };
 const namedBytes=Object.values(components).reduce((a,b)=>a+b,0);
 const reservations={ortAllocator:1073741824,otherJsAndAllocator:1073741824,safety:2147483648};
 const namedPlusRuntimeReservations=namedBytes+reservations.ortAllocator+reservations.otherJsAndAllocator;
 if(storeBytes>=2147483648||namedPlusRuntimeReservations>8*1073741824)throw Error('Prepared capacity admission budget exceeded');
 return {profile:PROFILE,targetShape:[1,16,21,60,104],sourceShape:[1,16,21,60,104],targetTokens:canonical.target.tokenCount,totalTokens:tokens,hostStoreShape:[1,tokens,width],hostStoreCount:4,hostStoreBytes:storeBytes,components,namedBytes,reservations,namedPlusRuntimeReservations,withSafety:namedPlusRuntimeReservations+reservations.safety,
  budgetMeaning:'Named spans plus unverified runtime reservations, not a measured peak or hard allocator bound',
  semantics:'Capacity-sentinel storage, not real model hidden states; conservative four-store/FFN-cache overlap, not the actual stage schedule',
  actualCandidateSchedule:'Self-attention uses four hidden stores; FFN normally uses one remaining hidden store. This diagnostic keeps all four while testing the FFN-down tile.'};
}

export function createControlledInput(){
 const input=new Float32Array(INPUT_ROWS*INPUT_INNER);
 for(let row=0;row<INPUT_ROWS;row++)for(let column=0;column<INPUT_INNER;column++)input[row*INPUT_INNER+column]=inputValue(row,column);
 return input;
}
