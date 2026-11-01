#!/usr/bin/env node
// Fixed Hello world packet inspection only. No model, oracle or consumer runs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),base='development/inference/p2-p3-acceptance/plain/';
const source6=[
 ['docs/shared/inference/tensor.mjs','d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5'],
 ['docs/shared/inference/text-encoder-api.mjs','b20fc73262c12558e2c54fb7ac8bfd20775c39dd2dbe4a47efd0a73632ec9a99'],
 ['docs/shared/inference/text-encoder.mjs','9d4f528a926dc40bdbf721c5072518d0e027019a5a0912deeac0dc0f449fd8a2'],
 ['docs/shared/inference/tokenizer.mjs','4a7811d4e36fbcc568e2a2a1e0941fd78261f84b231a96458d919ea0259fb9a5'],
 ['tools/inference/kernel/tensor.hike','09625a5a955b843fdf15b22676429c3774600b3dd3aaa53fc77325869fcd0490'],
 ['docs/shared/inference/kernel/tensor.wasm','9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8']];
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const result={schemaVersion:'works-conditioning-local-inspection/1.0',passed:false,localVerificationOnly:true,
 recipientIdentityAttested:false,newNN:0,crossAttentionConsumed:false,sourceChecks:[],verifiedFiles:[]};
function tracked(path,expected={}){
 const full=resolve(root,path);assert.ok(full.startsWith(resolve(root)+sep),'Repository-relative file required');
 const b=readFileSync(full),blob=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
 assert.equal(blob,git('rev-parse','--verify',`HEAD:${path}`),`Untracked/changed HEAD bytes: ${path}`);
 if(expected.bytes!==undefined)assert.equal(b.length,expected.bytes,path+' bytes');
 if(expected.sha256!==undefined)assert.equal(sha(b),expected.sha256,path+' SHA-256');
 result.verifiedFiles.push({path,bytes:b.length,sha256:sha(b),headGitBlob:blob});return b;
}
const parsed=path=>JSON.parse(tracked(path));
try{
 result.actualCheckoutSha=git('rev-parse','--verify','HEAD');assert.match(result.actualCheckoutSha,/^[a-f0-9]{40}$/);
 for(const [path,sha256] of source6){tracked(path,{sha256});result.sourceChecks.push({path,sha256,headGitBlobMatched:true});}
 const hand=parsed(base+'P3-HANDOFF.json'),receipt=parsed(base+'RECEIPT.json'),index=parsed(base+'EVIDENCE-INDEX.json'),sources=parsed(base+'source-bindings.json');
 assert.equal(hand.schemaVersion,'works-portable-plain-handoff/1.0');assert.equal(receipt.status,'PASS_FIXED_PLAIN_ALL_VALUES');
 assert.equal(hand.executionSourceSha,'5537b8932343aa2476b95191817e8913f99dab02','Original execution source must not be retagged');
 for(const x of [receipt,index,sources])assert.equal(x.executionSourceSha,hand.executionSourceSha);assert.match(hand.executionSourceSha,/^[a-f0-9]{40}$/);
 const files=new Map();for(const e of index.entries){assert.ok(!e.path.split('/').includes('..')&&!e.path.startsWith('/'));assert.equal(e.executionSourceSha,hand.executionSourceSha);files.set(e.path,tracked(base+e.path,e));}
 tracked('tools/inference/text-encoder/inspect_conditioning_handoff.mjs');for(const path of hand.ownerEvidence)assert.ok(files.has(path),'Indexed owner evidence required');
 const conditioning=base.replace('plain/','conditioning/'),packet=parsed(conditioning+'manifest.json');
 assert.equal(packet.schemaVersion,'works-conditioning-handoff/0.1-draft.1');assert.equal(packet.sourceIdentity.actualEncodeExecution.commit,hand.executionSourceSha);
 const selected=[packet.input.prompt.file,packet.input.tokenIds,packet.artifact.tensor,packet.artifact.attentionMask,packet.numericAcceptance.independentReference,packet.numericAcceptance.comparisonReport,packet.outerEvidence.evidence,packet.outerEvidence.trace];
 const attachmentBytes=selected.map(r=>{assert.ok(Number.isSafeInteger(r.byteLength)&&r.byteLength>=0);assert.match(r.sha256,/^[a-f0-9]{64}$/);return tracked(relative(root,resolve(root,conditioning,r.path)).split(sep).join('/'),{bytes:r.byteLength,sha256:r.sha256});});
 const boundSources=[...packet.sourceIdentity.knownNativeImplementation,packet.finalNormalization.kernelSource,packet.finalNormalization.kernelWasm,packet.artifact.saveReadback.codec];assert.deepEqual(boundSources.map(r=>[r.path,r.sha256]).sort(),[...source6].sort());
 for(const r of boundSources){assert.equal(r.commit,'2bdca59ea78580d4fe7a9d31a8de33209b64d029');assert.equal(r.byteLength,result.verifiedFiles.find(f=>f.path===r.path).bytes);}
 const data=files.get(hand.conditioning.path),reference=files.get(hand.independentReference.path);assert.ok(data&&reference,'Indexed data/reference required');
 assert.deepEqual(attachmentBytes[2],data);assert.deepEqual(attachmentBytes[4],reference);assert.deepEqual(JSON.parse(attachmentBytes[5]),receipt);assert.deepEqual(JSON.parse(attachmentBytes[6]),index);
 assert.equal(data.length,8390054);assert.equal(sha(data),'90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9');
 assert.equal(sha(data),hand.conditioning.sha256);assert.equal(reference.length,8388608);assert.equal(sha(reference),'e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9');assert.equal(sha(reference),hand.independentReference.sha256);
 const {decodeTensor}=await import(pathToFileURL(resolve(root,source6[0][0])).href),t=await decodeTensor(new Uint8Array(data));
 for(const [key,value] of Object.entries({dtype:'float32',layout:'BLC',meaning:'text_hidden_states',shape:[1,512,4096],
  modelSha256:'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',tokenizerSha256:'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'})){assert.deepEqual(t[key],value);assert.deepEqual(hand.conditioning[key],value);assert.deepEqual(packet.artifact.tensor[key],value);}
 const payloadSha256=sha(new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength));
 assert.equal(payloadSha256,'107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7');assert.equal(payloadSha256,hand.conditioning.payloadSha256);
 assert.ok(t.attentionMask instanceof Uint8Array);assert.deepEqual(Array.from(t.attentionMask),hand.conditioning.attentionMask);assert.equal(t.attentionMask.length,512);
 assert.deepEqual(Array.from(t.attentionMask),Array.from({length:512},(_,i)=>i<3?1:0));
 assert.deepEqual(Array.from(attachmentBytes[3]),Array.from(t.attentionMask));assert.equal(packet.artifact.tensor.payloadSha256,payloadSha256);
 assert.equal(attachmentBytes[0].toString('utf8'),hand.sourceInput.text);assert.equal(sha(attachmentBytes[0]),hand.sourceInput.utf8Sha256);assert.equal(packet.input.prompt.declaredUtf8Sha256,hand.sourceInput.utf8Sha256);assert.equal(packet.input.prompt.declaredText,hand.sourceInput.text);
 const ids=JSON.parse(attachmentBytes[1]),plainInput=JSON.parse(files.get('evidence/plain-input.json'));assert.equal(ids.dtype,'int32');assert.deepEqual(ids.shape,[1,512]);assert.deepEqual(ids.data,plainInput.tokenIds);assert.equal(ids.tokenizerSha256,t.tokenizerSha256);
 for(let row=0;row<512;row++)if(!t.attentionMask[row])assert.ok(t.data.subarray(row*4096,(row+1)*4096).every(v=>v===0),'Nonzero padding');
 const manifestBytes=tracked('development/inference/codec-marker-handoff/manifests/text/manifest.json',{bytes:19908,sha256:'aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f'}),manifest=JSON.parse(manifestBytes);
 assert.deepEqual(manifest.finalNorm,{epsilon:1e-6,path:'final-norm.f32',bytes:16384,sha256:'31ec55a911ef90efa7cfb36d7f3b004a8652d36979b0b1824dc7c2b335b24a02'});
 for(const gate of [hand.gate,receipt.predeclaredGate])assert.deepEqual(gate,manifest.numericGate);
 assert.deepEqual(packet.numericAcceptance.selectedManifestGate,manifest.numericGate);assert.deepEqual(packet.numericAcceptance.comparison,receipt.comparison);assert.deepEqual(packet.finalNormalization.weight,manifest.finalNorm);
 const selectedManifest=packet.identities.selectedManifest;assert.equal(relative(root,resolve(root,conditioning,selectedManifest.path)).split(sep).join('/'),'development/inference/codec-marker-handoff/manifests/text/manifest.json');assert.equal(selectedManifest.sha256,sha(manifestBytes));assert.equal(selectedManifest.byteLength,manifestBytes.length);
 const oracle=JSON.parse(files.get(hand.independentReference.referenceReceipt)),browser=JSON.parse(files.get('evidence/browser-results.json'));
 assert.deepEqual(JSON.parse(attachmentBytes[7]),browser);
 assert.equal(oracle.passed,true);assert.equal(browser.passed,true);assert.equal(oracle.oracleUsesOnnxOrHike,false);assert.equal(oracle.layers.length,24);
 assert.equal(oracle.sourceCommit,'b5a432157de6b8884f81104cd02926adf4d597e4');assert.equal(oracle.source.sha256,'797f11b69256dffa8d9a6d236fe1e05d0c250c84d231a5993accde0ff44238bc');
 for(const x of [oracle,browser]){assert.equal(x.executionSourceSha,hand.executionSourceSha);assert.deepEqual(x.input.attentionMask,Array.from(t.attentionMask));assert.deepEqual(x.input.tokenIds,ids.data);assert.equal(x.input.textUtf8Sha256,hand.sourceInput.utf8Sha256);}
 assert.equal(receipt.sourceOracle.usesFull512Positions,true);assert.equal(receipt.sourceOracle.usesOnnxOrHike,false);assert.equal(hand.independentReference.oracleFull512,true);
 assert.deepEqual(receipt.input.shape,t.shape);for(const key of ['modelSha256','tokenizerSha256']){assert.equal(receipt.input[key],t[key]);assert.equal(browser.native.output[key],t[key]);}
 assert.equal(oracle.reference.sha256,sha(reference));assert.deepEqual(oracle.gate,manifest.numericGate);assert.equal(browser.native.download.sha256,sha(data));
 assert.deepEqual(browser.native.evidence.finalNumericGate,manifest.numericGate);assert.deepEqual(browser.comparison,receipt.comparison);assert.deepEqual(hand.comparison,receipt.comparison);
 assert.equal(receipt.comparison.allValuesCompared,true);assert.equal(receipt.comparison.elements,2097152);assert.equal(receipt.comparison.paddingExactlyZero,true);assert.equal(receipt.comparison.passed,true);
 assert.equal(receipt.comparison.finite,true);assert.equal(receipt.comparison.allclose,true);assert.equal(receipt.comparison.activeElements,12288);assert.equal(receipt.comparison.paddingElements,2084864);
 assert.ok(receipt.comparison.maxAbsError<=manifest.numericGate.maxAbsError);assert.equal(sha(Buffer.from(hand.sourceInput.text,'utf8')),hand.sourceInput.utf8Sha256);assert.equal(hand.sourceInput.text,'Hello world');
 assert.equal(receipt.input.manifestSha256,sha(manifestBytes));assert.equal(oracle.manifest.sha256,sha(manifestBytes));assert.equal(sources.pinnedComfyCommit,oracle.sourceCommit);
 result.passed=true;result.packet={executionSourceSha:hand.executionSourceSha,wholeSha256:sha(data),payloadSha256,referenceSha256:sha(reference),shape:t.shape,maskLength:t.attentionMask.length,paddingExactlyZero:true,existingAllValueReceiptBound:true,conditioningManifestVerified:true,conditioningAttachmentsChecked:8};
}catch(e){result.failure={name:e.name,message:e.message};process.exitCode=1;}
const args=process.argv.slice(2);assert.ok(args.length===0||args.length===2&&args[0]==='--output','Use no args or --output <fresh-file.json>');
const output=JSON.stringify(result,null,2)+'\n';if(args.length)writeFileSync(args[1],output,{flag:'wx'});process.stdout.write(output);
