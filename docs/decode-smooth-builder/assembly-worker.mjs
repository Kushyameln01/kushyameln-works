import {buildIntermediateAssets} from './assembly.mjs?v=graph-cleanup-1';
self.onmessage=async({data})=>{
  if(data?.type!=='assemble')return;
  self.onmessage=null;
  const identity={id:data.id,inputRevision:data.inputRevision};
  try{
    const result=await buildIntermediateAssets(data.generatedPackages);
    self.postMessage({...identity,type:'result',result},[result.motionPackage.buffer,result.basePackage.buffer,result.maskPackage.buffer]);
  }catch(error){self.postMessage({...identity,type:'error',message:String(error?.message??error)});}
};
