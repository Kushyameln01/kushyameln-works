import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {trusted} from './test-trusted.mjs';
const stage=await import('./stage.mjs').catch(()=>({}));
test('tail constructor rejects unknown scope and receipt before allocating native resources',async()=>{
 assert.equal(typeof stage.createSelfAttentionTail,'function','independent bounded self-attention tail owner required');
 for(const change of [t=>t.scheduleIndex=1,t=>t.fullPrefix.patchHiddenSHA256='a'.repeat(64),t=>t.attention.receiptSHA256='a'.repeat(64)]){const t=trusted();change(t);await assert.rejects(stage.createSelfAttentionTail({file:new Blob(),side:'LOW',trustedInputs:t}),/binding|scope/);}
 await assert.rejects(stage.createSelfAttentionTail({file:new Blob(),side:'LOW',trustedInputs:trusted(),load:'READY'}),/Unknown/);
});
test('tail constructor rejects shared math bytes before source parsing',async()=>{
 assert.equal(typeof stage.createSelfAttentionTail,'function');
 await assert.rejects(stage.createSelfAttentionTail({file:new Blob(),side:'LOW',trustedInputs:trusted(),mathBytes:new Uint8Array(new SharedArrayBuffer(8))}),/Nonshared/);
});
