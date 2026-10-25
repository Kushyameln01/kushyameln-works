import {generatePackage} from './core.mjs';

self.onmessage=async({data})=>{
  const {id,target}=data;
  try{
    const response=await fetch(new URL('./template.json',import.meta.url));
    if(!response.ok)throw new Error('Templateを読み込めませんでした。ページを再読み込みしてください。');
    const result=generatePackage(target,{template:await response.json()});
    self.postMessage({id,ok:true,...result},[result.bytes.buffer]);
  }catch(error){
    self.postMessage({id,ok:false,error:error instanceof Error?error.message:'生成に失敗しました。'});
  }
};
