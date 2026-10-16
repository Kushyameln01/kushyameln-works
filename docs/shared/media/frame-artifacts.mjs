// Per-frame transaction: commit to the caller's archive only after all bytes fit.
export async function frameArtifacts(frame,{encodePng,remainingBytes,check=()=>{}}={}){
  if(typeof encodePng!=='function'||!Number.isSafeInteger(remainingBytes)||remainingBytes<0||!Number.isSafeInteger(frame.sequence)||frame.sequence<0)throw TypeError('ARTIFACT_OPTIONS');
  check();const stem=`frame-${String(frame.sequence).padStart(4,'0')}`,name=stem+'.png',codeName=stem+'.lbp',files={};let bytes=0;
  const add=(key,data)=>{if(bytes+data.byteLength>remainingBytes)throw Error('ARTIFACT_LIMIT');files[key]=data;bytes+=data.byteLength;};
  if(frame.codes.byteLength+(frame.aligned?.validMask.byteLength??0)>remainingBytes)throw Error('ARTIFACT_LIMIT');
  const original=await encodePng(frame);check();if(original.size+frame.codes.byteLength>remainingBytes)throw Error('ARTIFACT_LIMIT');add(name,new Uint8Array(await original.arrayBuffer()));check();add(codeName,frame.codes);
  let derivative=null,alignedArtifact=null,validMaskArtifact=null;
  if(frame.aligned){if(frame.alignment?.applied!==true)throw Error('ALIGNMENT_EXPORT_IDENTITY');derivative=await encodePng(frame.aligned);check();if(bytes+derivative.size+frame.aligned.validMask.byteLength>remainingBytes)throw Error('ARTIFACT_LIMIT');alignedArtifact=stem+'.aligned.png';validMaskArtifact=stem+'.valid-mask';add(alignedArtifact,new Uint8Array(await derivative.arrayBuffer()));check();add(validMaskArtifact,frame.aligned.validMask);}
  return {files,bytes,original,derivative,record:{sequence:frame.sequence,timestamp:frame.timestamp,duration:frame.duration,width:frame.width,height:frame.height,colorArtifact:name,lbpArtifact:codeName,histogram:Array.from(frame.histogram),mapping:frame.mapping,metrics:frame.metrics,unapplied:frame.unapplied,selection:frame.selection??null,alignment:frame.alignment??null,alignedArtifact,validMaskArtifact,maskEncoding:validMaskArtifact?'uint8 0=invalid 1=valid; row-major display pixels':null}};
}
