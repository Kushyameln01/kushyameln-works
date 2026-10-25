import {importSources,integratePackages} from './integrate.mjs';
import {instantiateFtKernel} from '../ft/kernel/load-kernel.mjs';
let packages=null,revision=null,kernelPromise=null;
self.onmessage=async({data:m})=>{
 const reply=(type,extra={})=>self.postMessage({version:1,id:m.id,inputRevision:m.inputRevision,type,...extra});
 try{
  if(m.version!==1||typeof m.id!=='string'||!Number.isSafeInteger(m.inputRevision)||m.inputRevision<0)throw Error('Invalid Worker request.');
  if(m.operation==='import'){
   reply('progress',{progress:{phase:'reading',completed:0,total:1}});
   const result=await importSources(m.payload.sources);packages=result.packages;revision=m.inputRevision;
   const {packages:_,...publicResult}=result;reply('result',{result:{...publicResult,inputRevision:revision}});
  }else if(m.operation==='generate'){
   if(!packages||revision!==m.inputRevision)throw Error('Input revision mismatch. Import sources before generation.');
   reply('progress',{progress:{phase:'integrating',completed:0,total:1}});
   kernelPromise??=fetch(new URL('../ft/kernel/ft-kernel.wasm',import.meta.url)).then(r=>{if(!r.ok)throw Error('Unable to load FT kernel.');return r.arrayBuffer();}).then(instantiateFtKernel).catch(e=>{kernelPromise=null;throw e;});
   const result=await integratePackages(packages,m.payload.request,await kernelPromise),{diagnosticAssets:_,...publicResult}=result;
   reply('progress',{progress:{phase:'complete',completed:1,total:1}});reply('result',{result:publicResult});
  }else throw Error('Unsupported Worker operation.');
 }catch(e){reply('error',{error:{name:e.name,message:e.message,issues:e.issues??null,report:e.report??null}});}
};
