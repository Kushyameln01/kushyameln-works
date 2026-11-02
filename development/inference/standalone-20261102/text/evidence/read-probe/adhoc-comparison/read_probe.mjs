import {openAsBlob} from 'node:fs';
import {open,readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {resolve,join} from 'node:path';

// Private NN0 storage diagnostic: no model runtime or repository source import.
const [mode,bundleArg]=process.argv.slice(2),bundle=resolve(bundleArg);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
check(mode==='blob'||mode==='positional','Expected blob or positional');
const manifestRaw=await readFile(join(bundle,'manifest.json'));
const manifest=JSON.parse(manifestRaw),record=manifest.blocks.find(x=>x.index===0);
check(record?.path==='block-00.onnx','Expected manifest block00');
const path=join(bundle,record.path),info=await stat(path,{bigint:true});
const identity=s=>({size:s.size.toString(),mtimeNs:s.mtimeNs.toString(),ino:s.ino.toString(),dev:s.dev.toString()});
const same=(a,b)=>a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ino===b.ino&&a.dev===b.dev;
check(info.isFile()&&Number(info.size)===record.bytes,'Manifest input size mismatch');
const memory=()=>({atMs:performance.now(),...process.memoryUsage(),kernelMaxRssBytes:process.resourceUsage().maxRSS*1024});
const report={schemaVersion:1,nnExecutions:0,mode,node:process.version,pid:process.pid,input:{path,bytes:record.bytes,expectedSha256:record.sha256,manifestSha256:createHash('sha256').update(manifestRaw).digest('hex'),statIdentity:identity(info)},chunkBytes:mode==='positional'?8*1024*1024:null,allocationPolicy:mode==='positional'?'one caller-owned ArrayBuffer/Uint8Array, bounded fs.read directly into view':'native fs.openAsBlob, slice(0,size), arrayBuffer',checkpoints:[],readCalls:0};
const emit=event=>process.stdout.write(JSON.stringify(event)+'\n');
emit({event:'ready',mode,pid:process.pid,inputBytes:record.bytes});
report.checkpoints.push({stage:'before-read',...memory()});
const start=performance.now();let data;
if(mode==='blob'){
 const blob=await openAsBlob(path);check(blob.size===record.bytes,'Native Blob size mismatch');
 report.checkpoints.push({stage:'after-openAsBlob',...memory()});
 const buffer=await blob.slice(0,blob.size).arrayBuffer();
 data=new Uint8Array(buffer);report.arrayBufferBytes=buffer.byteLength;report.nativeBlobSize=blob.size;
}else{
 const file=await open(path,'r');
 try{
  check(same(info,await file.stat({bigint:true})),'Source identity changed on open');
  const buffer=new ArrayBuffer(record.bytes);data=new Uint8Array(buffer);report.arrayBufferBytes=buffer.byteLength;
  report.checkpoints.push({stage:'after-single-allocation',...memory()});
  let offset=0;
  while(offset<data.byteLength){
   const length=Math.min(report.chunkBytes,data.byteLength-offset);
   const {bytesRead}=await file.read(data,offset,length,offset);report.readCalls++;
   check(bytesRead>0&&bytesRead<=length,'Unexpected positional short/invalid read');offset+=bytesRead;
  }
  check(same(info,await file.stat({bigint:true})),'Source identity changed after read');
 }finally{await file.close();}
}
report.readSeconds=(performance.now()-start)/1000;
check(data.byteLength===record.bytes,'Returned input bytes mismatch');
report.checkpoints.push({stage:'after-read',...memory()});
emit({event:'read-complete',mode,readSeconds:report.readSeconds,memory:report.checkpoints.at(-1)});
const hashStart=performance.now();report.sha256=createHash('sha256').update(data).digest('hex');report.hashSeconds=(performance.now()-hashStart)/1000;
report.checkpoints.push({stage:'after-hash',...memory()});
check(report.sha256===record.sha256,'Full output SHA256 mismatch');
check(same(info,await stat(path,{bigint:true})),'Source identity changed after output hash');
report.sameStatIdentityAfter=true;report.matchesManifest=true;report.passed=true;
// Keep data reachable through the final result, without serializing its bytes.
check(data.byteLength===record.bytes,'Unexpected data release');
report.totalSeconds=(performance.now()-start)/1000;
emit({event:'result',report});
