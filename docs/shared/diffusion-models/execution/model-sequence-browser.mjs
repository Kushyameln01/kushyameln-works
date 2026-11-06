import {createModelSequence} from './model-sequence.mjs';
import {BERNINI_WORKFLOW_RULE_ID,deriveWorkflowShapes} from '../../ai-connection/workflow-shapes.mjs';

const demand=(condition,message)=>{if(!condition)throw Error(message);};
const absent=()=>({state:'absent'});
function request(overrides={}){
 const semantics={};for(const role of ['target-latent','source-latent','reference-latent','context-latent'])semantics[role]={meaning:role==='target-latent'?'bernini-generated-model-latent:v1':'wan21-normalized-posterior-mean:v1',normalization:'wan21-comfy-f32-v1'};
 return {ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:81,height:480,width:832},refMaxSize:832,geometry:{rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],temporalRule:'first-then-groups-floor',patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',concatOrder:'target-first',paddingMode:'none'},semantics,media:{sourceVideo:absent(),referenceVideo:absent(),slots:[]},...overrides};
}
function tensorsFor(shapeRequest){
 const canonical=deriveWorkflowShapes(shapeRequest),ids=['target.latent',...canonical.orderedContexts.entries.map(entry=>entry.contextKey+'.latent')];
 return ids.map((id,index)=>{const r=canonical.requirements.find(r=>r.requirementId===id);return {requirementId:id,shape:r.shape.slice(),dtype:r.dtype,meaning:r.meaning,normalization:r.normalization,data:Float32Array.from({length:r.shape.reduce((a,b)=>a*b,1)},(_,i)=>(i%8191-4095)/8+index*2048)};});
}
function headOrder(patches,rows){
 const output=new Float32Array(rows*64);for(let row=0;row<rows;row++)for(let c=0;c<16;c++)for(let py=0;py<2;py++)for(let px=0;px<2;px++)output[row*64+(py*2+px)*16+c]=patches[row*64+c*4+py*2+px];return output;
}

/** Portable layout diagnostic. Inputs are controlled tensors, not encoded media. */
export function runModelSequenceBrowser(){
 const shapeRequest=request(),tensors=tensorsFor(shapeRequest),owner=createModelSequence({shapeRequest,tensors}),description=owner.describe(),output=new Float32Array(tensors[0].data.length);
 let patchComparedElements=0,roundtripComparedElements=0,patchMismatches=0,roundtripMismatches=0,rowsProcessed=0,storedElements=0;
 try{
  demand(description.totalTokens===32760&&output.length===2096640,'Actual target shape/count mismatch');
  for(let start=0;start<description.totalTokens;start+=128){
   const rows=Math.min(128,description.totalTokens-start),patches=owner.readPatchRows(start,rows);
   for(let row=0;row<rows;row++){
    const local=start+row,t=Math.floor(local/1560),h=Math.floor(local/52)%30,w=local%52;
    for(let c=0;c<16;c++)for(let py=0;py<2;py++)for(let px=0;px<2;px++){
     if(patches[row*64+c*4+py*2+px]!==tensors[0].data[((c*21+t)*60+h*2+py)*104+w*2+px])patchMismatches++;patchComparedElements++;
    }
   }
   storedElements+=owner.writeTargetHeadRows(headOrder(patches,rows),start,output).writtenElements;rowsProcessed+=rows;
  }
  for(let i=0;i<output.length;i++){if(output[i]!==tensors[0].data[i])roundtripMismatches++;roundtripComparedElements++;}
  demand(patchMismatches===0&&roundtripMismatches===0,'All-value actual target layout comparison failed');
  const last=owner.readPositions(description.totalTokens-1,1);demand(JSON.stringify([...last.positions])==='[20,29,51]'&&last.sourceIds[0]===0,'Actual target final position mismatch');
 }finally{owner.dispose();}
 const mixedRequest=request({target:{batch:1,frames:9,height:32,width:48},refMaxSize:64,media:{sourceVideo:{state:'present',rgb:{frames:10,height:50,width:70}},referenceVideo:{state:'present',rgb:{frames:5,height:32,width:64}},slots:[{slotIndex:5,wired:{state:'present',rgb:{frames:2,height:16,width:32}},editor:absent()},{slotIndex:1,wired:absent(),editor:{state:'present',rgb:{frames:1,height:32,width:16}}}]}}),mixedTensors=tensorsFor(mixedRequest),mixed=createModelSequence({shapeRequest:mixedRequest,tensors:mixedTensors});
 let mixedEvidence;
 try{
  const d=mixed.describe(),expectedIds=['target.latent','source.latent','reference.latent','context:1:0.latent','context:5:0.latent','context:5:1.latent'];
  demand(JSON.stringify(d.streams.map(s=>s.requirementId))===JSON.stringify(expectedIds),'Canonical context ordering changed');
  for(let i=0;i<d.streams.length;i++){
   const s=d.streams[i],p=mixed.readPositions(s.tokenRange[1]-1,1);demand(p.sourceIds[0]===i&&JSON.stringify([...p.positions])===JSON.stringify(s.tokenGrid.map(n=>n-1)),'Context source ID or stream-local position mismatch');
   demand(mixed.readPatchRows(s.tokenRange[0],1)[0]===mixedTensors[i].data[0],'Context tensor identity changed');
  }
  const boundary=mixed.readPositions(d.targetTokens-1,2);demand(boundary.sourceIds[0]===0&&boundary.sourceIds[1]===1&&boundary.positions[3]===0&&boundary.positions[4]===0&&boundary.positions[5]===0,'Boundary positions must reset without phantom tokens');
  const tail=d.totalTokens%128;demand(tail>0&&mixed.readPatchRows(d.totalTokens-tail,tail).length===tail*64,'Exact mixed tail shape required');
  const targetOutput=new Float32Array(mixedTensors[0].data.length).fill(-17),start=d.targetTokens-1,rows=Math.min(128,d.totalTokens-start),head=new Float32Array(rows*64).fill(23),write=mixed.writeTargetHeadRows(head,start,targetOutput);
  demand(write.processedRows===rows&&write.writtenTargetRows===1&&write.writtenElements===64&&targetOutput.filter(v=>v===23).length===64,'Only target subset may be stored after full row projection');
  const before=targetOutput.slice();demand(mixed.writeTargetHeadRows(new Float32Array(64),d.totalTokens-1,targetOutput).writtenElements===0&&targetOutput.every((v,i)=>v===before[i]),'Context output rows must not overwrite target');
  mixedEvidence={streamOrder:expectedIds,sourceIds:d.streams.map(s=>s.sourceId),tokenRanges:d.streams.map(s=>s.tokenRange),totalTokens:d.totalTokens,exactTailRows:tail,headRowsInBoundaryTile:rows,targetRowsStored:write.writtenTargetRows,mediaPayloadClaim:false};
 }finally{mixed.dispose();}
 return {passed:true,schemaVersion:description.schemaVersion,shapeDerivation:description.shapeDerivation,semanticAdmission:description.semanticAdmission,actualTarget:{shape:description.targetShape,targetTokens:description.targetTokens,rowsProcessed,storedElements,patchComparedElements,roundtripComparedElements,patchMismatches,roundtripMismatches,inputPatchOrder:description.inputPatchOrder,headPatchOrder:description.headPatchOrder,tailRows:description.totalTokens%128,lastPosition:[20,29,51]},mixed:mixedEvidence,modelInference:false,generationReady:false};
}
