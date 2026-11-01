// Source-deployment checks only. These tests do not admit a numerical or
// snapshot result and do not require external native checkouts or model Files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const repository='Kushyameln01/kushyameln-works';
const implementation='82b21f09cb63926543181b16f0e97ebc6b9fa6be';
const evidence='82cd9bb3d6792fa20a5305f52198efca5a30459f';
const directory='docs/shared/ai-connection/adapters/lora-data/';
const root=new URL('../../',import.meta.url);
const expected=[
 {name:'management-admission-inputs',byteLength:32961,sha256:'ddf57f4c76333ada1ddf93cf238e5f4ea6219b39afd5dc4d567213667a7d897e',gitBlobSHA:'4971f34eab334a223ab74b53fc0216c4fc642d7a'},
 {name:'numeric-declarations',byteLength:9909,sha256:'e7dd99d570c666969d76e93747998f3e1c20ba64d9e3b9d1b5f7a19e05aa6b17',gitBlobSHA:'391f4eb6c535ac86da914a7caee02c8d7ab8a909'}
];
const read=async path=>readFile(new URL(path,root)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const digest=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');

for(const file of expected)test(`${file.name}: deployed source retains every byte of the independently pinned owner implementation`,async()=>{
 const bytes=await read(directory+file.name+'.mjs');
 assert.ok(bytes,'The owner DATA source must be deployed before it can be used');
 assert.equal(bytes.byteLength,file.byteLength);
 assert.equal(digest('sha256',bytes),file.sha256);
 assert.equal(digest('sha1',Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])),file.gitBlobSHA);
});

test('deployment receipt separates DATA implementation, owner evidence and unchanged native source pins',async()=>{
 const bytes=await read(directory+'SOURCE-RECEIPT.json');assert.ok(bytes,'A source-bound deployment receipt is required');
 const receipt=JSON.parse(bytes);
 assert.equal(receipt.schemaVersion,'works-lora-admission-data-source/0.1-draft.1');
 assert.equal(receipt.implementationCommit,implementation);
 assert.equal(receipt.ownerEvidence.sourceRef.commit,evidence);
 assert.equal(receipt.ownerEvidence.sha256,'c0da893773bdefb14ca060d48321dd7b44d8115baffa19a26c7afb77a377fd23');
 assert.equal(receipt.nativeModulesChanged,false);
 assert.equal(receipt.files.length,2);
 for(const file of expected){
  const path=`docs/shared/inference/lora/${file.name}.mjs`,record=receipt.files.find(record=>record.sourceRef.path===path);
  assert.ok(record);assert.deepEqual(record.sourceRef,{repository,commit:implementation,path,sha256:file.sha256});
  assert.equal(record.deploymentPath,directory+file.name+'.mjs');assert.equal(record.byteLength,file.byteLength);
  assert.equal(record.sha256,file.sha256);assert.equal(record.gitBlobSHA,file.gitBlobSHA);
  assert.equal(record.byteExact,true);assert.equal(record.gitObjectVerified,true);
 }
 const module=await import(new URL(directory+'management-admission-inputs.mjs',root));
 for(const [role,pin]of Object.entries(module.LORA_MANAGEMENT_ADMISSION_SOURCE_SET)){
  assert.deepEqual(receipt.nativeSourcePins[role],{repository,...pin});
  assert.notEqual(pin.commit,implementation);assert.notEqual(pin.commit,evidence);
 }
});

test('the deployed owner modules keep their actual public API and refuse absent actual owner inputs',async()=>{
 for(const file of expected)assert.ok(await read(directory+file.name+'.mjs'),'Both unchanged owner modules are required');
 const declarations=await import(new URL(directory+'numeric-declarations.mjs',root));
 const admission=await import(new URL(directory+'management-admission-inputs.mjs',root));
 assert.deepEqual(Object.keys(declarations),['LORA_NUMERIC_DECLARATIONS_VERSION','describeLoraNumericDeclarations']);
 assert.deepEqual(Object.keys(admission),['LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION','LORA_MANAGEMENT_ADMISSION_SOURCE_SET','catalogSourceAlias','createLoraManagementAdmissionInputs']);
 assert.equal(declarations.LORA_NUMERIC_DECLARATIONS_VERSION,'lora-numeric-declarations/0.1-draft.1');
 assert.equal(admission.LORA_MANAGEMENT_ADMISSION_INPUTS_VERSION,'lora-management-admission-inputs/0.1-draft.1');
 assert.throws(()=>declarations.describeLoraNumericDeclarations({}),{code:'LORA_DECLARATION_IDENTITY_ERROR'});
 assert.throws(()=>admission.createLoraManagementAdmissionInputs({}),/Actual ReferenceSet, selected-current and separate published-lifetime callbacks required/);
});
