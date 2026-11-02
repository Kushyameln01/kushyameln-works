import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {join} from 'node:path';
import {openPreparedGraph} from '/workspace/work/inference/p0-p2-20261031/worktree/tools/inference/text-encoder/node_sdk_host.mjs';
const [,bundle]=process.argv.slice(2),raw=await readFile(join(bundle,'manifest.json')),record=JSON.parse(raw).blocks[0],path=join(bundle,record.path);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const memory=()=>({...process.memoryUsage(),kernelMaxRssBytes:process.resourceUsage().maxRSS*1024});
const before=await stat(path,{bigint:true}),started=performance.now();let graph;
const report={schemaVersion:1,nnExecutions:0,mode:'production',node:process.version,pid:process.pid,input:{path,bytes:record.bytes,expectedSha256:record.sha256,manifestSha256:hash(raw)},beforeMemory:memory()};
try{
 graph=await openPreparedGraph(path,record.bytes);const readStarted=performance.now(),buffer=await graph.slice().arrayBuffer(),bytes=new Uint8Array(buffer);
 report.readSeconds=(performance.now()-readStarted)/1000;report.afterReadMemory=memory();report.arrayBufferBytes=buffer.byteLength;report.storage=graph.storage;report.statIdentity=graph.statIdentity;
 const hashStarted=performance.now();report.sha256=hash(bytes);report.hashSeconds=(performance.now()-hashStarted)/1000;report.afterHashMemory=memory();
 if(report.sha256!==record.sha256||buffer.byteLength!==record.bytes)throw Error('Manifest byte/hash mismatch');
 const after=await stat(path,{bigint:true});report.sameStatIdentityAfter=['size','mtimeNs','ino','dev'].every(key=>before[key]===after[key]);
 if(!report.sameStatIdentityAfter)throw Error('Input changed');report.matchesManifest=true;report.passed=true;
}finally{await graph?.close();report.readObservation=graph?.stats();}
report.totalSeconds=(performance.now()-started)/1000;process.stdout.write(JSON.stringify({event:'result',report})+'\n');
