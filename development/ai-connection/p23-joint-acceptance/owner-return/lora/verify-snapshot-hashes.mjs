// Saved JSON metadata only. No native loading, inference or artifact export.
import {readFile,writeFile} from 'node:fs/promises';
import {hashCanonical} from './source/60d-canonical.mjs';
const result=JSON.parse(await readFile(new URL('./run-result.original-decoded.json',import.meta.url),'utf8'));
const checks=[];
for(const c of result.cases){
  const {snapshotHash,...body}=c.publication.snapshot;
  const observed=await hashCanonical(body);
  checks.push({id:c.id,expected:snapshotHash,observed,passed:snapshotHash===observed});
}
const report={status:checks.every(c=>c.passed)?'PASS':'FAIL',scope:'Six saved snapshot canonical metadata hashes using byte-verified original MANAGEMENT60d canonical.mjs; no native executions',checks};
await writeFile(new URL('./snapshot-hash-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,snapshotHashes:checks.length}));
if(report.status!=='PASS')process.exitCode=1;
