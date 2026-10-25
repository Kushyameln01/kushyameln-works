import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mixedFixture} from './mixed-fixture.mjs';
import {integratePackages} from '../../docs/shared/animator-integrator/integrate.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {splitUnityDocuments} from '../../docs/shared/ft/unity-text.mjs';
const path=process.env.INTEGRATOR_TEMPLATE_PATH;
test('recovered real template motions retain every setting and curve through mixed-data integration',{skip:!path},async()=>{
 const template=JSON.parse(fs.readFileSync(path,'utf8')),f=mixedFixture(template),before=structuredClone(f.packages),kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url))),r=await integratePackages(f.packages,f.request,kernel),dec=new TextDecoder();
 assert.deepEqual(f.packages,before);
 const all=[...template.trees,...template.clips];
 for(const item of all){const original=f.packages[0].assets.find(a=>a.guid===item.guid),output=r.diagnosticAssets.find(a=>a.guid===item.guid);assert(output);assert.equal(output.path,'Assets/Merged_DecodeAndSmooth/'+original.path.slice(7));assert.equal(output.meta,original.meta);assert.deepEqual(output.asset,original.asset);assert.equal(dec.decode(output.asset),item.text);}
 assert.equal(r.report.staticValidation.status,'PASS');assert.equal(all.length,36);

});
