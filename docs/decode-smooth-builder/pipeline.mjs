import {validateTarget} from '../parameter-template/core.mjs';
import {createComputePool} from '../shared/compute/client.mjs';
import {BUILD_ID as COMPUTE_BUILD_ID} from '../shared/compute/protocol.mjs';
import {createParameterRegistrar} from '../shared/parameter-registrar/client.mjs';
import {readUnityPackage} from '../shared/ft/unity-package.mjs';
import {splitUnityDocuments,extractAnimatorLayers,extractAnimatorParameters} from '../shared/ft/unity-text.mjs';
import {createAnimatorIntegrator} from '../shared/animator-integrator/client.mjs';
import {createIntegratorRequest} from './integrator-request.mjs';

export const BUILD_ID='decode-smooth-integrator-1';
export const SOURCE_REF='03775456be70f68f711662f0b08cf29c09519426';
const decoder=new TextDecoder('utf-8',{fatal:true});
const aborted=()=>new DOMException('処理を取り消しました。','AbortError');

export function validateNames(lines){
  if(!Array.isArray(lines))throw new TypeError('パラメータ名を1行に1つ入力してください。');
  const names=[],seen=new Set();
  for(const [index,name] of lines.entries()){
    if(name==='')continue;
    try{validateTarget(name);}catch(error){throw new Error(`${index+1}行目: ${error.message}`,{cause:error});}
    if(seen.has(name))throw new Error(`${index+1}行目: ${name} が重複しています。`);
    seen.add(name);names.push(name);
  }
  if(!names.length)throw new Error('パラメータ名を入力してください。');
  return names;
}

function oneRef(bytes,classId){
  const found=[];
  for(const entry of readUnityPackage(bytes).values()){
    if(entry.asset===null)continue;
    for(const doc of splitUnityDocuments(decoder.decode(entry.asset)).documents){
      if(doc.classId===classId)found.push({guid:entry.guid,fileId:doc.fileId});
    }
  }
  if(found.length!==1)throw new Error(`登録用packageのclass ${classId}を一意に確認できません。`);
  return found[0];
}

function readFinalSummary(result,targetCount){
  const assets=readUnityPackage(result.archive),controller=result.report?.controllers?.[0];
  if(!controller||result.report.controllers.length!==1||!Array.isArray(result.report.composition?.layerMapping)||!Array.isArray(result.report.animatorParameters))throw new Error('統合レポートのController情報を確認できません。');
  const entry=assets.get(controller.guid);if(!entry?.asset)throw new Error('統合Controllerを出力packageで確認できません。');
  const controllerText=decoder.decode(entry.asset),layerCount=extractAnimatorLayers(controllerText).length,parameterCount=extractAnimatorParameters(controllerText).length;
  if(layerCount!==result.report.composition.layerMapping.length||parameterCount!==result.report.animatorParameters.length)throw new Error('出力packageと統合レポートの件数が一致しません。');
  let treeCount=0,clipCount=0;
  for(const asset of assets.values()){
    if(!asset.asset)continue;let text;try{text=decoder.decode(asset.asset);}catch{continue;}
    if(!/^(?:\uFEFF)?(?:%YAML|--- !u!)/.test(text))continue;
    for(const document of splitUnityDocuments(text).documents){if(document.classId==='206')treeCount++;if(document.classId==='74')clipCount++;}
  }
  return {targetCount,layerCount,parameterCount,treeCount,clipCount};
}

export function createDecodeSmoothBuilder({concurrency=2,onProgress=()=>{}}={}){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new RangeError('同時実行数は1〜4です。');
  let disposed=false,active=null;
  const current=run=>{if(disposed||active!==run||run.cancelled)throw aborted();};
  function notify(run,stage,label,complete=false){
    if(active!==run||run.cancelled||disposed)return;
    if(complete)run.completed++;
    try{onProgress({stage,label,completed:run.completed,total:run.total});}catch{}
  }
  function stop(run){
    if(!run)return;run.cancelled=true;
    for(const registrar of run.registrars)registrar.cancel();
    run.integrator?.cancel();run.stopAssembly?.();run.pool?.dispose();
  }
  function cleanup(run){
    run.stopAssembly?.();run.stopAssembly=null;
    for(const registrar of run.registrars)registrar.dispose();
    run.registrars.clear();run.integrator?.dispose();run.integrator=null;
    run.pool?.dispose();run.pool=null;if(active===run)active=null;
  }
  async function template(run,target,index,inputRevision){
    current(run);const jobId=`decode.${run.id}.${index}`;
    const response=await run.pool.submit({protocolVersion:1,taskType:'parameter-template-generate',taskVersion:1,
      jobId,inputRevision,payload:{target},limits:{timeoutMs:30000}}).promise;
    current(run);
    if(response.protocolVersion!==1||response.buildId!==COMPUTE_BUILD_ID||response.jobId!==jobId||response.inputRevision!==inputRevision||response.taskType!=='parameter-template-generate')throw new Error('Templateの入力と結果が一致しません。');
    if(response.status!=='succeeded')throw response.status==='cancelled'?aborted():new Error(`${target}: ${response.message??response.errorCode??'Template生成に失敗しました。'}`);
    if(response.result?.target!==target||!(response.result.bytes instanceof Uint8Array))throw new Error(`${target}: Template出力を確認できません。`);
    run.jobs.push({jobId,inputRevision,generation:response.generation,taskType:response.taskType,workerId:response.workerId,status:response.status,metrics:response.metrics});
    return response.result;
  }
  function assemble(run,generatedPackages,inputRevision){
    current(run);
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./assembly-worker.mjs',import.meta.url),{type:'module'});
      const id=crypto.randomUUID();let settled=false;
      const finish=(error,result)=>{
        if(settled)return;settled=true;clearTimeout(timer);worker.terminate();run.stopAssembly=null;
        if(error)reject(error);else resolve(result);
      };
      const timer=setTimeout(()=>finish(new Error('Tree・Controller・Mask生成がタイムアウトしました。')),30000);
      run.stopAssembly=()=>finish(aborted());
      worker.onerror=event=>{event.preventDefault?.();finish(new Error('集約用Workerが停止しました。'));};
      worker.onmessageerror=()=>finish(new Error('集約用Workerの出力を受信できません。'));
      worker.onmessage=({data})=>{
        if(data?.id!==id||data.inputRevision!==inputRevision)return;
        if(data.type==='error')return finish(new Error(data.message));
        if(data.type!=='result')return;
        if(!['motionPackage','basePackage','maskPackage'].every(k=>data.result?.[k] instanceof Uint8Array&&data.result[k].byteLength))return finish(new Error('中間packageを回収できません。'));
        finish(null,data.result);
      };
      const copies=generatedPackages.map(p=>({target:p.target,fileName:p.fileName,bytes:Uint8Array.from(p.bytes)}));
      try{worker.postMessage({type:'assemble',id,inputRevision,generatedPackages:copies},copies.map(p=>p.bytes.buffer));}catch(error){finish(error);}
    });
  }
  return {
    async build(lines,{inputRevision=0}={}){
      if(disposed)throw new Error('この操作は終了しています。');
      if(active)throw new Error('処理中です。完了または取消後に実行してください。');
      if(!Number.isSafeInteger(inputRevision)||inputRevision<0)throw new TypeError('入力の版が不正です。');
      const names=validateNames(lines),started=performance.now();
      const run={id:crypto.randomUUID().slice(0,8),cancelled:false,registrars:new Set(),integrator:null,pool:null,stopAssembly:null,jobs:[],completed:0,total:names.length*3+2};
      active=run;
      const templates=new Array(names.length),registrations=new Array(names.length);
      let next=0,workers=[];
      try{
        run.pool=createComputePool({concurrency,moduleReuse:false,workerMode:'module'});
        const nextName=async()=>{
          while(next<names.length){
            const index=next++,target=names[index];current(run);
            notify(run,'template',`${target} の素材を生成しています。`);
            const generated=await template(run,target,index,inputRevision);
            templates[index]={target,bytes:generated.bytes,fileName:generated.fileName};
            notify(run,'template',`${target} の素材を生成しました。`,true);
            const registrar=createParameterRegistrar({pool:run.pool});run.registrars.add(registrar);
            try{
              notify(run,'registrar',`${target} のParameterを読み取っています。`);
              const collected=await registrar.collect(generated.bytes,{inputRevision});current(run);
              notify(run,'registrar',`${target} のParameterを読み取りました。`,true);
              const settings={name:`Registration_${String(index+1).padStart(3,'0')}`,defaultValue:0,saved:false,networkSynced:false};
              const registered=await registrar.generate(collected.parameters,settings,{inputRevision});current(run);
              registrations[index]={target,archive:registered.archive,fileName:registered.fileName,controller:oneRef(registered.archive,'91'),expression:oneRef(registered.archive,'114'),parameterCount:registered.parameterCount};
              notify(run,'registrar',`${target} の登録用素材を生成しました。`,true);
            }finally{registrar.dispose();run.registrars.delete(registrar);}
          }
        };
        workers=Array.from({length:Math.min(concurrency,names.length)},nextName);
        await Promise.all(workers);current(run);
        notify(run,'assembly','Tree・Controller・Safetyをまとめています。');
        const built=await assemble(run,templates,inputRevision);current(run);
        notify(run,'assembly','統合に使う素材を生成しました。',true);
        run.integrator=createAnimatorIntegrator();
        const packages=[{name:'DecodeSmooth_Base.unitypackage',bytes:built.basePackage},...registrations.map(p=>({name:p.fileName,bytes:p.archive})),
          {name:'Root_DecodeSmooth.unitypackage',bytes:built.motionPackage},{name:'Safety.unitypackage',bytes:built.maskPackage}];
        const onIntegratorProgress=event=>notify(run,'integrator',event.phase==='reading'?'統合する素材を読み込んでいます。':'Animator・ExpressionParametersを統合しています。');
        const imported=await run.integrator.importSources(packages,{inputRevision,onProgress:onIntegratorProgress});current(run);
        const request=createIntegratorRequest({catalog:imported.catalog,refs:built.refs,registrations});
        const expectedLayers=request.controllerIds.reduce((sum,id)=>sum+imported.catalog.controllers.find(c=>c.id===id).layers.length,0)+2;
        const result=await run.integrator.generate(request,{inputRevision,onProgress:onIntegratorProgress});current(run);
        if(!(result.archive instanceof Uint8Array)||!result.archive.byteLength)throw new Error('統合したpackageを回収できません。');
        const summary=readFinalSummary(result,names.length);
        if(summary.layerCount!==expectedLayers)throw new Error('統合後のLayer数が入力Layer合計＋2と一致しません。');
        notify(run,'done','保存するファイルを用意しました。',true);
        return {archive:result.archive,fileName:request.name+'.unitypackage',summary,integratorReport:result.report,
          report:{buildId:BUILD_ID,sourceRef:SOURCE_REF,inputRevision,targets:[...names],registrarSettings:{defaultValue:0,saved:false,networkSynced:false},jobs:run.jobs,
            integrator:result.report,elapsedMs:performance.now()-started,verification:'static package/reference readback; Unity import and VRChat runtime unverified'},
          intermediates:{templates,registrations,...built}};
      }catch(error){stop(run);await Promise.allSettled(workers);if(Array.isArray(error.issues)&&!error.conflicts)error.conflicts=error.issues.filter(i=>/conflict/.test(i.code??''));throw error;}
      finally{cleanup(run);}
    },
    cancel(){const run=active;active=null;stop(run);},
    dispose(){const run=active;active=null;disposed=true;stop(run);},
  };
}
