// Development-only local file capabilities and streaming persistence adapter.
// Identity is checked around every bounded read; hashing belongs to the SDK.
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_READ_BYTES=16*1024*1024;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const check=signal=>signal?.throwIfAborted();
const identityKeys=['dev','ino','size','mtimeNs','ctimeNs'];
const sameIdentity=(a,b)=>identityKeys.every(key=>a[key]===b[key]);

/** A root capability owns one fd reference; each retain owns another. */
export async function openStandaloneNodeSource(inputPath,{maxReadBytes=MAX_READ_BYTES}={}){
 if(!Number.isSafeInteger(maxReadBytes)||maxReadBytes<1||maxReadBytes>MAX_READ_BYTES)throw RangeError('Invalid bounded source read budget');
 const sourcePath=path.resolve(inputPath),handle=await fs.open(sourcePath,'r');let initial;
 try{
  const [fdStat,pathStat]=await Promise.all([handle.stat({bigint:true}),fs.stat(sourcePath,{bigint:true})]);
  if(!fdStat.isFile()||!sameIdentity(fdStat,pathStat)||fdStat.size>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Local source must be a stable regular file');
  initial=fdStat;
 }catch(error){await handle.close();throw error;}
 const size=Number(initial.size),shared={references:1,inFlight:0,closed:false,closing:false,invalid:false,closePromise:null,idle:[],readCalls:0,bytesRead:0,maxObservedReadBytes:0};
 async function assertIdentity(){
  try{
   const [fdStat,pathStat]=await Promise.all([handle.stat({bigint:true}),fs.stat(sourcePath,{bigint:true})]);
   if(!sameIdentity(initial,fdStat)||!sameIdentity(initial,pathStat))throw Error('Local source identity or bytes changed');
  }catch(error){shared.invalid=true;throw Object.assign(Error('Local source identity or bytes changed'),{cause:error});}
 }
 async function closeAfterIdle(){
  if(shared.closed)return;
  shared.closing=true;
  if(shared.closePromise)return shared.closePromise;
  shared.closePromise=(async()=>{
   if(shared.inFlight)await new Promise(resolve=>shared.idle.push(resolve));
   await handle.close();shared.closed=true;
  })();
  try{await shared.closePromise;}catch(error){shared.closePromise=null;throw error;}
 }
 function capability(ownerId){
  let released=false;
  const valid=()=>!released&&!shared.closed&&!shared.closing&&!shared.invalid;
  const guard=()=>{if(released)throw Error('Local source capability released');if(shared.closed||shared.closing)throw Error('Local source closed');if(shared.invalid)throw Error('Local source identity or bytes changed');};
  const source={path:sourcePath,size,ownerId,
   isValid:valid,
   async read(offset,length,{signal}={}){
    guard();check(signal);
    if(!integer(offset)||!integer(length)||length>maxReadBytes||offset>size||length>size-offset)throw RangeError('Local source read range/budget invalid');
    shared.inFlight++;shared.readCalls++;shared.maxObservedReadBytes=Math.max(shared.maxObservedReadBytes,length);
    try{
     await assertIdentity();check(signal);const data=new Uint8Array(length);let consumed=0;
     while(consumed<length){check(signal);const {bytesRead}=await handle.read(data,consumed,length-consumed,offset+consumed);if(!bytesRead){shared.invalid=true;throw Error('Local source truncated or changed');}consumed+=bytesRead;}
     await assertIdentity();check(signal);shared.bytesRead+=length;return data;
    }finally{
     shared.inFlight--;if(!shared.inFlight){for(const resolve of shared.idle)resolve();shared.idle=[];}
    }
   },
   retain(nextOwnerId){
    guard();if(typeof nextOwnerId!=='string'||!nextOwnerId.trim())throw TypeError('Independent source lease ownerId required');
    shared.references++;const retained=capability(nextOwnerId);
    return Object.freeze({ownerId:nextOwnerId,source:retained,isValid:()=>retained.isValid(),release:()=>retained.release()});
   },
   async release(){
    if(!released){released=true;shared.references--;}
    if(shared.references===0)await closeAfterIdle();
   },
   stats(){return Object.freeze({path:sourcePath,size,ownerId,released,references:shared.references,inFlight:shared.inFlight,
    closed:shared.closed,closing:shared.closing,invalid:shared.invalid,readCalls:shared.readCalls,bytesRead:shared.bytesRead,
    maxReadBytes,maxObservedReadBytes:shared.maxObservedReadBytes,
    identity:Object.fromEntries(identityKeys.map(key=>[key,String(initial[key])]))});}
  };
  return Object.freeze(source);
 }
 return capability('node-source-root');
}

async function writeFully(handle,bytes){
 let offset=0;while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,null);if(!bytesWritten)throw Error('Saved package write made no progress');offset+=bytesWritten;}
}
function fileName(name){if(typeof name!=='string'||!name||path.basename(name)!==name||name==='.'||name==='..'||name.includes('\\'))throw TypeError('Saved package filename must be local and explicit');return name;}

/** Create a new private directory; existing destinations are always refused. */
export async function createStandaloneNodeWriter(inputDir){
 const directory=path.resolve(inputDir);await fs.mkdir(directory,{mode:0o700});
 let sourceBytes=0,sources=0,manifestWritten=false,inFlight=0;
 return Object.freeze({directory,
  async writeSource(name,chunks){
   fileName(name);if(name==='manifest.json')throw TypeError('Source filename conflicts with saved manifest');
   const handle=await fs.open(path.join(directory,name),'wx',0o600);inFlight++;
   try{for await(const chunk of chunks){if(!(chunk instanceof Uint8Array)||chunk.length>MAX_READ_BYTES)throw TypeError('Bounded source Uint8Array chunk required');await writeFully(handle,chunk);sourceBytes+=chunk.length;}await handle.sync();sources++;}
   finally{inFlight--;await handle.close();}
  },
  async writeManifest(manifest){
   if(inFlight)throw Error('Saved source writes must finish before manifest');
   const handle=await fs.open(path.join(directory,'manifest.json'),'wx',0o600);
   try{await writeFully(handle,new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n'));await handle.sync();manifestWritten=true;}finally{await handle.close();}
  },
  stats(){return Object.freeze({directory,sourceBytes,sources,manifestWritten,inFlight});}
 });
}
