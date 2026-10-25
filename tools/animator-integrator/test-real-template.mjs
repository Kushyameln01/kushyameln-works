import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mixedFixture} from './mixed-fixture.mjs';
import {integratePackages} from '../../docs/shared/animator-integrator/integrate.mjs';
import {instantiateFtKernel} from '../../docs/shared/ft/kernel/load-kernel.mjs';
import {splitUnityDocuments,extractReferences,canonicalizeObjectReferences,replaceDocumentFileId} from '../../docs/shared/ft/unity-text.mjs';
const path=process.env.INTEGRATOR_TEMPLATE_PATH;
test('recovered real template motions retain every setting and curve through mixed-data integration',{skip:!path},async()=>{
 const template=JSON.parse(fs.readFileSync(path,'utf8')),f=mixedFixture(template),before=structuredClone(f.packages),kernel=await instantiateFtKernel(fs.readFileSync(new URL('../../docs/shared/ft/kernel/ft-kernel.wasm',import.meta.url))),r=await integratePackages(f.packages,f.request,kernel),dec=new TextDecoder();
 assert.deepEqual(f.packages,before);
 const reverse=new Map(r.report.composition.objectMapping.filter(m=>m.sourceId).map(m=>[`${m.outputGuid}:${m.outputFileId}`,m.sourceId]));
 const symbolic=(text,guid,generated=false)=>{text=canonicalizeObjectReferences(replaceDocumentFileId(text,'1'));for(const ref of [...extractReferences(text)].reverse()){if(ref.fileId==='0')continue;const id=`${ref.guid??guid}:${ref.fileId}`,source=generated?reverse.get(id):id;assert(source,`Missing provenance for ${id}`);text=text.slice(0,ref.start)+`{SOURCE: ${source}}`+text.slice(ref.end);}return text;};
 const realIds=new Set([...template.trees,...template.clips].map(t=>t.guid));let copied=0;
 for(const m of r.report.composition.objectMapping.filter(m=>m.sourceId&&realIds.has(m.sourceId.split(':')[0]))){const [guid,id]=m.sourceId.split(':'),original=f.packages[0].assets.find(a=>a.guid===guid),source=splitUnityDocuments(dec.decode(original.asset)).documents.find(d=>d.fileId===id),out=r.diagnosticAssets.find(a=>a.guid===m.outputGuid),target=splitUnityDocuments(dec.decode(out.asset)).documents.find(d=>d.fileId===m.outputFileId);assert.equal(symbolic(target.text,out.guid,true),symbolic(source.text,guid),`Settings/curves changed: ${m.sourceId}`);copied++;}
 assert(copied>10);assert.equal(r.report.staticValidation.status,'PASS');console.log(JSON.stringify({fixture:'mixed real motions + synthetic Controllers/Expressions/Mask',sourceSha256:template.sourceSha256,availableTrees:template.trees.length,availableClips:template.clips.length,copiedRealMotions:copied,assetCount:r.assetCount,objects:r.report.staticValidation.objectCount}));
});
