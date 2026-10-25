import {generateTemplate} from './api.mjs';

self.onmessage=async({data})=>{
  const {id,target}=data;
  try{
    const result=await generateTemplate(target);
    self.postMessage({id,ok:true,...result},[result.bytes.buffer]);
  }catch(error){
    self.postMessage({id,ok:false,error:error instanceof Error?error.message:'生成に失敗しました。'});
  }
};
