import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEdge} from '../../docs/shared/ai-connection/compatibility.mjs';
import {edgeFixture} from './fixtures.mjs';
test('E5 preparation: PARTIAL evidence and STAGED receipt cannot satisfy full-generation scope',()=>{
 const edge=edgeFixture();edge.requiredScopes=['full-generation'];edge.evidence[0].scope='diagnostic-projection';edge.evidence[0].inputConditions.coverage='PARTIAL';
 edge.activeBindings.consumer.stage='STAGED';const r=evaluateEdge(edge);
 assert.equal(r.compatibility,'COMPATIBLE');assert.equal(r.validation[0].result,'not-verified');assert.equal(r.readiness.state,'blocked');
});
test('E5 preparation: a no-LoRA base route requires only its selected scopes',()=>{
 const edge=edgeFixture(),r=evaluateEdge(edge);assert.equal(r.readiness.state,'ready');assert.ok(!r.readiness.reasons.some(x=>/lora|HIGH|LOW/i.test(x)));
});
