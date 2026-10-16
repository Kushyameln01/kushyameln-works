// Near-limit memory observations. Product execution is allowed only against a verified Pages copy.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';

const MiB=1024*1024,sha=data=>createHash('sha256').update(data).digest('hex');
const stat=values=>({min:Math.min(...values),max:Math.max(...values)});
const concurrency=Number(process.env.UNITY_MEMORY_CONCURRENCY??2);
assert([1,2,4].includes(concurrency),'UNITY_MEMORY_CONCURRENCY must be 1,2,4');
const moduleReuse=process.env.UNITY_MEMORY_MODULE_REUSE==='true';
const intervalMs=10;
if(process.argv[2]==='--case'){
 const info=JSON.parse(await readFile(process.argv[3],'utf8'));
 const {base,receipt,poolFor}=await import('./cloud-harness.mjs');
 const {createUnityFileAnalyzer}=await import(new URL('shared/unity-analysis/file-sdk.mjs',base));
 const samples=[],started=performance.now();let phase='initial',sampling=true;
 const sample=kind=>{if(!sampling)return;const m=process.memoryUsage();samples.push({timeMs:performance.now()-started,kind,phase,rss:m.rss,heapUsed:m.heapUsed,heapTotal:m.heapTotal,external:m.external,arrayBuffers:m.arrayBuffers});};
 sample('baseline');const interval=setInterval(()=>sample('interval'),intervalMs);
 let pool,analyzer,result=null,error=null;
 try{
  phase='read-fixture';sample('phase');let zip=new Uint8Array(await readFile(info.archive));assert.equal(sha(zip),info.compressedSha256);
  pool=poolFor(concurrency,moduleReuse);analyzer=createUnityFileAnalyzer({pool,concurrency,onProgress:e=>{phase=e.stage;sample('progress');}});
  phase='analyze-called';sample('phase');const report=await analyzer.analyze([{path:info.name,bytes:zip}]);sample('resolved');
  assert.equal(info.expected,'success','Oversized archive was accepted');
  assert.equal(report.status,'succeeded');assert.equal(report.ingestion.before.expandedBytes,info.expandedBytes);
  assert.equal(report.before.counts.objects,0);assert.equal(report.before.coverage.opaqueFiles.length,info.files);
  assert.equal(report.ingestion.before.files.length,info.files);assert.equal(report.completeness.truncated,false);
  for(const [i,f] of report.ingestion.before.files.entries()){assert.equal(f.path,`Assets/opaque-${String(i).padStart(3,'0')}.bin`);assert.equal(f.sha256,info.entrySha256);assert.equal(f.byteLength,MiB);}
  assert.equal(sha(zip),info.compressedSha256,'Caller input mutated');
  result={status:report.status,sessionId:report.sessionId,inputRevision:report.inputRevision,metrics:report.metrics,ownership:report.ownership??report.metrics.ownership??null,inventory:report.ingestion.before,counts:report.before.counts,coverage:report.before.coverage,completeness:report.completeness,jobs:[...report.ingestion.jobs,...report.jobs]};
  zip=null;
 }catch(e){error={name:e.name,message:e.message,stack:e.stack};if(info.expected==='success')throw e;assert.match(e.message,/EXPANDED_BYTE_LIMIT|展開容量超過/,'Expected the explicit expanded-size limit failure');}
 finally{phase='dispose';sample('phase');analyzer?.dispose();pool?.dispose();phase='disposed';sample('phase');clearInterval(interval);sampling=false;}
 assert.equal(pool.getStatus().outstanding,0);assert.equal(pool.getStatus().retainedCount,0);
 const range=Object.fromEntries(['rss','heapUsed','heapTotal','external','arrayBuffers'].map(key=>[key,{...stat(samples.map(s=>s[key])),baseline:samples[0][key],observedRise:Math.max(...samples.map(s=>s[key]))-samples[0][key]}]));
 const gaps=samples.slice(1).map((s,i)=>s.timeMs-samples[i].timeMs);
 console.log(JSON.stringify({status:'PASS',commit:receipt.commit,runtime:process.version,case:info,concurrency,moduleReuse,observedMs:performance.now()-started,intervalMs,maximumSampleGapMs:Math.max(0,...gaps),range,samples,result,error,interpretation:{rss:'Whole Node process, including worker threads; not browser process memory',heap:'heapUsed/heapTotal/external/arrayBuffers are the calling main isolate; worker JS heap is not included',peaks:'Interval and phase samples can miss transient peaks, especially inside worker threads; max is observed, not an upper bound',ownership:'SDK logical retained-byte counters are not allocator or process-memory measurements',leak:'No leak conclusion from one bounded run',forcedGC:false}},null,2));
}else{
 assert(process.env.UNITY_PAGES_ROOT,'Verified Pages root is required');
 const root=process.env.UNITY_PAGES_ROOT,receipt=JSON.parse(await readFile(root+'/../acquisition.json','utf8'));assert.equal(receipt.status,'verified-deployed-pages-copy');
 const cases=(process.env.UNITY_MEMORY_CASES??'63,64,65').split(',').map(Number);assert(cases.length&&cases.every(n=>[63,64,65].includes(n)),'Invalid UNITY_MEMORY_CASES');
 const output=process.env.UNITY_MEMORY_FIXTURE_DIR??await mkdtemp(join(tmpdir(),'unity-memory-'));
 await mkdir(output,{recursive:true});
 // One zero-filled 1 MiB buffer is reused while constructing compressed fixtures. No 64 MiB source array is retained.
 const chunk=Buffer.alloc(MiB),compressed=deflateRawSync(chunk,{level:9}),entrySha256=sha(chunk);
 const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 let crc=0xffffffff;for(const b of chunk)crc=table[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
 function zip(files){const local=[],central=[];let offset=0;
  for(let i=0;i<files;i++){const name=Buffer.from(`Assets/opaque-${String(i).padStart(3,'0')}.bin`),lh=Buffer.alloc(30),ch=Buffer.alloc(46);
   lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(compressed.length,18);lh.writeUInt32LE(MiB,22);lh.writeUInt16LE(name.length,26);
   ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(compressed.length,20);ch.writeUInt32LE(MiB,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);
   local.push(lh,name,compressed);central.push(ch,name);offset+=lh.length+name.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files,8);end.writeUInt16LE(files,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
 }
 const results=[];
 for(const files of cases){const archive=zip(files),name=`opaque-${files}MiB.zip`,path=join(output,name);assert(archive.length<=16*MiB);await writeFile(path,archive);const info={name,archive:path,files,expandedBytes:files*MiB,compressedBytes:archive.length,compressedSha256:sha(archive),entrySha256,expected:files<=64?'success':'expanded-limit-error'},infoPath=path+'.json';await writeFile(infoPath,JSON.stringify(info,null,2));
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--case',infoPath],{env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  if(code!==0){results.push({status:'FAIL',case:info,exitCode:code,stdout,stderr});continue;}
  try{results.push(JSON.parse(stdout));}catch{results.push({status:'FAIL',case:info,exitCode:code,stdout,stderr});}
 }
 const passed=results.every(r=>r.status==='PASS');console.log(JSON.stringify({status:passed?'PASS':'FAIL',commit:receipt.commit,runtime:process.version,concurrency,moduleReuse,intervalMs,cases:results,interpretation:'Every case has a fresh Node process. Fixture creation occurs in the parent before sampling. At/below limit requires complete opaque inventory/hash preservation; above limit requires an explicit limit error. Sampled memory is not a browser measurement or a memory ceiling.'},null,2));if(!passed)process.exitCode=1;
}
