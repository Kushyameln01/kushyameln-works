// The current owner admits only the already accepted exact natural N2 bits.
// The capture harness checked the two new receipt/artifact bodies externally.
// Their IDs and accepted context bits are pinned; arbitrary contexts are refused.
const HASH=/^[a-f0-9]{64}$/;
const ANCHORS={
 HIGH:{receiptSHA256:'c12885eb71b0b46f91f79b94bba0315f1c9eae635daa3493686bb5882c7703f0',artifactSHA256:'4493d93b56f434b6292da1c9898dd30b474444073796a10e25788d5c71a65a52',patchHiddenSHA256:'29002478d22504cb4df1b193c4a75059b7e88568c38460f9ff7a61287dfa8f96',timeAct1SHA256:'1b69ffc7e86fbc52ea9ae5bd32950d8e62439417089577f9c5f66243e0b734f7',contextSHA256:'69838610e717a8d7c65adda4133233f581a5173cf10820a130471b96d75985ee',attentionArtifactSHA256:'26c4128fa09e2f755413787241fd32d28fe3f5bee23b85df2f64d9cd4c738ddf',attentionReceiptSHA256:'75bdf4a9e6e09769d5edcbab400db103eead7822c92f12e355fc7028938b158b'},
 LOW:{receiptSHA256:'ec161f89a53f8dbd6b8c4a02c59a236ac544224cfe700592e8982900eeb4ade5',artifactSHA256:'1b2808f5ee1185db85cba4e2c59c030fd45d6e3c83c9fde457e70c7d1545d797',patchHiddenSHA256:'1dc2ad17c0f7f7e7c41272efa538d573fc99e355c99dfd7b238cb9aa16e77b8b',timeAct1SHA256:'cf07ca0bf0160886acafb9bf42d22f57f56482cd82a8cad5aa3791901e9938c5',contextSHA256:'b688a5ad16637c42fe22f1a069c1e786881f028aa23da421c27170e84f7778fd',attentionArtifactSHA256:'2833c85cb79ce250fcc81ca2dac0e42e1a918126604661df13999b7c31304886',attentionReceiptSHA256:'618c46b6ad4233a519516d923dc8df317b54c8f673299ef2428fba9b99c23e77'}
};
const FLAGS=['productionHiddenVerified','originalWorkflowInputsVerified','originalProductionPrecisionVerified','fullBlockVerified','modelInference','lowIsHighHandoff'],READY=['load','predict','sample'];
function exactKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw TypeError('Unknown or missing trusted binding field');}
export function snapshotTrustedInputs(side,value){
 if(!Object.hasOwn(ANCHORS,side))throw TypeError('Fixed trusted side required');
 // structuredClone refuses functions/accessors on binary objects; all metadata
 // is copied before the first await and never reread from the caller.
 const t=structuredClone(value),a=ANCHORS[side];
 exactKeys(t,['schemaVersion','side','blockIndex','scheduleIndex','tokens','fullPrefix','attention',...FLAGS,...READY]);
 if(t.schemaVersion!=='bernini-self-attention-tail-trusted-inputs/0.1'||t.side!==side||t.blockIndex!==0||t.scheduleIndex!==(side==='HIGH'?1:3)||t.tokens!==2)throw Error('Fixed trusted side/block/time/N2 scope binding mismatch');
 if(FLAGS.some(k=>t[k]!==false)||READY.some(k=>t[k]!=='NOT_READY'))throw Error('Trusted scope false/NOT_READY binding mismatch');
 exactKeys(t.fullPrefix,['receiptSHA256','artifactSHA256','patchHiddenSHA256','timeAct1SHA256']);
 for(const key of Object.keys(t.fullPrefix))if(t.fullPrefix[key]!==a[key])throw Error('Pinned original fullprefix receipt/artifact/array binding mismatch: '+key);
 exactKeys(t.attention,['receiptSHA256','artifactSHA256','contextSHA256','fullPrefixReceiptSHA256','fullPrefixArtifactSHA256']);
 if(Object.values(t.attention).some(v=>typeof v!=='string'||!HASH.test(v)))throw Error('Trusted attention receipt/hash binding mismatch');
 if(t.attention.receiptSHA256!==a.attentionReceiptSHA256||t.attention.artifactSHA256!==a.attentionArtifactSHA256||t.attention.contextSHA256!==a.contextSHA256||t.attention.fullPrefixReceiptSHA256!==a.receiptSHA256||t.attention.fullPrefixArtifactSHA256!==a.artifactSHA256)throw Error('Pinned actual attention/fullprefix receipt binding mismatch');
 return t;
}
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export async function verifyTailInputHashes(trusted,owned,signal){
 signal?.throwIfAborted();
 const [attentionSHA256,patchHiddenSHA256,timeAct1SHA256]=await Promise.all([sha(owned.attention),sha(owned.patchHidden),sha(owned.timeAct1)]);
 signal?.throwIfAborted();
 if(attentionSHA256!==trusted.attention.contextSHA256||patchHiddenSHA256!==trusted.fullPrefix.patchHiddenSHA256||timeAct1SHA256!==trusted.fullPrefix.timeAct1SHA256)throw Error('Actual attention/patchHidden/timeAct1 bits binding mismatch');
 return {attentionSHA256,patchHiddenSHA256,timeAct1SHA256};
}
