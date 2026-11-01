#!/usr/bin/env node
// Receipt-only native capture: decode persisted bytes, validate/copy, hash and compare.
// No model, numerical oracle, projection, reference JSON or export is invoked.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const out=resolve(process.env.TEXT_RECEIPT_DIR||fileURLToPath(new URL('.',import.meta.url)));
const source=resolve(out,'source');
const receiver=resolve(process.env.RECEIVER_REPO||'/workspace/work/diffusion-models');
const receiverCommit='7ee36228030ba3bb544a90b1d4b528702a7bae32';
const capturePath='docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs';
const captureSHA='b4518ea35ca35e63e6ba8cdbe67e5d9fea0fa2125dac7dac0f5d4ac6c83ac7c2';
const codecPath='docs/shared/inference/tensor.mjs';
const codecSHA='d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5';
const model='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
const tokenizer='e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=view=>Buffer.from(view.buffer,view.byteOffset,view.byteLength);
const json=p=>JSON.parse(readFileSync(resolve(out,p),'utf8'));
const inspectionPath=process.argv[3]||'packet-inspection.json';
const acquisition=json('acquisition.json'),inspection=json(inspectionPath);
assert.equal(acquisition.passed,true);assert.equal(inspection.passed,true);
assert.equal(acquisition.distributionCommit,'f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48');
// The shell performs these read-only Git commands immediately before the probe.
// This sandbox rejects Node spawnSync despite the git child returning output.
const head=readFileSync(resolve(out,'receiver-head.txt'),'utf8').trim();
assert.equal(head,receiverCommit);
const captureSource=readFileSync(resolve(receiver,capturePath));
assert.equal(captureSource.length,18862);assert.equal(hash(captureSource),captureSHA);
assert.deepEqual(captureSource,readFileSync(resolve(out,'receiver-conditioning.mjs')));
const codecSource=readFileSync(resolve(source,codecPath));
assert.equal(hash(codecSource),codecSHA);
const {decodeTensor}=await import(pathToFileURL(resolve(source,codecPath)).href);
const {captureP4Conditioning,snapshotP4CapturedConditioning}=await import(pathToFileURL(resolve(receiver,capturePath)).href);
const path='development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor';
const wkt=readFileSync(resolve(source,path));
assert.equal(wkt.length,8390054);assert.equal(hash(wkt),'90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9');
const tensor=await decodeTensor(new Uint8Array(wkt));
const dataSHA=hash(bytes(tensor.data)),maskSHA=hash(bytes(tensor.attentionMask));
const expectedMetadata=structuredClone(Object.fromEntries(Object.entries(tensor).filter(([k])=>!['data','shape','attentionMask'].includes(k))));
const captured=captureP4Conditioning(tensor); // Existing receiver entrypoint, default strict identities.
const snapshot=snapshotP4CapturedConditioning(captured);
assert.equal(dataSHA,'107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7');
assert.equal(maskSHA,'19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62');
for(const value of [captured,snapshot]){
 assert.deepEqual(value.shape,[1,512,4096]);assert.equal(value.rows,512);
 assert.equal(value.dtype,'float32');assert.equal(value.layout,'BLC');assert.equal(value.meaning,'text_hidden_states');
 assert.equal(Object.getPrototypeOf(value.data),Float32Array.prototype);assert.equal(value.data.length,2097152);
 assert.equal(Object.getPrototypeOf(value.attentionMask),Uint8Array.prototype);assert.equal(value.attentionMask.length,512);
 assert.equal(value.data.byteOffset,0);assert.equal(value.data.byteLength,value.data.buffer.byteLength);
 assert.equal(value.attentionMask.byteOffset,0);assert.equal(value.attentionMask.byteLength,value.attentionMask.buffer.byteLength);
 assert.deepEqual(bytes(value.data),bytes(tensor.data));assert.deepEqual(bytes(value.attentionMask),bytes(tensor.attentionMask));
 assert.equal(hash(bytes(value.data)),dataSHA);assert.equal(hash(bytes(value.attentionMask)),maskSHA);
 assert.deepEqual(Array.from(value.attentionMask),Array.from({length:512},(_,i)=>i<3?1:0));
 assert.equal(value.modelSha256,model);assert.equal(value.tokenizerSha256,tokenizer);
 assert.deepEqual(value.metadata.nativeTensorMetadata,expectedMetadata);
 assert.equal(value.metadata.inputClass,'native-text-encoder');
 assert.deepEqual(value.metadata.producer,{owner:'text_encoder',modelSha256:model,modelIdentity:'matched',tokenizerSha256:tokenizer,tokenizerIdentity:'matched',fullProvenance:true,missingTokenizerPolicy:'reject'});
 assert.deepEqual(value.metadata.verification,{producerAuthenticated:false,realExecutionVerified:false,jointlyAccepted:false});
 assert.notEqual(value.data.buffer,tensor.data.buffer);assert.notEqual(value.attentionMask.buffer,tensor.attentionMask.buffer);
}
assert.notEqual(captured.data.buffer,snapshot.data.buffer);assert.notEqual(captured.attentionMask.buffer,snapshot.attentionMask.buffer);
assert.deepEqual(Object.fromEntries(Object.entries(tensor).filter(([k])=>!['data','shape','attentionMask'].includes(k))),expectedMetadata);
assert.equal(hash(bytes(tensor.data)),dataSHA);assert.equal(hash(bytes(tensor.attentionMask)),maskSHA);
const packet=json('source/development/inference/p2-p3-acceptance/conditioning/manifest.json');
assert.equal(packet.sourceIdentity.actualEncodeExecution.commit,'5537b8932343aa2476b95191817e8913f99dab02');
const report={schemaVersion:'diffusion-p4-native-conditioning-capture-receipt/0.1',passed:true,
 acceptedScope:'Actual fixed f76 Hello world native packet retrieval/hash/source/receipt binding and receiver P4 synchronous validation/copy only',
 sourceIdentity:{packetDistributionCommit:acquisition.distributionCommit,packetActualCheckoutSha:null,originalTextExecutionCommit:packet.sourceIdentity.actualEncodeExecution.commit,receiverProbeCheckoutCommit:head,receiverRepositoryPath:receiver,captureModule:{path:capturePath,byteLength:captureSource.length,sha256:captureSHA},decodeCodec:{distributionCommit:acquisition.distributionCommit,declaredOriginalCommit:'2bdca59ea78580d4fe7a9d31a8de33209b64d029',path:codecPath,byteLength:codecSource.length,sha256:codecSHA},probe:{path:fileURLToPath(import.meta.url),sha256:hash(readFileSync(fileURLToPath(import.meta.url)))}},
 packet:{path,wholeByteLength:wkt.length,wholeSha256:hash(wkt),payloadByteLength:tensor.data.byteLength,payloadSha256:dataSHA,maskByteLength:tensor.attentionMask.byteLength,maskSha256:maskSHA,shape:captured.shape,rows:captured.rows,dtype:captured.dtype,layout:captured.layout,meaning:captured.meaning,modelSha256:model,tokenizerSha256:tokenizer,activeMaskPositions:3,fullMaskAndRowsPreserved:true,maskedRowsAlreadyZero:true,nativeMetadataPreserved:true,ownedIndependentDataMaskCopies:true,snapshotIndependentCopy:true,inputUnchanged:true,sealBytes:captured.sealBytes},
 producer:captured.metadata.producer,captureVerification:captured.metadata.verification,
 outerEvidence:{retainedSeparately:true,acquisitionPath:'acquisition.json',packetInspectionPath:inspectionPath,existingAllValueReceiptBound:true,newNumericalComparison:false},
 newNN:0,newExport:0,modelDownloaded:false,tokenizerModelDownloaded:false,projectionExecuted:false,crossAttentionConsumed:false,p4StageExecuted:false,referenceJSONConverted:false,jointlyAccepted:false,generationReady:false,
 notAccepted:['Text producer authentication or renewed execution verification','New Text numerical comparison or P4 local/composed numerical acceptance','Actual cross-attention/full block production consumption','Original GPU FP8/original workflow conditioning/negative/prefix/context equivalence','Model graph/weights or tokenizer-model retrieval','Generation readiness'],
 reproduce:{environment:'Set TEXT_RECEIPT_DIR to retained asset root and RECEIVER_REPO to an actual checkout at 7ee36228030ba3bb544a90b1d4b528702a7bae32. Defaults of the recorded run were /tmp/text-packet-receipt-20261102 and /workspace/work/diffusion-models.',receiverHead:'git -C "$RECEIVER_REPO" rev-parse HEAD > "$TEXT_RECEIPT_DIR/receiver-head.txt"',receiverSource:'git -C "$RECEIVER_REPO" show 7ee36228030ba3bb544a90b1d4b528702a7bae32:docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs > "$TEXT_RECEIPT_DIR/receiver-conditioning.mjs"',packetInspection:'node "$TEXT_RECEIPT_DIR/source/tools/inference/text-encoder/inspect_received_conditioning_handoff.mjs" --output "$TEXT_RECEIPT_DIR/fresh-packet-inspection.json"',capture:'node "$TEXT_RECEIPT_DIR/capture-probe.mjs" "$TEXT_RECEIPT_DIR/fresh-capture-receipt.json" "$TEXT_RECEIPT_DIR/fresh-packet-inspection.json"'},runtime:process.version};
const target=process.argv[2]||resolve(out,'capture-receipt.json');writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,output:target,sourceIdentity:report.sourceIdentity,packet:report.packet,captureVerification:report.captureVerification,newNN:0,newExport:0,crossAttentionConsumed:false},null,2));
