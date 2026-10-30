function validInteger(n){return Number.isSafeInteger(n)&&n>=0;}
function httpURL(value){let url;try{url=new URL(value);}catch{throw new Error('Source must have an absolute HTTP(S) URL');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Source must have an absolute HTTP(S) URL');return url.href;}
async function bounded(response,limit){
 if(!response.body)return new Uint8Array();
 const reader=response.body.getReader();const chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('HTTP response exceeds expected byte length');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function createHttpSource({url,size,sha256},{fetchImpl=globalThis.fetch,maxReadBytes=16*1024*1024}={}) {
 const href=httpURL(url);
 if(!validInteger(size)||!validInteger(maxReadBytes)||maxReadBytes<1||typeof fetchImpl!=='function')throw new Error('Invalid HTTP source configuration');
 if(sha256!==undefined&&!/^[a-f0-9]{64}$/i.test(sha256))throw new Error('Invalid source SHA-256');
 let identity=null;
 return Object.freeze({size,url:href,expectedSha256:sha256??null,integrity:'range-validation-only',async read(offset,length,{signal}={}){
  signal?.throwIfAborted();
  if(!validInteger(offset)||!validInteger(length)||offset>size||length>size-offset||length>maxReadBytes)throw new Error('HTTP source range invalid');
  if(length===0)return new Uint8Array();
  const headers={Range:`bytes=${offset}-${offset+length-1}`};
  if(identity?.etag&&!identity.etag.startsWith('W/'))headers['If-Range']=identity.etag;
  const response=await fetchImpl(href,{headers,signal,credentials:'omit',cache:'no-store'});
  if(response.status!==206 && !(response.status===200&&size<=maxReadBytes)){
   await response.body?.cancel();throw new Error(`HTTP source requires byte ranges (status ${response.status})`);
  }
  const observed={etag:response.headers.get('etag'),modified:response.headers.get('last-modified')};
  if(identity && ((identity.etag&&observed.etag!==identity.etag)||(identity.modified&&observed.modified!==identity.modified))){await response.body?.cancel();throw new Error('HTTP source changed during reads');}
  identity??=observed;
  if(response.status===206){
   const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')??'');
   if(!match||Number(match[1])!==offset||Number(match[2])!==offset+length-1||Number(match[3])!==size){await response.body?.cancel();throw new Error('Invalid HTTP Content-Range');}
  }
  const expected=response.status===206?length:size;
  const contentLength=response.headers.get('content-length');
  if(contentLength!==null&&Number(contentLength)!==expected){await response.body?.cancel();throw new Error('HTTP byte length mismatch');}
  const bytes=await bounded(response,expected);signal?.throwIfAborted();
  if(bytes.length!==expected)throw new Error('HTTP byte length mismatch');
  return response.status===206?bytes:bytes.slice(offset,offset+length);
 }});
}
