import * as ort from '../../../inference/vendor/ort.wasm.min.mjs';
import {createActualQkvDiagnostic} from './stage.mjs';
function check(v,m){if(!v)throw Error(m);}
export async function runDisposalCases(file){
 const cases=[],prototype=ort.InferenceSession.prototype,originalRelease=prototype.release,originalCreate=ort.InferenceSession.create;let stage,failure;
 try{
  for(const mode of ['synchronous-throw','rejected-promise']){
   stage=await createActualQkvDiagnostic({file,side:'LOW'});let failedOwner=null,failedCalls=0,otherCalls=0,realNativeReleases=0;
   prototype.release=function(){if(failedOwner===null)failedOwner=this;if(this===failedOwner){failedCalls++;if(failedCalls===1){const error=Error('INJECTED_RELEASE_FAILURE');if(mode==='synchronous-throw')throw error;return Promise.reject(error);}}else otherCalls++;realNativeReleases++;return originalRelease.call(this);};
   failure=null;try{await stage.dispose();}catch(error){failure=error;}
   check(failure instanceof AggregateError,'Failed actual release must propagate');check(stage.stats().cleanupPending===true,'Failed owned release remains quarantined');
   let blocked;try{await stage.run({});}catch(error){blocked=error;}check(blocked?.code==='RECOVERY_REQUIRED','No reuse after cleanup failure');
   await stage.recover();check(failedCalls===2&&otherCalls===1&&realNativeReleases===2,'Each actual ORT owner is released exactly once successfully; failed owner is retried');
   await stage.dispose();check(failedCalls===2&&otherCalls===1,'Completed cleanup is idempotent');cases.push({name:'actual ORT '+mode+' retains session and blocks reuse until real retry succeeds',passed:true,failedOwnerCalls:failedCalls,otherOwnerCalls:otherCalls,realNativeReleases});
   prototype.release=originalRelease;stage=null;
  }
  let creations=0,releaseCalls=0,nativeReleases=0;const constructorError=Error('INJECTED_SECOND_SESSION_CREATE_FAILURE');
  ort.InferenceSession.create=async function(...args){if(++creations===2)throw constructorError;return await originalCreate.apply(this,args);};
  prototype.release=async function(){releaseCalls++;if(releaseCalls===1)throw Error('INJECTED_CONSTRUCTOR_CLEANUP_FAILURE');nativeReleases++;return await originalRelease.call(this);};
  failure=null;try{stage=await createActualQkvDiagnostic({file,side:'LOW'});}catch(error){failure=error;}
  check(failure instanceof AggregateError&&failure.cause===constructorError&&failure.errors[0]===constructorError,'Original constructor failure is retained');check(typeof failure.recover==='function','Failed constructor retains local ownership/retry closure');await failure.recover();check(releaseCalls===2&&nativeReleases===1,'Unreturned actual ORT owner is recovered');cases.push({name:'actual session construction failure preserves error and unfinished native cleanup ownership',passed:true,sessionCreationsAttempted:creations,releaseCalls,nativeReleases});
  return {passed:true,scope:'actual ORT session lifecycle with explicit prototype fail-once fault injection; no numerical/model inference',cases};
 }catch(error){return {passed:false,error:String(error.stack||error),cases};}
 finally{prototype.release=originalRelease;ort.InferenceSession.create=originalCreate;await stage?.dispose();}
}
