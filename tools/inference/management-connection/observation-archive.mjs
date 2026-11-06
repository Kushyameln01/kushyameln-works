/** Lossless diagnostic observer transport. Native model/session execution and
 * evidence values are unchanged. A normal cumulative sessions snapshot becomes
 * a prefix length into one immutable metadata pool; uncommon reordered/changed
 * snapshots use explicit pool indices. All other fields keep their exact order.
 */
export const OBSERVATION_ARCHIVE_FORMAT='works-owner-observations/session-pool/1';
const clone=structuredClone;
function same(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){
  if(!ArrayBuffer.isView(a)||!ArrayBuffer.isView(b)||a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);
 }
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
}
function check(archive){
 if(archive?.format!==OBSERVATION_ARCHIVE_FORMAT||!Array.isArray(archive.sessionMetadata)||!Array.isArray(archive.observations)||!Array.isArray(archive.sessionReferences)||archive.observations.length!==archive.sessionReferences.length)throw TypeError('Invalid observation archive');
}
export function createObservationArchive(){return {format:OBSERVATION_ARCHIVE_FORMAT,sessionMetadata:[],observations:[],sessionReferences:[]};}

export function appendObservation(archive,observation){
 check(archive);if(!observation||typeof observation!=='object'||Array.isArray(observation))throw TypeError('Observation object required');
 const hasSessions=Object.hasOwn(observation,'sessions'),{sessions,...rest}=observation;
 let reference=null;
 if(hasSessions){
  if(Array.isArray(sessions)){
   const indices=sessions.map((metadata,position)=>{
    if(position<archive.sessionMetadata.length&&same(metadata,archive.sessionMetadata[position]))return position;
    const existing=archive.sessionMetadata.findIndex(value=>same(metadata,value));if(existing!==-1)return existing;
    archive.sessionMetadata.push(clone(metadata));return archive.sessionMetadata.length-1;
   });
   reference=indices.every((id,index)=>id===index)?indices.length:indices;
  }else reference=sessions===undefined?{undefined:true}:{inline:clone(sessions)};
 }
 archive.observations.push(clone(rest));archive.sessionReferences.push(reference);
}

export function restoreObservation(archive,index){
 check(archive);if(!Number.isSafeInteger(index)||index<0||index>=archive.observations.length)throw RangeError('Observation index outside archive');
 const result=clone(archive.observations[index]),reference=archive.sessionReferences[index];
 if(Object.hasOwn(result,'sessions'))throw TypeError('Archived observation contains an unbound sessions field');
 if(reference===null)return result;
 let indices;
 if(Number.isSafeInteger(reference)){
  if(reference<0||reference>archive.sessionMetadata.length)throw RangeError('Invalid session metadata prefix');
  indices=Array.from({length:reference},(_,i)=>i);
 }else if(Array.isArray(reference))indices=reference;
 else if(reference&&Object.keys(reference).length===1&&Object.hasOwn(reference,'inline')){result.sessions=clone(reference.inline);return result;}
 else if(reference?.undefined===true&&Object.keys(reference).length===1){result.sessions=undefined;return result;}
 else throw TypeError('Invalid session metadata reference');
 result.sessions=indices.map(id=>{
  if(!Number.isSafeInteger(id)||id<0||id>=archive.sessionMetadata.length)throw RangeError('Invalid session metadata reference');
  return clone(archive.sessionMetadata[id]);
 });return result;
}
export function restoreObservations(archive){check(archive);return archive.observations.map((_,i)=>restoreObservation(archive,i));}

export function compactWorkerObservations(worker){
 if(worker.observations===undefined)return worker;
 if(!Array.isArray(worker.observations)){check(worker.observations);return worker;}
 const observations=createObservationArchive();for(const observation of worker.observations)appendObservation(observations,observation);
 return {...worker,observations};
}
export function restoreWorkerObservations(worker){
 if(worker.observations===undefined||Array.isArray(worker.observations))return worker;
 return {...worker,observations:restoreObservations(worker.observations)};
}
function mapReport(report,mapWorker){
 if(Array.isArray(report?.native?.workers))return {...report,native:{...report.native,workers:report.native.workers.map(mapWorker)}};
 if(Array.isArray(report?.workers))return {...report,workers:report.workers.map(mapWorker)};
 throw TypeError('A report with an explicit workers array is required');
}
export const compactReportObservations=report=>mapReport(report,compactWorkerObservations);
export const restoreReportObservations=report=>mapReport(report,restoreWorkerObservations);
